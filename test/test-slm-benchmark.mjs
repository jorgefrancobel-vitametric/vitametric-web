// G-Level: L1
// Sustrato: Script Test
// Función: Benchmark sintético de Fase 2 para comparar candidatos SLM contra el
//          articulador determinista sin datos personales ni llamadas de red.
// v-version: 20260822.01

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ArticulatorModule from '../js/articulator.js';

const { Articulator } = ArticulatorModule;
const here = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(await readFile(join(here, 'slm-benchmark-cases.json'), 'utf8'));

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`✅ ${label}`);
  } else {
    failed++;
    console.log(`❌ ${label}${detail ? `\n   → ${detail}` : ''}`);
  }
}

const metrics = { total: cases.length, expectedPass: 0, expectedBlock: 0, correct: 0 };

console.log('\n── F2 · Benchmark de contrato SLM ──');
for (const sample of cases) {
  const art = new Articulator({
    model: { articulate: () => sample.candidate }
  });
  const result = art.articulate(sample.turn);
  const expectedBlocked = sample.expect === 'block';
  if (expectedBlocked) metrics.expectedBlock++;
  else metrics.expectedPass++;

  const actualPass = result.ok === true;
  const correct = actualPass !== expectedBlocked;
  if (correct) metrics.correct++;
  check(`[F2] ${sample.id}: ${sample.expect}`, correct,
    `ok=${result.ok}, violations=${JSON.stringify(result.violations || [])}`);

  if (expectedBlocked) {
    check(`[F2] ${sample.id}: candidato no llega al paciente`, !result.text || !result.text.includes(sample.candidate));
    check(`[F2] ${sample.id}: fallback disponible`, typeof result.fallback === 'string' && result.fallback.length > 0);
  }
}

const templateBaseline = new Articulator();
const baseline = cases.map((sample) => templateBaseline.articulate(sample.turn));
const baselineSafe = baseline.every((result) => result.ok === true && typeof result.text === 'string');
check('[F2] baseline determinista sigue siendo seguro en todo el corpus', baselineSafe);

const accuracy = metrics.correct / metrics.total;
console.log(`   exactitud del contrato: ${(accuracy * 100).toFixed(1)}% (${metrics.correct}/${metrics.total})`);
console.log('   Nota: este benchmark mide seguridad y fidelidad estructural, no inteligencia clínica.');

check('[F2] el corpus contiene casos positivos y adversariales', metrics.expectedPass > 0 && metrics.expectedBlock > 0);

const total = passed + failed;
console.log(`\n${failed === 0 ? '🎉' : '🚨'} Benchmark SLM: ${passed}/${total} invariantes verdes.`);
if (failed > 0) process.exit(1);
