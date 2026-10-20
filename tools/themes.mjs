process.argv[3] = 'keep';
const { page, out, logs, browser, server } = await import('./shoot.mjs');
const wait = (ms) => page.waitForTimeout(ms);
const idle = () => page.waitForFunction(() => !window.__glyde.G.loading, null, { timeout: 60000 });
await page.evaluate(() => { const S = window.__glyde.Store.S(); S.level.classic = 150; S.coins = 99999; S.seen = { f_portal: true, f_arrow: true, f_sticky: true, f_seal: true, install: true }; });
const lvl = +(process.env.LVL || 31);
for (const t of ['wood', 'bricks', 'neon', 'plastic', 'golf', 'volcanic']) {
  await page.evaluate(([id, lvl]) => { window.__glyde.UI.hooks.equipTheme(id); window.__glyde.startLevel('classic', lvl, { noLeave: true }); }, [t, lvl]);
  await idle();
  await page.waitForFunction(() => window.__glyde.renderer.introT > 3.2 && window.__glyde.renderer.leaving.length === 0, null, { timeout: 120000 });
  await wait(300);
  await page.screenshot({ path: `${out}/theme-${t}.png` });
}
console.log(logs.join('\n') || 'no console errors');
await browser.close(); server.close();
