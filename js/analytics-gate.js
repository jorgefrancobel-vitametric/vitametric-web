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
 *   VitametricAnalyticsGate.openPreferences() -> void  (reabre el banner)
 *   VitametricAnalyticsGate.reset()           -> void  (revoca y recarga)
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
  var bannerEl = null;

  var BANNER_TEXT = 'Usamos cookies analíticas y de medición de Google y Meta para entender cómo se usa el sitio y mejorar nuestros servicios. No se activan hasta que usted las acepte.';
  var NOTICE_HREF = '/aviso-privacidad.html#cookies';

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

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }

  /**
   * Banner de consentimiento. Se monta solo si no hay decisión previa; la
   * página de aviso de privacidad puede reabrirlo con openPreferences().
   * Sin este banner el gate sería inalcanzable para un visitante nuevo y
   * «consent-first» significaría «cero medición», no «medición consentida».
   */
  function mountBanner(force) {
    if (typeof document === 'undefined' || !document.body) return;
    if (bannerEl && document.body.contains(bannerEl)) return;

    var stored = null;
    try { stored = root.localStorage.getItem(CONSENT_KEY); } catch (e) { /* sin storage: se pregunta en cada visita */ }
    if (!force && (stored === 'granted' || stored === 'denied')) return;

    var banner = el('div', 'vt-cookie-banner');
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-modal', 'false');
    banner.setAttribute('aria-labelledby', 'vt-cookie-title');
    banner.setAttribute('aria-describedby', 'vt-cookie-desc');

    var inner = el('div', 'vt-cookie-inner');
    var copy = el('div', 'vt-cookie-copy');

    var title = el('p', 'vt-cookie-title', 'Cookies y medición');
    title.id = 'vt-cookie-title';

    var desc = el('p', 'vt-cookie-desc', BANNER_TEXT + ' ');
    desc.id = 'vt-cookie-desc';
    var link = el('a', 'vt-cookie-link', 'Aviso de Privacidad');
    link.href = NOTICE_HREF;
    desc.appendChild(link);

    var actions = el('div', 'vt-cookie-actions');
    var accept = el('button', 'vt-cookie-btn vt-cookie-btn--accept', 'Aceptar');
    accept.type = 'button';
    var reject = el('button', 'vt-cookie-btn vt-cookie-btn--reject', 'Rechazar');
    reject.type = 'button';

    function close() {
      if (banner.parentNode) banner.parentNode.removeChild(banner);
      bannerEl = null;
    }

    accept.addEventListener('click', function () { grant(); close(); });
    reject.addEventListener('click', function () { decline(); close(); });

    copy.appendChild(title);
    copy.appendChild(desc);
    actions.appendChild(reject);
    actions.appendChild(accept);
    inner.appendChild(copy);
    inner.appendChild(actions);
    banner.appendChild(inner);
    document.body.appendChild(banner);
    bannerEl = banner;
  }

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  /** Reabre el banner (enlace «cambiar preferencias» del aviso de privacidad). */
  function openPreferences() {
    if (typeof document === 'undefined') return;
    onReady(function () { mountBanner(true); });
  }

  /**
   * Borra la decisión y recarga: gtag.js no se puede descargar de una página
   * ya cargada, así que recargar es la única forma honesta de revocar.
   */
  function reset() {
    try { root.localStorage.removeItem(CONSENT_KEY); } catch (e) { /* nada que borrar */ }
    consented = false;
    if (root.location && typeof root.location.reload === 'function') root.location.reload();
    else mountBanner(true);
  }

  // Estado inicial: si ya se concedió en una visita anterior, carga de inmediato.
  if (readConsent()) {
    consented = true;
    loadGtag();
  }

  if (typeof document !== 'undefined') onReady(function () { mountBanner(false); });

  root.VitametricAnalyticsGate = {
    requestConsent: requestConsent,
    grant: grant,
    decline: decline,
    hasConsented: function () { return consented; },
    isLoaded: function () { return loaded; },
    openPreferences: openPreferences,
    reset: reset,
    CONSENT_KEY: CONSENT_KEY
  };

}(typeof self !== 'undefined' ? self : this));
