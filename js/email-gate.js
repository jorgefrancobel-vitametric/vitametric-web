/**
 * Vitametric — Email Gate (Lead Capture)
 *
 * Captura el correo del usuario de forma no bloqueante durante la anamnesis
 * conversacional. Se integra con el motor de triaje sin modificar su contrato:
 * escucha eventos del DOM y usa Formspree como backend de envío.
 *
 * Persistencia: el email queda en localStorage con TTL de 30 días. Si el
 * usuario ya lo dio antes, no se le pregunta de nuevo.
 *
 * Integración:
 *   <script src="js/email-gate.js"></script>
 *   // El gate se auto-inicializa al DOMContentLoaded.
 */

(function (root) {
  'use strict';

  var FORMSPREE_ENDPOINT = 'https://formspree.io/f/xykqnebq';
  var STORAGE_KEY = 'vitametric_email_v1';
  var STORAGE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 días

  /**
   * Lee el email guardado. Retorna null si expiró o no existe.
   */
  function getStoredEmail() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (Date.now() - data.ts > STORAGE_TTL) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return data.email;
    } catch (e) {
      return null;
    }
  }

  /**
   * Guarda el email en localStorage con timestamp.
   */
  function storeEmail(email) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        email: email,
        ts: Date.now()
      }));
    } catch (e) { /* no disponible */ }
  }

  /**
   * Valida formato de email.
   */
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  /**
   * Envía el email a Formspree con los metadatos del test.
   */
  function submitToFormspree(email, metadata) {
    var formData = new FormData();
    formData.append('email', email);
    formData.append('_subject', 'Lead Vitametric — Test Celular');
    if (metadata) {
      formData.append('source', 'test-celular-chat');
      formData.append('variant', metadata.variant || 'unknown');
      formData.append('questions_answered', metadata.questionsAnswered || 0);
      formData.append('risk_level', metadata.riskLevel || 'unknown');
      formData.append('global_score', metadata.globalScore || 0);
      formData.append('page_url', window.location.href);
    }

    return fetch(FORMSPREE_ENDPOINT, {
      method: 'POST',
      body: formData,
      headers: { 'Accept': 'application/json' }
    }).then(function (r) {
      if (!r.ok) throw new Error('Formspree returned ' + r.status);
      return r.json();
    });
  }

  /**
   * Construye el HTML del prompt de email. Se inyecta en el DOM.
   */
  function buildPrompt() {
    var I18N = root.VitametricI18n;
    var t = (I18N && I18N.t) ? function (k, p) { return I18N.t(k, null, p); } : function (k) { return k; };

    var container = document.createElement('div');
    container.className = 'email-gate';
    container.setAttribute('role', 'dialog');
    container.setAttribute('aria-label', t('email_title'));

    var title = document.createElement('h3');
    title.className = 'email-gate__title';
    title.textContent = t('email_title');
    container.appendChild(title);

    var body = document.createElement('p');
    body.className = 'email-gate__body';
    body.textContent = t('email_body');
    container.appendChild(body);

    var form = document.createElement('form');
    form.className = 'email-gate__form';
    form.setAttribute('novalidate', '');

    var input = document.createElement('input');
    input.type = 'email';
    input.className = 'email-gate__input';
    input.placeholder = t('email_placeholder');
    input.setAttribute('aria-label', t('email_placeholder'));
    input.required = true;
    form.appendChild(input);

    var actions = document.createElement('div');
    actions.className = 'email-gate__actions';

    var saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'email-gate__btn email-gate__btn--primary';
    saveBtn.textContent = t('email_save');
    actions.appendChild(saveBtn);

    var skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'email-gate__btn email-gate__btn--ghost';
    skipBtn.textContent = t('email_skip');
    actions.appendChild(skipBtn);

    form.appendChild(actions);
    container.appendChild(form);

    var feedback = document.createElement('p');
    feedback.className = 'email-gate__feedback';
    feedback.setAttribute('aria-live', 'polite');
    container.appendChild(feedback);

    return {
      container: container,
      form: form,
      input: input,
      saveBtn: saveBtn,
      skipBtn: skipBtn,
      feedback: feedback
    };
  }

  /**
   * Muestra el prompt de email. Se puede llamar en cualquier momento del flujo.
   * @param {object} [metadata] - datos del test para enviar junto con el email
   * @returns {Promise<{email: string|null, skipped: boolean}>}
   */
  function showEmailPrompt(metadata) {
    // Si ya tenemos email guardado, no preguntar.
    var stored = getStoredEmail();
    if (stored) return Promise.resolve({ email: stored, skipped: false });

    return new Promise(function (resolve) {
      var host = document.querySelector('[data-triage-chat]');
      if (!host) { resolve({ email: null, skipped: true }); return; }

      var ui = buildPrompt();
      host.appendChild(ui.container);

      function cleanup() {
        if (ui.container.parentNode) ui.container.parentNode.removeChild(ui.container);
      }

      ui.form.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = ui.input.value.trim();
        if (!isValidEmail(email)) {
          ui.input.classList.add('email-gate__input--error');
          ui.feedback.textContent = 'Ingresa un correo válido.';
          return;
        }

        ui.saveBtn.disabled = true;
        ui.saveBtn.textContent = '…';

        submitToFormspree(email, metadata).then(function () {
          storeEmail(email);
          cleanup();
          resolve({ email: email, skipped: false });
        }).catch(function (err) {
          console.warn('[email-gate] Formspree falló:', err && err.message);
          // Guardamos localmente aunque falle el envío: reintento diferido.
          storeEmail(email);
          cleanup();
          resolve({ email: email, skipped: false });
        });
      });

      ui.skipBtn.addEventListener('click', function () {
        cleanup();
        resolve({ email: null, skipped: true });
      });

      // Foco en el input
      setTimeout(function () { ui.input.focus(); }, 100);
    });
  }

  /**
   * Escucha eventos de la UI del triaje para disparar el prompt.
   * Se auto-configura al detectar el elemento [data-triage-chat].
   */
  function autoWire() {
    var host = document.querySelector('[data-triage-chat]');
    if (!host) return;

    // Observar cuándo aparecen burbujas de resultado (RESULT turn).
    var observer = new MutationObserver(function () {
      // Solo mostrar el prompt si ya hay al menos 3 preguntas respondidas
      // y no se mostró antes.
      var results = host.querySelectorAll('.triage-result');
      if (results.length > 0 && !getStoredEmail()) {
        var bubbles = host.querySelectorAll('.triage-bubble--bot');
        if (bubbles.length >= 3) {
          // Contar preguntas aproximadas por las opciones respondidas
          var options = host.querySelectorAll('.triage-option');
          // Ya hay suficiente interacción para pedir email
          observer.disconnect();
          showEmailPrompt({
            questionsAnswered: bubbles.length,
            variant: (root.VitametricABRouter && root.VitametricABRouter.variant) || 'unknown'
          });
        }
      }
    });

    observer.observe(host, { childList: true, subtree: true });
  }

  // Auto-inicializar al DOMContentLoaded
  document.addEventListener('DOMContentLoaded', autoWire);

  root.VitametricEmailGate = {
    show: showEmailPrompt,
    getStoredEmail: getStoredEmail,
    storeEmail: storeEmail,
    submit: submitToFormspree
  };

}(typeof self !== 'undefined' ? self : this));