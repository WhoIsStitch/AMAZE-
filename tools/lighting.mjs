process.argv[3] = 'keep';
const { page, out, logs, browser, server } = await import('./shoot.mjs');
await page.evaluate(() => { const S = window.__glyde.Store.S(); S.level.classic = 150; S.seen = { f_portal: true, f_arrow: true, f_sticky: true, f_seal: true, install: true }; });
await page.evaluate(() => window.__glyde.startLevel('classic', 12, { noLeave: true }));
await page.waitForFunction(() => window.__glyde.renderer.introT > 3.2, null, { timeout: 120000 });
const variants = {
  A_aces_dim: { tm: 'ACES', ex: 0.85, sun: 1.6, hemi: 0.5 },
  B_none: { tm: 'None', ex: 1, sun: 1.25, hemi: 0.55 },
  C_linear: { tm: 'Linear', ex: 1, sun: 1.3, hemi: 0.5 },
  D_none_low: { tm: 'None', ex: 1, sun: 1.0, hemi: 0.45 },
};
for (const [name, v] of Object.entries(variants)) {
  await page.evaluate(async (v) => {
    const THREE = await import('./vendor/three.module.min.js');
    const R = window.__glyde.renderer;
    R.r.toneMapping = { ACES: THREE.ACESFilmicToneMapping, None: THREE.NoToneMapping, Linear: THREE.LinearToneMapping }[v.tm];
    R.r.toneMappingExposure = v.ex; R.sun.intensity = v.sun; R.hemi.intensity = v.hemi;
    R.scene.traverse((o) => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); } });
  }, v);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/light-${name}.png` });
}
console.log(logs.join('\n') || 'no console errors');
await browser.close(); server.close();
