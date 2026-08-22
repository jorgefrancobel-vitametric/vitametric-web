// G-Level: L1
// Sustrato: Script Test
// Función: Falsadores del contrato de slots protegidos del loader WebLLM.
// v-version: 20260822.03

import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = await readFile(join(here, '../js/slm-webllm-loader.js'), 'utf8');
const sandbox = {
  window: {},
  module: { exports: {} },
  URL: { createObjectURL: () => 'blob:test' },
  Blob: class Blob {}
};
vm.runInNewContext(source, sandbox);
const { protectSource, promptFor, restoreSlots } = sandbox.module.exports;

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

const boundary = 'Medir qué ocurre físicamente requiere evaluación en clínica.';
const protectedInput = protectSource(
  `Área: Calidad de Sueño: 11 de 100. ${boundary}`,
  ['Calidad de Sueño', '11 de 100', boundary]
);

check('[L1] protectSource genera slots', protectedInput.slots.length === 3
  && protectedInput.text.includes('[[SLOT_'));
check('[L1] restoreSlots reinyecta un slot omitido',
  restoreSlots('Texto editorial.', [{ marker: '[[SLOT_0]]', value: '11 de 100' }], { type: 'RESULT' })
    .includes('11 de 100'));
check('[L1] restoreSlots bloquea slots duplicados',
  restoreSlots('[[SLOT_0]] y [[SLOT_0]]', [{ marker: '[[SLOT_0]]', value: '11 de 100' }], { type: 'RESULT' }) === '');
check('[L1] una salida cruda vacía no se rescata con slots',
  restoreSlots('', [{ marker: '[[SLOT_0]]', value: '11 de 100' }], { type: 'RESULT' }) === '');
check('[L1] una pregunta sin signos cae a fallback editorial',
  restoreSlots('Una afirmación.', [], { type: 'QUESTION', text: '¿Cómo te sientes?' }) === '');
check('[L1] prompt editorial usa texto base',
  promptFor({ turn: { type: 'QUESTION', text: '¿Cómo te sientes?' }, claims: [], locked: [] }).prompt.includes('¿Cómo te sientes?'));
check('[L1] prompt editorial diferencia preguntas',
  promptFor({ turn: { type: 'QUESTION', text: '¿Cómo te sientes?' }, claims: [], locked: [] }).prompt.includes('conserva su intención'));
check('[L1] loader limita la generación editorial', source.includes('MAX_TOKENS = 120'));
check('[L1] loader usa temperatura baja', source.includes('temperature: 0.05'));
check('[L1] loader no descarga al registrarse', source.includes('async function load'));

const total = passed + failed;
console.log(`\n${failed === 0 ? '🎉' : '🚨'} Loader SLM: ${passed}/${total} invariantes verdes.`);
if (failed > 0) process.exit(1);
