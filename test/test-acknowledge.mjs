/**
 * Regresión: el acuse determinista del texto libre.
 *
 * Sin modelo cargado, `listen()` devuelve ack=null y la UI callaba: el paciente
 * escribía y no pasaba NADA (reproducido en producción 2026-08-23). La
 * extracción por reglas sí corría — el sistema entendía y no lo decía.
 *
 * El acuse debe existir siempre, repetir las palabras del paciente y no
 * afirmar nada clínico.
 *
 * Correr: node test/test-acknowledge.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const chat = require('../js/triage-chat.js');
const { acknowledgeExtraction, EVIDENCE, FORBIDDEN } = chat;

let ok = 0;
let fail = 0;
const check = (label, cond, detail = '') => {
  if (cond) { ok++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}${detail ? ' → ' + detail : ''}`); }
};

const sintomas = [
  { itemId: 'item_sue_microdespertares', grade: 3, matchedPhrase: 'me despierto de madrugada' },
  { itemId: 'item_ter_acidez_reflujo', grade: 2, matchedPhrase: 'acidez' }
];

// --- A1: siempre hay acuse, incluso sin extraer nada ---
for (const entrada of [[], null, undefined]) {
  const r = acknowledgeExtraction(entrada);
  check(`[A1] hay acuse con entrada ${JSON.stringify(entrada)}`,
    !!(r && typeof r.text === 'string' && r.text.length > 10), JSON.stringify(r));
}

// --- A2: el acuse cita las palabras del paciente ---
{
  const r = acknowledgeExtraction(sintomas);
  check('[A2] cita «me despierto de madrugada»', r.text.includes('«me despierto de madrugada»'), r.text);
  check('[A2] cita «acidez»', r.text.includes('«acidez»'), r.text);
  check('[A2] une con "y" y no deja comas colgando', !/,\s*$/.test(r.text) && r.text.includes(' y '), r.text);
}

// --- A3: no traduce a lenguaje clínico ni nombra itemIds ---
{
  const r = acknowledgeExtraction(sintomas);
  check('[A3] no filtra itemIds al paciente', !r.text.includes('item_'), r.text);
}

// --- A4: no afirma nada prohibido (mismo guardián que el resto del motor) ---
{
  const textos = [acknowledgeExtraction(sintomas).text, acknowledgeExtraction([]).text];
  const prohibidas = (FORBIDDEN || []).filter((p) => {
    const re = p instanceof RegExp ? p : new RegExp(String(p), 'i');
    return textos.some((t) => re.test(t));
  });
  check('[A4] el acuse no dispara el guardián de frases prohibidas',
    prohibidas.length === 0, String(prohibidas));
  check('[A4] no dice "tienes" ni diagnostica',
    !/\btienes\b|\bpadeces\b|\bsufres\b/i.test(textos.join(' ')), textos.join(' | '));
}

// --- A5: la cópula corresponde a la evidencia ---
{
  check('[A5] con síntomas es SELF_REPORT (repite lo que dijo)',
    acknowledgeExtraction(sintomas).evidence === EVIDENCE.SELF_REPORT);
  check('[A5] sin síntomas es NOT_OBSERVABLE (no se afirma nada)',
    acknowledgeExtraction([]).evidence === EVIDENCE.NOT_OBSERVABLE);
}

// --- A6: avisa cuando el modelo aún carga ---
{
  const cargando = acknowledgeExtraction(sintomas, { modelLoading: true }).text;
  const listo = acknowledgeExtraction(sintomas, { modelLoading: false }).text;
  check('[A6] menciona la carga solo cuando corresponde',
    /cargando/i.test(cargando) && !/cargando/i.test(listo));
}

// --- A7: frases repetidas no se duplican en el acuse ---
{
  const r = acknowledgeExtraction([
    { matchedPhrase: 'acidez' }, { matchedPhrase: 'acidez' }, { matchedPhrase: '  ' }
  ]);
  check('[A7] deduplica y descarta vacíos',
    (r.text.match(/«acidez»/g) || []).length === 1, r.text);
}

console.log(`\n── Acuse determinista: ${ok} ok, ${fail} fallos ──`);
process.exit(fail > 0 ? 1 : 0);
