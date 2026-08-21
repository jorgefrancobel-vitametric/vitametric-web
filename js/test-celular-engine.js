/**
 * Vitametric — Motor Clínico de Autoevaluación Celular y Triaje Multidimensional
 * 
 * Basado en los 5 pilares de inferencia de skills/medical/:
 * 1. Balance Autónomo & VFC (hrv-alexithymia-expert, neurokit2 -> Nivel L1b/L2 ES-Complex)
 * 2. Arquitectura del Sueño & Ritmo Circadiano (sleep-analyzer, PSQI, STOP-BANG -> Nivel L2)
 * 3. Perfil Cardiometabólico & Vascular (fitness-analyzer, health-trend-analyzer -> Nivel L1/L4)
 * 4. Terreno Celular, ipH & Nutrición (nutrition-analyzer, HEI-2015 -> Nivel L1/L2b)
 * 5. Carga Ergonómica & Ocupacional (occupational-health-analyzer, Sedentary/VDT Score)
 * 
 * Gobernanza: Vitametric 2026. Cumple con NOM-051, NOM-035/036 y disclaimers ISO 13485.
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

  // Configuración de Ejes Clínicos
  const AXES = {
    autonomo: {
      id: 'autonomo',
      name: 'Balance Autónomo & Estrés',
      shortName: 'Estrés Autónomo',
      icon: '⚡',
      color: '#00C8FF',
      description: 'Evalúa el equilibrio simpático/parasimpático, reactividad neurovegetativa y variabilidad del ritmo cardíaco.'
    },
    sueno: {
      id: 'sueno',
      name: 'Arquitectura del Sueño & Cronobiología',
      shortName: 'Calidad de Sueño',
      icon: '🌙',
      color: '#818CF8',
      description: 'Evalúa latencia de inicio, microdespertares, riesgo de apnea y capacidad de regeneración celular nocturna.'
    },
    cardiometabolico: {
      id: 'cardiometabolico',
      name: 'Resiliencia Cardiometabólica',
      shortName: 'Cardiometabólico',
      icon: '❤️',
      color: '#EF4444',
      description: 'Analiza factores de riesgo vascular, fluctuaciones glucémicas diurnas y resistencia metabólica.'
    },
    terreno: {
      id: 'terreno',
      name: 'Terreno Biofísico, ipH & Nutrición',
      shortName: 'Terreno & Nutrición',
      icon: '🧬',
      color: '#10B981',
      description: 'Estima la carga de acidez en líquido intersticial, permeabilidad digestiva y balance micronutricional.'
    },
    ocupacional: {
      id: 'ocupacional',
      name: 'Carga Ergonómica & Sobreesfuerzo',
      shortName: 'Sobrecarga Laboral',
      icon: '💼',
      color: '#F59E0B',
      description: 'Cuantifica el impacto del sedentarismo prolongado, tensión visual por pantallas y fatiga postural.'
    }
  };

  // Banco de Preguntas Clínicas Estructuradas
  const BASE_QUESTIONS = [
    {
      id: 'q1_energia_matutina',
      axis: 'sueno',
      category: 'Ritmo Circadiano y Recuperación',
      title: '¿Cómo experimentas tu nivel de energía y lucidez durante los primeros 30 minutos al despertar?',
      subtitle: 'La inercia de sueño prolongada y la fatiga matutina reflejan baja actividad vagal nocturna y desajuste de cortisol.',
      options: [
        {
          text: 'Despierto con energía renovada, sin necesidad inmediata de estimulantes.',
          score: 0,
          weights: { sueno: 0, autonomo: 0 }
        },
        {
          text: 'Tardo entre 20 y 40 minutos en arrancar; requiero café para activarme.',
          score: 1,
          weights: { sueno: 10, autonomo: 5 }
        },
        {
          text: 'Fatiga frecuente al despertar; sensación de sueño ligero o no reparador.',
          score: 2,
          weights: { sueno: 22, autonomo: 15, terreno: 5 }
        },
        {
          text: 'Agotamiento persistente; siento el cuerpo pesado y sin descanso desde hace meses.',
          score: 3,
          weights: { sueno: 35, autonomo: 25, terreno: 15 }
        }
      ]
    },
    {
      id: 'q2_niebla_mental',
      axis: 'cardiometabolico',
      category: 'Homeostasis Glucémica y Neuroquímica',
      title: '¿Presentas caídas drásticas de concentración, somnolencia postprandial o niebla mental por la tarde?',
      subtitle: 'Los bajones de energía entre 2:00 y 5:00 PM correlacionan con picos de glucosa/insulina e inflamación celular.',
      options: [
        {
          text: 'Claridad mental constante y nivel de atención sostenido a lo largo del día.',
          score: 0,
          weights: { cardiometabolico: 0, autonomo: 0 }
        },
        {
          text: 'Ligera pesadez ocasional únicamente tras comidas muy copiosas.',
          score: 1,
          weights: { cardiometabolico: 8, terreno: 5 }
        },
        {
          text: 'Somnolencia vespertina habitual y necesidad frecuente de azúcar o cafeína para concentrarme.',
          score: 2,
          weights: { cardiometabolico: 22, terreno: 15, autonomo: 10 }
        },
        {
          text: 'Niebla mental severa diaria, dispersión cognitiva y agotamiento psicofísico vespertino.',
          score: 3,
          weights: { cardiometabolico: 35, terreno: 25, autonomo: 20 }
        }
      ]
    },
    {
      id: 'q3_salud_digestiva',
      axis: 'terreno',
      category: 'Terreno Intersticial y Microbiota',
      title: '¿Con qué frecuencia experimentas distensión abdominal, acidez, digestión pesada o tránsito irregular?',
      subtitle: 'La alteración de la barrera digestiva modifica la conductividad bioeléctrica y el ipH intersticial hacia terreno ácido.',
      options: [
        {
          text: 'Digestión ligera y regular; sin inflamación ni molestias gástricas frecuentes.',
          score: 0,
          weights: { terreno: 0 }
        },
        {
          text: 'Inflamación leve o gases de forma esporádica con ciertos alimentos específicos.',
          score: 1,
          weights: { terreno: 10 }
        },
        {
          text: 'Hinchazón abdominal frecuente al final del día, reflujo o digestión lenta habitual.',
          score: 2,
          weights: { terreno: 25, autonomo: 10 }
        },
        {
          text: 'Molestias digestivas continuas diarias (dolor, inflamación severa, alternancia estreñimiento/diarrea).',
          score: 3,
          weights: { terreno: 35, autonomo: 20, cardiometabolico: 10 }
        }
      ]
    },
    {
      id: 'q4_retencion_microcirculacion',
      axis: 'terreno',
      category: 'Dinámica de Fluidos y Microcirculación',
      title: '¿Observas pesadez en piernas, hinchazón en párpados/manos al despertar o extremidades frías?',
      subtitle: 'La retención hídrica refleja desplazamiento entre agua intracelular (ICW) y extracelular (ECW) en el tejido intersticial.',
      options: [
        {
          text: 'Sin hinchazón, retención ni molestias circulatorias periféricas.',
          score: 0,
          weights: { terreno: 0, cardiometabolico: 0 }
        },
        {
          text: 'Pesadez leve en pies o piernas tras permanecer muchas horas de pie o sentado.',
          score: 1,
          weights: { terreno: 8, ocupacional: 8 }
        },
        {
          text: 'Hinchazón visible frecuente en tobillos/manos, marcas marcadas de calcetines o manos frías constantes.',
          score: 2,
          weights: { terreno: 22, cardiometabolico: 18, ocupacional: 15 }
        },
        {
          text: 'Edema recurrente, pesadez dolorosa en extremidades y rigidez articular matutina.',
          score: 3,
          weights: { terreno: 35, cardiometabolico: 30, ocupacional: 20 }
        }
      ]
    },
    {
      id: 'q5_sedentarismo_pantallas',
      axis: 'ocupacional',
      category: 'Carga Ergonómica y Exposición VDT',
      title: '¿Cuántas horas promedio pasas al día en posición sentada frente a pantallas o dispositivos?',
      subtitle: 'Evalúa el Sedentary Risk Score y la fatiga visual VDT, factores directos de rigidez fascial y estrés oxidativo.',
      options: [
        {
          text: 'Menos de 4 horas al día, con actividad física constante y pausas activas regulares.',
          score: 0,
          weights: { ocupacional: 0 }
        },
        {
          text: 'Entre 4 y 6 horas diarias, realizando interrupciones o caminatas cortas.',
          score: 1,
          weights: { ocupacional: 12 }
        },
        {
          text: 'Entre 6 y 8 horas diarias continuas, con pocas pausas y presencia de fatiga visual u ocular.',
          score: 2,
          weights: { ocupacional: 26, autonomo: 10 }
        },
        {
          text: 'Más de 8 a 10 horas continuas al día, con mínima movilidad y dolor cervical o lumbar frecuente.',
          score: 3,
          weights: { ocupacional: 40, autonomo: 20, terreno: 10 }
        }
      ]
    },
    {
      id: 'q6_tension_estres',
      axis: 'autonomo',
      category: 'Tono Simpático y Sobrecarga Muscular',
      title: '¿Sueles acumular tensión en cuello, hombros, mandíbula (bruxismo) o sensación de urgencia interna?',
      subtitle: 'La contracción isométrica sostenida indica hiperactivación simpática (tono simpático elevado) sin descarga parasimpática.',
      options: [
        {
          text: 'Me siento relajado la mayor parte del tiempo; cuerpo distendido y sin sobretensión.',
          score: 0,
          weights: { autonomo: 0 }
        },
        {
          text: 'Tensión muscular leve en cuello o trapecios solo al finalizar jornadas laborales de alta exigencia.',
          score: 1,
          weights: { autonomo: 10, ocupacional: 5 }
        },
        {
          text: 'Contracturas frecuentes, apretamiento dental nocturno o dificultad para relajar la mente al acostarme.',
          score: 2,
          weights: { autonomo: 26, sueno: 15, ocupacional: 15 }
        },
        {
          text: 'Tensión muscular crónica dolorosa, taquicardia o palpitaciones por estrés y sensación de alerta continua.',
          score: 3,
          weights: { autonomo: 40, sueno: 25, cardiometabolico: 20 }
        }
      ]
    },
    {
      id: 'q7_antecedentes_metabolicos',
      axis: 'cardiometabolico',
      category: 'Carga Familiar y Factores de Riesgo',
      title: '¿Tienes antecedentes familiares o personales de resistencia a la insulina, diabetes, hipertensión o hígado graso?',
      subtitle: 'Estratifica la susceptibilidad biológica preclínica (modelo ADA / Framingham ASCVD).',
      options: [
        {
          text: 'Sin antecedentes conocidos en familiares de primer o segundo grado.',
          score: 0,
          weights: { cardiometabolico: 0 }
        },
        {
          text: 'Un familiar de segundo grado (abuelos, tíos) con diagnóstico metabólico o hipertensión.',
          score: 1,
          weights: { cardiometabolico: 10 }
        },
        {
          text: 'Uno de mis padres o hermanos tiene diagnóstico de diabetes, hipertensión o dislipidemia.',
          score: 2,
          weights: { cardiometabolico: 25, terreno: 10 }
        },
        {
          text: 'Ambos padres o múltiples familiares directos con enfermedades crónicas, o diagnóstico previo personal.',
          score: 3,
          weights: { cardiometabolico: 40, terreno: 20 }
        }
      ]
    }
  ];

  // Preguntas Condicionales de Ramificación (Branching Triggers)
  const CONDITIONAL_QUESTIONS = {
    branch_apnea_sueno: {
      id: 'q_cond_apnea_sueno',
      axis: 'sueno',
      category: 'Tamizaje STOP-BANG (Apnea y Microdespertares)',
      title: '¿Te han informado que roncas de forma audible, o despiertas con la boca seca, sofocación o dolor de cabeza?',
      subtitle: 'Detecta microdespertares por hipoxemia intermitente que impiden la entrada a fases de sueño profundo y REM.',
      condition: (answers) => {
        const q1 = answers['q1_energia_matutina'];
        const q6 = answers['q6_tension_estres'];
        return (q1 && q1.score >= 2) || (q6 && q6.score >= 2);
      },
      options: [
        {
          text: 'No, no ronco ni despierto con sensación de asfixia o boca reseca.',
          score: 0,
          weights: { sueno: 0 }
        },
        {
          text: 'Ronquido leve y ocasional, principalmente al dormir bocarriba o con congestión nasal.',
          score: 1,
          weights: { sueno: 10 }
        },
        {
          text: 'Ronquido frecuente o despertares periódicos con necesidad de beber agua o sequedad de garganta.',
          score: 2,
          weights: { sueno: 25, cardiometabolico: 15 }
        },
        {
          text: 'Ronquido intenso reportado, pausas de respiración observadas o despertares bruscos con sobresalto.',
          score: 3,
          weights: { sueno: 40, cardiometabolico: 30, autonomo: 20 }
        }
      ]
    },
    branch_inflamacion_metabolica: {
      id: 'q_cond_inflamacion_metabolica',
      axis: 'terreno',
      category: 'Microinflamación y Perfil Lipídico/Intersticial',
      title: '¿Presentas grasa abdominal predominante, fatiga muscular rápida tras esfuerzo mínimo o antojos intensos de harinas/dulces?',
      subtitle: 'Correlaciona con disbiosis, glicación tisular y acidez del fluido intersticial (ipH < 7.35).',
      condition: (answers) => {
        const q2 = answers['q2_niebla_mental'];
        const q3 = answers['q3_salud_digestiva'];
        const q7 = answers['q7_antecedentes_metabolicos'];
        return (q2 && q2.score >= 2) || (q3 && q3.score >= 2) || (q7 && q7.score >= 2);
      },
      options: [
        {
          text: 'Composición corporal equilibrada; sin acumulación central ni antojos incontrolables.',
          score: 0,
          weights: { terreno: 0, cardiometabolico: 0 }
        },
        {
          text: 'Ligera grasa abdominal reciente; antojos ocasionales en momentos de mayor estrés.',
          score: 1,
          weights: { terreno: 10, cardiometabolico: 8 }
        },
        {
          text: 'Grasa concentrada en cintura/abdomen y apetito recurrente por carbohidratos refinados por la tarde.',
          score: 2,
          weights: { terreno: 25, cardiometabolico: 22 }
        },
        {
          text: 'Aumento significativo de perímetro abdominal, fatiga muscular inmediata y dificultad marcada para bajar de peso.',
          score: 3,
          weights: { terreno: 40, cardiometabolico: 35, autonomo: 15 }
        }
      ]
    }
  };

  /**
   * Clase controladora del motor de evaluación
   */
  class TestEngine {
    constructor() {
      this.reset();
    }

    reset() {
      this.currentStep = 0;
      this.answers = {};
      this.activeQuestions = [...BASE_QUESTIONS];
      this.calculatedResult = null;
    }

    /**
     * Evalúa si deben inyectarse preguntas condicionales según las respuestas previas
     */
    evaluateBranching() {
      const activeIds = this.activeQuestions.map(q => q.id);

      Object.keys(CONDITIONAL_QUESTIONS).forEach(branchKey => {
        const condQ = CONDITIONAL_QUESTIONS[branchKey];
        if (!activeIds.includes(condQ.id) && condQ.condition(this.answers)) {
          this.activeQuestions.push(condQ);
        }
      });
    }

    /**
     * Registra una respuesta y recalcula el árbol dinámico
     */
    answerQuestion(questionId, optionIndex) {
      const question = this.activeQuestions.find(q => q.id === questionId);
      if (!question || !question.options[optionIndex]) {
        throw new Error(`Opción inválida para la pregunta: ${questionId}`);
      }

      this.answers[questionId] = {
        questionId: question.id,
        questionTitle: question.title,
        axis: question.axis,
        optionIndex: optionIndex,
        optionText: question.options[optionIndex].text,
        score: question.options[optionIndex].score,
        weights: question.options[optionIndex].weights || {}
      };

      this.evaluateBranching();
    }

    getQuestionsCount() {
      return this.activeQuestions.length;
    }

    getCurrentQuestion() {
      return this.activeQuestions[this.currentStep] || null;
    }

    canGoNext() {
      const currentQ = this.getCurrentQuestion();
      return currentQ && this.answers[currentQ.id] !== undefined;
    }

    next() {
      if (this.currentStep < this.activeQuestions.length - 1) {
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
      return this.currentStep >= this.activeQuestions.length - 1 && this.canGoNext();
    }

    getProgressPercentage() {
      if (this.activeQuestions.length === 0) return 0;
      return Math.round(((this.currentStep + 1) / this.activeQuestions.length) * 100);
    }

    /**
     * Calcula los resultados multidimensionales
     */
    calculateResults() {
      const axisRaw = {
        autonomo: 0,
        sueno: 0,
        cardiometabolico: 0,
        terreno: 0,
        ocupacional: 0
      };

      const axisMax = {
        autonomo: 0,
        sueno: 0,
        cardiometabolico: 0,
        terreno: 0,
        ocupacional: 0
      };

      // Cálculo de aportes brutos y máximos teóricos por eje
      this.activeQuestions.forEach(q => {
        const ans = this.answers[q.id];
        const selectedWeights = ans ? ans.weights : {};

        // Encontrar los máximos posibles de esta pregunta por eje
        let maxWeightsForQ = {};
        q.options.forEach(opt => {
          Object.keys(opt.weights || {}).forEach(k => {
            maxWeightsForQ[k] = Math.max(maxWeightsForQ[k] || 0, opt.weights[k]);
          });
        });

        Object.keys(maxWeightsForQ).forEach(k => {
          axisMax[k] = (axisMax[k] || 0) + maxWeightsForQ[k];
        });

        Object.keys(selectedWeights).forEach(k => {
          axisRaw[k] = (axisRaw[k] || 0) + selectedWeights[k];
        });
      });

      // Normalización a escala 0-100 (donde 0 = óptimo, 100 = sobrecarga severa)
      const axisScores = {};
      const axisResilience = {}; // Escala positiva de resiliencia (100 = excelente)

      Object.keys(AXES).forEach(k => {
        const raw = axisRaw[k] || 0;
        const max = axisMax[k] || 1;
        const normalized = Math.min(100, Math.round((raw / max) * 100));
        axisScores[k] = normalized;
        axisResilience[k] = 100 - normalized;
      });

      // Score Global de Carga Celular Ponderado
      const weights = {
        autonomo: 0.25,
        sueno: 0.20,
        cardiometabolico: 0.25,
        terreno: 0.20,
        ocupacional: 0.10
      };

      let globalChargeScore = 0;
      Object.keys(weights).forEach(k => {
        globalChargeScore += (axisScores[k] || 0) * weights[k];
      });
      globalChargeScore = Math.round(globalChargeScore);

      // Determinación de nivel clínico
      let riskLevel = 'bajo';
      let riskBadge = 'Carga Celular Baja 🟢';
      let riskColor = '#10B981';
      let riskTitle = 'Equilibrio Bioeléctrico en Rango Compensatorio';
      let riskSummary = 'Tu organismo mantiene una adecuada capacidad de adaptación homeostática. Los mecanismos de regulación celular y variabilidad autonómica se encuentran en niveles funcionales estables.';

      if (globalChargeScore > 65) {
        riskLevel = 'alto';
        riskBadge = 'Sobrecarga Multisistémica Activa 🔴';
        riskColor = '#EF4444';
        riskTitle = 'Señales Críticas de Estrés Celular y Fatiga Funcional';
        riskSummary = 'Detectamos una acumulación simultánea de tensión neuroautonómica, alteración del terreno intersticial y fatiga circadiana. Estos desequilibrios funcionales sostenidos elevan el riesgo de disfunciones cardiometabólicas si no se corrigen a tiempo.';
      } else if (globalChargeScore > 35) {
        riskLevel = 'moderado';
        riskBadge = 'Carga Celular Moderada 🟡';
        riskColor = '#F59E0B';
        riskTitle = 'Desequilibrios Funcionales Silenciosos Detectados';
        riskSummary = 'Tu perfil evidencia signos tempranos de acidez tisular, tensión simpática sostenida o fatiga de recuperación. Aunque tu cuerpo aún compensa, estas variaciones en fluido intersticial representan una ventana preventiva ideal antes de que se consoliden síntomas clínicos.';
      }

      // Identificar los 2 ejes con mayor sobrecarga
      const sortedAxes = Object.keys(axisScores)
        .map(k => ({ id: k, score: axisScores[k], meta: AXES[k] }))
        .sort((a, b) => b.score - a.score);

      const dominantAxis1 = sortedAxes[0];
      const dominantAxis2 = sortedAxes[1];

      // Generar síntesis fisiológica personalizada
      let physiologicalInsight = '';
      if (dominantAxis1.score >= 40) {
        physiologicalInsight = `Tu principal foco de atención es el eje de **${dominantAxis1.meta.name}** (${dominantAxis1.score}/100), secundado por **${dominantAxis2.meta.name}** (${dominantAxis2.score}/100). Este patrón suele reflejar un gasto energético compensatorio elevado en fluido intersticial que la medicina convencional no suele cuantificar hasta que los valores sanguíneos se alteran.`;
      } else {
        physiologicalInsight = 'Tus marcadores se encuentran en rangos estables. Una evaluación preventiva anual permite anticipar fluctuaciones sutiles en resistencia celular y tono vagal.';
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
        totalQuestionsAnswered: Object.keys(this.answers).length
      };

      return this.calculatedResult;
    }

    /**
     * Construye el enlace y mensaje estructurado para WhatsApp
     */
    generateWhatsAppUrl(userName = '', phone = '525545229562') {
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

      const message = lines.join('\n');
      return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    }
  }

  return {
    AXES,
    BASE_QUESTIONS,
    CONDITIONAL_QUESTIONS,
    TestEngine,
    createInstance: () => new TestEngine()
  };
}));
