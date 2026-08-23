// G-Level: L1
// Sustrato: Contrato Ejecutable
// Función: Runtime opcional del articulador SLM — preparación asíncrona, feature flag,
//          fallback determinista y telemetría local sin datos del paciente.
// v-version: 20260822.02 (listenDeep con extracción semántica y mapeo a ítems)

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VitametricSLM = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STORAGE_KEY = 'vitametric_slm_config_v1';
  const MODES = Object.freeze({ OFF: 'off', AUTO: 'auto', ON: 'on' });
  const STATUS = Object.freeze({
    DISABLED: 'disabled',
    UNAVAILABLE: 'unavailable',
    LOADING: 'loading',
    READY: 'ready',
    ERROR: 'error'
  });

  const EXPOSURE = Object.freeze({ SHADOW: 'shadow', LIVE: 'live' });
  const INFERENCE_TIMEOUT_MS = 8000;

  const DEFAULT_CONFIG = Object.freeze({
    mode: MODES.OFF,
    modelId: null,
    exposure: EXPOSURE.SHADOW,
    telemetry: false,
    // Listener on-device opcional para texto libre del paciente.
    // On-device (1B) es el default privado; el servo SOLO se usa si
    // serverConsent === true (opt-in explícito del paciente).
    listener: Object.freeze({
      enabled: false,
      serverEndpoint: null,
      serverConsent: false
    })
  });

  const LISTENER_INTENTS = Object.freeze([
    'duda', 'agendar', 'sintoma_nuevo', 'agudo', 'otro'
  ]);

  // Copia de defensa en profundidad del vocabulario prohibido del articulador:
  // la salida del listener (aun no fáctica) jamás debe introducir estos términos.
  const LISTENER_FORBIDDEN = Object.freeze([
    'iph', 'acidez tisular', 'fluido intersticial', 'líquido intersticial',
    'glicación', 'biofísica intersticial', 'balance bioeléctrico',
    'microinflamación', 'resistencia periférica', 'hipoxemia', 'oxigenación',
    'simpático', 'parasimpático', 'vagal', 'glucémica', 'glucémico',
    'stop-bang', 'psqi', 'epworth', 'diagnóstico de', 'padeces', 'tienes apnea',
    'diagnóstico', 'tratamiento', 'receta', 'medicamento'
  ]);

  const LISTENER_AXES = Object.freeze([
    'Estrés Autónomo', 'Calidad de Sueño', 'Cardiometabólico',
    'Terreno Digestivo', 'Sobrecarga Laboral'
  ]);

  /**
   * Mapa de extracción determinista: frases en español → itemId del catálogo.
   *
   * No usa un modelo de lenguaje para extraer: es matching de palabras clave
   * con stemming básico (primeras 5 letras de la raíz). Esto lo hace verificable,
   * predecible y sin dependencia de WebGPU. Si se dispone de un modelo, el
   * resultado determinista se puede enriquecer con el modelo en listenDeep().
   *
   * Estructura: { phrase: { itemId, defaultGrade, axis } }
   * - defaultGrade: grado inferido por defecto (1-3) según la intensidad del lenguaje
   * - axis: para filtrar y conectar con el motor adaptativo
   */
  const EXTRACTION_KEYWORDS = Object.freeze([
    // ── Eje Autónomo ──
    { phrases: ['contractura', 'contracturas', 'tensión cervical', 'tensión en el cuello', 'dolor de cuello', 'cuello rígido', 'cuello tenso'], itemId: 'item_aut_tension_cervical', defaultGrade: 3 },
    { phrases: ['bruxismo', 'rechino los dientes', 'aprieto los dientes', 'aprieto la mandíbula', 'mandíbula tensa', 'rechinar de dientes'], itemId: 'item_aut_bruxismo', defaultGrade: 3 },
    { phrases: ['taquicardia', 'palpitaciones', 'latidos fuertes', 'corazón acelerado', 'corazón rápido', 'se me acelera el corazón', 'siento el corazón', 'palpitación'], itemId: 'item_aut_taquicardia', defaultGrade: 2 },
    { phrases: ['mente acelerada', 'no puedo desconectar', 'no puedo apagar la mente', 'cabeza acelerada', 'pensamientos a mil', 'rumiando', 'dar vueltas a lo mismo', 'no me puedo concentrar por los pensamientos'], itemId: 'item_aut_mente_acelerada', defaultGrade: 3 },
    { phrases: ['manos frías', 'pies fríos', 'manos heladas', 'extremidades frías'], itemId: 'item_aut_manos_frias', defaultGrade: 2 },
    // ── Eje Sueño ──
    { phrases: ['cuesta levantarme', 'me cuesta salir de la cama', 'inercia', 'cuesta arrancar', 'levantarme pesado', 'me levanto cansado', 'me levanto agotado', 'difícil despertar'], itemId: 'item_sue_inercia_matutina', defaultGrade: 3 },
    { phrases: ['me despierto en la noche', 'me despierto de madrugada', 'despierto a las 3', 'despierto a las 4', 'despierto varias veces', 'microdespertares', 'me despierto a cada rato', 'sueño interrumpido', 'despierto en la madrugada'], itemId: 'item_sue_microdespertares', defaultGrade: 3 },
    { phrases: ['tardo en dormirme', 'me cuesta dormirme', 'doy vueltas en la cama', 'no puedo conciliar el sueño', 'insomnio de conciliación', 'me cuesta agarrar el sueño'], itemId: 'item_sue_latencia_alta', defaultGrade: 3 },
    { phrases: ['cuerpo pesado', 'me siento pesado', 'cuerpo como plomo', 'pesadez corporal', 'me duele todo al despertar'], itemId: 'item_sue_pesadez_corporal', defaultGrade: 2 },
    // ── Eje Cardiometabólico ──
    { phrases: ['somnolencia después de comer', 'me da sueño después de comer', 'sueño postprandial', 'me duermo después de comer', 'bajón después de comer', 'me cae pesada la comida'], itemId: 'item_card_somnolencia_post', defaultGrade: 2 },
    { phrases: ['niebla mental', 'no puedo concentrarme', 'bruma mental', 'me cuesta pensar', 'mente nublada', 'no razono bien', 'me siento torpe mentalmente', 'lento mentalmente'], itemId: 'item_card_niebla_mental', defaultGrade: 2 },
    { phrases: ['antojo de dulce', 'antojo de azúcar', 'necesito algo dulce', 'antojo de carbohidratos', 'se me antoja el pan', 'antojo de harinas'], itemId: 'item_card_antojos_dulces', defaultGrade: 2 },
    // ── Eje Terreno Digestivo ──
    { phrases: ['distensión', 'hinchazón', 'inflamación abdominal', 'panza inflamada', 'abdomen distendido', 'me siento inflamado', 'me hincho'], itemId: 'item_ter_distension', defaultGrade: 2 },
    { phrases: ['acidez', 'reflujo', 'agruras', 'ardor', 'quemazón en el pecho', 'me quema el estómago', 'reflujo ácido'], itemId: 'item_ter_acidez_reflujo', defaultGrade: 2 },
    { phrases: ['tránsito irregular', 'estreñimiento', 'colon irregular', 'voy al baño de más', 'diarrea frecuente', 'intestino irregular', 'no voy al baño regular'], itemId: 'item_ter_transito_irregular', defaultGrade: 2 },
    { phrases: ['piernas pesadas', 'retención de líquidos', 'piernas hinchadas', 'tobillos hinchados', 'me pesan las piernas'], itemId: 'item_ter_pesadez_piernas', defaultGrade: 2 },
    { phrases: ['párpados hinchados', 'ojos hinchados al despertar', 'bolsas en los ojos', 'retención en párpados', 'párpados inflamados'], itemId: 'item_ter_retencion_parpados', defaultGrade: 2 },
    // ── Eje Ocupacional ──
    { phrases: ['sentado todo el día', 'sedentario', 'paso horas sentado', 'no me muevo en el trabajo', 'oficina todo el día', 'trabajo sentado'], itemId: 'item_ocu_sedentarismo_6h', defaultGrade: 3 },
    { phrases: ['pantallas todo el día', 'frente a la computadora', 'muchas horas de pantalla', 'trabajo con pantallas', 'pantalla continua'], itemId: 'item_ocu_pantallas_continuas', defaultGrade: 3 },
    { phrases: ['dolor lumbar', 'dolor de espalda', 'me duele la espalda baja', 'lumbalgia', 'dolor en la lumbar', 'espalda contracturada'], itemId: 'item_ocu_molestia_lumbar', defaultGrade: 2 },
    { phrases: ['sin pausas', 'no tengo descansos', 'trabajo sin parar', 'no me tomo breaks', 'sin interrupciones en el trabajo', 'jornada continua'], itemId: 'item_ocu_pausas_escasas', defaultGrade: 3 }
  ]);

  /**
   * Conectores causales en español. Se usan para detectar relaciones causales
   * implícitas en el texto del paciente ("me duele el cuello CUANDO duermo mal").
   */
  // La fuerza del nexo no es uniforme: "me provoca" es una afirmación causal
  // del paciente; "tras" solo describe una sucesión. Tratarlas igual es post hoc
  // ergo propter hoc — precisamente la distinción (Causalidad vs. mera sucesión)
  // que la capa simbólica dice gobernar. La confianza la refleja.
  const CONNECTOR_CONFIDENCE = Object.freeze({
    EXPLICIT: 0.8,   // el paciente afirma la causa
    TEMPORAL: 0.4    // el paciente describe una secuencia
  });

  /** Nexos donde el paciente afirma una causa, no solo un orden. */
  const CAUSAL_CONNECTORS_EXPLICIT = Object.freeze([
    'porque', 'ya que', 'debido a', 'a causa de', 'por culpa de',
    'me provoca', 'me genera', 'me causa', 'me produce', 'me dispara'
  ]);

  /** Nexos de sucesión o condición: sugieren, no establecen, una causa. */
  const CAUSAL_CONNECTORS_TEMPORAL = Object.freeze([
    'cuando', 'si', 'cada vez que', 'desde que', 'tras', 'después de', 'luego de'
  ]);

  const CAUSAL_CONNECTORS = Object.freeze([
    ...CAUSAL_CONNECTORS_EXPLICIT,
    ...CAUSAL_CONNECTORS_TEMPORAL
  ]);

  /** Confianza del nexo según su fuerza. Desconocido → temporal (conservador). */
  function connectorConfidence(connector) {
    return CAUSAL_CONNECTORS_EXPLICIT.indexOf(connector) >= 0
      ? CONNECTOR_CONFIDENCE.EXPLICIT
      : CONNECTOR_CONFIDENCE.TEMPORAL;
  }

  /**
   * Normaliza una palabra a su raíz para matching tolerante.
   * Elimina acentos, plurales y sufijos comunes.
   */
  function stemWord(word) {
    return word
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/(es|as|os|s)$/, '')
      .replace(/(mente|cion|dad|ura)$/, '');
  }

  function safeStorage() {
    try {
      if (typeof localStorage === 'undefined') return null;
      return localStorage;
    } catch (err) {
      return null;
    }
  }

  function readConfig(storage = safeStorage()) {
    if (!storage) return { ...DEFAULT_CONFIG };
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_CONFIG };
      const parsed = JSON.parse(raw);
      const mode = Object.values(MODES).includes(parsed.mode) ? parsed.mode : DEFAULT_CONFIG.mode;
      const exposure = Object.values(EXPOSURE).includes(parsed.exposure)
        ? parsed.exposure
        : DEFAULT_CONFIG.exposure;
      const listenerRaw = parsed.listener && typeof parsed.listener === 'object' ? parsed.listener : {};
      const listener = {
        enabled: listenerRaw.enabled === true,
        // El servo nunca se activa sin consentimiento explícito y punto de acceso.
        serverEndpoint: typeof listenerRaw.serverEndpoint === 'string' && listenerRaw.serverEndpoint.length > 0
          ? listenerRaw.serverEndpoint
          : null,
        serverConsent: listenerRaw.serverConsent === true
      };
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        mode,
        exposure,
        telemetry: parsed.telemetry === true,
        listener
      };
    } catch (err) {
      return { ...DEFAULT_CONFIG };
    }
  }

  function writeConfig(config, storage = safeStorage()) {
    const next = {
      ...DEFAULT_CONFIG,
      ...config,
      mode: Object.values(MODES).includes(config.mode) ? config.mode : DEFAULT_CONFIG.mode,
      exposure: Object.values(EXPOSURE).includes(config.exposure) ? config.exposure : DEFAULT_CONFIG.exposure,
      telemetry: config.telemetry === true,
      listener: {
        enabled: !!(config.listener && config.listener.enabled),
        serverEndpoint: (config.listener && typeof config.listener.serverEndpoint === 'string')
          ? config.listener.serverEndpoint
          : null,
        serverConsent: !!(config.listener && config.listener.serverConsent)
      }
    };
    if (storage) {
      try { storage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (err) {}
    }
    return next;
  }

  function capabilities(env = (typeof navigator !== 'undefined' ? navigator : {})) {
    return {
      webgpu: !!env.gpu,
      secureContext: typeof window === 'undefined' || window.isSecureContext !== false
    };
  }

  /**
   * Sondea las capacidades del dispositivo en un solo paso (no bloquea el primer turno).
   * Devuelve un objeto con las claves webgpu, secureContext y memory (en GB, redondeado).
   * Se usa principalmente para decisiones de modo: si la memoria disponible es < 1 GB,
   * el modo `auto` cae graceful a plantillas verificadas.
   */
  function probeCapabilities(env = (typeof navigator !== 'undefined' ? navigator : {})) {
    const webgpu = !!env.gpu;
    const secureContext = typeof window === 'undefined' || window.isSecureContext !== false;
    // Memoria aproximada: WebGPU on device suele implicar al menos 1 GB disponible.
    const memoryGB = webgpu && secureContext ? (navigator.deviceMemory || 2) : 0;
    return { webgpu, secureContext, memory: Math.round(memoryGB) };
  }

  /**
   * Verifica si el modo `auto` debe desactivarse por falta de memoria.
   * Solo aplica cuando el modo es `auto` y la memoria disponible es < 1 GB.
   */
  function lowMemoryGuard() {
    return VitametricSLM.lowMemoryGuard;
  }

  /**
   * Contador local sin texto del usuario, claims, respuestas ni prompts.
   * Solo se activa mediante `telemetry: true` y nunca hace una petición de red.
   */
  class LocalTelemetry {
    constructor({ enabled = false, storage = safeStorage() } = {}) {
      this.enabled = enabled;
      this.storage = storage;
      this.events = {};
    }

    record(event) {
      if (!this.enabled || !event) return;
      this.events[event] = (this.events[event] || 0) + 1;
      if (!this.storage) return;
      try {
        this.storage.setItem('vitametric_slm_telemetry_v1', JSON.stringify(this.events));
      } catch (err) {}
    }

    snapshot() {
      return { ...this.events };
    }
  }

  /**
   * Orquesta un Articulator y un loader opcional.
   *
   * El loader es una función asíncrona inyectable que devuelve el contrato mínimo:
   * `{ articulate({ turn, claims, locked }) => string | Promise<string> }`.
   * Así Fase 1 no queda atada a WebLLM, Transformers.js ni a un modelo concreto.
   */
  class Runtime {
    constructor({
      articulator,
      loader = null,
      config = readConfig(),
      telemetry = null,
      capabilities: detected = capabilities(),
      inferenceTimeoutMs = INFERENCE_TIMEOUT_MS
    } = {}) {
      if (!articulator || typeof articulator.articulateAsync !== 'function') {
        throw new Error('VitametricSLM.Runtime requiere un Articulator compatible');
      }
      this.articulator = articulator;
      this.loader = loader;
      this.config = {
        ...DEFAULT_CONFIG,
        ...config,
        exposure: Object.values(EXPOSURE).includes(config.exposure) ? config.exposure : DEFAULT_CONFIG.exposure,
        listener: {
          ...DEFAULT_CONFIG.listener,
          ...(config.listener || {})
        }
      };
      this.capabilities = detected;
      this.inferenceTimeoutMs = Number.isFinite(inferenceTimeoutMs) && inferenceTimeoutMs > 0
        ? inferenceTimeoutMs
        : INFERENCE_TIMEOUT_MS;
      this.status = STATUS.DISABLED;
      this.error = null;
      this.model = null;
      this.onDeviceListenerReady = false;
      this.telemetry = telemetry || new LocalTelemetry({ enabled: this.config.telemetry });
    }

enabled() {
    if (this.config.mode === MODES.OFF) return false;
    if (this.config.mode === MODES.AUTO
      && (!this.capabilities.webgpu || !this.capabilities.secureContext
          || (typeof navigator !== 'undefined' && navigator.deviceMemory < 1))) return false;
    return true;
  }

    async prepare() {
      // El on-device (1B) es el default privado del listener siempre que esté
      // habilitado; el servo es aditivo y solo se usa con consentimiento.
      const wantOnDeviceListener = this.config.listener.enabled;
      if (!this.enabled() && !wantOnDeviceListener) {
        this.status = this.config.mode === MODES.OFF ? STATUS.DISABLED : STATUS.UNAVAILABLE;
        this.telemetry.record(this.status);
        return this.snapshot();
      }
      if (typeof this.loader !== 'function') {
        if (wantOnDeviceListener) {
          // No hay loader: el listener on-device no puede funcionar; queda como
          // no-op salvo que el paciente haya consentido un servo.
          this.onDeviceListenerReady = false;
          this.telemetry.record('listener_unavailable_no_loader');
        } else {
          this.status = STATUS.UNAVAILABLE;
          this.telemetry.record('unavailable_no_loader');
        }
        return this.snapshot();
      }

      this.status = STATUS.LOADING;
      this.error = null;
      this.telemetry.record('load_started');
      try {
        const model = await this.loader({
          modelId: this.config.modelId || this.config.listener.onDeviceModel,
          onProgress: (progress) => {
            if (typeof progress === 'number') this.progress = Math.max(0, Math.min(1, progress));
          }
        });
        if (!model || typeof model.articulate !== 'function') {
          throw new Error('El loader no devolvió un adaptador SLM válido');
        }
        this.model = model;
        this.articulator.setModel(model);
        this.onDeviceListenerReady = typeof model.listen === 'function';
        this.status = STATUS.READY;
        this.telemetry.record('load_ready');
      } catch (err) {
        this.status = STATUS.ERROR;
        this.error = err instanceof Error ? err.message : String(err);
        this.model = null;
        this.onDeviceListenerReady = false;
        this.articulator.useTemplates();
        this.telemetry.record('load_error');
      }
      return this.snapshot();
    }

    /**
     * El listener usa el modelo solo para tareas NO fácticas (ack + intención).
     * La prosa factual del triaje sigue siendo plantilla salvo que mode != OFF.
     */
    async articulate(turn) {
      if (this.status !== STATUS.READY || !this.enabled()) {
        const fallback = this.articulator.articulateWithTemplates(turn);
        this.telemetry.record('template_turn');
        return { ...fallback, runtimeStatus: this.status };
      }

      let timer;
      const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve({
          ok: false,
          blocked: true,
          usedModel: true,
          timeout: true,
          violations: [`tiempo de inferencia excedido (${this.inferenceTimeoutMs}ms)`],
          fallback: this.articulator.articulateWithTemplates(turn).text
        }), this.inferenceTimeoutMs);
      });
      let result;
      try {
        result = await Promise.race([this.articulator.articulateAsync(turn), timeout]);
      } finally {
        clearTimeout(timer);
      }
      if (result.timeout) this.telemetry.record('model_timeout');
      if (!result.ok) {
        // El texto del modelo no se devuelve como `text` cuando falla el gate.
        // La UI muestra únicamente este fallback seguro, incluso en live.
        this.telemetry.record(result.fallback ? 'model_fallback' : 'model_blocked');
        const fallback = this.articulator.articulateWithTemplates(turn);
        return { ...result, text: fallback.text, runtimeStatus: this.status, usedModel: false };
      }

      this.telemetry.record(this.config.exposure === EXPOSURE.SHADOW ? 'model_shadow_pass' : 'model_turn');
      if (this.config.exposure === EXPOSURE.SHADOW) {
        // Shadow mode evalúa el candidato real, pero jamás lo expone al paciente.
        const fallback = this.articulator.articulateWithTemplates(turn);
        return { ...fallback, runtimeStatus: this.status, shadowEvaluated: true, usedModel: false };
      }
      return { ...result, runtimeStatus: this.status };
    }

    useTemplates() {
      this.model = null;
      this.articulator.useTemplates();
      this.status = STATUS.DISABLED;
      this.telemetry.record('templates_forced');
      return this.snapshot();
    }

    /**
     * Consentimiento del paciente para usar el servo (modelo en la nube).
     * El servo NUNCA se invoca sin esto. Persiste en la misma config local.
     */
    setListenerConsent(value) {
      const consent = value === true;
      this.config.listener = { ...this.config.listener, serverConsent: consent };
      if (safeStorage()) {
        try { safeStorage().setItem(STORAGE_KEY, JSON.stringify(this.config)); } catch (err) {}
      }
      this.telemetry.record(consent ? 'listener_consent_on' : 'listener_consent_off');
      return this.snapshot();
    }

    /**
     * Deja la salida del listener libre de cualquier rastro fáctico/médico.
     * Devuelve el texto limpiado, o null si no se pudo hacer seguro.
     */
    sanitizeListenerOutput(text) {
      let t = String(text || '').trim();
      if (!t) return null;
      const low = t.toLowerCase();
      if (LISTENER_FORBIDDEN.some((term) => low.includes(term))) return null;
      if (LISTENER_AXES.some((name) => t.includes(name))) return null;
      // Sin literales numéricos: un ack empático no cita cifras.
      if (/\d/.test(t)) return null;
      // Sin afirmaciones de posesión clínica.
      if (/\b(tienes|padeces|tienes apnea|diagnóstico)\b/i.test(t)) return null;
      return t;
    }

    /**
     * Listener de texto libre del paciente.
     *   · on-device (1B): default privado, sin salir del dispositivo.
     *   · server: SOLO si config.listener.serverConsent === true.
     * Devuelve { ack, intent, tier, used }. ack/intent van siempre por sanitize.
     */
    async listen(text) {
      const raw = String(text || '').trim().slice(0, 1000);
      if (!this.config.listener.enabled || raw.length === 0) {
        return { ack: null, intent: null, tier: null, used: false };
      }
      this.telemetry.record('free_text_turn');

      const useServer = this.config.listener.serverEndpoint && this.config.listener.serverConsent === true;
      if (useServer) {
        try {
          const res = await fetch(this.config.listener.serverEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: raw })
          });
          if (!res.ok) throw new Error('servo ' + res.status);
          const data = await res.json();
          const ack = this.sanitizeListenerOutput(data && data.ack);
          // Si el modelo emitió contenido inseguro, no se confía ni del intent:
          // la respuesta es todo-o-nada.
          if (!ack) {
            this.telemetry.record('listener_server_blocked');
            return { ack: null, intent: null, tier: 'server', used: false };
          }
          const intent = LISTENER_INTENTS.includes(data && data.intent) ? data.intent : null;
          this.telemetry.record('lm_tier_server');
          return { ack, intent, tier: 'server', used: true };
        } catch (err) {
          this.telemetry.record('listener_server_error');
          // Fallback a on-device si está disponible; si no, no-op.
        }
      }

      if (this.onDeviceListenerReady && this.model && typeof this.model.listen === 'function') {
        try {
          const data = await this.model.listen({ text: raw });
          const ack = this.sanitizeListenerOutput(data && data.ack);
          if (!ack) {
            this.telemetry.record('listener_ondevice_blocked');
            return { ack: null, intent: null, tier: 'on_device', used: false };
          }
          const intent = LISTENER_INTENTS.includes(data && data.intent) ? data.intent : null;
          this.telemetry.record('lm_tier_ondevice');
          return { ack, intent, tier: 'on_device', used: true };
        } catch (err) {
          this.telemetry.record('listener_ondevice_error');
        }
      }

      return { ack: null, intent: null, tier: null, used: false };
    }

    /**
     * Extrae síntomas del texto libre usando matching determinista de palabras
     * clave con evaluación de polaridad (Cualidad del Juicio: Afirmación vs Negación).
     *
     * @param {string} text - texto libre del paciente (max 1000 chars)
     * @returns {{ itemId: string, grade: number, confidence: number, matchedPhrase: string }[]}
     */
    extractSymptoms(text) {
      const raw = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (!raw) return [];
      const found = [];

      const NEGATION_PATTERNS = [
        /\bno\b/i,
        /\bnunca\b/i,
        /\bjamas\b/i,
        /\bsin\b/i,
        /\bya no\b/i,
        /\bdescart(ado|aron|ar|o|e)\b/i,
        /\bcero\b/i,
        /\bningun(a|o)?\b/i,
        /\blibre de\b/i,
        /\bni\b/i
      ];

      function isNegated(rawText, matchIndex) {
        const prefix = rawText.slice(Math.max(0, matchIndex - 45), matchIndex);
        const lastClause = prefix.split(/[.,;!?]/).pop();
        return NEGATION_PATTERNS.some((re) => re.test(lastClause));
      }

      EXTRACTION_KEYWORDS.forEach((entry) => {
        let matchedPhrase = null;
        let matchIndex = -1;

        for (const phrase of entry.phrases) {
          const normalized = phrase.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const idx = raw.indexOf(normalized);
          if (idx >= 0) {
            // Verificar polaridad: si la frase está negada, es una ausencia declarada
            if (!isNegated(raw, idx)) {
              matchedPhrase = phrase;
              matchIndex = idx;
              break;
            }
          }
        }

        if (!matchedPhrase) return;

        // Ajustar grado según intensidad lingüística.
        let grade = entry.defaultGrade;
        const intensifiers = ['mucho', 'muy', 'todo el tiempo', 'siempre', 'constantemente',
          'a diario', 'cada dia', 'terrible', 'horrible', 'insoportable', 'no aguanto'];
        const diminishers = ['a veces', 'un poco', 'ligero', 'leve', 'apenas', 'ocasional',
          'de vez en cuando', 'rara vez', 'casi nunca'];
        if (intensifiers.some((w) => raw.includes(w))) grade = Math.min(3, grade + 1);
        if (diminishers.some((w) => raw.includes(w))) grade = Math.max(1, grade - 1);

        found.push({
          itemId: entry.itemId,
          grade,
          confidence: 0.7,
          matchedPhrase
        });
      });

      return found;
    }

    /**
     * Detecta relaciones causales implícitas en el texto del paciente.
     * Busca patrones del tipo "X cuando Y" o "X porque Y" donde X e Y
     * son frases que mapean a ítems del catálogo.
     *
     * @returns {{ fromItemId: string, toItemId: string, connector: string, confidence: number }[]}
     */
    extractCausalLinks(text) {
      const raw = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (!raw) return [];
      const links = [];

      // Buscar conectores causales en el texto.
      const foundConnectors = CAUSAL_CONNECTORS.filter((c) => {
        const nc = c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return raw.includes(nc);
      });

      if (!foundConnectors.length) return links;

      // Extraer todos los síntomas mencionados.
      const symptoms = this.extractSymptoms(text);
      if (symptoms.length < 2) return links;

      // Para cada par de síntomas, verificar si hay un conector causal entre ellos.
      for (let i = 0; i < symptoms.length; i++) {
        for (let j = i + 1; j < symptoms.length; j++) {
          const a = symptoms[i];
          const b = symptoms[j];
          // Buscar si las frases están separadas por un conector causal.
          const idxA = raw.indexOf(a.matchedPhrase.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
          const idxB = raw.indexOf(b.matchedPhrase.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
          if (idxA < 0 || idxB < 0) continue;

          const between = raw.slice(Math.min(idxA, idxB), Math.max(idxA, idxB));
          const connector = foundConnectors.find((c) => {
            const nc = c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            return between.includes(nc);
          });

          if (connector) {
            links.push({
              fromItemId: idxA < idxB ? a.itemId : b.itemId,
              toItemId: idxA < idxB ? b.itemId : a.itemId,
              connector,
              confidence: connectorConfidence(connector)
            });
          }
        }
      }

      return links;
    }

    /**
     * Listener profundo: extrae síntomas + relaciones causales además del ack.
     *
     * Es el contrato completo para el modo "entrevistador activo": el texto
     * libre del paciente se procesa en tres capas:
     *   1. ack empático (sanitizado, sin lenguaje clínico)
     *   2. síntomas extraídos → inyectables al motor (determinista, verificable)
     *   3. relaciones causales → alimentan las constelaciones
     *
     * @param {string} text - texto libre del paciente
     * @returns {{ ack, intent, extractedSymptoms, causalLinks, tier, used }}
     */
    async listenDeep(text) {
      const raw = String(text || '').trim().slice(0, 1000);
      const extractedSymptoms = this.extractSymptoms(raw);
      const causalLinks = this.extractCausalLinks(raw);
      const base = await this.listen(text);

      this.telemetry.record(extractedSymptoms.length > 0 ? 'deep_extraction_symptoms' : 'deep_extraction_no_symptoms');
      if (causalLinks.length > 0) this.telemetry.record('deep_extraction_causal');

      return {
        ack: base.ack,
        intent: base.intent,
        extractedSymptoms,
        causalLinks,
        tier: base.tier || (extractedSymptoms.length > 0 ? 'deterministic_rules' : null),
        used: base.used || extractedSymptoms.length > 0
      };
    }

    /**
     * Genera una pregunta de seguimiento contextual según el síntoma activo.
     *
     * Para el modo "entrevistador activo": tras cada respuesta de opción
     * múltiple, el bot puede hacer una pregunta empática que invite al paciente
     * a dar más detalle. La pregunta es determinista (plantilla) y no usa el
     * modelo de lenguaje para generarla.
     *
     * @param {string} itemId - el ítem sobre el que se acaba de preguntar
     * @returns {string|null} pregunta de seguimiento o null
     */
    suggestFollowUp(itemId) {
      const followUps = {
        item_aut_tension_cervical: '¿Notas que la tensión se concentra más en el cuello, en los hombros, o es una sensación general?',
        item_aut_bruxismo: '¿Te das cuenta al despertar, o alguien te lo ha comentado? ¿Notas la mandíbula cansada por la mañana?',
        item_aut_taquicardia: '¿Lo notas más en reposo, después de comer, o en situaciones concretas?',
        item_aut_mente_acelerada: 'Cuando la mente no se detiene, ¿es más por pendientes del trabajo, preocupaciones personales, o una mezcla de todo?',
        item_aut_manos_frias: '¿Lo notas más en ciertos momentos del día o es algo constante?',
        item_sue_inercia_matutina: '¿Hay algo que te ayude a arrancar por las mañanas, o todos los días son igual de cuesta arriba?',
        item_sue_microdespertares: 'Cuando te despiertas de madrugada, ¿es fácil volver a dormirte o te quedas dando vueltas?',
        item_sue_latencia_alta: 'Cuando no puedes dormirte, ¿es más por pensamientos que no se apagan, por incomodidad física, o por ambas?',
        item_sue_pesadez_corporal: 'Esa sensación de cuerpo pesado, ¿la notas todo el día o más al despertar?',
        item_card_somnolencia_post: '¿Hay algún tipo de comida en particular que te produzca más ese bajón?',
        item_card_niebla_mental: '¿Notas que la niebla mental es peor en ciertos momentos del día, o es un telón de fondo constante?',
        item_card_antojos_dulces: '¿Es más por la tarde, por la noche, o en momentos de estrés?',
        item_ter_distension: '¿Notas que la hinchazón tiene relación con algún alimento en concreto o con el estrés?',
        item_ter_acidez_reflujo: '¿Lo notas más después de ciertas comidas, al acostarte, o en momentos de tensión?',
        item_ter_transito_irregular: '¿Tiendes más al estreñimiento, a la urgencia, o alternas entre ambos?',
        item_ocu_molestia_lumbar: '¿Es un dolor constante o aparece más hacia el final de la jornada?',
        item_ocu_sedentarismo_6h: '¿Tienes oportunidad de levantarte y moverte durante el día, o es jornada continua sentado?'
      };
      return followUps[itemId] || null;
    }

    snapshot() {
      return {
        status: this.status,
        modelId: this.config.modelId,
        exposure: this.config.exposure,
        listener: {
          enabled: this.config.listener.enabled,
          onDeviceReady: this.onDeviceListenerReady,
          serverConsent: this.config.listener.serverConsent,
          hasServer: !!this.config.listener.serverEndpoint
        },
        capabilities: { ...this.capabilities },
        progress: this.progress || 0,
        inferenceTimeoutMs: this.inferenceTimeoutMs,
        error: this.error,
        telemetry: this.telemetry.snapshot()
      };
    }
  }

  return {
    MODES,
    STATUS,
    EXPOSURE,
    INFERENCE_TIMEOUT_MS,
    DEFAULT_CONFIG,
    STORAGE_KEY,
    capabilities,
    readConfig,
    writeConfig,
    LocalTelemetry,
    Runtime,
    EXTRACTION_KEYWORDS,
    CAUSAL_CONNECTORS,
    extractSymptoms(text) {
      // Static helper expuesto para testing sin instanciar Runtime.
      const rt = new Runtime({ articulator: { articulateAsync: async () => ({ ok: true, text: '' }) } });
      return rt.extractSymptoms(text);
    },
    extractCausalLinks(text) {
      const rt = new Runtime({ articulator: { articulateAsync: async () => ({ ok: true, text: '' }) } });
      return rt.extractCausalLinks(text);
    }
  };
}));
