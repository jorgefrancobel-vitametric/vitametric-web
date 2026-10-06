/**
 * Guardia de ontología y marca: ningún dato muerto vuelve al marcado estructurado.
 *
 * Existe porque el JSON-LD de la portada sobrevivió meses desalineado del resto
 * del sitio: declaraba MedicalBusiness y un teléfono (+52-55-5559-2060) que ya
 * nadie reconocía como propio, mientras la capa visible y el footer usaban el
 * número real (+52 55 8532 7421). Google lee el JSON-LD, no el footer: la señal
 * estructurada desalineada contaminaba el panel de conocimiento. La ontología
 * acordada (2026-09-26, commit adc787f) es HealthAndBeautyBusiness / Centro de
 * bienestar, no vocabulario de clínica.
 *
 * Correr: node test/test-ontology-brand.mjs
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');

let ok = 0;
let fail = 0;

// Primera red: el teléfono huérfano no vuelve ni en formato con guiones ni
// con espacios. (Historia: entró en aac83b0 del 2026-06-30 como "update JSON-LD
// phone" y nadie supo decir de dónde salió.)
const TELEFONO_MUERTO = /5559[\s-]?2060/;
if (TELEFONO_MUERTO.test(index)) {
  fail++;
  console.log('❌ [O] index.html: teléfono muerto 5559 2060 presente en el JSON-LD');
} else {
  ok++;
  console.log('✅ [O] index.html: sin teléfono muerto 5559 2060');
}

// Segunda red: la ontología de la portada es la acordada, no MedicalBusiness.
if (/"@type"\s*:\s*"MedicalBusiness"/.test(index)) {
  fail++;
  console.log('❌ [O] index.html: JSON-LD declara MedicalBusiness — debe ser HealthAndBeautyBusiness');
} else if (/"@type"\s*:\s*"HealthAndBeautyBusiness"/.test(index)) {
  ok++;
  console.log('✅ [O] index.html: JSON-LD declara HealthAndBeautyBusiness');
} else {
  fail++;
  console.log('❌ [O] index.html: JSON-LD sin @type de negocio reconocible');
}

// Tercera red: la marca no se degrada a "clínica Vitametric" en fichas de
// producto (convención adc787f: "en Vitametric, CDMX").
for (const f of ['productos/cobre-coloidal.html', 'productos/plata-coloidal.html', 'productos/oro-coloidal.html', 'productos/k21.html', 'productos/immunocal-optimizer.html', 'productos/immunocal-platinum.html', 'productos/immunocal-sport.html', 'productos/xtriva.html']) {
  const html = readFileSync(join(root, f), 'utf8');
  if (/clínica Vitametric/i.test(html)) {
    fail++;
    console.log(`❌ [O] ${f}: dice "clínica Vitametric" — usar "Vitametric"`);
  } else {
    ok++;
    console.log(`✅ [O] ${f}: sin "clínica Vitametric"`);
  }
}

// Cuarta red: el teléfono canónico visible en la portada sigue siendo el real.
if (/\+525585327421/.test(index)) {
  ok++;
  console.log('✅ [O] index.html: teléfono canónico +52 55 8532 7421 presente');
} else {
  fail++;
  console.log('❌ [O] index.html: falta el teléfono canónico +525585327421');
}

console.log(`\n── Ontología y marca: ${ok} ok, ${fail} fallos ──`);
process.exit(fail > 0 ? 1 : 0);
