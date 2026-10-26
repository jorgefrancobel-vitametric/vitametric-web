import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const EXPECTED_LOGOS = [
  'televisa',
  'ppg',
  'central-de-abasto',
  'manpower',
  'liomont',
  'usana',
  'bimbo',
  'aon-hewitt',
  'femsa',
  'bbva',
  'tv-azteca',
  'ado',
  'devlyn',
  'hidracolor'
];

test('Pabellón de Clientes — 14 logotipos íntegros y referenciados', () => {
  const clientesHtmlPath = path.join(rootDir, 'clientes.html');
  assert.ok(fs.existsSync(clientesHtmlPath), 'clientes.html debe existir');
  const clientesHtml = fs.readFileSync(clientesHtmlPath, 'utf8');

  // Verificar estructura editorial estilo Frabel
  assert.ok(clientesHtml.includes('class="clients-showcase"'), 'Debe incluir .clients-showcase');
  assert.ok(clientesHtml.includes('class="relationship-board"'), 'Debe incluir .relationship-board');
  assert.ok(clientesHtml.includes('class="wordmark-list"'), 'Debe incluir .wordmark-list');

  // Verificar que los 14 logos existen en disco y están en el HTML con cache-busting
  const imgDir = path.join(rootDir, 'assets', 'img', 'clientes');
  for (const slug of EXPECTED_LOGOS) {
    const pngPath = path.join(imgDir, `${slug}.png`);
    const webpPath = path.join(imgDir, `${slug}.webp`);

    assert.ok(fs.existsSync(pngPath), `Logo PNG debe existir: ${slug}.png`);
    assert.ok(fs.existsSync(webpPath), `Logo WebP debe existir: ${slug}.webp`);

    assert.ok(
      clientesHtml.includes(`${slug}.webp?v=`),
      `clientes.html debe referenciar WebP con versión: ${slug}.webp?v=`
    );
    assert.ok(
      clientesHtml.includes(`${slug}.png?v=`),
      `clientes.html debe referenciar PNG con versión: ${slug}.png?v=`
    );
  }
});

test('Exclusividad de logotipos — ningún logo corporativo en index.html', () => {
  const indexHtmlPath = path.join(rootDir, 'index.html');
  assert.ok(fs.existsSync(indexHtmlPath), 'index.html debe existir');
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

  for (const slug of EXPECTED_LOGOS) {
    assert.ok(
      !indexHtml.includes(`clientes/${slug}`),
      `index.html no debe incluir logo corporativo de ${slug}`
    );
  }

  // Verificar hero transversal en index.html
  assert.ok(
    indexHtml.includes('hero-transversal.webp'),
    'index.html debe cargar hero-transversal.webp'
  );
});
