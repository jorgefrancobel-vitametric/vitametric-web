// G-Level: L1
// Sustrato: Script Test
// Función: Invariantes de la capa hermenéutica — detección de discordancias, constelaciones y los cuatro anti-patrones clínicos como restricciones ejecutables
// v-version: 20260822.01

/**
 * Una capa que "interpreta" es justo donde un sistema clínico se vuelve peligroso:
 * puede sobre-leer, patologizar o presentar una corazonada como hallazgo. Los
 * cuatro anti-patrones de la skill hrv-alexithymia-expert dejan de ser consejos y
 * pasan a ser invariantes que la suite falsa.
 *
 *   H1 · Detección       · la discordancia aparece cuando existe y NO cuando no
 *   H2 · No absolutizar  · ninguna lectura se emite sin su contra-lectura
 *   H3 · Contexto        · las circunstancias no se cuentan como síntomas
 *   H4 · No patologizar  · se describe un modo de responder, nunca un déficit
 *   H5 · No sustituir    · las lecturas relevantes derivan a consulta
 *   H6 · Confianza atada · una lectura no puede ser más firme que sus estimaciones
 *   H7 · Frontera        · la interpretación tampoco se atribuye mediciones
 */

import Engine from '../js/test-celular-engine.js';
import Interpretation from '../js/interpretation.js';

const { CHANNEL, PATTERN, CONFIDENCE, ITEM_CHANNEL, channelOf, read } = Interpretation;

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`✅ ${label}`);
  } else {
    failed++;
    console.log(`❌ ${label}${detail ? `\n   → ${detail}` : ''}`);
  }
}

/** Estimaciones sintéticas para aislar la lectura del modelo de Rasch. */
function estimates(overrides = {}) {
  const base = {};
  Object.keys(Engine.AXES).forEach((a) => {
    base[a] = { theta: -1, se: 0.5, scale: 30, certainty: 'PROBABLE' };
  });
  Object.keys(overrides).forEach((a) => { base[a] = { ...base[a], ...overrides[a] }; });
  return base;
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── H1 · Detección de la discordancia somático-afectiva ──');

{
  // El caso que motiva el módulo: cuerpo cargado, introspección en cero.
  const answers = {
    item_aut_tension_cervical: 3,
    item_aut_bruxismo: 3,
    item_aut_taquicardia: 2,
    item_aut_manos_frias: 2,
    item_aut_mente_acelerada: 0,   // único introspectivo del eje
    item_card_niebla_mental: 0
  };
  const r = read({ answers, estimates: estimates() });
  const gap = r.patterns.find((p) => p.id === PATTERN.SOMATIC_AFFECTIVE_GAP);

  check('[H1] se detecta cuando el cuerpo reporta y la introspección no', !!gap,
    `patrones: ${r.patterns.map((p) => p.id).join(', ') || 'ninguno'}`);
  check('[H1] el eje autónomo queda marcado para no cerrarse como "sin carga"',
    r.softenLowClaims.includes('autonomo'), JSON.stringify(r.softenLowClaims));
}

{
  // Coherente: reporta poco en todo. No debe inventarse una discordancia.
  const answers = {
    item_aut_tension_cervical: 0, item_aut_bruxismo: 0, item_aut_taquicardia: 0,
    item_aut_manos_frias: 0, item_aut_mente_acelerada: 0
  };
  const r = read({ answers, estimates: estimates() });
  check('[H1] NO se detecta en un perfil coherentemente bajo',
    !r.patterns.some((p) => p.id === PATTERN.SOMATIC_AFFECTIVE_GAP));
}

{
  // Coherente al alza: cuerpo y percepción interna van juntos.
  const answers = {
    item_aut_tension_cervical: 3, item_aut_bruxismo: 3, item_aut_taquicardia: 3,
    item_aut_manos_frias: 2, item_aut_mente_acelerada: 3, item_card_niebla_mental: 3
  };
  const r = read({ answers, estimates: estimates() });
  check('[H1] NO se detecta cuando ambos canales coinciden en alto',
    !r.patterns.some((p) => p.id === PATTERN.SOMATIC_AFFECTIVE_GAP));
}

{
  // Sin ítems introspectivos administrados no hay base para la lectura.
  const answers = { item_ter_distension: 3, item_ter_acidez_reflujo: 3, item_ter_pesadez_piernas: 3 };
  const r = read({ answers, estimates: estimates() });
  check('[H1] NO se afirma discordancia si no se preguntó nada introspectivo',
    !r.patterns.some((p) => p.id === PATTERN.SOMATIC_AFFECTIVE_GAP));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── H2 · No absolutizar ──');

{
  // Se recorren escenarios variados y TODA lectura emitida debe traer su límite.
  const escenarios = [
    { answers: { item_aut_tension_cervical: 3, item_aut_bruxismo: 3, item_aut_taquicardia: 3, item_aut_manos_frias: 3, item_aut_mente_acelerada: 0 }, estimates: estimates() },
    { answers: { item_ocu_sedentarismo_6h: 3, item_ocu_pantallas_continuas: 3, item_ocu_pausas_escasas: 2, item_ter_distension: 0, item_aut_bruxismo: 0 }, estimates: estimates() },
    { answers: { item_aut_bruxismo: 3, item_aut_taquicardia: 3, item_aut_tension_cervical: 3, item_ter_distension: 3, item_ter_acidez_reflujo: 3, item_sue_pesadez_corporal: 3 }, estimates: estimates({ autonomo: { theta: 1.2, se: 0.5 }, terreno: { theta: 1.1, se: 0.5 } }) },
    { answers: { item_apnea_ronquido: null, item_apnea_pausas_ahogo: null, item_sue_microdespertares: null, item_aut_bruxismo: 1, item_ter_distension: 0 }, estimates: estimates() }
  ];

  let sinLimite = 0;
  let sinEvidencia = 0;
  let total = 0;
  escenarios.forEach((e) => {
    read(e).patterns.forEach((p) => {
      total++;
      if (!p.notMeaning || p.notMeaning.length < 20) sinLimite++;
      if (!p.evidence || Object.keys(p.evidence).length === 0) sinEvidencia++;
      if (!Object.values(CONFIDENCE).includes(p.confidence)) sinEvidencia++;
    });
  });

  console.log(`   lecturas emitidas en los escenarios: ${total}`);
  check('[H2] los escenarios producen lecturas (si no, la suite no prueba nada)', total >= 3, `${total} lecturas`);
  check('[H2] toda lectura declara qué NO significa', sinLimite === 0, `${sinLimite} sin contra-lectura`);
  check('[H2] toda lectura trae evidencia y nivel de confianza', sinEvidencia === 0, `${sinEvidencia} sin respaldo`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── H3 · El contexto no se cuenta como síntoma ──');

{
  const answers = {
    item_ocu_sedentarismo_6h: 3,
    item_ocu_pantallas_continuas: 3,
    item_ocu_pausas_escasas: 3,
    item_card_herencia_familiar: 3,
    item_aut_bruxismo: 0,
    item_ter_distension: 0,
    item_sue_microdespertares: 0
  };
  const r = read({ answers, estimates: estimates() });
  const ctx = r.patterns.find((p) => p.id === PATTERN.CONTEXT_WITHOUT_STRAIN);
  check('[H3] circunstancias altas sin síntomas se leen como tal, no como carga', !!ctx,
    `patrones: ${r.patterns.map((p) => p.id).join(', ')}`);
  check('[H3] y no dispara la discordancia somático-afectiva',
    !r.patterns.some((p) => p.id === PATTERN.SOMATIC_AFFECTIVE_GAP));

  // La herencia familiar es un antecedente, no algo que se esté sintiendo hoy.
  check('[H3] los antecedentes están clasificados como contextuales',
    channelOf('item_card_herencia_familiar') === CHANNEL.CONTEXTUAL
    && channelOf('item_card_diagnostico_propio') === CHANNEL.CONTEXTUAL);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── H4 · No patologizar ──');

{
  /**
   * Ninguna lectura puede nombrar una condición, atribuir un déficit ni usar el
   * vocabulario del trastorno. La discordancia se describe como una forma de
   * registrar, que es lo que la evidencia sostiene.
   */
  const PATOLOGIZANTE = [
    'alexitimia', 'alexitímic', 'trastorno', 'patológic', 'déficit', 'deficit',
    'anormal', 'disfunción emocional', 'incapacidad', 'sufres', 'padeces',
    'diagnóstic', 'enfermedad', 'negación', 'reprimid'
  ];

  const answers = {
    item_aut_tension_cervical: 3, item_aut_bruxismo: 3, item_aut_taquicardia: 3,
    item_aut_manos_frias: 2, item_aut_mente_acelerada: 0, item_card_niebla_mental: 0
  };
  const r = read({ answers, estimates: estimates() });
  // Solo se escanea lo que la lectura AFIRMA (label y meaning). En `notMeaning`
  // estos términos aparecen negados —"no constituye ningún diagnóstico"— y ahí
  // son exactamente lo que debe decirse.
  const afirmado = r.patterns.flatMap((p) => [p.label, p.meaning]).join(' ').toLowerCase();
  const hallados = PATOLOGIZANTE.filter((t) => afirmado.includes(t));

  check('[H4] ninguna lectura AFIRMA con vocabulario patologizante', hallados.length === 0, `encontrado: ${hallados.join(', ')}`);

  // Y el contrapositivo: la negación no puede desaparecer con un descuido de
  // redacción, porque entonces H4 pasaría por vacío.
  const niegan = r.patterns.filter((p) => /no (es|significa|implica|indica|constituye|garantiza|permite)/i.test(p.notMeaning));
  check('[H4] las contra-lecturas niegan explícitamente, no solo matizan',
    niegan.length === r.patterns.length, `${r.patterns.length - niegan.length} sin negación explícita`);

  const gap = r.patterns.find((p) => p.id === PATTERN.SOMATIC_AFFECTIVE_GAP);
  check('[H4] la discordancia se enuncia como forma de registrar, no como carencia',
    !!gap && /no es un defecto|forma distinta/i.test(gap.meaning));
  check('[H4] y niega explícitamente ser un diagnóstico',
    !!gap && /diagn[óo]stico/i.test(gap.notMeaning));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── H5 · No sustituir al profesional ──');

{
  const relevantes = [
    { item_aut_tension_cervical: 3, item_aut_bruxismo: 3, item_aut_taquicardia: 3, item_aut_manos_frias: 2, item_aut_mente_acelerada: 0 },
    { item_aut_bruxismo: 3, item_aut_taquicardia: 3, item_aut_tension_cervical: 3, item_aut_manos_frias: 3, item_aut_mente_acelerada: 3, item_sue_pesadez_corporal: 3 },
    { item_apnea_ronquido: null, item_apnea_pausas_ahogo: null, item_sue_microdespertares: null, item_aut_bruxismo: 1, item_ter_distension: 0 }
  ];
  const derivan = relevantes.every((answers) => read({ answers, estimates: estimates() }).suggestConsultation);
  check('[H5] toda lectura clínicamente relevante deriva a consulta', derivan);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── H6 · Confianza atada a la evidencia ──');

{
  const answers = {
    item_aut_bruxismo: 3, item_aut_taquicardia: 3, item_aut_tension_cervical: 3,
    item_ter_distension: 3, item_ter_acidez_reflujo: 3, item_ter_pesadez_piernas: 3
  };
  const preciso = read({ answers, estimates: estimates({ autonomo: { theta: 1.2, se: 0.4 }, terreno: { theta: 1.1, se: 0.4 } }) });
  const impreciso = read({ answers, estimates: estimates({ autonomo: { theta: 1.2, se: 1.1 }, terreno: { theta: 1.1, se: 1.1 } }) });

  const cPreciso = preciso.patterns.find((p) => p.id === PATTERN.CONSTELLATION);
  const cImpreciso = impreciso.patterns.find((p) => p.id === PATTERN.CONSTELLATION);

  check('[H6] la constelación aparece con ejes cargados', !!cPreciso,
    `patrones: ${preciso.patterns.map((p) => p.id).join(', ')}`);
  check('[H6] con estimaciones imprecisas la misma lectura baja su confianza',
    !!cImpreciso && cImpreciso.confidence === CONFIDENCE.WEAK && cPreciso.confidence === CONFIDENCE.MODERATE,
    `preciso=${cPreciso && cPreciso.confidence} · impreciso=${cImpreciso && cImpreciso.confidence}`);
}

{
  // Sin ejes cargados no hay constelación que valga.
  const r = read({
    answers: { item_aut_bruxismo: 0, item_ter_distension: 0 },
    estimates: estimates()
  });
  check('[H6] sin ejes cargados no se emiten constelaciones',
    !r.patterns.some((p) => p.id === PATTERN.CONSTELLATION));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── H7 · Frontera epistémica ──');

{
  // La misma frontera del motor: interpretar no autoriza a medir.
  const PROHIBIDO = [
    'iph', 'acidez tisular', 'fluido intersticial', 'glicación', 'microinflamación',
    'simpático', 'parasimpático', 'vagal', 'glucémic', 'hrv', 'cortisol', 'serotonina'
  ];
  const escenarios = [
    { item_aut_tension_cervical: 3, item_aut_bruxismo: 3, item_aut_taquicardia: 3, item_aut_manos_frias: 2, item_aut_mente_acelerada: 0 },
    { item_ocu_sedentarismo_6h: 3, item_ocu_pantallas_continuas: 3, item_ocu_pausas_escasas: 3, item_aut_bruxismo: 0, item_ter_distension: 0, item_sue_microdespertares: 0 },
    { item_aut_bruxismo: 3, item_aut_taquicardia: 3, item_aut_tension_cervical: 3, item_ter_distension: 3, item_ter_acidez_reflujo: 3, item_ter_pesadez_piernas: 3 }
  ];

  const fugas = [];
  escenarios.forEach((answers) => {
    const r = read({ answers, estimates: estimates({ autonomo: { theta: 1.2, se: 0.4 }, terreno: { theta: 1.1, se: 0.4 } }) });
    r.patterns.forEach((p) => {
      const t = [p.label, p.meaning, p.notMeaning].join(' ').toLowerCase();
      PROHIBIDO.forEach((term) => { if (t.includes(term)) fugas.push(`${p.id}: ${term}`); });
    });
  });

  check('[H7] la capa de interpretación no nombra mediciones ni biomarcadores', fugas.length === 0, fugas.join(' | '));
}

{
  // Todo ítem del catálogo debe tener canal asignado: uno sin clasificar caería
  // en el default y contaminaría silenciosamente las medias.
  const todos = [...Engine.BASE_DIMENSIONS, ...Object.values(Engine.CONDITIONAL_DIMENSIONS)]
    .flatMap((d) => d.items.map((it) => it.id));
  const sinCanal = todos.filter((id) => !(id in ITEM_CHANNEL));
  check('[H7] todos los ítems del catálogo tienen canal declarado', sinCanal.length === 0, sinCanal.join(', '));
}

// ─────────────────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n${failed === 0 ? '🎉' : '🚨'} Capa hermenéutica: ${passed}/${total} invariantes verdes.`);
if (failed > 0) process.exit(1);
