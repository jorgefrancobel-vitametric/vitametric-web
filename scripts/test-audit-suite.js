/**
 * Vitametric — Suite Automatizada de Pruebas Clínicas E2E
 * Valida la exactitud fisiológica, el desacoplamiento de micro-chips,
 * el branching determinista puro, los tests de frontera y la resiliencia en backtrack.
 */

const Engine = require('../js/test-celular-engine.js');

function runCohortTests() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('   VITAMETRIC — SUITE DE PRUEBAS DE AUDITORÍA CLÍNICA (v2)');
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
  t1.answerDimension('dim_autonomo', [], true);
  t1.answerDimension('dim_sueno', [], true);
  t1.answerDimension('dim_cardiometabolico', [], true);
  t1.answerDimension('dim_terreno', [], true);
  t1.answerDimension('dim_ocupacional', [], true);

  const r1 = t1.calculateResults();

  assert(r1.globalChargeScore === 0, 'Score de carga global es 0');
  assert(r1.riskLevel === 'bajo', 'Nivel de riesgo clasificado como bajo 🟢');
  assert(r1.totalDimensionsAnswered === 5, 'Exactamente 5 dimensiones respondidas');
  assert(t1.getQuestionsCount() === 5, 'Banco activo permanece en 5 dimensiones (sin branching)');
  assert(r1.globalResilienceScore === 100, 'Resiliencia celular al 100%');
  assert(r1.axisScores.autonomo === 0 && r1.axisScores.sueno === 0, 'Todos los ejes en 0%');

  // -------------------------------------------------------------
  // COHORTE 2: Apnea del Sueño & Simpaticotonía Crónica
  // -------------------------------------------------------------
  console.log('\n▶ Evaluando Cohorte 2: Apnea del Sueño & Simpaticotonía Crónica...');
  const t2 = Engine.createInstance();
  t2.answerDimension('dim_autonomo', ['item_aut_bruxismo', 'item_aut_taquicardia', 'item_aut_mente_acelerada']);
  t2.answerDimension('dim_sueno', ['item_sue_inercia_matutina', 'item_sue_microdespertares', 'item_sue_pesadez_corporal']);
  t2.answerDimension('dim_cardiometabolico', [], true);
  t2.answerDimension('dim_terreno', [], true);
  t2.answerDimension('dim_ocupacional', ['item_ocu_sedentarismo_6h']);

  // Debe haberse activado branch_apnea_sueno
  const activeT2 = t2.getActiveQuestions();
  assert(activeT2.some(q => q.id === 'dim_cond_apnea_sueno'), 'Branching activado: STOP-BANG (dim_cond_apnea_sueno)');
  assert(!activeT2.some(q => q.id === 'dim_cond_inflamacion_metabolica'), 'Rama de inflamación no activada indebidamente');

  t2.answerDimension('dim_cond_apnea_sueno', ['item_apnea_ronquido', 'item_apnea_pausas_ahogo']);
  const r2 = t2.calculateResults();

  assert(r2.riskLevel === 'alto', 'Nivel clasificado como alto riesgo 🔴');
  assert(r2.axisScores.sueno >= 65, `Eje Sueño en sobrecarga severa (${r2.axisScores.sueno}/100)`);
  assert(r2.axisScores.autonomo >= 50, `Eje Autónomo en sobrecarga funcional (${r2.axisScores.autonomo}/100)`);
  assert(r2.dominantAxis1.id === 'sueno' || r2.dominantAxis1.id === 'autonomo', 'Eje dominante identificado en esfera neurovegetativa');

  // -------------------------------------------------------------
  // COHORTE 3: Riesgo Cardiometabólico & Terreno Ácido
  // -------------------------------------------------------------
  console.log('\n▶ Evaluando Cohorte 3: Riesgo Cardiometabólico & Terreno Ácido...');
  const t3 = Engine.createInstance();
  t3.answerDimension('dim_autonomo', ['item_aut_tension_cervical']);
  t3.answerDimension('dim_sueno', [], true);
  t3.answerDimension('dim_cardiometabolico', ['item_card_somnolencia_post', 'item_card_niebla_mental', 'item_card_antojos_dulces', 'item_card_diagnostico_propio']);
  t3.answerDimension('dim_terreno', ['item_ter_distension', 'item_ter_acidez_reflujo', 'item_ter_pesadez_piernas']);
  t3.answerDimension('dim_ocupacional', ['item_ocu_sedentarismo_6h', 'item_ocu_pantallas_continuas']);

  const activeT3 = t3.getActiveQuestions();
  assert(activeT3.some(q => q.id === 'dim_cond_inflamacion_metabolica'), 'Branching activado: Microinflamación (dim_cond_inflamacion_metabolica)');

  t3.answerDimension('dim_cond_inflamacion_metabolica', ['item_inf_grasa_visceral', 'item_inf_fatiga_muscular', 'item_inf_rigidez_articular']);
  const r3 = t3.calculateResults();

  assert(r3.riskLevel === 'alto', 'Nivel de riesgo alto por factores metabólicos e intersticiales 🔴');
  assert(r3.axisScores.cardiometabolico >= 65, `Eje Cardiometabólico sobrecargado (${r3.axisScores.cardiometabolico}/100)`);
  assert(r3.axisScores.terreno >= 65, `Eje Terreno/ipH sobrecargado (${r3.axisScores.terreno}/100)`);

  // -------------------------------------------------------------
  // COHORTE 4: Desequilibrio Funcional Moderado
  // -------------------------------------------------------------
  console.log('\n▶ Evaluando Cohorte 4: Desequilibrio Funcional Moderado...');
  const t4 = Engine.createInstance();
  t4.answerDimension('dim_autonomo', ['item_aut_tension_cervical', 'item_aut_mente_acelerada']);
  t4.answerDimension('dim_sueno', ['item_sue_inercia_matutina', 'item_sue_latencia_alta']);
  t4.answerDimension('dim_cardiometabolico', ['item_card_somnolencia_post']);
  t4.answerDimension('dim_terreno', ['item_ter_distension']);
  t4.answerDimension('dim_ocupacional', ['item_ocu_pantallas_continuas', 'item_ocu_sedentarismo_6h']);

  const r4 = t4.calculateResults();

  assert(r4.globalChargeScore >= 20 && r4.globalChargeScore <= 50, `Score global en rango moderado calibrado (${r4.globalChargeScore}/100)`);
  assert(r4.riskLevel === 'moderado', 'Clasificación de riesgo moderado 🟡');
  assert(r4.physiologicalInsight.length > 50, 'Insight fisiológico enriquecido generado correctamente');

  // -------------------------------------------------------------
  // TESTS DE FRONTERA / UMBRALES EXACTOS
  // -------------------------------------------------------------
  console.log('\n▶ Evaluando Tests de Frontera de Scoring...');
  
  // Test de Umbral Bajo vs Moderado
  const tFronteraLow = Engine.createInstance();
  tFronteraLow.answerDimension('dim_autonomo', ['item_aut_manos_frias']);
  tFronteraLow.answerDimension('dim_sueno', [], true);
  tFronteraLow.answerDimension('dim_cardiometabolico', [], true);
  tFronteraLow.answerDimension('dim_terreno', [], true);
  tFronteraLow.answerDimension('dim_ocupacional', [], true);
  const rFronteraLow = tFronteraLow.calculateResults();
  assert(rFronteraLow.riskLevel === 'bajo', `Score bajo frontera clasificado bajo (${rFronteraLow.globalChargeScore}/100)`);

  // -------------------------------------------------------------
  // TEST DE REVERSIÓN Y BACKTRACKING (BRANCHING DETERMINISTA PURO)
  // -------------------------------------------------------------
  console.log('\n▶ Evaluando Reversión de Branching en Backtracking...');
  const tBack = Engine.createInstance();
  tBack.answerDimension('dim_autonomo', ['item_aut_bruxismo', 'item_aut_taquicardia']);
  tBack.answerDimension('dim_sueno', ['item_sue_inercia_matutina', 'item_sue_microdespertares', 'item_sue_pesadez_corporal']);
  assert(tBack.getQuestionsCount() === 6, 'Branching STOP-BANG inyectado (6 dimensiones activas)');

  // Simular retroceso y cambio a estado óptimo en sueño
  tBack.answerDimension('dim_sueno', [], true);
  assert(tBack.getQuestionsCount() === 5, 'Branching revertido limpiamente tras backtrack (vuelve a 5 dimensiones)');
  assert(!tBack.getActiveQuestions().some(q => q.id === 'dim_cond_apnea_sueno'), 'dim_cond_apnea_sueno purgada deterministamente');

  // -------------------------------------------------------------
  // TEST DE GENERACIÓN DE PAYLOAD WHATSAPP
  // -------------------------------------------------------------
  console.log('\n▶ Evaluando Generación de Payload WhatsApp...');
  const waUrl = t2.generateWhatsAppUrl('Jorge Franco');
  assert(waUrl.startsWith('https://wa.me/525585327421?text='), 'URL base apunta al WhatsApp oficial de Vitametric');
  assert(waUrl.includes('Jorge%20Franco'), 'Nombre del paciente embebido correctamente');
  assert(waUrl.includes('Aut%C3%B3nomo') || waUrl.includes('Autonomo'), 'Desglose de ejes en payload');
  assert(waUrl.includes('ES-Complex'), 'Anclaje al estudio ES-Complex');

  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`   RESULTADO DE SUITE: ${passed} PASSED / ${failed} FAILED`);
  console.log('════════════════════════════════════════════════════════════');

  if (failed > 0) {
    process.exit(1);
  }
}

runCohortTests();
