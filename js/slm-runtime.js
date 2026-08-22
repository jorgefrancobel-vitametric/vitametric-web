// G-Level: L1
// Sustrato: Contrato Ejecutable
// Función: Runtime opcional del articulador SLM — preparación asíncrona, feature flag,
//          fallback determinista y telemetría local sin datos del paciente.
// v-version: 20260822.01 (Fases 1–3 scaffold)

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
      capabilities: detected = capabilities()
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
      this.status = STATUS.DISABLED;
      this.error = null;
      this.model = null;
      this.onDeviceListenerReady = false;
      this.telemetry = telemetry || new LocalTelemetry({ enabled: this.config.telemetry });
    }

    enabled() {
      if (this.config.mode === MODES.OFF) return false;
      if (this.config.mode === MODES.AUTO
        && (!this.capabilities.webgpu || !this.capabilities.secureContext)) return false;
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

      const result = await this.articulator.articulateAsync(turn);
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
        error: this.error,
        telemetry: this.telemetry.snapshot()
      };
    }
  }

  return {
    MODES,
    STATUS,
    EXPOSURE,
    DEFAULT_CONFIG,
    STORAGE_KEY,
    capabilities,
    readConfig,
    writeConfig,
    LocalTelemetry,
    Runtime
  };
}));
