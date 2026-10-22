/**
 * Vitametric — Meta Conversions API (Cloudflare Pages Function)
 *
 * Envía eventos de conversión a Meta desde el servidor, sin píxel en el
 * navegador. Ruta: POST /api/meta-capi
 *
 * Por qué server-side: el embudo de Vitametric ya vive en el servidor
 * (triaje y WhatsApp en Cloudflare), los eventos llegan firmados por el
 * servidor, sobreviven a bloqueadores de anuncios y evitan una petición de
 * terceros más en el dispositivo del paciente.
 *
 * Configuración (Pages → Settings → Environment variables):
 *   META_PIXEL_ID   id del dataset/píxel de Meta (público, 15-16 dígitos)
 *   META_CAPI_TOKEN token de acceso de Conversions API (SECRETO)
 * Sin ambas variables el endpoint responde 503 y el sitio sigue funcionando:
 * no se envía nada a Meta.
 *
 * Body esperado (JSON):
 *   { eventName, eventId?, fbp?, fbc?, value?, currency?, contentName? }
 *
 * Consentimiento: el front solo llama aquí cuando
 * VitametricAnalyticsGate.hasConsented() es true (mismo gate que gtag).
 * Deduplicación: Meta descarta eventos repetidos si el mismo event_id llega
 * dos veces (píxel y CAPI); aquí se reutiliza el event_id que genera el front.
 */

/* Eventos que el sitio está autorizado a reportar. Cualquier otro se rechaza:
   el endpoint no es un passthrough genérico hacia la cuenta de anuncios. */
const ALLOWED_EVENTS = new Set([
  'Lead',
  'Contact',
  'Schedule'
]);

const GRAPH_VERSION = 'v21.0';
const ALLOWED_ORIGINS = [
  'https://vitametric.com',
  'https://www.vitametric.com',
  'https://vitametric.pages.dev',
  'http://localhost:8899',
  'http://localhost:8080',
  'http://localhost:3000'
];

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : 'https://vitametric.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const cors = corsHeaders(request.headers.get('Origin') || '');

  if (!env || !env.META_PIXEL_ID || !env.META_CAPI_TOKEN) {
    return new Response(JSON.stringify({ ok: false, reason: 'capi_not_configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...cors }
    });
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, reason: 'invalid_json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...cors }
    });
  }

  const eventName = typeof payload.eventName === 'string' ? payload.eventName : '';
  if (!ALLOWED_EVENTS.has(eventName)) {
    return new Response(JSON.stringify({ ok: false, reason: 'event_not_allowed' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...cors }
    });
  }

  const userData = {
    client_ip_address: request.headers.get('cf-connecting-ip') || '',
    client_user_agent: (request.headers.get('User-Agent') || '').slice(0, 300)
  };
  /* fbp/fbc llegan del front (cookie _fbp y parámetro fbclid). Sin ellos Meta
     hace emparejamiento menos fiable, pero nunca se inventan. */
  if (typeof payload.fbp === 'string' && payload.fbp.startsWith('fb.')) userData.fbp = payload.fbp;
  if (typeof payload.fbc === 'string' && payload.fbc.length < 120) userData.fbc = payload.fbc;

  const event = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'website',
    event_source_url: 'https://vitametric.com/',
    user_data: userData
  };
  if (typeof payload.eventId === 'string' && payload.eventId) event.event_id = payload.eventId.slice(0, 80);

  const url = 'https://graph.facebook.com/' + GRAPH_VERSION + '/' + env.META_PIXEL_ID + '/events?access_token=' + encodeURIComponent(env.META_CAPI_TOKEN);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      /* VB5: cota dura de 8s — si Graph se cuelga, el abort cae al catch y
         responde 502 graph_unreachable en vez de atorar la función. */
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ data: [event] })
    });
    const text = await res.text();
    /* Nunca devolvemos el token ni el cuerpo completo de Graph al front. */
    return new Response(JSON.stringify({ ok: res.ok, status: res.status, events_received: safeCount(text) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...cors }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, reason: 'graph_unreachable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...cors }
    });
  }
}

function safeCount(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed && parsed.events_received != null ? parsed.events_received : 0;
  } catch (e) {
    return 0;
  }
}

export function onRequestOptions(context) {
  return new Response(null, { status: 204, headers: corsHeaders(context.request.headers.get('Origin') || '') });
}
