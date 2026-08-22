// G-Level: L1
// Sustrato: Contrato Ejecutable
// Función: Modelo de escala de calificación de Rasch — estimación del rasgo latente, error estándar y selección adaptativa por información de Fisher
// v-version: 20260822.01

/**
 * Modelo de Escala de Calificación (Rating Scale Model, Andrich 1978).
 *
 * Por qué existe este módulo: sumar pesos y dividir entre el máximo hace que el
 * resultado dependa de QUÉ ítems se administraron. Dos personas con la misma
 * carga real puntúan distinto si una recorrió más preguntas, y una misma persona
 * no es comparable consigo misma entre aplicaciones. Estimar un rasgo latente θ
 * rompe esa dependencia: θ vive en la misma escala aunque el conjunto de ítems
 * administrado cambie, que es precisamente lo que permite acortar el test sin
 * perder comparabilidad.
 *
 * El módulo es agnóstico de dominio: no sabe de síntomas, ejes ni clínica. Recibe
 * ítems con una dificultad y respuestas con una categoría, y devuelve θ con su
 * error. Cualquier contenido que lo use aporta su propio catálogo.
 *
 * ADVERTENCIA DE CALIBRACIÓN: los parámetros de dificultad que reciba este módulo
 * son a priori mientras no existan datos de respuesta reales. La estructura del
 * modelo es correcta; los valores concretos son una hipótesis que solo una
 * muestra puede confirmar o refutar. θ estimado con parámetros no calibrados es
 * comparable internamente, no es una medida absoluta.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Rasch = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Umbrales de paso entre categorías, compartidos por todos los ítems (es lo que
   * distingue al Rating Scale Model del Partial Credit Model: una sola estructura
   * de escala para todo el instrumento, que es lo apropiado cuando todos los ítems
   * usan las mismas anclas de frecuencia).
   *
   * Valores a priori equiespaciados: sin datos no hay base para asimetrías.
   */
  const DEFAULT_THRESHOLDS = Object.freeze([-1, 0, 1]);

  const THETA_MIN = -4;
  const THETA_MAX = 4;
  const THETA_STEP = 0.05;

  /** Desviación del prior N(0, σ²) usado para el estimador MAP. */
  const PRIOR_SD = 1.5;

  /**
   * Probabilidad de cada categoría de respuesta dado θ.
   *
   * En el RSM la categoría k acumula los pasos 1..k: superar el paso m cuesta
   * (θ − dificultad − τ_m). Se normaliza sobre todas las categorías.
   *
   * @param {number} theta rasgo latente
   * @param {number} difficulty dificultad del ítem, en logits
   * @param {number[]} thresholds umbrales de paso (longitud = nº categorías − 1)
   * @returns {number[]} probabilidades por categoría, suman 1
   */
  function categoryProbabilities(theta, difficulty, thresholds = DEFAULT_THRESHOLDS) {
    const terms = [0];
    let acc = 0;
    for (let k = 0; k < thresholds.length; k++) {
      acc += theta - difficulty - thresholds[k];
      terms.push(acc);
    }

    // Se resta el máximo antes de exponenciar: con θ en los extremos, exp() se
    // desborda y las probabilidades salen NaN.
    const max = Math.max.apply(null, terms);
    const exps = terms.map((t) => Math.exp(t - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map((e) => e / sum);
  }

  /** Puntaje esperado del ítem dado θ. */
  function expectedScore(theta, difficulty, thresholds = DEFAULT_THRESHOLDS) {
    const p = categoryProbabilities(theta, difficulty, thresholds);
    return p.reduce((acc, prob, k) => acc + k * prob, 0);
  }

  /**
   * Información de Fisher del ítem en θ: la varianza del puntaje del ítem.
   * Es máxima donde el ítem discrimina mejor, y es el criterio para elegir la
   * siguiente pregunta en un test adaptativo.
   */
  function itemInformation(theta, difficulty, thresholds = DEFAULT_THRESHOLDS) {
    const p = categoryProbabilities(theta, difficulty, thresholds);
    let e = 0;
    let e2 = 0;
    p.forEach((prob, k) => {
      e += k * prob;
      e2 += k * k * prob;
    });
    return e2 - e * e;
  }

  /**
   * Estima θ por máximo a posteriori sobre una grilla.
   *
   * Se usa grilla en vez de Newton-Raphson porque el espacio es unidimensional y
   * acotado: es exacto hasta la resolución elegida, no diverge y no necesita
   * derivadas. El prior evita que un patrón de respuestas extremo (todo cero o
   * todo el máximo) mande θ al infinito, que es el modo clásico de fallo de la
   * estimación por máxima verosimilitud pura.
   *
   * @param {Array<{difficulty:number, category:number}>} responses
   * @param {object} [options]
   * @param {number[]} [options.thresholds]
   * @returns {{theta:number, se:number, information:number, responses:number}}
   */
  function estimateTheta(responses, { thresholds = DEFAULT_THRESHOLDS } = {}) {
    const valid = (responses || []).filter(
      (r) => r && typeof r.difficulty === 'number' && Number.isInteger(r.category)
    );

    if (!valid.length) {
      return { theta: 0, se: PRIOR_SD, information: 0, responses: 0 };
    }

    let best = null;
    for (let theta = THETA_MIN; theta <= THETA_MAX + 1e-9; theta += THETA_STEP) {
      let logLik = -(theta * theta) / (2 * PRIOR_SD * PRIOR_SD); // log del prior
      for (const r of valid) {
        const p = categoryProbabilities(theta, r.difficulty, thresholds);
        const k = Math.max(0, Math.min(p.length - 1, r.category));
        logLik += Math.log(Math.max(p[k], 1e-12));
      }
      if (!best || logLik > best.logLik) best = { logLik, theta };
    }

    const theta = best.theta;
    const information = valid.reduce(
      (acc, r) => acc + itemInformation(theta, r.difficulty, thresholds), 0
    );

    // La información del prior se suma a la de los ítems: es lo que acota el error
    // cuando hay pocas respuestas.
    const posteriorInfo = information + 1 / (PRIOR_SD * PRIOR_SD);
    return {
      theta,
      se: 1 / Math.sqrt(posteriorInfo),
      information,
      responses: valid.length
    };
  }

  /** Intervalo de confianza al nivel indicado (por defecto 95%). */
  function confidenceInterval({ theta, se }, z = 1.96) {
    return { lower: theta - z * se, upper: theta + z * se };
  }

  /**
   * Elige el siguiente ítem a administrar: el que más información aporta en la
   * estimación actual de θ.
   *
   * Esto es lo que convierte el test en adaptativo. Y coincide con el criterio
   * epistémico correcto: el ítem más informativo es aquel cuyo resultado es más
   * incierto, es decir, el que tiene más capacidad de REFUTAR la estimación
   * provisional en vez de confirmarla.
   *
   * @param {number} theta estimación actual
   * @param {Array<{id:string, difficulty:number}>} pool ítems no administrados
   * @returns {{id:string, difficulty:number, information:number}|null}
   */
  function selectNextItem(theta, pool, { thresholds = DEFAULT_THRESHOLDS } = {}) {
    let best = null;
    (pool || []).forEach((item) => {
      if (!item || typeof item.difficulty !== 'number') return;
      const info = itemInformation(theta, item.difficulty, thresholds);
      if (!best || info > best.information) {
        best = { id: item.id, difficulty: item.difficulty, information: info };
      }
    });
    return best;
  }

  /**
   * Criterio de paro: se deja de preguntar cuando la precisión alcanzada basta,
   * o cuando ya no quedan ítems. Un test adaptativo sin criterio de paro es solo
   * un cuestionario largo con pasos extra.
   */
  function shouldStop({ se, administered, poolSize }, { targetSe = 0.45, minItems = 3, maxItems = 12 } = {}) {
    if (poolSize <= 0) return { stop: true, reason: 'sin ítems disponibles' };
    if (administered >= maxItems) return { stop: true, reason: 'máximo de ítems alcanzado' };
    if (administered < minItems) return { stop: false, reason: 'mínimo de ítems no alcanzado' };
    if (se <= targetSe) return { stop: true, reason: 'precisión objetivo alcanzada' };
    return { stop: false, reason: 'precisión insuficiente' };
  }

  /**
   * Convierte θ a una escala 0-100 creciente con la carga, para continuidad con
   * el resto del producto. Es una reexpresión monótona: no añade información ni
   * precisión, solo cambia de unidades.
   */
  function thetaToScale(theta, { min = THETA_MIN, max = THETA_MAX } = {}) {
    const clamped = Math.max(min, Math.min(max, theta));
    return Math.round(((clamped - min) / (max - min)) * 100);
  }

  /**
   * Deriva dificultades a priori a partir de pesos de juicio experto.
   *
   * Un ítem con peso alto describe una manifestación más severa, que solo se
   * afirma en niveles altos del rasgo: peso alto ⇒ dificultad alta. La conversión
   * es una estandarización, NO una calibración — se sustituye en cuanto haya
   * datos de respuesta reales.
   */
  function difficultiesFromWeights(weights) {
    const values = Object.values(weights || {});
    if (!values.length) return {};

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length;
    const sd = Math.sqrt(variance) || 1;

    const out = {};
    Object.keys(weights).forEach((id) => {
      out[id] = (weights[id] - mean) / sd;
    });
    return out;
  }

  return {
    DEFAULT_THRESHOLDS,
    PRIOR_SD,
    categoryProbabilities,
    expectedScore,
    itemInformation,
    estimateTheta,
    confidenceInterval,
    selectNextItem,
    shouldStop,
    thetaToScale,
    difficultiesFromWeights
  };
}));
