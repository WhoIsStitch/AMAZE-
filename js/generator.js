// Infinite, deterministic level generator.
//
// Every level is built by *playing it*: a virtual ball makes random swipes on an undecided grid and
// each undecided cell it bumps into is decided on the spot (wall, floor, or a special tile). Because
// cells are never changed after they are decided, replaying the recorded swipes on the finished
// level always paints every tile. Solvable by construction, no matter the level number.

import {
  WALL, FLOOR, PORTAL, ARROW, STICKY, SEAL, UNKNOWN,
  DX, DY, newState, cloneState, slide, replay,
} from './engine.js';
import { mulberry32, hash32 } from './rng.js';
import { solve } from './solver.js';

export const MODES = ['classic', 'moves', 'time'];

/** First level where each special tile can appear. */
export const UNLOCK = { portal: 8, arrow: 15, sticky: 22, seal: 30 };

export function levelParams(n) {
  // boards keep growing for a long time, so level 200 really is bigger than level 50
  const w = n <= 25 ? Math.min(4 + Math.floor((n - 1) / 4), 10) : Math.min(10 + Math.floor((n - 25) / 40), 12);
  const h = Math.min(Math.round(w * 1.55) + (n > 60 ? 1 : 0) + (n > 140 ? 1 : 0), 19);
  // fill grows with level: more tiles to paint, tighter solutions
  const fill = 0.42 + 0.24 * (1 - Math.exp(-n / 45));
  const target = Math.max(9, Math.round(w * h * fill));
  // slide-length character: low = open arenas (harder), high = tight corridors (easier)
  const wallLo = n < 10 ? 0.26 : 0.1;
  const wallHi = n < 10 ? 0.36 : n < 40 ? 0.34 : 0.3;
  return { w, h, target, wallLo, wallHi };
}

function featureSet(n, rng) {
  const f = { portal: false, arrow: false, sticky: false, seal: false };
  const forced = n === UNLOCK.portal ? 'portal' : n === UNLOCK.arrow ? 'arrow'
    : n === UNLOCK.sticky ? 'sticky' : n === UNLOCK.seal ? 'seal' : null;
  for (const k of Object.keys(UNLOCK)) {
    if (n < UNLOCK[k]) continue;
    const late = Math.min(0.55, 0.3 + (n - UNLOCK[k]) / 200);
    f[k] = k === forced || rng() < late;
  }
  // every 7th level is a "pure" breather, special tiles aside
  if (n > 30 && n % 7 === 0) { f.portal = f.arrow = f.sticky = f.seal = false; }
  return f;
}

function attempt(n, seed, feats, P) {
  const rng = mulberry32(seed);
  const { w, h } = P;
  const N = w * h;
  const kind = new Uint8Array(N).fill(UNKNOWN);
  const aux = new Uint8Array(N);
  const partner = new Int16Array(N).fill(-1);
  const L = { w, h, kind, aux, partner, start: 0, total: 0 };

  // start in a random cell, biased towards the outer ring
  let sx = rng.int(w), sy = rng.int(h);
  if (rng() < 0.7) { if (rng() < 0.5) sx = rng() < 0.5 ? 0 : w - 1; else sy = rng() < 0.5 ? 0 : h - 1; }
  L.start = sy * w + sx;
  kind[L.start] = FLOOR;

  const pw = rng.range(P.wallLo, P.wallHi);
  let floorCount = 1;
  const counts = { portal: 0, arrow: 0, sticky: 0, seal: 0 };
  const caps = {
    portal: Math.min(3, 1 + Math.floor((n - UNLOCK.portal) / 25)),
    arrow: Math.min(8, 2 + Math.floor((n - UNLOCK.arrow) / 8)),
    sticky: Math.min(6, 2 + Math.floor((n - UNLOCK.sticky) / 10)),
    seal: Math.min(8, 1 + Math.floor((n - UNLOCK.seal) / 8)),
  };
  const specialP = 0.05 + Math.min(0.05, n / 1500);
  const maxCells = Math.round(P.target * 1.12);

  const resolve = (c, d, from) => {
    if (floorCount >= maxCells) { kind[c] = WALL; return; }
    if (rng() < pw) { kind[c] = WALL; return; }
    kind[c] = FLOOR;
    floorCount++;
    if (rng() >= specialP) return;
    const opts = [];
    for (const k of Object.keys(feats)) if (feats[k] && counts[k] < caps[k]) opts.push(k);
    if (!opts.length) return;
    const pick = opts[rng.int(opts.length)];
    const cx = c % w, cy = (c / w) | 0;
    if (pick === 'arrow') {
      const nd = rng() < 0.5 ? (d + 1) & 3 : (d + 3) & 3;
      const ax = cx + DX[nd], ay = cy + DY[nd];
      if (ax < 0 || ay < 0 || ax >= w || ay >= h) return;
      if (kind[ay * w + ax] === WALL) return;
      kind[c] = ARROW; aux[c] = nd; counts.arrow++;
    } else if (pick === 'sticky') {
      kind[c] = STICKY; counts.sticky++;
    } else if (pick === 'seal') {
      kind[c] = SEAL; counts.seal++;
    } else if (pick === 'portal') {
      const cand = [];
      for (let i = 0; i < N; i++) {
        if (kind[i] !== UNKNOWN) continue;
        const x = i % w, y = (i / w) | 0;
        if (Math.abs(x - cx) + Math.abs(y - cy) < 3) continue;
        const ex = x + DX[d], ey = y + DY[d];
        if (ex < 0 || ey < 0 || ex >= w || ey >= h) continue;
        if (kind[ey * w + ex] !== UNKNOWN) continue;
        cand.push(i);
      }
      if (!cand.length) return;
      const b = cand[rng.int(cand.length)];
      kind[c] = kind[b] = PORTAL;
      partner[c] = b; partner[b] = c;
      aux[c] = aux[b] = counts.portal;
      counts.portal++;
      floorCount++;
    }
  };

  const st = newState(L, 1);
  const moves = [];
  const hooks = { resolve };
  for (let it = 0; it < 600 && floorCount < P.target; it++) {
    const cands = [];
    let total = 0;
    for (let d = 0; d < 4; d++) {
      const dry = slide(L, cloneState(st), d);
      let wgt = 0;
      if (dry.frontier) wgt = 4;
      else if (dry.steps > 0) wgt = 0.7;
      if (wgt > 0) { cands.push([d, wgt]); total += wgt; }
    }
    if (!cands.length) break;
    let r = rng() * total, d = cands[0][0];
    for (const [cd, cw] of cands) { r -= cw; if (r <= 0) { d = cd; break; } }
    const res = slide(L, st, d, hooks);
    if (res.steps > 0) moves.push(d);
  }
  // finish any slide still pending on undecided cells, then close the level
  for (let i = 0; i < N; i++) if (kind[i] === UNKNOWN) kind[i] = WALL;
  return { L, moves, counts, floorCount };
}

function finish(res) {
  // crop to the used area plus a one-cell wall frame
  const { L } = res;
  const { w, h, kind } = L;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < w * h; i++) {
    if (kind[i] === WALL) continue;
    const x = i % w, y = (i / w) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const nw = x1 - x0 + 3, nh = y1 - y0 + 3;
  const nk = new Uint8Array(nw * nh);
  const na = new Uint8Array(nw * nh);
  const np = new Int16Array(nw * nh).fill(-1);
  const map = (i) => ((((i / w) | 0) - y0 + 1) * nw) + (i % w) - x0 + 1;
  let total = 0;
  for (let i = 0; i < w * h; i++) {
    if (kind[i] === WALL) continue;
    const j = map(i);
    nk[j] = kind[i]; na[j] = L.aux[i]; total++;
    if (L.partner[i] >= 0) np[j] = map(L.partner[i]);
  }
  return { w: nw, h: nh, kind: nk, aux: na, partner: np, start: map(L.start), total };
}

/** Keep only swipes that actually move the ball (what a player's input stream would look like). */
function normalize(L, moves) {
  const st = newState(L);
  const out = [];
  for (const d of moves) if (slide(L, st, d).steps > 0) out.push(d);
  return { moves: out, left: st.left };
}

/**
 * The generator's own walk wanders. Greedily delete swipes that turn out to be unnecessary, so
 * par (and therefore move budgets and star ratings) reflects a realistic solution length.
 */
function shrink(L, moves, maxReplays) {
  let replays = 0;
  let best = normalize(L, moves).moves;
  for (let pass = 0; pass < 4; pass++) {
    let improved = false;
    for (let i = 0; i < best.length; i++) {
      if (++replays > maxReplays) return best; // iteration budget, not wall-clock: keeps levels identical on every device
      const cand = best.slice(0, i).concat(best.slice(i + 1));
      const r = normalize(L, cand);
      if (r.left === 0) { best = r.moves; improved = true; i = Math.min(i, best.length) - 1; }
    }
    if (!improved) break;
  }
  return best;
}

function score(L, moves, n, P) {
  let sc = Math.min(L.total, P.target * 1.1) - Math.abs(L.total - P.target) * 0.4;
  // openness: cells with 3+ open neighbours make a level harder to read
  let open = 0;
  for (let i = 0; i < L.w * L.h; i++) {
    if (!L.kind[i]) continue;
    let c = 0;
    for (let d = 0; d < 4; d++) {
      const x = (i % L.w) + DX[d], y = ((i / L.w) | 0) + DY[d];
      if (L.kind[y * L.w + x]) c++;
    }
    if (c >= 3) open++;
  }
  const o = open / L.total;
  const want = Math.min(0.55, 0.1 + n / 220);
  sc -= Math.abs(o - want) * 14;
  sc += Math.min(moves.length, L.total) * 0.15;
  return sc;
}

export function generateLevel(n, mode = 'classic') {
  const mi = Math.max(0, MODES.indexOf(mode));
  const base = hash32(mi + 1, n, 0xa17e);
  const P = levelParams(n);
  const rng0 = mulberry32(base);
  const feats = featureSet(n, rng0);
  const minCells = Math.max(7, Math.round(P.target * 0.82));
  const wantFeats = Object.keys(feats).filter((k) => feats[k]);
  const forcedK = Object.keys(UNLOCK).find((k) => UNLOCK[k] === n);
  let best = null;
  const tries = n < 4 ? 4 : n < 12 ? 8 : 10;
  for (let a = 0; a < 40 && (a < tries || !best); a++) {
    const r = attempt(n, hash32(base, a, 7), feats, P);
    if (r.floorCount < minCells && a < 30) continue;
    if (r.moves.length < Math.min(3, n + 1)) continue;
    if (forcedK && r.counts[forcedK] === 0 && a < 30) continue; // a tile's debut level must show it
    const L = finish(r);
    // paranoia: the recorded solution must truly clear the cropped level
    if (replay(L, r.moves).left !== 0) continue;
    let sc = score(L, r.moves, n, P) + (wantFeats.some((k) => r.counts[k] > 0) ? 2 : 0);
    let sol = null;
    if (n >= 5) {
      // hardness: how much does a greedy search have to backtrack?
      const s = solve(L, newState(L), { maxNodes: 2500, maxMs: Infinity }); // node cap only: level data must not depend on device speed
      if (s.moves) sol = s.moves;
      const ratio = s.moves ? s.nodes / Math.max(1, s.moves.length) : 10;
      const want = Math.min(2.5, n / 40);
      sc += want * Math.min(3, Math.log2(1 + ratio)) - (s.moves ? 0 : n < 40 ? 6 : 1);
    }
    if (!best || sc > best.sc) best = { L, moves: r.moves, sol, sc, counts: r.counts };
  }
  if (!best) {
    // practically unreachable; fall back to a trivial level so the game can never fail to load
    const kind = new Uint8Array(5 * 5);
    for (let i = 1; i <= 3; i++) kind[6 + i] = FLOOR;
    best = { L: { w: 5, h: 5, kind, aux: new Uint8Array(25), partner: new Int16Array(25).fill(-1), start: 7, total: 3 }, moves: [1], counts: {} };
  }
  const L = best.L;
  // the generator's own walk wanders; prefer the tight solution if the solver found one
  let solution = best.moves;
  if (!best.sol) {
    const s = solve(L, newState(L), { maxNodes: 12000, maxMs: Infinity });
    if (s.moves) best.sol = s.moves;
  }
  if (best.sol && best.sol.length < solution.length && replay(L, best.sol).left === 0) solution = best.sol;
  if (!best.sol && solution.length > 40) {
    const sh = shrink(L, solution, 1500);
    if (sh.length < solution.length && replay(L, sh).left === 0) solution = sh;
  }
  L.n = n;
  L.mode = mode;
  L.solution = solution;
  L.alt = best.moves;
  L.par = solution.length;
  L.counts = best.counts;
  L.features = Object.keys(best.counts).filter((k) => best.counts[k] > 0);
  // Limited Moves / Time Rush budgets tighten as levels climb
  L.maxMoves = Math.ceil(L.par * Math.max(1.22, 1.75 - n / 140)) + 2;
  L.timeLimit = Math.ceil(L.par * Math.max(1.5, 2.8 - n / 60) + 8);
  return L;
}
