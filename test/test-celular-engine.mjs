// G-Level: L1
// Sustrato: Script Test
// Función: Suite de invariantes del motor de autoevaluación celular — monotonicidad, estabilidad de escala, bandas y fidelidad numérica del payload
// v-version: 20260821.01

/**
 * Invariantes del Motor Clínico de Autoevaluación Celular (Vitametric).
 *
 * Un test de tamizaje que puede BAJAR su score cuando el paciente reporta MÁS
 * síntomas no es un instrumento: es ruido con branding clínico. Esta suite fija
 * las propiedades que el motor debe cumplir para que dos aplicaciones distintas
 * —del mismo paciente o de pacientes distintos— sean comparables.
 *
 * Invariantes verificados:
 *   I1 · Monotonicidad        · reportar un síntoma adicional nunca baja ningún score
 *   I2 · Escala estable       · el denominador por eje no depende de qué dimensiones se activaron
 *   I3 · Rango y extremos     · óptimo total → 0; nada fuera de [0,100]
 *   I4 · Bandas               · estratificación y override uniaxial deterministas
 *   I5 · Pureza del branching · calcular no muta el estado; el backtrack no deja residuo
 *   I6 · Fidelidad numérica   · ningún número del payload de salida sale de la nada
 *   I7 · Colinealidad         · las cargas cruzadas entre ejes quedan medidas, no asumidas
 *
 * I6 es el invariante `authorizedNumbers` del contrato semántico de Sintelia
 * aplicado aquí como principio Gv agnóstico: lo que se muestra al usuario no
 * puede contener cifras que el motor no haya calculado.
 */

import { readFileSync } from 'node:fs';
import Engine from '../js/test-celular-engine.js';

const { AXES, GRADE, SCORING_CONFIG, BASE_DIMENSIONS, CONDITIONAL_DIMENSIONS, TestEngine } = Engine;

const ALL_DIMENSIONS = [...BASE_DIMENSIONS, ...Object.values(CONDITIONAL_DIMENSIONS)];
const AXIS_KEYS = Object.keys(AXES);

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

/** LCG con semilla fija: el muestreo debe ser idéntico en cada corrida. */
function makeRandom(seed = 20260821) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Corre el test con una selección concreta de ítems y responde "óptimo" en toda
 * dimensión que quede activa sin respuesta (incluidas las condicionales que la
 * propia selección haya disparado).
 */
function runWith(selectionByDim) {
  const engine = new TestEngine();
  BASE_DIMENSIONS.forEach((dim) => {
    const picked = selectionByDim[dim.id] || [];
    engine.answerDimension(dim.id, picked, picked.length === 0);
  });
  engine.getActiveQuestions().forEach((dim) => {
    if (engine.answers[dim.id]) return;
    const picked = selectionByDim[dim.id] || [];
    engine.answerDimension(dim.id, picked, picked.length === 0);
  });
  return { engine, result: engine.calculateResults() };
}

/** Selección aleatoria sobre TODAS las dimensiones (base y condicionales). */
function randomSelection(rand, density = 0.35) {
  const selection = {};
  ALL_DIMENSIONS.forEach((dim) => {
    const picked = dim.items.filter(() => rand() < density).map((it) => it.id);
    if (picked.length) selection[dim.id] = picked;
  });
  return selection;
}

// ─────────────────────────────────────────────────────────────────────────────
// I1 · Monotonicidad
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n── I1 · Monotonicidad ──');

// Caso testigo: el que se detectó en producción. Superset estricto de síntomas
// de sueño que además dispara el tamizaje STOP-BANG.
{
  const a = runWith({ dim_sueno: ['item_sue_microdespertares'] }).result;
  const b = runWith({ dim_sueno: ['item_sue_microdespertares', 'item_sue_inercia_matutina'] }).result;
  check(
    '[Testigo] añadir un síntoma de sueño no baja el eje de sueño',
    b.axisScores.sueno >= a.axisScores.sueno,
    `A(1 síntoma)=${a.axisScores.sueno} · B(superset)=${b.axisScores.sueno}`
  );
  check(
    '[Testigo] añadir un síntoma de sueño no baja el score global',
    b.globalChargeScore >= a.globalChargeScore,
    `A=${a.globalChargeScore} · B=${b.globalChargeScore}`
  );
}

// Barrido aleatorio: para 400 estados, añadir un ítem no seleccionado nunca
// puede reducir el global ni el eje sobre el que carga.
{
  const rand = makeRandom();
  let violations = 0;
  let worst = null;

  for (let i = 0; i < 400; i++) {
    const base = randomSelection(rand);
    const candidates = [];
    ALL_DIMENSIONS.forEach((dim) => {
      dim.items.forEach((it) => {
        if (!(base[dim.id] || []).includes(it.id)) candidates.push({ dim, item: it });
      });
    });
    if (!candidates.length) continue;

    const { dim, item } = candidates[Math.floor(rand() * candidates.length)];
    const grown = { ...base, [dim.id]: [...(base[dim.id] || []), item.id] };

    const before = runWith(base).result;
    const after = runWith(grown).result;

    if (after.globalChargeScore < before.globalChargeScore) {
      violations++;
      if (!worst || before.globalChargeScore - after.globalChargeScore > worst.delta) {
        worst = {
          delta: before.globalChargeScore - after.globalChargeScore,
          item: item.id,
          before: before.globalChargeScore,
          after: after.globalChargeScore
        };
      }
    }
  }

  check(
    '[Barrido] 400 estados: añadir un síntoma nunca baja el global',
    violations === 0,
    worst ? `${violations} violaciones · peor: +${worst.item} ⇒ ${worst.before}→${worst.after}` : ''
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// I2 · Escala estable
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n── I2 · Escala estable ──');

// El mismo conjunto de síntomas debe producir el mismo score de un eje sin
// importar qué otras dimensiones se activaron por branching. Se compara un
// estado que dispara STOP-BANG contra otro que no, con idéntica carga de sueño.
{
  const sinBranch = runWith({ dim_sueno: ['item_sue_pesadez_corporal'] }).result;
  const conBranch = runWith({
    dim_sueno: ['item_sue_pesadez_corporal'],
    dim_cardiometabolico: ['item_card_somnolencia_post', 'item_card_niebla_mental'],
    dim_terreno: ['item_ter_distension', 'item_ter_acidez_reflujo']
  }).result;

  check(
    '[Escala] activar un tamizaje ajeno no altera el eje de sueño',
    sinBranch.axisScores.sueno === conBranch.axisScores.sueno,
    `sin branch=${sinBranch.axisScores.sueno} · con branch=${conBranch.axisScores.sueno}`
  );
}

// Dos pacientes con la misma carga absoluta deben puntuar igual en el eje,
// aunque uno haya recorrido más pantallas que el otro.
{
  const corto = runWith({ dim_autonomo: ['item_aut_taquicardia'] }).result;
  const largo = runWith({
    dim_autonomo: ['item_aut_taquicardia'],
    dim_sueno: ['item_sue_microdespertares', 'item_sue_latencia_alta']
  }).result;

  check(
    '[Escala] el eje autónomo es invariante al número de pantallas recorridas',
    corto.axisScores.autonomo === largo.axisScores.autonomo,
    `corto=${corto.axisScores.autonomo} · largo=${largo.axisScores.autonomo}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// I3 · Rango y extremos
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n── I3 · Rango y extremos ──');

{
  const optimo = runWith({}).result;
  check(
    '[Extremo] óptimo en todas las dimensiones ⇒ carga 0 y resiliencia 100',
    optimo.globalChargeScore === 0 && optimo.globalResilienceScore === 100,
    `carga=${optimo.globalChargeScore} · resiliencia=${optimo.globalResilienceScore}`
  );
  check(
    '[Extremo] óptimo total ⇒ banda baja',
    optimo.riskLevel === 'bajo',
    `riskLevel=${optimo.riskLevel}`
  );
}

{
  const todo = {};
  ALL_DIMENSIONS.forEach((dim) => { todo[dim.id] = dim.items.map((it) => it.id); });
  const result = runWith(todo).result;

  const enRango = AXIS_KEYS.every((k) => result.axisScores[k] >= 0 && result.axisScores[k] <= 100);
  check('[Rango] todos los ejes dentro de [0,100] con carga máxima', enRango, JSON.stringify(result.axisScores));
  check(
    '[Extremo] marcar todos los síntomas ⇒ banda alta',
    result.riskLevel === 'alto',
    `global=${result.globalChargeScore} · nivel=${result.riskLevel}`
  );
  check(
    '[Extremo] carga máxima satura los ejes en 100',
    AXIS_KEYS.every((k) => result.axisScores[k] === 100),
    JSON.stringify(result.axisScores)
  );
}

{
  const rand = makeRandom(777);
  let fuera = 0;
  for (let i = 0; i < 200; i++) {
    const r = runWith(randomSelection(rand, 0.5)).result;
    const ok = r.globalChargeScore >= 0 && r.globalChargeScore <= 100
      && AXIS_KEYS.every((k) => r.axisScores[k] >= 0 && r.axisScores[k] <= 100)
      && r.globalChargeScore + r.globalResilienceScore === 100;
    if (!ok) fuera++;
  }
  check('[Rango] 200 estados aleatorios: carga+resiliencia=100 y todo en rango', fuera === 0, `${fuera} fuera de rango`);
}

// ─────────────────────────────────────────────────────────────────────────────
// I4 · Bandas
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n── I4 · Bandas y override uniaxial ──');

{
  const rand = makeRandom(31337);
  const t = SCORING_CONFIG.thresholds;
  let inconsistentes = 0;

  for (let i = 0; i < 300; i++) {
    const r = runWith(randomSelection(rand, 0.45)).result;
    const maxAxis = Math.max(...AXIS_KEYS.map((k) => r.axisScores[k]));
    let esperado = 'bajo';
    if (r.globalChargeScore > t.highGlobal || maxAxis >= t.highMaxAxis) esperado = 'alto';
    else if (r.globalChargeScore >= t.moderateGlobal || maxAxis >= t.moderateMaxAxis) esperado = 'moderado';
    if (r.riskLevel !== esperado) inconsistentes++;
  }
  check('[Bandas] la estratificación respeta umbrales y override uniaxial', inconsistentes === 0, `${inconsistentes}/300 inconsistentes`);
}

{
  // Un solo eje catastrófico con el resto impecable debe escalar por override.
  const unipolar = runWith({ dim_cardiometabolico: BASE_DIMENSIONS.find((d) => d.id === 'dim_cardiometabolico').items.map((i) => i.id) }).result;
  check(
    '[Bandas] un eje saturado escala la banda aunque el promedio sea bajo',
    unipolar.riskLevel === 'alto' && unipolar.axisScores.cardiometabolico >= SCORING_CONFIG.thresholds.highMaxAxis,
    `nivel=${unipolar.riskLevel} · cardio=${unipolar.axisScores.cardiometabolico} · global=${unipolar.globalChargeScore}`
  );
  check(
    '[Bandas] el eje dominante reportado es el realmente más cargado',
    unipolar.dominantAxis1.id === 'cardiometabolico',
    `dominante=${unipolar.dominantAxis1.id}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// I5 · Pureza del branching
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n── I5 · Pureza del branching ──');

{
  const engine = new TestEngine();
  BASE_DIMENSIONS.forEach((d) => engine.answerDimension(d.id, [], true));
  engine.answerDimension('dim_sueno', ['item_sue_microdespertares', 'item_sue_latencia_alta']);
  const conTamizaje = engine.getQuestionsCount();

  // Backtrack: el paciente corrige y deja una sola marca ⇒ el tamizaje se retira
  // sin dejar residuo en el cálculo.
  engine.answerDimension('dim_sueno', ['item_sue_microdespertares']);
  const trasBacktrack = engine.getQuestionsCount();

  check(
    '[Pureza] el tamizaje aparece y se retira según el estado, sin residuo',
    conTamizaje === BASE_DIMENSIONS.length + 1 && trasBacktrack === BASE_DIMENSIONS.length,
    `con=${conTamizaje} · tras backtrack=${trasBacktrack}`
  );
}

{
  const { engine, result: primera } = runWith({ dim_terreno: ['item_ter_distension', 'item_ter_pesadez_piernas'] });
  const snapshot = JSON.stringify(engine.answers);
  const segunda = engine.calculateResults();
  check(
    '[Pureza] calcular dos veces da el mismo resultado y no muta las respuestas',
    JSON.stringify(primera) === JSON.stringify(segunda) && snapshot === JSON.stringify(engine.answers)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// I6 · Fidelidad numérica del payload
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n── I6 · Fidelidad numérica ──');

{
  const { engine, result } = runWith({
    dim_autonomo: ['item_aut_bruxismo', 'item_aut_taquicardia'],
    dim_sueno: ['item_sue_microdespertares'],
    dim_terreno: ['item_ter_distension']
  });

  const url = engine.generateWhatsAppUrl('Paciente de Prueba');
  const mensaje = decodeURIComponent(url.split('?text=')[1] || '');

  // Toda cifra visible debe provenir del cálculo o del catálogo de precios.
  const autorizados = new Set([
    String(result.globalChargeScore),
    ...AXIS_KEYS.map((k) => String(result.axisScores[k])),
    String(result.dominantAxis1.score),
    '100',   // denominador de la escala
    '3900'   // precio de la evaluación ES-Complex
  ]);

  const cifras = (mensaje.match(/\d[\d,]*/g) || []).map((n) => n.replace(/,/g, ''));
  const intrusas = cifras.filter((n) => !autorizados.has(n));

  check(
    '[Fidelidad] el payload no contiene cifras que el motor no haya calculado',
    intrusas.length === 0,
    `intrusas: ${[...new Set(intrusas)].join(', ')}`
  );
  check(
    '[Fidelidad] el score del mensaje coincide con el score calculado',
    mensaje.includes(`${result.globalChargeScore}/100`),
    `esperado ${result.globalChargeScore}/100`
  );
}

{
  // Con respuestas "no lo sé" el payload gana la línea del rango: sus cifras
  // también deben provenir del cálculo, y el rango debe declararse en vez de
  // presentar un número puntual como si fuera exacto.
  const engine = new TestEngine();
  BASE_DIMENSIONS.forEach((d) => engine.answerDimension(d.id, [], true));
  engine.answerDimension('dim_sueno', [
    { id: 'item_sue_microdespertares', grade: GRADE.HABITUAL },
    { id: 'item_sue_latencia_alta', grade: GRADE.RARA_VEZ }
  ]);
  engine.getActiveQuestions().forEach((d) => {
    if (engine.answers[d.id]) return;
    engine.answerDimension(d.id, d.items.map((it) => ({ id: it.id, grade: GRADE.UNKNOWN })));
  });

  const result = engine.calculateResults();
  const mensaje = decodeURIComponent(engine.generateWhatsAppUrl('Ana').split('?text=')[1] || '');

  const autorizados = new Set([
    String(result.globalChargeScore),
    ...AXIS_KEYS.map((k) => String(result.axisScores[k])),
    String(result.dominantAxis1.score),
    String(result.globalBounds.lower),
    String(result.globalBounds.upper),
    '100', '3900'
  ]);
  const intrusas = (mensaje.match(/\d[\d,]*/g) || [])
    .map((n) => n.replace(/,/g, ''))
    .filter((n) => !autorizados.has(n));

  check(
    '[Fidelidad] el payload con incertidumbre tampoco inventa cifras',
    intrusas.length === 0,
    `intrusas: ${[...new Set(intrusas)].join(', ')}`
  );
  check(
    '[Fidelidad] el rango se declara cuando hay preguntas sin responder',
    result.globalBounds.uncertainty > 0 && mensaje.includes(`${result.globalBounds.lower} a ${result.globalBounds.upper}/100`),
    `bounds=[${result.globalBounds.lower},${result.globalBounds.upper}] · ancho=${result.globalBounds.uncertainty}`
  );
  check(
    '[Fidelidad] el mensaje declara que no es diagnóstico ni medición',
    /no es un diagn[óo]stico ni una medici[óo]n/i.test(mensaje)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// I7 · Colinealidad entre ejes (medida, no asumida)
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n── I7 · Colinealidad ──');

{
  // El motor se documenta como "micro-chips ortogonales". Un ítem que carga en
  // varios ejes rompe esa ortogonalidad: el promedio ponderado lo cuenta tantas
  // veces como ejes toque. Aquí se mide el alcance real del solapamiento para
  // que la decisión de modelo se tome sobre un número, no sobre una etiqueta.
  const cruzados = [];
  ALL_DIMENSIONS.forEach((dim) => {
    dim.items.forEach((it) => {
      const ejes = Object.keys(it.weights || {});
      if (ejes.length > 1) cruzados.push({ id: it.id, ejes, pesos: it.weights });
    });
  });

  const totalItems = ALL_DIMENSIONS.reduce((n, d) => n + d.items.length, 0);
  const proporcion = cruzados.length / totalItems;

  console.log(`   ℹ️  ${cruzados.length}/${totalItems} ítems (${(proporcion * 100).toFixed(1)}%) cargan en más de un eje:`);
  cruzados.forEach((c) => console.log(`      · ${c.id} → ${JSON.stringify(c.pesos)}`));

  // Se fija el estado conocido: si alguien añade cargas cruzadas nuevas, este
  // test lo hace visible en vez de dejar que la ortogonalidad se erosione en silencio.
  check(
    '[Colinealidad] el solapamiento entre ejes está registrado y no ha crecido',
    cruzados.length === 3,
    `esperados 3 ítems con carga cruzada, encontrados ${cruzados.length}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// I8 · Ordinalidad e incertidumbre
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n── I8 · Ordinalidad e incertidumbre ──');

{
  const rara = runWith({ dim_autonomo: [{ id: 'item_aut_taquicardia', grade: GRADE.RARA_VEZ }] }).result;
  const menudo = runWith({ dim_autonomo: [{ id: 'item_aut_taquicardia', grade: GRADE.A_MENUDO }] }).result;
  const habitual = runWith({ dim_autonomo: [{ id: 'item_aut_taquicardia', grade: GRADE.HABITUAL }] }).result;

  check(
    '[Ordinalidad] el score crece con la frecuencia del mismo síntoma',
    rara.axisScores.autonomo < menudo.axisScores.autonomo && menudo.axisScores.autonomo < habitual.axisScores.autonomo,
    `rara=${rara.axisScores.autonomo} · a menudo=${menudo.axisScores.autonomo} · habitual=${habitual.axisScores.autonomo}`
  );

  const binario = runWith({ dim_autonomo: ['item_aut_taquicardia'] }).result;
  check(
    '[Ordinalidad] un ID suelto equivale al grado habitual (histórico intacto)',
    binario.axisScores.autonomo === habitual.axisScores.autonomo,
    `binario=${binario.axisScores.autonomo} · habitual=${habitual.axisScores.autonomo}`
  );
}

{
  const sinDato = runWith({}).result;
  const noSabe = runWith({ dim_sueno: [{ id: 'item_sue_microdespertares', grade: GRADE.UNKNOWN }] }).result;

  check(
    '[Incertidumbre] "no lo sé" no suma carga: la cota inferior no se mueve',
    noSabe.axisBounds.sueno.lower === sinDato.axisBounds.sueno.lower,
    `sin dato=${sinDato.axisBounds.sueno.lower} · no sabe=${noSabe.axisBounds.sueno.lower}`
  );
  check(
    '[Incertidumbre] "no lo sé" abre un intervalo en vez de fabricar una ausencia',
    noSabe.axisBounds.sueno.uncertainty > 0 && noSabe.axisBounds.sueno.upper > noSabe.axisBounds.sueno.lower,
    `[${noSabe.axisBounds.sueno.lower},${noSabe.axisBounds.sueno.upper}]`
  );
  check(
    '[Incertidumbre] sin respuestas "no lo sé" el intervalo colapsa a un punto',
    AXIS_KEYS.every((k) => sinDato.axisBounds[k].uncertainty === 0) && sinDato.globalBounds.uncertainty === 0
  );
}

{
  // Los ítems hetero-reportados (roncar, dejar de respirar) son los que el
  // paciente no puede conocer solo. Debe poder avanzar sin inventarse la respuesta.
  const engine = new TestEngine();
  BASE_DIMENSIONS.forEach((d) => engine.answerDimension(d.id, [], true));
  engine.answerDimension('dim_sueno', [
    { id: 'item_sue_microdespertares', grade: GRADE.UNKNOWN }
  ]);
  const dim = engine.getActiveQuestions().findIndex((d) => d.id === 'dim_sueno');
  engine.currentStep = dim;

  check(
    '[Incertidumbre] responder solo "no lo sé" permite continuar el test',
    engine.canGoNext() === true
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// I9 · Frontera epistémica
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n── I9 · Frontera epistémica ──');

{
  /**
   * Un cuestionario de síntomas percibidos no mide física del medio interno.
   * Puede describir lo que el paciente reporta; no puede atribuirse la medición
   * que corresponde al instrumento —ni siquiera como estimación—, porque eso le
   * concede al autoreporte una capacidad que no tiene y compromete la
   * credibilidad de la medición real.
   *
   * Alcance: textos del cuestionario (ejes, dimensiones, ítems) y de la
   * interpretación del resultado. Queda FUERA el llamado a la acción hacia el
   * ES-Complex, donde hablar de lo que el instrumento mide es legítimo.
   */
  const VOCABULARIO_DE_MEDICION = [
    'iph', 'acidez tisular', 'fluido intersticial', 'líquido intersticial',
    'glicación', 'biofísica intersticial', 'balance bioeléctrico',
    'equilibrio ácido-base', 'terreno intersticial'
  ];

  const superficies = [];
  AXIS_KEYS.forEach((k) => {
    superficies.push({ donde: `AXES.${k}.name`, texto: AXES[k].name });
    superficies.push({ donde: `AXES.${k}.description`, texto: AXES[k].description });
  });
  ALL_DIMENSIONS.forEach((dim) => {
    superficies.push({ donde: `${dim.id}.category`, texto: dim.category });
    superficies.push({ donde: `${dim.id}.subtitle`, texto: dim.subtitle || '' });
    dim.items.forEach((it) => superficies.push({ donde: it.id, texto: it.text }));
    if (dim.optimalOption) superficies.push({ donde: dim.optimalOption.id, texto: dim.optimalOption.text });
  });

  // Interpretación devuelta al paciente en las tres bandas.
  [
    runWith({}).result,
    runWith({ dim_terreno: ['item_ter_distension', 'item_ter_acidez_reflujo'], dim_cardiometabolico: ['item_card_somnolencia_post'] }).result,
    runWith({ dim_terreno: ALL_DIMENSIONS.find((d) => d.id === 'dim_terreno').items.map((i) => i.id) }).result
  ].forEach((r, i) => {
    superficies.push({ donde: `resultado[${i}].riskTitle`, texto: r.riskTitle });
    superficies.push({ donde: `resultado[${i}].riskSummary`, texto: r.riskSummary });
    superficies.push({ donde: `resultado[${i}].physiologicalInsight`, texto: r.physiologicalInsight });
  });

  const fugas = superficies.filter(({ texto }) => {
    const t = (texto || '').toLowerCase();
    return VOCABULARIO_DE_MEDICION.some((term) => t.includes(term));
  });

  if (fugas.length) {
    fugas.forEach((f) => console.log(`   ⚠️  ${f.donde}: "${f.texto.slice(0, 90)}…"`));
  }

  check(
    '[Frontera] el cuestionario no se atribuye la medición física del instrumento',
    fugas.length === 0,
    `${fugas.length} superficie(s) atribuyen al autoreporte una medición que no realiza`
  );

  // La misma frontera en la plantilla: de nada sirve limpiar el motor si el HTML
  // vuelve a prometer una medición. Se permite el vocabulario únicamente en las
  // líneas que hablan del instrumento (ES-Complex / SCENAR), donde describir lo
  // que el equipo mide sí corresponde.
  /**
   * Segunda clase de fuga: nombrar un instrumento validado que no se administra.
   * La rama de descanso se llamaba "STOP-BANG" con 3 ítems, de los cuales solo 2
   * pertenecen a ese cuestionario de 8. El punto de corte publicado no aplica a
   * un subconjunto arbitrario, así que el nombre prometía propiedades
   * psicométricas inexistentes.
   */
  const INSTRUMENTOS_VALIDADOS = ['stop-bang', 'stop bang', 'psqi', 'epworth', 'pss-10', 'phq-9', 'isi '];

  const instrumentosInvocados = superficies.filter(({ texto }) => {
    const t = (texto || '').toLowerCase();
    return INSTRUMENTOS_VALIDADOS.some((nombre) => t.includes(nombre));
  });

  if (instrumentosInvocados.length) {
    instrumentosInvocados.forEach((f) => console.log(`   ⚠️  ${f.donde}: invoca un instrumento validado — "${f.texto.slice(0, 70)}…"`));
  }

  check(
    '[Frontera] no se invoca ningún instrumento validado que el test no administre',
    instrumentosInvocados.length === 0,
    `${instrumentosInvocados.length} superficie(s) nombran un instrumento sin administrarlo`
  );

  /**
   * Tercera clase: vocabulario fisiopatológico inferencial. Pedirle al paciente
   * que reconozca su "resistencia periférica" o anunciarle que se evalúa su
   * "riesgo de hipoxemia" convierte un cuestionario de síntomas en un dictamen
   * sobre mecanismos que no observa.
   */
  const MECANISMOS_INFERIDOS = [
    'microinflamación', 'resistencia periférica', 'hipoxemia',
    'oxigenación', 'glicación', 'permeabilidad de barrera',
    // Requieren variabilidad de frecuencia cardíaca o glucometría: un cuestionario
    // no los observa por mucho que describa síntomas compatibles.
    'simpático', 'parasimpático', 'vagal', 'glucémica', 'glucémico'
  ];

  const mecanismos = superficies.filter(({ texto }) => {
    const t = (texto || '').toLowerCase();
    return MECANISMOS_INFERIDOS.some((term) => t.includes(term));
  });

  if (mecanismos.length) {
    mecanismos.forEach((f) => console.log(`   ⚠️  ${f.donde}: afirma un mecanismo — "${f.texto.slice(0, 70)}…"`));
  }

  check(
    '[Frontera] no se le atribuyen al autoreporte mecanismos fisiopatológicos',
    mecanismos.length === 0,
    `${mecanismos.length} superficie(s) nombran un mecanismo que el test no observa`
  );

  // La atribución al instrumento se busca en una ventana de contexto, no en la
  // misma línea: en el HTML el nombre del equipo suele ir en el encabezado de la
  // tarjeta y la descripción de lo que mide, unas líneas más abajo.
  const html = readFileSync(new URL('../test-celular.html', import.meta.url), 'utf8');
  const lineas = html.split('\n');
  const VENTANA = 4;
  const lineasConFuga = lineas
    .map((linea, i) => ({ n: i + 1, linea, i }))
    .filter(({ linea, i }) => {
      const t = linea.toLowerCase();
      if (!VOCABULARIO_DE_MEDICION.some((term) => t.includes(term))) return false;
      const contexto = lineas.slice(Math.max(0, i - VENTANA), i + 1).join(' ').toLowerCase();
      return !(contexto.includes('es-complex') || contexto.includes('scenar'));
    });

  if (lineasConFuga.length) {
    lineasConFuga.forEach(({ n, linea }) => console.log(`   ⚠️  test-celular.html:${n}: "${linea.trim().slice(0, 80)}…"`));
  }

  check(
    '[Frontera] la plantilla del test tampoco promete una medición que no hace',
    lineasConFuga.length === 0,
    `${lineasConFuga.length} línea(s) con fuga en test-celular.html`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// I10 · Rasch por eje (estimateAxisTheta)
// ─────────────────────────────────────────────────────────────────────────────

// El rasgo latente sólo se estima si el motor cargó rasch.js (HAS_RASCH). En esta
// suite el import de CommonJS inyecta rasch.js, así que la ruta debe estar viva:
// estos invariantes fijan que θ sigue el juicio clínico (monotonicidad, per-eje,
// UNKNOWN como dato faltante) y no contamina el resto del score.

console.log('\n── I10 · Rasch por eje (θ) ──');

{
  const opt = runWith({}).result.axisTheta;
  check(
    '[Rasch] axisTheta expone un eje por clave con la forma del contrato',
    AXIS_KEYS.every((k) => {
      const v = opt[k];
      return v
        && typeof v.theta === 'number' && Number.isFinite(v.theta)
        && v.se > 0 && Number.isFinite(v.se)
        && v.items >= 0
        && v.scale >= 0 && v.scale <= 100
        && v.ci95 && v.ci95.lower < v.ci95.upper;
    }),
    `keys=${Object.keys(opt || {}).join(',')}`
  );
}

{
  // En el MISMO eje e ítem, el grado más alto debe estimar θ mayor: la escala de
  // frecuencia ordinal ordena el rasgo latente igual que ordena los síntomas.
  const axis = 'sueno';
  const id = 'item_sue_microdespertares';
  const t = (grade) => runWith({ [`dim_${axis}`]: [{ id, grade }] }).result.axisTheta[axis].theta;
  check(
    '[Rasch] θ crece con la frecuencia del mismo síntoma (RARA_VEZ < A_MENUDO < HABITUAL)',
    t(GRADE.RARA_VEZ) < t(GRADE.A_MENUDO) && t(GRADE.A_MENUDO) < t(GRADE.HABITUAL),
    `rara=${t(GRADE.RARA_VEZ).toFixed(2)} · menudo=${t(GRADE.A_MENUDO).toFixed(2)} · habitual=${t(GRADE.HABITUAL).toFixed(2)}`
  );
}

{
  // Acumular síntomas severos eleva el θ de ESE eje y deja intacto el de los
  // demás: si el modelo tuviera acoplamiento cruzado, un eje ajeno variaría.
  const opt = runWith({}).result.axisTheta;
  const sev = runWith({ dim_autonomo: ['item_aut_taquicardia', 'item_aut_bruxismo'] }).result.axisTheta;
  check(
    '[Rasch] síntomas severos elevan el θ del eje y no tocan un eje ajeno',
    sev.autonomo.theta > opt.autonomo.theta && sev.sueno.theta === opt.sueno.theta,
    `autónomo ${opt.autonomo.theta.toFixed(2)}→${sev.autonomo.theta.toFixed(2)} · sueño ${opt.sueno.theta.toFixed(2)}→${sev.sueno.theta.toFixed(2)}`
  );
}

{
  // "No lo sé" NO es una categoría de Rasch: el ítem se DROPEA como dato
  // faltante y no cuenta como respuesta ni como ausencia. Con 1 HABITUAL + 3
  // UNKNOWN en el eje, sólo cuenta la aserción afirmada (items=1); un UNKNOWN
  // mal codificado como categoría fabricaría 4 respuestas y desviaría θ.
  const axis = 'sueno';
  const r = runWith({ [`dim_${axis}`]: [
    { id: 'item_sue_microdespertares', grade: GRADE.HABITUAL },
    { id: 'item_sue_inercia_matutina', grade: GRADE.UNKNOWN },
    { id: 'item_sue_latencia_alta', grade: GRADE.UNKNOWN },
    { id: 'item_sue_pesadez_corporal', grade: GRADE.UNKNOWN }
  ] }).result.axisTheta[axis];
  check(
    '[Rasch] los ítems respondidos "no lo sé" se tratan como dato faltante, no como categoría',
    r.items === 1,
    `items=${r.items} (1 HABITUAL afirmado; 3 UNKNOWN dropeados)`
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n${failed === 0 ? '🎉' : '🚨'} Motor de autoevaluación celular: ${passed}/${total} invariantes verdes.`);
if (failed > 0) {
  console.log(`   ${failed} invariante(s) roto(s).`);
  process.exit(1);
}
