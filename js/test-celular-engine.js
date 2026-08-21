/**
 * Vitametric — Motor Clínico de Autoevaluación Celular y Triaje Multidimensional
 * 
 * Arquitectura v2026.08 (Orthogonal Micro-Chips Engine):
 * 1. 5 Dimensiones Fisiológicas Basales (Autónomo, Sueño, Cardiometabólico, Terreno, Ocupacional)
 * 2. Matriz de Micro-Chips Desacoplados (0 a N síntomas independientes por dimensión)
 * 3. Branching Dinámico Puro (tamizajes STOP-BANG e Inflamación sin mutación de estado en backtrack)
 * 4. Ponderación Multidimensional Ortogonal y Modulación por Pico Crítico
 * 5. Persistencia Local con TTL (localStorage) y Blindaje Normativo Preventivo (LGS / NOM-051 / ISO 13485)
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VitametricTestEngine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // Configuración Declarativa de Ejes Fisiológicos
  const AXES = {
    autonomo: {
      id: 'autonomo',
      name: 'Balance Autónomo & Estrés',
      shortName: 'Estrés Autónomo',
      icon: '⚡',
      color: '#00C8FF',
      description: 'Evalúa el balance simpático/parasimpático, reactividad neurovegetativa y tono de recuperación vagal.'
    },
    sueno: {
      id: 'sueno',
      name: 'Arquitectura del Sueño & Cronobiología',
      shortName: 'Calidad de Sueño',
      icon: '🌙',
      color: '#818CF8',
      description: 'Evalúa latencia, microdespertares, riesgo de hipoxemia/apnea y capacidad regenerativa celular nocturna.'
    },
    cardiometabolico: {
      id: 'cardiometabolico',
      name: 'Resiliencia Cardiometabólica',
      shortName: 'Cardiometabólico',
      icon: '❤️',
      color: '#EF4444',
      description: 'Analiza la estabilidad glucémica postprandial, energía vespertina y antecedentes vasculares preclínicos.'
    },
    terreno: {
      id: 'terreno',
      name: 'Terreno Biofísico, ipH & Nutrición',
      shortName: 'Terreno & Nutrición',
      icon: '🧬',
      color: '#10B981',
      description: 'Estima la carga de acidez en líquido intersticial (ipH), permeabilidad de barrera y dinámica hídrica.'
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
    thresholds: {
      highGlobal: 50,
      highMaxAxis: 65,
      moderateGlobal: 20,
      moderateMaxAxis: 35
    },
    storageKey: 'vitametric_test_state_v2',
    storageTtlMs: 24 * 60 * 60 * 1000 // 24 horas
  };

  // Dimensiones Basales Estructuradas (Micro-Chips Ortogonales)
  const BASE_DIMENSIONS = [
    {
      id: 'dim_autonomo',
      axis: 'autonomo',
      category: 'Balance Autónomo & Tono Simpático',
      title: '¿Cuáles de las siguientes manifestaciones de sobretensión o reactividad experimentas habitualmente?',
      subtitle: 'Permite estimar la reactividad neurovegetativa y la sobrecarga simpática sostenida.',
      items: [
        {
          id: 'item_aut_tension_cervical',
          text: 'Tensión muscular o contracturas frecuentes en cuello, hombros o trapecios.',
          weights: { autonomo: 14, ocupacional: 8 }
        },
        {
          id: 'item_aut_bruxismo',
          text: 'Apretamiento dental nocturno o sobretensión involuntaria en mandíbula (bruxismo).',
          weights: { autonomo: 18, sueno: 10 }
        },
        {
          id: 'item_aut_taquicardia',
          text: 'Palpitaciones, taquicardias ocasionales o sensación de pecho acelerado ante estrés.',
          weights: { autonomo: 28, cardiometabolico: 18 }
        },
        {
          id: 'item_aut_mente_acelerada',
          text: 'Dificultad para desconectar la mente al acostarse o sensación de urgencia interior continua.',
          weights: { autonomo: 20, sueno: 12 }
        },
        {
          id: 'item_aut_manos_frias',
          text: 'Manos o pies fríos frecuentemente, o sudoración palmar en momentos de exigencia psicofísica.',
          weights: { autonomo: 14, terreno: 8 }
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
      subtitle: 'Evalúa la eficiencia de la regeneración vagal nocturna y la sincronización circadiana.',
      items: [
        {
          id: 'item_sue_inercia_matutina',
          text: 'Fatiga o inercia de sueño prolongada (>30 min al despertar); necesidad indispensable de café para arrancar.',
          weights: { sueno: 18, autonomo: 8 }
        },
        {
          id: 'item_sue_microdespertares',
          text: 'Microdespertares frecuentes durante la noche o sensación de sueño superficial y ligero.',
          weights: { sueno: 24, autonomo: 12 }
        },
        {
          id: 'item_sue_latencia_alta',
          text: 'Dificultad marcada para conciliar el sueño (tardo más de 40 a 60 minutos en dormirme).',
          weights: { sueno: 18, autonomo: 14 }
        },
        {
          id: 'item_sue_pesadez_corporal',
          text: 'Sensación de cuerpo no reparado, pesadez física o falta de descanso acumulada desde hace semanas.',
          weights: { sueno: 26, terreno: 12, autonomo: 10 }
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
      category: 'Homeostasis Glucémica & Resiliencia Vascular',
      title: '¿Presentas alguna de las siguientes señales de fluctuación metabólica o antecedentes familiares?',
      subtitle: 'Analiza la estabilidad energética postprandial y la carga de susceptibilidad metabólica preclínica.',
      items: [
        {
          id: 'item_card_somnolencia_post',
          text: 'Somnolencia pronunciada o caídas drásticas de energía tras comidas (entre 2:00 y 5:00 PM).',
          weights: { cardiometabolico: 22, terreno: 12 }
        },
        {
          id: 'item_card_niebla_mental',
          text: 'Niebla mental, dispersión cognitiva o dificultad de concentración en horas de la tarde.',
          weights: { cardiometabolico: 18, autonomo: 10 }
        },
        {
          id: 'item_card_antojos_dulces',
          text: 'Apetito recurrente o necesidad intensa de carbohidratos refinados, pan o azúcar por la tarde.',
          weights: { cardiometabolico: 18, terreno: 14 }
        },
        {
          id: 'item_card_herencia_familiar',
          text: 'Antecedentes familiares directos (padres o hermanos) con diabetes, hipertensión o dislipidemia.',
          weights: { cardiometabolico: 22 }
        },
        {
          id: 'item_card_diagnostico_propio',
          text: 'Diagnóstico médico previo personal de resistencia a la insulina, hígado graso, dislipidemia o hipertensión.',
          weights: { cardiometabolico: 40, terreno: 18 }
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
      category: 'Terreno Intersticial, ipH & Dinámica Digestiva',
      title: '¿Cuáles de estas alteraciones digestivas o de fluidos corporales experimentas habitualmente?',
      subtitle: 'Estima posibles variaciones en líquido intersticial, barrera digestiva y equilibrio ácido-base tisular.',
      items: [
        {
          id: 'item_ter_distension',
          text: 'Distensión o hinchazón abdominal visible y pesadez gástrica al final de la jornada.',
          weights: { terreno: 20, autonomo: 6 }
        },
        {
          id: 'item_ter_acidez_reflujo',
          text: 'Sensación de acidez, reflujo gástrico o ardor estomacal frecuente.',
          weights: { terreno: 20, autonomo: 10 }
        },
        {
          id: 'item_ter_transito_irregular',
          text: 'Tránsito digestivo irregular (estreñimiento recurrente o alternancia con deposiciones sueltas).',
          weights: { terreno: 18, cardiometabolico: 8 }
        },
        {
          id: 'item_ter_pesadez_piernas',
          text: 'Pesadez o hinchazón visible en piernas/tobillos (marcas de calcetines) tras estar sentado o de pie.',
          weights: { terreno: 22, cardiometabolico: 14, ocupacional: 10 }
        },
        {
          id: 'item_ter_retencion_parpados',
          text: 'Hinchazón en párpados/manos al despertar o tendencia a extremidades frías constantes.',
          weights: { terreno: 16, cardiometabolico: 10 }
        }
      ],
      optimalOption: {
        id: 'opt_ter_optimo',
        text: 'Digestión ligera y regular, libre de acidez o distensión, con adecuada dinámica circulatoria intersticial.'
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
          weights: { ocupacional: 26, cardiometabolico: 10 }
        },
        {
          id: 'item_ocu_pantallas_continuas',
          text: 'Exposición intensa a pantallas y dispositivos con presencia de fatiga visual o cefalea tensional.',
          weights: { ocupacional: 20, autonomo: 12 }
        },
        {
          id: 'item_ocu_molestia_lumbar',
          text: 'Molestia o rigidez recurrente en zona cervical, dorsal o lumbar al terminar la jornada laboral.',
          weights: { ocupacional: 26, autonomo: 10 }
        },
        {
          id: 'item_ocu_pausas_escasas',
          text: 'Jornadas de trabajo con mínimas pausas activas y dificultad para realizar ejercicio compensatorio regular.',
          weights: { ocupacional: 18, cardiometabolico: 8 }
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
      category: 'Tamizaje Complementario STOP-BANG (Apnea & Oxigenación Nocturna)',
      title: '¿Presentas alguna de estas manifestaciones asociadas a la ventilación o descanso profundo?',
      subtitle: 'Ayuda a identificar posibles caídas transitorias de oxigenación o microdespertares nocturnos.',
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
        return (totalSueItems >= 2) || (hasSueFatigue && hasAutSevere);
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
      category: 'Microinflamación Tisular & Resistencia Periférica',
      title: '¿Reconoces signos de resistencia periférica o microinflamación en tu composición corporal?',
      subtitle: 'Permite profundizar en el estado de glicación tisular y acidez del fluido intersticial.',
      condition: (answers) => {
        const cardAns = answers['dim_cardiometabolico'];
        const terAns = answers['dim_terreno'];
        const totalCardItems = (cardAns && cardAns.selectedItemIds) ? cardAns.selectedItemIds.length : 0;
        const totalTerItems = (terAns && terAns.selectedItemIds) ? terAns.selectedItemIds.length : 0;
        const hasCardSevere = cardAns && cardAns.selectedItemIds && (
          cardAns.selectedItemIds.includes('item_card_diagnostico_propio') ||
          cardAns.selectedItemIds.includes('item_card_somnolencia_post')
        );
        return (totalCardItems >= 2 && totalTerItems >= 1) || (hasCardSevere && totalTerItems >= 2) || (totalCardItems >= 3);
      },
      items: [
        {
          id: 'item_inf_grasa_visceral',
          text: 'Acumulación predominante de grasa abdominal y dificultad marcada para reducir perímetro de cintura.',
          weights: { terreno: 26, cardiometabolico: 24 }
        },
        {
          id: 'item_inf_fatiga_muscular',
          text: 'Fatiga o debilidad muscular rápida ante esfuerzos físicos cotidianos que antes resultaban sencillos.',
          weights: { terreno: 20, cardiometabolico: 16, autonomo: 10 }
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
    answerDimension(dimensionId, selectedItemIds = [], isOptimal = false) {
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
          selectedItems: [],
          weights: {}
        };
      } else {
        const validItems = dim.items.filter(it => selectedItemIds.includes(it.id));
        const combinedWeights = {};

        validItems.forEach(it => {
          Object.keys(it.weights || {}).forEach(k => {
            combinedWeights[k] = (combinedWeights[k] || 0) + it.weights[k];
          });
        });

        this.answers[dimensionId] = {
          dimensionId: dim.id,
          axis: dim.axis,
          category: dim.category,
          isOptimal: false,
          selectedItemIds: validItems.map(it => it.id),
          selectedItems: validItems.map(it => ({ id: it.id, text: it.text })),
          weights: combinedWeights
        };
      }

      this.saveToStorage();
    }

    canGoNext() {
      const currentDim = this.getCurrentQuestion();
      if (!currentDim) return false;
      const ans = this.answers[currentDim.id];
      return ans !== undefined && (ans.isOptimal || ans.selectedItemIds.length > 0);
    }

    next() {
      const total = this.getQuestionsCount();
      if (this.currentStep < total - 1) {
        this.currentStep++;
        this.saveToStorage();
        return true;
      }
      return false;
    }

    prev() {
      if (this.currentStep > 0) {
        this.currentStep--;
        this.saveToStorage();
        return true;
      }
      return false;
    }

    isFinished() {
      const total = this.getQuestionsCount();
      return this.currentStep >= total - 1 && this.canGoNext();
    }

    getProgressPercentage() {
      const total = this.getQuestionsCount();
      if (total === 0) return 0;
      return Math.round(((this.currentStep + 1) / total) * 100);
    }

    /**
     * Calcula los resultados multidimensionales y el triaje clínico
     */
    calculateResults() {
      const activeDimensions = this.getActiveQuestions();
      const axisRaw = { autonomo: 0, sueno: 0, cardiometabolico: 0, terreno: 0, ocupacional: 0 };
      const axisMax = { autonomo: 0, sueno: 0, cardiometabolico: 0, terreno: 0, ocupacional: 0 };

      // Calcular puntos obtenidos y máximos teóricos posibles por eje
      activeDimensions.forEach(dim => {
        const ans = this.answers[dim.id];
        const selectedWeights = (ans && !ans.isOptimal) ? (ans.weights || {}) : {};

        // Sumar los máximos de todos los chips de esta dimensión
        dim.items.forEach(it => {
          Object.keys(it.weights || {}).forEach(k => {
            axisMax[k] = (axisMax[k] || 0) + it.weights[k];
          });
        });

        // Sumar los pesos de los chips seleccionados por el usuario
        Object.keys(selectedWeights).forEach(k => {
          axisRaw[k] = (axisRaw[k] || 0) + selectedWeights[k];
        });
      });

      // Normalización a escala 0-100 por eje (0 = óptimo, 100 = sobrecarga severa)
      const axisScores = {};
      const axisResilience = {};

      Object.keys(AXES).forEach(k => {
        const raw = axisRaw[k] || 0;
        const max = axisMax[k] || 1;
        const normalized = Math.min(100, Math.round((raw / max) * 100));
        axisScores[k] = normalized;
        axisResilience[k] = 100 - normalized;
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

      // Estratificación de Riesgo con Override Uniaxial
      const t = SCORING_CONFIG.thresholds;
      let riskLevel = 'bajo';
      let riskBadge = 'Carga Celular Baja 🟢';
      let riskColor = '#10B981';
      let riskTitle = 'Equilibrio Bioeléctrico en Rango Compensatorio';
      let riskSummary = 'Tu organismo mantiene una adecuada capacidad de adaptación homeostática. Los mecanismos de regulación celular, tono vagal y biofísica intersticial se encuentran en rangos funcionales estables.';

      if (globalChargeScore > t.highGlobal || maxAxisScore >= t.highMaxAxis) {
        riskLevel = 'alto';
        riskBadge = 'Sobrecarga Multisistémica Activa 🔴';
        riskColor = '#EF4444';
        riskTitle = 'Señales de Estrés Celular y Fatiga Funcional Sostenida';
        riskSummary = 'Detectamos una acumulación simultánea de tensión neuroautonómica, alteración del terreno intersticial o fatiga circadiana. Estos desequilibrios funcionales sostenidos pueden elevar el riesgo de disfunciones si no se abordan a tiempo.';
      } else if (globalChargeScore >= t.moderateGlobal || maxAxisScore >= t.moderateMaxAxis) {
        riskLevel = 'moderado';
        riskBadge = 'Carga Celular Moderada 🟡';
        riskColor = '#F59E0B';
        riskTitle = 'Desequilibrios Funcionales Silenciosos Detectados';
        riskSummary = 'Tu perfil evidencia signos tempranos de acidez tisular, tensión simpática sostenida o fatiga de recuperación. Aunque tu organismo aún compensa, estas variaciones en fluido intersticial representan una ventana preventiva ideal.';
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
        physiologicalInsight = `Tu principal foco de atención es el eje de **${dominantAxis1.meta.name}** (${dominantAxis1.score}/100), secundado por **${dominantAxis2.meta.name}** (${dominantAxis2.score}/100). Este patrón suele asociarse a un gasto compensatorio elevado en fluido intersticial que la medicina convencional no suele cuantificar antes de que los análisis sanguíneos se alteren.`;
      } else {
        physiologicalInsight = 'Tus marcadores se encuentran en rangos de estabilidad. Una evaluación periódica con ES-Complex permite anticipar fluctuaciones sutiles en resistencia celular y tono vagal.';
      }

      this.calculatedResult = {
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
        sortedAxes,
        dominantAxis1,
        dominantAxis2,
        totalDimensionsAnswered: Object.keys(this.answers).length
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

      const lines = [
        `*AUTOTEST DE SALUD CELULAR — VITAMETRIC*`,
        `👤 *Nombre:* ${cleanName}`,
        `📊 *Score de Carga Celular:* ${res.globalChargeScore}/100 (${res.riskBadge})`,
        ``,
        `*Desglose por Ejes Fisiológicos:*`,
        `• ⚡ *Autónomo/Estrés:* ${res.axisScores.autonomo}/100`,
        `• 🌙 *Sueño/Circadiano:* ${res.axisScores.sueno}/100`,
        `• ❤️ *Cardiometabólico:* ${res.axisScores.cardiometabolico}/100`,
        `• 🧬 *Terreno/ipH:* ${res.axisScores.terreno}/100`,
        `• 💼 *Carga Laboral:* ${res.axisScores.ocupacional}/100`,
        ``,
        `⚠️ *Vulnerabilidad dominante:* ${res.dominantAxis1.meta.name} (${res.dominantAxis1.score}/100)`,
        ``,
        `🎯 *Motivo:* Deseo agendar mi *Evaluación Multisistémica ES-Complex ($3,900 MXN)* para mapear objetivamente mi líquido intersticial y balance bioeléctrico en clínica.`
      ];

      return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`;
    }

    /**
     * Persistencia Resiliente en localStorage
     */
    saveToStorage() {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const payload = {
            currentStep: this.currentStep,
            answers: this.answers,
            timestamp: Date.now()
          };
          window.localStorage.setItem(SCORING_CONFIG.storageKey, JSON.stringify(payload));
        }
      } catch (e) {
        // Ignorar excepciones en entornos privados/restringidos
      }
    }

    loadFromStorage() {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const raw = window.localStorage.getItem(SCORING_CONFIG.storageKey);
          if (!raw) return false;
          const data = JSON.parse(raw);
          if (Date.now() - data.timestamp < SCORING_CONFIG.storageTtlMs) {
            this.currentStep = data.currentStep || 0;
            this.answers = data.answers || {};
            return true;
          } else {
            this.clearStorage();
          }
        }
      } catch (e) {
        // Ignorar corrupción de storage
      }
      return false;
    }

    clearStorage() {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(SCORING_CONFIG.storageKey);
        }
      } catch (e) {}
    }
  }

  return {
    AXES,
    SCORING_CONFIG,
    BASE_DIMENSIONS,
    CONDITIONAL_DIMENSIONS,
    TestEngine,
    createInstance: () => new TestEngine()
  };
}));
