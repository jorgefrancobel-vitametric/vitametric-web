#!/usr/bin/env node
/**
 * test-blog.mjs — Validación del blog Capa 3. Debe pasar antes de commit/deploy.
 * Uso: node test/test-blog.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BLOG = join(ROOT, 'blog');
const MD = join(BLOG, 'md');
const failures = [];
const ok = (cond, msg) => { if (!cond) failures.push(msg); };

// Políticas de contenido (P2 + salud)
const FORBIDDEN_OFFERTA = /(2[,\.]995)|(5[,\.]990)|(50\s*%)|(50\/50)/;
const DISCLAIMER = /informativo y educativo|informativa y educativa|no sustituye la valoración/;
const FORBIDDEN_HEALTH_CLAIMS = /prefiere compensar antes de avisar|alteraciones posturales\s+avanzan asintom|el dolor aparece cuando la compensación|resultado temprano con margen de acción equivale|agenda una lectura funcional completa|revisión preventiva.{0,80}una vez al año/i;

// 1. Canon: frontmatter + faq válido
const slugs = [];
for (const f of readdirSync(MD).filter((x) => x.endsWith('.md'))) {
  const src = readFileSync(join(MD, f), 'utf8');
  ok(/^---\n[\s\S]*?\n---\n/.test(src), `${f}: sin frontmatter`);
  const m = /```faq\n([\s\S]*?)\n```/.exec(src);
  ok(!!m, f + ': sin bloque faq');
  if (m) {
    try {
      const faq = JSON.parse(m[1]);
      ok(Array.isArray(faq) && faq.length >= 1 && faq.length <= 5, f + ': bloque faq fuera de rango 1-5');
      for (const pair of faq) ok(pair.q && pair.a, f + ': par faq incompleto');
    } catch (e) {
      failures.push(f + ': bloque faq JSON invalido (' + e.message + ')');
    }
  }
  ok(!FORBIDDEN_OFFERTA.test(src), `${f}: contiene cifras de oferta prohibidas (P2)`);
  ok(!FORBIDDEN_HEALTH_CLAIMS.test(src), `${f}: contiene una afirmación de salud sin sustento`);
  ok(DISCLAIMER.test(src), `${f}: falta el disclaimer de salud`);
  const slug = /slug:\s*"([^"]+)"/.exec(src)?.[1];
  if (slug) slugs.push(slug);
}

// 2. HTML compilado + JSON-LD válido
for (const slug of slugs) {
  const p = join(BLOG, `${slug}.html`);
  ok(existsSync(p), `${slug}.html: no compilado (corre node scripts/build-blog.mjs)`);
  if (!existsSync(p)) continue;
  const html = readFileSync(p, 'utf8');
  ok(html.includes('application/ld+json'), `${slug}.html: sin JSON-LD`);
  const jld = /<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/.exec(html);
  if (jld) {
    try {
      const g = JSON.parse(jld[1]);
      const types = g['@graph']?.map((x) => x['@type']) || [];
      ok(types.includes('Article') && types.includes('FAQPage'), `${slug}.html: @graph sin Article+FAQPage (${types.join(',')})`);
      const faqNode = g['@graph']?.find((x) => x['@type'] === 'FAQPage');
      ok(!!faqNode?.mainEntity?.length, `${slug}.html: FAQPage vacío`);
    } catch (e) {
      failures.push(`${slug}.html: JSON-LD inválido (${e.message})`);
    }
  }
  ok(html.includes('rel="canonical"'), `${slug}.html: sin canonical`);
  ok(!FORBIDDEN_OFFERTA.test(html), `${slug}.html: cifras de oferta prohibidas (P2)`);
}

// 3. Sitemap: blog index + cada post
const sitemap = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
ok(sitemap.includes('https://vitametric.com/blog/index.html'), 'sitemap.xml: falta blog/index.html');
for (const slug of slugs) {
  ok(sitemap.includes(`https://vitametric.com/blog/${slug}.html`), `sitemap.xml: falta blog/${slug}.html`);
}

// Reporte
if (failures.length) {
  console.error(`FALLARON ${failures.length} comprobación(es):`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log(`test-blog: TODO LIMPIO (${slugs.length} post(s) validados)`);
