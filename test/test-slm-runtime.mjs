// G-Level: L1
// Sustrato: Script Test
// Función: Falsadores de las Fases 1–3 del runtime SLM: apagado, carga opcional,
//          doble gate, fallback y telemetría local sin datos del paciente.
// v-version: 20260822.01

import ArticulatorModule from '../js/articulator.js';
import SLM from '../js/slm-runtime.js';

const { Articulator } = ArticulatorModule;
const { MODES, STATUS, EXPOSURE, Runtime, LocalTelemetry } = SLM;

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
      {
        text: 'El área con más carga es Calidad de Sueño: 11 de 100.',
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

console.log('\n── F1 · Fallback y contrato ──');

{
  const runtime = new Runtime({
    articulator: new Articulator(),
    config: { mode: MODES.OFF, telemetry: true },
    loader: async () => { throw new Error('no debe cargarse'); },
    capabilities: { webgpu: true, secureContext: true }
  });
  const prepared = await runtime.prepare();
  const out = await runtime.articulate(turn());
  check('[F1] modo apagado no carga ningún modelo', prepared.status === STATUS.DISABLED);
  check('[F1] el chat sigue funcionando sin SLM', out.runtimeStatus === STATUS.DISABLED && out.usedModel === false);
  check('[F1] el texto del SLM no es requisito para terminar', typeof out.text === 'string' && out.text.includes('11 de 100'));
  check('[F1] la telemetría local no contiene texto del paciente', !JSON.stringify(runtime.snapshot()).includes('reportaste'));
}

console.log('\n── F1 · Carga opcional ──');

{
  const honestModel = {
    async articulate() {
      return 'Según lo que reportaste, el área con más carga es Calidad de Sueño: 11 de 100. '
        + 'Medir qué ocurre físicamente en tu cuerpo requiere el estudio en clínica; esta conversación no lo sustituye.';
    }
  };
  const runtime = new Runtime({
    articulator: new Articulator(),
    config: { mode: MODES.ON, modelId: 'test-model', exposure: EXPOSURE.SHADOW, telemetry: true },
    loader: async ({ modelId, onProgress }) => {
      check('[F1] el loader recibe el modelo seleccionado', modelId === 'test-model');
      onProgress(0.5);
      onProgress(1);
      return honestModel;
    },
    capabilities: { webgpu: true, secureContext: true }
  });
  const prepared = await runtime.prepare();
  const out = await runtime.articulate(turn());
  check('[F1] un adaptador válido llega a READY', prepared.status === STATUS.READY);
  check('[F1] un SLM válido pasa por articulator en shadow', out.ok && !out.usedModel && out.shadowEvaluated === true && out.runtimeStatus === STATUS.READY);
  check('[F1] shadow no expone la prosa del modelo', out.text.startsWith('Esto es un resumen'));
  check('[F1] se conserva el valor autorizado', out.text.includes('11 de 100'));
  check('[F1] se conserva la frontera clínica', out.text.includes('no lo sustituye'));
  check('[F1] se conserva el progreso de carga', prepared.progress === 1);
}

console.log('\n── F1 · Degradación adversarial ──');

{
  const runtime = new Runtime({
    articulator: new Articulator(),
    config: { mode: MODES.ON, exposure: EXPOSURE.LIVE, telemetry: true },
    loader: async () => ({
      async articulate() {
        return 'Calidad de Sueño: 11 de 100 y 99 de 100. Tu ipH está alterado.';
      }
    }),
    capabilities: { webgpu: true, secureContext: true }
  });
  await runtime.prepare();
  const out = await runtime.articulate(turn());
  check('[F1] salida adversarial queda bloqueada', out.ok === false && out.blocked === true);
  check('[F1] el fallback sí llega como texto seguro', typeof out.text === 'string' && out.text.includes('11 de 100'));
  check('[F1] el candidato bloqueado nunca llega al paciente', !out.text.includes('99 de 100') && !out.text.includes('ipH'));
  check('[F1] registra model_fallback sin guardar el prompt',
    out.runtimeStatus === STATUS.READY
      && runtime.snapshot().telemetry.model_fallback === 1
      && !('prompt' in runtime.snapshot().telemetry));
}

console.log('\n── F3 · Feature flag y compatibilidad ──');

{
  const runtime = new Runtime({
    articulator: new Articulator(),
    config: { mode: MODES.AUTO },
    loader: async () => ({ articulate: () => '' }),
    capabilities: { webgpu: false, secureContext: true }
  });
  const prepared = await runtime.prepare();
  check('[F3] AUTO no activa SLM sin WebGPU', prepared.status === STATUS.UNAVAILABLE);
  check('[F3] AUTO conserva el flujo determinista', (await runtime.articulate(turn())).usedModel === false);

  const insecure = new Runtime({
    articulator: new Articulator(),
    config: { mode: MODES.AUTO },
    loader: async () => ({ articulate: () => '' }),
    capabilities: { webgpu: true, secureContext: false }
  });
  check('[F3] AUTO no activa SLM fuera de contexto seguro', (await insecure.prepare()).status === STATUS.UNAVAILABLE);
}

console.log('\n── F3 · Telemetría ──');

{
  const telemetry = new LocalTelemetry({ enabled: true, storage: null });
  telemetry.record('model_turn');
  telemetry.record('model_fallback');
  const snapshot = telemetry.snapshot();
  check('[F3] telemetría solo cuenta eventos', snapshot.model_turn === 1 && snapshot.model_fallback === 1);
  check('[F3] telemetría no admite texto arbitrario', !('prompt' in snapshot) && !('answer' in snapshot));
}

const total = passed + failed;
console.log(`\n${failed === 0 ? '🎉' : '🚨'} Runtime SLM: ${passed}/${total} invariantes verdes.`);
if (failed > 0) process.exit(1);
