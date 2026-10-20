// Core rules of GLYDE. Pure functions, no DOM: shared by the game, generator, solver and tests.
//
// A level is a grid. The ball slides in a direction until something stops it, painting every
// tile it touches. Paint every tile to win.

export const WALL = 0;
export const FLOOR = 1;
export const PORTAL = 2; // enter one, exit its partner, keep going the same way
export const ARROW = 3; // redirects the ball (aux = new direction)
export const STICKY = 4; // ball stops dead on it
export const SEAL = 5; // turns into a wall once the ball leaves it
export const UNKNOWN = 255; // only used while a level is being generated

export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];
export const OPP = [2, 3, 0, 1];
export const DIR_NAMES = ['up', 'right', 'down', 'left'];

export function newState(L, total) {
  const n = L.w * L.h;
  const st = {
    pos: L.start,
    painted: new Uint8Array(n),
    sealed: new Uint8Array(n),
    left: (total === undefined ? L.total : total) - 1,
    moves: 0,
  };
  st.painted[L.start] = 1;
  return st;
}

export function cloneState(st) {
  return {
    pos: st.pos,
    painted: st.painted.slice(),
    sealed: st.sealed.slice(),
    left: st.left,
    moves: st.moves,
  };
}

export function isBlocked(L, st, i) {
  return L.kind[i] === WALL || st.sealed[i] === 1;
}

/**
 * Slide the ball. Mutates `st`. Returns { steps, end, events, frontier }.
 *   steps    : cells entered (0 means the swipe was blocked and no move was spent)
 *   events   : ordered list for the animator
 *              {t:0,i,d,new}        entered tile i heading d
 *              {t:1,from,i,new}     teleported from portal `from` to portal i
 *              {t:2,i,d}            arrow pad at i turned the ball to d
 *              {t:3,i}              seal tile i closed behind the ball
 *   frontier : (generation only) the slide ran into an undecided cell
 * `hooks.resolve(n, dir, from)` lets the generator decide undecided cells lazily.
 */
export function slide(L, st, dir, hooks) {
  const { w, h, kind, aux, partner } = L;
  const events = [];
  let cur = st.pos;
  let d = dir;
  let steps = 0;
  let frontier = false;
  let seen = null; // loop guard, only needed once arrows/portals are involved
  const cap = w * h * 6 + 32;
  let looped = false;

  for (let it = 0; it < cap; it++) {
    const x = cur % w;
    const y = (cur / w) | 0;
    const nx = x + DX[d];
    const ny = y + DY[d];
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) break;
    const n = ny * w + nx;
    let k = kind[n];
    if (k === UNKNOWN) {
      if (hooks && hooks.resolve) {
        hooks.resolve(n, d, cur);
        k = kind[n];
      } else {
        frontier = true;
        break;
      }
    }
    if (k === WALL || st.sealed[n]) break;
    if (kind[cur] === SEAL) {
      st.sealed[cur] = 1;
      events.push({ t: 3, i: cur });
    }
    cur = n;
    steps++;
    let fresh = st.painted[n] === 0;
    if (fresh) {
      st.painted[n] = 1;
      st.left--;
    }
    events.push({ t: 0, i: n, d, new: fresh });

    if (k === PORTAL || k === ARROW) {
      if (!seen) seen = new Set();
      const key = n * 4 + d;
      if (seen.has(key)) looped = true; // endless loop through portals/arrows: just stop
      seen.add(key);
    }
    if (k === PORTAL) {
      const p = partner[n];
      if (p >= 0) {
        cur = p;
        fresh = st.painted[p] === 0;
        if (fresh) {
          st.painted[p] = 1;
          st.left--;
        }
        events.push({ t: 1, from: n, i: p, new: fresh });
      }
    } else if (k === ARROW) {
      d = aux[n];
      events.push({ t: 2, i: n, d });
    } else if (k === STICKY) {
      break;
    }
    if (looped) break;
  }
  st.pos = cur;
  if (steps > 0) st.moves++;
  return { steps, end: cur, events, frontier };
}

export function isWon(st) {
  return st.left <= 0;
}

/** Is there any swipe that would move the ball? */
export function hasMoves(L, st) {
  for (let d = 0; d < 4; d++) {
    const c = cloneState(st);
    if (slide(L, c, d).steps > 0) return true;
  }
  return false;
}

/** Replay a list of directions from the start. Used by tests and by the hint system. */
export function replay(L, dirs) {
  const st = newState(L);
  for (const d of dirs) slide(L, st, d);
  return st;
}

export function levelToAscii(L) {
  const rows = [];
  const arrows = ['^', '>', 'v', '<'];
  for (let y = 0; y < L.h; y++) {
    let r = '';
    for (let x = 0; x < L.w; x++) {
      const i = y * L.w + x;
      const k = L.kind[i];
      if (i === L.start) r += 'S';
      else if (k === WALL) r += '#';
      else if (k === FLOOR) r += '.';
      else if (k === PORTAL) r += String.fromCharCode(97 + L.aux[i]);
      else if (k === ARROW) r += arrows[L.aux[i]];
      else if (k === STICKY) r += 'o';
      else if (k === SEAL) r += '%';
    }
    rows.push(r);
  }
  return rows.join('\n');
}
