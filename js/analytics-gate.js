/**
 * Vitametric — Analytics Gate (consent-first)
 *
 * Carga el tag de Google (gtag.js / AW-*) SOLO cuando el usuario acepta.
 * Reemplaza el snippet inline de <head>: sin aceptación no se descarga
 * googletagmanager, no se setea _ga ni la cookie de DoubleClick y Lighthouse
 * deja de marcar third-party-cookies / inspector-issues.
 *
 * Coherencia de producto: el resto del sitio ya es consent-first (tarjeta de
 * consentimiento del SLM, email gate no bloqueante, telemetría local sin PII).
 * El píxel publicitario era el único canal que se disparaba sin preguntar.
 *
 * API pública:
 *   VitametricAnalyticsGate.requestConsent()  -> Promise<boolean>  (UI externa la llama)
 *   VitametricAnalyticsGate.grant()           -> void              (aceptación explícita)
 *   VitametricAnalyticsGate.decline()         -> void              (rechazo persistente)
 *   VitametricAnalyticsGate.hasConsented()    -> boolean
 *   VitametricAnalyticsGate.isLoaded()        -> boolean
 *
 * Los eventos del sitio (p. ej. conversion_test_completed en mapa-senales-ui.js)
 * siguen usando window.gtag(...) si existe; sin consentimiento no existe, y el
 * código de la página ya lo consulta con `typeof window.gtag === 'function'`.
 */

(function (root) {
  'use strict';

  var CONSENT_KEY = 'vitametric_analytics_consent_v1';
  var GTAG_SRC = 'https://www.googletagmanager.com/gtag/js?id=';
  var TAG_IDS = ['AW-18397567827'];

  var loaded = false;
  var consented = false;

  function readConsent() {
    try {
      return root.localStorage.getItem(CONSENT_KEY) === 'granted';
    } catch (e) {
      return false;
    }
  }

  function writeConsent(granted) {
    try {
      root.localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied');
    } catch (e) { /* almacenamiento no disponible: la sesión decide, no persiste */ }
  }

  /**
   * Inyecta gtag.js con los IDs de campaña. Reproduce el snippet oficial de
   * Google (dataLayer + gtag('js') + gtag('config')) pero solo tras el opt-in.
   */
  function loadGtag() {
    if (loaded || typeof document === 'undefined') return;
    loaded = true;

    /* eslint-disable */
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    /* eslint-enable */

    var first = document.getElementsByTagName('script')[0];
    for (var i = 0; i < TAG_IDS.length; i++) {
      var id = TAG_IDS[i];
      var script = document.createElement('script');
      script.async = true;
      script.src = GTAG_SRC + id;
      if (first && first.parentNode) first.parentNode.insertBefore(script, first);
      else document.head.appendChild(script);
      window.gtag('js', new Date());
      window.gtag('config', id);
    }
  }

  function grant() {
    writeConsent(true);
    consented = true;
    loadGtag();
  }

  function decline() {
    writeConsent(false);
    consented = false;
  }

  /**
   * Resuelve true/false con el consentimiento vigente. Si no hay decisión
   * previa, queda pendiente: la UI que pida el consentimiento es la responsable
   * de mostrar el aviso (igual que el email gate y la tarjeta del SLM).
   */
  function requestConsent() {
    if (readConsent()) {
      consented = true;
      loadGtag();
      return Promise.resolve(true);
    }
    if (root.localStorage && root.localStorage.getItem(CONSENT_KEY) === 'denied') {
      return Promise.resolve(false);
    }
    return Promise.resolve(false);
  }

  // Estado inicial: si ya se concedió en una visita anterior, carga de inmediato.
  if (readConsent()) {
    consented = true;
    loadGtag();
  }

  root.VitametricAnalyticsGate = {
    requestConsent: requestConsent,
    grant: grant,
    decline: decline,
    hasConsented: function () { return consented; },
    isLoaded: function () { return loaded; },
    CONSENT_KEY: CONSENT_KEY
  };

}(typeof self !== 'undefined' ? self : this));
