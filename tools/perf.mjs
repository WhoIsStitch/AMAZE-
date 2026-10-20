process.argv[3] = 'keep';
const { page, logs, browser, server } = await import('./shoot.mjs');
await page.evaluate(() => { const S = window.__glyde.Store.S(); S.level.classic = 400; S.seen = { f_portal: true, f_arrow: true, f_sticky: true, f_seal: true, install: true }; });
await page.evaluate(() => window.__glyde.startLevel('classic', 300, { noLeave: true }));
await page.waitForFunction(() => window.__glyde.G.n === 300 && window.__glyde.renderer.introT > 3.5, null, { timeout: 180000 });
const r = await page.evaluate(() => {
  const R = window.__glyde.renderer, L = window.__glyde.G.L;
  R.r.info.autoReset = true;
  R.r.render(R.scene, R.camera);
  const info = { calls: R.r.info.render.calls, tris: R.r.info.render.triangles, geos: R.r.info.memory.geometries, tex: R.r.info.memory.textures };
  const t0 = performance.now();
  for (let i = 0; i < 300; i++) R.update(1 / 60);
  const ms = (performance.now() - t0) / 300;
  return { level: `${L.w}x${L.h}`, floor: L.total, features: L.features.join(','), ...info, updateMsPerFrame: +ms.toFixed(3) };
});
console.log(JSON.stringify(r));
console.log(logs.join('\n') || 'no console errors');
await browser.close(); server.close();
