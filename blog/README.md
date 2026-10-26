# Blog Vitametric — Capa 3 AEO/GEO

Pipeline de publicación del blog de vitametric.com. Los posts se autorizan en
**Markdown canónico** (`blog/md/`) y se compilan a **HTML estático** con JSON-LD
(`Article` + `FAQPage`) para búsqueda clásica (SEO) y motores de respuesta
(AEO/GEO: Perplexity, AI Overviews, ChatGPT/Copilot browsing).

## Estructura

```
blog/
  README.md             ← este archivo
  _layout.html          ← plantilla base (header/footer, placeholders {{title}}, {{content}}, {{jsonld}})
  plantilla-post.md     ← plantilla de nota para el agente/editor humano
  md/                   ← CANON: un .md por post (YAML frontmatter + bloque ```faq)
  index.html            ← índice público del blog (ItemList)
  <slug>.html           ← posts compilados (generados, NO editar a mano)
```

## Cómo publica el agente (CMC) o el humano

1. Copiar `plantilla-post.md` a `blog/md/<slug>.md`, editar contenido y FAQ.
2. Compilar: `node scripts/build-blog.mjs` — genera `blog/<slug>.html`, actualiza `blog/index.html`.
3. Añadir la URL del post a `sitemap.xml` (el build lo checklistea).
4. Validar: `node test/test-blog.mjs` — debe pasar antes de commit/deploy.

## Reglas no negociables del contenido (política de compuerta)

- **P2 — canales digitales SIN cifras de oferta**: prohibido citar precios,
  porcentajes de descuento o promociones (`2,995`, `5,990`, `50 %`, etc.)
  fuera de páginas de producto/bases oficiales. El test lo exige.
- Todo post cierra con el disclaimer de salud («información educativa, no
  sustituye la consulta clínica»). Coherente con COFEPRIS.
- Sin afirmaciones diagnósticas terapéuticas nuevas: tono del post seed =
  medicina preventiva expuesta como argumento, no como promesa clínica.

## Nota de infraestructura

- No hay framework: el build es Node puro (`node scripts/build-blog.mjs`),
  sin dependencias. El host es GitHub Pages (`.nojekyll`, CNAME absolutos).
- Cada post es una URL plana (`/blog/<slug>.html`) — cache-busting se hereda
  de las convenciones del repo (`?v=` en assets internos).
