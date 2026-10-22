/**
 * Vitametric — Meta Conversions API (cliente)
 *
 * Envia eventos de conversion a /api/meta-capi, que los reenvia a Meta desde
 * el servidor (Cloudflare Pages Function). No hay píxel en el navegador:
 * ninguna petición a dominios de Meta desde el dispositivo del paciente.
 *
 * Consent-first: si el gate de analytics no ha sido aceptado, no se envía
 * nada; es el mismo opt-in que gtag, así el embudo público y el píxel de
 * Meta comparten decisión.
 *
 * API:
 *   VitametricMetaCapi.track('Contact')
 *
 * Deduplicacion: cada evento lleva un eventId generado aqui. Si en el futuro
 * se añade píxel navegador, basta reutilizar ese mismo id en fbq() para que
 * Meta descarte el duplicado.
 */
(function (root) {
  'use strict';

  var ENDPOINT = '/api/meta-capi';
  var ALLOWED = ['Lead', 'Contact', 'Schedule'];

  function cookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  function fbc() {
    try {
      var q = new URLSearchParams(root.location.search).get('fbclid');
      return q ? 'fb.1.' + Date.now() + '.' + q : '';
    } catch (e) {
      return '';
    }
  }

  function track(eventName) {
    try {
      if (!eventName || ALLOWED.indexOf(eventName) === -1) return null;
      if (!root.VitametricAnalyticsGate || !root.VitametricAnalyticsGate.hasConsented()) return null;

      var eventId = (root.crypto && root.crypto.randomUUID) ? root.crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(16).slice(2);
      var body = {
        eventName: eventName,
        eventId: eventId,
        fbp: cookie('_fbp'),
        fbc: fbc()
      };
      if (root.fetch && typeof root.fetch === 'function') {
        root.fetch(ENDPOINT, {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }).catch(function () { /* el sitio no depende de esta respuesta */ });
      }
      return eventId;
    } catch (e) {
      return null;
    }
  }

  root.VitametricMetaCapi = { track: track, ALLOWED: ALLOWED };
}(typeof self !== 'undefined' ? self : this));
