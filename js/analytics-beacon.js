/**
 * Vitametric — Analytics Beacon (Server-Side)
 *
 * Envía eventos del funnel de la anamnesis conversacional a un endpoint
 * de analytics usando Beacon API (navigator.sendBeacon). Los eventos se
 * disparan en momentos clave del flujo: inicio, preguntas respondidas,
 * resultado alcanzado, CTA clickeado.
 *
 * El endpoint es un Cloudflare Worker que recibe POST con JSON y los
 * almacena en Workers Analytics Engine. Si el Worker no está desplegado,
 * los eventos se pierden silenciosamente — el test no se degrada.
 *
 * Integración:
 *   <script src="js/analytics-beacon.js"></script>
 *   // Auto-inicializa listeners. Opcional: configurar endpoint.
 *   VitametricAnalytics.configure({ endpoint: 'https://...' });
 */

(function (root) {
  'use strict';

  var ENDPOINT = null; // null = analytics deshabilitados
  var SESSION_ID = generateId();
  var STARTED_AT = Date.now();
  var QUESTION_COUNT = 0;
  var QUESTIONS_BY_AXIS = {};
  var QUEUE = [];
  var FLUSHING = false;

  function generateId() {
    return 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }

  /**
   * Configura el endpoint de analytics.
   * @param {{ endpoint: string }} config
   */
  function configure(config) {
    if (config && config.endpoint) ENDPOINT = config.endpoint;
  }

  /**
   * Envía un evento al endpoint vía Beacon API.
   * Si no hay endpoint configurado, no hace nada.
   */
  function send(eventType, payload) {
    if (!ENDPOINT) return;

    var event = {
      sessionId: SESSION_ID,
      event: eventType,
      timestamp: Date.now(),
      elapsedMs: Date.now() - STARTED_AT,
      variant: (root.VitametricABRouter && root.VitametricABRouter.variant) || 'unknown',
      pageUrl: typeof window !== 'undefined' ? window.location.href : '',
      referrer: typeof document !== 'undefined' ? document.referrer : '',
    };

    if (payload) Object.assign(event, payload);

    var blob = new Blob([JSON.stringify(event)], { type: 'application/json' });
    try {
      navigator.sendBeacon(ENDPOINT, blob);
    } catch (e) {
      // Cola de respaldo: reintentar en el siguiente flush si sendBeacon falla.
      QUEUE.push(event);
      if (QUEUE.length > 50) QUEUE.shift(); // cap
    }
  }

  /**
   * Intenta reenviar eventos en cola (para navegadores sin sendBeacon).
   */
  function flushQueue() {
    if (FLUSHING || !QUEUE.length || !ENDPOINT) return;
    FLUSHING = true;
    var batch = QUEUE.splice(0);
    fetch(ENDPOINT, {
      method: 'POST',
      body: JSON.stringify({ batch: batch }),
      headers: { 'Content-Type': 'application/json' },
      keepalive: true
    }).catch(function () {
      // Re-encolar si falló
      QUEUE = batch.concat(QUEUE);
    }).finally(function () {
      FLUSHING = false;
    });
  }

  // ── Eventos del funnel ──

  /**
   * Test iniciado por el usuario.
   */
  function trackStart() {
    STARTED_AT = Date.now();
    SESSION_ID = generateId();
    QUESTION_COUNT = 0;
    QUESTIONS_BY_AXIS = {};
    send('test_start', {
      mode: (root.__vitametricKiosk) ? 'kiosk' : 'adaptive',
      lang: (root.VitametricI18n && root.VitametricI18n.detectLang) ? root.VitametricI18n.detectLang() : 'es'
    });
  }

  /**
   * Pregunta respondida por el paciente.
   */
  function trackQuestionAnswered(itemId, grade, axis) {
    QUESTION_COUNT++;
    if (axis) QUESTIONS_BY_AXIS[axis] = (QUESTIONS_BY_AXIS[axis] || 0) + 1;
    send('question_answered', {
      questionNumber: QUESTION_COUNT,
      itemId: itemId,
      grade: grade,
      axis: axis
    });
  }

  /**
   * Resultado final alcanzado (el motor emitió TURN.RESULT).
   */
  function trackResult(riskLevel, globalScore, axisSummaries) {
    send('test_result', {
      riskLevel: riskLevel,
      globalScore: globalScore,
      totalQuestions: QUESTION_COUNT,
      questionsByAxis: QUESTIONS_BY_AXIS,
      axisSummaries: axisSummaries ? axisSummaries.map(function (s) {
        return {
          axis: s.axis,
          band: s.band,
          scale: s.scale,
          certainty: s.certainty,
          affirmed: s.evidence ? s.evidence.affirmed : 0,
          asked: s.evidence ? s.evidence.asked : 0
        };
      }) : []
    });
  }

  /**
   * El usuario clickeó el CTA de WhatsApp.
   */
  function trackCTA() {
    send('cta_clicked', {
      totalQuestions: QUESTION_COUNT
    });
  }

  /**
   * Email capturado (lead).
   */
  function trackEmailCaptured() {
    send('email_captured', {
      totalQuestions: QUESTION_COUNT
    });
  }

  /**
   * El usuario abandonó antes del resultado (beforeunload).
   */
  function trackAbandon() {
    send('test_abandon', {
      totalQuestions: QUESTION_COUNT,
      questionsByAxis: QUESTIONS_BY_AXIS
    });
  }

  // ── Auto-wiring ──
  function autoWire() {
    // Auto-detectar endpoint: /api/analytics en el mismo origen.
    // Si no se configuró explícitamente, usamos el endpoint relativo.
    // Esto funciona en Cloudflare Pages (functions/api/analytics.js) y en
    // localhost con `npx wrangler pages dev`.
    if (!ENDPOINT) {
      try {
        ENDPOINT = new URL('/api/analytics', window.location.origin).href;
      } catch (e) {
        // Sin URL constructor (IE11), no hacemos nada.
      }
    }

    var host = document.querySelector('[data-triage-chat]');
    if (!host) return;

    // Track start cuando se monta la UI
    trackStart();

    // Observar preguntas respondidas: cuando se agrega una burbuja user
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;

          // Detectar respuesta del usuario: burbuja user nueva
          if (node.classList && node.classList.contains('triage-bubble--user')) {
            // No tenemos itemId directo del DOM, pero contamos.
            trackQuestionAnswered('dom_bubble', null, null);
          }

          // Detectar resultado: aparece triage-result
          if (node.classList && node.classList.contains('triage-result')) {
            // Extraer datos si están disponibles en el DOM
            var riskEl = host.querySelector('.triage-result__title');
            var riskLevel = riskEl ? riskEl.textContent : 'unknown';
            trackResult(riskLevel, null, null);
          }
        });
      });
    });

    observer.observe(host, { childList: true, subtree: true });

    // Track abandono
    window.addEventListener('beforeunload', function () {
      var hasResult = !!host.querySelector('.triage-result');
      if (!hasResult) trackAbandon();
      flushQueue();
    });

    // Track CTA click
    host.addEventListener('click', function (e) {
      var target = e.target;
      if (target.classList && target.classList.contains('triage-cta')) {
        trackCTA();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', autoWire);

  root.VitametricAnalytics = {
    configure: configure,
    trackStart: trackStart,
    trackQuestionAnswered: trackQuestionAnswered,
    trackResult: trackResult,
    trackCTA: trackCTA,
    trackEmailCaptured: trackEmailCaptured,
    trackAbandon: trackAbandon,
    flushQueue: flushQueue
  };

}(typeof self !== 'undefined' ? self : this));