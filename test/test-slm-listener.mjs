// G-Level: L1
// Sustrato: Script Test
// Función: Listener on-device opcional + servo estrictamente opt-in con consentimiento.
//           Verifica: no-op cuando está desactivado, default on-device privado, servo
//           solo si serverConsent, sanitización de claims y bloqueo de salida insegura.
// v-version: 20260822.02

import ArticulatorModule from '../js/articulator.js';
import SLM from '../js/slm-runtime.js';

const { Articulator } = ArticulatorModule;
const { Runtime } = SLM;

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

function turn() {
  return {
    type: 'RESULT',
    text: 'Esto es un resumen de lo que reportaste.',
    allowedClaims: [
      { text: 'El área con más carga es Calidad de Sueño: 11 de 100.', evidence: 'MODEL_ESTIMATE', certainty: 'PRELIMINARY' },
      { text: 'Medir qué ocurre requiere el estudio en clínica; esta conversación no lo sustituye.', evidence: 'NOT_OBSERVABLE' }
    ]
  };
}

const onDeviceModel = {
  async articulate() { return 'x'; },
  async listen({ text }) {
    return { ack: 'Gracias por contarnos eso, te escuchamos.', intent: 'duda' };
  }
};

const loader = async () => onDeviceModel;

// ── L1 · Desactivado ──────────────────────────────────────────────────────
console.log('\n── L1 · Listener desactivado ──');
{
  const runtime = new Runtime({
    articulator: new Articulator(),
    config: { mode: MODES_OFF(), telemetry: true },
    loader,
    capabilities: { webgpu: true, secureContext: true }
  });
  await runtime.prepare();
  const r = await runtime.listen('Me siento muy cansado');
  check('[L1] sin listener, listen es no-op', r.used === false && r.ack === null && r.tier === null);
}

// ── L2 · On-device por defecto (privado) ─────────────────────────────────
console.log('\n── L2 · On-device default (sin servo) ──');
{
  const runtime = new Runtime({
    articulator: new Articulator(),
    config: { mode: MODES_OFF(), telemetry: true, listener: { enabled: true, serverEndpoint: null, serverConsent: false } },
    loader,
    capabilities: { webgpu: true, secureContext: true }
  });
  const prep = await runtime.prepare();
  check('[L2] el modelo on-device quedó listo para el listener', prep.listener.onDeviceReady === true);
  const r = await runtime.listen(' Tengo dolor de cabeza ');
  check('[L2] ack presente y tier on_device', r.used === true && r.tier === 'on_device' && typeof r.ack === 'string');
  check('[L2] intención clasificada', r.intent === 'duda');
}

// ── L3 · Servo configurado PERO sin consentimiento ───────────────────────
console.log('\n── L3 · Servo presente, consentimiento OFF ──');
{
  let serverCalled = false;
  const realFetch = global.fetch;
  global.fetch = async () => { serverCalled = true; return { ok: true, json: async () => ({ ack: 'x', intent: 'otro' }) }; };
  try {
    const runtime = new Runtime({
      articulator: new Articulator(),
      config: { mode: MODES_OFF(), telemetry: true,
        listener: { enabled: true, serverEndpoint: 'https://api.test/listen', serverConsent: false } },
      loader,
      capabilities: { webgpu: true, secureContext: true }
    });
    await runtime.prepare();
    const r = await runtime.listen('no sé qué me pasa');
    check('[L3] el servo NUNCA se invoca sin consentimiento', serverCalled === false);
    check('[L3] en su lugar usa on-device', r.tier === 'on_device' && r.used === true);
  } finally { global.fetch = realFetch; }
}

// ── L4 · Servo SOLO con consentimiento ───────────────────────────────────
console.log('\n── L4 · Servo con consentimiento explícito ──');
{
  let captured = null;
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => { captured = JSON.parse(opts.body); return { ok: true, json: async () => ({ ack: 'Entiendo, hablemos de eso.', intent: 'agendar' }) }; };
  try {
    const runtime = new Runtime({
      articulator: new Articulator(),
      config: { mode: MODES_OFF(), telemetry: true,
        listener: { enabled: true, serverEndpoint: 'https://api.test/listen', serverConsent: true } },
      loader,
      capabilities: { webgpu: true, secureContext: true }
    });
    await runtime.prepare();
    const r = await runtime.listen('quiero agendar');
    check('[L4] el texto del paciente sí viajó al servo (consentido)', captured && captured.text === 'quiero agendar');
    check('[L4] tier server y used', r.tier === 'server' && r.used === true);
    check('[L4] intención agendar propagada', r.intent === 'agendar');
  } finally { global.fetch = realFetch; }
}

// ── L5 · Sanitización de salida del listener ─────────────────────────────
console.log('\n── L5 · Sanitización (sin claims fácticos) ──');
{
  const runtime = new Runtime({ articulator: new Articulator(), config: { mode: MODES_OFF() }, loader, capabilities: { webgpu: true, secureContext: true } });
  check('[L5] borra literales numéricos', runtime.sanitizeListenerOutput('tienes 11 de 100') === null);
  check('[L5] borra vocabulario prohibido', runtime.sanitizeListenerOutput('esto es un diagnóstico') === null);
  check('[L5] borra nombres de eje', runtime.sanitizeListenerOutput('tu Estrés Autónomo') === null);
  check('[L5] conserva ack empático limpio', runtime.sanitizeListenerOutput('Gracias, te escuchamos') === 'Gracias, te escuchamos');
}

// ── L6 · Servo devuelve contenido inseguro → bloqueado ──────────────────
console.log('\n── L6 · Salida de servo insegura se descarta ──');
{
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ ack: 'tienes apnea severa 9 de 10', intent: 'agudo' }) });
  try {
    const runtime = new Runtime({
      articulator: new Articulator(),
      config: { mode: MODES_OFF(), telemetry: true,
        listener: { enabled: true, serverEndpoint: 'https://api.test/listen', serverConsent: true } },
      loader,
      capabilities: { webgpu: true, secureContext: true }
    });
    await runtime.prepare();
    const r = await runtime.listen('ayuda');
    check('[L6] ack inseguro se bloquea (used false)', r.used === false && r.ack === null);
  } finally { global.fetch = realFetch; }
}

function MODES_OFF() { return 'off'; }

console.log(`\n── Resumen listener: ${passed} ok, ${failed} fallos ──`);
process.exit(failed === 0 ? 0 : 1);
