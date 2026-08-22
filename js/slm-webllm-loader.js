// G-Level: L1
// Sustrato: Adaptador de Integración
// Función: Loader experimental de WebLLM para el articulador Vitametric. Descarga
//          diferida, worker aislado y modelo configurable; no se activa por defecto.
// v-version: 20260822.02

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
  const MAX_TOKENS = 120;
  let enginePromise = null;
  let workerUrl = null;

  function sourceText({ turn, claims }) {
    const claimText = claims
      .filter((claim) => claim && claim.text)
      .map((claim) => claim.text)
      .join(' ');
    return [turn.text || '', claimText].filter(Boolean).join(' ');
  }

  function protectSource(source, protectedValues) {
    const slots = [];
    let text = source;
    [...new Set(protectedValues.filter(Boolean))]
      .sort((a, b) => b.length - a.length)
      .forEach((value) => {
        const marker = `[[SLOT_${slots.length}]]`;
        if (!text.includes(value)) return;
        text = text.split(value).join(marker);
        slots.push({ marker, value });
      });
    return { text, slots };
  }

  function promptFor({ turn, claims, locked }) {
    const mandatory = claims
      .filter((claim) => claim && claim.evidence === 'NOT_OBSERVABLE')
      .map((claim) => claim.text);
    const protectedSource = protectSource(sourceText({ turn, claims }), [
      ...mandatory,
      ...locked
    ]);
    const kind = turn.type === 'QUESTION'
      ? 'Es una pregunta: conserva su intención y los signos de pregunta.'
      : 'Es un mensaje informativo: conserva su sentido y hazlo cálido y breve.';
    const instructions = protectedSource.slots.length > 0
      ? [
        'Edita el TEXTO BASE en español claro y natural.',
        kind,
        'Devuelve solo el texto final dirigido a la persona.',
        'No te disculpes, no expliques tu tarea, no hables de ser un modelo.',
        'No inventes datos, diagnósticos, mediciones ni recomendaciones.',
        'Copia cada marcador [[SLOT_N]] exactamente una vez y no lo traduzcas.'
      ]
      : turn.type === 'QUESTION'
        ? [
          'Reescribe esta pregunta en español claro, natural y cálido.',
          'Devuelve únicamente la pregunta final, sin explicaciones ni disculpas.',
          'Conserva la intención, el sentido y los signos de pregunta.'
        ]
        : [
          'Reescribe este mensaje en español claro, natural y cálido.',
          'Devuelve únicamente el mensaje final, sin explicaciones ni disculpas.',
          'No inventes datos ni recomendaciones.'
        ];
    return {
      prompt: [...instructions, `TEXTO BASE: ${protectedSource.text}`].join('\\n'),
      slots: protectedSource.slots
    };
  }

  function restoreSlots(text, slots, turn) {
    let restored = String(text || '').trim();
    // Un modelo vacío no se convierte en una respuesta válida por anexar slots.
    // Debe caer al fallback determinista antes de reconstruir contenido confiable.
    if (!restored) return '';
    // Algunos modelos pequeños envuelven la respuesta en comillas aunque se les
    // pida texto plano; quitamos solo un par exterior, nunca contenido interno.
    if ((restored.startsWith('"') && restored.endsWith('"'))
      || (restored.startsWith('`') && restored.endsWith('`'))) {
      restored = restored.slice(1, -1).trim();
    }
    // Los valores protegidos viajan como [[SLOT_N]] y se reinyectan literalmente
    // desde los claims (fuente de verdad), no desde la salida del modelo. Un slot
    // omitido puede rescatarse si existe texto editorial; un slot duplicado indica
    // una salida no confiable y fuerza el fallback para no repetir cifras o claims.
    for (const slot of slots) {
      const parts = restored.split(slot.marker);
      const occurrences = parts.length - 1;
      if (occurrences === 0) {
        // El modelo soltó el marcador: anexamos el valor de confianza.
        restored = restored + ' ' + slot.value;
      } else if (occurrences === 1) {
        restored = parts.join(slot.value);
      } else {
        return '';
      }
    }
    // No permitimos que el paciente vea instrucciones o marcadores incompletos.
    if (!restored || /\[\[SLOT_\d+\]\]/.test(restored)) return '';
    // Una pregunta no puede degradarse a una afirmación irrelevante.
    if (turn?.type === 'QUESTION' && /[¿?]/.test(turn.text || '') && !/[¿?]/.test(restored)) {
      return '';
    }
    return restored;
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
        const editorial = promptFor({ turn, claims, locked });
        const response = await engine.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: 'Eres un editor de mensajes en español. Sigue las instrucciones literalmente.'
            },
            { role: 'user', content: editorial.prompt }
          ],
          temperature: 0.05,
          max_tokens: MAX_TOKENS
        });
        return restoreSlots(response?.choices?.[0]?.message?.content || '', editorial.slots, turn);
      },

      // Listener on-device: tarea NO fáctica. Solo ack empático + intención.
      // Nunca afirma datos; el runtime sanitiza la salida de todos modos.
      async listen({ text }) {
        const clean = String(text || '').slice(0, 1000).trim();
        if (!clean) return { ack: null, intent: null };
        const response = await engine.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: 'Eres un acompañante empático de un cuestionario de salud. '
                + 'Responde SOLO con JSON válido, sin texto extra: '
                + '{"ack":"frase corta y cálida en español, máximo 20 palabras, sin datos ni diagnósticos",'
                + '"intent":"duda|agendar|sintoma_nuevo|agudo|otro"}. '
                + 'No inventes datos médicos ni mediciones.'
            },
            { role: 'user', content: clean }
          ],
          temperature: 0.2,
          max_tokens: 120,
          response_format: { type: 'json_object' }
        });
        let parsed = null;
        try {
          parsed = JSON.parse(response?.choices?.[0]?.message?.content || '{}');
        } catch (err) {
          parsed = null;
        }
        return {
          ack: typeof parsed?.ack === 'string' ? parsed.ack : null,
          intent: typeof parsed?.intent === 'string' ? parsed.intent : null
        };
      }
    };
  }

  // El Runtime lo consume solo cuando mode=auto/on y tiene un loader disponible.
  // La tarea del modelo queda reducida a edición lingüística: cifras, ejes y
  // fronteras viajan como slots y se reinyectan literalmente en este adaptador.
  // En una página sin WebLLM o con CSP restrictiva, el resto del chat no se rompe.
  window.VitametricSLMLoader = load;
  window.VitametricSLMWebLLM = Object.freeze({
    version: WEBLLM_VERSION,
    defaultModel: DEFAULT_MODEL,
    moduleUrl: MODULE_URL
  });

  // Exportación para tests unitarios (Node): la reinyección de slots es pura y
  // debe poder verificarse sin navegador.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { protectSource, promptFor, restoreSlots };
  }
}());
