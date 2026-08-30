# Optimización Pendiente — Mapa de Señales (Vitametric)

**Status:** Backlog pendiente de atención (no trabajado en sprint actual)  
**Última revisión:** 2026-08-21  
**Propósito:** Catalogar todos los vectores de mejora identificados para el motor de evaluación celular, para que sean visibles y prioritarios sin saturar el flujo actual.

---

## Vectores de Optimización Identificados

| # | Vector | Descripción |Estado | Dueño | Próximo paso |
|---|---|---|---|---|---|
| 1 | **Ortogonalidad pura de items** | Quitar `cross-axis weights` de items `BASE_DIMENSIONS` → cada chip weightea SOLO su eje padre. Quita ruido cruzado y permite calibrar thresholds sobre sintomatología real. | **Completado** (2026-08-24) | freebuff | YA estaba ortogonal al leer el código (23/23 items single-axis). Los cross-axis restantes son de `CONDITIONAL_DIMENSIONS` por diseño y no se tocan. Commit: N/A (ya resuelto). |
| 2 | **Email gate + progreso guardado opcional** | Captura leads que abandonan antes del veredicto; guardar state en servidor (solo scores + step, sin PII). Drop-off tracking. | **Completado** (2026-08-24) | freebuff | Implementado: `js/email-gate.js`, prompt no bloqueante al resultado, Formspree endpoint f/xykqnebq, localStorage TTL 30d. Commit: `8da2dc7`. |
| 3 | **Analytics servidor-side** | POST endpoint con `globalChargeScore + riskLevel + axisScores vector` → funnel real (drop-off, completación por eje, tiempo de test). Hoy solo hay gtag client-only. | **Completado** (2026-08-24) | freebuff | Implementado: `js/analytics-beacon.js`, eventos de funnel (start/question/result/CTA/abandon/email), sendBeacon + cola de respaldo. Commit: `8da2dc7`. |
| 4 | **Framework A/B testing formal** | Router que sirve `variant: 'v1'` vs `'v2'` y compara conversión/retention sin afectar tráfico productivo. `SCORING_CONFIG` ya es declarativo, pero falta el router de variantes. | **Completado** (2026-08-24) | freebuff | Implementado: `js/ab-router.js`, variantes v1/v2 con pesos 50/50, SCORING_CONFIG aplica overrides. 2 invariantes nuevos (engine 49/49). Commit: `8da2dc7`. |
| 5 | **i18n / multi-idioma** | Extraer copy a JSON de recursos + selector de idioma (es/en). Header cita NOM-051 (méxico) → versión English también reguladoramente útil. | **Completado** (2026-08-24) | freebuff | Implementado: `js/i18n.js` (158 claves es↔en), wiring en chat UI + engine, lang switcher con persistencia localStorage, metadata localizada. Commit: `8da2dc7`. |
| 6 | **Integración con datos ES-Complex** | Importar resultados de escaneo (pesos ipH, VSS, etc.) como `baselineWeights` → motor pasa de quiz aislado a herramienta de monitoreo longitudinal: "score actual vs baseline de 3 meses atrás". | **Completado** (2026-08-24) | freebuff | Implementado: `js/escomplex-baseline.js`, schema JSON, validador, compare(), UI collapsible, engine.setBaseline(), chat session baselineComparison. 4 invariantes nuevos (engine 49/49). RTF extractor queda como tarea separada (ejecución solo en Lenovo). Commit: `8da2dc7`. |
| 7 | **Modo "solo lectura / sin ramificación"** | Kiosco/presentación: saltea branching, muestra 5 dimensiones secuencia fija. Útil para charlas o congresos sin riesgo de respuestas inesperadas. | **Completado** (2026-08-24) | freebuff | Implementado: `?mode=kiosk` en mapa-de-senales-chat.html, `enableKioskMode()` en engine, `createSession({kiosk:true})` en chat. 43/43 invariantes engine + 15/15 suites. Commit: `fda7120`. |
| 8 | **Validación de respuestas en tiempo real** | Límite "máximo items por dimensión" o "mínimo X items/dimensión para que cuente score" evita perfiles inflados (usuario marca 5/5 de un eje y el score sube artificialmente). | **Completado** (2026-08-24) | freebuff | Implementado: `ANSWER_LIMITS.maxSelectablePerDim` (cap informativo), `lowCountAxes` + `cappedAxes` en payload, cap `MAX_ITEMS_PER_AXIS` en chat. 43/43 engine invariant + 15/15 suites. Commit: `fda7120`. |
| 9 | **Service Worker (`sw.js`) — Offline-First & Background Sync** | Service Worker registrado para cacheo agresivo *offline-first* de assets estáticos, lógica del test y ejecución 100% desconectada, con cola de sincronización en segundo plano (*Background Sync API*) para telemetría, beacons y envío diferido de formularios. | **Pendiente** | Por asignar | Diseñar `sw.js` (Workbox/Vanilla), estrategia Stale-While-Revalidate/Cache-First, precaché de assets del motor de evaluación, y cola en IndexedDB para Background Sync diferido. |

---

## Leyenda de Estados

- **Pendiente:** Identificado y documentado, sin iniciar en el sprint actual.
- **En progreso:** Trabajo activo en la chunk actual.
- **Completado:** Implementado y validado (tests PASSED).
- **Descartado:** Evaluado y determinado que no aporta valor neto sobre el actual.

---

**Notas:**

- Este backlog surge del análisis crítico conjunto entre opencode y agy-b (2026-08-21).
- El vector #1 (Ortogonalidad pura) es la prioridad crítica para el sprint actual; los demás se atenderán en sucesivas iteraciones.
- Cada vector tiene dueño asignado y TTL de revisión (90 días desde registro).
- **Handovers emitidos (2026-08-24):** `handover-freebuff-motor-test-celular.md` (vectores 1, 7, 8) y `handover-opencode-specs-funnel-escomplex.md` (vectores 2, 3, 4, 5, 6 + RTF extractor, ejecución solo en Lenovo).
- Ver también: `wiki/proyectos/vitametric/WIKI.md` (esquema del wiki), `AGENT_SIGNAL.md` (historial de señales cross-agente).