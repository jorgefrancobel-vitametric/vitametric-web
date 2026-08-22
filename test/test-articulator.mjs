// G-Level: L1
// Sustrato: Script Test
// Función: Invariantes del articulador SLM con doble gate (js/articulator.js) — el lenguaje
//          no puede afirmar lo que la máquina no decidió, ni alterar/omitir lo que no
//          puede parafrasear.
// v-version: 20260822.02

/**
 * S1 · Articulador con doble gate — falsadores.
 *
 *   A1 · Plantillas deterministas · sin SLM, la prosa sale de los allowedClaims y
 *        conserva valores bloqueados y frontera de seguridad; nada emite vocabulario
 *        prohibido.
 *   A2 · Locked values            · las escalas "N de 100" y el eje dominante se
 *        extraen como valores no parafraseables.
 *   A3 · SLM honesto              · un adaptador que respeta claims, valores y frontera
 *        pasa y produce prosa propia.
 *   A4 · SLM que inyecta          · vocabulario prohibido en la salida → bloqueado, con
 *        degradación segura a plantillas.
 *   A5 · SLM que DROPEA valor     · omitir un valor bloqueado → bloqueado.
 *   A6 · SLM que ALTERA valor     · cambiar 11 de 100 por 90 de 100 → bloqueado.
 *   A7 · SLM que DROPEA frontera  · omitir el recordatorio NOT_OBSERVABLE ("no es una
 *        medición") → bloqueado, aunque conserve números y vocabulario limpio.
 *   A8 · Gate1 en origen          · la prosa emitida nunca excede los claims autorizados:
 *        todo valor bloqueado presente en la salida ya estaba en los claims.
 *   A9 · Valores extra             · conservar el valor correcto no permite añadir
 *        otra escala o eje canónico no autorizado.
 */

import ArticulatorModule from '../js/articulator.js';

const { Articulator, checkUtterance, lockedValuesFrom } = ArticulatorModule;

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`✅ ${label}`);
  } else {
    failed++;
    console.log(`❌ ${label}${detail ? `\n   → ${detail}` : ''}`);
  }
}

/** Turno RESULT realista, del mismo contrato que emite triage-chat.js. */
function resultTurn() {
  return {
    type: 'RESULT',
    text: 'Con esto tengo suficiente. Esto es lo que reportaste, resumido.',
    allowedClaims: [
      {
        text: 'El área con más carga según lo que reportaste es Calidad de Sueño: 11 de 100.',
        evidence: 'MODEL_ESTIMATE',
        certainty: 'PRELIMINARY'
      },
      {
        text: 'Medir qué ocurre físicamente en tu cuerpo requiere el estudio en clínica; esta conversación no lo sustituye.',
        evidence: 'NOT_OBSERVABLE'
      }
    ]
  };
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── A1 · Plantillas deterministas ──');

{
  const art = new Articulator();
  const out = art.articulate(resultTurn());
  check('[A1] sin SLM, emite prosa determinista ok', out.ok === true && typeof out.text === 'string' && out.text.length > 0);
  check('[A1] usa plantillas (no modelo)', out.usedModel === false);
  check('[A1] conserva el valor bloqueado escalar', out.text.includes('11 de 100'));
  check('[A1] conserva el nombre del eje dominante', out.text.includes('Calidad de Sueño'));
  check('[A1] conserva la frontera de seguridad', out.text.includes('no lo sustituye'));
  // Nada de lo emitido debe violar el guardian.
  const fugas = out.text.split('. ').filter((s) => !checkUtterance(s).ok);
  check('[A1] ninguna frase emitida viola el vocabulario prohibido', fugas.length === 0, fugas.join(' | '));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── A2 · Locked values ──');

{
  const t = resultTurn();
  const claim = t.allowedClaims[0];
  const lv = lockedValuesFrom(claim.text);
  check('[A2] extrae la escala como valor bloqueado', lv.includes('11 de 100'), JSON.stringify(lv));
  check('[A2] extrae el eje como valor bloqueado', lv.includes('Calidad de Sueño'), JSON.stringify(lv));

  const art = new Articulator();
  const out = art.articulate(t);
  check('[A2] el articulador reporta los mismos locked values', arrayEq(out.locked, ['11 de 100', 'Calidad de Sueño']), JSON.stringify(out.locked));
}

function arrayEq(a, b) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── A3 · SLM honesto ──');

{
  const honest = {
    articulate({ turn, claims, locked }) {
      // Honesto de verdad: conserva el eje canónico (locked) y la frontera, solo
      // reformula el relleno no bloqueado.
      return 'Según lo que reportaste, la mayor carga está en Calidad de Sueño, con 11 de 100.'
        + ' Esto refleja lo que tú reportas y no sustituye una evaluación en clínica. '
        + 'Medir qué ocurre físicamente en tu cuerpo requiere el estudio en clínica; esta conversación no lo sustituye.';
    }
  };
  const art = new Articulator({ model: honest });
  const out = art.articulate(resultTurn());
  check('[A3] un SLM honesto que respeta claims/valores/frontera pasa', out.ok === true && out.usedModel === true);
  check('[A3] conserva locked values', out.text.includes('11 de 100') && out.text.includes('Calidad de Sueño'));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── A4 · SLM que inyecta vocabulario prohibido ──');

{
  const malo = {
    articulate() {
      return 'La mayor carga está en Calidad de Sueño: 11 de 100. Adicionalmente, tu ipH está alterado y hay microinflamación tisular. '
        + 'Medir qué ocurre físicamente en tu cuerpo requiere el estudio en clínica; esta conversación no lo sustituye.';
    }
  };
  const art = new Articulator({ model: malo });
  const out = art.articulate(resultTurn());
  check('[A4] SLM que inyecta ipH/microinflamación queda BLOQUEADO', out.ok === false && out.blocked === true);
  check('[A4] la salida del SLM nunca llega al paciente', !out.text || out.ok !== true);
  check('[A4] se ofrece degradación segura a plantillas', typeof out.fallback === 'string' && out.fallback.includes('11 de 100'));
  check('[A4] el fallback tampoco viola el guardián', checkUtterance(out.fallback).ok);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── A5 · SLM que DROPEA un valor bloqueado ──');

{
  const dropper = {
    articulate({ claims }) {
      return 'Según lo que reportas, la mayor carga está en el descanso nocturno.'
        + ' Medir qué ocurre físicamente en tu cuerpo requiere el estudio en clínica; esta conversación no lo sustituye.';
    }
  };
  const art = new Articulator({ model: dropper });
  const out = art.articulate(resultTurn());
  check('[A5] SLM que omite el valor "11 de 100" queda BLOQUEADO', out.ok === false && out.violations.some((v) => v.includes('11 de 100')));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── A6 · SLM que ALTERA un valor bloqueado ──');

{
  const altr = {
    articulate({ claims }) {
      return 'La carga está muy alta: Calidad de Sueño con 90 de 100.'
        + ' Medir qué ocurre físicamente en tu cuerpo requiere el estudio en clínica; esta conversación no lo sustituye.';
    }
  };
  const art = new Articulator({ model: altr });
  const out = art.articulate(resultTurn());
  check('[A6] SLM que cambia 11 por 90 queda BLOQUEADO', out.ok === false && out.violations.some((v) => v.includes('11 de 100')));
  check('[A6] el 90 inventado no aparece en lo que llegaría al paciente', !out.text || !out.text.includes('90 de 100'));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── A7 · SLM que DROPEA la frontera de seguridad ──');

{
  const sinFrontera = {
    articulate({ claims }) {
      return 'La mayor carga está en Calidad de Sueño, con 11 de 100. Todo lo demás se ve bien.';
    }
  };
  const art = new Articulator({ model: sinFrontera });
  const out = art.articulate(resultTurn());
  check('[A7] SLM que omite el recordatorio "no es una medición" queda BLOQUEADO', out.ok === false && out.violations.some((v) => v.includes('frontera de seguridad')));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── A8 · Gate1 en origen ──');

{
  const art = new Articulator();
  const out = art.articulate(resultTurn());
  // Todo valor bloqueado presente en la salida debe tener su origen en los claims
  // (la máquina ya decidió la whitelist); el articulador no añade valores propios.
  const nuevos = (out.locked || []).filter((lv) => {
    const enClaims = resultTurn().allowedClaims.some((c) => c.text.includes(lv));
    const enTexto = resultTurn().text.includes(lv);
    return !enClaims && !enTexto;
  });
  check('[A8] el articulador no introduce ningún valor ajeno a la whitelist', nuevos.length === 0, JSON.stringify(nuevos));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── A9 · Rechazo de valores extra no autorizados ──');

{
  const extra = {
    articulate() {
      return 'La mayor carga está en Calidad de Sueño: 11 de 100, pero también 99 de 100 y cuesta 999 MXN.'
        + ' Medir qué ocurre físicamente en tu cuerpo requiere el estudio en clínica; esta conversación no lo sustituye.';
    }
  };
  const art = new Articulator({ model: extra });
  const out = art.articulate(resultTurn());
  check('[A9] conservar el valor correcto y añadir 99 de 100 queda BLOQUEADO', out.ok === false && out.blocked === true);
  check('[A9] reporta la escala no autorizada', out.violations.some((v) => v.includes('99')));
  check('[A9] reporta cualquier literal numérico no autorizado', out.violations.some((v) => v.includes('999')));
  check('[A9] el valor extra nunca llega al paciente', !out.text || !out.text.includes('99 de 100'));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── A10 · Respuesta genérica no articulada ──');

{
  const refusal = {
    articulate() {
      return 'Lo siento, pero no puedo cumplir con esa solicitud.';
    }
  };
  const art = new Articulator({ model: refusal });
  const out = art.articulate({
    type: 'QUESTION',
    text: '¿Cómo has dormido?',
    allowedClaims: []
  });
  check('[A10] una negativa genérica del SLM queda BLOQUEADA', out.ok === false && out.blocked === true);
  check('[A10] la negativa nunca llega al paciente', !out.text || !out.text.includes('no puedo cumplir'));
  check('[A10] se conserva el fallback determinista', typeof out.fallback === 'string' && out.fallback.includes('¿Cómo has dormido?'));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── A11 · Respuesta vacía ──');

{
  const empty = { articulate: () => '' };
  const art = new Articulator({ model: empty });
  const out = art.articulate({
    type: 'QUESTION',
    text: '¿Cómo has dormido?',
    allowedClaims: []
  });
  check('[A11] una respuesta vacía queda BLOQUEADA', out.ok === false && out.blocked === true);
  check('[A11] la respuesta vacía activa fallback', typeof out.fallback === 'string' && out.fallback.includes('¿Cómo has dormido?'));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── A12 · Anclaje semántico de preguntas ──');

{
  const question = {
    type: 'QUESTION',
    text: 'Apretamiento dental nocturno o sobretensión involuntaria en mandíbula. ¿Con qué frecuencia te pasa?',
    allowedClaims: []
  };
  const drift = {
    articulate() {
      return '¿Cuál es el tipo de apoyo dental que te recomiendo?';
    }
  };
  const art = new Articulator({ model: drift });
  const out = art.articulate(question);
  check('[A12] una pregunta que cambia el asunto queda BLOQUEADA', out.ok === false && out.blocked === true);
  check('[A12] reporta anclajes insuficientes o recomendación no autorizada',
    out.violations.some((v) => v.includes('anclajes semánticos')
      || v.includes('recomendación no autorizada')));
  check('[A12] la pregunta desviada nunca llega al paciente', !out.text || !out.text.includes('apoyo dental'));

  const honestQuestion = {
    articulate() {
      return '¿Con qué frecuencia te pasa el apretamiento dental nocturno?';
    }
  };
  const validArt = new Articulator({ model: honestQuestion });
  const valid = validArt.articulate(question);
  check('[A12] una reformulación que conserva el asunto pasa', valid.ok === true && valid.usedModel === true);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── A13 · Mismo gate en ruta asíncrona ──');

{
  const question = {
    type: 'QUESTION',
    text: 'Apretamiento dental nocturno o sobretensión involuntaria en mandíbula. ¿Con qué frecuencia te pasa?',
    allowedClaims: []
  };
  const art = new Articulator({
    model: {
      async articulate() {
        return '¿Cuál es el tipo de apoyo dental que te recomiendo?';
      }
    }
  });
  const out = await art.articulateAsync(question);
  check('[A13] la ruta async bloquea el cambio de asunto', out.ok === false && out.blocked === true);
  check('[A13] la ruta async conserva fallback seguro',
    typeof out.fallback === 'string' && out.fallback.includes('Apretamiento dental'));
}

// ─────────────────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n${failed === 0 ? '🎉' : '🚨'} Articulador S1: ${passed}/${total} invariantes verdes.`);
if (failed > 0) process.exit(1);
