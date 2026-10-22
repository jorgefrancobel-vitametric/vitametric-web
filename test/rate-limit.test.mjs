import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function load(path) {
  const SRC = await readFile(new URL(path, import.meta.url), 'utf8');
  return import('data:text/javascript;base64,' + Buffer.from(SRC).toString('base64'));
}

const fnMod = await load('../functions/api/analytics.js');
const capiMod = await load('../functions/api/meta-capi.js');
const workerMod = await load('../workers/vitametric-api.mjs');

const ENV_CAPI = { META_PIXEL_ID: '1234567890123456', META_CAPI_TOKEN: 'SECRETO-QUE-NO-DEBE-FUGAR' };
const realFetch = globalThis.fetch;

function analyticsRequest(ip, eventName = 'Contact') {
  return new Request('https://vitametric.com/api/analytics', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://vitametric.com',
      'cf-connecting-ip': ip
    },
    body: JSON.stringify({ eventName })
  });
}

function capiRequest(ip, eventName = 'Lead') {
  return new Request('https://vitametric.com/api/meta-capi', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://vitametric.com',
      'cf-connecting-ip': ip,
      'User-Agent': 'vitametric-test/1.0'
    },
    body: JSON.stringify({ eventName })
  });
}

test('analytics: la 6ª petición válida de la misma IP en 10 s responde 429 con Retry-After', async () => {
  const { onRequestPost } = fnMod;
  const env = {};
  let res;
  for (let i = 0; i < 5; i++) {
    res = await onRequestPost({ request: analyticsRequest('203.0.113.9'), env });
    assert.equal(res.status, 200, 'las primeras 5 deben pasar');
  }
  res = await onRequestPost({ request: analyticsRequest('203.0.113.9'), env });
  assert.equal(res.status, 429);
  const body = await res.json();
  assert.equal(body.reason, 'rate_limited');
  assert.ok(Number(res.headers.get('Retry-After')) >= 1, 'debe indicar cuándo reintentar');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://vitametric.com');
});

test('analytics: una IP distinta no hereda la cuota de otra', async () => {
  const { onRequestPost } = fnMod;
  const res = await onRequestPost({ request: analyticsRequest('203.0.113.77'), env: {} });
  assert.equal(res.status, 200);
});

test('analytics: las validaciones siguen ANTES de la cuota (los inválidos no gastan cupo)', async () => {
  const { onRequestPost } = fnMod;
  for (let i = 0; i < 6; i++) {
    const res = await onRequestPost({ request: analyticsRequest('198.51.100.4', 'QuestionAnswered'), env: {} });
    assert.equal(res.status, 400, 'el evento sigue rechazado por allowlist, no por cuota');
  }
  for (let i = 0; i < 5; i++) {
    const res = await onRequestPost({ request: analyticsRequest('198.51.100.4'), env: {} });
    assert.equal(res.status, 200, 'el cupo sigue íntegro tras los rechazos de validación');
  }
  const blocked = await onRequestPost({ request: analyticsRequest('198.51.100.4'), env: {} });
  assert.equal(blocked.status, 429);
});

test('meta-capi: la cuota corta ANTES de que Graph reciba volumen de una sola IP', async () => {
  const { onRequestPost } = capiMod;
  let graphCalls = 0;
  globalThis.fetch = async () => {
    graphCalls += 1;
    return new Response('{"events_received":1}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    let res;
    for (let i = 0; i < 5; i++) {
      res = await onRequestPost({ request: capiRequest('203.0.113.50'), env: ENV_CAPI });
      assert.equal(res.status, 200);
    }
    assert.equal(graphCalls, 5, 'las primeras 5 llegan a Graph');
    res = await onRequestPost({ request: capiRequest('203.0.113.50'), env: ENV_CAPI });
    assert.equal(res.status, 429);
    assert.equal(graphCalls, 5, 'la 6ª NO toca Graph: la cuota protege la cuota de Meta');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('worker en vivo (espejo): aplica la misma cuota 5/10s', async () => {
  const worker = workerMod.default;
  let res;
  for (let i = 0; i < 5; i++) {
    res = await worker.fetch(analyticsRequest('203.0.113.90'), {}, {});
    assert.equal(res.status, 200, 'las primeras 5 deben pasar en el worker');
  }
  res = await worker.fetch(analyticsRequest('203.0.113.90'), {}, {});
  assert.equal(res.status, 429);
  const body = await res.json();
  assert.equal(body.reason, 'rate_limited');
});

test('worker en vivo: OPTIONS y GET no consumen cupo', async () => {
  const worker = workerMod.default;
  const opts = new Request('https://vitametric.com/api/analytics', {
    method: 'OPTIONS',
    headers: { Origin: 'https://vitametric.com', 'cf-connecting-ip': '203.0.113.91' }
  });
  for (let i = 0; i < 6; i++) {
    const res = await worker.fetch(opts, {}, {});
    assert.notEqual(res.status, 429, 'el preflight nunca debe quedar rate-limiteado');
  }
  const get = await worker.fetch(
    new Request('https://vitametric.com/api/analytics', { headers: { 'cf-connecting-ip': '203.0.113.91' } }),
    {},
    {}
  );
  assert.equal(get.status, 200);
});
