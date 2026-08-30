/**
 * Guard de procedencia: prueba su PODER DE DETECCIÓN.
 *
 * Los fixtures son cadenas que el motor emite HOY (mapa-senales-engine.js), no
 * ejemplos inventados. Así queda probado que el guard detecta las fugas reales
 * antes de que el saneamiento del léxico las retire. Un guard verificado sólo
 * contra texto ya limpio no prueba nada: un guard roto daría el mismo verde.
 *
 * Correr: node test/test-provenance-guard.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { runProvenanceGuards, PROVENANCE } = require('../js/guards/provenance-guard.js');

let ok = 0;
let fail = 0;
const check = (label, cond, detail = '') => {
  if (cond) { ok++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}${detail ? ' → ' + detail : ''}`); }
};

/** Matriz mínima sin medición: el caso por defecto del cuestionario. */
const factsSelfReport = {
  symptomLoad: { value: 43, provenance: PROVENANCE.DERIVED },
  axisSymptomLoad: { autonomo: { value: 61 }, sueno: { value: 28 } },
  responseValidity: { lowCountAxes: [] },
  measured: null
};

/** Matriz con un ES-Complex importado: aquí la magnitud física SÍ es lícita. */
const factsMeasured = {
  ...factsSelfReport,
  measured: { scanDate: '2026-06-15', phaseAngle: 5.8, intracellularWater: 24.3 }
};

console.log('\n── G1 · Léxico de medición sin medición ──');

// Fixtures literales de mapa-senales-engine.js (riskTitle y riskBadge actuales).
check('[G1-a] "Equilibrio Bioeléctrico en Rango Compensatorio" es violación',
  runProvenanceGuards('Equilibrio Bioeléctrico en Rango Compensatorio', factsSelfReport).ok === false);

check('[G1-b] "Carga Celular Baja 🟢" es violación',
  runProvenanceGuards('Carga Celular Baja 🟢', factsSelfReport).ok === false);

check('[G1-c] "Carga Celular Moderada 🟡" es violación',
  runProvenanceGuards('Carga Celular Moderada 🟡', factsSelfReport).ok === false);

check('[G1-d] "reactividad neurovegetativa" (subtitle :196) es violación',
  runProvenanceGuards('Permite estimar la reactividad neurovegetativa y la sobrecarga simpática sostenida.',
    factsSelfReport).ok === false);

check('[G1-e] "susceptibilidad metabólica preclínica" (subtitle :267) es violación',
  runProvenanceGuards('Analiza la estabilidad energética postprandial y la carga de susceptibilidad metabólica preclínica.',
    factsSelfReport).ok === false);

check('[G1-f] "fascia y tono muscular" (subtitle :343) es violación',
  runProvenanceGuards('Evalúa el impacto del sedentarismo prolongado en la fascia y tono muscular.',
    factsSelfReport).ok === false);

check('[G1-g] el mismo léxico es LÍCITO con un ES-Complex importado',
  runProvenanceGuards('Tu ángulo de fase medido es de 5.8', factsMeasured).ok === true,
  JSON.stringify(runProvenanceGuards('Tu ángulo de fase medido es de 5.8', factsMeasured).violations));

// El copy de marca del sitio NO es una afirmación del instrumento.
check('[G1-h] "nutrición celular" (copy de producto) NO es violación',
  runProvenanceGuards('Immunocal apoya la nutrición celular.', factsSelfReport).ok === true,
  JSON.stringify(runProvenanceGuards('Immunocal apoya la nutrición celular.', factsSelfReport).violations));

check('[G1-i] la prosa ya saneada del motor NO es violación',
  runProvenanceGuards('Esto es el patrón que tú reportas, no una medición: el paso siguiente es objetivarlo.',
    factsSelfReport, { mode: 'deterministic' }).ok === true,
  JSON.stringify(runProvenanceGuards('Esto es el patrón que tú reportas, no una medición: el paso siguiente es objetivarlo.',
    factsSelfReport, { mode: 'deterministic' }).violations));

console.log('\n── G2 · Integridad numérica (la v1 la dejó decorativa) ──');

check('[G2-a] un número ausente de la matriz es violación',
  runProvenanceGuards('Tu resultado es 87.', factsSelfReport).ok === false);

check('[G2-b] un número presente en la matriz pasa',
  runProvenanceGuards('Lo que reportas suma 43.', factsSelfReport).ok === true,
  JSON.stringify(runProvenanceGuards('Lo que reportas suma 43.', factsSelfReport).violations));

check('[G2-c] un valor anidado de la matriz también pasa',
  runProvenanceGuards('El eje de tensión suma 61.', factsSelfReport).ok === true,
  JSON.stringify(runProvenanceGuards('El eje de tensión suma 61.', factsSelfReport).violations));

check('[G2-d] modo determinista omite G2 (el motor cita su propio catálogo)',
  runProvenanceGuards('4 o más veces por semana.', factsSelfReport, { mode: 'deterministic' }).ok === true);

// Regresión: G2 condenaba todo número cuando no había matriz que consultar,
// bloqueando prosa legítima del articulador ("Descanso 61/100"). Un guard que
// no puede juzgar se abstiene — el error simétrico del que este módulo impide.
check('[G2-e] sin matriz, G2 se ABSTIENE en vez de condenar',
  runProvenanceGuards('Tu foco es Descanso (61/100).', null).ok === true,
  JSON.stringify(runProvenanceGuards('Tu foco es Descanso (61/100).', null).violations));

check('[G2-f] sin matriz, el veto de léxico SIGUE activo',
  runProvenanceGuards('Tu carga celular es alta.', null).ok === false);

check('[G2-g] con matriz mínima, G2 vuelve a juzgar',
  runProvenanceGuards('Descanso 87/100.', { axisSymptomLoad: { sueno: { value: 61 } } }).ok === false);

console.log('\n── G3 · Ausencia ≠ normalidad ──');

const factsLowCount = {
  ...factsSelfReport,
  responseValidity: { lowCountAxes: ['terreno', 'ocupacional'] }
};

check('[G3-a] "en rango" con ejes sin muestra es violación',
  runProvenanceGuards('Lo que reportas se ubica en rango.', factsLowCount).ok === false);

check('[G3-b] "todo bien" con ejes sin muestra es violación',
  runProvenanceGuards('Todo bien por ahora.', factsLowCount).ok === false);

check('[G3-c] sin ejes vacíos, "en rango" es lícito',
  runProvenanceGuards('Lo que reportas se ubica en rango.', factsSelfReport).ok === true,
  JSON.stringify(runProvenanceGuards('Lo que reportas se ubica en rango.', factsSelfReport).violations));

console.log('\n── G4 · Modo verbal ──');

check('[G4-a] "tienes" sobre auto-reporte es violación',
  runProvenanceGuards('Tienes sobrecarga en el eje de descanso.', factsSelfReport).ok === false);

check('[G4-b] "presentas" sobre auto-reporte es violación',
  runProvenanceGuards('Presentas fatiga sostenida.', factsSelfReport).ok === false);

check('[G4-c] "lo que reportas indica" es la forma correcta',
  runProvenanceGuards('Lo que reportas indica tensión sostenida.', factsSelfReport).ok === true,
  JSON.stringify(runProvenanceGuards('Lo que reportas indica tensión sostenida.', factsSelfReport).violations));

console.log('\n── Contrato de entrada ──');

check('[C-a] texto vacío no rompe el guard',
  runProvenanceGuards('', factsSelfReport).ok === true);

check('[C-b] facts nulo no rompe el guard',
  runProvenanceGuards('Lo que reportas indica tensión.', null).ok === true);

console.log(`\n${fail === 0 ? '🎉' : '🔴'} Guard de procedencia: ${ok}/${ok + fail} invariantes verdes.`);
process.exit(fail === 0 ? 0 : 1);
