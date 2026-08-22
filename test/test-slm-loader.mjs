// G-Level: L1
// Sustrato: Script Test
// Función: Falsadores del contrato de slots protegidos del loader WebLLM.
// v-version: 20260822.02

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = await readFile(join(here, '../js/slm-webllm-loader.js'), 'utf8');

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

check('[L1] loader usa slots protegidos', source.includes('[[SLOT_'));
check('[L1] loader reinyecta slots literalmente', source.includes('restoreSlots'));
check('[L1] loader rechaza slots ausentes o duplicados', source.includes('occurrences !== 1'));
check('[L1] loader rechaza marcadores residuales', source.includes('SLOT_\\d'));
check('[L1] loader limita la generación editorial', source.includes('MAX_TOKENS = 120'));
check('[L1] loader usa temperatura baja', source.includes('temperature: 0.05'));
check('[L1] loader conserva frontera NOT_OBSERVABLE', source.includes('evidence === \'NOT_OBSERVABLE\''));
check('[L1] loader no descarga al registrarse', !source.includes('CreateWebWorkerMLCEngine(worker, selectedModel') || source.includes('async function load'));

const total = passed + failed;
console.log(`\n${failed === 0 ? '🎉' : '🚨'} Loader SLM: ${passed}/${total} invariantes verdes.`);
if (failed > 0) process.exit(1);
