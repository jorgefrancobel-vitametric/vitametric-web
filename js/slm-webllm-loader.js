// G-Level: L1
// Sustrato: Adaptador de Integración
// Función: Loader experimental de WebLLM para el articulador Vitametric. Descarga
//          diferida, worker aislado y modelo configurable; no se activa por defecto.
// v-version: 20260822.01

/**
 * Este archivo no descarga WebLLM al abrir la página. Solo registra un loader que
 * el Runtime invoca si el feature flag está activo. La versión está fijada para
 * hacer reproducible la beta; antes de producción debe auto-hospedarse y verificarse
 * con hash/SRI, porque un import remoto dinámico no es la política final de supply
 * chain.
 */

(function installWebLLMLoader() {
  'use strict';

  const WEBLLM_VERSION = '0.2.84';
  const MODULE_URL = `https://esm.run/@mlc-ai/web-llm@${WEBLLM_VERSION}`;
  const DEFAULT_MODEL = 'Llama-3.2-1B-Instruct-q4f32_1-MLC';
  const MAX_TOKENS = 180;
  let enginePromise = null;
  let workerUrl = null;

  function promptFor({ turn, claims, locked }) {
    const boundaries = claims
      .filter((claim) => claim && claim.evidence === 'NOT_OBSERVABLE')
      .map((claim) => claim.text);
    return [
      'Eres un articulador de lenguaje en español para una autoevaluación no diagnóstica.',
      'Reformula con calidez y brevedad, sin añadir datos, diagnósticos, mediciones ni recomendaciones.',
      'Conserva literalmente todos los valores bloqueados y las fronteras de seguridad.',
      'Devuelve únicamente el texto final dirigido a la persona.',
      `Valores bloqueados: ${JSON.stringify(locked)}`,
      `Claims autorizados: ${JSON.stringify(claims.map((claim) => claim.text))}`,
      `Fronteras obligatorias: ${JSON.stringify(boundaries)}`,
      `Turno base: ${JSON.stringify(turn.text || '')}`
    ].join('\n');
  }

  function createWorker() {
    if (workerUrl) return new Worker(workerUrl, { type: 'module' });
    const source = [
      `import { WebWorkerMLCEngineHandler } from '${MODULE_URL}';`,
      'const handler = new WebWorkerMLCEngineHandler();',
      'self.onmessage = (event) => handler.onmessage(event);'
    ].join('\n');
    workerUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    return new Worker(workerUrl, { type: 'module' });
  }

  async function load({ modelId, onProgress }) {
    const selectedModel = modelId || DEFAULT_MODEL;
    if (!enginePromise) {
      enginePromise = (async () => {
        const webllm = await import(MODULE_URL);
        const worker = createWorker();
        return webllm.CreateWebWorkerMLCEngine(worker, selectedModel, {
          initProgressCallback: (report) => {
            if (typeof onProgress !== 'function') return;
            // WebLLM reports text such as "Fetching param cache" and may expose
            // progress as a number in different versions. Only forward numbers.
            if (typeof report === 'number') onProgress(report);
            else if (report && typeof report.progress === 'number') onProgress(report.progress);
          }
        });
      })();
    }

    const engine = await enginePromise;
    return {
      async articulate({ turn, claims, locked }) {
        const response = await engine.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: 'No inventes. Respeta exactamente el contrato y responde en español.'
            },
            { role: 'user', content: promptFor({ turn, claims, locked }) }
          ],
          temperature: 0.15,
          max_tokens: MAX_TOKENS
        });
        return response?.choices?.[0]?.message?.content || '';
      }
    };
  }

  // El Runtime lo consume solo cuando mode=auto/on y tiene un loader disponible.
  // En una página sin WebLLM o con CSP restrictiva, el resto del chat no se rompe.
  window.VitametricSLMLoader = load;
  window.VitametricSLMWebLLM = Object.freeze({
    version: WEBLLM_VERSION,
    defaultModel: DEFAULT_MODEL,
    moduleUrl: MODULE_URL
  });
}());
