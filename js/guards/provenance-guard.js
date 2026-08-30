/**
 * Vitametric — Guard determinista de procedencia
 *
 * Impide que una cadena mostrada al paciente afirme una magnitud física que el
 * instrumento no midió. El cuestionario recoge frecuencia de síntomas
 * auto-reportados; no mide estado celular, bioeléctrico ni metabólico.
 *
 * Corre sin red y sin modelo. Si detecta violación, la UI NO reintenta con el
 * SLM: cae al texto determinista del motor. Fallar hacia lo determinista.
 *
 * Ratchet: cada fuga hallada en producción se añade como caso a
 * test/test-provenance-guard.mjs. El conjunto de casos solo crece.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VitametricProvenanceGuard = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Procedencia de todo valor emitido. Sin esto no se renderiza. */
  var PROVENANCE = Object.freeze({
    SELF_REPORT: 'self_report', // lo declaró la persona
    DERIVED: 'derived',         // lo calculó el motor desde self_report
    MEASURED: 'measured',       // proviene de un ES-Complex importado
    ABSENT: 'absent'            // no hay dato — NO es un cero
  });

  /**
   * Léxico que nombra una magnitud sólo obtenible por medición física.
   * No incluye el copy de marca ("nutrición celular", "salud celular"): eso
   * describe el dominio del negocio, no un resultado del instrumento.
   */
  var MEASURED_ONLY_TERMS = Object.freeze([
    'bioeléctric', 'bioelectric',
    'carga celular',
    'milivolt', 'potencial de membrana',
    'mitocondri',
    'ángulo de fase', 'angulo de fase',
    'agua intracelular', 'agua extracelular',
    'acidez tisular',
    'reactividad neurovegetativa',
    'tono simpático', 'tono simpatico',
    'susceptibilidad metabólica', 'susceptibilidad metabolica',
    'fascia'
  ]);

  /** Verbos que convierten un reporte en un hecho medido. */
  var INDICATIVE_CLAIM = /\b(tienes|padeces|presentas|tu nivel de|se detect[oó]|tu estado (?:celular|bioel[eé]ctrico)|mides)\b/i;

  /** Enunciados de normalidad: ilegítimos si hay ejes sin muestra suficiente. */
  var NORMALITY_CLAIM = /\b(en rango|dentro de (?:lo )?normal|normal(?:es)?|equilibrad[oa]s?|sin hallazgos|saludable|todo bien)\b/i;

  /** Constantes de la propia escala y del texto; nunca son un dato inventado. */
  var SCALE_CONSTANTS = ['0', '1', '2', '3', '4', '5', '100', '24'];

  function collectAllowedNumbers(facts, allowed) {
    if (facts === null || facts === undefined) return;
    if (typeof facts === 'number' && isFinite(facts)) {
      allowed.add(String(facts));
      allowed.add(String(Math.round(facts)));
      return;
    }
    if (typeof facts !== 'object') return;
    if (Array.isArray(facts)) {
      facts.forEach(function (v) { collectAllowedNumbers(v, allowed); });
      return;
    }
    Object.keys(facts).forEach(function (k) { collectAllowedNumbers(facts[k], allowed); });
  }

  /**
   * @param {string} outputText  texto que se mostraría al paciente
   * @param {object} facts       matriz de hechos del motor
   * @param {object} [opts]
   * @param {string} [opts.mode] 'generated' (default) corre los 4 guards;
   *                             'deterministic' omite G2, porque la prosa del
   *                             motor cita frecuencias y rangos de su propio
   *                             catálogo de ítems, no cifras inferidas.
   * @returns {{ok: boolean, violations: string[]}}
   */
  function runProvenanceGuards(outputText, facts, opts) {
    var text = String(outputText === null || outputText === undefined ? '' : outputText);
    var lower = text.toLowerCase();
    var options = opts || {};
    var mode = options.mode || 'generated';
    var violations = [];
    var hasMeasurement = !!(facts && facts.measured);

    // G1 — Léxico de medición sin medición detrás.
    if (!hasMeasurement) {
      MEASURED_ONLY_TERMS.forEach(function (term) {
        if (lower.indexOf(term) !== -1) {
          violations.push('G1 procedencia: "' + term + '" afirma una magnitud que el cuestionario no midió.');
        }
      });
    }

    // G2 — Integridad numérica: todo número citado debe existir en la matriz.
    //
    // Se ABSTIENE si no hay matriz que consultar. Un guard que no puede juzgar
    // no condena: sin `facts` el conjunto permitido son sólo las constantes de
    // escala, y entonces cualquier cifra legítima ("61/100") se marcaría como
    // inventada. Es el error simétrico del que este módulo existe para impedir
    // — concluir desde la ausencia de datos.
    var allowed = new Set(SCALE_CONSTANTS);
    collectAllowedNumbers(facts, allowed);
    var canJudgeNumbers = allowed.size > SCALE_CONSTANTS.length;
    if (mode === 'generated' && canJudgeNumbers) {
      var numbers = text.match(/-?\d+(?:[.,]\d+)?/g) || [];
      numbers.forEach(function (raw) {
        var normalized = raw.replace(',', '.');
        var rounded = String(Math.round(parseFloat(normalized)));
        if (!allowed.has(normalized) && !allowed.has(rounded)) {
          violations.push('G2 integridad numérica: "' + raw + '" no procede de la matriz de hechos.');
        }
      });
    }

    // G3 — Ausencia de dato leída como normalidad.
    var validity = (facts && facts.responseValidity) || {};
    var lowCount = validity.lowCountAxes || [];
    if (lowCount.length > 0 && NORMALITY_CLAIM.test(text)) {
      violations.push('G3 ausencia≠normalidad: hay ejes con muestra insuficiente (' +
        lowCount.join(', ') + ') y el texto los enuncia como normales.');
    }

    // G4 — Modo indicativo sobre lo que sólo fue reportado.
    if (!hasMeasurement && INDICATIVE_CLAIM.test(text)) {
      violations.push('G4 modo verbal: enunciado indicativo sobre auto-reporte; usar "lo que reportas indica…".');
    }

    return { ok: violations.length === 0, violations: violations };
  }

  return {
    PROVENANCE: PROVENANCE,
    MEASURED_ONLY_TERMS: MEASURED_ONLY_TERMS,
    runProvenanceGuards: runProvenanceGuards
  };
}));
