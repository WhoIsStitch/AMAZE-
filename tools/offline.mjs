// Proves the PWA works with the network cut: load once, go offline, reload, play.
import { chromium } from 'playwright';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
const root = new URL('..', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = join(root, p);
  if (!existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`http://localhost:${port}/`);
await page.waitForSelector('#loading.gone', { timeout: 60000 });
const cached = await page.evaluate(async () => {
  await navigator.serviceWorker.ready;
  await new Promise((r) => setTimeout(r, 1500));
  const keys = await caches.keys();
  const c = await caches.open(keys[0]);
  return { keys, n: (await c.keys()).length, urls: (await c.keys()).map((r) => new URL(r.url).pathname) };
});
console.log('cache:', cached.keys, cached.n, 'entries');
await ctx.setOffline(true);
await page.reload();
await page.waitForSelector('#loading.gone', { timeout: 60000 });
await page.waitForFunction(() => window.__glyde && window.__glyde.G.L && !window.__glyde.G.loading, null, { timeout: 60000 });
const info = await page.evaluate(() => ({ level: window.__glyde.G.n, cells: window.__glyde.G.L.total, online: navigator.onLine }));
console.log('reloaded OFFLINE ->', JSON.stringify(info));
// generate a brand-new level offline (worker + generator also cached)
await page.evaluate(() => window.__glyde.startLevel('classic', 77, { noLeave: true }));
await page.waitForFunction(() => window.__glyde.G.n === 77 && !window.__glyde.G.loading, null, { timeout: 60000 });
console.log('generated level 77 offline: OK');
console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no errors');
await browser.close(); server.close();
process.exit(errs.length ? 1 : 0);
