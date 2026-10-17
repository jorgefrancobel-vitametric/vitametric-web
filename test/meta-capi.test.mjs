import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const SRC = await readFile(new URL('../functions/api/meta-capi.js', import.meta.url), 'utf8');
const mod = await import('data:text/javascript;base64,' + Buffer.from(SRC).toString('base64'));
const { onRequestPost, onRequestOptions } = mod;

function req(body, { origin = 'https://vitametric.com', ip = '200.1.2.3', ua = 'vitametric-test/1.0' } = {}) {
  return new Request('https://vitametric.com/api/meta-capi', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      'cf-connecting-ip': ip,
      'User-Agent': ua
    },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

const ENV = { META_PIXEL_ID: '1234567890123456', META_CAPI_TOKEN: 'SECRETO-QUE-NO-DEBE-FUGAR' };
const NOENV = { META_PIXEL_ID: '', META_CAPI_TOKEN: '' };

let lastFetch = null;
const realFetch = globalThis.fetch;

function stubGraph(responseBody = '{"events_received":1}') {
  globalThis.fetch = async (url, opts) => {
    lastFetch = { url, opts };
    return new Response(responseBody, { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

test('sin variables de entorno responde 503 y no toca a Meta', async () => {
  stubGraph();
  lastFetch = null;
  const res = await onRequestPost({ request: req({ eventName: 'Lead' }), env: NOENV });
  assert.equal(res.status, 503);
  assert.equal(lastFetch, null);
  globalThis.fetch = realFetch;
});

test('body inválido responde 400', async () => {
  const res = await onRequestPost({ request: req('no es json'), env: ENV });
  assert.equal(res.status, 400);
});

test('eventos fuera de la lista permitida se rechazan', async () => {
  for (const eventName of ['Purchase', 'hack', '', 'LEAD']) {
    const res = await onRequestPost({ request: req({ eventName }), env: ENV });
    assert.equal(res.status, 400, 'debía rechazar ' + JSON.stringify(eventName));
  }
});

test('evento permitido llega a Graph con IP, fbp, fbc, dedup y custom_data saneados', async () => {
  stubGraph();
  const res = await onRequestPost({
    request: req({
      eventName: 'CompleteRegistration',
      eventId: 'abc-123',
      fbp: 'fb.1.1700000000000.123',
      fbc: 'fb.1.1700000000000.AbCdEf',
      value: 999,
      currency: 'MXN',
      contentName: 'Mapa de Senales',
      sourceUrl: 'https://vitametric.com/mapa-de-senales.html'
    }),
    env: ENV
  });

  assert.equal(res.status, 200);
  const text = await res.text();
  const out = JSON.parse(text);
  assert.equal(out.ok, true);
  assert.equal(out.events_received, 1);

  const [u, o] = [lastFetch.url, JSON.parse(lastFetch.opts.body)];
  assert.ok(u.includes('/1234567890123456/events'), 'usaba el pixel configurado');
  assert.ok(u.includes('access_token=' + encodeURIComponent(ENV.META_CAPI_TOKEN)), 'token como query param');
  const ev = o.data[0];
  assert.equal(ev.event_name, 'CompleteRegistration');
  assert.equal(ev.action_source, 'website');
  assert.equal(ev.event_id, 'abc-123');
  assert.equal(ev.user_data.client_ip_address, '200.1.2.3');
  assert.equal(ev.user_data.fbp, 'fb.1.1700000000000.123');
  assert.equal(ev.user_data.fbc, 'fb.1.1700000000000.AbCdEf');
  assert.deepEqual(ev.custom_data, { value: 999, currency: 'MXN', content_name: 'Mapa de Senales' });
  assert.ok(!text.includes(ENV.META_CAPI_TOKEN), 'la respuesta nunca filtra el token');
  globalThis.fetch = realFetch;
});

test('valores inválidos de value/currency/fbp se descartan, no se inventan', async () => {
  stubGraph();
  await onRequestPost({
    request: req({ eventName: 'Lead', value: '999', currency: 'pesos', fbp: 'no-fbp' }),
    env: ENV
  });
  const ev = JSON.parse(lastFetch.opts.body).data[0];
  assert.equal(ev.custom_data, undefined);
  assert.equal(ev.user_data.fbp, undefined);
  globalThis.fetch = realFetch;
});

test('el preflight OPTIONS devuelve 204 con CORS del propio dominio', async () => {
  const res = await onRequestOptions({ request: req({}, { origin: 'https://vitametric.com' }) });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://vitametric.com');
  const otro = await onRequestOptions({ request: req({}, { origin: 'https://ejemplo.com' }) });
  assert.equal(otro.headers.get('Access-Control-Allow-Origin'), 'https://vitametric.com');
});
