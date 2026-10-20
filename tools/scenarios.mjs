// Plays a level via its stored solution and screenshots every major screen.
process.argv[3] = 'keep';
const { page, out, logs, browser, server } = await import('./shoot.mjs');
const keys = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (n) => { await page.screenshot({ path: `${out}/${n}.png` }); };

async function playSolution(from = 0, to = Infinity) {
  const sol = await page.evaluate(() => window.__glyde.G.L.solution);
  for (let i = from; i < Math.min(sol.length, to); i++) {
    await page.waitForFunction(() => !window.__glyde.G.busy, null, { timeout: 30000 });
    await page.keyboard.press(keys[sol[i]]);
    await wait(120);
  }
}

// first 2 moves of level 1
await playSolution(0, 2);
await shot('02-mid-level');
await playSolution(2);
await page.waitForFunction(() => !window.__glyde.G.busy, null, { timeout: 30000 });
await wait(2600);
await shot('03-win-modal');
const fps = await page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 1000) r(n); else requestAnimationFrame(f); }; f(); }));
console.log('fps', fps);
console.log('state', JSON.stringify(await page.evaluate(() => ({ n: window.__glyde.G.n, over: window.__glyde.G.over, coins: window.__glyde.Store.S().coins, lvl: window.__glyde.Store.S().level }))));
// next
await page.click('[data-next]').catch(() => {});
await wait(2200);
await shot('04-level2');

// screens
for (const [sel, name, w] of [['#btn-balls', '05-balls', 2500], ['#btn-themes', '06-themes', 800], ['#btn-ach', '07-ach', 800], ['#btn-modes', '08-modes', 600], ['#btn-daily', '09-daily', 600], ['#btn-settings', '10-settings', 600]]) {
  await page.click(sel);
  await wait(w);
  await shot(name);
  const back = await page.$('[data-back]') || await page.$('[data-x]');
  if (back) await back.click();
  await wait(500);
}
console.log(logs.join('\n') || 'no console errors');
await browser.close(); server.close();
