// G-Level: L1
// Sustrato: Script de Protocolo
// Función: Recalibra los umbrales de banda del test celular tras el paso a escala absoluta, maximizando la concordancia con la estratificación previa
// v-version: 20260821.01

/**
 * Recalibración de umbrales tras el fix de monotonicidad.
 *
 * El fix cambió el denominador de cada eje: antes era la carga máxima de las
 * dimensiones ADMINISTRADAS, ahora es la del catálogo completo. La métrica quedó
 * correcta, pero la escala se comprimió y los umbrales heredados ya no cortan
 * donde cortaban: sin recalibrar, pacientes que antes salían "moderado" ahora
 * saldrían "bajo".
 *
 * Criterio: el fix es de la MÉTRICA, no de la política clínica. Los umbrales
 * nuevos son los que reproducen la estratificación anterior en la mayor cantidad
 * posible de casos — no un número elegido a mano.
 *
 * SUPUESTO DECLARADO: sin datos de pacientes reales, la población se simula
 * marcando cada ítem con probabilidad p, con p ~ Uniforme(0, 0.8) por sujeto
 * (desde asintomáticos hasta muy cargados). Es un supuesto de forma, no un dato.
 * La calibración definitiva exige la distribución real de respuestas y su
 * contraste contra la medición ES-Complex.
 *
 * Uso: node scripts/recalibrate-thresholds.mjs
 */

import Engine from '../js/test-celular-engine.js';

const { AXES, SCORING_CONFIG, BASE_DIMENSIONS, CONDITIONAL_DIMENSIONS } = Engine;

const AXIS_KEYS = Object.keys(AXES);
const ALL_DIMENSIONS = [...BASE_DIMENSIONS, ...Object.values(CONDITIONAL_DIMENSIONS)];
const N_MUESTRAS = 8000;

function makeRandom(seed = 20260821) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Denominador del catálogo completo — el que usa el motor ya arreglado. */
const AXIS_MAX_ABSOLUTO = (() => {
  const max = {};
  AXIS_KEYS.forEach((k) => { max[k] = 0; });
  ALL_DIMENSIONS.forEach((dim) => dim.items.forEach((it) => {
    Object.keys(it.weights || {}).forEach((k) => { max[k] += it.weights[k]; });
  }));
  return max;
})();

/**
 * Simula un sujeto: elige ítems por dimensión y resuelve qué tamizajes se activan.
 * Devuelve los ejes crudos y el denominador que habría usado la lógica ANTERIOR.
 */
function simular(rand) {
  const p = rand() * 0.8;
  const answers = {};
  const seleccion = {};

  BASE_DIMENSIONS.forEach((dim) => {
    const picked = dim.items.filter(() => rand() < p).map((it) => it.id);
    seleccion[dim.id] = picked;
    answers[dim.id] = { selectedItemIds: picked };
  });

  const activas = [...BASE_DIMENSIONS];
  Object.values(CONDITIONAL_DIMENSIONS).forEach((dim) => {
    if (!dim.condition(answers)) return;
    activas.push(dim);
    const picked = dim.items.filter(() => rand() < p).map((it) => it.id);
    seleccion[dim.id] = picked;
  });

  const raw = {};
  const maxAdministrado = {};
  AXIS_KEYS.forEach((k) => { raw[k] = 0; maxAdministrado[k] = 0; });

  activas.forEach((dim) => {
    dim.items.forEach((it) => {
      Object.keys(it.weights || {}).forEach((k) => { maxAdministrado[k] += it.weights[k]; });
      if ((seleccion[dim.id] || []).includes(it.id)) {
        Object.keys(it.weights || {}).forEach((k) => { raw[k] += it.weights[k]; });
      }
    });
  });

  return { raw, maxAdministrado };
}

/** Score global y pico a partir de un denominador dado. */
function puntuar(raw, denominador) {
  const ejes = {};
  AXIS_KEYS.forEach((k) => {
    ejes[k] = Math.min(100, Math.round((raw[k] / (denominador[k] || 1)) * 100));
  });

  const w = SCORING_CONFIG.weights;
  let ponderado = 0;
  let pico = 0;
  AXIS_KEYS.forEach((k) => {
    ponderado += ejes[k] * w[k];
    if (ejes[k] > pico) pico = ejes[k];
  });

  const global = Math.min(100, Math.max(0, Math.round(ponderado * 0.7 + pico * 0.3)));
  return { global, pico };
}

function clasificar({ global, pico }, t) {
  if (global > t.highGlobal || pico >= t.highMaxAxis) return 2;
  if (global >= t.moderateGlobal || pico >= t.moderateMaxAxis) return 1;
  return 0;
}

// ── Muestreo ─────────────────────────────────────────────────────────────────

const rand = makeRandom();
const antes = [];
const ahora = [];

for (let i = 0; i < N_MUESTRAS; i++) {
  const { raw, maxAdministrado } = simular(rand);
  antes.push(puntuar(raw, maxAdministrado));
  ahora.push(puntuar(raw, AXIS_MAX_ABSOLUTO));
}

const bandaPrevia = antes.map((s) => clasificar(s, SCORING_CONFIG.thresholds));

function distribucion(bandas) {
  const c = [0, 0, 0];
  bandas.forEach((b) => { c[b]++; });
  return c.map((n) => `${((n / bandas.length) * 100).toFixed(1)}%`).join(' / ');
}

const NOMBRES = ['bajo', 'moderado', 'alto'];

console.log(`Muestras simuladas: ${N_MUESTRAS}`);
console.log(`Denominador absoluto por eje: ${JSON.stringify(AXIS_MAX_ABSOLUTO)}`);
console.log(`\nDistribución previa (bajo/moderado/alto): ${distribucion(bandaPrevia)}`);
console.log(`Umbrales heredados aplicados a la escala nueva: ${distribucion(ahora.map((s) => clasificar(s, SCORING_CONFIG.thresholds)))}`);

// ── Búsqueda de umbrales ─────────────────────────────────────────────────────
// Dos etapas: primero el corte de banda alta (concordancia binaria alto/no-alto),
// luego el de moderada condicionado al anterior. Evita un grid 4-D innecesario.

function buscarAlto() {
  let mejor = { aciertos: -1 };
  for (let hG = 5; hG <= 70; hG++) {
    for (let hA = 10; hA <= 90; hA++) {
      let aciertos = 0;
      for (let i = 0; i < N_MUESTRAS; i++) {
        const esAlto = ahora[i].global > hG || ahora[i].pico >= hA;
        if (esAlto === (bandaPrevia[i] === 2)) aciertos++;
      }
      if (aciertos > mejor.aciertos) mejor = { aciertos, hG, hA };
    }
  }
  return mejor;
}

function buscarModerado(hG, hA) {
  let mejor = { aciertos: -1 };
  for (let mG = 2; mG <= 60; mG++) {
    for (let mA = 5; mA <= 80; mA++) {
      const t = { highGlobal: hG, highMaxAxis: hA, moderateGlobal: mG, moderateMaxAxis: mA };
      let aciertos = 0;
      for (let i = 0; i < N_MUESTRAS; i++) {
        if (clasificar(ahora[i], t) === bandaPrevia[i]) aciertos++;
      }
      if (aciertos > mejor.aciertos) mejor = { aciertos, mG, mA };
    }
  }
  return mejor;
}

const alto = buscarAlto();
const moderado = buscarModerado(alto.hG, alto.hA);

const propuesta = {
  highGlobal: alto.hG,
  highMaxAxis: alto.hA,
  moderateGlobal: moderado.mG,
  moderateMaxAxis: moderado.mA
};

// ── Evaluación ───────────────────────────────────────────────────────────────

const bandaNueva = ahora.map((s) => clasificar(s, propuesta));
const matriz = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
bandaPrevia.forEach((prev, i) => { matriz[prev][bandaNueva[i]]++; });

const aciertos = matriz.reduce((n, fila, i) => n + fila[i], 0);
const accuracy = aciertos / N_MUESTRAS;

// Kappa de Cohen: cuánto de la concordancia excede al azar.
const filaTot = matriz.map((f) => f.reduce((a, b) => a + b, 0));
const colTot = [0, 1, 2].map((j) => matriz.reduce((n, f) => n + f[j], 0));
const esperado = [0, 1, 2].reduce((n, i) => n + (filaTot[i] * colTot[i]) / N_MUESTRAS, 0) / N_MUESTRAS;
const kappa = (accuracy - esperado) / (1 - esperado);

console.log(`\n── Umbrales propuestos ──`);
console.log(JSON.stringify(propuesta, null, 2));
console.log(`\nDistribución con umbrales propuestos: ${distribucion(bandaNueva)}`);
console.log(`Concordancia con la estratificación previa: ${(accuracy * 100).toFixed(2)}%  ·  κ = ${kappa.toFixed(4)}`);

console.log('\nMatriz de confusión (filas = banda previa, columnas = banda nueva):');
console.log(`${''.padEnd(11)}${NOMBRES.map((n) => n.padStart(10)).join('')}`);
matriz.forEach((fila, i) => {
  console.log(`${NOMBRES[i].padEnd(11)}${fila.map((n) => String(n).padStart(10)).join('')}`);
});

const desacuerdos = matriz.flatMap((fila, i) => fila.map((n, j) => (i === j ? 0 : n))).reduce((a, b) => a + b, 0);
console.log(`\nCasos reclasificados: ${desacuerdos} (${((desacuerdos / N_MUESTRAS) * 100).toFixed(2)}%)`);
console.log('Aplicar estos valores a SCORING_CONFIG.thresholds en js/test-celular-engine.js');
