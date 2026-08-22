// G-Level: L1
// Sustrato: Script de Protocolo
// Función: Capa de presentación de la anamnesis conversacional — renderiza únicamente los turnos que el motor autoriza
// v-version: 20260822.01

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

    function updateRuntimeStatus(snapshot) {
      const active = config.mode !== SLM.MODES.OFF;
      slmStatus.style.display = active ? 'block' : 'none';
      if (!active) return;
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

    // Listener opcional de texto libre del paciente. On-device por defecto (privado);
    // el servo (modelo en la nube) solo se usa si el paciente da consentimiento.
    function renderListenerInput() {
      if (!runtime.config.listener || !runtime.config.listener.enabled) return;
      const box = el('div', 'triage-listener');
      const ta = el('textarea', 'triage-listener__input');
      ta.placeholder = '¿Quieres contarnos algo en tus palabras? (opcional)';
      ta.rows = 2;
      const send = el('button', 'triage-listener__send', 'Enviar');
      send.type = 'button';
      const consentWrap = el('label', 'triage-listener__consent');
      const consent = el('input');
      consent.type = 'checkbox';
      consentWrap.appendChild(consent);
      consentWrap.appendChild(document.createTextNode(' Permitir análisis en la nube para mejor comprensión (opcional)'));
      consent.checked = !!runtime.config.listener.serverConsent;
      consent.addEventListener('change', () => runtime.setListenerConsent(consent.checked));
      send.addEventListener('click', async () => {
        const text = ta.value;
        if (!text.trim()) return;
        ta.value = '';
        const r = await runtime.listen(text);
        if (r.ack) say(r.ack);
        if (r.intent === 'agendar') {
          const cta = controls.querySelector('.triage-cta');
          if (cta) cta.scrollIntoView({ behavior: 'smooth' });
        }
        scrollToEnd();
      });
      box.appendChild(ta);
      box.appendChild(send);
      box.appendChild(consentWrap);
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

    // La carga del modelo, si existe, es opcional y no bloquea el primer turno.
    // Con la configuración por defecto el runtime queda en plantillas verificadas.
    if (runtime.enabled()) {
      updateRuntimeStatus({ status: SLM.STATUS.LOADING, exposure: config.exposure });
    }
    void runtime.prepare().then(updateRuntimeStatus);
    renderListenerInput();
    void step();
    return { session, runtime, questionsAsked: () => asked };
  }

  document.addEventListener('DOMContentLoaded', () => {
    const host = document.querySelector('[data-triage-chat]');
    if (host) window.__triageChat = mount(host);
  });

  window.VitametricTriageUI = { mount };
}());
