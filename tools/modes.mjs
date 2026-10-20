process.argv[3] = 'keep';
const { page, out, logs, browser, server } = await import('./shoot.mjs');
const wait = (ms) => page.waitForTimeout(ms);
const ready = () => page.waitForFunction(() => !window.__glyde.G.loading && window.__glyde.renderer.introT > 3, null, { timeout: 120000 });
await page.evaluate(() => { const S = window.__glyde.Store.S(); S.seen = { f_portal: true, f_arrow: true, f_sticky: true, f_seal: true, install: true }; S.coins = 4000; });
// Limited moves
await page.evaluate(() => window.__glyde.UI.hooks.selectMode('moves'));
await ready();
await page.screenshot({ path: `${out}/mode-moves.png` });
await page.evaluate(() => { const g = window.__glyde.G; g.st.moves = g.L.maxMoves - 1; });
await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowLeft');
await page.waitForSelector('[data-retry]', { timeout: 60000 });
await wait(1200);
await page.screenshot({ path: `${out}/fail-moves.png` });
await page.evaluate(() => document.querySelector('[data-retry]').click());
// Time rush
await page.evaluate(() => window.__glyde.UI.hooks.selectMode('time'));
await ready();
await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowLeft');
await wait(1500);
await page.screenshot({ path: `${out}/mode-time.png` });
await page.evaluate(() => { window.__glyde.G.timeLeft = 1.2; });
await page.waitForSelector('[data-retry]', { timeout: 60000 });
await wait(1200);
await page.screenshot({ path: `${out}/fail-time.png` });
await page.evaluate(() => document.querySelector('[data-retry]').click());
await wait(500);
// popups
await page.evaluate(() => window.__glyde.UI.showFeature('portal'));
await wait(900); await page.screenshot({ path: `${out}/pop-feature.png` });
await page.evaluate(() => document.querySelector('[data-ok]').click()); await wait(500);
await page.evaluate(() => { const { BALLS, UI } = window.__glyde; UI.showChest({ coins: 140, ball: BALLS[12] }); });
await wait(900); await page.screenshot({ path: `${out}/pop-chest-closed.png` });
await page.evaluate(() => document.querySelector('.chest-big').click());
await wait(1500); await page.screenshot({ path: `${out}/pop-chest-open.png` });
console.log(logs.join('\n') || 'no console errors');
await browser.close(); server.close();
