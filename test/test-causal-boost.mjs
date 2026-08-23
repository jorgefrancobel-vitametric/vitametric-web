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

// --- C2: enlace entre los dos ejes de la constelación → sube un nivel ---
{
  const p = patronDe([{ fromItemId: itemA, toItemId: itemB, connector: 'porque', confidence: 0.6 }]);
  check('[C2] enlace cruzando los ejes de la constelación sube a STRONG',
    p && p.confidence === CONFIDENCE.STRONG, p && p.confidence);
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

// --- C6: OBSERVACIÓN — la confianza del enlace se ignora ---
// Documenta el comportamiento actual: un enlace extraído por regex con
// confidence 0.1 promueve igual que uno de 0.9. Si se decide exigir un umbral,
// este test debe cambiar CONSCIENTEMENTE, no por accidente.
{
  const debil = patronDe([{ fromItemId: itemA, toItemId: itemB, confidence: 0.1 }]);
  const fuerte = patronDe([{ fromItemId: itemA, toItemId: itemB, confidence: 0.99 }]);
  check('[C6] hoy el boost IGNORA link.confidence (0.1 promueve igual que 0.99)',
    debil && fuerte && debil.confidence === fuerte.confidence,
    `${debil && debil.confidence} vs ${fuerte && fuerte.confidence}`);
}

console.log(`\n── Boost causal de constelaciones: ${ok} ok, ${fail} fallos ──`);
process.exit(fail > 0 ? 1 : 0);
