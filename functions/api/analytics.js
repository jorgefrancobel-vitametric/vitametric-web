/**
 * Vitametric — Analytics Endpoint (Cloudflare Pages Function)
 *
 * Recibe eventos del funnel de la anamnesis conversacional vía sendBeacon.
 * Las métricas se envían a Workers Analytics Engine si está configurada,
 * o se registran en consola como fallback.
 *
 * Ruta: POST /api/analytics
 * Body: JSON con { sessionId, event, timestamp, ... } o { batch: [...] }
 *
 * Headers necesarios en el frontend:
 *   Content-Type: application/json
 */

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

    // Soporte para batch (flushQueue envía { batch: [...] })
    const events = Array.isArray(body.batch) ? body.batch : [body];

    for (const event of events) {
      // Workers Analytics Engine (si está configurada):
      // https://developers.cloudflare.com/analytics/analytics-engine/
      if (env && env.VITAMETRIC_ANALYTICS) {
        env.VITAMETRIC_ANALYTICS.writeDataPoint({
          blobs: [
            event.event || 'unknown',           // event type
            event.sessionId || '',              // session id
            event.variant || 'unknown',          // A/B variant
            event.pageUrl || '',                // page URL
            event.referrer || ''                // referrer
          ],
          doubles: [
            event.timestamp || 0,               // timestamp
            event.elapsedMs || 0,               // elapsed ms
            event.questionNumber || 0,           // question number
            event.totalQuestions || 0,           // total questions
            event.globalScore || 0              // global score
          ],
          indexes: [
            String(event.riskLevel || '')       // risk level
          ]
        });
      }

      // Fallback: log estructurado para Cloudflare Logs
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        session: event.sessionId,
        event: event.event,
        variant: event.variant,
        elapsedMs: event.elapsedMs,
        payload: event
      }));
    }

    return new Response(JSON.stringify({ ok: true, received: events.length }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });

  } catch (err) {
    console.error('[analytics] error:', err && err.message);

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