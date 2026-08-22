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

  if (!Triage || !Engine) {
    console.error('[triage-ui] faltan dependencias: triage-chat.js y test-celular-engine.js deben cargarse antes.');
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

    const stream = el('div', 'triage-stream');
    const controls = el('div', 'triage-controls');
    const progress = el('div', 'triage-progress');
    const bar = el('div', 'triage-progress__bar');
    progress.appendChild(bar);

    host.innerHTML = '';
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
        const tag = el('span', `triage-claim__tag triage-claim__tag--${claim.evidence.toLowerCase()}`,
          claim.evidence === EVIDENCE.SELF_REPORT ? 'lo que reportaste'
            : claim.evidence === EVIDENCE.MODEL_ESTIMATE ? (CERTAINTY_LABEL[claim.certainty] || 'estimación')
              : 'requiere medición en clínica');
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

      Object.values(turn.estimates)
        .sort((a, b) => b.theta - a.theta)
        .forEach((est) => {
          const row = el('div', 'triage-result__row');
          row.appendChild(el('span', 'triage-result__axis', `${AXES[est.axis].icon} ${AXES[est.axis].shortName}`));
          const meter = el('div', 'triage-result__meter');
          const fill = el('div', 'triage-result__fill');
          fill.style.width = `${est.scale}%`;
          fill.style.background = AXES[est.axis].color;
          meter.appendChild(fill);
          row.appendChild(meter);
          row.appendChild(el('span', 'triage-result__value', `${est.scale}`));
          // La precisión de cada eje viaja al lado del número: sin esto, un eje
          // estimado con dos respuestas se lee igual que uno con seis.
          row.appendChild(el('span', 'triage-result__certainty', CERTAINTY_LABEL[est.certainty]));
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
      turn.allowedClaims.forEach((c) => lineas.push(`• ${c.text}`));
      lineas.push('', '*Desglose por área (según lo que reporté):*');
      Object.values(turn.estimates)
        .sort((a, b) => b.theta - a.theta)
        .forEach((est) => {
          lineas.push(`• ${AXES[est.axis].icon} ${AXES[est.axis].shortName}: ${est.scale}/100 (${CERTAINTY_LABEL[est.certainty]})`);
        });
      lineas.push('', '🎯 Quiero agendar la *Evaluación Multisistémica ES-Complex ($3,900 MXN)*.');
      lineas.push('', '_Autoevaluación de síntomas percibidos: no es un diagnóstico ni una medición._');
      return `https://wa.me/525585327421?text=${encodeURIComponent(lineas.join('\n'))}`;
    }

    function step() {
      const turn = session.next();

      if (turn.blocked) {
        say(turn.text);
        clearControls();
        console.warn('[triage-ui] turno bloqueado por el guardián:', turn.violations);
        return;
      }

      updateProgress(session.state().estimates);

      if (turn.type === TURN.FRAMING) {
        say(turn.text);
        renderClaims(turn.allowedClaims);
        renderOptions(turn.options, () => step());
        return;
      }

      if (turn.type === TURN.QUESTION) {
        asked++;
        say(turn.text);
        renderOptions(turn.options, (value) => {
          session.answer(turn.itemId, value);
          step();
        });
        return;
      }

      if (turn.type === TURN.REFLECTION) {
        say(turn.text);
        renderClaims(turn.allowedClaims);
        renderOptions(turn.options, (accepted) => {
          session.respondToReflection(turn.axis, accepted);
          step();
        });
        return;
      }

      if (turn.type === TURN.RESULT) {
        say(turn.text);
        bar.style.width = '100%';
        renderResult(turn);
      }
    }

    step();
    return { session, questionsAsked: () => asked };
  }

  document.addEventListener('DOMContentLoaded', () => {
    const host = document.querySelector('[data-triage-chat]');
    if (host) window.__triageChat = mount(host);
  });

  window.VitametricTriageUI = { mount };
}());
