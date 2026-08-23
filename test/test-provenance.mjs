/**
 * Regresión: procedencia de la cópula (self_report vs inferred).
 *
 * Un síntoma deducido del texto libre por reglas NO es algo que el paciente
 * haya señalado. Si ambos entran al motor indistinguibles, el articulador emite
 * "Lo que reportas: …" (articulator.js) sobre una lectura del sistema.
 *
 * Correr: node test/test-provenance.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const chat = require('../js/triage-chat.js');

const createSession = chat.createSession || chat.create || chat.default;

let ok = 0;
let fail = 0;
const check = (label, cond, detail = '') => {
  if (cond) { ok++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}${detail ? ' → ' + detail : ''}`); }
};

// --- P1: el default es self_report (retrocompatibilidad de la API vieja) ---
{
  const s = createSession();
  s.answer('item_aut_bruxismo', 2);
  const st = s.state();
  check('[P1] answer() sin source marca self_report',
    st.answerSources.item_aut_bruxismo === 'self_report',
    JSON.stringify(st.answerSources.item_aut_bruxismo));
  check('[P1] el grade no cambia de forma (sigue escalar)',
    st.answers.item_aut_bruxismo === 2, JSON.stringify(st.answers.item_aut_bruxismo));
}

// --- P2: la marca inferred sobrevive en el estado ---
{
  const s = createSession();
  s.answer('item_aut_bruxismo', 2, 'inferred');
  check('[P2] answer(…, "inferred") queda marcado',
    s.state().answerSources.item_aut_bruxismo === 'inferred');
}

// --- P3: una fuente inválida no se cuela como inferred ---
{
  const s = createSession();
  s.answer('item_aut_bruxismo', 2, 'lo_que_sea');
  check('[P3] source desconocido degrada a self_report, no a inferred',
    s.state().answerSources.item_aut_bruxismo === 'self_report');
}

// --- P4: ítem inexistente sigue lanzando (el catch de la UI debe verlo) ---
{
  const s = createSession();
  let lanzo = false;
  try { s.answer('item_que_no_existe', 2, 'inferred'); } catch (e) { lanzo = true; }
  check('[P4] itemId desconocido lanza y no entra silencioso', lanzo);
}

// --- P5: mezclar procedencias no borra la del paciente ---
{
  const s = createSession();
  s.answer('item_aut_bruxismo', 3);                 // el paciente lo señaló
  s.answer('item_aut_taquicardia', 2, 'inferred');  // el sistema lo dedujo
  const src = s.state().answerSources;
  check('[P5] conviven ambas procedencias sin contaminarse',
    src.item_aut_bruxismo === 'self_report' && src.item_aut_taquicardia === 'inferred',
    JSON.stringify(src));
}

console.log(`\n── Procedencia de la cópula: ${ok} ok, ${fail} fallos ──`);
process.exit(fail > 0 ? 1 : 0);
