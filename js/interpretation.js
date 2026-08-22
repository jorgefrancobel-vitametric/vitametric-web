// G-Level: L1
// Sustrato: Contrato Ejecutable
// Función: Capa hermenéutica del triaje — lee la estructura de lo reportado (discordancias, constelaciones, validez) en vez de sumar respuestas
// v-version: 20260822.01

/**
 * Lectura hermenéutica del autoreporte.
 *
 * Sumar respuestas trata cada ítem como un dato independiente y toma al paciente
 * al pie de la letra. Pero un autoreporte tiene estructura: importa qué se afirma,
 * qué se niega, qué se deja sin saber, y sobre todo qué combinaciones aparecen
 * juntas. Este módulo lee esa estructura.
 *
 * EL CASO QUE JUSTIFICA EL MÓDULO — discordancia somático-afectiva. Los ítems del
 * eje autónomo son de dos clases distintas y el motor de score las trata igual:
 *   · somáticos     — contracturas, bruxismo, palpitaciones, manos frías:
 *                     se constatan, no requieren mirar hacia adentro.
 *   · introspectivos — "dificultad para desconectar la mente", "urgencia interior",
 *                     "niebla mental": exigen identificar y nombrar un estado interno.
 * Quien marca los somáticos alto y los introspectivos en cero no está diciendo "no
 * tengo estrés": puede estar diciendo "mi cuerpo lo registra y yo no lo nombro".
 * Es el terreno que describe la skill hrv-alexithymia-expert (DIF/DDF/EOT del
 * TAS-20): el canal de autoreporte afectivo puede estar limitado justo donde el
 * cuestionario más lo necesita. Concluir "sin estrés" ahí es un falso negativo
 * estructural, no un error de medición.
 *
 * Los cuatro anti-patrones de esa misma skill se respetan como restricciones duras,
 * y están verificados en la suite:
 *   1. No absolutizar     — ninguna lectura se emite sin su contra-lectura.
 *   2. No ignorar contexto — los ítems contextuales modulan, no puntúan igual.
 *   3. No patologizar     — se describe un modo de responder, nunca un déficit.
 *   4. No sustituir al profesional — toda lectura deriva a consulta.
 *
 * El módulo NO diagnostica ni nombra condiciones. Produce lecturas con su
 * evidencia, su confianza y lo que explícitamente NO significan.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./test-celular-engine.js'));
  } else {
    root.VitametricInterpretation = factory(root.VitametricTestEngine);
  }
}(typeof self !== 'undefined' ? self : this, function (Engine) {
  'use strict';

  const { AXES, BASE_DIMENSIONS, CONDITIONAL_DIMENSIONS } = Engine;

  /**
   * Canal por el que se conoce cada ítem. No es una taxonomía clínica: distingue
   * qué le pedimos al paciente para responder.
   */
  const CHANNEL = Object.freeze({
    SOMATIC: 'SOMATIC',             // se constata en el cuerpo
    INTROSPECTIVE: 'INTROSPECTIVE', // exige identificar un estado interno
    BEHAVIORAL: 'BEHAVIORAL',       // conducta observable
    CONTEXTUAL: 'CONTEXTUAL'        // circunstancia o antecedente, no síntoma
  });

  const ITEM_CHANNEL = Object.freeze({
    item_aut_tension_cervical: CHANNEL.SOMATIC,
    item_aut_bruxismo: CHANNEL.SOMATIC,
    item_aut_taquicardia: CHANNEL.SOMATIC,
    item_aut_mente_acelerada: CHANNEL.INTROSPECTIVE,
    item_aut_manos_frias: CHANNEL.SOMATIC,

    item_sue_inercia_matutina: CHANNEL.SOMATIC,
    item_sue_microdespertares: CHANNEL.SOMATIC,
    item_sue_latencia_alta: CHANNEL.INTROSPECTIVE,
    item_sue_pesadez_corporal: CHANNEL.SOMATIC,

    item_card_somnolencia_post: CHANNEL.SOMATIC,
    item_card_niebla_mental: CHANNEL.INTROSPECTIVE,
    item_card_antojos_dulces: CHANNEL.BEHAVIORAL,
    item_card_herencia_familiar: CHANNEL.CONTEXTUAL,
    item_card_diagnostico_propio: CHANNEL.CONTEXTUAL,

    item_ter_distension: CHANNEL.SOMATIC,
    item_ter_acidez_reflujo: CHANNEL.SOMATIC,
    item_ter_transito_irregular: CHANNEL.SOMATIC,
    item_ter_pesadez_piernas: CHANNEL.SOMATIC,
    item_ter_retencion_parpados: CHANNEL.SOMATIC,

    item_ocu_sedentarismo_6h: CHANNEL.CONTEXTUAL,
    item_ocu_pantallas_continuas: CHANNEL.CONTEXTUAL,
    item_ocu_molestia_lumbar: CHANNEL.SOMATIC,
    item_ocu_pausas_escasas: CHANNEL.CONTEXTUAL,

    item_apnea_ronquido: CHANNEL.SOMATIC,
    item_apnea_boca_seca: CHANNEL.SOMATIC,
    item_apnea_pausas_ahogo: CHANNEL.SOMATIC,

    item_inf_grasa_visceral: CHANNEL.SOMATIC,
    item_inf_fatiga_muscular: CHANNEL.SOMATIC,
    item_inf_rigidez_articular: CHANNEL.SOMATIC
  });

  const PATTERN = Object.freeze({
    SOMATIC_AFFECTIVE_GAP: 'SOMATIC_AFFECTIVE_GAP',
    CONTEXT_WITHOUT_STRAIN: 'CONTEXT_WITHOUT_STRAIN',
    UNIFORM_RESPONSE: 'UNIFORM_RESPONSE',
    PERVASIVE_UNCERTAINTY: 'PERVASIVE_UNCERTAINTY',
    CONSTELLATION: 'CONSTELLATION'
  });

  const CONFIDENCE = Object.freeze({ WEAK: 'WEAK', MODERATE: 'MODERATE', STRONG: 'STRONG' });

  const ALL_ITEMS = [...BASE_DIMENSIONS, ...Object.values(CONDITIONAL_DIMENSIONS)]
    .flatMap((d) => d.items.map((it) => ({ ...it, axis: d.axis })));

  /**
   * Constelaciones: combinaciones cuyo significado no está en ningún eje por
   * separado. Es el análogo, en autoreporte, del cruce de variables que hace el
   * nivel L2 del modelo ES-Complex — donde el cruce dice algo que ninguna variable
   * suelta dice.
   */
  const CONSTELLATIONS = [
    {
      id: 'descanso_y_energia',
      axes: ['sueno', 'cardiometabolico'],
      label: 'Descanso y energía diurna aparecen comprometidos a la vez',
      meaning: 'Cuando el descanso y la energía del día se afectan juntos, suelen sostenerse mutuamente: '
        + 'el cansancio cambia lo que se come y lo que se come cambia cómo se duerme.',
      notMeaning: 'No indica ninguna condición concreta del sueño ni del metabolismo; son dos áreas '
        + 'que reportaste cargadas, no un hallazgo clínico.'
    },
    {
      id: 'tension_y_digestion',
      axes: ['autonomo', 'terreno'],
      label: 'Tensión sostenida y molestias digestivas coinciden',
      meaning: 'Es una coincidencia frecuente y conocida: la tensión mantenida suele acompañarse de '
        + 'cambios digestivos, y conviene mirarlas juntas en vez de por separado.',
      notMeaning: 'No implica que una cause la otra, ni permite atribuir la digestión al estrés.'
    },
    {
      id: 'carga_sin_repercusion',
      axes: ['ocupacional'],
      requiresLow: ['autonomo', 'sueno'],
      label: 'Carga laboral alta que todavía no se refleja en descanso ni tensión',
      meaning: 'La exigencia externa es alta pero el descanso y la tensión aún se sostienen. '
        + 'Es la situación más favorable para actuar temprano.',
      notMeaning: 'No garantiza que vaya a mantenerse así, ni convierte la carga en inofensiva.'
    }
  ];

  function channelOf(itemId) {
    return ITEM_CHANNEL[itemId] || CHANNEL.SOMATIC;
  }

  /**
   * @param {object} input
   * @param {object} input.answers itemId → grado (0-3) o null ("no lo sé")
   * @param {object} input.estimates eje → {theta, se, scale, certainty}
   */
  function read({ answers = {}, estimates = {} } = {}) {
    const patterns = [];
    const respondidos = Object.keys(answers);
    const afirmados = respondidos.filter((id) => typeof answers[id] === 'number' && answers[id] >= 1);
    const desconocidos = respondidos.filter((id) => answers[id] === null);

    // ── Discordancia somático-afectiva ──────────────────────────────────────
    const introspectivos = respondidos.filter((id) => channelOf(id) === CHANNEL.INTROSPECTIVE);
    const somaticos = respondidos.filter((id) => channelOf(id) === CHANNEL.SOMATIC);

    if (introspectivos.length >= 1 && somaticos.length >= 3) {
      const mediaIntro = promedio(introspectivos.map((id) => answers[id]).filter((g) => typeof g === 'number'));
      const mediaSoma = promedio(somaticos.map((id) => answers[id]).filter((g) => typeof g === 'number'));

      // El cuerpo reporta carga y la introspección no la acompaña.
      if (mediaSoma >= 1.5 && mediaIntro <= 0.5 && mediaSoma - mediaIntro >= 1.5) {
        patterns.push({
          id: PATTERN.SOMATIC_AFFECTIVE_GAP,
          label: 'El cuerpo reporta más carga que la percepción interna',
          confidence: introspectivos.length >= 2 ? CONFIDENCE.MODERATE : CONFIDENCE.WEAK,
          evidence: {
            somaticMean: round(mediaSoma),
            introspectiveMean: round(mediaIntro),
            somaticItems: somaticos.length,
            introspectiveItems: introspectivos.length
          },
          // Redacción cuidada: describe un modo de responder, no un déficit.
          // (anti-patrón "Pathologizing" de hrv-alexithymia-expert)
          meaning: 'Reportas señales físicas de tensión con claridad, y en cambio las preguntas sobre '
            + 'cómo lo vives por dentro las respondes bajo. A muchas personas les resulta más fácil '
            + 'notar el cuerpo que ponerle nombre a un estado interno: no es un defecto, es una forma '
            + 'distinta de registrar lo que pasa.',
          notMeaning: 'No significa que no haya tensión, ni que estés minimizando algo a propósito, '
            + 'ni constituye ningún diagnóstico psicológico.',
          // Consecuencia operativa: no cerrar el eje como "sin carga".
          action: { softenLowClaims: ['autonomo'], suggestConsultation: true }
        });
      }
    }

    // ── Contexto sin repercusión reportada ──────────────────────────────────
    const contextuales = respondidos.filter((id) => channelOf(id) === CHANNEL.CONTEXTUAL);
    const mediaContexto = promedio(contextuales.map((id) => answers[id]).filter((g) => typeof g === 'number'));
    const mediaSintoma = promedio(
      respondidos
        .filter((id) => channelOf(id) !== CHANNEL.CONTEXTUAL)
        .map((id) => answers[id])
        .filter((g) => typeof g === 'number')
    );
    if (contextuales.length >= 2 && mediaContexto >= 2 && mediaSintoma <= 0.75) {
      patterns.push({
        id: PATTERN.CONTEXT_WITHOUT_STRAIN,
        label: 'Circunstancias exigentes sin síntomas asociados por ahora',
        confidence: CONFIDENCE.MODERATE,
        evidence: { contextMean: round(mediaContexto), symptomMean: round(mediaSintoma) },
        meaning: 'Describes condiciones exigentes que todavía no se acompañan de molestias. '
          + 'Es información útil: marca un punto de partida contra el cual comparar más adelante.',
        notMeaning: 'No es una garantía hacia el futuro ni convierte esas condiciones en irrelevantes.',
        action: { suggestConsultation: false }
      });
    }

    // ── Respuesta uniforme: la validez del autoreporte queda en cuestión ────
    const grados = afirmados.map((id) => answers[id]);
    if (respondidos.length >= 6 && grados.length >= 5 && new Set(grados).size === 1 && grados[0] === 3) {
      patterns.push({
        id: PATTERN.UNIFORM_RESPONSE,
        label: 'Todas las respuestas en el grado máximo',
        confidence: CONFIDENCE.MODERATE,
        evidence: { answered: respondidos.length, distinctGrades: 1 },
        meaning: 'Marcaste el grado máximo en todo. Puede reflejar fielmente un momento muy cargado, '
          + 'o puede ser efecto del formato de las preguntas.',
        notMeaning: 'No permite distinguir qué área pesa más que otra, que es justo lo que el resultado intenta ordenar.',
        action: { flagValidity: true, suggestConsultation: true }
      });
    }

    // ── Incertidumbre dominante ─────────────────────────────────────────────
    if (respondidos.length >= 5 && desconocidos.length / respondidos.length >= 0.4) {
      patterns.push({
        id: PATTERN.PERVASIVE_UNCERTAINTY,
        label: 'Buena parte de las preguntas quedaron sin poder responderse',
        confidence: CONFIDENCE.STRONG,
        evidence: { unknown: desconocidos.length, answered: respondidos.length },
        meaning: 'Muchas respuestas fueron "no lo sé". Hay señales que sencillamente no se pueden '
          + 'conocer sin que alguien te observe o sin medirlas.',
        notMeaning: 'No es una respuesta incorrecta ni deja el ejercicio sin valor: acota hasta dónde '
          + 'puede llegar este formato.',
        action: { flagValidity: true, suggestConsultation: true }
      });
    }

    // ── Constelaciones ──────────────────────────────────────────────────────
    CONSTELLATIONS.forEach((c) => {
      const cargados = c.axes.every((a) => estimates[a] && estimates[a].theta > 0.3);
      const bajos = (c.requiresLow || []).every((a) => estimates[a] && estimates[a].theta <= 0);
      if (!cargados || !bajos) return;

      // La confianza de la lectura no puede superar la de las estimaciones que la sostienen.
      const peorSe = Math.max(...c.axes.map((a) => estimates[a].se));
      patterns.push({
        id: PATTERN.CONSTELLATION,
        constellation: c.id,
        label: c.label,
        confidence: peorSe <= 0.6 ? CONFIDENCE.MODERATE : CONFIDENCE.WEAK,
        evidence: c.axes.reduce((acc, a) => {
          acc[a] = { scale: estimates[a].scale, se: round(estimates[a].se) };
          return acc;
        }, {}),
        meaning: c.meaning,
        notMeaning: c.notMeaning,
        action: { suggestConsultation: true }
      });
    });

    const validity = {
      concern: patterns.some((p) => p.action && p.action.flagValidity),
      reasons: patterns.filter((p) => p.action && p.action.flagValidity).map((p) => p.label)
    };

    return {
      patterns,
      validity,
      // Ejes cuya lectura baja no debe presentarse como conclusión firme.
      softenLowClaims: [...new Set(patterns.flatMap((p) => (p.action && p.action.softenLowClaims) || []))],
      suggestConsultation: patterns.some((p) => p.action && p.action.suggestConsultation)
    };
  }

  function promedio(xs) {
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  }
  function round(x) {
    return Math.round(x * 100) / 100;
  }

  return {
    CHANNEL,
    ITEM_CHANNEL,
    PATTERN,
    CONFIDENCE,
    CONSTELLATIONS,
    channelOf,
    read
  };
}));
