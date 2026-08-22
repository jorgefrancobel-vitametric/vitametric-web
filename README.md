# Vitametric Web

## SLM local: WebLLM + WebGPU

La autoevaluación conversacional tiene una integración progresiva de un modelo de
lenguaje pequeño en navegador. El modelo es **articulador**, no motor clínico:
Rasch, branching, interpretación, claims y límites siguen siendo deterministas.

### Estado actual — 2026-08-22

- `js/articulator.js`: doble gate para plantillas y adaptadores SLM.
- `js/slm-runtime.js`: runtime asíncrono con modos `off`, `auto` y `on`.
- `js/slm-webllm-loader.js`: loader experimental de WebLLM `0.2.84`, con Web Worker.
- `test-celular-chat.html`: carga el runtime, pero el modo predeterminado es `off`.
- `test/slm-benchmark-cases.json`: corpus sintético sin PII.
- `test/test-slm-runtime.mjs`: invariantes del runtime y degradación.
- `test/test-slm-benchmark.mjs`: invariantes del contrato.

**Estado de despliegue:** el scaffold está publicado en producción, pero conserva
`mode: off`; ningún paciente descarga el modelo sin configurar explícitamente el
feature flag en su propio navegador.

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

Un candidato que omite la frontera clínica, cambia valores, añade números,
introduce vocabulario prohibido o falla al cargar nunca se entrega tal cual al
paciente. Se usa el fallback determinista.

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
artefactos y el worker; añadir hashes/SRI y una CSP compatible.
3. **Matriz móvil:** probar Chrome Android, Safari iPhone, equipos con poca RAM,
   WebGPU ausente y pérdida de contexto del worker.
4. **Medir rendimiento móvil:** primera carga, primer token, latencia por turno,
   memoria, batería, calentamiento y abandono.
5. **Ampliar el benchmark:** añadir respuestas coloquiales, errores ortográficos,
   multilingüismo, intentos de prompt injection, negativas genéricas y claims
   clínicos fronterizos.
6. **Cerrar la cobertura semántica:** el gate protege números, ejes, fronteras,
   vocabulario, slots y ahora rechaza negativas genéricas; antes de `live` hay que
   medir la tasa de slots válidos, verificar que no se agreguen afirmaciones nuevas
   aunque sean palabras permitidas y evaluar la calidad de las reformulaciones.

7. **Definir consentimiento y UX:** explicar la descarga, el procesamiento local,
el almacenamiento de caché y la opción de continuar sin SLM.
8. **Telemetría de producto:** la actual es local y no contiene PII; cualquier
telemetría remota requerirá diseño de privacidad, consentimiento y minimización.
9. **Cache-busting/deploy:** ya se verificó el despliegue del scaffold; repetir el
   procedimiento tras cada cambio y hacer smoke test de producción.
10. **No activar `exposure: live`** hasta que los puntos anteriores tengan evidencia.

### Referencias técnicas

- [WebLLM](https://webllm.mlc.ai/docs/)
- [WebLLM — uso básico y carga de modelos](https://webllm.mlc.ai/docs/user/basic_usage.html)
- [WebLLM — Workers y caché](https://webllm.mlc.ai/docs/user/advanced_usage.html)
- [Transformers.js — WebGPU y cuantización](https://huggingface.co/docs/transformers.js/en/index)
