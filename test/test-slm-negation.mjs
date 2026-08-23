/**
 * Regresión: la Cualidad del juicio (Afirmación / Negación / Limitación).
 *
 * `extractSymptoms()` hace `raw.includes(phrase)` sin evaluar la polaridad de
 * la proposición. Una ausencia declarada ("nunca he tenido bruxismo") entra al
 * motor CAT como presencia severa vía `session.answer(itemId, grade)`, y el
 * catch de triage-chat-ui.js es silencioso: no queda rastro.
 *
 * Estos casos DEBEN fallar mientras no exista ventana de negación.
 * Correr: node test/test-slm-negation.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Runtime } = require('../js/slm-runtime.js');

const extract = (t) => Runtime.prototype.extractSymptoms.call({}, t);

const NEGADOS = [
  ['no tengo acidez ni reflujo', 'item_ter_acidez_reflujo'],
  ['ya no me despierto de madrugada', 'item_sue_microdespertares'],
  ['nunca he tenido bruxismo', 'item_aut_bruxismo'],
  ['el doctor descarto reflujo', 'item_ter_acidez_reflujo'],
  ['duermo perfecto sin microdespertares', 'item_sue_microdespertares'],
  ['jamas he sentido taquicardia', 'item_aut_taquicardia']
];

const AFIRMADOS = [
  ['me despierto a las 3am con acidez', 'item_ter_acidez_reflujo'],
  ['tengo mucha tension cervical', 'item_aut_tension_cervical']
];

let ok = 0;
let fail = 0;

for (const [texto, itemId] of NEGADOS) {
  const hit = extract(texto).find((s) => s.itemId === itemId);
  if (hit) {
    fail++;
    console.log(`❌ [N] ausencia declarada inyectada como presencia: ${JSON.stringify(texto)} → ${itemId}:${hit.grade}`);
  } else {
    ok++;
    console.log(`✅ [N] negación respetada: ${JSON.stringify(texto)}`);
  }
}

for (const [texto, itemId] of AFIRMADOS) {
  const hit = extract(texto).find((s) => s.itemId === itemId);
  if (hit) {
    ok++;
    console.log(`✅ [A] afirmación conservada: ${JSON.stringify(texto)} → ${itemId}:${hit.grade}`);
  } else {
    fail++;
    console.log(`❌ [A] falso negativo, la negación se aplicó de más: ${JSON.stringify(texto)}`);
  }
}

console.log(`\n── Polaridad del juicio: ${ok} ok, ${fail} fallos ──`);
process.exit(fail > 0 ? 1 : 0);
