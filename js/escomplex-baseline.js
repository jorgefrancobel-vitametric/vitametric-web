/**
 * Vitametric — ES-Complex Baseline Import
 *
 * Permite cargar resultados de un escaneo ES-Complex previo como baseline
 * para el motor de autoevaluación. El motor puede entonces comparar el score
 * actual de autoreporte contra la medición física y mostrar tendencias.
 *
 * Schema de importación (JSON):
 * {
 *   "scanDate": "2026-06-15",
 *   "device": "Vector 2",
 *   "version": "1.0",
 *   "axes": {
 *     "autonomo":    { "score": 72, "label": "Tensión simpática elevada" },
 *     "sueno":       { "score": 45, "label": "Recuperación nocturna reducida" },
 *     "cardiometabolico": { "score": 58, "label": "Riesgo metabólico moderado" },
 *     "terreno":     { "score": 81, "label": "Acidez tisular elevada" },
 *     "ocupacional": { "score": 35, "label": "Carga postural baja" }
 *   },
 *   "bodyComposition": {
 *     "intracellularWater": 24.3,
 *     "extracellularWater": 16.1,
 *     "phaseAngle": 5.8,
 *     "bmi": 26.4
 *   }
 * }
 *
 * Integración:
 *   <script src="js/escomplex-baseline.js"></script>
 *   // El módulo expone VitametricESBaseline con import/export/clear.
 */

(function (root) {
  'use strict';

  var STORAGE_KEY = 'vitametric_escomplex_baseline_v1';

  /**
   * Valida que un objeto tenga la estructura mínima de un baseline ES-Complex.
   */
  function validate(data) {
    if (!data || typeof data !== 'object') return { valid: false, error: 'Datos inválidos: se esperaba un objeto JSON.' };
    if (!data.axes || typeof data.axes !== 'object') return { valid: false, error: 'Falta el campo "axes" con los scores por eje.' };

    var requiredAxes = ['autonomo', 'sueno', 'cardiometabolico', 'terreno', 'ocupacional'];
    for (var i = 0; i < requiredAxes.length; i++) {
      var axis = requiredAxes[i];
      var entry = data.axes[axis];
      if (!entry) return { valid: false, error: 'Falta el eje "' + axis + '" en axes.' };
      if (typeof entry.score !== 'number' || entry.score < 0 || entry.score > 100) {
        return { valid: false, error: 'El score de "' + axis + '" debe ser un número entre 0 y 100.' };
      }
    }

    if (!data.scanDate) return { valid: false, error: 'Falta el campo "scanDate" con la fecha del escaneo.' };

    return { valid: true };
  }

  /**
   * Importa un baseline desde JSON string o objeto.
   * @param {object|string} raw - JSON parseado o string crudo
   * @returns {{ success: boolean, baseline?: object, error?: string }}
   */
  function importBaseline(raw) {
    try {
      var data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      return { success: false, error: 'JSON inválido: ' + (e && e.message) };
    }

    var result = validate(data);
    if (!result.valid) return { success: false, error: result.error };

    // Normalizar: asegurar que todos los campos opcionales tengan defaults.
    var baseline = {
      scanDate: data.scanDate,
      device: data.device || 'ES-Complex',
      version: data.version || '1.0',
      axes: {},
      bodyComposition: data.bodyComposition || null
    };

    ['autonomo', 'sueno', 'cardiometabolico', 'terreno', 'ocupacional'].forEach(function (axis) {
      baseline.axes[axis] = {
        score: data.axes[axis].score,
        label: data.axes[axis].label || 'Sin etiqueta'
      };
    });

    // Persistir
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(baseline));
    } catch (e) { /* no disponible */ }

    return { success: true, baseline: baseline };
  }

  /**
   * Retorna el baseline cargado, o null.
   */
  function getBaseline() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  /**
   * Elimina el baseline actual.
   */
  function clearBaseline() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  /**
   * Compara los scores actuales del motor contra el baseline.
   * @param {object} currentScores - { autonomo: number, sueno: number, ... }
   * @param {object} [baseline] - si no se pasa, usa getBaseline()
   * @returns {object|null} comparación por eje, o null si no hay baseline
   */
  function compare(currentScores, baseline) {
    var bl = baseline || getBaseline();
    if (!bl) return null;

    var result = {
      scanDate: bl.scanDate,
      device: bl.device,
      axes: {}
    };

    Object.keys(bl.axes).forEach(function (axis) {
      var currentVal = currentScores[axis];
      var baselineVal = bl.axes[axis].score;

      // currentVal puede venir en escala 0-100 del motor
      var delta = typeof currentVal === 'number' ? (currentVal - baselineVal) : null;

      result.axes[axis] = {
        baseline: baselineVal,
        current: currentVal,
        delta: delta,
        label: bl.axes[axis].label,
        trend: delta === null ? 'unknown'
          : delta > 5 ? 'worse'
          : delta < -5 ? 'better'
          : 'stable'
      };
    });

    return result;
  }

  root.VitametricESBaseline = {
    validate: validate,
    import: importBaseline,
    get: getBaseline,
    clear: clearBaseline,
    compare: compare
  };

}(typeof self !== 'undefined' ? self : this));