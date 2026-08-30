/**
 * Vitametric — A/B Testing Router
 *
 * Asigna visitantes a variantes de forma determinista (localStorage > random seed)
 * con persistencia cross-session. Cada variante puede sobrescribir SCORING_CONFIG
 * y se reporta en analytics como dimensión personalizada.
 *
 * Arquitectura: el router es una capa opaca para el motor — el motor siempre lee
 * SCORING_CONFIG del scope y no sabe qué variante lo pobló. Esto permite probar
 * thresholds, pesos y copy sin tocar el core del scoring.
 *
 * Activación: incluir ab-router.js ANTES de mapa-senales-engine.js.
 *   <script src="js/ab-router.js"></script>
 */

(function (root) {
  'use strict';

  const STORAGE_KEY = 'vitametric_ab_variant_v1';
  const VARIANTS = {
    v1: {
      label: 'Control (thresholds calibrados)',
      weight: 0.5,  // 50% del tráfico
      scoring: null  // null = usar SCORING_CONFIG por defecto
    },
    v2: {
      label: 'Thresholds sensibles (detección temprana)',
      weight: 0.5,  // 50% del tráfico
      scoring: {
        weights: {
          autonomo: 0.25,
          sueno: 0.20,
          cardiometabolico: 0.25,
          terreno: 0.20,
          ocupacional: 0.10
        },
        thresholds: {
          // Umbrales más bajos = detecta más casos moderados.
          // Hipótesis: aumenta la tasa de agendamiento sin degradar la
          // especificidad del HIGH (el moderado ya es motivo de consulta).
          highGlobal: 45,      // era 50
          highMaxAxis: 60,     // era 64
          moderateGlobal: 14,  // era 16
          moderateMaxAxis: 26  // era 30
        }
      }
    }
  };

  /**
   * Asigna variante: recupera de localStorage, o sortea con pesos.
   * Una vez asignada, persiste cross-session para que el mismo usuario
   * siempre vea la misma variante (evita flickering).
   */
  function assignVariant() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored && VARIANTS[stored]) return stored;
    } catch (e) { /* localStorage no disponible */ }

    // Sortear variante con pesos
    var keys = Object.keys(VARIANTS);
    var total = keys.reduce(function (sum, k) { return sum + VARIANTS[k].weight; }, 0);
    var r = Math.random() * total;
    var cumulative = 0;
    for (var i = 0; i < keys.length; i++) {
      cumulative += VARIANTS[keys[i]].weight;
      if (r <= cumulative) {
        try { localStorage.setItem(STORAGE_KEY, keys[i]); } catch (e) {}
        return keys[i];
      }
    }
    return 'v1'; // fallback seguro
  }

  var activeVariant = assignVariant();
  var variantConfig = VARIANTS[activeVariant];

  /**
   * Aplica la variante al SCORING_CONFIG global.
   * El motor lee window.VitametricABRouter.scoringOverrides y los aplica
   * durante su inicialización.
   */
  root.VitametricABRouter = {
    variant: activeVariant,
    label: variantConfig.label,
    scoringOverrides: variantConfig.scoring,
    getAllVariants: function () { return VARIANTS; },

    /**
     * Fuerza una variante específica (para tests automatizados).
     * @param {'v1'|'v2'} name
     */
    force: function (name) {
      if (!VARIANTS[name]) throw new Error('Variante desconocida: ' + name);
      activeVariant = name;
      variantConfig = VARIANTS[name];
      root.VitametricABRouter.variant = name;
      root.VitametricABRouter.label = variantConfig.label;
      root.VitametricABRouter.scoringOverrides = variantConfig.scoring;
      try { localStorage.setItem(STORAGE_KEY, name); } catch (e) {}
    }
  };

}(typeof self !== 'undefined' ? self : this));