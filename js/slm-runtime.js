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
    telemetry: false
  });

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
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        mode,
        exposure,
        telemetry: parsed.telemetry === true
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
      telemetry: config.telemetry === true
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
        exposure: Object.values(EXPOSURE).includes(config.exposure) ? config.exposure : DEFAULT_CONFIG.exposure
      };
      this.capabilities = detected;
      this.status = STATUS.DISABLED;
      this.error = null;
      this.model = null;
      this.telemetry = telemetry || new LocalTelemetry({ enabled: this.config.telemetry });
    }

    enabled() {
      if (this.config.mode === MODES.OFF) return false;
      if (this.config.mode === MODES.AUTO
        && (!this.capabilities.webgpu || !this.capabilities.secureContext)) return false;
      return true;
    }

    async prepare() {
      if (!this.enabled()) {
        this.status = this.config.mode === MODES.OFF ? STATUS.DISABLED : STATUS.UNAVAILABLE;
        this.telemetry.record(this.status);
        return this.snapshot();
      }
      if (typeof this.loader !== 'function') {
        this.status = STATUS.UNAVAILABLE;
        this.telemetry.record('unavailable_no_loader');
        return this.snapshot();
      }

      this.status = STATUS.LOADING;
      this.error = null;
      this.telemetry.record('load_started');
      try {
        const model = await this.loader({
          modelId: this.config.modelId,
          onProgress: (progress) => {
            if (typeof progress === 'number') this.progress = Math.max(0, Math.min(1, progress));
          }
        });
        if (!model || typeof model.articulate !== 'function') {
          throw new Error('El loader no devolvió un adaptador SLM válido');
        }
        this.model = model;
        this.articulator.setModel(model);
        this.status = STATUS.READY;
        this.telemetry.record('load_ready');
      } catch (err) {
        this.status = STATUS.ERROR;
        this.error = err instanceof Error ? err.message : String(err);
        this.model = null;
        this.articulator.useTemplates();
        this.telemetry.record('load_error');
      }
      return this.snapshot();
    }

    async articulate(turn) {
      if (this.status !== STATUS.READY) {
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

    snapshot() {
      return {
        status: this.status,
        modelId: this.config.modelId,
        exposure: this.config.exposure,
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
