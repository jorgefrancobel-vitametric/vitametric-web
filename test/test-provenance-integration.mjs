/**
 * Integración: la salida REAL del motor no viola el guard de procedencia.
 *
 * test-provenance-guard.mjs prueba que el guard DETECTA. Esta suite prueba lo
 * complementario y es la que puede romperse con cualquier cambio de copy: que
 * lo que el motor efectivamente emite —badge, título, resumen, insight y los
 * nombres de los 5 ejes— está limpio en todas las bandas de riesgo.
 *
 * Correr: node test/test-provenance-integration.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Engine = require('../js/mapa-senales-engine.js');
const { runProvenanceGuards } = require('../js/guards/provenance-guard.js');
const { connectorFor } = require('../js/articulator.js');

let ok = 0, fail = 0;
const check = (label, cond, detail = '') => {
  if (cond) { ok++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}${detail ? ' → ' + detail : ''}`); }
};

/** Responde todas las dimensiones activas con el grado dado. */
function build({ grade = 3, itemsPerDim = 99, baseline = null, skipAxes = [] } = {}) {
  const t = Engine.createInstance();
  if (baseline) t.setBaseline(baseline);
  let guard = 0;
  while (guard++ < 20) {
    const dims = t.getActiveQuestions();
    const pending = dims.filter((d) => t.answers[d.id] === undefined);
    if (!pending.length) break;
    pending.forEach((d) => {
      if (skipAxes.indexOf(d.axis) !== -1) { t.answerDimension(d.id, []); return; }
      t.answerDimension(d.id, d.items.slice(0, itemsPerDim).map((it) => ({ id: it.id, grade })));
    });
  }
  return t.calculateResults();
}

/** Todas las cadenas que el motor expone hacia el paciente. */
function visibleStrings(r) {
  const s = [r.riskBadge, r.riskTitle, r.riskSummary, r.physiologicalInsight];
  (r.sortedAxes || []).forEach((a) => { s.push(a.meta.name, a.meta.shortName, a.meta.description); });
  return s.filter(Boolean);
}

console.log('\n── Salida del motor en cada banda de riesgo ──');

const escenarios = [
  ['óptimo (sin síntomas)', { grade: 1, itemsPerDim: 0 }],
  ['carga baja', { grade: 1, itemsPerDim: 1 }],
  ['carga moderada', { grade: 2, itemsPerDim: 2 }],
  ['carga alta', { grade: 3 }]
];

escenarios.forEach(([nombre, opts]) => {
  const r = build(opts);
  const violaciones = [];
  visibleStrings(r).forEach((text) => {
    const v = runProvenanceGuards(text, r.factMatrix, { mode: 'deterministic' });
    if (!v.ok) violaciones.push(`"${text.slice(0, 60)}" → ${v.violations.join('; ')}`);
  });
  check(`[I1] ${nombre} (${r.riskLevel}): salida sin violaciones`,
    violaciones.length === 0, violaciones.slice(0, 2).join(' | '));
});

console.log('\n── Procedencia de la matriz ──');

{
  const r = build({ grade: 3 });
  check('[I2] la matriz existe y symptomLoad es derived',
    r.factMatrix && r.factMatrix.symptomLoad.provenance === 'derived');
  check('[I3] sin ES-Complex importado, measured es null',
    r.factMatrix.measured === null);
  check('[I4] el motor NO expone magnitudes físicas',
    !('calculated_charge_mv' in r) && !('mitochondrial_reserve_pct' in r)
      && !('globalResilienceScore' in r));
}

{
  const baseline = {
    scanDate: '2026-06-15', device: 'Vector 2',
    axes: { autonomo: { score: 72 }, sueno: { score: 45 }, cardiometabolico: { score: 58 }, terreno: { score: 81 }, ocupacional: { score: 35 } },
    bodyComposition: { intracellularWater: 24.3, extracellularWater: 16.1, phaseAngle: 5.8, bmi: 26.4 }
  };
  const r = build({ grade: 2, baseline });
  check('[I5] con ES-Complex importado, measured se puebla con el ángulo de fase',
    r.factMatrix.measured && r.factMatrix.measured.phaseAngle === 5.8);
  check('[I6] y sólo entonces el léxico de medición es lícito',
    runProvenanceGuards('Tu ángulo de fase es 5.8', r.factMatrix).ok === true);
}

console.log('\n── Ausencia ≠ normalidad ──');

{
  const r = build({ grade: 2, itemsPerDim: 1, skipAxes: ['terreno'] });
  const marcado = (r.factMatrix.responseValidity.lowCountAxes || []).length > 0
    || r.factMatrix.axisSymptomLoad.terreno.provenance === 'absent';
  check('[I7] un eje sin reportes queda marcado, no se toma por sano', marcado,
    JSON.stringify(r.factMatrix.axisSymptomLoad.terreno));

  if ((r.factMatrix.responseValidity.lowCountAxes || []).length > 0) {
    check('[I8] con ejes sin muestra, el motor no enuncia normalidad',
      visibleStrings(r).every((t) => runProvenanceGuards(t, r.factMatrix, { mode: 'deterministic' }).ok));
  } else { ok++; console.log('✅ [I8] n/a — el escenario no dejó ejes con muestra insuficiente'); }
}

console.log('\n── Prioridad de escaneo (fase 4) ──');

{
  const alta = build({ grade: 3 });
  check('[I12] carga alta ⇒ prioridad alta con razones trazables',
    alta.scanPriority.tier === 'alta' && alta.scanPriority.reasons.length > 0,
    `${alta.scanPriority.tier} · ${alta.scanPriority.reasons.length} razones`);

  check('[I13] la prioridad se declara NO calibrada mientras no haya pares',
    alta.scanPriority.calibration === 'uncalibrated');

  check('[I14] toda razón es trazable (kind + detail)',
    alta.scanPriority.reasons.every((r) => r.kind && r.detail));

  // Ausencia≠normalidad también aquí: no reportar nada no es "no hace falta medir".
  const vacio = build({ grade: 1, itemsPerDim: 0 });
  check('[I15] sin síntomas reportados la prioridad NO cae a baja por defecto',
    vacio.scanPriority.reasons.some((r) => r.kind === 'muestra_insuficiente'),
    JSON.stringify(vacio.scanPriority.reasons.map((r) => r.kind)));

  check('[I16] las razones no violan el guard',
    alta.scanPriority.reasons.every((r) =>
      runProvenanceGuards(r.detail, alta.factMatrix, { mode: 'deterministic' }).ok));
}

console.log('\n── Pares de calibración ──');

{
  const t2 = Engine.createInstance();
  t2.setBaseline({
    scanDate: '2026-06-15', device: 'Vector 2',
    axes: { autonomo: { score: 72 } },
    bodyComposition: { phaseAngle: 5.8, intracellularWater: 24.3 }
  });
  Engine.BASE_DIMENSIONS.forEach((d) => t2.answerDimension(d.id, [{ id: d.items[0].id, grade: 2 }]));
  t2.calculateResults();
  const pair = t2.recordCalibrationPair();
  check('[I17] el par une autorreporte y escaneo',
    !!(pair && pair.selfReport.axisScores && pair.scan.bodyComposition.phaseAngle === 5.8));
  check('[I18] sin escaneo importado no hay par que registrar',
    Engine.createInstance().recordCalibrationPair() === null);
  check('[I19] el par no arrastra datos identificables',
    !JSON.stringify(pair).match(/nombre|email|tel[eé]fono|phone/i));
}

console.log('\n── Sincronía de nombres ──');

{
  const axisNames = Object.keys(Engine.AXES).map((k) => Engine.AXES[k].shortName);
  check('[I20] ningún nombre de eje conserva léxico de medición',
    axisNames.every((n) => runProvenanceGuards(n, null, { mode: 'deterministic' }).ok),
    axisNames.join(' · '));
}

console.log('\n── Modo verbal ──');

check('[I9] derived usa cópula de reporte', connectorFor('derived') === 'lo que reportas indica');
check('[I10] measured es el único que habla de medición', connectorFor('measured') === 'tu escaneo muestra');
check('[I11] una procedencia desconocida cae al caso conservador',
  connectorFor('lo-que-sea') === connectorFor('absent'));

console.log(`\n${fail === 0 ? '🎉' : '🔴'} Integración de procedencia: ${ok}/${ok + fail} invariantes verdes.`);
process.exit(fail === 0 ? 0 : 1);
