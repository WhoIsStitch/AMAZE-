process.argv[3] = 'keep';
const { page, out, logs, browser, server, port } = await import('./shoot.mjs');
const urls = await page.evaluate(async () => {
  const { BALLS } = await import('./js/data.js');
  const { ballImage, releasePreview } = await import('./js/preview.js');
  const res = BALLS.map((b) => ({ n: b.name, r: b.rarity, u: ballImage(b) }));
  releasePreview();
  return res;
});
const html = `<body style="margin:0;background:#e9e3ff;font:14px sans-serif"><div style="display:grid;grid-template-columns:repeat(6,1fr);gap:4px;padding:6px">${urls.map((b) => `<div style="text-align:center"><img src="${b.u}" width=150><div>${b.n} (${b.r})</div></div>`).join('')}</div>`;
const p2 = await browser.newPage({ viewport: { width: 1000, height: 900 } });
await p2.setContent(html);
await p2.waitForTimeout(500);
await p2.screenshot({ path: `${out}/balls-sheet.png` });
console.log(logs.join('\n') || 'no console errors');
await browser.close(); server.close();
