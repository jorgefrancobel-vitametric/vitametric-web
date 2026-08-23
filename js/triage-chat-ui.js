// G-Level: L1
// Sustrato: Script de Protocolo
// Función: Capa de presentación de la anamnesis conversacional — renderiza únicamente los turnos que el motor autoriza
// v-version: 20260822.05 (bocadillos conversacionales: bot sugiere qué detalle aportar + listenDeep con extracción de síntomas)

/**
 * Presentación pura de la anamnesis.
 *
 * No decide nada: no elige preguntas, no calcula, no redacta afirmaciones
 * propias. Pinta el turno que el motor emitió y devuelve la respuesta del
 * paciente. Si el motor bloquea un turno, esta capa muestra el bloqueo en vez de
 * improvisar un texto — mostrar algo "razonable" cuando el arnés dijo que no es
 * exactamente la fuga que el arnés existe para impedir.
 */

(function () {
  'use strict';

  const Triage = window.VitametricTriageChat;
  const Engine = window.VitametricTestEngine;
  const ArticulatorModule = window.VitametricArticulator;
  const SLM = window.VitametricSLM;

  if (!Triage || !Engine || !ArticulatorModule || !SLM) {
    console.error('[triage-ui] faltan dependencias: motor, articulador y runtime SLM deben cargarse antes.');
    return;
  }

  const { TURN, EVIDENCE, CERTAINTY } = Triage;
  const { AXES } = Engine;

  // Clave de consentimiento separada de la config del runtime: permite saber si el
  // paciente ya decidió sin confundirse con un feature flag manual (dev override).
  const CONSENT_KEY = 'vitametric_slm_consent_v1';

  function readConsent(storage = safeStorage()) {
    if (!storage) return null;
    try { return storage.getItem(CONSENT_KEY); } catch (err) { return null; }
  }
  function writeConsent(value, storage = safeStorage()) {
    if (!storage) return;
    try { storage.setItem(CONSENT_KEY, value); } catch (err) {}
  }
  function safeStorage() {
    try { return typeof localStorage === 'undefined' ? null : localStorage; } catch (err) { return null; }
  }

  const CERTAINTY_LABEL = {
    [CERTAINTY.PRELIMINARY]: 'información preliminar',
    [CERTAINTY.PROBABLE]: 'estimación probable',
    [CERTAINTY.ESTABLISHED]: 'estimación consolidada'
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function mount(host) {
    const session = Triage.createSession();
    const articulator = new ArticulatorModule.Articulator();
    const config = window.VitametricSLMConfig || SLM.readConfig();
    const runtime = new SLM.Runtime({
      articulator,
      config,
      loader: typeof window.VitametricSLMLoader === 'function'
        ? window.VitametricSLMLoader
        : null
    });

    const slmStatus = el('div', 'triage-slm-status');
    slmStatus.setAttribute('aria-live', 'polite');
    const stream = el('div', 'triage-stream');
    const controls = el('div', 'triage-controls');
    const progress = el('div', 'triage-progress');
    const bar = el('div', 'triage-progress__bar');
    progress.appendChild(bar);

    host.innerHTML = '';
    host.appendChild(slmStatus);
    host.appendChild(progress);
    host.appendChild(stream);
    host.appendChild(controls);

    let asked = 0;

    function scrollToEnd() {
      stream.scrollTop = stream.scrollHeight;
    }

    function say(text, kind = 'bot') {
      const bubble = el('div', `triage-bubble triage-bubble--${kind}`, text);
      stream.appendChild(bubble);
      scrollToEnd();
      return bubble;
    }

    function renderClaims(claims) {
      if (!claims || !claims.length) return;
      const box = el('div', 'triage-claims');
      claims.forEach((claim) => {
        const row = el('div', 'triage-claim');
        // La procedencia va visible: el paciente debe poder distinguir lo que él
        // dijo, lo que el modelo estimó y lo que solo se mide en clínica.
        // Una contra-lectura no es una afirmación sobre el instrumento: es el
        // límite de la lectura anterior, y debe leerse pegada a ella.
        const tag = claim.isLimit
          ? el('span', 'triage-claim__tag triage-claim__tag--limit', 'lo que no significa')
          : el('span', `triage-claim__tag triage-claim__tag--${claim.evidence.toLowerCase()}`,
            claim.evidence === EVIDENCE.SELF_REPORT ? 'lo que reportaste'
              : claim.evidence === EVIDENCE.MODEL_ESTIMATE ? (CERTAINTY_LABEL[claim.certainty] || 'estimación')
                : 'requiere medición en clínica');
        if (claim.isLimit) row.classList.add('triage-claim--limit');
        row.appendChild(tag);
        row.appendChild(el('span', 'triage-claim__text', claim.text));
        box.appendChild(row);
      });
      stream.appendChild(box);
      scrollToEnd();
    }

    function clearControls() {
      controls.innerHTML = '';
    }

    function renderOptions(options, onPick) {
      clearControls();
      options.forEach((opt) => {
        const btn = el('button', 'triage-option', opt.label);
        btn.type = 'button';
        // El "no lo sé" se distingue: es una respuesta legítima, no un descarte.
        if (opt.value === null) btn.classList.add('triage-option--unknown');
        btn.addEventListener('click', () => {
          say(opt.label, 'user');
          clearControls();
          onPick(opt.value);
        });
        controls.appendChild(btn);
      });
    }

    function updateProgress(estimates) {
      // El avance se mide por precisión alcanzada, no por preguntas contestadas:
      // es un test adaptativo, así que no hay un total conocido de antemano.
      const ses = Object.values(estimates).map((e) => e.se);
      const media = ses.reduce((a, b) => a + b, 0) / ses.length;
      const inicio = Triage.TARGET_SE * 2.2;
      const pct = Math.max(6, Math.min(100, Math.round(((inicio - media) / (inicio - Triage.TARGET_SE)) * 100)));
      bar.style.width = `${pct}%`;
    }

    function renderResult(turn) {
      renderClaims(turn.allowedClaims);

      const detalle = el('div', 'triage-result');
      detalle.appendChild(el('h3', 'triage-result__title', 'Desglose por área'));

      // Se muestra lo que la persona respondió, no un número sin referente: un
      // "54 de 100" no es comprobable por quien contestó, "3 de 4 señales, 2
      // habituales" sí. La barra queda como apoyo visual del orden, sin cifra.
      (turn.axisSummaries || []).forEach((s) => {
        const row = el('div', 'triage-result__row');
        row.appendChild(el('span', 'triage-result__axis', `${s.icon} ${s.name}`));

        const meter = el('div', 'triage-result__meter');
        const fill = el('div', 'triage-result__fill');
        const proporcion = s.evidence.asked ? (s.evidence.affirmed / s.evidence.asked) * 100 : 0;
        fill.style.width = `${Math.max(2, Math.round(proporcion))}%`;
        fill.style.background = s.color;
        meter.appendChild(fill);
        row.appendChild(meter);

        row.appendChild(el('span', 'triage-result__value', s.band));
        row.appendChild(el('span', 'triage-result__certainty', s.phrase));
        detalle.appendChild(row);
      });

      const nota = el('p', 'triage-result__note',
        `Respondiste ${turn.itemsAsked} preguntas de las ${turn.catalogSize} posibles. `
        + 'Las preguntas se eligieron según tus respuestas anteriores, por eso fueron menos.');
      detalle.appendChild(nota);

      stream.appendChild(detalle);

      clearControls();
      const cta = el('a', 'triage-cta', 'Agendar mi evaluación en clínica');
      cta.href = buildWhatsAppUrl(turn);
      cta.target = '_blank';
      cta.rel = 'noopener';
      controls.appendChild(cta);
      scrollToEnd();
    }

    /**
     * El mensaje se arma SOLO con las afirmaciones que el motor autorizó, más los
     * números que él calculó. No se redacta nada nuevo aquí.
     */
    function buildWhatsAppUrl(turn) {
      const lineas = ['*AUTOEVALUACIÓN DE SÍNTOMAS — VITAMETRIC*', ''];
      turn.allowedClaims.filter((c) => !c.isLimit).forEach((c) => lineas.push(`• ${c.text}`));
      lineas.push('', '*Desglose por área (según lo que reporté):*');
      (turn.axisSummaries || []).forEach((s) => {
        lineas.push(`• ${s.icon} ${s.name}: ${s.band} — ${s.phrase}`);
      });
      lineas.push('', '🎯 Quiero agendar la *Evaluación Multisistémica ES-Complex ($3,900 MXN)*.');
      lineas.push('', '_Autoevaluación de síntomas percibidos: no es un diagnóstico ni una medición._');
      return `https://wa.me/525585327421?text=${encodeURIComponent(lineas.join('\n'))}`;
    }

    /**
     * Emite un bocadillo conversacional del bot sugiriendo al paciente qué
     * detalle puede aportar sobre el síntoma que acaba de responder.
     *
     * Es el modo "entrevistador activo": el bot no se limita a tomar nota
     * de la respuesta, sino que invita a profundizar con una pregunta
     * empática y contextual. La pregunta es determinista (plantilla), no
     * generada por el modelo.
     */
    function suggestDetail(itemId, grade) {
      if (!runtime.config.listener || !runtime.config.listener.enabled) return;
      // Solo sugiere si el paciente reportó el síntoma (grado >= 2: "A menudo" o "Habitual").
      if (typeof grade !== 'number' || grade < 2) return;
      const question = runtime.suggestFollowUp(itemId);
      if (!question) return;

      const bubble = el('div', 'triage-bubble triage-bubble--bot triage-bubble--suggestion');
      const icon = el('span', 'triage-suggestion__icon', '💡');
      const text = el('span', 'triage-suggestion__text', question);
      const hint = el('span', 'triage-suggestion__hint', 'Puedes responderme aquí abajo si quieres');
      bubble.appendChild(icon);
      bubble.appendChild(text);
      bubble.appendChild(hint);
      stream.appendChild(bubble);
      scrollToEnd();

      // Mover el foco a la barra de texto para facilitar la respuesta.
      const ta = host.querySelector('.triage-listener__input');
      if (ta) {
        ta.placeholder = question;
        setTimeout(() => ta.focus(), 300);
      }
    }
      const active = runtime.config.mode !== SLM.MODES.OFF;
      slmStatus.innerHTML = '';
      if (!active) {
        slmStatus.style.display = 'none';
        return;
      }
      slmStatus.style.display = 'block';
      slmStatus.dataset.state = snapshot.status;
      if (snapshot.status === SLM.STATUS.LOADING) {
        slmStatus.textContent = 'Asistente local: preparando el modelo…';
      } else if (snapshot.status === SLM.STATUS.READY) {
        slmStatus.textContent = snapshot.exposure === SLM.EXPOSURE.SHADOW
          ? 'Asistente local: evaluación en segundo plano; respuesta verificada.'
          : 'Asistente local: activo con salida verificada.';
      } else if (snapshot.status === SLM.STATUS.ERROR) {
        slmStatus.textContent = 'Asistente local no disponible; continuamos con respuestas verificadas.';
      } else {
        slmStatus.textContent = 'Asistente local no disponible; continuamos con respuestas verificadas.';
      }
    }

    // Listener opcional de texto libre del paciente (asistente local).
    // On-device por defecto (privado); el servo solo se usa si hay endpoint y consentimiento.
    function renderListenerInput() {
      if (!runtime.config.listener || !runtime.config.listener.enabled) return;
      if (host.querySelector('.triage-listener')) return;

      const box = el('div', 'triage-listener');
      const bar = el('div', 'triage-listener__bar');
      const ta = el('textarea', 'triage-listener__input');
      ta.placeholder = 'Cuéntanos en tus palabras si deseas agregar algo…';
      ta.rows = 1;
      ta.setAttribute('aria-label', 'Mensaje en texto libre');

      const send = el('button', 'triage-listener__send');
      send.type = 'button';
      send.setAttribute('aria-label', 'Enviar mensaje');
      send.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
      send.disabled = true;

      ta.addEventListener('input', () => {
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 96) + 'px';
        send.disabled = !ta.value.trim();
      });

      async function handleSend() {
        const text = ta.value.trim();
        if (!text) return;
        ta.value = '';
        ta.style.height = 'auto';
        send.disabled = true;
        // Restaurar placeholder por defecto tras el foco del bocadillo.
        ta.placeholder = 'Cuéntanos en tus palabras si deseas agregar algo…';
        say(text, 'user');
        try {
          // Usar listenDeep para extraer síntomas + relaciones causales.
          const r = await runtime.listenDeep(text);
          if (r && r.ack) say(r.ack, 'bot');

          // Inyectar síntomas extraídos al motor de triaje.
          if (r && r.extractedSymptoms && r.extractedSymptoms.length) {
            const injected = [];
            r.extractedSymptoms.forEach((s) => {
              if (s.itemId && typeof s.grade === 'number') {
                try {
                  // Solo inyecta si el ítem no fue respondido aún: una respuesta
                  // explícita del paciente nunca se pisa con una deducción.
                  const state = session.state();
                  if (!(s.itemId in state.answers)) {
                    // 'inferred': el paciente no señaló esto, lo dedujimos de su
                    // texto libre. La marca viaja al motor para que el articulador
                    // no pueda decir "señalaste" sobre una lectura del sistema.
                    session.answer(s.itemId, s.grade, 'inferred');
                    injected.push(s.itemId);
                  }
                } catch (err) {
                  // Un ítem que el motor no reconoce es un desajuste entre el
                  // lexicón de extracción y el catálogo: no puede pasar callado.
                  console.warn('[triage-listener] inyección rechazada por el motor:',
                    { itemId: s.itemId, grade: s.grade, matchedPhrase: s.matchedPhrase, error: err && err.message });
                }
              }
            });
            if (injected.length) {
              console.log('[triage-listener] síntomas inyectados:', injected);
            }
          }

          // Acumular enlaces causales para alimentar las constelaciones.
          if (r && r.causalLinks && r.causalLinks.length) {
            session.addCausalLinks(r.causalLinks);
          }

          if (r && r.intent === 'agendar') {
            const cta = controls.querySelector('.triage-cta');
            if (cta) cta.scrollIntoView({ behavior: 'smooth' });
          }
        } catch (err) {
          console.warn('[triage-listener] error al procesar texto libre:', err);
        }
        scrollToEnd();
      }

      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          void handleSend();
        }
      });

      send.addEventListener('click', () => void handleSend());

      bar.appendChild(ta);
      bar.appendChild(send);
      box.appendChild(bar);

      if (runtime.config.listener.serverEndpoint) {
        const consentWrap = el('label', 'triage-listener__consent');
        const consent = el('input');
        consent.type = 'checkbox';
        consent.checked = !!runtime.config.listener.serverConsent;
        consent.addEventListener('change', () => runtime.setListenerConsent(consent.checked));
        consentWrap.appendChild(consent);
        consentWrap.appendChild(document.createTextNode(' Permitir análisis en servidor para mejor comprensión (opcional)'));
        box.appendChild(consentWrap);
      }

      host.appendChild(box);
    }

    async function step() {
      const turn = session.next();

      if (turn.blocked) {
        say(turn.text);
        clearControls();
        console.warn('[triage-ui] turno bloqueado por el guardián:', turn.violations);
        return;
      }

      updateProgress(session.state().estimates);
      const articulated = await runtime.articulate(turn);
      // En modo determinista se conserva exactamente la presentación existente.
      // Cuando un SLM esté listo, su prosa solo entra después del doble gate del
      // articulador; un fallback nunca expone el candidato bloqueado.
      const displayText = articulated.usedModel
        ? articulated.text
        : turn.text;

      if (turn.type === TURN.FRAMING) {
        say(displayText);
        renderClaims(turn.allowedClaims);
        renderOptions(turn.options, () => step());
        return;
      }

      if (turn.type === TURN.QUESTION) {
        asked++;
        say(displayText);
        renderOptions(turn.options, (value) => {
          session.answer(turn.itemId, value);
          // Modo entrevistador activo: el bot sugiere profundizar si el
          // síntoma se reportó con grado alto.
          suggestDetail(turn.itemId, value);
          void step();
        });
        return;
      }

      if (turn.type === TURN.REFLECTION) {
        say(displayText);
        renderClaims(turn.allowedClaims);
        renderOptions(turn.options, (accepted) => {
          session.respondToReflection(turn.axis, accepted);
          void step();
        });
        return;
      }

      if (turn.type === TURN.RESULT) {
        say(displayText);
        bar.style.width = '100%';
        renderResult(turn);
      }
    }

    // Flujo de consentimiento: el modelo local solo se carga tras una decisión
    // explícita del paciente. El dev override (window.VitametricSLMConfig) y una
    // config ya persistida con mode != off implican consentimiento previo. Si el
    // paciente nunca decidió, arrancamos con plantillas y ofrecemos el asistente
    // local de forma no bloqueante.
    function showConsentCard() {
      if (host.querySelector('.triage-consent')) return;
      const card = el('div', 'triage-consent');
      card.setAttribute('role', 'group');
      card.setAttribute('aria-label', 'Asistente local opcional');
      card.appendChild(el('div', 'triage-consent__title', '¿Activamos el asistente local?'));
      const body = el('p', 'triage-consent__body');
      body.textContent = 'Este cuestionario puede usar un modelo de lenguaje pequeño que se '
        + 'descarga una sola vez a tu dispositivo (unos 600 MB; luego queda en caché) y se '
        + 'ejecuta en tu navegador con WebGPU. Tus respuestas se procesan localmente: no se '
        + 'envían a ningún servidor. Si tu equipo no soporta WebGPU, el cuestionario sigue '
        + 'funcionando con respuestas verificadas por plantillas. También podrás escribir en '
        + 'tus palabras: ese texto se analiza en tu dispositivo. Puedes continuar sin activarlo: '
        + 'el resultado es el mismo, solo con redacción fija.';
      const actions = el('div', 'triage-consent__actions');
      const accept = el('button', 'triage-consent__btn triage-consent__btn--primary', 'Activar asistente local');
      accept.type = 'button';
      accept.addEventListener('click', () => activateSLM(card));
      const decline = el('button', 'triage-consent__btn triage-consent__btn--ghost', 'Continuar sin él');
      decline.type = 'button';
      decline.addEventListener('click', () => declineSLM(card));
      actions.appendChild(accept);
      actions.appendChild(decline);
      card.appendChild(body);
      card.appendChild(actions);
      host.insertBefore(card, host.firstChild);
    }

    function activateSLM(card) {
      writeConsent('granted');
      runtime.config.mode = SLM.MODES.AUTO;
      runtime.config.exposure = SLM.EXPOSURE.LIVE;
      runtime.config.listener = Object.assign({}, runtime.config.listener, { enabled: true });
      // Persiste la elección para recargas; el dev override sigue teniendo prioridad.
      SLM.writeConfig(runtime.config);
      if (card && card.parentNode) card.parentNode.removeChild(card);
      updateRuntimeStatus({ status: SLM.STATUS.LOADING, exposure: SLM.EXPOSURE.LIVE });
      renderListenerInput();
      void runtime.prepare().then(updateRuntimeStatus);
    }

    function declineSLM(card) {
      writeConsent('declined');
      if (card && card.parentNode) card.parentNode.removeChild(card);
      const listenerBox = host.querySelector('.triage-listener');
      if (listenerBox && listenerBox.parentNode) listenerBox.parentNode.removeChild(listenerBox);
      updateRuntimeStatus({ status: SLM.STATUS.DISABLED, exposure: SLM.EXPOSURE.SHADOW });
    }

    const decided = readConsent() === 'granted' || readConsent() === 'declined';
    updateRuntimeStatus({ status: runtime.enabled() ? SLM.STATUS.LOADING : SLM.STATUS.DISABLED, exposure: config.exposure });
    if (runtime.enabled()) {
      void runtime.prepare().then(updateRuntimeStatus);
    } else if (!window.VitametricSLMConfig && !decided) {
      showConsentCard();
    }
    renderListenerInput();
    void step();
    return { session, runtime, questionsAsked: () => asked, activateSLM, declineSLM };
  }

  document.addEventListener('DOMContentLoaded', () => {
    const host = document.querySelector('[data-triage-chat]');
    if (host) window.__triageChat = mount(host);
  });

  window.VitametricTriageUI = { mount };
}());
