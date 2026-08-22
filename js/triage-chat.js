// G-Level: L1
// Sustrato: Contrato Ejecutable
// Función: Motor conversacional del test de carga celular — anamnesis adaptativa gobernada por contrato, con selección de pregunta por falsación y frontera epistémica ejecutable
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
    module.exports = factory(require('./rasch.js'), require('./test-celular-engine.js'), require('./interpretation.js'));
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
  function answerOptions() {
    return [
      { value: 0, label: 'Nunca o casi nunca' },
      { value: GRADE.RARA_VEZ, label: GRADE_LABELS[1] },
      { value: GRADE.A_MENUDO, label: GRADE_LABELS[2] },
      { value: GRADE.HABITUAL, label: GRADE_LABELS[3] },
      { value: null, label: UNKNOWN_LABEL }
    ];
  }

  function createSession() {
    const catalog = buildCatalog();
    const difficulties = buildDifficulties(catalog);

    const state = {
      answers: {},          // itemId → grade (número) | null ("no lo sé")
      asked: [],            // orden de administración
      rejectedAxes: {},     // eje → veces que el paciente rechazó la interpretación
      framed: false,
      reflectedOn: {},          // eje → ya se contrastó con el paciente
      askedSinceReflection: 0,  // evita encadenar contrastes sin preguntar nada
      communicatedFocus: null,  // último eje que se le nombró al paciente
      finished: false
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
      return {
        asked: administrados.length,
        pool: relevantes.length,
        affirmed: afirmados.length,
        frequent: frecuentes.length,
        unknown: desconocidos.length
      };
    }

    /** Frase de evidencia, en los términos en que el paciente respondió. */
    function evidencePhrase(axis) {
      const e = axisEvidence(axis);
      if (!e.asked) return 'todavía no te he preguntado por esta área';
      if (!e.affirmed) return `de ${e.asked} ${e.asked === 1 ? 'pregunta' : 'preguntas'} en esta área, no señalaste ninguna`;
      // La intensidad importa tanto como el recuento: tres señales ocasionales y
      // tres habituales no describen la misma situación.
      const partes = [`señalaste ${e.affirmed} de ${e.asked} ${e.asked === 1 ? 'señal' : 'señales'}`];
      if (e.frequent) {
        partes.push(`${e.frequent} de forma habitual`);
      } else {
        partes.push('ninguna de forma habitual');
      }
      if (e.unknown) partes.push(`${e.unknown} sin poder responder`);
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
        asked: [...state.asked],
        finished: state.finished,
        estimates: estimateAll()
      }),

      /** Registra una respuesta. `grade` es 0-3, o null para "no lo sé". */
      answer(itemId, grade) {
        const item = catalog.find((it) => it.id === itemId);
        if (!item) throw new Error(`Ítem desconocido: ${itemId}`);
        const valor = (grade === null || grade === undefined)
          ? null
          : Math.max(0, Math.min(3, Number(grade)));
        state.answers[itemId] = valor;
        if (!state.asked.includes(itemId)) state.asked.push(itemId);
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
            text: 'Te voy a hacer unas preguntas sobre cómo te has sentido últimamente. '
              + 'Responde según lo que notes: no hay respuestas correctas, y si algo no lo sabes, dilo — '
              + 'es una respuesta válida y me sirve igual.',
            allowedClaims: [{
              text: 'Esta conversación recoge lo que tú reportas; no es un diagnóstico ni una medición.',
              evidence: EVIDENCE.SELF_REPORT
            }],
            options: [{ value: 'ok', label: 'Empecemos' }]
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
              text: `Veo señales parecidas en ${a.shortName.toLowerCase()} y en ${b.shortName.toLowerCase()}, `
                + 'sin que ninguna destaque sobre la otra. ¿Cuál dirías que te pesa más en el día a día?',
              allowedClaims: [{
                text: `En ${a.shortName} ${evidencePhrase(dominancia.first.axis)}; `
                  + `en ${b.shortName} ${evidencePhrase(dominancia.second.axis)}. `
                  + 'La diferencia entre ambas es menor que el margen de error, así que no puedo ordenarlas por mi cuenta.',
                evidence: EVIDENCE.MODEL_ESTIMATE,
                certainty: CERTAINTY.PRELIMINARY
              }],
              options: [
                { value: dominancia.first.axis, label: a.shortName },
                { value: dominancia.second.axis, label: b.shortName },
                { value: 'ninguna', label: 'Ninguna de las dos' }
              ]
            });
          }

          // Sin dominancia distinguible no se anuncia un "área que más pesa": se
          // contrasta lo reportado en esa área, sin ordenar nada.
          const puedeAfirmarDominancia = dominancia.distinguishable;
          // Igual que arriba: solo una afirmación de dominancia actualiza el
          // compromiso; un contraste sin ranking no lo crea ni lo borra.
          if (puedeAfirmarDominancia) state.communicatedFocus = foco.axis;
          return emit({
            type: TURN.REFLECTION,
            axis: foco.axis,
            ranked: puedeAfirmarDominancia,
            text: puedeAfirmarDominancia
              ? `Por lo que me cuentas, el área de ${AXES[foco.axis].shortName.toLowerCase()} `
                + 'es donde más carga aparece. ¿Lo ves así, o hay algo que no encaje?'
              : `En ${AXES[foco.axis].shortName.toLowerCase()} ${evidencePhrase(foco.axis)}. `
                + 'Todavía no puedo decir si es lo que más te pesa. ¿Te encaja como algo que notas?',
            allowedClaims: [{
              // La evidencia contable sustituye al número sin referente.
              text: `En ${AXES[foco.axis].shortName} ${evidencePhrase(foco.axis)}.`,
              evidence: EVIDENCE.SELF_REPORT
            }],
            options: [
              { value: true, label: 'Sí, es así' },
              { value: false, label: 'No, no lo veo así' }
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
              text: `${item.text} ¿Con qué frecuencia te pasa?`,
              // Se declara por qué se pregunta esto y no otra cosa: es el ítem
              // que más puede cambiar la estimación actual.
              rationale: {
                information: Number(siguiente.information.toFixed(3)),
                currentSe: Number(estimates[axis].se.toFixed(3)),
                criterion: 'máxima información de Fisher en la estimación actual'
              },
              allowedClaims: [],
              options: answerOptions()
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
          ? Interpretation.read({ answers: state.answers, estimates })
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
          headline = 'De lo que me contaste, no señalaste molestias en ninguna de las áreas que revisamos.';
        } else if (dominancia.distinguishable) {
          const top = axisSummaries[0];
          headline = `De lo que me contaste, lo que más pesa es ${top.name.toLowerCase()}: ${top.phrase}.`;
        } else {
          const nombres = conSenales.slice(0, 2).map((s) => s.name.toLowerCase());
          headline = `De lo que me contaste, hay señales repartidas entre ${nombres.join(' y ')}, `
            + 'sin que una destaque claramente sobre la otra.';
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
          interpretation: lectura,
          allowedClaims: [
            ...claimsDeLectura,
            // Si durante la conversación se le nombró otro foco, el cambio se
            // declara. Revisar una hipótesis con datos nuevos es correcto; dejar
            // que el paciente descubra la contradicción por su cuenta, no.
            ...(state.communicatedFocus && state.communicatedFocus !== dominante.axis ? [{
              text: `Antes te mencioné ${AXES[state.communicatedFocus].shortName} como el área principal. `
                + `Con lo que me contaste después, ${AXES[dominante.axis].shortName} aparece por encima.`,
              evidence: EVIDENCE.MODEL_ESTIMATE,
              certainty: dominante.certainty,
              revision: { from: state.communicatedFocus, to: dominante.axis }
            }] : []),
            // Lo que se afirma es lo que la persona respondió, contado. El rasgo
            // estimado sigue disponible en `estimates` para uso interno, pero no
            // se le presenta como si fuera una medición con referente.
            ...(conSenales.length ? [{
              text: dominancia.distinguishable
                ? `El área con más señales es ${axisSummaries[0].name}: ${axisSummaries[0].phrase}.`
                : `Las áreas con más señales son ${conSenales.slice(0, 2).map((s) => s.name).join(' y ')}, `
                  + 'con una diferencia entre ellas menor que el margen de error de este cuestionario.',
              evidence: EVIDENCE.SELF_REPORT
            }] : [{
              text: 'No señalaste molestias en ninguna de las áreas exploradas.',
              evidence: EVIDENCE.SELF_REPORT
            }]),
            {
              text: 'Medir qué ocurre físicamente en tu cuerpo requiere el estudio en clínica; '
                + 'esta conversación no lo sustituye.',
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
    FORBIDDEN,
    TARGET_SE,
    MIN_ITEMS_PER_AXIS,
    MAX_ITEMS_PER_AXIS,
    checkUtterance,
    buildCatalog,
    createSession
  };
}));
