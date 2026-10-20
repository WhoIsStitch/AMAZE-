// Plays real levels through the actual UI input path using their stored solutions.
//   node tools/playthrough.mjs <outDir> [mode] [levels,comma,separated]
process.argv[3] = 'keep';
const { page, out, logs, browser, server } = await import('./shoot.mjs');
const mode = process.env.MODE || 'classic';
const levels = (process.env.LEVELS || '8,15,22,30').split(',').map(Number);
const keys = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
const idle = () => page.waitForFunction(() => !window.__glyde.G.busy && !window.__glyde.G.loading, null, { timeout: 120000 });
await page.evaluate(() => { const S = window.__glyde.Store.S(); S.seen = { f_portal: true, f_arrow: true, f_sticky: true, f_seal: true, install: true }; S.coins = 5000; });
let failures = 0;
for (const n of levels) {
  await page.evaluate(([m, n]) => { const S = window.__glyde.Store.S(); S.level[m] = n; window.__glyde.startLevel(m, n, { noLeave: true }); }, [mode, n]);
  await page.waitForFunction((n) => window.__glyde.G.n === n && !window.__glyde.G.loading && window.__glyde.renderer.introT > 2.5, n, { timeout: 120000 });
  const sol = await page.evaluate(() => window.__glyde.G.L.solution);
  const feats = await page.evaluate(() => window.__glyde.G.L.features.join(','));
  let shotAt = Math.floor(sol.length / 2);
  for (let i = 0; i < sol.length; i++) {
    await idle();
    await page.keyboard.press(keys[sol[i]]);
    if (i === shotAt) { await page.waitForTimeout(150); await page.screenshot({ path: `${out}/play-${mode}-${n}.png` }); }
  }
  await idle();
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => ({ over: window.__glyde.G.over, left: window.__glyde.G.st.left, moves: window.__glyde.G.st.moves, lvl: window.__glyde.Store.S().level }));
  const ok = r.over && r.left === 0;
  if (!ok) failures++;
  console.log(`${mode} L${n} [${feats || 'plain'}] solution=${sol.length} moves=${r.moves} left=${r.left} won=${r.over} -> ${ok ? 'OK' : 'FAIL'}`, JSON.stringify(r.lvl));
  // dismiss the win modal
  await page.waitForSelector('[data-replay]', { timeout: 20000 });
  await page.evaluate(() => document.querySelector('[data-replay]').click());
  await page.waitForFunction(() => !window.__glyde.UI.isOpen(), null, { timeout: 10000 });
}
console.log(logs.join('\n') || 'no console errors');
console.log(failures ? `${failures} FAILURES` : 'ALL PLAYTHROUGHS OK');
await browser.close(); server.close();
process.exit(failures ? 1 : 0);
