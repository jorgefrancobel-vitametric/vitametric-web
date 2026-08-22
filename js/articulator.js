// G-Level: L1
// Sustrato: Contrato Ejecutable
// Función: Articulador de lenguaje on-device con doble gate — convierte el contrato
//          allowedClaims del motor conversacional en prosa hacia el paciente, sin que
//          la capa de lenguaje pueda afirmar nada que la máquina no decidió.
// v-version: 20260822.01 (S1 — capa separada, consume el contrato de triage-chat.js)

/**
 * S1 · Articulador SLM on-device con doble gate.
 *
 * La caja china del motor conversacional (triage-chat.js) termina en el campo
 * `allowedClaims`: es lo ÚNICO que un articulador de lenguaje tiene permitido
 * convertir en prosa. Este módulo hace cumplir esa frontera por software, e
 * independientemente de que el articulador sea una plantilla determinista (hoy)
 * o un SLM on-device (mañana, vía WebLLM/Qwen).
 *
 *   gate1 · Qué se puede decir  — solo lo que `allowedClaims` autoriza. Ninguna
 *           afirmación sale del articulador que no esté respaldada por un claim
 *           de la máquina. Un SLM que intente colar una afirmación nueva se bloquea.
 *
 *   gate2 · Cómo se dice         — el articulador conserva VERBATIM los valores que
 *           no puede parafrasear sin cambiar el significado: las escalas numericas
 *           ("N de 100"), el nombre del eje dominante y el recordatorio de que esto
 *           no es una medicion. Ademas, todo texto de salida pasa `checkUtterance`
 *           (el mismo guardian de vocabulario prohibido del motor), aunque el SLM
 *           sea honesto: la verificacion se aplica al texto YA construido.
 *
 * El articulador es un PROGRESO DE RESPUESTA no una caja negra: con plantillas
 * produce una verbalizacion determinista y verificable; con un adaptador SLM
 * (this.setModel) produce prosa fluida, pero siempre dentro del candado.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VitametricArticulator = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Mismo vocabulario prohibido que triage-chat.js: el guardian de salida del motor.
  // Mantenerlo aqui como copia de defensa en profundidad: el articulador nunca
  // deberia asumir que su entrada ya fue validada, lo verifica al emitir.
  const FORBIDDEN = [
    'iph', 'acidez tisular', 'fluido intersticial', 'líquido intersticial',
    'glicación', 'biofísica intersticial', 'balance bioeléctrico',
    'microinflamación', 'resistencia periférica', 'hipoxemia', 'oxigenación',
    'simpático', 'parasimpático', 'vagal', 'glucémica', 'glucémico',
    'stop-bang', 'psqi', 'epworth', 'diagnóstico de', 'padeces', 'tienes apnea'
  ];

  // Un rechazo genérico del modelo no es una articulación válida del turno:
  // tampoco debe pasar por accidente cuando no hay números o fronteras que
  // comparar. Se degrada a la plantilla determinista.
  const UNHELPFUL_RESPONSES = [
    'lo siento, pero no puedo cumplir con esa solicitud',
    'no puedo ayudar con esa solicitud',
    'no puedo cumplir con esa solicitud',
    'como modelo de lenguaje'
  ];

  const EVIDENCE = Object.freeze({
    SELF_REPORT: 'SELF_REPORT',
    MODEL_ESTIMATE: 'MODEL_ESTIMATE',
    NOT_OBSERVABLE: 'NOT_OBSERVABLE'
  });

  const CERTAINTY = Object.freeze({
    PRELIMINARY: 'PRELIMINARY',
    PROBABLE: 'PROBABLE',
    ESTABLISHED: 'ESTABLISHED'
  });

  /** Guardián de salida: identico al del motor. Devuelve {ok, violations}. */
  function checkUtterance(text) {
    const t = (text || '').toLowerCase();
    const hits = FORBIDDEN.filter((term) => t.includes(term));
    return { ok: hits.length === 0, violations: hits };
  }

  /**
   * Extrae del claim autorizado los valores que el articulador NO puede alterar:
   *   · escalas numericas del tipo "N de 100"
   *   · el nombre corto del eje (si el claim lo menciona)
   * La lista de ejes es la del motor; aqui se toman los que aparecen en el claim.
   */
  const AXIS_NAMES = [
    'Estrés Autónomo', 'Calidad de Sueño', 'Cardiometabólico',
    'Terreno Digestivo', 'Sobrecarga Laboral'
  ];

  function lockedValuesFrom(text) {
    const values = [];
    const scaleRe = /\d+\s*de\s*100/g;
    let m;
    while ((m = scaleRe.exec(text)) !== null) values.push(m[0]);
    AXIS_NAMES.forEach((name) => {
      if (text.includes(name)) values.push(name);
    });
    return values;
  }

  function collectLocked(turn) {
    const claims = turn.allowedClaims || [];
    const locked = [];
    claims.forEach((c) => {
      lockedValuesFrom(c.text).forEach((v) => {
        if (!locked.includes(v)) locked.push(v);
      });
    });
    // El texto base del turno tambien puede llevar valores bloqueados.
    lockedValuesFrom(turn.text).forEach((v) => {
      if (!locked.includes(v)) locked.push(v);
    });
    return locked;
  }

  function numericValuesFrom(text) {
    return (String(text || '').match(/\b\d+(?:[.,]\d+)?\b/g) || []);
  }

  /** Etiqueta de certeza legible para el paciente, cuando el claim la pide. */
  function certaintyAdverb(certainty) {
    switch (certainty) {
      case CERTAINTY.ESTABLISHED: return 'con bastante claridad';
      case CERTAINTY.PROBABLE: return 'con moderada seguridad';
      case CERTAINTY.PRELIMINARY: return 'solo como señales iniciales';
      default: return '';
    }
  }

  /**
   * Articulador determinista por plantillas: la verbalizacion "de hoy".
   * No inventa nada: emite el texto autorizado de cada claim, con una intro que
   * depende de su nivel de evidencia, y junta las piezas con conectores.
   */
  function templateArticulate(turn) {
    const claims = (turn.allowedClaims || []).filter((c) => c && c.text);
    const parts = [];

    claims.forEach((claim) => {
      let line;
      if (claim.evidence === EVIDENCE.SELF_REPORT) {
        line = `Lo que reportas: ${claim.text}`;
      } else if (claim.evidence === EVIDENCE.NOT_OBSERVABLE) {
        // El recordatorio de frontera no lleva prefijo: es una restriccion, no un dato.
        line = claim.text;
      } else {
        // MODEL_ESTIMATE
        const adv = claim.certainty ? ` ${certaintyAdverb(claim.certainty)}` : '';
        line = `${claim.text}${adv}`;
      }
      if (line && parts.indexOf(line) === -1) parts.push(line);
    });

    // El texto base del turno siempre se conserva como cierre/abertura, ya paso
    // checkUtterance en el motor y aqui se revalida al emitir.
    if (turn.text && !parts.includes(turn.text)) parts.unshift(turn.text);
    return parts.join(' ');
  }

  /**
   * Fragmento que el articulador NO puede omitir sin cambiar el significado
   * etico/clinico de la respuesta: las afirmaciones de frontera (evidence
   * NOT_OBSERVABLE) —"esto no es una medicion / requiere la clinica"— deben
   * sobrevivir verbatim. Un SLM que las parafrasea o las dropea se bloquea,
   * aunque su vocabulario sea limpio y conserve los numeros.
   */
  function mandatoryFragments(claims) {
    return claims
      .filter((c) => c && c.evidence === EVIDENCE.NOT_OBSERVABLE && c.text)
      .map((c) => c.text);
  }

  /**
   * Verificador del candado gate2 + gate1. Aplica a la salida del SLM:
   *   1. debio pasar checkUtterance (sin vocabulario prohibido)
   *   2. debio conservar cada valor bloqueado verbatim (escalas "N de 100", ejes)
   *   3. no puede introducir literales numericos ni nombres de eje no autorizados
   *   4. debio conservar verbatim toda afirmacion de frontera NOT_OBSERVABLE
   *      (el recordatorio "no es una medicion" no es parafraseable: es la red
   *      de seguridad etica del instrumento)
   *
   * La cobertura semantica fina del resto queda garantizada en origen por gate1:
   * la maquina solo incluyo en allowedClaims lo que se puede afirmar, y el
   * articulador nunca introduce claims suyos. Aqui se verifica el minimo
   * verificable de esa promesa en la salida del LLM.
   */
  function verifyOutput(candidate, locked, mandatory, check, authorizedNumbers = []) {
    const violations = [];
    const guard = check(candidate);
    if (!guard.ok) violations.push(...guard.violations);
    const normalized = String(candidate || '').toLowerCase();
    UNHELPFUL_RESPONSES.forEach((phrase) => {
      if (normalized.includes(phrase)) {
        violations.push(`respuesta no articulada: "${phrase}"`);
      }
    });
    locked.forEach((lv) => {
      if (!candidate.includes(lv)) violations.push(`valor bloqueado no conservado: "${lv}"`);
    });

    // Conservar los valores autorizados no basta: un SLM puede repetir el valor
    // correcto y añadir otro inventado. Rechazar cualquier literal numérico que
    // no exista en la whitelist de claims/texto base. La escala conserva además
    // su comprobación verbatim mediante `locked` más arriba.
    const allowedNumbers = new Set(authorizedNumbers);
    numericValuesFrom(candidate).forEach((number) => {
      if (!allowedNumbers.has(number)) {
        violations.push(`valor numérico no autorizado: "${number}"`);
      }
    });
    const allowedAxes = new Set(locked.filter((lv) => AXIS_NAMES.includes(lv)));
    AXIS_NAMES.forEach((axis) => {
      if (candidate.includes(axis) && !allowedAxes.has(axis)) {
        violations.push(`eje no autorizado: "${axis}"`);
      }
    });

    mandatory.forEach((frag) => {
      if (!candidate.includes(frag)) violations.push(`frontera de seguridad omitida: "${frag}"`);
    });
    return { ok: violations.length === 0, violations };
  }

  class Articulator {
    /**
     * @param {object} opts
     * @param {object} [opts.model]  adaptador SLM opcional con API {articulate({turn, claims, locked}) -> string}
     * @param {function} [opts.check] funcion de guardian de salida (default checkUtterance)
     */
    constructor({ model = null, check = checkUtterance } = {}) {
      this.model = model;
      this.check = check;
    }

    /** Inyecta (o reemplaza) el adaptador SLM on-device. */
    setModel(model) {
      this.model = model;
      return this;
    }

    /** Quita el SLM y vuelve al articulador determinista. */
    useTemplates() {
      this.model = null;
      return this;
    }

    /**
     * Articula un turno del motor (que trae text + allowedClaims).
     * Devuelve { ok, text, claims, locked } o { ok:false, blocked, violations }.
     */
    articulate(turn) {
      const claims = (turn && turn.allowedClaims) || [];
      const locked = collectLocked(turn || {});
      const mandatory = mandatoryFragments(claims);
      const authorizedNumbers = numericValuesFrom([
        ...claims.map((claim) => claim.text || ''),
        turn && turn.text ? turn.text : ''
      ].join(' '));

      let prose;
      let usedModel = false;

      if (this.model && typeof this.model.articulate === 'function') {
        usedModel = true;
        let candidate;
        try {
          candidate = this.model.articulate({ turn, claims, locked });
        } catch (err) {
          return {
            ok: false, blocked: true, usedModel: true,
            violations: ['el adaptador SLM fallo'], fallback: templateArticulate(turn)
          };
        }
        const cand = (typeof candidate === 'string') ? candidate : '';
        const v = verifyOutput(cand, locked, mandatory, this.check, authorizedNumbers);
        if (!v.ok) {
          // Degradacion segura: se bloquea la salida del SLM y se cae a plantillas.
          const fb = templateArticulate(turn);
          return {
            ok: false, blocked: true, usedModel: true,
            violations: v.violations, fallback: fb
          };
        }
        prose = cand;
      } else {
        prose = templateArticulate(turn);
      }

      // Doble revalidacion: incluso la prosa de plantilla pasa el guardian una
      // ultima vez antes de salir del articulador.
      const guard = this.check(prose);
      if (!guard.ok) {
        return { ok: false, blocked: true, usedModel, violations: guard.violations };
      }

      return { ok: true, text: prose, claims, locked, usedModel };
    }

    /** Genera siempre la salida determinista, aunque haya un modelo instalado. */
    articulateWithTemplates(turn) {
      const claims = (turn && turn.allowedClaims) || [];
      const locked = collectLocked(turn || {});
      const prose = templateArticulate(turn);
      const guard = this.check(prose);
      return guard.ok
        ? { ok: true, text: prose, claims, locked, usedModel: false }
        : { ok: false, blocked: true, usedModel: false, violations: guard.violations };
    }

    /**
     * Variante asíncrona para runtimes reales (WebLLM/ONNX). Se conserva
     * `articulate()` síncrono para no romper las plantillas ni las suites actuales.
     * El candidato se valida exactamente con el mismo doble gate antes de salir.
     */
    async articulateAsync(turn) {
      const claims = (turn && turn.allowedClaims) || [];
      const locked = collectLocked(turn || {});
      const mandatory = mandatoryFragments(claims);
      const authorizedNumbers = numericValuesFrom([
        ...claims.map((claim) => claim.text || ''),
        turn && turn.text ? turn.text : ''
      ].join(' '));

      if (!this.model || typeof this.model.articulate !== 'function') {
        return this.articulateWithTemplates(turn);
      }

      let candidate;
      try {
        candidate = await this.model.articulate({ turn, claims, locked });
      } catch (err) {
        return {
          ok: false,
          blocked: true,
          usedModel: true,
          violations: ['el adaptador SLM fallo'],
          fallback: templateArticulate(turn)
        };
      }

      const cand = (typeof candidate === 'string') ? candidate : '';
      const violations = verifyOutput(cand, locked, mandatory, this.check, authorizedNumbers);
      if (!violations.ok) {
        return {
          ok: false,
          blocked: true,
          usedModel: true,
          violations: violations.violations,
          fallback: templateArticulate(turn)
        };
      }

      const guard = this.check(cand);
      if (!guard.ok) {
        return { ok: false, blocked: true, usedModel: true, violations: guard.violations };
      }
      return { ok: true, text: cand, claims, locked, usedModel: true };
    }
  }

  return {
    Articulator,
    checkUtterance,
    lockedValuesFrom,
    templateArticulate,
    EVIDENCE,
    CERTAINTY,
    FORBIDDEN,
    UNHELPFUL_RESPONSES
  };
}));
