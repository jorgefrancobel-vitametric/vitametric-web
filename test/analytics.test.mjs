import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import worker from '../workers/vitametric-api.mjs';

const FUNCTION_SRC = await readFile(new URL('../functions/api/analytics.js', import.meta.url), 'utf8');
const BEACON_SRC = await readFile(new URL('../js/analytics-beacon.js', import.meta.url), 'utf8');
const pages = await import('data:text/javascript;base64,' + Buffer.from(FUNCTION_SRC).toString('base64'));

const OLD_QUIZ_EVENT = {
  event: 'test_result',
  sessionId: 'patient-session-123',
  pageUrl: 'https://vitametric.com/mapa-de-senales-chat.html',
  referrer: 'https://example.invalid/',
  questionNumber: 12,
  itemId: 'sleep',
  grade: 4,
  axis: 'wellness',
  globalScore: 87,
  riskLevel: 'alto'
};

function request(body, path = '/api/analytics') {
  return new Request('https://vitametric.com' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://vitametric.com' },
    body: JSON.stringify(body)
  });
}

test('Pages Function rechaza el formato anterior del cuestionario sin persistirlo', async () => {
  const points = [];
  const logs = [];
  const originalLog = console.log;
  console.log = (line) => logs.push(String(line));
  try {
    const response = await pages.onRequestPost({
      request: request(OLD_QUIZ_EVENT),
      env: { VITAMETRIC_ANALYTICS: { writeDataPoint: (point) => points.push(point) } }
    });
    assert.equal(response.status, 400);
    assert.equal(points.length, 0);
    assert.equal(logs.length, 0);
  } finally {
    console.log = originalLog;
  }
});

test('Pages Function conserva solo el nombre permitido del evento', async () => {
  const points = [];
  const response = await pages.onRequestPost({
    request: request({ ...OLD_QUIZ_EVENT, eventName: 'Contact' }),
    env: { VITAMETRIC_ANALYTICS: { writeDataPoint: (point) => points.push(point) } }
  });
  assert.equal(response.status, 200);
  assert.deepEqual(points, [{ blobs: ['Contact'] }]);
});

test('Worker rechaza eventos de cuestionario y no registra payloads inválidos', async () => {
  const logs = [];
  const originalLog = console.log;
  console.log = (line) => logs.push(String(line));
  try {
    const response = await worker.fetch(request(OLD_QUIZ_EVENT), {});
    assert.equal(response.status, 400);
    assert.equal(logs.length, 0);
  } finally {
    console.log = originalLog;
  }
});

test('Worker guarda únicamente Contact aunque reciba campos adicionales', async () => {
  const points = [];
  const response = await worker.fetch(request({ ...OLD_QUIZ_EVENT, eventName: 'Contact' }), {
    VITAMETRIC_ANALYTICS: { writeDataPoint: (point) => points.push(point) }
  });
  assert.equal(response.status, 200);
  assert.deepEqual(points, [{ blobs: ['Contact'] }]);
});

test('un batch con un evento no permitido se rechaza completo', async () => {
  const points = [];
  const response = await worker.fetch(request({
    batch: [{ eventName: 'Lead' }, OLD_QUIZ_EVENT]
  }), { VITAMETRIC_ANALYTICS: { writeDataPoint: (point) => points.push(point) } });
  assert.equal(response.status, 400);
  assert.equal(points.length, 0);
});

test('el beacon viejo queda inerte incluso si el HTML de una pestaña está en caché', () => {
  const self = {};
  vm.runInNewContext(BEACON_SRC, { self });
  assert.equal(self.VitametricAnalytics.trackStart(), false);
  assert.equal(self.VitametricAnalytics.trackQuestionAnswered('sleep', 4, 'wellness'), false);
  assert.equal(self.VitametricAnalytics.trackResult('alto', 87, []), false);
  assert.doesNotMatch(BEACON_SRC, /sendBeacon|question_answered|globalScore|riskLevel|pageUrl|referrer/);
});
