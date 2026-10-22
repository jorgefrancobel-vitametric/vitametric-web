/**
 * Vitametric — Analytics Endpoint (Cloudflare Pages Function)
 *
 * Solo admite eventos administrativos genéricos. Nunca persiste el cuerpo
 * recibido: acepta el nombre del evento y descarta cualquier otro campo.
 * Ruta: POST /api/analytics
 */

const ALLOWED_EVENTS = new Set(['Contact', 'Lead', 'Schedule']);
const MAX_BATCH_SIZE = 20;

/* VB4/VB10 — cuota de aplicación: 5 POST / 10 s por IP (precedente del
   engagement Casa Tapputi). Va DESPUÉS de las validaciones (un payload
   inválido ya se descarta solo) y ANTES de persistir. Ventana por proceso:
   espejo idéntico en functions/api/meta-capi.js y workers/vitametric-api.mjs. */
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

export async function onRequestPost(context) {
  const { request, env } = context;

  // CORS: permitir POST desde el origen del sitio y desde localhost.
  const origin = request.headers.get('Origin') || '';
  const allowedOrigins = [
    'https://vitametric.com',
    'https://www.vitametric.com',
    'https://vitametric.pages.dev',
    'http://localhost:8080',
    'http://localhost:3000'
  ];

  const corsHeaders = {
    'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : 'https://vitametric.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };

  // Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const submitted = body && Array.isArray(body.batch) ? body.batch : [body];
    if (submitted.length < 1 || submitted.length > MAX_BATCH_SIZE) {
      return new Response(JSON.stringify({ ok: false, reason: 'invalid_batch' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const eventNames = [];
    for (const item of submitted) {
      const eventName = item && typeof item === 'object' && !Array.isArray(item)
        ? item.eventName
        : null;
      if (typeof eventName !== 'string' || !ALLOWED_EVENTS.has(eventName)) {
        return new Response(JSON.stringify({ ok: false, reason: 'event_not_allowed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      eventNames.push(eventName);
    }

    const rate = checkRateLimit(request.headers.get('cf-connecting-ip') || 'unknown');
    if (!rate.allowed) {
      return new Response(JSON.stringify({ ok: false, reason: 'rate_limited' }), {
        status: 429,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(rate.retryAfter)
        }
      });
    }

    for (const eventName of eventNames) {
      if (env && env.VITAMETRIC_ANALYTICS) {
        env.VITAMETRIC_ANALYTICS.writeDataPoint({ blobs: [eventName] });
      } else {
        // Sin binding, no registrar payload, identidad, ruta ni datos del test.
        console.log(JSON.stringify({ event: eventName }));
      }
    }

    return new Response(JSON.stringify({ ok: true, received: eventNames.length }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });

  } catch (err) {
    console.error('[analytics] invalid request');

    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
}

// Exportar también el GET y OPTIONS para que el endpoint responda.
export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return onRequestPost(context);
  }

  if (request.method === 'POST') {
    return onRequestPost(context);
  }

  return new Response(JSON.stringify({ ok: true, service: 'vitametric-analytics' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
