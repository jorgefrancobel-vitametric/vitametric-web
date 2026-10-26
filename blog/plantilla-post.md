---
title: "Título del post (H1 corto, orientado a pregunta real)"
slug: "slug-corto-con-guiones"
date: "2026-10-19"
updated: ""
description: "Resumen de 1 línea para meta description (≤155 caracteres), orientado a la pregunta que quiere responder."
---

<!-- CANON de un post. Reglas:
     - YAML frontmatter: title, slug, date (ISO), description. `updated` opcional.
     - El primer `## ` del cuerpo es el H1 renderizado.
     - Un único bloque ```faq con JSON array de {q, a}. Se compila a JSON-LD FAQPage.
       Mínimo 1, máximo 5 pares. Cada `a` debe bastarse a sí misma (AEO: Google/AI
       extraen la respuesta SIN contexto circundante).
     - Cerrar con el disclaimer de salud (ya lo trae la plantilla; no lo elimines).
     - P2: SIN cifras de oferta (precios, %, promo) fuera de páginas de producto.
-->

## H1 del Post (título largo legible)

Párrafo de apertura: la pregunta concreta que el post responde, en primera línea
de contenido. Los motores AEO cortan aquí (los primeros ~50 caracteres de
respuesta son los que citan cuando la respuesta es directa).

Párrafo de desarrollo: argumento, mecanismo, dato. Sin promesas clínicas
(cláusula de estilo: exponer como argumento preventivo, no como diagnóstico).

- Punto clave 1.
- Punto clave 2.
- Punto clave 3.

Cierre breve: qué hacer con esta información hoy (llamado suave, sin precio).

```faq
[
  {"q": "Pregunta que la gente escribe tal cual en Google",
   "a": "Respuesta completa en 1-2 frases, autosuficiente, sin depender del post."},
  {"q": "Segunda pregunta",
   "a": "Segunda respuesta autosuficiente."}
]
```

*Este material es informativo y educativo; no busca diagnóstico, tratamiento ni
sustituye la valoración de un profesional de la salud.*
