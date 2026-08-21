/**
 * Vitametric — Suite Automatizada de Pruebas Clínicas E2E
 * Valida la exactitud fisiológica, el branching dinámico y el cálculo de cohortes sintéticas.
 */

const Engine = require('../js/test-celular-engine.js');

function runCohortTests() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('   VITAMETRIC — SUITE DE PRUEBAS DE AUDITORÍA CLÍNICA');
  console.log('════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName} — ${details}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // COHORTE 1: Paciente Asintomático / Preventivo
  // -------------------------------------------------------------
  console.log('▶ Evaluando Cohorte 1: Paciente Asintomático / Preventivo...');
  const t1 = Engine.createInstance();
  t1.activeQuestions.forEach(q => t1.answerQuestion(q.id, 0));
  const r1 = t1.calculateResults();

  assert(r1.globalChargeScore === 0, 'Score de carga global es 0');
  assert(r1.riskLevel === 'bajo', 'Nivel de riesgo clasificado como bajo');
  assert(r1.totalQuestionsAnswered === 7, 'Exactamente 7 preguntas respondidas (sin branching activado)');
  assert(t1.getQuestionsCount() === 7, 'Banco activo permanece en 7 preguntas');
  assert(r1.globalResilienceScore === 100, 'Resiliencia celular al 100%');

  // -------------------------------------------------------------
  // COHORTE 2: Paciente con Apnea del Sueño & Simpaticotonía
  // -------------------------------------------------------------
  console.log('\n▶ Evaluando Cohorte 2: Apnea del Sueño & Simpaticotonía Crónica...');
  const t2 = Engine.createInstance();
  t2.answerQuestion('q1_energia_matutina', 3); // Cansancio severo
  t2.answerQuestion('q2_niebla_mental', 1);
  t2.answerQuestion('q3_salud_digestiva', 0);
  t2.answerQuestion('q4_retencion_microcirculacion', 1);
  t2.answerQuestion('q5_sedentarismo_pantallas', 1);
  t2.answerQuestion('q6_tension_estres', 3); // Tensión y bruxismo severo
  t2.answerQuestion('q7_antecedentes_metabolicos', 0);

  // Debe haberse activado branch_apnea_sueno
  assert(t2.activeQuestions.some(q => q.id === 'q_cond_apnea_sueno'), 'Branching activado: STOP-BANG (q_cond_apnea_sueno)');
  assert(!t2.activeQuestions.some(q => q.id === 'q_cond_inflamacion_metabolica'), 'Rama de inflamación no activada indebidamente');

  t2.answerQuestion('q_cond_apnea_sueno', 3); // Ronquido severo reportado
  const r2 = t2.calculateResults();

  assert(r2.riskLevel === 'alto', 'Nivel clasificado como alto riesgo');
  assert(r2.axisScores.sueno >= 65, `Eje Sueño en sobrecarga severa (${r2.axisScores.sueno}/100)`);
  assert(r2.axisScores.autonomo >= 55, `Eje Autónomo en sobrecarga funcional (${r2.axisScores.autonomo}/100)`);
  assert(r2.dominantAxis1.id === 'sueno' || r2.dominantAxis1.id === 'autonomo', 'Eje dominante identificado en esfera neurovegetativa');

  // -------------------------------------------------------------
  // COHORTE 3: Paciente con Riesgo Metabólico & Sedentarismo
  // -------------------------------------------------------------
  console.log('\n▶ Evaluando Cohorte 3: Riesgo Cardiometabólico & Sedentarismo...');
  const t3 = Engine.createInstance();
  t3.answerQuestion('q1_energia_matutina', 1);
  t3.answerQuestion('q2_niebla_mental', 3); // Somnolencia vespertina severa
  t3.answerQuestion('q3_salud_digestiva', 3); // Disbiosis y distensión
  t3.answerQuestion('q4_retencion_microcirculacion', 2);
  t3.answerQuestion('q5_sedentarismo_pantallas', 3); // >8h sentado
  t3.answerQuestion('q6_tension_estres', 1);
  t3.answerQuestion('q7_antecedentes_metabolicos', 3); // Múltiples familiares diabéticos/hipertensos

  assert(t3.activeQuestions.some(q => q.id === 'q_cond_inflamacion_metabolica'), 'Branching activado: Microinflamación (q_cond_inflamacion_metabolica)');
  t3.answerQuestion('q_cond_inflamacion_metabolica', 3);
  const r3 = t3.calculateResults();

  assert(r3.riskLevel === 'alto', 'Nivel de riesgo alto por factores metabólicos');
  assert(r3.axisScores.cardiometabolico >= 70, `Eje Cardiometabólico sobrecargado (${r3.axisScores.cardiometabolico}/100)`);
  assert(r3.axisScores.terreno >= 65, `Eje Terreno/ipH sobrecargado (${r3.axisScores.terreno}/100)`);
  assert(r3.axisScores.ocupacional >= 70, `Eje Ocupacional sobrecargado (${r3.axisScores.ocupacional}/100)`);

  // -------------------------------------------------------------
  // COHORTE 4: Paciente con Desequilibrio Funcional Moderado
  // -------------------------------------------------------------
  console.log('\n▶ Evaluando Cohorte 4: Desequilibrio Funcional Moderado...');
  const t4 = Engine.createInstance();
  t4.answerQuestion('q1_energia_matutina', 1);
  t4.answerQuestion('q2_niebla_mental', 2);
  t4.answerQuestion('q3_salud_digestiva', 1);
  t4.answerQuestion('q4_retencion_microcirculacion', 1);
  t4.answerQuestion('q5_sedentarismo_pantallas', 2);
  t4.answerQuestion('q6_tension_estres', 1);
  t4.answerQuestion('q7_antecedentes_metabolicos', 1);
  
  if (t4.activeQuestions.some(q => q.id === 'q_cond_inflamacion_metabolica')) {
    t4.answerQuestion('q_cond_inflamacion_metabolica', 1);
  }
  const r4 = t4.calculateResults();

  assert(r4.globalChargeScore >= 25 && r4.globalChargeScore <= 55, `Score global en rango moderado calibrado (${r4.globalChargeScore}/100)`);
  assert(r4.riskLevel === 'moderado', 'Clasificación de riesgo moderado 🟡');
  assert(r4.physiologicalInsight.length > 50, 'Insight fisiológico enriquecido generado correctamente');

  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`   RESULTADO DE SUITE: ${passed} PASSED / ${failed} FAILED`);
  console.log('════════════════════════════════════════════════════════════');

  if (failed > 0) {
    process.exit(1);
  }
}

runCohortTests();
