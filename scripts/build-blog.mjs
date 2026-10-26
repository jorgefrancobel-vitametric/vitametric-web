#!/usr/bin/env node
/**
 * build-blog.mjs — Compilador del blog Capa 3 AEO/GEO (sin dependencias).
 *
 * Lee blog/md/*.md (canon, YAML frontmatter + bloque ```faq) y genera:
 *   - blog/<slug>.html  (JSON-LD @graph: Article + FAQPage)
 *   - blog/index.html   (índice con ItemList)
 *
 * Uso: node scripts/build-blog.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BLOG = join(ROOT, 'blog');
const MD = join(BLOG, 'md');
const LAYOUT = readFileSync(join(BLOG, '_layout.html'), 'utf8');

const esc = (s) => String(s)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

function parseFrontmatter(src) {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(src);
  if (!m) throw new Error('falta bloque YAML frontmatter (--- ... ---)');
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = /^(\w+):\s*"?(.*?)"?\s*$/.exec(line.trim());
    if (kv) meta[kv[1]] = kv[2];
  }
  return { meta, body: m[2] };
}

function extractFaq(body) {
  const m = /```faq\n([\s\S]*?)\n```/.exec(body);
  if (!m) throw new Error('falta bloque ```faq');
  const faq = JSON.parse(m[0].replace(/```faq\n|\n```/g, ''));
  if (!Array.isArray(faq) || faq.length < 1 || faq.length > 5) {
    throw new Error('bloque ```faq debe tener entre 1 y 5 pares');
  }
  for (const { q, a } of faq) {
    if (!q || !a) throw new Error('par faq sin q o a');
  }
  const body2 = body.replace(m[0], '').trim();
  return { faq, body: body2 };
}

/** micro-markdown: párrafos, headings, listas, negritas, cursivas, enlaces. */
function md2html(md) {
  const lines = md.split('\n');
  const out = [];
  let inList = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (line === '') { if (inList) { out.push('</ul>'); inList = false; } continue; }
    line = line
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
    if (/^#{2,3}\s+/.test(line)) {
      const depth = line.startsWith('### ') ? 3 : 2;
      out.push(`<h${depth}>${esc(line.replace(/^#{2,3}\s+/, ''))}</h${depth}>`);
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${line.replace(/^[-*]\s+/, '')}</li>`);
    } else if (/^>/.test(line)) {
      out.push(`<blockquote>${line.replace(/^>\s?/, '')}</blockquote>`);
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<p>${line}</p>`);
    }
  }
  if (inList) out.push('</ul>');
  return out.join('\n');
}

function render(jsonldObj, htmlInner) {
  return LAYOUT
    .replace('{{title}}', jsonldObj.meta.title)
    .replace('{{description}}', esc(jsonldObj.meta.description || jsonldObj.meta.title))
    .replaceAll('{{slug}}', jsonldObj.meta.slug)
    .replace('{{jsonld}}', JSON.stringify(jsonldObj.graph, null, 2))
    .replace('{{content}}', htmlInner);
}

function buildPost(file) {
  const src = readFileSync(join(MD, file), 'utf8');
  const { meta, body } = parseFrontmatter(src);
  if (!meta.title || !meta.slug || !meta.date || !meta.description) {
    throw new Error(`${file}: frontmatter incompleto (title, slug, date, description)`);
  }
  const { faq, body: content } = extractFaq(body);
  const dateIso = (meta.updated || meta.date) + 'T08:00:00-06:00';
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `https://vitametric.com/blog/${meta.slug}.html#article`,
        headline: meta.title,
        description: meta.description,
        datePublished: meta.date + 'T08:00:00-06:00',
        dateModified: dateIso,
        author: { '@type': 'Organization', name: 'Vitametric', url: 'https://vitametric.com/' },
        publisher: { '@type': 'Organization', name: 'Vitametric', url: 'https://vitametric.com/' },
        mainEntityOfPage: `https://vitametric.com/blog/${meta.slug}.html`,
        inLanguage: 'es-MX'
      },
      {
        '@type': 'FAQPage',
        '@id': `https://vitametric.com/blog/${meta.slug}.html#faq`,
        mainEntity: faq.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a }
        }))
      }
    ]
  };
  const html = render({ meta, graph }, md2html(content));
  writeFileSync(join(BLOG, `${meta.slug}.html`), html + '\n');
  return meta;
}

function buildIndex(posts) {
  const items = posts.map((p) => `\n      {\n        "@type": "ListItem",\n        "position": ${p.position},\n        "name": "${esc(p.title)}",\n        "url": "https://vitametric.com/blog/${p.slug}.html"\n      }`).join(',');
  const jsonld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': 'https://vitametric.com/blog/index.html#posts',
    name: 'Blog de Vitametric',
    itemListElement: JSON.parse(`[${items}\n  ]`)
  }, null, 2);
  const escTitle = (t) => esc(t);
  const cards = posts.map((p) => `  <article>
    <h2><a href="/blog/${p.slug}.html">${escTitle(p.title)}</a></h2>
    <p><time datetime="${p.date}">${p.date}</time> — ${escTitle(p.description)}</p>
  </article>`).join('\n');
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Blog — Vitametric</title>
<meta name="description" content="Blog de Vitametric: medicina preventiva sin cifras de oferta, explicada en español para Ciudad de México.">
<link rel="canonical" href="https://vitametric.com/blog/index.html">
<meta property="og:type" content="website">
<script type="application/ld+json">
${jsonld}
</script>
<link rel="stylesheet" href="/css/style.css?v=20261019">
<style>
/* Los enlaces dentro de texto (footer) necesitan subrayado: el cian del sitio
   da sólo 1.07:1 contra el gris del párrafo y Lighthouse lo baja a 94. */
footer a { text-decoration: underline; text-underline-offset: 3px; }
</style>
</head>
<body>
<nav aria-label="principal">
  <a href="/">Vitametric</a>
  <a href="/servicios/">Servicios</a>
  <a href="/blog/index.html">Blog</a>
</nav>
<main>
<h1>Blog de Vitametric</h1>
<p>Información sobre herramientas de autoevaluación, procesos de consulta y preguntas para conversar con profesionales de la salud.</p>
${cards}
</main>
<footer>
  <p>Vitametric · Playa Tecolutla 452, Iztacalco, CDMX · <a href="https://wa.me/525585327421">Reservar evaluación</a></p>
</footer>
</body>
</html>
`;
  writeFileSync(join(BLOG, 'index.html'), html);
}

if (!existsSync(MD)) {
  console.error(`no existe ${MD}; crea blog/md/ primero`);
  process.exit(1);
}
const files = readdirSync(MD).filter((f) => f.endsWith('.md'));
const built = [];
for (let i = 0; i < files.length; i++) {
  const meta = buildPost(files[i]);
  built.push({ ...meta, position: i + 1 });
  console.log(`ok: blog/${meta.slug}.html`);
}
buildIndex(built);
console.log(`ok: blog/index.html (${built.length} post(s))`);
