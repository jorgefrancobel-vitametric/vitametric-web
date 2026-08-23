/**
 * Regresión: el boost de confianza por enlaces causales.
 *
 * `interpretation.read({causalLinks})` sube la confianza de una constelación un
 * nivel (WEAK→MODERATE, MODERATE→STRONG) cuando el paciente describió una
 * relación causal entre ítems de dos ejes de esa constelación.
 *
 * El pipeline llegó a producción sin una sola prueba: `causalLinks` nació como
 * código muerto, y cuando se le dio consumidor nadie fijó su semántica. Esto
 * mueve la confianza de una lectura CLÍNICA, así que la red importa.
 *
 * Correr: node test/test-causal-boost.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Interp = require('../js/interpretation.js');
const chat = require('../js/triage-chat.js');

const { CONSTELLATIONS, CONFIDENCE, read } = Interp;

let ok = 0;
let fail = 0;
const check = (label, cond, detail = '') => {
  if (cond) { ok++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}${detail ? ' → ' + detail : ''}`); }
};

// Ítems por eje, derivados del catálogo real (no de convenciones de prefijo).
const catalogo = chat.buildCatalog();
const itemsPorEje = {};
catalogo.forEach((it) => {
  Object.keys(it.weights || {}).forEach((eje) => {
    (itemsPorEje[eje] = itemsPorEje[eje] || []).push(it.id);
  });
});

// Constelación de 2+ ejes sin requisitos de eje bajo (la más simple de disparar).
const c = CONSTELLATIONS.find((x) => x.axes.length >= 2 && !(x.requiresLow || []).length
  && x.axes.every((a) => (itemsPorEje[a] || []).length));

if (!c) {
  console.log('❌ [C0] no hay constelación de 2+ ejes con ítems — el test no puede correr');
  process.exit(1);
}
console.log(`ℹ️  constelación bajo prueba: ${c.id} (${c.axes.join(' + ')})`);

// Estimates que la disparan: theta alto y se bajo → base MODERATE.
const estimates = {};
c.axes.forEach((a) => { estimates[a] = { theta: 1.0, se: 0.5, scale: 'alta' }; });

const answers = {};
c.axes.forEach((a) => { answers[itemsPorEje[a][0]] = 3; });

const patronDe = (causalLinks) => {
  const r = read({ answers, estimates, causalLinks });
  return (r.patterns || []).find((p) => p.constellation === c.id);
};

const ejeA = c.axes[0];
const ejeB = c.axes[1];
const itemA = itemsPorEje[ejeA][0];
const itemB = itemsPorEje[ejeB][0];

// --- C1: sin enlaces, la confianza es la base (retrocompatible) ---
{
  const p = patronDe([]);
  check('[C1] la constelación se dispara sin causalLinks', !!p);
  check('[C1] sin enlaces la confianza es MODERATE (base)',
    p && p.confidence === CONFIDENCE.MODERATE, p && p.confidence);
  check('[C1] causalLinks ausente se comporta igual que vacío',
    read({ answers, estimates }).patterns.find((x) => x.constellation === c.id).confidence
      === CONFIDENCE.MODERATE);
}

// --- C2: enlace causal explícito refuerza, pero NO establece ---
{
  const p = patronDe([{ fromItemId: itemA, toItemId: itemB, connector: 'me provoca', confidence: 0.8 }]);
  check('[C2] un nexo explícito NO lleva a STRONG (techo deliberado)',
    p && p.confidence !== CONFIDENCE.STRONG, p && p.confidence);
  check('[C2] la lectura se sostiene en MODERATE',
    p && p.confidence === CONFIDENCE.MODERATE, p && p.confidence);
}

// --- C3: enlace dentro del MISMO eje no boostea ---
{
  const dosDelMismoEje = itemsPorEje[ejeA].slice(0, 2);
  if (dosDelMismoEje.length === 2) {
    const p = patronDe([{ fromItemId: dosDelMismoEje[0], toItemId: dosDelMismoEje[1], confidence: 0.9 }]);
    check('[C3] enlace intra-eje NO boostea (no cruza nada)',
      p && p.confidence === CONFIDENCE.MODERATE, p && p.confidence);
  } else {
    check('[C3] hay 2 ítems en el mismo eje para probarlo', false, ejeA);
  }
}

// --- C4: enlace entre ejes ajenos a la constelación no boostea ---
{
  const ajeno = Object.keys(itemsPorEje).find((e) => !c.axes.includes(e));
  if (ajeno) {
    const p = patronDe([{ fromItemId: itemsPorEje[ajeno][0], toItemId: itemA, confidence: 0.9 }]);
    check('[C4] enlace con un eje ajeno NO boostea la constelación',
      p && p.confidence === CONFIDENCE.MODERATE, p && p.confidence);
  }
}

// --- C5: itemIds desconocidos no rompen ni boostean ---
{
  let lanzo = false;
  let p = null;
  try { p = patronDe([{ fromItemId: 'item_inexistente', toItemId: 'otro_inexistente' }]); }
  catch (e) { lanzo = true; }
  check('[C5] itemIds desconocidos no lanzan', !lanzo);
  check('[C5] itemIds desconocidos no boostean', p && p.confidence === CONFIDENCE.MODERATE);
}

// --- C6: la confianza del enlace SÍ decide (decisión de Jorge, 2026-08-23) ---
// Antes se ignoraba: 0.1 promovía igual que 0.99. Ahora solo los nexos causales
// explícitos (>= 0.8) refuerzan; los temporales quedan fuera.
{
  const temporal = patronDe([{ fromItemId: itemA, toItemId: itemB, connector: 'tras', confidence: 0.4 }]);
  check('[C6] un nexo temporal (0.4) NO refuerza — no es post hoc ergo propter hoc',
    temporal && temporal.confidence === CONFIDENCE.MODERATE, temporal && temporal.confidence);

  const sinConfidence = patronDe([{ fromItemId: itemA, toItemId: itemB }]);
  check('[C6] un enlace sin confidence no refuerza (conservador por defecto)',
    sinConfidence && sinConfidence.confidence === CONFIDENCE.MODERATE);
}

// --- C7: extremo a extremo con el extractor real ---
// La graduación vive en slm-runtime y el umbral en interpretation: si se
// desincronizan, el pipeline entero deja de discriminar sin que nadie lo note.
{
  const rt = require('../js/slm-runtime.js');
  const extract = (t) => rt.Runtime.prototype.extractCausalLinks.call(Object.create(rt.Runtime.prototype), t);

  const explicito = extract('la acidez me provoca microdespertares');
  const temporal = extract('me despierto de madrugada y tras eso tengo acidez');

  check('[C7] el extractor marca el nexo explícito por encima del umbral',
    explicito.length > 0 && explicito.every((l) => l.confidence >= 0.8),
    JSON.stringify(explicito.map((l) => l.connector + ':' + l.confidence)));
  check('[C7] el extractor marca el nexo temporal por debajo del umbral',
    temporal.length > 0 && temporal.every((l) => l.confidence < 0.8),
    JSON.stringify(temporal.map((l) => l.connector + ':' + l.confidence)));
  check('[C7] ambos siguen extrayéndose (la información no se pierde, se gradúa)',
    explicito.length > 0 && temporal.length > 0);
}

// --- C8: el refuerzo SIGUE VIVO (no se "arregló" desactivándolo) ---
// Base WEAK (se alto) + nexo explícito debe subir a MODERATE. Sin este caso, un
// boost inerte pasaría por correcto en todos los tests anteriores.
{
  const estimatesWeak = {};
  c.axes.forEach((a) => { estimatesWeak[a] = { theta: 1.0, se: 0.9, scale: 'alta' }; });
  const patronWeak = (links) => {
    const r = read({ answers, estimates: estimatesWeak, causalLinks: links });
    return (r.patterns || []).find((p) => p.constellation === c.id);
  };

  const sinNexo = patronWeak([]);
  check('[C8] con se alto la base es WEAK',
    sinNexo && sinNexo.confidence === CONFIDENCE.WEAK, sinNexo && sinNexo.confidence);

  const conNexo = patronWeak([{ fromItemId: itemA, toItemId: itemB, connector: 'me provoca', confidence: 0.8 }]);
  check('[C8] un nexo explícito SÍ refuerza WEAK → MODERATE (el boost sigue vivo)',
    conNexo && conNexo.confidence === CONFIDENCE.MODERATE, conNexo && conNexo.confidence);

  const conTemporal = patronWeak([{ fromItemId: itemA, toItemId: itemB, connector: 'tras', confidence: 0.4 }]);
  check('[C8] un nexo temporal no refuerza ni siquiera desde WEAK',
    conTemporal && conTemporal.confidence === CONFIDENCE.WEAK, conTemporal && conTemporal.confidence);
}

console.log(`\n── Boost causal de constelaciones: ${ok} ok, ${fail} fallos ──`);
process.exit(fail > 0 ? 1 : 0);
