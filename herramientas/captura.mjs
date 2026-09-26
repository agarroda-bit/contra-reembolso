// Saca capturas de una página del juego con Chromium headless (WebGL por SwiftShader).
// Uso:
//   node herramientas/captura.mjs --page "index.html?debug=1" --port 5201 \
//        --shots '[{"wait":3000,"out":"capturas/tmp/a.png"},{"eval":"__cr.clock.hour=23","wait":1500,"out":"capturas/tmp/b.png"}]'
// Cada shot: { eval?: string (JS en la página), keys?: [{"key":"KeyW","ms":2000}], wait?: ms, out?: ruta png, log?: expresión JS a imprimir }
// Añade --gpu para usar la GPU real (Metal) en vez de SwiftShader.
// Imprime los errores de consola al final y sale con código 1 si hubo errores (salvo --allow-errors).
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, arr) => {
    if (v.startsWith('--')) acc.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, []),
);
const port = Number(args.port || 5199);
const page = args.page || 'index.html';
const shots = JSON.parse(args.shots || '[{"wait":3000,"out":"capturas/tmp/captura.png"}]');
const width = Number(args.width || 1280), height = Number(args.height || 720);

const server = await createServer({ server: { port, strictPort: false }, logLevel: 'error', clearScreen: false });
await server.listen();
const url = `http://localhost:${server.config.server.port}/${page}`;
// --gpu: Chromium completo con la GPU real del Mac (Metal): fps realistas y capturas rápidas.
const browser = await chromium.launch(
  args.gpu
    ? { channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] }
    : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] },
);
const ctx = await browser.newContext({ viewport: { width, height } });
const p = await ctx.newPage();
const errors = [];
p.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
  if (args.verbose) console.log('[consola]', m.type(), m.text());
});
p.on('pageerror', (e) => errors.push(String(e.stack || e)));
console.log('Abriendo', url);
await p.goto(url, { waitUntil: 'load', timeout: 120000 });
for (const s of shots) {
  if (s.eval) {
    try { await p.evaluate(s.eval); } catch (e) { errors.push('eval: ' + e.message); }
  }
  if (s.keys) {
    for (const k of s.keys) {
      await p.keyboard.down(k.key);
      await p.waitForTimeout(k.ms ?? 500);
      await p.keyboard.up(k.key);
    }
  }
  if (s.wait) await p.waitForTimeout(s.wait);
  if (s.log) {
    try { console.log('[log]', JSON.stringify(await p.evaluate(s.log))); } catch (e) { errors.push('log: ' + e.message); }
  }
  if (s.out) {
    mkdirSync(dirname(s.out), { recursive: true });
    await p.screenshot({ path: s.out });
    console.log('Captura:', s.out);
  }
}
await browser.close();
await server.close();
if (errors.length) {
  console.log('ERRORES DE CONSOLA (' + errors.length + '):');
  for (const e of errors.slice(0, 30)) console.log(' -', e.slice(0, 500));
  if (!args['allow-errors']) process.exit(1);
} else console.log('Sin errores de consola.');
