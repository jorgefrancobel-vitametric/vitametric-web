/**
 * Vitametric — Módulo de Internacionalización (i18n)
 *
 * Arquitectura: diccionario inmutable ES ⇄ EN. La detección de idioma es
 * determinista: query param ?lang=en > localStorage vitametric-lang >
 * navigator.language > 'es'. El motor y el chat reciben el idioma como
 * parámetro de fábrica; la UI recibe una función t() para strings on-the-fly.
 *
 * Agregar un idioma nuevo: añadir una entrada al diccionario STRINGS.
 * Todas las claves deben existir en todos los idiomas; si falta, t()
 * devuelve la clave en español como fallback.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VitametricI18n = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** @type {'es'|'en'} */
  var SUPPORTED = ['es', 'en'];
  var FALLBACK = 'es';

  // ═══════════════════════════════════════════════════════════════════════════
  // Diccionario monolítico: clave → { es, en }
  // ═══════════════════════════════════════════════════════════════════════════
  var STRINGS = {
    // ── AXES ──
    'axe_autonomo_name':        { es: 'Tensión y Estrés Percibidos',                en: 'Perceived Tension & Stress' },
    'axe_autonomo_short':       { es: 'Tensión y Estrés',                          en: 'Tension & Stress' },
    'axe_autonomo_patient':     { es: 'la tensión y el estrés',                    en: 'tension and stress' },
    'axe_autonomo_desc':        { es: 'Recoge las manifestaciones de tensión sostenida que percibes: contracturas, palpitaciones y dificultad para desconectar.', en: 'Captures the signs of sustained tension you notice: contractures, palpitations, and difficulty unwinding.' },
    'axe_sueno_name':           { es: 'Descanso y Sueño Reportados',    en: 'Reported Rest & Sleep' },
    'axe_sueno_short':          { es: 'Calidad de Sueño',                         en: 'Sleep Quality' },
    'axe_sueno_patient':        { es: 'el descanso y el sueño',                    en: 'rest and sleep' },
    'axe_sueno_desc':           { es: 'Recoge cómo describes tu descanso: cuánto tardas en dormirte, si despiertas de noche y con qué energía amaneces.', en: 'Captures how you describe your rest: how long you take to fall asleep, whether you wake at night, and how energized you feel in the morning.' },
    'axe_cardiometabolico_name':{ es: 'Energía Diaria y Antecedentes',              en: 'Daily Energy & Reported History' },
    'axe_cardiometabolico_short':{ es: 'Energía y Antecedentes',                        en: 'Energy & History' },
    'axe_cardiometabolico_patient':{ es: 'la energía y el cansancio durante el día', en: 'energy and fatigue during the day' },
    'axe_cardiometabolico_desc':{ es: 'Recoge las fluctuaciones de energía que notas durante el día y los antecedentes personales y familiares que declaras.', en: 'Captures the energy fluctuations you notice during the day and the personal and family history you report.' },
    'axe_terreno_name':         { es: 'Digestión y Retención Reportadas', en: 'Reported Digestion & Fluid Retention' },
    'axe_terreno_short':        { es: 'Digestión',                        en: 'Digestion' },
    'axe_terreno_patient':      { es: 'la digestión y la retención de líquidos',    en: 'digestion and fluid retention' },
    'axe_terreno_desc':         { es: 'Recoge los síntomas digestivos y de retención de líquidos tal como los percibes. Es tu experiencia reportada; la medición física del medio interno corresponde al estudio en clínica.', en: 'Captures digestive and fluid retention symptoms as you perceive them. This is your reported experience; physical measurement of your internal environment requires the in-clinic study.' },
    'axe_ocupacional_name':     { es: 'Carga Ergonómica & Sobreesfuerzo',          en: 'Ergonomic Load & Overexertion' },
    'axe_ocupacional_short':    { es: 'Carga Laboral',                       en: 'Work Load' },
    'axe_ocupacional_patient':  { es: 'la carga del trabajo y las posturas',        en: 'workload and posture' },
    'axe_ocupacional_desc':     { es: 'Recoge la carga postural, el sedentarismo y la tensión por pantallas tal como los percibes.', en: 'Records postural load, sitting and screen strain as you perceive them.' },

    // ── BASE DIMENSIONS ──
    'dim_autonomo_category':  { es: 'Tensión Sostenida y Reactividad al Estrés', en: 'Sustained Tension & Stress Reactivity' },
    'dim_autonomo_title':     { es: '¿Cuáles de las siguientes manifestaciones de sobretensión o reactividad experimentas habitualmente?', en: 'Which of the following signs of over-tension or reactivity do you regularly experience?' },
    'dim_autonomo_subtitle':  { es: 'Recoge las manifestaciones de tensión sostenida que percibes, tal como tú las experimentas.', en: 'Records the signs of sustained tension you notice, as you experience them.' },
    'dim_autonomo_opt':       { es: 'Sin sobretensión ni manifestaciones de estrés significativas (estado de relajación y balance estable).', en: 'No over-tension or significant stress signs (relaxed state and stable balance).' },

    'dim_sueno_category':     { es: 'Arquitectura del Sueño & Recuperación Nocturna', en: 'Sleep Architecture & Nighttime Recovery' },
    'dim_sueno_title':        { es: '¿Qué factores interfieren con tu descanso o tu nivel de vitalidad matutina?', en: 'What factors interfere with your rest or morning vitality?' },
    'dim_sueno_subtitle':     { es: 'Registra cómo duermes y cómo amaneces, tal como tú lo experimentas.', en: 'Records how you sleep and wake up, as you experience it.' },
    'dim_sueno_opt':          { es: 'Sueño profundo y continuo; despierto con energía renovada y mente despejada de forma natural.', en: 'Deep and continuous sleep; wake up with renewed energy and a naturally clear mind.' },

    'dim_cardiometabolico_category': { es: 'Energía a lo Largo del Día y Antecedentes', en: 'Energy Throughout the Day & History' },
    'dim_cardiometabolico_title':    { es: '¿Presentas alguna de las siguientes señales de fluctuación metabólica o antecedentes familiares?', en: 'Do you have any of the following signs of metabolic fluctuation or family history?' },
    'dim_cardiometabolico_subtitle': { es: 'Recoge las fluctuaciones de energía que notas durante el día y los antecedentes que declaras.', en: 'Analyzes postprandial energy stability and preclinical metabolic susceptibility load.' },
    'dim_cardiometabolico_opt':      { es: 'Claridad mental constante, niveles estables de glucosa/energía a lo largo del día y sin antecedentes directos.', en: 'Consistent mental clarity, stable glucose/energy levels throughout the day, and no direct family history.' },

    'dim_terreno_category':   { es: 'Terreno Digestivo y Dinámica de Líquidos', en: 'Digestive Terrain & Fluid Dynamics' },
    'dim_terreno_title':      { es: '¿Cuáles de estas alteraciones digestivas o de fluidos corporales experimentas habitualmente?', en: 'Which of these digestive or body fluid disturbances do you regularly experience?' },
    'dim_terreno_subtitle':   { es: 'Registra las molestias digestivas y de retención tal como las experimentas en tu día a día.', en: 'Records digestive and retention discomfort as you experience it day to day.' },
    'dim_terreno_opt':        { es: 'Digestión ligera y regular, sin acidez ni distensión, y sin hinchazón ni pesadez en extremidades.', en: 'Light and regular digestion, no heartburn or bloating, no swelling or heaviness in limbs.' },

    'dim_ocupacional_category': { es: 'Carga Ergonómica, Postural & Exposición a Pantallas', en: 'Ergonomic, Postural & Screen Exposure Load' },
    'dim_ocupacional_title':    { es: '¿Cuáles son las condiciones predominantes en tu dinámica laboral y postura diaria?', en: 'What are the prevailing conditions in your daily work dynamic and posture?' },
    'dim_ocupacional_subtitle': { es: 'Recoge la carga postural y la tensión por pantallas tal como las percibes.', en: 'Records postural load and screen strain as you perceive them.' },
    'dim_ocupacional_opt':      { es: 'Dinámica laboral activa, movilidad frecuente, pausas ergonómicas regulares y sin fatiga postural.', en: 'Active work dynamic, frequent mobility, regular ergonomic breaks, and no postural fatigue.' },

    // ── ITEMS (35 total) ──
    // Autonomo
    'item_aut_tension_cervical':  { es: 'Tensión muscular o contracturas frecuentes en cuello, hombros o trapecios.', en: 'Muscle tension or frequent contractures in the neck, shoulders, or trapezius.' },
    'item_aut_bruxismo':          { es: 'Apretamiento dental nocturno o sobretensión involuntaria en mandíbula (bruxismo).', en: 'Nighttime teeth grinding or involuntary jaw clenching (bruxism).' },
    'item_aut_taquicardia':       { es: 'Palpitaciones, taquicardias ocasionales o sensación de pecho acelerado ante estrés.', en: 'Palpitations, occasional tachycardia, or sensation of a racing heart under stress.' },
    'item_aut_mente_acelerada':   { es: 'Dificultad para desconectar la mente al acostarse o sensación de urgencia interior continua.', en: 'Difficulty turning off the mind at bedtime or a continuous sense of inner urgency.' },
    'item_aut_manos_frias':       { es: 'Manos o pies fríos frecuentemente, o sudoración palmar en momentos de exigencia psicofísica.', en: 'Frequently cold hands or feet, or palmar sweating during moments of psychophysical demand.' },
    // Sueno
    'item_sue_inercia_matutina':  { es: 'Fatiga o inercia de sueño prolongada (>30 min al despertar); necesidad indispensable de café para arrancar.', en: 'Fatigue or prolonged sleep inertia (>30 min upon waking); essential need for coffee to get started.' },
    'item_sue_microdespertares':  { es: 'Microdespertares frecuentes durante la noche o sensación de sueño superficial y ligero.', en: 'Frequent micro-awakenings during the night or sensation of shallow and light sleep.' },
    'item_sue_latencia_alta':     { es: 'Dificultad marcada para conciliar el sueño (tardo más de 40 a 60 minutos en dormirme).', en: 'Marked difficulty falling asleep (takes more than 40–60 minutes to fall asleep).' },
    'item_sue_pesadez_corporal':  { es: 'Sensación de cuerpo no reparado, pesadez física o falta de descanso acumulada desde hace semanas.', en: 'Sensation of an unrestored body, physical heaviness, or accumulated lack of rest over weeks.' },
    // Cardiometabolico
    'item_card_somnolencia_post': { es: 'Somnolencia pronunciada o caídas drásticas de energía tras comidas (entre 2:00 y 5:00 PM).', en: 'Pronounced drowsiness or drastic energy crashes after meals (between 2:00 and 5:00 PM).' },
    'item_card_niebla_mental':    { es: 'Niebla mental, dispersión cognitiva o dificultad de concentración en horas de la tarde.', en: 'Brain fog, cognitive scatter, or difficulty concentrating in the afternoon.' },
    'item_card_antojos_dulces':   { es: 'Apetito recurrente o necesidad intensa de carbohidratos refinados, pan o azúcar por la tarde.', en: 'Recurring appetite or intense need for refined carbs, bread, or sugar in the afternoon.' },
    'item_card_herencia_familiar':{ es: 'Antecedentes familiares directos (padres o hermanos) con diabetes, hipertensión o dislipidemia.', en: 'Direct family history (parents or siblings) of diabetes, hypertension, or dyslipidemia.' },
    'item_card_diagnostico_propio':{ es: 'Diagnóstico médico previo personal de resistencia a la insulina, hígado graso, dislipidemia o hipertensión.', en: 'Previous personal medical diagnosis of insulin resistance, fatty liver, dyslipidemia, or hypertension.' },
    // Terreno
    'item_ter_distension':        { es: 'Distensión o hinchazón abdominal visible y pesadez gástrica al final de la jornada.', en: 'Visible abdominal distension or bloating and gastric heaviness at the end of the day.' },
    'item_ter_acidez_reflujo':    { es: 'Sensación de acidez, reflujo gástrico o ardor estomacal frecuente.', en: 'Sensation of heartburn, gastric reflux, or frequent stomach burning.' },
    'item_ter_transito_irregular':{ es: 'Tránsito digestivo irregular (estreñimiento recurrente o alternancia con deposiciones sueltas).', en: 'Irregular digestive transit (recurrent constipation or alternating with loose stools).' },
    'item_ter_pesadez_piernas':   { es: 'Pesadez o hinchazón visible en piernas/tobillos (marcas de calcetines) tras estar sentado o de pie.', en: 'Visible heaviness or swelling in legs/ankles (sock marks) after sitting or standing.' },
    'item_ter_retencion_parpados':{ es: 'Hinchazón en párpados/manos al despertar o tendencia a extremidades frías constantes.', en: 'Eyelid/hand swelling upon waking or tendency toward constantly cold extremities.' },
    // Ocupacional
    'item_ocu_sedentarismo_6h':   { es: 'Permanecer sentado más de 6 a 8 horas al día de forma continua con movilidad reducida.', en: 'Sitting more than 6–8 hours a day continuously with reduced mobility.' },
    'item_ocu_pantallas_continuas':{ es: 'Exposición intensa a pantallas y dispositivos con presencia de fatiga visual o cefalea tensional.', en: 'Intense exposure to screens and devices with visual fatigue or tension headaches.' },
    'item_ocu_molestia_lumbar':   { es: 'Molestia o rigidez recurrente en zona cervical, dorsal o lumbar al terminar la jornada laboral.', en: 'Recurring discomfort or stiffness in the cervical, dorsal, or lumbar area after the workday.' },
    'item_ocu_pausas_escasas':    { es: 'Jornadas de trabajo con mínimas pausas activas y dificultad para realizar ejercicio compensatorio regular.', en: 'Workdays with minimal active breaks and difficulty doing regular compensatory exercise.' },
    // Apnea/Sueno
    'item_apnea_ronquido':        { es: 'Ronquido audible frecuente reportado por terceras personas al dormir.', en: 'Frequent audible snoring reported by others while you sleep.' },
    'item_apnea_boca_seca':       { es: 'Despertares periódicos con garganta o boca intensamente seca, o necesidad de beber agua en la madrugada.', en: 'Periodic awakenings with intensely dry throat or mouth, or need to drink water in the early morning.' },
    'item_apnea_pausas_ahogo':    { es: 'Pausas en la respiración observadas por otros o despertares bruscos con sobresalto / sensación de asfixia.', en: 'Breathing pauses observed by others or sudden awakenings with a startle / choking sensation.' },
    // Inflamacion
    'item_inf_grasa_visceral':    { es: 'Acumulación predominante de grasa abdominal y dificultad marcada para reducir perímetro de cintura.', en: 'Predominant accumulation of abdominal fat and marked difficulty reducing waist circumference.' },
    'item_inf_fatiga_muscular':   { es: 'Fatiga o debilidad muscular rápida ante esfuerzos físicos cotidianos que antes resultaban sencillos.', en: 'Rapid muscle fatigue or weakness during everyday physical efforts that used to be easy.' },
    'item_inf_rigidez_articular': { es: 'Rigidez matutina en articulaciones de manos, pies o rodillas que mejora tras iniciar movimiento.', en: 'Morning stiffness in hand, foot, or knee joints that improves after starting movement.' },

    // ── CONDITIONAL DIMENSIONS ──
    'cond_apnea_category':      { es: 'Preguntas Complementarias sobre el Descanso Nocturno', en: 'Additional Questions About Nighttime Rest' },
    'cond_apnea_title':         { es: '¿Presentas alguna de estas manifestaciones asociadas a la ventilación o descanso profundo?', en: 'Do you have any of these signs associated with breathing or deep rest?' },
    'cond_apnea_subtitle':      { es: 'Son señales que conviene comentar con un profesional; este cuestionario no las mide ni las diagnostica.', en: 'These are signs worth discussing with a professional; this questionnaire does not measure or diagnose them.' },
    'cond_apnea_opt':           { es: 'Sin ronquidos significativos, despertares por asfixia ni sospecha de interrupciones respiratorias.', en: 'No significant snoring, choking awakenings, or suspected breathing interruptions.' },
    'cond_inflamacion_category':{ es: 'Composición Corporal y Recuperación Física', en: 'Body Composition & Physical Recovery' },
    'cond_inflamacion_title':   { es: '¿Reconoces alguno de estos cambios en tu cuerpo y en tu recuperación física?', en: 'Do you recognize any of these changes in your body and physical recovery?' },
    'cond_inflamacion_subtitle':{ es: 'Profundiza en los signos de sobrecarga y de recuperación que percibes en tu cuerpo.', en: 'Explores the signs of overload and recovery you perceive in your body.' },
    'cond_inflamacion_opt':     { es: 'Composición corporal equilibrada, adecuada recuperación muscular y sin rigidez articular persistente.', en: 'Balanced body composition, adequate muscle recovery, and no persistent joint stiffness.' },

    // ── GRADE LABELS ──
    'grade_0':    { es: 'Nunca o casi nunca',                       en: 'Never or almost never' },
    'grade_1':    { es: 'Rara vez (alguna vez al mes)',           en: 'Rarely (once a month)' },
    'grade_2':    { es: 'A menudo (1 a 3 veces por semana)',      en: 'Often (1–3 times per week)' },
    'grade_3':    { es: 'Habitualmente (4 o más veces por semana)', en: 'Usually (4 or more times per week)' },
    'grade_unknown': { es: 'No lo sé',                             en: 'I don\'t know' },

    // ── RISK LEVELS ──
    'risk_bajo_badge':   { es: 'Carga sintomática baja 🟢',                          en: 'Low reported symptom load 🟢' },
    'risk_bajo_title':   { es: 'Baja carga de síntomas reportados',  en: 'Low reported symptom load' },
    'risk_bajo_summary': { es: 'Lo que reportas describe una buena capacidad de adaptación: descanso, tolerancia al estrés y digestión se mantienen en rangos funcionales estables.', en: 'What you report describes good adaptive capacity: rest, stress tolerance, and digestion remain in stable functional ranges.' },
    'risk_moderado_badge':   { es: 'Carga sintomática moderada 🟡',                   en: 'Moderate reported symptom load 🟡' },
    'risk_moderado_title':   { es: 'Señales tempranas en lo que reportas', en: 'Early signals in what you report' },
    'risk_moderado_summary': { es: 'Tu perfil muestra signos tempranos de sobrecarga digestiva, tensión sostenida o fatiga de recuperación. Tu organismo todavía compensa, y ese margen es precisamente la ventana preventiva.', en: 'Your profile shows early signs of digestive overload, sustained tension, or recovery fatigue. Your body still compensates, and that margin is precisely the preventive window.' },
    'risk_alto_badge':   { es: 'Carga sintomática alta 🔴',              en: 'High reported symptom load 🔴' },
    'risk_alto_title':   { es: 'Carga alta de síntomas en varios ejes', en: 'High symptom load across several axes' },
    'risk_alto_summary': { es: 'Lo que reportas muestra acumulación simultánea de tensión sostenida, sobrecarga digestiva y fatiga de recuperación. Un patrón así, mantenido en el tiempo, suele preceder a alteraciones que conviene atender temprano.', en: 'What you report shows simultaneous accumulation of sustained tension, digestive overload, and recovery fatigue. Such a pattern, maintained over time, often precedes alterations that should be addressed early.' },

    // ── PHYSIOLOGICAL INSIGHTS ──
    'insight_high': { es: 'Tu principal foco de atención es el eje de **{dominant1}** ({score1}/100), secundado por **{dominant2}** ({score2}/100). Esto es el patrón que tú reportas, no una medición: el paso siguiente es objetivarlo. La evaluación en clínica mide directamente tu composición corporal —agua intracelular y extracelular, ángulo de fase— que suele modificarse antes de que los análisis sanguíneos convencionales se alteren.', en: 'Your main focus is the **{dominant1}** axis ({score1}/100), followed by **{dominant2}** ({score2}/100). This is the pattern you report, not a measurement: the next step is to objectify it. The in-clinic evaluation directly measures your body composition —intracellular and extracellular water, phase angle— which often changes before conventional blood tests become altered.' },
    'insight_low':  { es: 'Lo que reportas se ubica en rangos de estabilidad. Una evaluación periódica en clínica permite detectar cambios en tu composición corporal antes de que se traduzcan en síntomas.', en: 'What you report falls within stability ranges. Periodic in-clinic evaluation can detect changes in your body composition before they translate into symptoms.' },

    // ── CHAT: FRAMING ──
    'chat_framing': { es: 'Te voy a hacer unas preguntas sobre cómo te has sentido últimamente. Responde según lo que notes: no hay respuestas correctas, y si algo no lo sabes, dilo — es una respuesta válida y me sirve igual.', en: 'I\'m going to ask you a few questions about how you\'ve been feeling lately. Answer based on what you notice: there are no right answers, and if you don\'t know something, say so — that\'s a valid answer and is just as useful.' },
    'chat_disclaimer': { es: 'Esta conversación recoge lo que tú reportas; no es un diagnóstico ni una medición.', en: 'This conversation collects what you report; it is not a diagnosis or a measurement.' },
    'chat_freq_question': { es: '¿Con qué frecuencia te pasa?', en: 'How often does this happen?' },

    // ── CHAT: REFLECTION ──
    'chat_reflection_preamble': { es: 'De lo que me contaste, lo que destaca es', en: 'From what you\'ve told me, what stands out is' },
    'chat_reflection_dominant': { es: 'Por lo que me cuentas, {area} es donde más carga aparece. ¿Lo ves así, o hay algo que no encaje?', en: 'From what you tell me, {area} is where the most load shows up. Do you see it that way, or does something not fit?' },
    'chat_reflection_uncertain':{ es: 'En {area} {phrase}. Todavía no puedo decir si es lo que más te pesa. ¿Te encaja como algo que notas?', en: 'In {area} {phrase}. I can\'t yet say if it\'s what weighs on you the most. Does it feel like something you notice?' },
    'chat_reflection_ambiguous':{ es: 'Veo señales parecidas en {area1} y en {area2}, sin que ninguna destaque sobre la otra. ¿Cuál dirías que te pesa más en el día a día?', en: 'I see similar signals in {area1} and {area2}, with neither standing out over the other. Which would you say weighs on you more day to day?' },
    'chat_reflection_yes':  { es: 'Sí, es así',             en: 'Yes, that\'s right' },
    'chat_reflection_no':   { es: 'No, no lo veo así',       en: 'No, I don\'t see it that way' },

    // ── CHAT: RESULT ──
    'chat_result_headline_none':    { es: 'De lo que me contaste, no señalaste molestias en ninguna de las áreas que revisamos.', en: 'From what you told me, you didn\'t point out any discomfort in the areas we reviewed.' },
    'chat_result_headline_single':  { es: 'De lo que me contaste, lo que más pesa es {area}: {phrase}.', en: 'From what you told me, what stands out the most is {area}: {phrase}.' },
    'chat_result_headline_multi':   { es: 'De lo que me contaste, hay señales repartidas entre {areas}, con una diferencia entre ellas menor que el margen de error de este cuestionario.', en: 'From what you told me, there are signals spread across {areas}, with a difference between them smaller than this questionnaire\'s margin of error.' },
    'chat_result_top_area':         { es: 'El área con más señales es {area}: {phrase}.', en: 'The area with the most signals is {area}: {phrase}.' },
    'chat_result_multi_area':       { es: 'Las áreas con más señales son {areas}, con una diferencia entre ellas menor que el margen de error de este cuestionario.', en: 'The areas with the most signals are {areas}, with a difference between them smaller than this questionnaire\'s margin of error.' },
    'chat_result_none':             { es: 'No señalaste molestias en ninguna de las áreas exploradas.', en: 'You didn\'t point out any discomfort in the areas explored.' },
    'chat_result_needs_clinic':     { es: 'Medir qué ocurre físicamente en tu cuerpo requiere el estudio en clínica; esta conversación solo recoge lo que tú reportas.', en: 'Measuring what\'s physically happening in your body requires the in-clinic study; this conversation only collects what you report.' },
    'chat_result_title':            { es: 'Desglose por área', en: 'Breakdown by area' },
    'chat_result_responded':        { es: 'Respondiste {asked} preguntas de las {catalog} posibles. Las preguntas se eligieron según tus respuestas anteriores, por eso fueron menos.', en: 'You answered {asked} questions out of {catalog} possible. Questions were chosen based on your previous answers, which is why there were fewer.' },
    'chat_result_focus_changed':    { es: 'Antes te mencioné {old} como el área principal. Con lo que me contaste después, {new} aparece por encima.', en: 'Earlier I mentioned {old} as the main area. With what you told me later, {new} appears above it.' },

    // ── CHAT: CAP NOTICE ──
    'chat_capped_notice': { es: '⚠️ En {axes} se alcanzó el máximo de preguntas. Responder todas las opciones no produce una lectura más precisa.', en: '⚠️ In {axes} the maximum number of questions was reached. Answering every option does not produce a more accurate reading.' },

    // ── EVIDENCE PHRASES ──
    'ev_no_questions':        { es: 'todavía no te he preguntado por esta área', en: 'I haven\'t asked about this area yet' },
    'ev_no_signals':          { es: 'de {n} {word} en esta área, no señalaste ninguna', en: 'of {n} {word} in this area, you didn\'t point out any' },
    'ev_signals':             { es: '{verb} {n} {word}', en: '{verb} {n} {word}' },
    'ev_señalaste':           { es: 'señalaste', en: 'you pointed out' },
    'ev_aparecen':            { es: 'aparecen', en: 'appear' },
    'ev_frequent':            { es: '{n} de forma habitual', en: '{n} habitually' },
    'ev_none_frequent':       { es: 'ninguna de forma habitual', en: 'none habitually' },
    'ev_unknown':             { es: '{n} sin poder responder', en: '{n} unable to answer' },
    'ev_inferred_tag':        { es: '(parte de este recuento viene de lo que escribiste, no de opciones que elegiste)', en: '(part of this count comes from what you wrote, not from options you chose)' },
    'ev_word_pregunta':       { es: 'pregunta', en: 'question' },
    'ev_word_preguntas':      { es: 'preguntas', en: 'questions' },
    'ev_word_señal':          { es: 'señal', en: 'signal' },
    'ev_word_señales':        { es: 'señales', en: 'signals' },
    'ev_band_unexplored':     { es: 'sin explorar', en: 'unexplored' },
    'ev_band_no_signals':     { es: 'sin señales', en: 'no signals' },
    'ev_band_frequent':       { es: 'señales frecuentes', en: 'frequent signals' },
    'ev_band_several':        { es: 'varias señales', en: 'several signals' },
    'ev_band_some':           { es: 'algunas señales', en: 'some signals' },

    // ── UI ──
    'ui_page_title':          { es: 'Autoevaluación Conversacional de Síntomas | Vitametric CDMX', en: 'Conversational Symptom Self-Assessment | Vitametric CDMX' },
    'ui_meta_desc':           { es: 'Una conversación breve para identificar en qué área se concentra tu carga de síntomas: estrés, sueño, energía, digestión y carga laboral. Las preguntas se adaptan a tus respuestas.', en: 'A short conversation to identify where your symptom load is concentrated: stress, sleep, energy, digestion, and workload. Questions adapt to your answers.' },
    'ui_og_title':            { es: 'Autoevaluación Conversacional de Síntomas | Vitametric', en: 'Conversational Symptom Self-Assessment | Vitametric' },
    'ui_og_desc':             { es: 'Responde unas pocas preguntas que se adaptan a lo que vas contestando. Identifica dónde se concentra tu carga de síntomas en 2 minutos.', en: 'Answer a few questions that adapt to what you\'re saying. Identify where your symptom load is concentrated in 2 minutes.' },
    'ui_heading':             { es: 'Cuéntame cómo te has sentido', en: 'Tell me how you\'ve been feeling' },
    'ui_subheading':          { es: 'Unas pocas preguntas que se adaptan a lo que vas respondiendo: si algo queda claro, no vuelvo a preguntarlo. Si no sabes una respuesta, dilo — es información válida.', en: 'A few questions that adapt to what you answer: if something becomes clear, I won\'t ask again. If you don\'t know an answer, say so — it\'s valid information.' },
    'ui_form_version':        { es: '← Versión con formulario', en: '← Form version' },
    'ui_skip_link':           { es: 'Saltar al contenido', en: 'Skip to content' },
    'ui_disclaimer':          { es: 'Esta conversación recoge síntomas que tú reportas. No es un diagnóstico ni una medición: medir lo que ocurre físicamente en tu cuerpo requiere la evaluación en clínica.', en: 'This conversation collects symptoms you report. It is not a diagnosis or a measurement: measuring what\'s physically happening in your body requires the in-clinic evaluation.' },
    'ui_cta_whatsapp':        { es: 'Agendar mi evaluación en clínica', en: 'Schedule my in-clinic evaluation' },
    'ui_consent_title':       { es: 'Antes de empezar', en: 'Before we start' },
    'ui_consent_body':        { es: 'Esta conversación es privada. Tus respuestas se procesan en tu dispositivo y no se almacenan. No es un diagnóstico médico: es una autoevaluación de síntomas que tú reportas.', en: 'This conversation is private. Your answers are processed on your device and are not stored. This is not a medical diagnosis: it is a self-assessment of symptoms you report.' },
    'ui_consent_accept':      { es: 'Entendido, empecemos', en: 'Got it, let\'s start' },
    'ui_consent_decline':     { es: 'No, prefiero no continuar', en: 'No, I\'d rather not continue' },
    'ui_lang_switcher':       { es: 'EN', en: 'ES' },

    // ── CERTAINTY ──
    'cert_preliminary':       { es: 'información preliminar', en: 'preliminary information' },
    'cert_probable':          { es: 'estimación probable', en: 'probable estimate' },
    'cert_established':       { es: 'estimación consolidada', en: 'established estimate' },

    // ── CLAIMS ──
    'claim_is_limit':         { es: 'lo que no significa', en: 'what it does not mean' },
    'claim_self_report':      { es: 'lo que reportaste', en: 'what you reported' },
    'claim_estimate':         { es: 'estimación', en: 'estimate' },
    'claim_needs_clinic':     { es: 'requiere medición en clínica', en: 'requires in-clinic measurement' },

    // ── SLM ──
    'slm_loading':            { es: 'Asistente local: preparando el modelo…', en: 'Local assistant: preparing the model…' },
    'slm_shadow':             { es: 'Asistente local: evaluación en segundo plano; respuesta verificada.', en: 'Local assistant: background evaluation; verified response.' },
    'slm_active':             { es: 'Asistente local: activo con salida verificada.', en: 'Local assistant: active with verified output.' },
    'slm_error':              { es: 'Asistente local no disponible; continuamos con respuestas verificadas.', en: 'Local assistant unavailable; continuing with verified responses.' },

    // ── LISTENER ──
    'listener_placeholder':   { es: 'Cuéntanos en tus palabras si deseas agregar algo…', en: 'Tell us in your own words if you\'d like to add anything…' },
    'listener_send':          { es: 'Enviar mensaje', en: 'Send message' },
    'listener_consent_label': { es: 'Permitir análisis en servidor para mejor comprensión (opcional)', en: 'Allow server-side analysis for better understanding (optional)' },
    'listener_hint':          { es: 'Puedes responderme aquí abajo si quieres', en: 'You can reply down here if you\'d like' },

    // ── CONSENT ──
    'consent_title':          { es: '¿Activamos el asistente local?', en: 'Activate the local assistant?' },
    'consent_body':           { es: 'Este cuestionario puede usar un modelo de lenguaje pequeño que se descarga una sola vez a tu dispositivo (unos 600 MB; luego queda en caché) y se ejecuta en tu navegador con WebGPU. Tus respuestas se procesan localmente: no se envían a ningún servidor. Si tu equipo no soporta WebGPU, el cuestionario sigue funcionando con respuestas verificadas por plantillas. También podrás escribir en tus palabras: ese texto se analiza en tu dispositivo. Puedes continuar sin activarlo: el resultado es el mismo, solo con redacción fija.', en: 'This questionnaire can use a small language model that downloads once to your device (about 600 MB; then stays cached) and runs in your browser with WebGPU. Your answers are processed locally: they are not sent to any server. If your device does not support WebGPU, the questionnaire still works with template-verified responses. You can also write in your own words: that text is analyzed on your device. You can continue without activating it: the result is the same, just with fixed wording.' },
    'consent_activate':       { es: 'Activar asistente local', en: 'Activate local assistant' },
    'consent_decline':        { es: 'Continuar sin él', en: 'Continue without it' },

    // ── EMAIL GATE ──
    'email_title':            { es: '¿Quieres guardar tu avance?', en: 'Want to save your progress?' },
    'email_body':             { es: 'Deja tu correo y te enviaremos tus resultados cuando termines. No compartimos tu información.', en: 'Leave your email and we\'ll send you your results when you\'re done. We don\'t share your information.' },
    'email_placeholder':      { es: 'tu@correo.com', en: 'you@email.com' },
    'email_save':             { es: 'Guardar y continuar', en: 'Save & continue' },
    'email_skip':             { es: 'No gracias, continuar sin guardar', en: 'No thanks, continue without saving' },
    'email_saved':            { es: '✓ Guardado. Te enviaremos tus resultados al terminar.', en: '✓ Saved. We\'ll send your results when you\'re done.' },

    // ── A/B TESTING ──
    'ab_variant_label':       { es: 'Variante', en: 'Variant' },

    // ── WHATSAPP ──
    'wa_header':              { es: '*AUTOEVALUACIÓN DE SÍNTOMAS — VITAMETRIC*', en: '*SYMPTOM SELF-ASSESSMENT — VITAMETRIC*' },
    'wa_name':                { es: '👤 *Nombre:* {name}', en: '👤 *Name:* {name}' },
    'wa_score':               { es: '📊 *Carga de síntomas reportados:* {score}/100 ({badge})', en: '📊 *Reported symptom load:* {score}/100 ({badge})' },
    'wa_breakdown_header':    { es: '*Desglose por área (según lo que reporté):*', en: '*Breakdown by area (as I reported):*' },
    'wa_range':               { es: '❓ *Rango por preguntas sin respuesta:* {lower} a {upper}/100', en: '❓ *Range due to unanswered questions:* {lower} to {upper}/100' },
    'wa_motive':              { es: '🎯 *Motivo:* Quiero agendar la *Evaluación Multisistémica ES-Complex ($5,990 MXN)* para que se me midan en clínica los parámetros de composición corporal y balance de fluidos.', en: '🎯 *Reason:* I want to schedule the *ES-Complex Multisystem Evaluation ($5,990 MXN)* to have my body composition and fluid balance parameters measured in clinic.' },
    'wa_disclaimer':          { es: '_Esto es una autoevaluación de síntomas percibidos: no es un diagnóstico ni una medición._', en: '_This is a self-assessment of perceived symptoms: it is not a diagnosis or a measurement._' },
    'wa_axis_line':           { es: '• {icon} *{name}:* {score}/100', en: '• {icon} *{name}:* {score}/100' },
    'wa_dominant':            { es: '⚠️ *Área con mayor carga:* {name} ({score}/100)', en: '⚠️ *Area with highest load:* {name} ({score}/100)' }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // API pública
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Detecta el idioma activo.
   * Orden: query param ?lang > localStorage > navigator.language > 'es'
   */
  function detectLang() {
    try {
      var params = new URLSearchParams(window.location.search);
      var q = params.get('lang');
      if (q && SUPPORTED.indexOf(q) !== -1) {
        localStorage.setItem('vitametric-lang', q);
        return q;
      }
      var stored = localStorage.getItem('vitametric-lang');
      if (stored && SUPPORTED.indexOf(stored) !== -1) return stored;
      var nav = (navigator.language || '').split('-')[0];
      if (nav && SUPPORTED.indexOf(nav) !== -1) return nav;
    } catch (e) { /* localStorage no disponible */ }
    return FALLBACK;
  }

  /**
   * Traduce una clave. Soporta placeholders {key}.
   * @param {string} key - clave del diccionario
   * @param {string} [lang] - 'es'|'en'. Si no se pasa, usa detectLang().
   * @param {object} [params] - valores para interpolar
   * @returns {string}
   */
  function t(key, lang, params) {
    var l = lang || detectLang();
    var entry = STRINGS[key];
    if (!entry) return key;
    var text = entry[l] || entry[FALLBACK] || key;
    if (params) {
      Object.keys(params).forEach(function (k) {
        text = text.replace(new RegExp('\\{' + k + '\\}', 'g'), params[k]);
      });
    }
    return text;
  }

  /**
   * Localiza las estructuras del motor: AXES, BASE_DIMENSIONS, CONDITIONAL_DIMENSIONS.
   * Crea copias nuevas sin mutar los originales.
   */
  function localizeEngine(engine, lang) {
    var l = lang || 'es';
    if (l === 'es') return null; // señal: usar originales

    // Copia profunda con strings traducidos
    var AXES = {};
    Object.keys(engine.AXES).forEach(function (k) {
      var orig = engine.AXES[k];
      AXES[k] = {
        id: orig.id,
        name: t('axe_' + k + '_name', l),
        shortName: t('axe_' + k + '_short', l),
        patientLabel: t('axe_' + k + '_patient', l),
        icon: orig.icon,
        color: orig.color,
        description: t('axe_' + k + '_desc', l)
      };
    });

    function localizeDim(dim) {
      var keyMap = {
        dim_autonomo: 'dim_autonomo',
        dim_sueno: 'dim_sueno',
        dim_cardiometabolico: 'dim_cardiometabolico',
        dim_terreno: 'dim_terreno',
        dim_ocupacional: 'dim_ocupacional',
        dim_cond_apnea_sueno: 'cond_apnea',
        dim_cond_inflamacion_metabolica: 'cond_inflamacion'
      };
      var prefix = keyMap[dim.id] || dim.id;
      var loc = {
        id: dim.id,
        axis: dim.axis,
        category: t(prefix + '_category', l),
        title: t(prefix + '_title', l),
        subtitle: t(prefix + '_subtitle', l),
        items: dim.items.map(function (it) {
          return {
            id: it.id,
            text: t(it.id, l),
            weights: it.weights
          };
        }),
        optimalOption: dim.optimalOption ? {
          id: dim.optimalOption.id,
          text: t(prefix + '_opt', l)
        } : undefined
      };
      if (dim.condition) loc.condition = dim.condition;
      return loc;
    }

    var BASE_DIMENSIONS = engine.BASE_DIMENSIONS.map(localizeDim);
    var CONDITIONAL_DIMENSIONS = {};
    Object.keys(engine.CONDITIONAL_DIMENSIONS).forEach(function (k) {
      CONDITIONAL_DIMENSIONS[k] = localizeDim(engine.CONDITIONAL_DIMENSIONS[k]);
    });

    return { AXES: AXES, BASE_DIMENSIONS: BASE_DIMENSIONS, CONDITIONAL_DIMENSIONS: CONDITIONAL_DIMENSIONS };
  }

  return {
    SUPPORTED: SUPPORTED,
    FALLBACK: FALLBACK,
    STRINGS: STRINGS,
    detectLang: detectLang,
    t: t,
    localizeEngine: localizeEngine
  };
}));