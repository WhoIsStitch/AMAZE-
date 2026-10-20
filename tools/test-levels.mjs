// Sanity checks for the generator + solver.  node tools/test-levels.mjs [maxLevel] [--ascii n,n,n]
import { generateLevel, MODES } from '../js/generator.js';
import { replay, newState, slide, levelToAscii } from '../js/engine.js';
import { solve } from '../js/solver.js';

const args = process.argv.slice(2);
const max = parseInt(args[0] || '120', 10);
const asciiIdx = args.includes('--ascii') ? args[args.indexOf('--ascii') + 1].split(',').map(Number) : [];
const sample = [];
for (let n = 1; n <= Math.min(max, 60); n++) sample.push(n);
for (let n = 70; n <= max; n += 10) sample.push(n);
for (const n of [150, 250, 500, 1000, 2500, 9999]) if (n <= max || args.includes('--far')) sample.push(n);

let fails = 0;
console.log('lvl  size   cells  par  feat           genMs  solverNodes');
for (const n of sample) {
  for (const mode of MODES) {
    const t = performance.now();
    const L = generateLevel(n, mode);
    const gms = performance.now() - t;
    const st = replay(L, L.solution);
    if (st.left !== 0) { fails++; console.log('FAIL replay', mode, n); }
    // determinism
    const L2 = generateLevel(n, mode);
    if (L2.solution.join('') !== L.solution.join('') || L2.total !== L.total) { fails++; console.log('FAIL determinism', mode, n); }
    if (mode !== 'classic') continue;
    const s = solve(L, newState(L), { maxNodes: 200000, maxMs: 4000 });
    console.log(
      String(n).padStart(4), `${L.w}x${L.h}`.padEnd(6), String(L.total).padStart(5), String(L.par).padStart(4),
      (L.features.join(',') || '-').padEnd(14), gms.toFixed(1).padStart(6),
      s.moves ? String(s.nodes).padStart(8) + ` (${s.moves.length} mv)` : `   NOT FOUND (${s.aborted ? 'aborted' : 'exhausted'} ${s.nodes})`,
    );
    if (asciiIdx.includes(n)) console.log(levelToAscii(L) + '\n');
  }
}
console.log(fails ? `\n${fails} FAILURES` : '\nall levels solvable + deterministic');
process.exit(fails ? 1 : 0);
