# Vitametric Web

## SLM local: WebLLM + WebGPU

La autoevaluación conversacional tiene una integración progresiva de un modelo de
lenguaje pequeño en navegador. El modelo es **articulador**, no motor clínico:
Rasch, branching, interpretación, claims y límites siguen siendo deterministas.

### Estado actual — 2026-08-22

- `js/articulator.js`: doble gate para plantillas y adaptadores SLM.
- `js/slm-runtime.js`: runtime asíncrono con modos `off`, `auto` y `on`.
- `js/slm-webllm-loader.js`: loader experimental de WebLLM `0.2.84`, con Web Worker.
- `mapa-de-senales-chat.html`: carga el runtime, pero el modo predeterminado es `off`.
- `test/slm-benchmark-cases.json`: corpus sintético sin PII.
- `test/test-slm-runtime.mjs`: invariantes del runtime y degradación.
- `test/test-slm-benchmark.mjs`: invariantes del contrato.

**Estado de despliegue:** el scaffold está publicado en producción, pero conserva
`mode: off`; ningún paciente descarga el modelo sin una decisión explícita. Desde
2026-08-22 el chat ofrece una **tarjeta de consentimiento** no bloqueante al
primer acceso: explica la descarga local (~600 MB, en caché), el procesamiento en
dispositivo (WebGPU, nada sale del navegador), la opción de texto libre on-device y
la posibilidad de continuar con plantillas verificadas. Solo al aceptar pasa a
`mode: auto` + `exposure: live` y se carga el modelo; la elección persiste en
`localStorage`. Con `window.VitametricSLMConfig` (dev) se omite el flujo.

### Modos

```js
// Configuración de prueba local; no se recomienda exponer `live` todavía.
localStorage.setItem('vitametric_slm_config_v1', JSON.stringify({
  mode: 'on',
  modelId: 'Llama-3.2-1B-Instruct-q4f32_1-MLC',
  exposure: 'shadow',
  telemetry: true
}));
```

- `off`: ruta determinista, valor predeterminado.
- `auto`: intenta el SLM solo si hay WebGPU, contexto seguro y loader disponible.
- `on`: intenta cargarlo aunque el entorno no tenga WebGPU; el loader puede fallar
y el runtime cae a plantillas.
- `exposure: shadow`: evalúa la respuesta del modelo, pero el paciente siempre ve
la plantilla verificada.
- `exposure: live`: permite mostrar la prosa del modelo solo después de cerrar la
validación de seguridad, rendimiento y contenido.

Para volver al comportamiento original:

```js
localStorage.removeItem('vitametric_slm_config_v1');
```

### Flujo de seguridad

```text
turn determinista
  → claims autorizados + valores bloqueados
  → slots protegidos [[SLOT_N]]
  → WebLLM edita solo el lenguaje libre
  → reinyectar slots literalmente
  → articulator.js
  → vocabulario, números, ejes y fronteras verificadas
  → shadow: plantilla / live: prosa validada
```

La segunda iteración reduce la tarea del modelo: ya no tiene que recordar ni
reconstruir cifras, ejes o fronteras clínicas. El loader los reemplaza por slots,
exige que cada slot aparezca exactamente una vez y reinyecta el texto original
antes del doble gate. Si el modelo omite, duplica o deja un slot, la salida queda
vacía y el runtime usa la plantilla.

La tercera iteración añade un gate semántico mínimo para preguntas: la
reformulación debe conservar la forma interrogativa y suficientes anclajes del
texto base (dos cuando la pregunta tiene contenido suficiente, uno en preguntas
cortas). También se bloquean recomendaciones o lenguaje de acción no presentes
en la fuente. Esto no pretende hacer NLU; evita que una reformulación fluida
cambie el asunto, como convertir apretamiento mandibular en una recomendación
dental.

El runtime también tiene un timeout de inferencia de 8 segundos. Si WebGPU, el
worker o el modelo tardan más, el turno no queda bloqueado: se muestra la
plantilla determinista y la telemetría local cuenta `model_timeout` y
`model_fallback`, sin guardar el texto generado.

Un candidato que omite la frontera clínica, cambia valores, añade números,
introduce vocabulario prohibido, cambia el asunto de una pregunta, excede el
timeout o falla al cargar nunca se entrega tal cual al paciente. Se usa el
fallback determinista.

### Medición real de la beta

La primera carga se ejecutó en un Chrome 150 aislado con perfil persistente,
WebGPU y HTTPS, sin datos personales:

- `Llama-3.2-1B-Instruct-q4f32_1-MLC`: `0% → 100%` en aproximadamente **5m35s**.
- Caché WebLLM al finalizar: **615,367,936 bytes** y **22/22 shards**.
- Inferencia de framing: aproximadamente **1.3s**; inferencia de resultado:
  aproximadamente **2.5s**.
- `exposure: shadow`: la salida candidata nunca se mostró; la UI conservó la
  plantilla determinista.
- La primera versión del prompt produjo negativas genéricas y omitió claims en
  algunos contratos; esos candidatos quedaron bloqueados por los gates.
- La segunda iteración, probada en producción con el mismo perfil persistente,
  completó 11 turnos sintéticos: **10 `model_shadow_pass` y 1 fallback**. La
  conversación llegó a 10 preguntas y resultado sin romper el flujo. Aun así,
  debe repetirse en móviles y con casos adversariales antes de considerar `live`.

Esta medición corresponde a un equipo de escritorio de prueba y **no representa
el rendimiento de un teléfono**.

### Costos

En modo local no hay costo de tokens por paciente. Sí existen costos de
transferencia inicial del modelo, hosting/CDN, memoria, batería, soporte y
mantenimiento. WebLLM cachea artefactos después de la primera descarga, pero esa
primera carga puede ser significativa.

### Pendientes explícitos antes de producción

1. **Validar el artefacto del modelo en dispositivos objetivo:** el catálogo
   WebLLM `0.2.84` contiene `Llama-3.2-1B-Instruct-q4f32_1-MLC` y la descarga real
   ya completó en un Chrome de escritorio. Falta repetir la medición en móviles;
   cambiarlo solo mediante `modelId` versionado.
2. **Dejar de depender de `esm.run`:** empaquetar y auto-hospedar WebLLM, sus
   artefactos y el worker. El loader `slm-webllm-loader.js` ahora acepta una URL de
   módulo configurable: se lee primero de `window.VitametricSLMConfig?.webllm` y
   luego de `localStorage.getItem('vitametric_slm_webllm_config_v1')`; si ninguno
   está fijado, usa el fallback `https://esm.run/@mlc-ai/web-llm@0.2.84`. Al
   auto-hospedarse, se deben añadir **hashes SRI** al tag `<script>` que carga el
   módulo (atributo `integrity` con valor SHA-384) y una meta CSP compatible para
   evitar ejecuciones no autorizadas. Los artefactos y los pesos del modelo
   (aprox. 600 MB después de la primera carga, 22 *shards*) **no se deben incluir
   en el repositorio de GitHub Pages** por los límites de tamaño y ancho de banda;
   en su lugar, se hospedan en un bucket R2 u otro almacenamiento compatible con CORS
   y SRI, y el `moduleUrl` se configura al iniciar el runtime mediante
   `localStorage.setItem('vitametric_slm_module_url_v1', 'https://...')` o bien se
   establece `window.VitametricSLMConfig` con `moduleUrl` apuntando a la ubicación
   hospedada. Véase la sección de **Costos** para más detalles.

 3. **Matriz móvil:** probar Chrome Android, Safari iPhone, equipos con poca RAM,
    WebGPU ausente y pérdida de contexto del worker.
3. **Matriz móvil:** probar Chrome Android, Safari iPhone, equipos con poca RAM,
   WebGPU ausente y pérdida de contexto del worker.
4. **Medir rendimiento móvil:** primera carga, primer token, latencia por turno,
   memoria, batería, calentamiento y abandono.
5. **Ampliar el benchmark:** añadir respuestas coloquiales, errores ortográficos,
   multilingüismo, intentos de prompt injection, negativas genéricas y claims
   clínicos fronterizos; incluir latencias y timeouts de inferencia.
 6. **Cerrar la cobertura semántica:** el gate protege números, ejes, fronteras,
    vocabulario, slots, negativas genéricas y anclajes mínimos de preguntas. **Desde
    2026-08-22 el anclaje temático también cubre turnos no-pregunta** (FRAMING,
    REFLECTION, RESULT) en `articulator.js: topicAnchorCheck`, de modo que el SLM no
    puede desviar el asunto ni colar recomendaciones fuera del contrato. Pendiente de
    medición: tasa de reformulaciones válidas en un corpus amplio y calidad percibida.

 7. **Definir consentimiento y UX:** ~~explicar la descarga, el procesamiento local,
 el almacenamiento de caché y la opción de continuar sin SLM~~ **implementado
 (2026-08-22)** en `triage-chat-ui.js` + `mapa-de-senales-chat.html` (tarjeta de
 consentimiento no bloqueante; activación `auto`/`live` solo tras aceptación).
8. **Telemetría de producto:** la actual es local y no contiene PII; cualquier
   telemetría remota requerirá diseño de privacidad, consentimiento y minimización.
   **Diseño propuesto:**
   - Datos que se podrían telemetrizar (siempre sin PII): número de sesiones,
     tiempo promedio por sesión, características del dispositivo (modelo, versión
     del navegador, RAM disponible aprox.), aciertos/falles de los gates del
     articulador, tasa de fallback a plantillas.
   - El consentimiento para telemetría remota debe ser **explicito y separado** del
     consentimiento para el asistente local. El usuario debe poder opt-in y opt-out
     de forma independiente.
   - La telemetría nunca debe incluir contenido del paciente, respuestas textuales,
     ni datos de salud identificables. Solo métricas agregadas y anonimatizadas.
   - Almacenamiento temporal en el dispositivo (máx. 24h) con opción de borrado
     manual. No hay almacenamiento en servidores externos salvo consentimiento
     explícito y diseños de cumplimiento (GDPR, LGPD, etc.).
   - Diseño de minimización: solo se guardan las métricas estrictamente necesarias
     para la mejora del producto, excluyendo cualquier dato que no sea esencial.

 9. **Cache-busting/deploy:** ya se verificó el despliegue del scaffold; repetir el
   procedimiento tras cada cambio y hacer smoke test de producción.
 10. **No activar `exposure: live`** hasta que los puntos anteriores tengan evidencia.

### Nota de auto-hospedaje

El loader `slm-webllm-loader.js` ahora soporta una URL de módulo configurable.
Fíjela en `window.VitametricSLMConfig?.webllm` o en
`localStorage.setItem('vitametric_slm_webllm_config_v1', JSON.stringify({
  moduleUrl: 'https://mi-cdn.example.com/web-llm-0.2.84.js',
  sriHash: 'sha384-<hash>'   // hash de integridad del script tag correspondiente
}))`. Cuando `moduleUrl` apunte a un servidor propio, el desarrollador debe
incluir el script con un atributo `integrity` SHA-384 que coincida con el hash
del archivo servido, y establecer una meta CSP `Content-Security-Policy` que
permita la ejecución desde ese dominio. Los pesos del modelo (≈600 MB, 22 *shards*)
no deben comprometerse en el repositorio de GitHub Pages; en su lugar, servirlos
desde un bucket R2 u otro almacenamiento compatible con CORS y SRI.

### Referencias técnicas

- [WebLLM](https://webllm.mlc.ai/docs/)
- [WebLLM — uso básico y carga de modelos](https://webllm.mlc.ai/docs/user/basic_usage.html)
- [WebLLM — Workers y caché](https://webllm.mlc.ai/docs/user/advanced_usage.html)
- [Transformers.js — WebGPU y cuantización](https://huggingface.co/docs/transformers.js/en/index)
