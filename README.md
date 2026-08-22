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
- `test/test-slm-runtime.mjs`: 19/19 invariantes.
- `test/test-slm-benchmark.mjs`: 12/12 invariantes.

**No está desplegado todavía.** La producción sigue usando la UI anterior y no
descarga ningún modelo.

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
- `auto`: intenta el SLM solo si hay WebGPU y loader disponible.
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
  → WebLLM (opcional)
  → articulator.js
  → vocabulario, números, ejes y fronteras verificadas
  → shadow: plantilla / live: prosa validada
```

Un candidato que omite la frontera clínica, cambia valores, añade números,
introduce vocabulario prohibido o falla al cargar nunca se entrega tal cual al
paciente. Se usa el fallback determinista.

### Costos

En modo local no hay costo de tokens por paciente. Sí existen costos de
transferencia inicial del modelo, hosting/CDN, memoria, batería, soporte y
mantenimiento. WebLLM cachea artefactos después de la primera descarga, pero esa
primera carga puede ser significativa.

### Pendientes explícitos antes de producción

1. **Validar el artefacto del modelo:** el catálogo WebLLM `0.2.84` sí contiene
   `Llama-3.2-1B-Instruct-q4f32_1-MLC` (163 registros inspeccionados), pero aún
   falta medir su descarga real, memoria y latencia. Cambiarlo solo mediante
   `modelId` versionado.
2. **Dejar de depender de `esm.run`:** empaquetar y auto-hospedar WebLLM, sus
artefactos y el worker; añadir hashes/SRI y una CSP compatible.
3. **Matriz móvil:** probar Chrome Android, Safari iPhone, equipos con poca RAM,
WebGPU ausente y pérdida de contexto del worker.
4. **Medir rendimiento:** primera carga, primer token, latencia por turno, memoria,
batería, calentamiento y abandono.
5. **Ampliar el benchmark:** añadir respuestas coloquiales, errores ortográficos,
multilingüismo, intentos de prompt injection y claims clínicos fronterizos.
6. **Cerrar la cobertura semántica:** el gate actual protege números, ejes,
fronteras y vocabulario; antes de `live` hay que añadir una verificación más
estricta de que el modelo no agregue afirmaciones nuevas aunque sean palabras
permitidas.
7. **Definir consentimiento y UX:** explicar la descarga, el procesamiento local,
el almacenamiento de caché y la opción de continuar sin SLM.
8. **Telemetría de producto:** la actual es local y no contiene PII; cualquier
telemetría remota requerirá diseño de privacidad, consentimiento y minimización.
9. **Cache-busting/deploy:** ejecutar `python3 scripts/bump-cache.py`, revisar los
hashes de todos los scripts y hacer smoke test de producción antes de publicar.
10. **No activar `exposure: live`** hasta que los puntos anteriores tengan evidencia.

### Referencias técnicas

- [WebLLM](https://webllm.mlc.ai/docs/)
- [WebLLM — uso básico y carga de modelos](https://webllm.mlc.ai/docs/user/basic_usage.html)
- [WebLLM — Workers y caché](https://webllm.mlc.ai/docs/user/advanced_usage.html)
- [Transformers.js — WebGPU y cuantización](https://huggingface.co/docs/transformers.js/en/index)
