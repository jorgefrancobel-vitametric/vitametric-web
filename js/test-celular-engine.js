/**
 * Vitametric — Motor Clínico de Autoevaluación Celular y Triaje Multidimensional
 * 
 * Arquitectura v2026.08 (Orthogonal Micro-Chips Engine):
 * 1. 5 Dimensiones Fisiológicas Basales (Autónomo, Sueño, Cardiometabólico, Terreno, Ocupacional)
 * 2. Matriz de Micro-Chips Desacoplados (0 a N síntomas independientes por dimensión)
 * 3. Branching Dinámico Puro (tamizajes STOP-BANG e Inflamación sin mutación de estado en backtrack)
 * 4. Ponderación Multidimensional Ortogonal y Modulación por Pico Crítico
 * 5. Blindaje Normativo Preventivo (LGS / NOM-051 / ISO 13485)
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./rasch.js'));
  } else {
    root.VitametricTestEngine = factory(root.Rasch);
  }
}(typeof self !== 'undefined' ? self : this, function(Rasch) {
  'use strict';

  // El modelo de rasgo latente es opcional: si la página no cargó rasch.js, el
  // motor sigue devolviendo la escala 0-100 de siempre y omite θ, en vez de
  // romperse. Se retira esta tolerancia cuando la UI migre a θ.
  const HAS_RASCH = !!(Rasch && typeof Rasch.estimateTheta === 'function');

  // Configuración Declarativa de Ejes Fisiológicos
  const AXES = {
    autonomo: {
      id: 'autonomo',
      name: 'Balance Autónomo & Estrés',
      shortName: 'Estrés Autónomo',
      icon: '⚡',
      color: '#00C8FF',
      description: 'Recoge las manifestaciones de tensión sostenida que percibes: contracturas, palpitaciones y dificultad para desconectar.'
    },
    sueno: {
      id: 'sueno',
      name: 'Arquitectura del Sueño & Cronobiología',
      shortName: 'Calidad de Sueño',
      icon: '🌙',
      color: '#818CF8',
      description: 'Recoge cómo describes tu descanso: cuánto tardas en dormirte, si despiertas de noche y con qué energía amaneces.'
    },
    cardiometabolico: {
      id: 'cardiometabolico',
      name: 'Resiliencia Cardiometabólica',
      shortName: 'Cardiometabólico',
      icon: '❤️',
      color: '#EF4444',
      description: 'Recoge las fluctuaciones de energía que notas durante el día y los antecedentes personales y familiares que declaras.'
    },
    terreno: {
      id: 'terreno',
      name: 'Terreno Digestivo y Retención de Líquidos',
      shortName: 'Terreno Digestivo',
      icon: '🧬',
      color: '#10B981',
      description: 'Recoge los síntomas digestivos y de retención de líquidos tal como los percibes. Es tu experiencia reportada; la medición física del medio interno corresponde al estudio en clínica.'
    },
    ocupacional: {
      id: 'ocupacional',
      name: 'Carga Ergonómica & Sobreesfuerzo',
      shortName: 'Sobrecarga Laboral',
      icon: '💼',
      color: '#F59E0B',
      description: 'Cuantifica el impacto del sedentarismo prolongado, tensión por pantallas (VDT) y fatiga postural.'
    }
  };

  // Parámetros y Ponderaciones del Scoring Global (Desacoplados para A/B Testing)
  const SCORING_CONFIG = {
    weights: {
      autonomo: 0.25,
      sueno: 0.20,
      cardiometabolico: 0.25,
      terreno: 0.20,
      ocupacional: 0.10
    },
    // Recalibrados tras el paso a escala absoluta (ver scripts/recalibrate-thresholds.mjs).
    // Son los cortes que reproducen la estratificación anterior en el mayor número
    // de casos: concordancia 93.73%, κ=0.8988, sin ningún salto bajo↔alto.
    thresholds: {
      highGlobal: 50,
      highMaxAxis: 64,
      moderateGlobal: 16,
      moderateMaxAxis: 30
    },
    storageKey: 'vitametric_test_state_v3',
    storageTtlMs: 24 * 60 * 60 * 1000 // 24 horas
  };

  /**
   * Escala ordinal de frecuencia.
   *
   * Un síntoma mensual y uno diario no son el mismo dato clínico, y el formato
   * binario anterior los hacía indistinguibles. Los anclajes son de frecuencia
   * semanal —el criterio que usan los instrumentos de tamizaje establecidos— y
   * la puntuación es ordinal lineal (grado/3), sin ponderaciones inventadas.
   *
   * UNKNOWN no es un grado: es la ausencia de dato. Se separa de "no lo tengo"
   * porque hay síntomas que el paciente no puede conocer por sí mismo —roncar,
   * dejar de respirar mientras duerme— y contarlos como ausentes fabrica una
   * certeza que nadie tiene.
   */
  const GRADE = Object.freeze({
    UNKNOWN: null,
    RARA_VEZ: 1,
    A_MENUDO: 2,
    HABITUAL: 3
  });

  const GRADE_LABELS = Object.freeze({
    1: 'Rara vez (alguna vez al mes)',
    2: 'A menudo (1 a 3 veces por semana)',
    3: 'Habitualmente (4 o más veces por semana)'
  });

  const UNKNOWN_LABEL = 'No lo sé';

  /** Puntuación ordinal lineal: el grado máximo aporta el peso íntegro del ítem. */
  function gradeFactor(grade) {
    if (grade === GRADE.UNKNOWN) return 0;
    const g = Math.max(1, Math.min(3, Number(grade) || 3));
    return g / 3;
  }

  /**
   * Evidencia que respalda las decisiones de diseño del instrumento.
   *
   * Toda regla que amplíe preguntas o module el resultado debería poder citar en
   * qué se apoya. Lo que no tiene respaldo se declara aquí como tal, en vez de
   * dejarlo implícito en un nombre que suene clínico.
   */
  const EVIDENCIA = Object.freeze({
    osa_riesgo_cardiometabolico: {
      afirmacion: 'La carga cardiometabólica alta justifica ampliar las preguntas sobre descanso nocturno.',
      soporte: [
        'PMID 23770180 — J Am Coll Cardiol 2013: OSA como riesgo cardiometabólico en obesidad y síndrome metabólico.',
        'PMID 35975264 — Acta Endocrinol 2022: STOP-BANG en diabetes tipo 2, ROC con corte 4.5 (sens 88.2%, esp 62.9%); ≥5 predictor independiente de OSA severa.'
      ],
      limite: 'PMID 36378202 — USPSTF 2022 (JAMA): evidencia INSUFICIENTE para cribado de OSA en población adulta general, incluidos asintomáticos (I statement). Por tanto esto NO es un cribado: solo amplía preguntas en un subgrupo de riesgo y deriva a consulta.',
      implementado_en: 'branch_apnea_sueno.condition → totalCardItems >= 3'
    },
    terreno_acceso_a_su_propia_rama: {
      afirmacion: 'Una carga alta de síntomas digestivos y de retención debe dar acceso a los ítems que puntúan en ese mismo eje.',
      soporte: [
        'Coherencia interna del instrumento: las tres condiciones originales exigían carga cardiometabólica pese a que el eje de la rama es terreno, dejando su techo inalcanzable (57/100).'
      ],
      limite: 'SIN respaldo fisiopatológico. La búsqueda de síntomas digestivos autorreportados como indicador de inflamación de bajo grado no arroja literatura de soporte. Lo que sí está documentado es adiposidad visceral ↔ inflamación, y por perímetro medido, no percibido. Por eso la rama dejó de llamarse "Microinflamación Tisular".',
      implementado_en: 'branch_inflamacion_metabolica.condition → totalTerItems >= 3'
    }
  });

  // Dimensiones Basales Estructuradas (Micro-Chips Ortogonales)
  const BASE_DIMENSIONS = [
    {
      id: 'dim_autonomo',
      axis: 'autonomo',
      category: 'Tensión Sostenida y Reactividad al Estrés',
      title: '¿Cuáles de las siguientes manifestaciones de sobretensión o reactividad experimentas habitualmente?',
      subtitle: 'Permite estimar la reactividad neurovegetativa y la sobrecarga simpática sostenida.',
      items: [
        {
          id: 'item_aut_tension_cervical',
          text: 'Tensión muscular o contracturas frecuentes en cuello, hombros o trapecios.',
          weights: { autonomo: 14 }
        },
        {
          id: 'item_aut_bruxismo',
          text: 'Apretamiento dental nocturno o sobretensión involuntaria en mandíbula (bruxismo).',
          weights: { autonomo: 18 }
        },
        {
          id: 'item_aut_taquicardia',
          text: 'Palpitaciones, taquicardias ocasionales o sensación de pecho acelerado ante estrés.',
          weights: { autonomo: 28 }
        },
        {
          id: 'item_aut_mente_acelerada',
          text: 'Dificultad para desconectar la mente al acostarse o sensación de urgencia interior continua.',
          weights: { autonomo: 20 }
        },
        {
          id: 'item_aut_manos_frias',
          text: 'Manos o pies fríos frecuentemente, o sudoración palmar en momentos de exigencia psicofísica.',
          weights: { autonomo: 14 }
        }
      ],
      optimalOption: {
        id: 'opt_aut_optimo',
        text: 'Sin sobretensión ni manifestaciones de estrés significativas (estado de relajación y balance estable).'
      }
    },
    {
      id: 'dim_sueno',
      axis: 'sueno',
      category: 'Arquitectura del Sueño & Recuperación Nocturna',
      title: '¿Qué factores interfieren con tu descanso o tu nivel de vitalidad matutina?',
      subtitle: 'Registra cómo duermes y cómo amaneces, tal como tú lo experimentas.',
      items: [
        {
          id: 'item_sue_inercia_matutina',
          text: 'Fatiga o inercia de sueño prolongada (>30 min al despertar); necesidad indispensable de café para arrancar.',
          weights: { sueno: 18 }
        },
        {
          id: 'item_sue_microdespertares',
          text: 'Microdespertares frecuentes durante la noche o sensación de sueño superficial y ligero.',
          weights: { sueno: 24 }
        },
        {
          id: 'item_sue_latencia_alta',
          text: 'Dificultad marcada para conciliar el sueño (tardo más de 40 a 60 minutos en dormirme).',
          weights: { sueno: 18 }
        },
        {
          id: 'item_sue_pesadez_corporal',
          text: 'Sensación de cuerpo no reparado, pesadez física o falta de descanso acumulada desde hace semanas.',
          weights: { sueno: 26 }
        }
      ],
      optimalOption: {
        id: 'opt_sue_optimo',
        text: 'Sueño profundo y continuo; despierto con energía renovada y mente despejada de forma natural.'
      }
    },
    {
      id: 'dim_cardiometabolico',
      axis: 'cardiometabolico',
      category: 'Energía a lo Largo del Día y Antecedentes',
      title: '¿Presentas alguna de las siguientes señales de fluctuación metabólica o antecedentes familiares?',
      subtitle: 'Analiza la estabilidad energética postprandial y la carga de susceptibilidad metabólica preclínica.',
      items: [
        {
          id: 'item_card_somnolencia_post',
          text: 'Somnolencia pronunciada o caídas drásticas de energía tras comidas (entre 2:00 y 5:00 PM).',
          weights: { cardiometabolico: 22 }
        },
        {
          id: 'item_card_niebla_mental',
          text: 'Niebla mental, dispersión cognitiva o dificultad de concentración en horas de la tarde.',
          weights: { cardiometabolico: 18 }
        },
        {
          id: 'item_card_antojos_dulces',
          text: 'Apetito recurrente o necesidad intensa de carbohidratos refinados, pan o azúcar por la tarde.',
          weights: { cardiometabolico: 18 }
        },
        {
          id: 'item_card_herencia_familiar',
          text: 'Antecedentes familiares directos (padres o hermanos) con diabetes, hipertensión o dislipidemia.',
          weights: { cardiometabolico: 22 }
        },
        {
          id: 'item_card_diagnostico_propio',
          text: 'Diagnóstico médico previo personal de resistencia a la insulina, hígado graso, dislipidemia o hipertensión.',
          weights: { cardiometabolico: 40 }
        }
      ],
      optimalOption: {
        id: 'opt_card_optimo',
        text: 'Claridad mental constante, niveles estables de glucosa/energía a lo largo del día y sin antecedentes directos.'
      }
    },
    {
      id: 'dim_terreno',
      axis: 'terreno',
      category: 'Terreno Digestivo y Dinámica de Líquidos',
      title: '¿Cuáles de estas alteraciones digestivas o de fluidos corporales experimentas habitualmente?',
      subtitle: 'Registra las molestias digestivas y de retención tal como las experimentas en tu día a día.',
      items: [
        {
          id: 'item_ter_distension',
          text: 'Distensión o hinchazón abdominal visible y pesadez gástrica al final de la jornada.',
          weights: { terreno: 20 }
        },
        {
          id: 'item_ter_acidez_reflujo',
          text: 'Sensación de acidez, reflujo gástrico o ardor estomacal frecuente.',
          weights: { terreno: 20 }
        },
        {
          id: 'item_ter_transito_irregular',
          text: 'Tránsito digestivo irregular (estreñimiento recurrente o alternancia con deposiciones sueltas).',
          weights: { terreno: 18 }
        },
        {
          id: 'item_ter_pesadez_piernas',
          text: 'Pesadez o hinchazón visible en piernas/tobillos (marcas de calcetines) tras estar sentado o de pie.',
          weights: { terreno: 22 }
        },
        {
          id: 'item_ter_retencion_parpados',
          text: 'Hinchazón en párpados/manos al despertar o tendencia a extremidades frías constantes.',
          weights: { terreno: 16 }
        }
      ],
      optimalOption: {
        id: 'opt_ter_optimo',
        text: 'Digestión ligera y regular, sin acidez ni distensión, y sin hinchazón ni pesadez en extremidades.'
      }
    },
    {
      id: 'dim_ocupacional',
      axis: 'ocupacional',
      category: 'Carga Ergonómica, Postural & Exposición a Pantallas',
      title: '¿Cuáles son las condiciones predominantes en tu dinámica laboral y postura diaria?',
      subtitle: 'Evalúa el impacto del sedentarismo prolongado y la tensión visual en la fascia y tono muscular.',
      items: [
        {
          id: 'item_ocu_sedentarismo_6h',
          text: 'Permanecer sentado más de 6 a 8 horas al día de forma continua con movilidad reducida.',
          weights: { ocupacional: 26 }
        },
        {
          id: 'item_ocu_pantallas_continuas',
          text: 'Exposición intensa a pantallas y dispositivos con presencia de fatiga visual o cefalea tensional.',
          weights: { ocupacional: 20 }
        },
        {
          id: 'item_ocu_molestia_lumbar',
          text: 'Molestia o rigidez recurrente en zona cervical, dorsal o lumbar al terminar la jornada laboral.',
          weights: { ocupacional: 26 }
        },
        {
          id: 'item_ocu_pausas_escasas',
          text: 'Jornadas de trabajo con mínimas pausas activas y dificultad para realizar ejercicio compensatorio regular.',
          weights: { ocupacional: 18 }
        }
      ],
      optimalOption: {
        id: 'opt_ocu_optimo',
        text: 'Dinámica laboral activa, movilidad frecuente, pausas ergonómicas regulares y sin fatiga postural.'
      }
    }
  ];

  // Dimensiones Condicionales de Branching Dinámico Puro
  const CONDITIONAL_DIMENSIONS = {
    branch_apnea_sueno: {
      id: 'dim_cond_apnea_sueno',
      axis: 'sueno',
      // NO es el STOP-BANG. Se llamaba así, pero administra 3 ítems de los cuales
      // solo 2 pertenecen a ese instrumento (Snoring y Observed apnea): faltan
      // Tired, Pressure, BMI, Age, Neck y Gender, y "boca seca" no forma parte de
      // él. Con 3 de 8 ítems el punto de corte publicado (≥5) es inaplicable y el
      // conjunto administrado no tiene propiedades psicométricas conocidas.
      // Ver EVIDENCIA.osa_riesgo_cardiometabolico para el plan de sustitución.
      category: 'Preguntas Complementarias sobre el Descanso Nocturno',
      title: '¿Presentas alguna de estas manifestaciones asociadas a la ventilación o descanso profundo?',
      subtitle: 'Son señales que conviene comentar con un profesional; este cuestionario no las mide ni las diagnostica.',
      condition: (answers) => {
        const sueAns = answers['dim_sueno'];
        const autAns = answers['dim_autonomo'];
        const hasSueFatigue = sueAns && sueAns.selectedItemIds && (
          sueAns.selectedItemIds.includes('item_sue_inercia_matutina') ||
          sueAns.selectedItemIds.includes('item_sue_pesadez_corporal') ||
          sueAns.selectedItemIds.includes('item_sue_microdespertares')
        );
        const hasAutSevere = autAns && autAns.selectedItemIds && (
          autAns.selectedItemIds.includes('item_aut_bruxismo') ||
          autAns.selectedItemIds.includes('item_aut_taquicardia')
        );
        const totalSueItems = (sueAns && sueAns.selectedItemIds) ? sueAns.selectedItemIds.length : 0;
        // Auto-disparo por carga cardiometabólica: los ítems de esta rama cargan
        // también en ese eje, y sin esta cláusula un paciente con carga cardio
        // máxima jamás vería el tamizaje pese a ser el perfil que más lo amerita.
        // CRITERIO CLÍNICO A RATIFICAR por dirección médica.
        const cardAns = answers['dim_cardiometabolico'];
        const totalCardItems = (cardAns && cardAns.selectedItemIds) ? cardAns.selectedItemIds.length : 0;
        return (totalSueItems >= 2) || (hasSueFatigue && hasAutSevere) || (totalCardItems >= 3);
      },
      items: [
        {
          id: 'item_apnea_ronquido',
          text: 'Ronquido audible frecuente reportado por terceras personas al dormir.',
          weights: { sueno: 22, cardiometabolico: 12 }
        },
        {
          id: 'item_apnea_boca_seca',
          text: 'Despertares periódicos con garganta o boca intensamente seca, o necesidad de beber agua en la madrugada.',
          weights: { sueno: 16 }
        },
        {
          id: 'item_apnea_pausas_ahogo',
          text: 'Pausas en la respiración observadas por otros o despertares bruscos con sobresalto / sensación de asfixia.',
          weights: { sueno: 38, cardiometabolico: 28, autonomo: 18 }
        }
      ],
      optimalOption: {
        id: 'opt_apnea_optimo',
        text: 'Sin ronquidos significativos, despertares por asfixia ni sospecha de interrupciones respiratorias.'
      }
    },
    branch_inflamacion_metabolica: {
      id: 'dim_cond_inflamacion_metabolica',
      axis: 'terreno',
      // Antes "Microinflamación Tisular & Resistencia Periférica", y el título le
      // pedía al paciente reconocer su propia fisiopatología. Búsqueda en PubMed:
      // los síntomas digestivos autorreportados NO son indicador validado de
      // inflamación de bajo grado (la consulta específica devuelve 1 case report).
      // Lo que sí tiene respaldo es adiposidad visceral ↔ inflamación, y aun así
      // por perímetro medido, no por percepción. Se pregunta por lo que se puede
      // preguntar: cómo percibe su cuerpo, sin nombrar el mecanismo.
      category: 'Composición Corporal y Recuperación Física',
      title: '¿Reconoces alguno de estos cambios en tu cuerpo y en tu recuperación física?',
      subtitle: 'Profundiza en los signos de sobrecarga y de recuperación que percibes en tu cuerpo.',
      condition: (answers) => {
        const cardAns = answers['dim_cardiometabolico'];
        const terAns = answers['dim_terreno'];
        const totalCardItems = (cardAns && cardAns.selectedItemIds) ? cardAns.selectedItemIds.length : 0;
        const totalTerItems = (terAns && terAns.selectedItemIds) ? terAns.selectedItemIds.length : 0;
        const hasCardSevere = cardAns && cardAns.selectedItemIds && (
          cardAns.selectedItemIds.includes('item_card_diagnostico_propio') ||
          cardAns.selectedItemIds.includes('item_card_somnolencia_post')
        );
        // Las tres cláusulas originales exigen carga cardiometabólica, pese a que
        // el eje de esta rama es TERRENO: un paciente con toda la carga de terreno
        // y sin señales cardio nunca la veía, y su techo quedaba en 57/100 mientras
        // otro con MENOS carga de terreno pero comorbilidad cardio llegaba a 77.
        // El auto-disparo por terreno cierra ese gateo cruzado.
        // CRITERIO CLÍNICO A RATIFICAR por dirección médica.
        return (totalCardItems >= 2 && totalTerItems >= 1)
          || (hasCardSevere && totalTerItems >= 2)
          || (totalCardItems >= 3)
          || (totalTerItems >= 3);
      },
      items: [
        {
          id: 'item_inf_grasa_visceral',
          text: 'Acumulación predominante de grasa abdominal y dificultad marcada para reducir perímetro de cintura.',
          weights: { terreno: 26 }
        },
        {
          id: 'item_inf_fatiga_muscular',
          text: 'Fatiga o debilidad muscular rápida ante esfuerzos físicos cotidianos que antes resultaban sencillos.',
          weights: { terreno: 20 }
        },
        {
          id: 'item_inf_rigidez_articular',
          text: 'Rigidez matutina en articulaciones de manos, pies o rodillas que mejora tras iniciar movimiento.',
          weights: { terreno: 26, ocupacional: 12 }
        }
      ],
      optimalOption: {
        id: 'opt_inf_optimo',
        text: 'Composición corporal equilibrada, adecuada recuperación muscular y sin rigidez articular persistente.'
      }
    }
  };

  /**
   * Denominador absoluto por eje: carga máxima de TODO el catálogo (dimensiones
   * basales + tamizajes condicionales), calculada una sola vez.
   *
   * Antes se sumaba solo sobre las dimensiones ACTIVAS, y eso hacía el score
   * no monótono: disparar un tamizaje agrandaba el denominador, de modo que un
   * paciente que reportaba un síntoma MÁS podía obtener un score MENOR (caso
   * medido: 45 → 38). Peor aún, como algunos ítems cargan en varios ejes, activar
   * el tamizaje de sueño encogía también el eje autónomo (30 → 25).
   *
   * Con denominador fijo la escala es absoluta: comparable entre pacientes y
   * entre aplicaciones sucesivas del mismo paciente. No alcanzar el techo de un
   * eje sin haber pasado por su tamizaje es correcto — significa exactamente que
   * no se exhibieron los síntomas de mayor severidad.
   */
  const AXIS_MAX = (function computeAxisMax() {
    const max = {};
    Object.keys(AXES).forEach(k => { max[k] = 0; });
    [...BASE_DIMENSIONS, ...Object.values(CONDITIONAL_DIMENSIONS)].forEach(dim => {
      dim.items.forEach(it => {
        Object.keys(it.weights || {}).forEach(k => {
          max[k] = (max[k] || 0) + it.weights[k];
        });
      });
    });
    return Object.freeze(max);
  })();

  /**
   * Dificultades a priori por eje, derivadas de los pesos de juicio experto.
   *
   * Un ítem que puntúa alto en un eje describe una manifestación más severa de
   * ese eje, y por tanto solo se afirma en niveles altos del rasgo: peso alto ⇒
   * dificultad alta. La estandarización se hace DENTRO de cada eje, porque los
   * pesos solo son comparables entre ítems del mismo eje.
   *
   * Son parámetros a priori, no calibrados. Se sustituyen en cuanto exista una
   * muestra de respuestas reales.
   */
  const AXIS_DIFFICULTIES = (function computeDifficulties() {
    if (!HAS_RASCH) return {};
    const porEje = {};
    Object.keys(AXES).forEach(k => { porEje[k] = {}; });

    [...BASE_DIMENSIONS, ...Object.values(CONDITIONAL_DIMENSIONS)].forEach(dim => {
      dim.items.forEach(it => {
        Object.keys(it.weights || {}).forEach(k => {
          porEje[k][it.id] = it.weights[k];
        });
      });
    });

    const out = {};
    Object.keys(porEje).forEach(k => {
      out[k] = Rasch.difficultiesFromWeights(porEje[k]);
    });
    return out;
  })();

  /**
   * Controlador Principal del Motor Clínico de Evaluación
   */
  class TestEngine {
    constructor() {
      this.reset();
    }

    reset() {
      this.currentStep = 0;
      this.answers = {};
      this.calculatedResult = null;
      this.startedAt = Date.now();
    }

    /**
     * Función pura determinista: calcula la lista ordenada de dimensiones activas
     * según el estado actual de answers (resuelve el bug de backtrack)
     */
    getActiveQuestions() {
      const questions = [...BASE_DIMENSIONS];

      Object.keys(CONDITIONAL_DIMENSIONS).forEach(key => {
        const condDim = CONDITIONAL_DIMENSIONS[key];
        if (condDim.condition(this.answers)) {
          questions.push(condDim);
        }
      });

      return questions;
    }

    getQuestionsCount() {
      return this.getActiveQuestions().length;
    }

    getCurrentQuestion() {
      const active = this.getActiveQuestions();
      if (this.currentStep >= active.length) {
        this.currentStep = Math.max(0, active.length - 1);
      }
      return active[this.currentStep] || null;
    }

    /**
     * Registra o actualiza la respuesta para una dimensión.
     * @param {string} dimensionId - ID de la dimensión (ej. 'dim_autonomo')
     * @param {Array<string>} selectedItemIds - Array de IDs de micro-chips seleccionados
     * @param {boolean} isOptimal - True si el usuario marcó "Estado óptimo"
     */
    answerDimension(dimensionId, selection = [], isOptimal = false) {
      const allDimensions = [...BASE_DIMENSIONS, ...Object.values(CONDITIONAL_DIMENSIONS)];
      const dim = allDimensions.find(d => d.id === dimensionId);
      if (!dim) {
        throw new Error(`Dimensión no encontrada: ${dimensionId}`);
      }

      if (isOptimal) {
        this.answers[dimensionId] = {
          dimensionId: dim.id,
          axis: dim.axis,
          category: dim.category,
          isOptimal: true,
          selectedItemIds: [],
          unknownItemIds: [],
          selectedItems: [],
          grades: {},
          weights: {},
          unknownWeights: {}
        };
        return;
      }

      // Se acepta tanto la forma antigua (lista de IDs) como la graduada
      // ({id, grade}). Un ID suelto equivale a grado HABITUAL, que es la lectura
      // literal del enunciado original ("experimentas habitualmente"): así el
      // histórico no se reinterpreta al introducir la escala.
      const graded = (selection || []).map(entry => (
        typeof entry === 'string'
          ? { id: entry, grade: GRADE.HABITUAL }
          : { id: entry.id, grade: entry.grade === undefined ? GRADE.HABITUAL : entry.grade }
      ));

      const weights = {};
      const unknownWeights = {};
      const grades = {};
      const affirmed = [];
      const unknown = [];

      graded.forEach(entry => {
        const item = dim.items.find(it => it.id === entry.id);
        if (!item) return;
        grades[item.id] = entry.grade;

        if (entry.grade === GRADE.UNKNOWN) {
          // El peso íntegro pasa a la masa de incertidumbre: no suma carga, pero
          // tampoco se computa como ausencia.
          unknown.push(item);
          Object.keys(item.weights || {}).forEach(k => {
            unknownWeights[k] = (unknownWeights[k] || 0) + item.weights[k];
          });
          return;
        }

        const factor = gradeFactor(entry.grade);
        affirmed.push(item);
        Object.keys(item.weights || {}).forEach(k => {
          weights[k] = (weights[k] || 0) + item.weights[k] * factor;
        });
      });

      this.answers[dimensionId] = {
        dimensionId: dim.id,
        axis: dim.axis,
        category: dim.category,
        isOptimal: false,
        // Solo los síntomas AFIRMADOS cuentan para disparar tamizajes: un "no lo
        // sé" no es evidencia de presencia y no debe abrir ramas por sí solo.
        selectedItemIds: affirmed.map(it => it.id),
        unknownItemIds: unknown.map(it => it.id),
        selectedItems: affirmed.map(it => ({ id: it.id, text: it.text, grade: grades[it.id] })),
        grades,
        weights,
        unknownWeights
      };
    }

    canGoNext() {
      const currentDim = this.getCurrentQuestion();
      if (!currentDim) return false;
      const ans = this.answers[currentDim.id];
      if (!ans) return false;
      // Responder "no lo sé" es una respuesta: habilita avanzar aunque no haya
      // ningún síntoma afirmado.
      return ans.isOptimal
        || (ans.selectedItemIds && ans.selectedItemIds.length > 0)
        || (ans.unknownItemIds && ans.unknownItemIds.length > 0);
    }

    next() {
      const total = this.getQuestionsCount();
      if (this.currentStep < total - 1) {
        this.currentStep++;
        return true;
      }
      return false;
    }

    prev() {
      if (this.currentStep > 0) {
        this.currentStep--;
        return true;
      }
      return false;
    }

    isFinished() {
      const total = this.getQuestionsCount();
      return this.currentStep >= total - 1 && this.canGoNext();
    }

    /**
     * Progreso determinista según la pantalla actual (empieza en 0% en la Dimensión 1)
     */
    getProgressPercentage() {
      const total = this.getQuestionsCount();
      if (total === 0) return 0;
      return Math.round((this.currentStep / total) * 100);
    }

    /**
     * Estima el rasgo latente θ de cada eje sobre los ítems ADMINISTRADOS.
     *
     * A diferencia de la escala 0-100, θ no depende de cuántos ítems se hayan
     * mostrado: es la propiedad que permitirá acortar el test y comparar dos
     * aplicaciones del mismo paciente.
     *
     * Tratamiento de respuestas:
     *   · ítem afirmado con grado   → categoría = grado (1 a 3)
     *   · ítem visto y no marcado   → categoría 0, que es información real
     *   · ítem respondido "no lo sé" → se OMITE de la verosimilitud
     *   · dimensión declarada óptima → todos sus ítems en categoría 0
     *
     * El "no lo sé" omitido es el tratamiento correcto: al no entrar, el error
     * estándar sube por sí solo. El modelo expresa la ignorancia como
     * imprecisión, sin necesidad de inventar un valor.
     */
    estimateAxisTheta(activeDimensions) {
      if (!HAS_RASCH) return null;

      const porEje = {};
      Object.keys(AXES).forEach(k => { porEje[k] = []; });

      activeDimensions.forEach(dim => {
        const ans = this.answers[dim.id];
        if (!ans) return; // dimensión aún sin responder: no aporta información

        dim.items.forEach(it => {
          const grade = ans.isOptimal ? 0 : ans.grades[it.id];
          if (grade === GRADE.UNKNOWN && !ans.isOptimal && it.id in ans.grades) return;

          const category = (typeof grade === 'number') ? grade : 0;
          Object.keys(it.weights || {}).forEach(k => {
            const difficulty = AXIS_DIFFICULTIES[k] && AXIS_DIFFICULTIES[k][it.id];
            if (typeof difficulty !== 'number') return;
            porEje[k].push({ difficulty, category });
          });
        });
      });

      const out = {};
      Object.keys(AXES).forEach(k => {
        const est = Rasch.estimateTheta(porEje[k]);
        const ic = Rasch.confidenceInterval(est);
        out[k] = {
          theta: Number(est.theta.toFixed(3)),
          se: Number(est.se.toFixed(3)),
          items: est.responses,
          ci95: { lower: Number(ic.lower.toFixed(3)), upper: Number(ic.upper.toFixed(3)) },
          scale: Rasch.thetaToScale(est.theta)
        };
      });
      return out;
    }

    /**
     * Calcula los resultados multidimensionales y el triaje clínico
     */
    calculateResults() {
      const activeDimensions = this.getActiveQuestions();
      const axisRaw = { autonomo: 0, sueno: 0, cardiometabolico: 0, terreno: 0, ocupacional: 0 };

      const axisUnknown = { autonomo: 0, sueno: 0, cardiometabolico: 0, terreno: 0, ocupacional: 0 };

      // Sumar los pesos de los chips seleccionados por el usuario. El denominador
      // NO se acumula aquí: es AXIS_MAX, constante e independiente del branching.
      // La masa de los ítems respondidos "no lo sé" se acumula aparte: no suma
      // carga, pero define cuánto podría estar subestimándose el resultado.
      activeDimensions.forEach(dim => {
        const ans = this.answers[dim.id];
        if (!ans || ans.isOptimal) return;

        Object.keys(ans.weights || {}).forEach(k => {
          axisRaw[k] = (axisRaw[k] || 0) + ans.weights[k];
        });
        Object.keys(ans.unknownWeights || {}).forEach(k => {
          axisUnknown[k] = (axisUnknown[k] || 0) + ans.unknownWeights[k];
        });
      });

      // Normalización a escala 0-100 por eje (0 = óptimo, 100 = sobrecarga severa)
      // Cada eje se reporta como intervalo: la cota inferior supone que todo lo
      // desconocido está ausente y la superior que está presente al máximo. El
      // valor puntual es el punto medio. Sin respuestas "no lo sé" el intervalo
      // colapsa a un punto y el resultado es idéntico al del cálculo directo.
      const axisScores = {};
      const axisResilience = {};
      const axisBounds = {};

      Object.keys(AXES).forEach(k => {
        const max = AXIS_MAX[k] || 1;
        const raw = axisRaw[k] || 0;
        const lower = Math.min(100, Math.round((raw / max) * 100));
        const upper = Math.min(100, Math.round(((raw + (axisUnknown[k] || 0)) / max) * 100));
        const point = Math.round((lower + upper) / 2);

        axisScores[k] = point;
        axisResilience[k] = 100 - point;
        axisBounds[k] = { lower, upper, uncertainty: upper - lower };
      });

      // Score Global con Modulación por Pico Crítico (70% carga difusa + 30% pico unipolar)
      const w = SCORING_CONFIG.weights;
      let weightedAverage = 0;
      let maxAxisScore = 0;
      let maxAxisKey = 'autonomo';

      Object.keys(w).forEach(k => {
        const val = axisScores[k] || 0;
        weightedAverage += val * w[k];
        if (val > maxAxisScore) {
          maxAxisScore = val;
          maxAxisKey = k;
        }
      });

      let globalChargeScore = Math.round((weightedAverage * 0.7) + (maxAxisScore * 0.3));
      globalChargeScore = Math.min(100, Math.max(0, globalChargeScore));

      // El mismo agregado aplicado a las cotas de cada eje: cuánto podría variar
      // el resultado global según lo que el paciente no supo responder.
      const aggregate = (pick) => {
        let avg = 0;
        let peak = 0;
        Object.keys(w).forEach(k => {
          const val = pick(k);
          avg += val * w[k];
          if (val > peak) peak = val;
        });
        return Math.min(100, Math.max(0, Math.round(avg * 0.7 + peak * 0.3)));
      };

      const globalLower = aggregate(k => axisBounds[k].lower);
      const globalUpper = aggregate(k => axisBounds[k].upper);

      // Estratificación de Riesgo con Override Uniaxial
      const t = SCORING_CONFIG.thresholds;
      let riskLevel = 'bajo';
      let riskBadge = 'Carga Celular Baja 🟢';
      let riskColor = '#10B981';
      let riskTitle = 'Equilibrio Bioeléctrico en Rango Compensatorio';
      let riskSummary = 'Lo que reportas describe una buena capacidad de adaptación: descanso, tolerancia al estrés y digestión se mantienen en rangos funcionales estables.';

      if (globalChargeScore > t.highGlobal || maxAxisScore >= t.highMaxAxis) {
        riskLevel = 'alto';
        riskBadge = 'Sobrecarga Multisistémica Activa 🔴';
        riskColor = '#EF4444';
        riskTitle = 'Señales de Estrés Celular y Fatiga Funcional Sostenida';
        riskSummary = 'Lo que reportas muestra acumulación simultánea de tensión sostenida, sobrecarga digestiva y fatiga de recuperación. Un patrón así, mantenido en el tiempo, suele preceder a alteraciones que conviene atender temprano.';
      } else if (globalChargeScore >= t.moderateGlobal || maxAxisScore >= t.moderateMaxAxis) {
        riskLevel = 'moderado';
        riskBadge = 'Carga Celular Moderada 🟡';
        riskColor = '#F59E0B';
        riskTitle = 'Desequilibrios Funcionales Silenciosos Detectados';
        riskSummary = 'Tu perfil muestra signos tempranos de sobrecarga digestiva, tensión sostenida o fatiga de recuperación. Tu organismo todavía compensa, y ese margen es precisamente la ventana preventiva.';
      }

      // Ordenar ejes por nivel de sobrecarga
      const sortedAxes = Object.keys(axisScores)
        .map(k => ({ id: k, score: axisScores[k], meta: AXES[k] }))
        .sort((a, b) => b.score - a.score);

      const dominantAxis1 = sortedAxes[0];
      const dominantAxis2 = sortedAxes[1];

      // Síntesis Fisiológica Personalizada
      let physiologicalInsight = '';
      if (dominantAxis1.score >= 35) {
        physiologicalInsight = `Tu principal foco de atención es el eje de **${dominantAxis1.meta.name}** (${dominantAxis1.score}/100), secundado por **${dominantAxis2.meta.name}** (${dominantAxis2.score}/100). Esto es el patrón que tú reportas, no una medición: el paso siguiente es objetivarlo. La evaluación en clínica mide directamente tu composición corporal —agua intracelular y extracelular, ángulo de fase— que suele modificarse antes de que los análisis sanguíneos convencionales se alteren.`;
      } else {
        physiologicalInsight = 'Lo que reportas se ubica en rangos de estabilidad. Una evaluación periódica en clínica permite detectar cambios en tu composición corporal antes de que se traduzcan en síntomas.';
      }

      this.calculatedResult = {
        axisTheta: this.estimateAxisTheta(activeDimensions),
        globalChargeScore,
        globalResilienceScore: 100 - globalChargeScore,
        riskLevel,
        riskBadge,
        riskColor,
        riskTitle,
        riskSummary,
        physiologicalInsight,
        axisScores,
        axisResilience,
        axisBounds,
        globalBounds: { lower: globalLower, upper: globalUpper, uncertainty: globalUpper - globalLower },
        sortedAxes,
        dominantAxis1,
        dominantAxis2,
        totalDimensionsAnswered: activeDimensions.filter(d => this.answers[d.id] !== undefined).length
      };

      return this.calculatedResult;
    }

    /**
     * Construye el enlace con payload enriquecido para WhatsApp
     */
    generateWhatsAppUrl(userName = '', phone = '525585327421') {
      if (!this.calculatedResult) {
        this.calculateResults();
      }

      const res = this.calculatedResult;
      const cleanName = userName.trim() || 'Paciente';

      // El mensaje declara lo que el test es: síntomas que la persona reporta.
      // No anuncia mediciones ni diagnósticos, porque no los hizo.
      const lines = [
        `*AUTOEVALUACIÓN DE SÍNTOMAS — VITAMETRIC*`,
        `👤 *Nombre:* ${cleanName}`,
        `📊 *Carga de síntomas reportados:* ${res.globalChargeScore}/100 (${res.riskBadge})`,
        ``,
        `*Desglose por área (según lo que reporté):*`,
        `• ⚡ *Autónomo/Estrés:* ${res.axisScores.autonomo}/100`,
        `• 🌙 *Sueño/Circadiano:* ${res.axisScores.sueno}/100`,
        `• ❤️ *Cardiometabólico:* ${res.axisScores.cardiometabolico}/100`,
        `• 🧬 *Terreno Digestivo:* ${res.axisScores.terreno}/100`,
        `• 💼 *Carga Laboral:* ${res.axisScores.ocupacional}/100`,
        ``,
        `⚠️ *Área con mayor carga:* ${res.dominantAxis1.meta.name} (${res.dominantAxis1.score}/100)`
      ];

      // Si hubo respuestas "no lo sé", el rango posible viaja con el resultado:
      // ocultarlo daría una precisión que el dato no tiene.
      if (res.globalBounds && res.globalBounds.uncertainty > 0) {
        lines.push(`❓ *Rango por preguntas sin respuesta:* ${res.globalBounds.lower} a ${res.globalBounds.upper}/100`);
      }

      lines.push(
        ``,
        `🎯 *Motivo:* Quiero agendar la *Evaluación Multisistémica ES-Complex ($3,900 MXN)* para que se me midan en clínica los parámetros de composición corporal y balance de fluidos.`,
        ``,
        `_Esto es una autoevaluación de síntomas percibidos: no es un diagnóstico ni una medición._`
      );

      return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`;
    }
  }

  return {
    AXES,
    AXIS_MAX,
    GRADE,
    GRADE_LABELS,
    UNKNOWN_LABEL,
    gradeFactor,
    SCORING_CONFIG,
    BASE_DIMENSIONS,
    CONDITIONAL_DIMENSIONS,
    TestEngine,
    createInstance: () => new TestEngine()
  };
}));
