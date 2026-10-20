// Builds dist/glyde.html: the whole game in ONE self-contained file (no service worker, no extra requests).
//   node tools/build-single.mjs   (needs esbuild on NODE_PATH or in node_modules)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const bundle = async (entry) => (await build({
  entryPoints: [entry], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020', logLevel: 'error',
  define: { 'import.meta.url': '"."' },
})).outputFiles[0].text;
const esc = (t) => t.replace(/<\/(script)/gi, '<\\/$1');

const main = await bundle('js/main.js');
const worker = await bundle('js/gen-worker.js');
let css = readFileSync('css/style.css', 'utf8');
const font = readFileSync('fonts/lilita-one.woff2').toString('base64');
css = css.replace(/url\('\.\.\/fonts\/lilita-one\.woff2'\)/, `url(data:font/woff2;base64,${font})`);
const html = readFileSync('index.html', 'utf8');
const body = html.slice(html.indexOf('<div id="app">'), html.indexOf('<script type="module"')).trim();
const out = `<title>Glyde</title>
<style>${css}</style>
${body}
<script type="text/plain" id="gen-worker-src">${esc(worker)}</script>
<script>${esc(main)}</script>
`;
mkdirSync('dist', { recursive: true });
writeFileSync('dist/glyde.html', out);
console.log('dist/glyde.html', (out.length / 1024).toFixed(0) + ' KB');
