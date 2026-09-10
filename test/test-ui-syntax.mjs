/**
 * Guardia de carga: todo js/*.js debe parsear.
 *
 * Existe porque d8ed6f0 llegó a commitearse con la cabecera de
 * `updateRuntimeStatus()` borrada en triage-chat-ui.js: SyntaxError que mata la
 * página entera, con la suite en 127/127 verde. Ningún test de Node carga los
 * archivos de UI (tocan `document`/`window`), así que nada los parseaba.
 *
 * `node --check` no ejecuta: solo parsea. Es la red mínima que faltaba.
 *
 * Correr: node test/test-ui-syntax.mjs
 */
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const jsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'js');
const archivos = readdirSync(jsDir).filter((f) => f.endsWith('.js')).sort();

let ok = 0;
let fail = 0;

for (const f of archivos) {
  try {
    execFileSync(process.execPath, ['--check', join(jsDir, f)], { stdio: 'pipe' });
    ok++;
    console.log(`✅ [S] parsea: js/${f}`);
  } catch (err) {
    fail++;
    const msg = String(err.stderr || '').split('\n').find((l) => l.includes('Error')) || 'error de parseo';
    console.log(`❌ [S] NO parsea: js/${f} → ${msg.trim()}`);
  }
}

// Segunda red: toda función llamada debe existir. Barata y específica para el
// modo de fallo real (cabecera borrada, llamadas huérfanas).
const { readFileSync } = await import('node:fs');
const ui = readFileSync(join(jsDir, 'triage-chat-ui.js'), 'utf8');
for (const fn of ['updateRuntimeStatus', 'suggestDetail', 'renderListenerInput', 'mount']) {
  const declarada = new RegExp(`function\\s+${fn}\\s*\\(`).test(ui);
  if (declarada) { ok++; console.log(`✅ [S] declarada: ${fn}()`); }
  else { fail++; console.log(`❌ [S] se usa pero NO está declarada: ${fn}()`); }
}

// Tercera red: el píxel de Google Ads jamás inline ni incondicional. Nació
// porque el snippet de gtag en <head> disparaba cookies de DoubleClick sin
// consentimiento (best-practices 0.78, same visitor sin preguntar). El tag solo
// puede entrar vía js/analytics-gate.js tras opt-in explícito.
const htmls = readdirSync(dirname(jsDir)).filter((f) => f.endsWith('.html'));
for (const f of htmls) {
  const html = readFileSync(join(dirname(jsDir), f), 'utf8');
  if (/googletagmanager\.com\/gtag/.test(html)) {
    fail++;
    console.log(`❌ [S] ${f}: tag de Google inline — debe cargar vía js/analytics-gate.js`);
  } else if (html.includes('analytics-gate.js')) {
    ok++;
    console.log(`✅ [S] ${f}: píxel consent-gated (sin tag inline)`);
  }
}
const gate = readFileSync(join(jsDir, 'analytics-gate.js'), 'utf8');
for (const fn of ['loadGtag', 'grant', 'decline', 'requestConsent']) {
  const declarada = new RegExp(`function\\s+${fn}\\s*\\(|${fn}\\s*:`).test(gate);
  if (declarada) { ok++; console.log(`✅ [S] analytics-gate declara: ${fn}`); }
  else { fail++; console.log(`❌ [S] analytics-gate sin: ${fn}`); }
}

console.log(`\n── Sintaxis y declaraciones de UI: ${ok} ok, ${fail} fallos ──`);
process.exit(fail > 0 ? 1 : 0);
