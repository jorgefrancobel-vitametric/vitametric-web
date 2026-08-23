// G-Level: L1
// Sustrato: Contrato Ejecutable
// Función: Capa hermenéutica del triaje — lee la estructura de lo reportado (discordancias, constelaciones, validez) en vez de sumar respuestas
// v-version: 20260822.02 (expansión de constelaciones + índice de terreno difuso)

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

  // Confianza mínima de un enlace causal para reforzar una lectura. Coincide con
  // CONNECTOR_CONFIDENCE.EXPLICIT del extractor: deja fuera los nexos temporales.
  const MIN_CAUSAL_CONFIDENCE = 0.8;

  const ALL_ITEMS = [...BASE_DIMENSIONS, ...Object.values(CONDITIONAL_DIMENSIONS)]
    .flatMap((d) => d.items.map((it) => ({ ...it, axis: d.axis })));

  /**
   * Constelaciones: combinaciones cuyo significado no está en ningún eje por
   * separado. Es el análogo, en autoreporte, del cruce de variables que hace el
   * nivel L2 del modelo ES-Complex — donde el cruce dice algo que ninguna variable
   * suelta dice.
   */
  /**
   * Catálogo expandido de constelaciones clínicamente significativas.
   *
   * Diseño inspirado en el nivel L2 del modelo ES-Complex: el cruce entre ejes
   * dice algo que ninguna variable suelta dice. Cada constelación requiere que
   * sus ejes estén por encima de un umbral mínimo de carga (theta > 0.3) y,
   * cuando aplica, que los ejes "requiresLow" estén por debajo.
   *
   * Categorías:
   *   A. Pares clásicos (2 ejes): combinaciones con correlación clínica documentada.
   *   B. Tríadas sistémicas (3 ejes): patrones que abarcan múltiples dominios.
   *   C. Perfiles especiales: lecturas sobre la estructura de la respuesta.
   */
  const CONSTELLATIONS = [
    // ── A. Pares clásicos (2 ejes) ──────────────────────────────────────────
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
      id: 'estres_y_sueno',
      axes: ['autonomo', 'sueno'],
      label: 'Tensión física y descanso alterado van de la mano',
      meaning: 'La tensión sostenida interfiere con la capacidad de desconectar para dormir, '
        + 'y la falta de descanso reparador hace más difícil regular la tensión durante el día. '
        + 'Es uno de los círculos más comunes y mejor documentados.',
      notMeaning: 'No permite decir que uno cause el otro — solo que aparecen juntos con frecuencia '
        + 'y que abordarlos por separado suele dar resultados incompletos.'
    },
    {
      id: 'estres_y_metabolismo',
      axes: ['autonomo', 'cardiometabolico'],
      label: 'Tensión y señales metabólicas aparecen juntas',
      meaning: 'La tensión mantenida puede afectar los patrones de energía y apetito. '
        + 'No es casualidad: hay mecanismos fisiológicos conocidos que conectan ambas áreas.',
      notMeaning: 'No diagnostica un síndrome metabólico ni implica un problema cardiovascular. '
        + 'Son dos áreas que conviene mirar juntas en consulta.'
    },
    {
      id: 'sueno_y_digestion',
      axes: ['sueno', 'terreno'],
      label: 'El descanso y la digestión se afectan mutuamente',
      meaning: 'Dormir mal puede alterar la digestión, y las molestias digestivas pueden '
        + 'dificultar el descanso. Es otro ejemplo del cuerpo como sistema interconectado '
        + 'donde una cosa lleva a la otra.',
      notMeaning: 'No señala una enfermedad digestiva ni un trastorno del sueño específico.'
    },
    {
      id: 'sedentarismo_metabolico',
      axes: ['cardiometabolico', 'ocupacional'],
      label: 'La carga laboral sedentaria coincide con señales metabólicas',
      meaning: 'Pasar muchas horas sentado frente a pantallas impacta el metabolismo incluso '
        + 'en personas jóvenes. La combinación de poca pausa y fatiga post-comida es una '
        + 'señal temprana que merece atención.',
      notMeaning: 'No constituye por sí mismo un riesgo cardiovascular ni reemplaza una '
        + 'evaluación clínica con mediciones objetivas.'
    },
    {
      id: 'estres_laboral_somatizado',
      axes: ['autonomo', 'ocupacional'],
      label: 'La exigencia laboral se manifiesta en tensión física',
      meaning: 'Cuando las condiciones de trabajo son exigentes y además el cuerpo muestra '
        + 'señales de tensión, conviene considerar que están relacionadas. La tensión '
        + 'no está "en la mente": está en el cuerpo.',
      notMeaning: 'No significa que el trabajo sea la única causa ni que baste con '
        + 'cambiarlo para resolverlo. Es una asociación frecuente, no una relación causal probada.'
    },
    {
      id: 'digestion_y_laboral',
      axes: ['terreno', 'ocupacional'],
      label: 'Molestias digestivas en contexto laboral exigente',
      meaning: 'Las pausas escasas, el sedentarismo y la presión continua pueden alterar '
        + 'los patrones digestivos. Es una asociación frecuente en trabajos de escritorio '
        + 'con alta demanda.',
      notMeaning: 'No indica una patología digestiva de base ni descarta otros factores '
        + 'como la alimentación o la genética.'
    },
    // ── B. Tríadas sistémicas (3 ejes) ───────────────────────────────────────
    {
      id: 'triada_estres_sueno_digestion',
      axes: ['autonomo', 'sueno', 'terreno'],
      label: 'Tensión, descanso y digestión: los tres pilares comprometidos',
      meaning: 'Es el patrón de "triple afectación" más frecuente en consulta: la tensión '
        + 'afecta el sueño, el mal sueño afecta la digestión, y la mala digestión '
        + 'retroalimenta la tensión. Cuando los tres aparecen juntos, conviene una '
        + 'evaluación integral en vez de tratar cada cosa por separado.',
      notMeaning: 'No señala un diagnóstico específico. Es un patrón de carga repartida '
        + 'que orienta hacia una mirada global, no hacia un solo especialista.'
    },
    {
      id: 'sindrome_metabolico_estres',
      axes: ['autonomo', 'cardiometabolico', 'sueno'],
      label: 'Tensión, energía y descanso comprometidos en conjunto',
      meaning: 'La combinación de tensión mantenida, fatiga diurna y alteraciones del '
        + 'descanso es una constelación que merece evaluación clínica. Estos tres '
        + 'dominios comparten vías fisiológicas comunes.',
      notMeaning: 'No diagnostica síndrome metabólico ni predice enfermedad. Es una '
        + 'señal de que varias áreas relacionadas están reportando carga simultáneamente.'
    },
    {
      id: 'burnout_multidominio',
      axes: ['autonomo', 'sueno', 'ocupacional'],
      label: 'Tensión, mal descanso y carga laboral: agotamiento en tres frentes',
      meaning: 'Cuando el cuerpo reporta tensión, el descanso no repara y el trabajo '
        + 'es exigente, estamos ante una situación de desgaste en múltiples dominios. '
        + 'No es "estrés" solamente: es un patrón de agotamiento con manifestaciones físicas.',
      notMeaning: 'No constituye una valoración clínica de burnout ni de ningún trastorno. Describe '
        + 'un patrón de carga que puede estar afectando tu calidad de vida y conviene '
        + 'revisar integralmente.'
    },
    {
      id: 'fatiga_sistemica',
      axes: ['sueno', 'cardiometabolico', 'terreno'],
      label: 'Fatiga generalizada: descanso, energía y digestión afectados',
      meaning: 'Cuando el sueño no repara, la energía diurna decae y la digestión se '
        + 'altera, el cansancio no es solo "falta de sueño": es un patrón sistémico '
        + 'que merece una mirada clínica más amplia.',
      notMeaning: 'No implica una enfermedad sistémica ni un cuadro de fatiga '
        + 'crónica. Señala que el agotamiento no se limita a un solo dominio.'
    },
    // ── C. Perfiles especiales ───────────────────────────────────────────────
    {
      id: 'carga_sin_repercusion',
      axes: ['ocupacional'],
      requiresLow: ['autonomo', 'sueno'],
      label: 'Carga laboral alta que todavía no se refleja en descanso ni tensión',
      meaning: 'La exigencia externa es alta pero el descanso y la tensión aún se sostienen. '
        + 'Es la situación más favorable para actuar temprano.',
      notMeaning: 'No garantiza que vaya a mantenerse así, ni convierte la carga en inofensiva.'
    },
    {
      id: 'perfeccionismo_laboral',
      axes: ['ocupacional'],
      requiresLow: ['autonomo', 'sueno', 'cardiometabolico', 'terreno'],
      label: 'Alta dedicación laboral sin señales de desgaste en otras áreas',
      meaning: 'Tu nivel de dedicación al trabajo es alto pero el resto de áreas '
        + 'se mantienen sin señales. Es el perfil de quien logra sostener el ritmo '
        + 'sin que el cuerpo lo resienta — por ahora.',
      notMeaning: 'No significa que el ritmo sea sostenible indefinidamente, ni que '
        + 'no merezca revisarse. Es una foto del momento, no una predicción.'
    },
    {
      id: 'somatizacion_alta_introspeccion_baja',
      axes: ['autonomo'],
      requiresLow: [],
      label: 'Alta expresión corporal con baja percepción interna',
      meaning: 'Tus señales físicas de tensión son claras mientras que las preguntas '
        + 'sobre estados internos reciben respuestas bajas. Muchas personas registran '
        + 'el estrés en el cuerpo antes —o en vez— de notarlo como una emoción. '
        + 'No es un defecto: es una forma distinta de procesar.',
      notMeaning: 'No significa que no haya carga emocional, ni que estés "desconectado", '
        + 'ni constituye ninguna condición psicológica. Describe un modo de responder '
        + 'que es perfectamente válido y muy común.'
    }
  ];

  function channelOf(itemId) {
    return ITEM_CHANNEL[itemId] || CHANNEL.SOMATIC;
  }

  // ── Índice de Terreno (L3 difuso, inspirado en ES-Complex) ─────────────────

  /**
   * Función de pertenencia difusa: rampa lineal entre `low` y `high`.
   * Devuelve 0 si x <= low, 1 si x >= high, interpolación lineal en medio.
   */
  function membership(x, low, high) {
    if (x <= low) return 0;
    if (x >= high) return 1;
    return (x - low) / (high - low);
  }

  /**
   * Índice de terreno neurovegetativo.
   *
   * Cuatro perfiles de terreno, cada uno con una puntuación 0-1 que indica
   * el grado de pertenencia difusa. No son diagnósticos: son lecturas de
   * tendencia basadas en la combinación de cargas entre ejes.
   *
   * La pertenencia de cada terreno se calcula como el mínimo difuso (AND)
   * de sus componentes, más un factor de coactivación cuando todos los
   * componentes están presentes.
   */
  function computeTerrainIndex(estimates) {
    // Umbrales de theta para membresía baja/alta por eje.
    // theta=0 es la media del catálogo; theta>1 indica carga sustancial.
    const LO = { autonomo: 0.0, sueno: 0.0, cardiometabolico: 0.0, terreno: 0.0, ocupacional: 0.0 };
    const HI = { autonomo: 1.2, sueno: 1.2, cardiometabolico: 1.2, terreno: 1.2, ocupacional: 1.0 };

    function mu(axis) {
      return estimates[axis] ? membership(estimates[axis].theta, LO[axis], HI[axis]) : 0;
    }

    const simp = mu('autonomo');
    const cardio = mu('cardiometabolico');
    const sue = mu('sueno');
    const terr = mu('terreno');
    const ocu = mu('ocupacional');

    /**
     * Terreno Simpaticotónico:
     * Alta activación autonómica + alteración metabólica + descanso pobre.
     * El mínimo difuso captura "los tres están altos". El boost premia
     * cuando los tres componentes tienen membresía > 0.
     */
    const simpaticotonicoRaw = Math.min(simp, cardio, sue);
    const simpaticotonico = simpaticotonicoRaw > 0
      ? clamp(simpaticotonicoRaw + 0.15 * Math.min(simp, cardio), 0, 1)
      : 0;

    /**
     * Vagotonía Baja:
     * Carga digestiva + tensión autonómica alta → pobre recuperación parasimpática.
     */
    const vagotoniaBajaRaw = Math.min(terr, simp);
    const vagotoniaBaja = vagotoniaBajaRaw > 0
      ? clamp(vagotoniaBajaRaw + 0.1 * (terr > 0.4 && simp > 0.4 ? 1 : 0), 0, 1)
      : 0;

    /**
     * Terreno Inflamatorio:
     * Carga cardiometabólica + digestiva → patrón de inflamación de bajo grado.
     */
    const inflamatorioRaw = Math.min(cardio, terr);
    const inflamatorio = inflamatorioRaw > 0
      ? clamp(inflamatorioRaw + 0.1 * sue, 0, 1)
      : 0;

    /**
     * Estrés Crónico:
     * Alta carga autonómica + laboral → estrés mantenido sin recuperación.
     */
    const estresCronicoRaw = Math.min(simp, ocu);
    const estresCronico = estresCronicoRaw > 0
      ? clamp(estresCronicoRaw + 0.1 * (sue < 0.3 ? 1 : 0), 0, 1)
      : 0;

    // Carga total del terreno: promedio de los cuatro perfiles.
    const perfiles = [simpaticotonico, vagotoniaBaja, inflamatorio, estresCronico];
    const cargaTotal = perfiles.reduce((a, b) => a + b, 0) / perfiles.length;

    // El perfil dominante es el de mayor membresía, solo si supera 0.3.
    const nombres = ['simpaticotonico', 'vagotoniaBaja', 'inflamatorio', 'estresCronico'];
    let dominanteIdx = 0;
    perfiles.forEach((v, i) => { if (v > perfiles[dominanteIdx]) dominanteIdx = i; });
    const dominante = perfiles[dominanteIdx] >= 0.3 ? nombres[dominanteIdx] : null;

    return {
      simpaticotonico: round(simpaticotonico),
      vagotoniaBaja: round(vagotoniaBaja),
      inflamatorio: round(inflamatorio),
      estresCronico: round(estresCronico),
      cargaTotal: round(cargaTotal),
      dominante,
      // Etiquetas legibles para UI.
      labels: {
        simpaticotonico: 'Tendencia simpaticotónica',
        vagotoniaBaja: 'Recuperación parasimpática disminuida',
        inflamatorio: 'Patrón de sobrecarga metabólica',
        estresCronico: 'Estrés mantenido sin recuperación'
      },
      // Lo que NO significa cada terreno.
      notMeaning: {
        simpaticotonico: 'No mide actividad del sistema nervioso; es una tendencia inferida desde tus respuestas.',
        vagotoniaBaja: 'No diagnostica disfunción autonómica ni requiere medición de variabilidad cardiaca.',
        inflamatorio: 'No indica inflamación real; es un patrón de autoreporte que requiere medición en clínica.',
        estresCronico: 'No diagnostica estrés crónico ni trastorno de adaptación; señala una coincidencia de cargas.'
      }
    };
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  /**
   * @param {object} input
   * @param {object} input.answers itemId → grado (0-3) o null ("no lo sé")
   * @param {object} input.estimates eje → {theta, se, scale, certainty}
   * @param {Array}  input.causalLinks (opcional) [{fromItemId, toItemId, connector, confidence}]
   *                   — extraídos por listenDeep(); modulan la confianza de constelaciones.
   */
  function read({ answers = {}, estimates = {}, causalLinks = [] } = {}) {
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
      let baseConfidence = peorSe <= 0.6 ? CONFIDENCE.MODERATE : CONFIDENCE.WEAK;

      // Boost por enlace causal: si el paciente describió una relación de causa
      // entre dos ítems que pertenecen a los ejes de esta constelación, la lectura
      // gana un nivel de confianza (WEAK→MODERATE, MODERATE→STRONG).
      if (causalLinks && causalLinks.length && c.axes.length >= 2) {
        const axisSet = new Set(c.axes);
        const boosted = causalLinks.some((link) => {
          // Solo un nexo causal explícito ("me provoca", "porque") sostiene el
          // boost. Los temporales ("tras", "desde que") describen sucesión, no
          // causa: promoverlos sería post hoc ergo propter hoc.
          if (!(typeof link.confidence === 'number'
            && link.confidence >= MIN_CAUSAL_CONFIDENCE)) return false;
          const fromAxis = itemToAxis(link.fromItemId);
          const toAxis = itemToAxis(link.toItemId);
          return fromAxis && toAxis
            && fromAxis !== toAxis
            && axisSet.has(fromAxis)
            && axisSet.has(toAxis);
        });
        // Techo deliberado: una inferencia por reglas sobre texto libre puede
        // reforzar una lectura, nunca establecerla. STRONG se traduce aguas
        // abajo en CERTAINTY.ESTABLISHED y el articulador se lo dice al paciente
        // "con bastante claridad" — eso exige evidencia que un regex no da.
        if (boosted && baseConfidence === CONFIDENCE.WEAK) {
          baseConfidence = CONFIDENCE.MODERATE;
        }
      }

      patterns.push({
        id: PATTERN.CONSTELLATION,
        constellation: c.id,
        label: c.label,
        confidence: baseConfidence,
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

    // ── Índice de terreno difuso ───────────────────────────────────────────
    const terrainIndex = computeTerrainIndex(estimates);

    return {
      patterns,
      validity,
      terrainIndex,
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

  /**
   * Mapa invertido: itemId → axis. Construido una vez desde el catálogo.
   * Lo usa el boost de causalLinks para saber si dos ítems pertenecen a
   * ejes distintos de una constelación.
   */
  const ITEM_AXIS = (function buildItemAxis() {
    const map = {};
    ALL_ITEMS.forEach((it) => { map[it.id] = it.axis; });
    return Object.freeze(map);
  })();

  function itemToAxis(itemId) {
    return ITEM_AXIS[itemId] || null;
  }

  return {
    CHANNEL,
    ITEM_CHANNEL,
    PATTERN,
    CONFIDENCE,
    CONSTELLATIONS,
    channelOf,
    read,
    computeTerrainIndex
  };
}));
