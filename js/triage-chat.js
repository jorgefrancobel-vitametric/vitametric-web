// G-Level: L1
// Sustrato: Contrato Ejecutable
// Función: Motor conversacional del Mapa de Señales — anamnesis adaptativa gobernada por contrato, con selección de pregunta por falsación y frontera epistémica ejecutable
// v-version: 20260822.01

/**
 * Anamnesis adaptativa con arnés lógico.
 *
 * La caja china: la conversación la conduce una máquina determinista y el
 * lenguaje solo articula lo que la máquina ya decidió. Ningún turno se emite sin
 * pasar por el contrato, y el contrato prohíbe que el test se atribuya
 * mediciones que no hace.
 *
 * Tres decisiones de diseño que separan esto de un cuestionario con burbujas:
 *
 * 1. La siguiente pregunta se elige por INFORMACIÓN DE FISHER, no por orden fijo.
 *    El ítem más informativo es aquel cuya respuesta es más incierta en la
 *    estimación actual: el que más puede REFUTARLA. Preguntar para falsar la
 *    hipótesis provisional y preguntar para ganar precisión resultan ser la misma
 *    operación, y por eso el test se acorta sin perder rigor.
 *
 * 2. El motor devuelve al paciente su interpretación provisional y le pide que la
 *    corrija (turno de reflexión). Un cuestionario acumula respuestas; una
 *    anamnesis las contrasta. Si el paciente la rechaza, la hipótesis se penaliza
 *    y el motor vuelve a preguntar en ese eje.
 *
 * 3. Cada turno declara qué puede afirmarse y con qué certeza. El campo
 *    `allowedClaims` es lo único que un articulador de lenguaje —hoy plantillas,
 *    mañana un modelo— tiene permitido convertir en prosa.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./rasch.js'), require('./mapa-senales-engine.js'), require('./interpretation.js'));
  } else {
    root.VitametricTriageChat = factory(root.Rasch, root.VitametricTestEngine, root.VitametricInterpretation);
  }
}(typeof self !== 'undefined' ? self : this, function (Rasch, Engine, Interpretation) {
  'use strict';

  // La lectura hermenéutica es opcional: sin ella el chat sigue dando su resultado
  // cuantitativo, solo que sin leer la estructura de las respuestas.
  const HAS_INTERPRETATION = !!(Interpretation && typeof Interpretation.read === 'function');

  const { AXES, GRADE, GRADE_LABELS, UNKNOWN_LABEL, BASE_DIMENSIONS, CONDITIONAL_DIMENSIONS } = Engine;

  /** Tipos de turno que el motor puede emitir. La UI no debe inventar otros. */
  const TURN = Object.freeze({
    FRAMING: 'FRAMING',
    QUESTION: 'QUESTION',
    REFLECTION: 'REFLECTION',
    RESULT: 'RESULT'
  });

  /**
   * Nivel epistémico de cada afirmación. Es el análogo clínico del PROVENANCE
   * del contrato semántico: distingue lo que la persona dijo, lo que el modelo
   * infirió y lo que solo un instrumento podría medir.
   */
  const EVIDENCE = Object.freeze({
    SELF_REPORT: 'SELF_REPORT',       // lo afirmó el paciente
    MODEL_ESTIMATE: 'MODEL_ESTIMATE', // lo estimó el modelo desde el autoreporte
    NOT_OBSERVABLE: 'NOT_OBSERVABLE'  // requiere instrumento; el test NO lo afirma
  });

  /**
   * Procedencia de una respuesta concreta. Es lo que decide si el sistema puede
   * decir "señalaste" (el paciente eligió la opción) o solo "por lo que me
   * contaste" (el sistema lo dedujo del texto libre). Sin esta marca, una
   * inferencia por reglas es indistinguible de una afirmación del paciente.
   */
  const SOURCE = Object.freeze({
    SELF_REPORT: 'self_report',
    INFERRED: 'inferred'
  });

  /** Certeza de una estimación, derivada de su error estándar. */
  const CERTAINTY = Object.freeze({
    PRELIMINARY: 'PRELIMINARY',
    PROBABLE: 'PROBABLE',
    ESTABLISHED: 'ESTABLISHED'
  });

  /**
   * Precisión objetivo por eje. No es un número de gusto: con cinco ejes
   * independientes, precisión y brevedad se compran una a costa de la otra, y la
   * aritmética del modelo lo fija — SE = 1/√(información + 1/σ²prior), con una
   * información media de 0.78 por ítem:
   *
   *   SE 0.55 → ~4 ítems/eje → ~20 preguntas   (medido: 21.3)
   *   SE 0.70 → ~3 ítems/eje → ~15 preguntas
   *   SE 0.80 → ~2 ítems/eje → ~10 preguntas
   *
   * Se elige 0.80: diez preguntas frente a las veintinueve del formulario, con
   * certeza PROBABLE por eje. La certeza alcanzada viaja en el resultado, así que
   * el recorte de longitud no se disimula — se declara.
   */
  const TARGET_SE = 0.80;
  const MIN_ITEMS_PER_AXIS = 2;
  const MAX_ITEMS_PER_AXIS = 6;

  /** Preguntas mínimas entre dos contrastes, para no interrogar en bucle. */
  const QUESTIONS_BETWEEN_REFLECTIONS = 3;

  /**
   * Nivel de rasgo por debajo del cual un eje no cambia ninguna conclusión.
   * θ=0 es la media del catálogo; un intervalo entero por debajo de ese punto
   * significa carga baja sin ambigüedad, y preguntar más solo alarga el test.
   */
  const RELEVANCE_THRESHOLD = 0;

  /**
   * Vocabulario que el motor NO puede emitir hacia el paciente: nombra
   * mediciones físicas, instrumentos no administrados o mecanismos que un
   * autoreporte no observa. La verificación se aplica al texto ya construido,
   * no a la intención de construirlo.
   */
  const FORBIDDEN = [
    'iph', 'acidez tisular', 'fluido intersticial', 'líquido intersticial',
    'glicación', 'biofísica intersticial', 'balance bioeléctrico',
    'microinflamación', 'resistencia periférica', 'hipoxemia', 'oxigenación',
    'simpático', 'parasimpático', 'vagal', 'glucémica', 'glucémico',
    'stop-bang', 'psqi', 'epworth', 'diagnóstico de', 'padeces', 'tienes apnea'
  ];

  /**
   * Guardián de salida. Todo texto dirigido al paciente pasa por aquí antes de
   * salir del motor: si contiene vocabulario prohibido se bloquea, y el llamador
   * recibe el motivo en vez de un texto que promete lo que el test no puede dar.
   */
  function checkUtterance(text) {
    const t = (text || '').toLowerCase();
    const hits = FORBIDDEN.filter((term) => t.includes(term));
    return { ok: hits.length === 0, violations: hits };
  }

  const ALL_DIMENSIONS = [...BASE_DIMENSIONS, ...Object.values(CONDITIONAL_DIMENSIONS)];

  const CONDITIONAL_IDS = new Set(Object.values(CONDITIONAL_DIMENSIONS).map((d) => d.id));

  /** Catálogo plano de ítems, con su eje principal y su dificultad por eje. */
  function buildCatalog() {
    const items = [];
    ALL_DIMENSIONS.forEach((dim) => {
      dim.items.forEach((it) => {
        items.push({
          id: it.id,
          dimensionId: dim.id,
          text: it.text,
          axis: dim.axis,
          weights: it.weights || {},
          conditional: CONDITIONAL_IDS.has(dim.id)
        });
      });
    });
    return items;
  }

  /** Dificultades por eje derivadas de los pesos, igual que en el motor de score. */
  function buildDifficulties(catalog) {
    const porEje = {};
    Object.keys(AXES).forEach((k) => { porEje[k] = {}; });
    catalog.forEach((it) => {
      Object.keys(it.weights).forEach((k) => { porEje[k][it.id] = it.weights[k]; });
    });
    const out = {};
    Object.keys(porEje).forEach((k) => { out[k] = Rasch.difficultiesFromWeights(porEje[k]); });
    return out;
  }

  function certaintyOf(se) {
    if (se <= 0.45) return CERTAINTY.ESTABLISHED;
    if (se <= 0.8) return CERTAINTY.PROBABLE;
    return CERTAINTY.PRELIMINARY;
  }

  /**
   * Opciones de respuesta. Se ofrece "no lo sé" siempre, porque hay síntomas que
   * requieren un observador —roncar, dejar de respirar— y forzar un sí/no ahí
   * fabrica un dato inexistente.
   */
  function answerOptions(t) {
    var _t = t || function(k, p) { return k; };
    return [
      { value: 0, label: _t('grade_0', null, { default: 'Nunca o casi nunca' }) },
      { value: GRADE.RARA_VEZ, label: _t('grade_1') },
      { value: GRADE.A_MENUDO, label: _t('grade_2') },
      { value: GRADE.HABITUAL, label: _t('grade_3') },
      { value: null, label: _t('grade_unknown') }
    ];
  }

  /**
   * Acuse determinista de lo que se entendió del texto libre.
   *
   * Sin esto, cuando el SLM no está listo el paciente escribe y recibe silencio
   * absoluto: la extracción por reglas sí corre, pero nada se lo dice. El acuse
   * repite SUS PROPIAS PALABRAS (`matchedPhrase`), no una traducción clínica —
   * así el sistema no afirma nada que el paciente no haya dicho, y él puede
   * corregir si el matcher entendió de más.
   *
   * @param {{matchedPhrase?: string}[]} symptoms - salida de extractSymptoms
   * @param {{modelLoading?: boolean}} [options]
   * @returns {{ text: string, evidence: string }}
   */
  function acknowledgeExtraction(symptoms, options) {
    const opts = options || {};
    const frases = [];
    (symptoms || []).forEach((s) => {
      const f = s && typeof s.matchedPhrase === 'string' ? s.matchedPhrase.trim() : '';
      if (f && frases.indexOf(f) === -1) frases.push(f);
    });

    const cola = opts.modelLoading
      ? ' El asistente local todavía está cargando, así que por ahora te respondo breve.'
      : '';

    if (!frases.length) {
      return {
        text: 'Te leo. De eso no alcancé a identificar señales concretas, pero queda anotado.'
          + ' Si quieres, cuéntamelo con otras palabras.' + cola,
        evidence: EVIDENCE.NOT_OBSERVABLE
      };
    }

    const entrecomilladas = frases.map((f) => `«${f}»`);
    const listado = entrecomilladas.length === 1
      ? entrecomilladas[0]
      : entrecomilladas.slice(0, -1).join(', ') + ' y ' + entrecomilladas[entrecomilladas.length - 1];

    return {
      // "Anoto" y no "tienes": el sistema registra lo dicho, no diagnostica.
      text: `Te leo. Anoto ${listado} a partir de lo que escribiste, así no vuelvo a preguntártelo.`
        + ' Si entendí de más, dímelo.' + cola,
      evidence: EVIDENCE.SELF_REPORT
    };
  }

  function createSession(config = {}) {
    const catalog = buildCatalog();
    const difficulties = buildDifficulties(catalog);
    const kioskMode = config.kiosk === true;
    // i18n: wrapper sobre VitametricI18n.t() o identidad (español nativo)
    const I18N = config.i18n || (typeof window !== 'undefined' && window.VitametricI18n) || null;
    function _t(key, params) {
      if (I18N && typeof I18N.t === 'function') return I18N.t(key, null, params);
      // fallback: devolver la clave o un default si se pasó
      return (params && params.default) || key;
    }

    const state = {
      answers: {},          // itemId → grade (número) | null ("no lo sé")
      answerSources: {},    // itemId → 'self_report' | 'inferred' (procedencia de la cópula)
      asked: [],            // orden de administración
      rejectedAxes: {},     // eje → veces que el paciente rechazó la interpretación
      framed: false,
      reflectedOn: {},          // eje → ya se contrastó con el paciente
      askedSinceReflection: 0,  // evita encadenar contrastes sin preguntar nada
      communicatedFocus: null,  // último eje que se le nombró al paciente
      causalLinks: [],           // enlaces causales extraídos por listenDeep()
      finished: false,
      baseline: null             // ES-Complex baseline para comparación longitudinal
    };

    /** Respuestas de un eje en el formato que espera el modelo. */
    function responsesFor(axis) {
      const out = [];
      catalog.forEach((it) => {
        if (!(it.id in state.answers)) return;      // no administrado
        const grade = state.answers[it.id];
        if (grade === null) return;                 // "no lo sé": se omite
        const difficulty = difficulties[axis] && difficulties[axis][it.id];
        if (typeof difficulty !== 'number') return; // no carga en este eje
        out.push({ difficulty, category: grade });
      });
      return out;
    }

    function estimateAll() {
      const out = {};
      Object.keys(AXES).forEach((axis) => {
        const est = Rasch.estimateTheta(responsesFor(axis));
        out[axis] = {
          axis,
          theta: est.theta,
          se: est.se,
          items: est.responses,
          certainty: certaintyOf(est.se),
          scale: Rasch.thetaToScale(est.theta)
        };
      });
      return out;
    }

    /**
     * Traduce las respuestas por ítem al formato por dimensión que esperan las
     * condiciones de branching del motor de score, que están escritas sobre
     * `selectedItemIds`. Solo cuentan los síntomas AFIRMADOS: un grado 0 es una
     * negación y un "no lo sé" no es evidencia de presencia.
     */
    function answersByDimension() {
      const out = {};
      catalog.forEach((it) => {
        if (!(it.id in state.answers)) return;
        if (!out[it.dimensionId]) out[it.dimensionId] = { selectedItemIds: [] };
        const grade = state.answers[it.id];
        if (typeof grade === 'number' && grade >= 1) out[it.dimensionId].selectedItemIds.push(it.id);
      });
      return out;
    }

    /**
     * Dimensiones desbloqueadas en este momento. Las condicionales solo entran
     * cuando su propia condición se cumple.
     *
     * Sin esto el chat preguntaba por pausas respiratorias y rigidez articular a
     * pacientes que no habían reportado un solo síntoma: el mismo gateo cruzado
     * que se cerró en el motor de score, reaparecido en la selección de ítems.
     * Detectado por freebuff con sonda propia y reproducido antes de corregir.
     */
    function unlockedDimensions() {
      // Modo kiosco: sin branching, solo las 5 dimensiones base.
      if (kioskMode) return new Set(BASE_DIMENSIONS.map((d) => d.id));

      const byDim = answersByDimension();
      const unlocked = new Set(BASE_DIMENSIONS.map((d) => d.id));
      Object.values(CONDITIONAL_DIMENSIONS).forEach((dim) => {
        if (dim.condition(byDim)) unlocked.add(dim.id);
      });
      return unlocked;
    }

    /** Ítems del eje aún no administrados y cuya dimensión está desbloqueada. */
    function poolFor(axis) {
      const unlocked = unlockedDimensions();
      return catalog
        .filter((it) => !(it.id in state.answers)
          && unlocked.has(it.dimensionId)
          && typeof difficulties[axis][it.id] === 'number')
        .map((it) => ({ id: it.id, difficulty: difficulties[axis][it.id] }));
    }

    function itemsAskedIn(axis) {
      return state.asked.filter((id) => typeof difficulties[axis][id] === 'number').length;
    }

    /**
     * Elige el eje a interrogar: el de mayor incertidumbre entre los que aún no
     * cumplen su criterio de paro. Preguntar donde más se ignora es lo que hace
     * que el test converja rápido en vez de recorrer todo por igual.
     */
    function selectAxis(estimates) {
      let best = null;
      Object.keys(AXES).forEach((axis) => {
        const asked = itemsAskedIn(axis);
        const pool = poolFor(axis);
        const est = estimates[axis];

        // Paro por decisión, no solo por precisión. En los extremos del rasgo la
        // información por ítem cae, así que exigir un error estándar fijo hace que
        // el paciente SIN síntomas reciba más preguntas que uno cargado — justo al
        // revés de lo razonable. Si el intervalo completo ya está por debajo del
        // nivel donde algo sería relevante, seguir preguntando no puede cambiar la
        // conclusión: solo alarga el test.
        const techoDelIntervalo = est.theta + 1.96 * est.se;
        if (asked >= MIN_ITEMS_PER_AXIS && techoDelIntervalo < RELEVANCE_THRESHOLD) return;

        const stop = Rasch.shouldStop(
          { se: est.se, administered: asked, poolSize: pool.length },
          { targetSe: TARGET_SE, minItems: MIN_ITEMS_PER_AXIS, maxItems: MAX_ITEMS_PER_AXIS }
        );
        if (stop.stop) return;
        // Un eje cuya interpretación fue rechazada por el paciente sube de
        // prioridad: hay que volver a mirarlo, no darlo por resuelto.
        const urgencia = estimates[axis].se + (state.rejectedAxes[axis] || 0) * 0.5;
        if (!best || urgencia > best.urgencia) best = { axis, urgencia };
      });
      return best ? best.axis : null;
    }

    /** El eje con mayor carga estimada, si su certeza alcanza para nombrarlo. */
    function dominantAxis(estimates) {
      const ordenados = Object.values(estimates).sort((a, b) => b.theta - a.theta);
      return ordenados[0];
    }

    /**
     * ¿La ventaja del primer eje sobre el segundo se distingue del ruido?
     *
     * Ordenar por θ siempre produce un ganador, aunque la diferencia sea azar. Un
     * caso medido: θ=0.30 contra θ=0.00 con error combinado 0.92 — el bot anunciaba
     * "es donde más carga aparece" sobre una diferencia de 4 puntos en la escala,
     * que no significa nada. Se exige que la diferencia supere el error combinado
     * de ambas estimaciones antes de nombrar un área dominante.
     */
    function dominanceIsDistinguishable(estimates) {
      const ordenados = Object.values(estimates).sort((a, b) => b.theta - a.theta);
      const [primero, segundo] = ordenados;
      if (!segundo) return { distinguishable: true, first: primero, second: null };
      const diferencia = primero.theta - segundo.theta;
      const errorCombinado = Math.sqrt(primero.se * primero.se + segundo.se * segundo.se);
      return {
        distinguishable: diferencia > errorCombinado,
        margin: diferencia,
        combinedError: errorCombinado,
        first: primero,
        second: segundo
      };
    }

    /**
     * Evidencia contable de un eje: lo que el paciente efectivamente respondió.
     *
     * Un "54 de 100" no tiene referente — el 50 es la media del catálogo, que no
     * significa nada para quien contesta. En cambio "3 de las 5 señales, dos casi
     * a diario" es verificable por el propio paciente, que es el único anclaje
     * honesto mientras no existan normas poblacionales.
     */
    function axisEvidence(axis) {
      const relevantes = catalog.filter((it) => typeof difficulties[axis][it.id] === 'number');
      const administrados = relevantes.filter((it) => it.id in state.answers);
      const grados = administrados.map((it) => state.answers[it.id]);
      const afirmados = grados.filter((g) => typeof g === 'number' && g >= 1);
      const frecuentes = grados.filter((g) => g === 3);
      const desconocidos = grados.filter((g) => g === null);
      // Inferidos: afirmados que el paciente NO señaló, sino que el sistema
      // dedujo de su texto libre. Sostienen una cópula más débil.
      const inferidos = administrados.filter((it) => {
        const g = state.answers[it.id];
        return typeof g === 'number' && g >= 1
          && state.answerSources[it.id] === SOURCE.INFERRED;
      });
      return {
        asked: administrados.length,
        pool: relevantes.length,
        affirmed: afirmados.length,
        frequent: frecuentes.length,
        unknown: desconocidos.length,
        inferred: inferidos.length
      };
    }

    /** Frase de evidencia, en los términos en que el paciente respondió. */
    function evidencePhrase(axis) {
      const e = axisEvidence(axis);
      if (!e.asked) return 'todavía no te he preguntado por esta área';
      if (!e.affirmed) return `de ${e.asked} ${e.asked === 1 ? 'pregunta' : 'preguntas'} en esta área, no señalaste ninguna`;
      // La intensidad importa tanto como el recuento: tres señales ocasionales y
      // tres habituales no describen la misma situación.
      // El verbo cambia con la procedencia: "señalaste" solo si todo el recuento
      // salió de opciones que el paciente eligió. Si hay deducciones, el sujeto
      // de la frase deja de ser él.
      const verbo = e.inferred
        ? `aparecen ${e.affirmed} de ${e.asked}`
        : `señalaste ${e.affirmed} de ${e.asked}`;
      const partes = [`${verbo} ${e.asked === 1 ? 'señal' : 'señales'}`];
      if (e.frequent) {
        partes.push(`${e.frequent} de forma habitual`);
      } else {
        partes.push('ninguna de forma habitual');
      }
      if (e.unknown) partes.push(`${e.unknown} sin poder responder`);
      // La procedencia se dice, no se esconde: si parte del recuento salió de lo
      // que el paciente escribió libremente, no puede presentarse como algo que
      // él "señaló" en una opción.
      if (e.inferred) {
        partes.push(`${e.inferred} ${e.inferred === 1 ? 'deducida' : 'deducidas'} de lo que me contaste`);
      }
      return partes.join(', ');
    }

    function emit(turn) {
      // Ningún turno sale sin pasar el guardián: el texto que llega al paciente
      // no puede prometer lo que el instrumento no hace.
      const textos = [turn.text, ...(turn.allowedClaims || []).map((c) => c.text)].filter(Boolean);
      const violations = textos.flatMap((t) => checkUtterance(t).violations);
      if (violations.length) {
        return {
          type: turn.type,
          blocked: true,
          violations,
          text: 'No puedo formular esa respuesta dentro de lo que este cuestionario puede afirmar.',
          allowedClaims: []
        };
      }
      return turn;
    }

    return {
      TURN,
      EVIDENCE,
      CERTAINTY,

      state: () => ({
        answers: { ...state.answers },
        answerSources: { ...state.answerSources },
        asked: [...state.asked],
        finished: state.finished,
        estimates: estimateAll()
      }),

      /**
       * Registra una respuesta. `grade` es 0-3, o null para "no lo sé".
       *
       * `source` fija la procedencia de la cópula y por tanto lo que el
       * articulador tiene permitido afirmar:
       *   - 'self_report' (default): el paciente eligió la opción. Cópula
       *     existencial sobre el reporte ("señalaste X").
       *   - 'inferred': el sistema lo dedujo del texto libre. La afirmación es
       *     una lectura del sistema, no algo que el paciente haya señalado, y
       *     degrada el eje a MODEL_ESTIMATE.
       */
      answer(itemId, grade, source = SOURCE.SELF_REPORT) {
        const item = catalog.find((it) => it.id === itemId);
        if (!item) throw new Error(`Ítem desconocido: ${itemId}`);

        // Cap por eje: no más de MAX_ITEMS_PER_AXIS respuestas afirmadas.
        // La pregunta adaptativa ya limita cuántos ítems se PRESENTAN, pero las
        // respuestas inferidas desde texto libre pueden colar ítems extra que el
        // sistema no habría preguntado por sí mismo.
        if (!(itemId in state.answers)) {
          const axisAnswered = Object.keys(state.answers).filter((id) => {
            const ci = catalog.find((c) => c.id === id);
            return ci && ci.axis === item.axis && state.answers[id] !== null;
          }).length;
          if (axisAnswered >= MAX_ITEMS_PER_AXIS) {
            state.cappedAxes = state.cappedAxes || new Set();
            state.cappedAxes.add(item.axis);
            return this;
          }
        }

        const valor = (grade === null || grade === undefined)
          ? null
          : Math.max(0, Math.min(3, Number(grade)));
        state.answers[itemId] = valor;
        state.answerSources[itemId] = source === SOURCE.INFERRED
          ? SOURCE.INFERRED
          : SOURCE.SELF_REPORT;
        if (!state.asked.includes(itemId)) state.asked.push(itemId);
        return this;
      },

      /**
       * Establece un baseline ES-Complex para comparación longitudinal.
       * @param {object} baseline - { scanDate, axes: { autonomo: {score}, ... } }
       */
      setBaseline(baseline) {
        state.baseline = baseline || null;
        return this;
      },

      /**
       * Acumula enlaces causales extraídos del texto libre del paciente.
       * Se pasan a interpretation.read() al final para modular la confianza
       * de las constelaciones.
       */
      addCausalLinks(links) {
        if (Array.isArray(links) && links.length) {
          state.causalLinks.push(...links);
        }
        return this;
      },

      /**
       * Respuesta del paciente al turno de reflexión. Rechazar la interpretación
       * no la borra: reabre el eje para seguir preguntando, que es lo que hace
       * un clínico cuando el paciente le dice "no, no es eso".
       */
      respondToReflection(axis, accepted) {
        state.reflectedOn[axis] = true;
        if (!accepted) state.rejectedAxes[axis] = (state.rejectedAxes[axis] || 0) + 1;
        return this;
      },

      /** Siguiente turno de la conversación. */
      next() {
        const estimates = estimateAll();

        if (!state.framed) {
          state.framed = true;
          return emit({
            type: TURN.FRAMING,
            text: _t('chat_framing'),
            allowedClaims: [{
              text: _t('chat_disclaimer'),
              evidence: EVIDENCE.SELF_REPORT
            }],
            options: [{ value: 'ok', label: _t('ui_consent_accept') }]
          });
        }

        const axis = selectAxis(estimates);

        // Antes de cerrar un eje con carga alta, se contrasta con el paciente.
        const conCarga = state.askedSinceReflection >= QUESTIONS_BETWEEN_REFLECTIONS
          ? Object.values(estimates)
            .filter((e) => e.theta > 0 && e.certainty !== CERTAINTY.PRELIMINARY && !state.reflectedOn[e.axis])
          : [];
        if (conCarga.length) {
          const foco = conCarga.sort((a, b) => b.theta - a.theta)[0];
          const dominancia = dominanceIsDistinguishable(estimates);
          state.reflectedOn[foco.axis] = true;
          state.askedSinceReflection = 0;

          // Cuando dos áreas no se distinguen entre sí, el modelo no tiene con qué
          // elegir — pero el paciente sí. Preguntarle a él es mejor información que
          // inventar un ganador, y es la clase de dato que ningún cálculo aporta.
          // El desempate solo tiene sentido si el segundo eje fue explorado. Con
          // θ=0 por prior y cero preguntas, compararlo sería enfrentar un dato
          // contra una suposición.
          const segundoExplorado = dominancia.second
            && axisEvidence(dominancia.second.axis).affirmed > 0;

          if (!dominancia.distinguishable && segundoExplorado) {
            const a = AXES[dominancia.first.axis];
            const b = AXES[dominancia.second.axis];
            // No se toca `communicatedFocus`: si antes se afirmó un área dominante,
            // ese compromiso sigue vivo y habrá que declarar si al final cambia.
            // Borrarlo aquí haría desaparecer la contradicción sin resolverla.
            return emit({
              type: TURN.REFLECTION,
              axis: foco.axis,
              ambiguous: true,
              text: _t('chat_reflection_ambiguous', { area1: a.patientLabel, area2: b.patientLabel }),
              allowedClaims: [{
                text: `En ${a.patientLabel} ${evidencePhrase(dominancia.first.axis)}; `
                  + `en ${b.patientLabel} ${evidencePhrase(dominancia.second.axis)}. `
                  + 'La diferencia entre ambas es menor que el margen de error, así que no puedo ordenarlas por mi cuenta.',
                evidence: EVIDENCE.MODEL_ESTIMATE,
                certainty: CERTAINTY.PRELIMINARY
              }],
              options: [
                { value: dominancia.first.axis, label: a.patientLabel.charAt(0).toUpperCase() + a.patientLabel.slice(1) },
                { value: dominancia.second.axis, label: b.patientLabel.charAt(0).toUpperCase() + b.patientLabel.slice(1) },
                { value: 'ninguna', label: 'Ninguna de las dos' }
              ]
            });
          }

          // Sin dominancia distinguible no se anuncia un "área que más pesa": se
          // contrasta lo reportado en esa área, sin ordenar nada.
          const puedeAfirmarDominancia = dominancia.distinguishable;
          // Igual que arriba: solo una afirmación de dominancia actualiza el
          // compromiso; un contraste sin ranking no lo crea ni lo borra.
          if (puedeAfirmarDominancia) state.communicatedFocus = foco.axis;            return emit({
              type: TURN.REFLECTION,
              axis: foco.axis,
              ranked: puedeAfirmarDominancia,
              text: puedeAfirmarDominancia
                ? _t('chat_reflection_dominant', { area: AXES[foco.axis].patientLabel })
                : _t('chat_reflection_uncertain', { area: AXES[foco.axis].patientLabel, phrase: evidencePhrase(foco.axis) }),
            allowedClaims: [{
              // La evidencia contable sustituye al número sin referente.
              text: `En ${AXES[foco.axis].shortName} ${evidencePhrase(foco.axis)}.`,
              // Si el recuento incluye deducciones del texto libre, la cópula
              // deja de ser existencial sobre el reporte: es lectura del sistema.
              evidence: axisEvidence(foco.axis).inferred
                ? EVIDENCE.MODEL_ESTIMATE
                : EVIDENCE.SELF_REPORT
            }],
            options: [
              { value: true, label: _t('chat_reflection_yes') },
              { value: false, label: _t('chat_reflection_no') }
            ]
          });
        }

        if (axis) {
          const siguiente = Rasch.selectNextItem(estimates[axis].theta, poolFor(axis));
          if (siguiente) {
            const item = catalog.find((it) => it.id === siguiente.id);
            state.askedSinceReflection++;
            return emit({
              type: TURN.QUESTION,
              axis,
              itemId: item.id,
              text: item.text + ' ' + _t('chat_freq_question'),
              // Se declara por qué se pregunta esto y no otra cosa: es el ítem
              // que más puede cambiar la estimación actual.
              rationale: {
                information: Number(siguiente.information.toFixed(3)),
                currentSe: Number(estimates[axis].se.toFixed(3)),
                criterion: 'máxima información de Fisher en la estimación actual'
              },
              allowedClaims: [],
              options: answerOptions(_t)
            });
          }
        }

        state.finished = true;
        const dominante = dominantAxis(estimates);
        const sinPrecision = Object.values(estimates).filter((e) => e.certainty === CERTAINTY.PRELIMINARY);

        // Lectura de la estructura de las respuestas: discordancias entre lo que
        // el cuerpo reporta y lo que la introspección acompaña, circunstancias sin
        // repercusión, y cruces entre ejes que ningún eje dice por separado.
        const lectura = HAS_INTERPRETATION
          ? Interpretation.read({ answers: state.answers, estimates, causalLinks: state.causalLinks })
          : { patterns: [], softenLowClaims: [], validity: { concern: false } };

        // Cada lectura viaja con su contra-lectura pegada: nunca se afirma un
        // patrón sin decir en el mismo aliento qué NO significa.
        const claimsDeLectura = lectura.patterns.flatMap((p) => ([
          {
            text: p.meaning,
            evidence: EVIDENCE.MODEL_ESTIMATE,
            certainty: p.confidence === 'STRONG' ? CERTAINTY.ESTABLISHED
              : p.confidence === 'MODERATE' ? CERTAINTY.PROBABLE : CERTAINTY.PRELIMINARY,
            pattern: p.id,
            label: p.label
          },
          { text: p.notMeaning, evidence: EVIDENCE.NOT_OBSERVABLE, pattern: p.id, isLimit: true }
        ]));

        const dominancia = dominanceIsDistinguishable(estimates);

        /**
         * Banda verbal derivada de lo que la persona respondió, no del rasgo
         * abstracto. "Señalaste 3 de 4, dos habituales" es comprobable por quien
         * contestó; "54 de 100" no lo es.
         */
        const bandOf = (axis) => {
          const e = axisEvidence(axis);
          if (!e.asked) return 'sin explorar';
          if (!e.affirmed) return 'sin señales';
          const proporcion = e.affirmed / e.asked;
          if (e.frequent >= 2 || (proporcion >= 0.75 && e.frequent >= 1)) return 'señales frecuentes';
          if (proporcion >= 0.5) return 'varias señales';
          return 'algunas señales';
        };

        const axisSummaries = Object.values(estimates)
          .map((est) => ({
            axis: est.axis,
            name: AXES[est.axis].shortName,
            icon: AXES[est.axis].icon,
            color: AXES[est.axis].color,
            band: bandOf(est.axis),
            evidence: axisEvidence(est.axis),
            phrase: evidencePhrase(est.axis),
            scale: est.scale,
            certainty: est.certainty,
            theta: est.theta
          }))
          .sort((a, b) => b.theta - a.theta);

        // Titular en lenguaje llano. Si nada destaca de verdad, se dice — es más
        // informativo que coronar a un ganador por diferencias de ruido.
        const conSenales = axisSummaries.filter((s) => s.evidence.affirmed > 0);
        let headline;
        if (!conSenales.length) {
          headline = _t('chat_result_headline_none');
        } else if (dominancia.distinguishable) {
          const top = axisSummaries[0];
          headline = _t('chat_result_headline_single', { area: top.name.toLowerCase(), phrase: top.phrase });
        } else {
          const nombres = conSenales.slice(0, 2).map((s) => s.name.toLowerCase());
          headline = _t('chat_result_headline_multi', { areas: nombres.join(' y ') });
        }

        // Baseline ES-Complex: comparar autoreporte actual contra medición física previa.
        var baselineComparison = null;
        if (state.baseline && state.baseline.axes) {
          baselineComparison = { scanDate: state.baseline.scanDate, device: state.baseline.device, axes: {} };
          Object.keys(state.baseline.axes).forEach(function (k) {
            var curEst = estimates[k];
            var curScore = curEst ? Math.round(curEst.scale || 0) : 0;
            var blScore = state.baseline.axes[k].score;
            var delta = curScore - blScore;
            baselineComparison.axes[k] = {
              baseline: blScore,
              current: curScore,
              delta: delta,
              trend: delta > 5 ? 'worse' : delta < -5 ? 'better' : 'stable',
              label: state.baseline.axes[k].label || ''
            };
          });
        }

        return emit({
          type: TURN.RESULT,
          text: headline,
          headline,
          axisSummaries,
          dominanceDistinguishable: dominancia.distinguishable,
          estimates,
          dominant: dominante.axis,
          itemsAsked: state.asked.length,
          catalogSize: catalog.length,
          cappedAxes: state.cappedAxes ? [...state.cappedAxes] : [],
          baselineComparison: baselineComparison,
          interpretation: lectura,
          allowedClaims: [
            ...claimsDeLectura,
            // Si durante la conversación se le nombró otro foco, el cambio se
            // declara. Revisar una hipótesis con datos nuevos es correcto; dejar
            // que el paciente descubra la contradicción por su cuenta, no.
            ...(state.communicatedFocus && state.communicatedFocus !== dominante.axis ? [{
              text: _t('chat_result_focus_changed', { old: AXES[state.communicatedFocus].shortName, new: AXES[dominante.axis].shortName }),
              evidence: EVIDENCE.MODEL_ESTIMATE,
              certainty: dominante.certainty,
              revision: { from: state.communicatedFocus, to: dominante.axis }
            }] : []),
            ...(conSenales.length ? [{
              text: dominancia.distinguishable
                ? _t('chat_result_top_area', { area: axisSummaries[0].name, phrase: axisSummaries[0].phrase })
                : _t('chat_result_multi_area', { areas: conSenales.slice(0, 2).map((s) => s.name).join(' y ') }),
              evidence: Object.values(state.answerSources).includes(SOURCE.INFERRED)
                ? EVIDENCE.MODEL_ESTIMATE
                : EVIDENCE.SELF_REPORT
            }] : [{
              text: _t('chat_result_none'),
              evidence: EVIDENCE.SELF_REPORT
            }]),
            {
              text: _t('chat_result_needs_clinic'),
              evidence: EVIDENCE.NOT_OBSERVABLE
            },
            ...(sinPrecision.length ? [{
              text: `Quedaron áreas con poca información para pronunciarse: `
                + sinPrecision.map((e) => AXES[e.axis].shortName).join(', ') + '.',
              evidence: EVIDENCE.MODEL_ESTIMATE,
              certainty: CERTAINTY.PRELIMINARY
            }] : [])
          ]
        });
      }
    };
  }

  return {
    TURN,
    EVIDENCE,
    CERTAINTY,
    SOURCE,
    FORBIDDEN,
    TARGET_SE,
    MIN_ITEMS_PER_AXIS,
    MAX_ITEMS_PER_AXIS,
    checkUtterance,
    buildCatalog,
    acknowledgeExtraction,
    createSession
  };
}));
