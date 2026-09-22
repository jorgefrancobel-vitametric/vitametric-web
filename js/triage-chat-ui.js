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

  const I18N = window.VitametricI18n || null;
  function _t(key, params) {
    if (I18N && typeof I18N.t === 'function') return I18N.t(key, null, params);
    return (params && params.default) || key;
  }

  const CERTAINTY_LABEL = {
    [CERTAINTY.PRELIMINARY]: _t('cert_preliminary', { default: 'información preliminar' }),
    [CERTAINTY.PROBABLE]: _t('cert_probable', { default: 'estimación probable' }),
    [CERTAINTY.ESTABLISHED]: _t('cert_established', { default: 'estimación consolidada' })
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function mount(host) {
    const session = Triage.createSession({
      kiosk: !!(window.__vitametricKiosk)
    });

    // ES-Complex baseline: integración retirada de producción. El motor conserva
    // setBaseline() como capacidad interna; la carga del JSON vive en la rama dev
    // (a la espera de que los pacientes reciban el formato exportable).
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

    // Matriz de hechos del motor, cuando ya existe. Sin ella el gate juzga
    // léxico y modo verbal; G2 se abstiene por diseño.
    let provenanceFacts = null;
    function setProvenanceFacts(facts) { provenanceFacts = facts || null; }

    /**
     * Último gate antes de que una burbuja llegue al paciente. Sólo se vigila
     * lo que dice el bot: lo que escribe la persona es su propio reporte y no
     * se censura. Al fallar se degrada a un texto seguro — nunca se reintenta
     * con el modelo, porque fallar hacia lo determinista es la regla.
     */
    function vetBubble(text, kind) {
      const guard = (typeof window !== 'undefined' && window.VitametricProvenanceGuard) || null;
      if (!guard || kind !== 'bot' || !text) return text;
      const verdict = guard.runProvenanceGuards(text, provenanceFacts, { mode: 'generated' });
      if (verdict.ok) return text;
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[provenance-guard] burbuja bloqueada:', verdict.violations, text);
      }
      return 'Anotado. Sigamos con lo que me cuentas.';
    }

    function say(text, kind = 'bot') {
      const bubble = el('div', `triage-bubble triage-bubble--${kind}`, vetBubble(text, kind));
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
          ? el('span', 'triage-claim__tag triage-claim__tag--limit', _t('claim_is_limit', { default: 'lo que no significa' }))
          : el('span', `triage-claim__tag triage-claim__tag--${claim.evidence.toLowerCase()}`,
            claim.evidence === EVIDENCE.SELF_REPORT ? _t('claim_self_report', { default: 'lo que reportaste' })
              : claim.evidence === EVIDENCE.MODEL_ESTIMATE ? (CERTAINTY_LABEL[claim.certainty] || _t('claim_estimate', { default: 'estimación' }))
                : _t('claim_needs_clinic', { default: 'requiere medición en clínica' }));
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
      detalle.appendChild(el('h3', 'triage-result__title', _t('chat_result_title', { default: 'Desglose por área' })));

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
        _t('chat_result_responded', { asked: turn.itemsAsked, catalog: turn.catalogSize }));
      detalle.appendChild(nota);

      // Si algún eje llegó al tope de items, se informa: la autoevaluación
      // discrimina mejor cuando no se marca todo.
      if (turn.cappedAxes && turn.cappedAxes.length) {
        const AXES = window.VitametricTestEngine && window.VitametricTestEngine.AXES || {};
        const cappedNames = turn.cappedAxes
          .map((k) => AXES[k] ? AXES[k].shortName : k)
          .join(', ');
        const cappedNote = el('p', 'triage-result__note',
          _t('chat_capped_notice', { axes: cappedNames }));
        detalle.appendChild(cappedNote);
      }

      stream.appendChild(detalle);

      // Email gate: ofrecer guardar email tras ver el resultado.
      // No bloquea: se muestra debajo del resultado.
      if (window.VitametricEmailGate && typeof window.VitametricEmailGate.show === 'function') {
        var ab = window.VitametricABRouter;
        window.VitametricEmailGate.show({
          questionsAnswered: asked,
          riskLevel: (turn.axisSummaries && turn.axisSummaries[0]) ? turn.axisSummaries[0].band : 'unknown',
          globalScore: 0,
          variant: ab ? ab.variant : 'unknown'
        });
      }

      clearControls();
      const cta = el('a', 'triage-cta', _t('ui_cta_whatsapp', { default: 'Agendar mi evaluación en clínica' }));
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
      const lineas = [_t('wa_header', { default: '*AUTOEVALUACIÓN DE SÍNTOMAS — VITAMETRIC*' }), ''];
      turn.allowedClaims.filter((c) => !c.isLimit).forEach((c) => lineas.push(`• ${c.text}`));
      lineas.push('', _t('wa_breakdown_header', { default: '*Desglose por área (según lo que reporté):*' }));
      (turn.axisSummaries || []).forEach((s) => {
        lineas.push(`• ${s.icon} ${s.name}: ${s.band} — ${s.phrase}`);
      });
      lineas.push('', _t('wa_motive', { default: '🎯 Quiero agendar la *Evaluación Multisistémica ES-Complex ($5,990 MXN)*.' }));
      lineas.push('', _t('wa_disclaimer', { default: '_Autoevaluación de síntomas percibidos: no es un diagnóstico ni una medición._' }));
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
      const hint = el('span', 'triage-suggestion__hint', _t('listener_hint', { default: 'Puedes responderme aquí abajo si quieres' }));
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

    function updateRuntimeStatus(snapshot) {
      const active = runtime.config.mode !== SLM.MODES.OFF;
      slmStatus.innerHTML = '';
      if (!active) {
        slmStatus.style.display = 'none';
        return;
      }
      slmStatus.style.display = 'block';
      slmStatus.dataset.state = snapshot.status;
      if (snapshot.status === SLM.STATUS.LOADING) {
        slmStatus.textContent = _t('slm_loading', { default: 'Asistente local: preparando el modelo…' });
      } else if (snapshot.status === SLM.STATUS.READY) {
        slmStatus.textContent = snapshot.exposure === SLM.EXPOSURE.SHADOW
          ? _t('slm_shadow', { default: 'Asistente local: evaluación en segundo plano; respuesta verificada.' })
          : _t('slm_active', { default: 'Asistente local: activo con salida verificada.' });
      } else if (snapshot.status === SLM.STATUS.ERROR) {
        slmStatus.textContent = _t('slm_error', { default: 'Asistente local no disponible; continuamos con respuestas verificadas.' });
      } else {
        slmStatus.textContent = _t('slm_error', { default: 'Asistente local no disponible; continuamos con respuestas verificadas.' });
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
      ta.placeholder = _t('listener_placeholder', { default: 'Cuéntanos en tus palabras si deseas agregar algo…' });
      ta.rows = 1;
      ta.setAttribute('aria-label', 'Mensaje en texto libre');

      const send = el('button', 'triage-listener__send');
      send.type = 'button';
      send.setAttribute('aria-label', _t('listener_send', { default: 'Enviar mensaje' }));
      send.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
      send.disabled = true;

      ta.addEventListener('input', () => {
        ta.style.height = 'auto';
        ta.style.height = ta.scrollHeight + 'px';
        send.disabled = !ta.value.trim();
      });

      async function handleSend() {
        const text = ta.value.trim();
        if (!text) return;
        ta.value = '';
        ta.style.height = 'auto';
        send.disabled = true;
        // Restaurar placeholder por defecto tras el foco del bocadillo.
        ta.placeholder = _t('listener_placeholder', { default: 'Cuéntanos en tus palabras si deseas agregar algo…' });
        say(text, 'user');
        try {
          // Usar listenDeep para extraer síntomas + relaciones causales.
          const r = await runtime.listenDeep(text);
          if (r && r.ack) {
            say(r.ack, 'bot');
          } else {
            // Sin modelo listo no hay `ack`, pero la extracción determinista sí
            // corrió: callar aquí deja al paciente escribiendo al vacío. El
            // acuse repite sus palabras, no afirma nada clínico.
            const ack = Triage.acknowledgeExtraction(r && r.extractedSymptoms, {
              modelLoading: runtime.status === SLM.STATUS.LOADING
            });
            say(ack.text, 'bot');
          }

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
        consentWrap.appendChild(document.createTextNode(' ' + _t('listener_consent_label', { default: 'Permitir análisis en servidor para mejor comprensión (opcional)' })));
        box.appendChild(consentWrap);
      }

      host.appendChild(box);
    }

    async function step() {
      // Refresca la matriz que juzga el gate antes de emitir el turno: los
      // estimates son los únicos números que el bot tiene derecho a citar.
      try {
        const st = session.state();
        setProvenanceFacts({
          estimates: st.estimates || null,
          responseValidity: { lowCountAxes: [] },
          measured: null
        });
      } catch (e) { /* el gate sigue juzgando léxico y modo verbal sin matriz */ }

      const turn = session.next();

      if (turn.blocked) {
        say(turn.text);
        clearControls();
        console.warn('[triage-ui] turno bloqueado por el guardián:', turn.violations);
        return;
      }

      updateProgress(session.state().estimates);

      // El enunciado de un ítem es un estímulo psicométrico calibrado: su
      // `difficulty` corresponde a ESE texto. Parafrasearlo con el SLM cuesta
      // 0.5-1 s medidos por pregunta (más en celular) — acumulado sobre las 12-22
      // del test — y sólo cambia cosas como "lo notas" → "te pasa". No se articula:
      // el modelo se reserva para los turnos donde la prosa aporta de verdad
      // (encuadre, reflexión y cierre).
      const articulated = turn.type === TURN.QUESTION
        ? { usedModel: false, text: turn.text }
        : await runtime.articulate(turn);
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
      card.appendChild(el('div', 'triage-consent__title', _t('consent_title', { default: '¿Activamos el asistente local?' })));
      const body = el('p', 'triage-consent__body');
      body.textContent = _t('consent_body', {
        default: 'Este cuestionario puede usar un modelo de lenguaje pequeño que se descarga una sola vez a tu dispositivo (unos 600 MB; luego queda en caché) y se ejecuta en tu navegador con WebGPU. Tus respuestas se procesan localmente: no se envían a ningún servidor. Si tu equipo no soporta WebGPU, el cuestionario sigue funcionando con respuestas verificadas por plantillas. También podrás escribir en tus palabras: ese texto se analiza en tu dispositivo. Puedes continuar sin activarlo: el resultado es el mismo, solo con redacción fija.'
      });
      const actions = el('div', 'triage-consent__actions');
      const accept = el('button', 'triage-consent__btn triage-consent__btn--primary', _t('consent_activate', { default: 'Activar asistente local' }));
      accept.type = 'button';
      accept.addEventListener('click', () => activateSLM(card));
      const decline = el('button', 'triage-consent__btn triage-consent__btn--ghost', _t('consent_decline', { default: 'Continuar sin él' }));
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
