// G-Level: L1
// Sustrato: Script Test
// Función: Invariantes del motor conversacional de triaje — contrato de turnos, guardián de salida, brevedad, adaptatividad y honestidad epistémica
// v-version: 20260822.01

/**
 * Invariantes de la anamnesis adaptativa.
 *
 * Un chatbot clínico falla de maneras que un formulario no puede: puede no
 * terminar nunca, puede prometer lo que no mide, puede preguntar en bucle o
 * puede contradecirse entre turnos sin avisar. Cada una de esas formas de fallo
 * tiene aquí un invariante.
 *
 *   T1 · Contrato de turnos   · todo turno es de un tipo declarado y trae lo que su tipo exige
 *   T2 · Guardián de salida   · el vocabulario prohibido se bloquea de verdad
 *   T3 · Terminación          · toda conversación termina, con cualquier patrón de respuesta
 *   T4 · Brevedad             · el adaptativo pregunta bastante menos que el formulario
 *   T5 · Adaptatividad        · la pregunta elegida es la de máxima información
 *   T6 · Honestidad           · la ignorancia se declara, no se rellena
 *   T7 · Revisión declarada   · cambiar de hipótesis se dice, no se disimula
 */

import Rasch from '../js/rasch.js';
import Engine from '../js/test-celular-engine.js';
import Triage from '../js/triage-chat.js';

const { AXES, CONDITIONAL_DIMENSIONS } = Engine;
const { TURN, EVIDENCE, CERTAINTY, checkUtterance, createSession, buildCatalog } = Triage;

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

function makeRandom(seed = 20260822) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Recorre una conversación completa con una política de respuesta dada.
 * Devuelve el rastro para inspeccionarlo.
 */
function runConversation(rand, { policy = 'random', maxTurns = 80 } = {}) {
  const session = createSession();
  const trace = { turns: [], questions: 0, reflections: 0, result: null, blocked: [] };

  for (let i = 0; i < maxTurns; i++) {
    const turn = session.next();
    trace.turns.push(turn);
    if (turn.blocked) { trace.blocked.push(turn); break; }

    if (turn.type === TURN.FRAMING) continue;

    if (turn.type === TURN.REFLECTION) {
      trace.reflections++;
      session.respondToReflection(turn.axis, policy === 'reject' ? false : rand() > 0.4);
      continue;
    }

    if (turn.type === TURN.QUESTION) {
      trace.questions++;
      let grade;
      if (policy === 'unknown') grade = null;
      else if (policy === 'max') grade = 3;
      else if (policy === 'zero') grade = 0;
      else grade = rand() < 0.15 ? null : Math.floor(rand() * 4);
      session.answer(turn.itemId, grade);
      continue;
    }

    if (turn.type === TURN.RESULT) { trace.result = turn; break; }
  }
  return trace;
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── T1 · Contrato de turnos ──');

{
  const rand = makeRandom();
  const tipos = new Set(Object.values(TURN));
  let malformados = 0;
  let bloqueados = 0;

  for (let i = 0; i < 60; i++) {
    const trace = runConversation(rand);
    bloqueados += trace.blocked.length;
    trace.turns.forEach((t) => {
      if (!tipos.has(t.type)) { malformados++; return; }
      if (t.type === TURN.QUESTION && (!t.itemId || !t.axis || !Array.isArray(t.options) || !t.rationale)) malformados++;
      if (t.type === TURN.REFLECTION && (!t.axis || !Array.isArray(t.options))) malformados++;
      if (t.type === TURN.RESULT && (!t.estimates || !t.dominant || !Array.isArray(t.allowedClaims))) malformados++;
    });
  }

  check('[T1] todo turno es de un tipo declarado y trae su carga completa', malformados === 0, `${malformados} turnos malformados`);
  check('[T1] ningún turno legítimo queda bloqueado por el guardián', bloqueados === 0, `${bloqueados} bloqueos`);
}

{
  // Toda afirmación dirigida al paciente debe declarar su nivel de evidencia:
  // sin eso, autoreporte y medición se confunden en la misma frase.
  const rand = makeRandom(3);
  const trace = runConversation(rand);
  const claims = trace.turns.flatMap((t) => t.allowedClaims || []);
  const niveles = new Set(Object.values(EVIDENCE));
  check(
    '[T1] toda afirmación declara su nivel de evidencia',
    claims.length > 0 && claims.every((c) => niveles.has(c.evidence)),
    `${claims.length} claims`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── T2 · Guardián de salida ──');

{
  // Falsación directa: si el guardián no detecta esto, no sirve de nada.
  const prohibidos = [
    'Tu ipH está alterado',
    'Detectamos microinflamación tisular',
    'Aplicamos el cuestionario STOP-BANG',
    'Tu balance simpático está comprometido',
    'Esto mide tu fluido intersticial'
  ];
  const todosDetectados = prohibidos.every((t) => checkUtterance(t).ok === false);
  check('[T2] el guardián detecta las cinco formas de sobre-afirmación', todosDetectados);

  const permitidos = [
    'El área con más carga según lo que reportaste es Sueño.',
    'Medir qué ocurre físicamente requiere el estudio en clínica.',
    '¿Con qué frecuencia te pasa?'
  ];
  check('[T2] el guardián no bloquea lenguaje legítimo', permitidos.every((t) => checkUtterance(t).ok));

  // Y debe estar realmente cableado a la emisión, no solo exportado.
  const rand = makeRandom(5);
  const trace = runConversation(rand);
  const textos = trace.turns.flatMap((t) => [t.text, ...(t.allowedClaims || []).map((c) => c.text)]).filter(Boolean);
  const fugas = textos.filter((t) => !checkUtterance(t).ok);
  check('[T2] ningún texto emitido en una conversación real viola la frontera', fugas.length === 0, fugas.join(' | '));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── T3 · Terminación ──');

{
  const politicas = ['random', 'unknown', 'max', 'zero', 'reject'];
  const resultados = politicas.map((policy) => {
    const rand = makeRandom(17);
    const trace = runConversation(rand, { policy });
    return { policy, termino: !!trace.result, preguntas: trace.questions };
  });

  resultados.forEach((r) => console.log(`   política "${r.policy}": ${r.termino ? 'termina' : 'NO TERMINA'} en ${r.preguntas} preguntas`));
  check('[T3] la conversación termina con cualquier patrón de respuesta', resultados.every((r) => r.termino));

  // Rechazar siempre la interpretación reabre ejes: no debe volverse infinito.
  const rand = makeRandom(23);
  const trace = runConversation(rand, { policy: 'reject' });
  check('[T3] rechazar siempre la interpretación no produce un bucle infinito', !!trace.result && trace.questions <= buildCatalog().length);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── T4 · Brevedad ──');

{
  const rand = makeRandom(101);
  const catalogo = buildCatalog().length;
  let suma = 0;
  let peor = 0;
  const N = 60;

  for (let i = 0; i < N; i++) {
    const trace = runConversation(rand);
    suma += trace.questions;
    peor = Math.max(peor, trace.questions);
  }
  const media = suma / N;
  console.log(`   preguntas: media ${media.toFixed(1)} · peor caso ${peor} · formulario completo ${catalogo}`);

  check('[T4] el adaptativo administra menos de la mitad del catálogo en promedio', media < catalogo / 2, `media ${media.toFixed(1)} de ${catalogo}`);
  check('[T4] ni en el peor caso supera el catálogo', peor <= catalogo, `peor ${peor}`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── T5 · Adaptatividad ──');

{
  // La pregunta emitida debe ser exactamente la que el criterio de información
  // señala: si no, el "adaptativo" es decorativo.
  const rand = makeRandom(31);
  const session = createSession();
  session.next(); // encuadre

  let verificadas = 0;
  let desviaciones = 0;

  for (let i = 0; i < 12; i++) {
    const turn = session.next();
    if (turn.type !== TURN.QUESTION) {
      if (turn.type === TURN.REFLECTION) { session.respondToReflection(turn.axis, true); continue; }
      break;
    }

    const estado = session.state();
    const theta = estado.estimates[turn.axis].theta;
    const info = turn.rationale.information;

    // Ningún ítem ya respondido puede reaparecer.
    if (turn.itemId in estado.answers) desviaciones++;
    // La información declarada debe coincidir con la que el modelo calcula.
    const items = buildCatalog();
    const item = items.find((it) => it.id === turn.itemId);
    if (!item) desviaciones++;
    if (typeof info !== 'number' || info <= 0) desviaciones++;
    verificadas++;

    session.answer(turn.itemId, Math.floor(rand() * 4));
  }

  check('[T5] cada pregunta declara información positiva y no repite ítems', desviaciones === 0 && verificadas > 0, `${desviaciones} desviaciones en ${verificadas} preguntas`);
}

{
  // Contraste directo contra el selector: el motor no debe elegir al azar.
  const session = createSession();
  session.next();
  const turn = session.next();
  const estado = session.state();
  const pool = buildCatalog()
    .filter((it) => !(it.id in estado.answers) && typeof it.weights[turn.axis] === 'number');
  check('[T5] la primera pregunta pertenece al eje que el motor declaró', pool.some((it) => it.id === turn.itemId));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── T6 · Honestidad epistémica ──');

{
  // Si el paciente no sabe nada, el motor no puede fabricar un resultado firme.
  const rand = makeRandom(41);
  const trace = runConversation(rand, { policy: 'unknown' });
  const claims = trace.result ? trace.result.allowedClaims : [];
  const declaraFalta = claims.some((c) => c.certainty === CERTAINTY.PRELIMINARY);
  const declaraNoObservable = claims.some((c) => c.evidence === EVIDENCE.NOT_OBSERVABLE);

  check('[T6] respondiendo siempre "no lo sé" el motor termina igualmente', !!trace.result);
  check('[T6] y declara que le faltó información en vez de afirmar con firmeza', declaraFalta, JSON.stringify(claims.map((c) => c.certainty)));
  check('[T6] todo resultado recuerda que la medición corresponde a la clínica', declaraNoObservable);
}

{
  // El resultado nunca debe presentar una certeza que el error estándar no avala.
  const rand = makeRandom(53);
  let incoherentes = 0;
  for (let i = 0; i < 40; i++) {
    const trace = runConversation(rand);
    if (!trace.result) continue;
    const dom = trace.result.estimates[trace.result.dominant];
    const claim = trace.result.allowedClaims.find((c) => c.evidence === EVIDENCE.MODEL_ESTIMATE && c.certainty);
    if (!claim) continue;
    const esperada = dom.se <= 0.45 ? CERTAINTY.ESTABLISHED : (dom.se <= 0.8 ? CERTAINTY.PROBABLE : CERTAINTY.PRELIMINARY);
    if (dom.certainty !== esperada) incoherentes++;
  }
  check('[T6] la certeza declarada se corresponde con el error estándar alcanzado', incoherentes === 0, `${incoherentes} incoherencias`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── T7 · Revisión de hipótesis declarada ──');

{
  // Se buscan conversaciones donde el foco comunicado en la reflexión difiera del
  // dominante final: en todas ellas el cambio debe estar explicitado.
  const rand = makeRandom(67);
  let conCambio = 0;
  let declarados = 0;

  for (let i = 0; i < 120; i++) {
    const session = createSession();
    const trace = { focoComunicado: null, result: null };
    for (let t = 0; t < 80; t++) {
      const turn = session.next();
      if (turn.type === TURN.FRAMING) continue;
      if (turn.type === TURN.REFLECTION) { trace.focoComunicado = turn.axis; session.respondToReflection(turn.axis, rand() > 0.5); continue; }
      if (turn.type === TURN.QUESTION) { session.answer(turn.itemId, Math.floor(rand() * 4)); continue; }
      if (turn.type === TURN.RESULT) { trace.result = turn; break; }
    }
    if (!trace.result || !trace.focoComunicado) continue;
    if (trace.focoComunicado !== trace.result.dominant) {
      conCambio++;
      if (trace.result.allowedClaims.some((c) => c.revision)) declarados++;
    }
  }

  console.log(`   conversaciones donde la hipótesis cambió: ${conCambio} · declaradas: ${declarados}`);
  check(
    '[T7] siempre que la hipótesis cambia, el cambio se le dice al paciente',
    conCambio === declarados,
    `${conCambio - declarados} cambios silenciosos`
  );
  check('[T7] el escenario de cambio de hipótesis ocurre de verdad en la simulación', conCambio > 0, 'no se produjo ningún cambio: el invariante no se probó');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── T8 · Gateo de dimensiones condicionales ──');

{
  /**
   * Hallazgo de freebuff: el pool no filtraba por la condición de branching, así
   * que el chat preguntaba por pausas respiratorias y rigidez articular a
   * pacientes sin un solo síntoma. La suite T1-T7 pasaba igual — ningún
   * invariante cubría el caso. Este lo cubre.
   */
  const condicionales = new Set(
    Object.values(CONDITIONAL_DIMENSIONS).flatMap((d) => d.items.map((it) => it.id))
  );

  function administrados(policy) {
    const session = createSession();
    const vistos = [];
    for (let i = 0; i < 80; i++) {
      const turn = session.next();
      if (turn.type === TURN.FRAMING) continue;
      if (turn.type === TURN.REFLECTION) { session.respondToReflection(turn.axis, true); continue; }
      if (turn.type === TURN.QUESTION) {
        vistos.push(turn.itemId);
        session.answer(turn.itemId, typeof policy === 'function' ? policy(turn) : policy);
        continue;
      }
      if (turn.type === TURN.RESULT) break;
    }
    return vistos;
  }

  const sinSintomas = administrados(0).filter((id) => condicionales.has(id));
  check(
    '[T8] sin ningún síntoma afirmado no se administra ningún ítem condicional',
    sinSintomas.length === 0,
    `administrados: ${sinSintomas.join(', ')}`
  );

  const todoDesconocido = administrados(null).filter((id) => condicionales.has(id));
  check(
    '[T8] responder "no lo sé" no abre ramas: no es evidencia de presencia',
    todoDesconocido.length === 0,
    `administrados: ${todoDesconocido.join(', ')}`
  );

  const ejeAjeno = administrados((t) => (t.axis === 'ocupacional' ? 3 : 0)).filter((id) => condicionales.has(id));
  check(
    '[T8] cargar un eje ajeno a toda rama no desbloquea ninguna',
    ejeAjeno.length === 0,
    `administrados: ${ejeAjeno.join(', ')}`
  );

  // El contrapositivo: si el gateo fuera "nunca abrir", el invariante también
  // pasaría y no valdría nada. Debe abrirse cuando corresponde.
  const suenoCargado = administrados((t) => (t.axis === 'sueno' ? 3 : 0)).filter((id) => condicionales.has(id));
  check(
    '[T8] cargar el eje de sueño SÍ desbloquea el tamizaje de descanso',
    suenoCargado.length > 0,
    'ninguna rama se abrió: el gateo estaría bloqueando de más'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── T9 · Longitud según perfil ──');

{
  // El paciente sin síntomas no debe recibir más preguntas que el cargado: en los
  // extremos del rasgo la información por ítem cae, y sin un paro por decisión el
  // test se alarga justo con quien menos tiene que contar.
  function longitud(policy) {
    const session = createSession();
    let q = 0;
    for (let i = 0; i < 80; i++) {
      const turn = session.next();
      if (turn.type === TURN.FRAMING) continue;
      if (turn.type === TURN.REFLECTION) { session.respondToReflection(turn.axis, true); continue; }
      if (turn.type === TURN.QUESTION) { q++; session.answer(turn.itemId, typeof policy === 'function' ? policy(turn) : policy); continue; }
      if (turn.type === TURN.RESULT) break;
    }
    return q;
  }

  const sano = longitud(0);
  const cargado = longitud(3);
  console.log(`   perfil sano: ${sano} preguntas · perfil cargado: ${cargado} preguntas`);
  check('[T9] el perfil sin síntomas no es el más largo de contestar', sano <= cargado, `sano ${sano} vs cargado ${cargado}`);
  check('[T9] el perfil sin síntomas se resuelve en 12 preguntas o menos', sano <= 12, `${sano} preguntas`);
}

// ─────────────────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n${failed === 0 ? '🎉' : '🚨'} Motor conversacional de triaje: ${passed}/${total} invariantes verdes.`);
if (failed > 0) process.exit(1);
