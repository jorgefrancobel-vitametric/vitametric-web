// G-Level: L1
// Sustrato: Script Test
// Función: Suite de invariantes del modelo de escala de calificación de Rasch (js/rasch.js) — normalización, monotonicidad, acotación del prior, invarianza al subconjunto administrado y selección adaptativa
// v-version: 20260822.01

/**
 * Invariantes del motor Rasch (Rating Scale Model, Andrich 1978).
 *
 * El módulo existe para romper la dependencia del scoring por suma: el rasgo
 * latente θ debe vivir en la MISMA escala aunque el conjunto de ítems que se
 * administró cambie. Esa es la propiedad que habilita acortar el test sin
 * perder comparabilidad, y es la que esta suite falsa en serio.
 *
 * Invariantes verificados:
 *   R1 · Normalización      · las probabilidades por categoría suman 1 para todo θ y dificultad (sin NaN)
 *   R2 · Monotonicidad      · un patrón de mayor grado rinde θ mayor; θ_true alto ⇒ θ estimado más alto
 *   R3 · Invarianza al subconjunto · la MISMA persona estimada sobre subconjuntos distintos de ítems
 *        cae en el mismo entorno de θ (el techo y el piso no emigran con el conjunto)
 *   R4 · Acotación del prior · patrones extremos (todo 0 / todo máximo) no mandan θ al infinito
 *   R5 · Selección adaptativa · el ítem elegido es el más informativo en el θ actual y nunca
 *        devuelve un ítem inexistente/ausente del pool
 *   R6 · Criterio de paro    · respeta mínimos/máximos y precisión objetivo
 */

import Rasch from '../js/rasch.js';

const {
  categoryProbabilities, estimateTheta, confidenceInterval,
  selectNextItem, shouldStop, thetaToScale, difficultiesFromWeights
} = Rasch;

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

/** LCG con semilla fija: todo muestreo debe reproducirse en cada corrida. */
function makeRandom(seed = 20260822) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Genera la categoría de respuesta que el modelo predice para (θ, dificultad). */
function simulateResponse(rand, theta, difficulty, thresholds = Rasch.DEFAULT_THRESHOLDS) {
  const p = categoryProbabilities(theta, difficulty, thresholds);
  const u = rand();
  let acc = 0;
  for (let k = 0; k < p.length; k++) {
    acc += p[k];
    if (u <= acc) return k;
  }
  return p.length - 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// R1 · Normalización
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n── R1 · Normalización ──');

{
  let mal = 0;
  for (let t = -4; t <= 4; t += 0.25) {
    for (let d = -3; d <= 3; d += 0.5) {
      const p = categoryProbabilities(t, d);
      const suma = p.reduce((a, b) => a + b, 0);
      const rango = p.length;
      if (isNaN(suma) || Math.abs(suma - 1) > 1e-9 || p.some((x) => !isFinite(x))) mal++;
      if (rango !== 4) mal++; // 3 umbrales ⇒ 4 categorías
    }
  }
  check('[Normalización] sin NaN y categorías suman 1 en toda la grilla', mal === 0, `${mal} celdas mal`);
}

// ─────────────────────────────────────────────────────────────────────────────
// R2 · Monotonicidad
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n── R2 · Monotonicidad ──');

{
  // Con el mismo ítem, un grado mayor debe estimar θ mayor. Se usan patrones de
  // 6 ítems para que la diferencia sea robusta, no un único ítem ruidoso.
  const pool = [-1.5, -0.5, 0.5, 1.5, 2.0];
  const todoCero = pool.map((difficulty) => ({ difficulty, category: 0 }));
  const todoTres = pool.map((difficulty) => ({ difficulty, category: 3 }));
  const bajo = estimateTheta(todoCero).theta;
  const alto = estimateTheta(todoTres).theta;
  check('[Monotonicidad] todo grado 0 ⇒ θ < todo grado 3', alto > bajo + 2, `0⇒${bajo.toFixed(2)} · 3⇒${alto.toFixed(2)}`);
}

{
  // Para una semilla fija, la estimación MAP debe crecer con el θ real usado
  // para generar las respuestas: un θ_true alto jamás debe estimar por debajo
  // de uno bajo con el mismo diseño de ítems.
  const rand = makeRandom(11);
  const pool = [-1.5, -0.5, 0.5, 1.5];
  const resp = (thetaTrue) => pool.map((difficulty) => ({
    difficulty, category: simulateResponse(rand, thetaTrue, difficulty)
  }));
  const rBajo = estimateTheta(resp(-1.5)).theta;
  const rAlto = estimateTheta(resp(1.5)).theta;
  check('[Monotonicidad] la estimación desempeña correctamente entre θ_true bajo y alto', rAlto > rBajo, `θ_true -1.5⇒${rBajo.toFixed(2)} · +1.5⇒${rAlto.toFixed(2)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// R3 · Invarianza al subconjunto administrado
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n── R3 · Invarianza al subconjunto ──');

{
  // El argumento de existencia del módulo. La MISMA persona (θ_true fijo) se
  // estima sobre tres subconjuntos de ítems distintos; las estimaciones deben
  // caer en el mismo entorno, no emigrar con el conjunto.
  //
  // El umbral NO es una constante arbitraria: está atado al error estándar del
  // propio modelo. Cada subconjunto produce un θ con un se propio; bajo
  // invariancia, la diferencia máxima entre dos subconjuntos debe caber dentro
  // del intervalo que el mismo modelo declara para su estimación (|Yi−Yj| ≤
  // 2.77·se ≈ el 95% de la diferencia de dos normales con ese se). Si la escala
  // emigrara con el conjunto —por contar ítems, por sesgo de dificultad— la
  // dispersión superaría ese intervalo aunque el se declarado no subiera. Por
  // eso es un falsador real, no una constante que se tunea a gusto.
  const pool = [-2.5, -1.8, -1.1, -0.4, 0.4, 1.1, 1.8, 2.5];
  const subsets = [
    pool.slice(0, 4),   // ítems fáciles
    pool.slice(4),      // ítems difíciles
    pool.filter((_, i) => i % 2 === 0) // mezcla dispersa
  ];
  const trueTheta = 1.0;

  let confluente = true;
  let peorSpan = 0;
  let peorSe = 0;
  for (let seed of [7, 13, 29, 53, 101, 149]) {
    const rand = makeRandom(seed);
    const results = subsets.map((sub) => {
      const resp = sub.map((difficulty) => ({
        difficulty, category: simulateResponse(rand, trueTheta, difficulty)
      }));
      return estimateTheta(resp);
    });
    const thetas = results.map((r) => r.theta);
    const ses = results.map((r) => r.se);
    const span = Math.max(...thetas) - Math.min(...thetas);
    const maxSe = Math.max(...ses);
    peorSpan = Math.max(peorSpan, span);
    peorSe = Math.max(peorSe, maxSe);
    // Manteniendo el 95% de la diferencia entre las dos estimaciones más
    // separadas, más un pequeño margen por la estimación discreta de la grilla.
    if (span > 2.77 * maxSe + 0.1) confluente = false;
  }
  check(
    '[Invarianza] la misma persona sobre subconjuntos distintos queda en el mismo entorno de θ',
    confluente,
    `peor span=${peorSpan.toFixed(2)} · peor se=${peorSe.toFixed(2)} · límite=2.77·se (${(2.77 * peorSe + 0.1).toFixed(2)})`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// R4 · Acotación del prior
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n── R4 · Acotación del prior ──');

{
  const pool = [-2.0, -1.0, 0.0, 1.0, 2.0];
  const todoCero = estimateTheta(pool.map((d) => ({ difficulty: d, category: 0 })));
  const todoMax = estimateTheta(pool.map((d) => ({ difficulty: d, category: 3 })));
  const vacio = estimateTheta([]);
  check('[Acotación] patrón extremo bajo no diverge a -∞', todoCero.theta > -4, `θ=${todoCero.theta.toFixed(2)} se=${todoCero.se.toFixed(2)}`);
  check('[Acotación] patrón extremo alto no diverge a +∞', todoMax.theta < 4, `θ=${todoMax.theta.toFixed(2)} se=${todoMax.se.toFixed(2)}`);
  check('[Acotación] sin respuestas devuelve θ=0 con el se del prior', vacio.theta === 0 && Math.abs(vacio.se - Rasch.PRIOR_SD) < 1e-9);
  check('[Acotación] existe se finito positivo siempre', todoMax.se > 0 && isFinite(todoMax.se));
}

// ─────────────────────────────────────────────────────────────────────────────
// R5 · Selección adaptativa
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n── R5 · Selección adaptativa ──');

{
  const pool = [
    { id: 'facil', difficulty: -2 },
    { id: 'medio', difficulty: 0 },
    { id: 'dificil', difficulty: 2 }
  ];
  const enCero = selectNextItem(0, pool);
  const enDos = selectNextItem(2, pool);
  check('[Selección] en θ=0 elige el ítem de dificultad intermedia', enCero && enCero.id === 'medio', JSON.stringify(enCero));
  check('[Selección] en θ=2 elige el ítem más difícil', enDos && enDos.id === 'dificil', JSON.stringify(enDos));
  check('[Selección] nunca devuelve un ítem ausente del pool', enCero && pool.some((i) => i.id === enCero.id));
  const vacioPool = selectNextItem(0, []);
  check('[Selección] pool vacío ⇒ null (no se inventa ítem)', vacioPool === null);
  const soloIncompletos = selectNextItem(0, [{ id: 'x' }]);
  check('[Selección] ítem sin dificultad numérica es ignorado', soloIncompletos === null);
}

// ─────────────────────────────────────────────────────────────────────────────
// R6 · Criterio de paro
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n── R6 · Criterio de paro ──');

{
  const noItems = shouldStop({ se: 0.2, administered: 5, poolSize: 0 });
  check('[Paro] sin ítems disponibles debe detener', noItems.stop === true && noItems.reason === 'sin ítems disponibles');

  const bajoMin = shouldStop({ se: 0.1, administered: 2, poolSize: 20 });
  check('[Paro] por debajo del mínimo nunca para aunque ya haya precisión', bajoMin.stop === false);

  const maxAlcanzado = shouldStop({ se: 0.9, administered: 12, poolSize: 20 }, { maxItems: 12 });
  check('[Paro] al tocar el máximo para aunque falte precisión', maxAlcanzado.stop === true);

  const precisa = shouldStop({ se: 0.3, administered: 5, poolSize: 20 }, { targetSe: 0.45 });
  check('[Paro] con precisión objetivo y mínimo satisfecho detiene', precisa.stop === true);

  const imprecisa = shouldStop({ se: 0.8, administered: 5, poolSize: 20 }, { targetSe: 0.45 });
  check('[Paro] sin precisión y sin límite detiene solo por agotar opciones', imprecisa.stop === false);
}

// ─────────────────────────────────────────────────────────────────────────────
// R7 · Escala 0-100 y dificultades derivadas
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n── R7 · Escala y dificultades ──');

{
  const lo = thetaToScale(-4);
  const hi = thetaToScale(4);
  const mid = thetaToScale(0);
  check('[Escala] θ extremo bajo ⇒ 0', lo === 0);
  check('[Escala] θ extremo alto ⇒ 100', hi === 100);
  check('[Escala] θ=0 ⇒ punto medio', mid === 50, `mid=${mid}`);
}

{
  const w = { a: 10, b: 30, c: 50 };
  const d = difficultiesFromWeights(w);
  const dOrd = Object.values(d);
  const ordenado = dOrd[0] < dOrd[1] && dOrd[1] < dOrd[2];
  check('[Dificultades] peso mayor ⇒ dificultad mayor (estandarización monótona)', ordenado, JSON.stringify(d));
  check('[Dificultades] entrada vacía devuelve objeto vacío', JSON.stringify(difficultiesFromWeights({})) === '{}');
}

// ─────────────────────────────────────────────────────────────────────────────
// R8-R11 · Validación estadística (añadido por claude-2 sobre la suite de codebuff)
// ─────────────────────────────────────────────────────────────────────────────

// makeRandom y simulateResponse ya están definidos arriba en esta misma suite.

console.log('\n── R8 · Estabilidad numérica ──');

{
  // Sin restar el máximo antes de exponenciar, estos valores desbordan y las
  // probabilidades salen NaN. Es el modo de fallo silencioso clásico del modelo.
  const extremos = [[40, -40], [-40, 40], [710, 0], [0, -710]];
  const finitas = extremos.every(([t, d]) => {
    const p = Rasch.categoryProbabilities(t, d);
    return p.every(Number.isFinite) && Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-9;
  });
  check('[Estabilidad] no hay desbordamiento de exp() en valores extremos', finitas);
}

console.log('\n── R9 · Información de Fisher ──');

{
  const dificultad = 1.0;
  let mejorTheta = null;
  let mejorInfo = -Infinity;
  for (let theta = -4; theta <= 4; theta += 0.05) {
    const info = Rasch.itemInformation(theta, dificultad);
    if (info > mejorInfo) { mejorInfo = info; mejorTheta = theta; }
  }
  check(
    '[Información] es máxima en torno a la dificultad del ítem',
    Math.abs(mejorTheta - dificultad) < 0.5,
    `máximo en θ=${mejorTheta.toFixed(2)} para dificultad ${dificultad}`
  );
}

console.log('\n── R10 · Recuperación de parámetros ──');

{
  /**
   * El estándar para comprobar que una implementación de IRT no está sesgada:
   * se generan respuestas desde un θ CONOCIDO y se verifica que la estimación lo
   * reencuentra, y que el intervalo declarado cubre de verdad. No requiere
   * pacientes — valida el estimador, no la calibración del catálogo.
   */
  const rand = makeRandom(7);
  const catalogo = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, -0.2, 0.9];
  const objetivos = [-1.5, -0.5, 0, 0.7, 1.5];
  const N = 300;

  const resumen = objetivos.map((thetaReal) => {
    let suma = 0;
    let dentroIC = 0;
    for (let rep = 0; rep < N; rep++) {
      const respuestas = catalogo.map((d) => ({ difficulty: d, category: simulateResponse(rand, thetaReal, d) }));
      const est = Rasch.estimateTheta(respuestas);
      suma += est.theta;
      const ic = Rasch.confidenceInterval(est);
      if (thetaReal >= ic.lower && thetaReal <= ic.upper) dentroIC++;
    }
    return { thetaReal, medio: suma / N, cobertura: dentroIC / N };
  });

  resumen.forEach((r) => {
    console.log(`   θ real ${r.thetaReal.toFixed(2)} → θ̂ medio ${r.medio.toFixed(3)} · cobertura IC95 ${(r.cobertura * 100).toFixed(1)}%`);
  });

  const sesgoMaximo = Math.max(...resumen.map((r) => Math.abs(r.medio - r.thetaReal)));
  check('[Recuperación] el sesgo del estimador es menor a 0.3 logits', sesgoMaximo < 0.3, `sesgo máximo ${sesgoMaximo.toFixed(3)}`);

  // El MAP encoge hacia el centro por efecto del prior: el sesgo debe ir SIEMPRE
  // en esa dirección. Un sesgo que aleja del centro indicaría un error de signo.
  const encoge = resumen.every((r) => Math.abs(r.medio) <= Math.abs(r.thetaReal) + 0.05);
  check('[Recuperación] el sesgo encoge hacia el centro, como corresponde al prior', encoge);

  const coberturaMinima = Math.min(...resumen.map((r) => r.cobertura));
  check('[Recuperación] el IC95 cubre el valor real en ≥85% de las réplicas', coberturaMinima >= 0.85, `cobertura mínima ${(coberturaMinima * 100).toFixed(1)}%`);
}

console.log('\n── R11 · Ahorro real del test adaptativo ──');

{
  // La promesa de producto —menos preguntas, misma precisión— tiene que medirse,
  // no asumirse: si el adaptativo no ahorra ítems, no vale su complejidad.
  const rand = makeRandom(555);
  const catalogo = [-2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3, -0.8, 0.3, 1.2]
    .map((d, i) => ({ id: `i${i}`, difficulty: d }));
  const objetivo = 0.45;
  const N = 100;

  let sumaAdaptativo = 0;
  let sumaFijo = 0;

  for (let rep = 0; rep < N; rep++) {
    const thetaReal = (rand() * 4) - 2;

    let pool = [...catalogo];
    let respuestas = [];
    let est = Rasch.estimateTheta(respuestas);
    let n = 0;
    while (pool.length && n < catalogo.length) {
      const siguiente = Rasch.selectNextItem(est.theta, pool);
      pool = pool.filter((it) => it.id !== siguiente.id);
      respuestas.push({ difficulty: siguiente.difficulty, category: simulateResponse(rand, thetaReal, siguiente.difficulty) });
      est = Rasch.estimateTheta(respuestas);
      n++;
      if (n >= 3 && est.se <= objetivo) break;
    }
    sumaAdaptativo += n;

    respuestas = [];
    n = 0;
    for (const it of catalogo) {
      respuestas.push({ difficulty: it.difficulty, category: simulateResponse(rand, thetaReal, it.difficulty) });
      n++;
      if (n >= 3 && Rasch.estimateTheta(respuestas).se <= objetivo) break;
    }
    sumaFijo += n;
  }

  const mediaAdaptativo = sumaAdaptativo / N;
  const mediaFijo = sumaFijo / N;
  console.log(`   ítems hasta SE≤${objetivo} — adaptativo ${mediaAdaptativo.toFixed(2)} · orden fijo ${mediaFijo.toFixed(2)}`);

  check(
    '[Adaptativo] no necesita más ítems que recorrer el banco en orden fijo',
    mediaAdaptativo <= mediaFijo,
    `adaptativo ${mediaAdaptativo.toFixed(2)} vs fijo ${mediaFijo.toFixed(2)}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n${failed === 0 ? '🎉' : '🚨'} Núcleo Rasch: ${passed}/${total} invariantes verdes.`);
if (failed > 0) {
  console.log(`   ${failed} invariante(s) roto(s).`);
  process.exit(1);
}
