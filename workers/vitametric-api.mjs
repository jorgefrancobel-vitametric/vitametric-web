/**
 * Vitametric — API Worker (POST /api/analytics y POST /api/meta-capi)
 *
 * Por qué existe: el sitio vive en GitHub Pages detrás del proxy de Cloudflare.
 * GH Pages responde 405 a cualquier POST, así que las Pages Functions del repo
 * (functions/api/analytics.js y functions/api/meta-capi.js) no corren. Este
 * Worker reproduce EXACTAMENTE su lógica y se monta con rutas de zona
 * `vitametric.com/api/*` y `www.vitametric.com/api/*`. Es el único host que
 * intercepta POST bajo /api/*; el contenido del sitio no pasa por aquí.
 *
 * Fuente de verdad: functions/api/api-*.js (mismo orden de validaciones,
 * mismos códigos de error). Si cambia la lógica, cambiar aquí también.
 * Bindings:
 *   META_PIXEL_ID (plain_text) — id del dataset/píxel de Meta.
 *   META_CAPI_TOKEN (secret_text) — token de Conversions API. SIN este token
 *     el endpoint /api/meta-capi responde 503 y el sitio sigue funcionando.
 *   VITAMETRIC_ANALYTICS (opcional, Analytics Engine) — mismo contrato que
 *     la función Pages; sin binding cae al log estructurado.
 */

const GRAPH_VERSION = 'v21.0';
const ALLOWED_EVENTS = new Set([
  'Lead',
  'Contact',
  'Schedule'
]);

const ANALYTICS_ALLOWED_ORIGINS = [
  'https://vitametric.com',
  'https://www.vitametric.com',
  'https://vitametric.pages.dev',
  'http://localhost:8080',
  'http://localhost:3000'
];

const MAX_ANALYTICS_BATCH_SIZE = 20;

/* VB4/VB10 — cuota de aplicación: 5 POST / 10 s por IP (precedente del
   engagement Casa Tapputi). Espejo idéntico de las validaciones que ya viven
   en functions/api/analytics.js y functions/api/meta-capi.js; este worker es
   la entrada EN VIVO (ruta de zona /api/*), así que la cota decide aquí. */
const RATE_WINDOW_MS = 10000;
const RATE_MAX = 5;
const rateBuckets = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  if (rateBuckets.size > 10000) {
    for (const [key, bucket] of rateBuckets) {
      if (now - bucket.start >= RATE_WINDOW_MS) rateBuckets.delete(key);
    }
  }
  let bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.start >= RATE_WINDOW_MS) {
    bucket = { start: now, count: 0 };
    rateBuckets.set(ip, bucket);
  }
  bucket.count += 1;
  if (bucket.count > RATE_MAX) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((bucket.start + RATE_WINDOW_MS - now) / 1000)) };
  }
  return { allowed: true };
}

function rateLimitedResponse(request, rate, allowedOrigins) {
  const origin = request.headers.get('Origin') || '';
  return jsonResponse({ ok: false, reason: 'rate_limited' }, 429, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : 'https://vitametric.com',
    'Retry-After': String(rate.retryAfter)
  });
}

const CAPI_ALLOWED_ORIGINS = [
  'https://vitametric.com',
  'https://www.vitametric.com',
  'https://vitametric.pages.dev',
  'http://localhost:8899',
  'http://localhost:8080',
  'http://localhost:3000'
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');

    if (path === '/api/analytics') {
      if (request.method === 'POST') {
        const rate = checkRateLimit(request.headers.get('cf-connecting-ip') || 'unknown');
        if (!rate.allowed) return rateLimitedResponse(request, rate, ANALYTICS_ALLOWED_ORIGINS);
      }
      if (request.method === 'OPTIONS' || request.method === 'POST') {
        return handleAnalytics(request, env);
      }
      return jsonResponse({ ok: true, service: 'vitametric-analytics' }, 200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
    }

    if (path === '/api/meta-capi') {
      if (request.method === 'POST') {
        const rate = checkRateLimit(request.headers.get('cf-connecting-ip') || 'unknown');
        if (!rate.allowed) return rateLimitedResponse(request, rate, CAPI_ALLOWED_ORIGINS);
      }
      if (request.method === 'OPTIONS' || request.method === 'POST') {
        return handleMetaCapi(request, env);
      }
    }

    return jsonResponse({ ok: false, reason: 'not_found' }, 404, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': 'https://vitametric.com'
    });
  }
};

function jsonResponse(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers });
}

/* ---------------- /api/analytics (params: functions/api/analytics.js) ---------------- */

function analyticsCors(origin) {
  return {
    'Access-Control-Allow-Origin': ANALYTICS_ALLOWED_ORIGINS.includes(origin) ? origin : 'https://vitametric.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

async function handleAnalytics(request, env) {
  const cors = analyticsCors(request.headers.get('Origin') || '');

  // Preflight (en la función Pages vive dentro de onRequestPost).
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    const body = await request.json();
    const submitted = body && Array.isArray(body.batch) ? body.batch : [body];
    if (submitted.length < 1 || submitted.length > MAX_ANALYTICS_BATCH_SIZE) {
      return jsonResponse({ ok: false, reason: 'invalid_batch' }, 400, {
        ...cors,
        'Content-Type': 'application/json'
      });
    }

    const eventNames = [];
    for (const item of submitted) {
      const eventName = item && typeof item === 'object' && !Array.isArray(item)
        ? item.eventName
        : null;
      if (typeof eventName !== 'string' || !ALLOWED_EVENTS.has(eventName)) {
        return jsonResponse({ ok: false, reason: 'event_not_allowed' }, 400, {
          ...cors,
          'Content-Type': 'application/json'
        });
      }
      eventNames.push(eventName);
    }

    for (const eventName of eventNames) {
      if (env && env.VITAMETRIC_ANALYTICS) {
        env.VITAMETRIC_ANALYTICS.writeDataPoint({ blobs: [eventName] });
      } else {
        console.log(JSON.stringify({ event: eventName }));
      }
    }

    return jsonResponse({ ok: true, received: eventNames.length }, 200, {
      ...cors,
      'Content-Type': 'application/json'
    });
  } catch (err) {
    console.error('[analytics] invalid request');
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, {
      ...cors,
      'Content-Type': 'application/json'
    });
  }
}

/* ---------------- /api/meta-capi (params: functions/api/meta-capi.js) ---------------- */

function capiCors(origin) {
  return {
    'Access-Control-Allow-Origin': CAPI_ALLOWED_ORIGINS.includes(origin) ? origin : 'https://vitametric.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

async function handleMetaCapi(request, env) {
  const cors = capiCors(request.headers.get('Origin') || '');

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (!env || !env.META_PIXEL_ID || !env.META_CAPI_TOKEN) {
    return jsonResponse({ ok: false, reason: 'capi_not_configured' }, 503, {
      'Content-Type': 'application/json', ...cors
    });
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse({ ok: false, reason: 'invalid_json' }, 400, {
      'Content-Type': 'application/json', ...cors
    });
  }

  const eventName = typeof payload.eventName === 'string' ? payload.eventName : '';
  if (!ALLOWED_EVENTS.has(eventName)) {
    return jsonResponse({ ok: false, reason: 'event_not_allowed' }, 400, {
      'Content-Type': 'application/json', ...cors
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
         responde 502 graph_unreachable en vez de atorar la invocación. */
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ data: [event] })
    });
    const text = await res.text();
    /* Nunca devolvemos el token ni el cuerpo completo de Graph al front. */
    return jsonResponse({ ok: res.ok, status: res.status, events_received: safeCount(text) }, 200, {
      'Content-Type': 'application/json', ...cors
    });
  } catch (e) {
    return jsonResponse({ ok: false, reason: 'graph_unreachable' }, 502, {
      'Content-Type': 'application/json', ...cors
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
