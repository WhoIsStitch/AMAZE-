// Hint solver: depth-first search with a transposition table and a reachability prune.
// Starts from the player's *current* state, so hints still work after they wander off the
// generator's own solution.

import { WALL, PORTAL, DX, DY, cloneState, slide } from './engine.js';
import { mulberry32 } from './rng.js';

const zrng = mulberry32(0x5eed);
const ZP = [];
const ZS = [];
const ZPOS = [];
for (let i = 0; i < 1024; i++) {
  ZP.push([(zrng() * 2097152) | 0, (zrng() * 4294967296) >>> 0]);
  ZS.push([(zrng() * 2097152) | 0, (zrng() * 4294967296) >>> 0]);
  ZPOS.push([(zrng() * 2097152) | 0, (zrng() * 4294967296) >>> 0]);
}

function keyOf(st, N) {
  let hi = ZPOS[st.pos][0], lo = ZPOS[st.pos][1];
  for (let i = 0; i < N; i++) {
    if (st.painted[i]) { hi ^= ZP[i][0]; lo ^= ZP[i][1]; }
    if (st.sealed[i]) { hi ^= ZS[i][0]; lo ^= ZS[i][1]; }
  }
  return hi * 4294967296 + (lo >>> 0);
}

/** Every unpainted tile must still be reachable by plain walking, or this branch is dead. */
function reachableOk(L, st, stack, mark) {
  const { w, h, kind, partner } = L;
  const N = w * h;
  mark.fill(0);
  let sp = 0;
  stack[sp++] = st.pos;
  mark[st.pos] = 1;
  let need = st.left;
  while (sp) {
    const c = stack[--sp];
    if (!st.painted[c]) need--;
    const x = c % w, y = (c / w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (mark[n] || kind[n] === WALL || st.sealed[n]) continue;
      mark[n] = 1; stack[sp++] = n;
    }
    if (kind[c] === PORTAL && partner[c] >= 0 && !mark[partner[c]]) {
      mark[partner[c]] = 1; stack[sp++] = partner[c];
    }
  }
  return need <= 0;
}

export function solve(L, st0, opts = {}) {
  const maxNodes = opts.maxNodes || 150000;
  const maxMs = opts.maxMs === undefined ? 1200 : opts.maxMs; // pass Infinity for fully deterministic runs
  const N = L.w * L.h;
  const seen = new Set();
  const stack = new Int32Array(N + 8);
  const mark = new Uint8Array(N);
  const t0 = Date.now();
  let nodes = 0;
  let aborted = false;
  const path = [];

  const dfs = (st) => {
    if (st.left <= 0) return true;
    if (aborted) return false;
    if (++nodes > maxNodes || ((nodes & 255) === 0 && Date.now() - t0 > maxMs)) { aborted = true; return false; }
    const k = keyOf(st, N);
    if (seen.has(k)) return false;
    seen.add(k);
    if (!reachableOk(L, st, stack, mark)) return false;
    const opts2 = [];
    for (let d = 0; d < 4; d++) {
      const c = cloneState(st);
      const r = slide(L, c, d);
      if (r.steps === 0) continue;
      const gain = st.left - c.left;
      opts2.push({ d, c, gain });
    }
    opts2.sort((a, b) => b.gain - a.gain);
    for (const o of opts2) {
      path.push(o.d);
      if (dfs(o.c)) return true;
      path.pop();
    }
    return false;
  };

  const ok = dfs(cloneState(st0));
  return { moves: ok ? path.slice() : null, nodes, aborted };
}
