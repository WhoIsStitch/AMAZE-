process.argv[3] = 'keep';
const { page, out, logs, browser, server } = await import('./shoot.mjs');
await page.evaluate(() => { const S = window.__glyde.Store.S(); S.seen = { f_portal: true, f_arrow: true, f_sticky: true, f_seal: true, install: true }; S.level.classic = 12; });
await page.evaluate(() => window.__glyde.startLevel('classic', 12, { noLeave: true }));
await page.waitForFunction(() => window.__glyde.G.n === 12 && window.__glyde.renderer.introT > 3.5, null, { timeout: 120000 });
// start the transition, then freeze the loop and step time by hand
await page.evaluate(() => { window.__glyde.startLevel('classic', 13, {}); });
await page.waitForTimeout(150);
await page.evaluate(() => { window.__glyde.renderer.running = false; });
await page.waitForTimeout(400);
const step = async (name, secs) => {
  await page.evaluate((secs) => { const R = window.__glyde.renderer; const n = Math.round(secs / 0.025); for (let i = 0; i < n; i++) R.update(0.025); R.r.render(R.scene, R.camera); }, secs);
  await page.screenshot({ path: `${out}/tr-${name}.png` });
};
await step('1', 0.12); await step('2', 0.15); await step('3', 0.15); await step('4', 0.2);
// wait until the new level is loaded, then capture the rise
for (let i = 0; i < 80; i++) {
  await page.evaluate(() => { const R = window.__glyde.renderer; for (let k = 0; k < 8; k++) R.update(0.025); });
  const done = await page.evaluate(() => window.__glyde.G.n === 13 && !window.__glyde.G.loading);
  if (done) break;
  await page.waitForTimeout(100);
}
await step('5', 0.2); await step('6', 0.2); await step('7', 0.3); await step('8', 0.9);
console.log(logs.join('\n') || 'no console errors');
await browser.close(); server.close();
