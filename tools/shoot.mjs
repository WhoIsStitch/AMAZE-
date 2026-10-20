// Visual QA harness: serves the repo, drives the game in headless Chromium, writes screenshots.
//   node tools/shoot.mjs <outDir> <scenario...>
import { chromium } from 'playwright';
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = process.argv[2] || '/tmp/shots';
mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = join(root, p);
  if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: +(process.env.DPR || 2), isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(`http://localhost:${port}/`);
await page.waitForSelector('#loading.gone', { timeout: 45000 }).catch(() => logs.push('loading never finished'));
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/01-game.png` });

export { page, out, logs, browser, server, port };
if (process.argv[3] !== 'keep') {
  console.log(logs.join('\n') || 'no console errors');
  await browser.close(); server.close();
}
