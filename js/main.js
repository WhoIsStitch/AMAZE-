// GLYDE: game controller. Boots the renderer, runs levels, handles input and progression.
import { newState, cloneState, slide, isWon, hasMoves, STICKY, DX, DY } from './engine.js';
import { solve } from './solver.js';
import { getLevel, prefetch } from './levels.js';
import { Renderer3D } from './render.js';
import { BALL_BY_ID, THEME_BY_ID, THEMES, BALLS, TILE_INFO } from './data.js';
import * as Store from './store.js';
import * as Audio from './audio.js';
import { haptics } from './haptics.js';
import * as UI from './ui.js';
import { ballImage, releasePreview } from './preview.js';

const sfx = Audio.sfx;
const $ = (s) => document.querySelector(s);
const HINT_COST = 25;
const SKIP_COST = 300;

const G = {
  mode: 'classic', n: 1, L: null, st: null, history: [], dirs: [],
  busy: false, queue: null, over: false, token: 0, timeLeft: 0, timing: false, loading: false,
  replay: false, undos: 0, hints: 0, pendingChest: null,
};
let renderer = null;
let lastTick = performance.now();

// ---- boot ---------------------------------------------------------------------------------------------------
async function boot() {
  const bar = $('#loading .loadbar i');
  const prog = (p) => { bar.style.width = p + '%'; };
  const t0 = performance.now();
  Store.load();
  Store.sanityCheck();
  Store.touchDay();
  const S = Store.S();
  prog(15);

  try {
    renderer = new Renderer3D($('#gl'));
  } catch (e) {
    $('#nogl').classList.remove('hidden');
    prog(100);
    return;
  }
  $('#gl').addEventListener('webglcontextlost', (e) => e.preventDefault()); // lets three.js restore after iOS backgrounds the page
  prog(30);
  UI.initHud();
  $('#hud').classList.remove('hidden');
  $('#hud').style.opacity = '0';
  applySettings();
  applyThemeCss(THEME_BY_ID[S.theme]);
  renderer.setQuality(S.settings.quality);
  renderer.setTheme(THEME_BY_ID[S.theme]);
  renderer.setBall(BALL_BY_ID[S.ball]);
  renderer.onEvent = onRenderEvent;
  renderer.resize();
  renderer.start();
  wireInput();
  wireButtons();
  prog(55);

  UI.setCoins(S.coins);
  Store.onChange((w) => { if (w === 'coins') { UI.setCoins(Store.S().coins); updateButtons(); } });
  await new Promise((r) => setTimeout(r, 30));
  try { await document.fonts.ready; } catch (e) { /* ignore */ }
  measure();
  prog(75);

  G.mode = S.mode;
  await startLevel(G.mode, S.level[G.mode], { first: true });
  prog(100);
  const wait = Math.max(0, 900 - (performance.now() - t0));
  await new Promise((r) => setTimeout(r, wait));
  $('#loading').classList.add('gone');
  $('#hud').style.opacity = '1';
  UI.updateDots();
  setInterval(tickLoop, 100);
  setInterval(() => { UI.updateDailyChip(); UI.updateDots(); }, 30000);

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  // greet returning players with their daily reward
  if (Store.dailyAvailable() && (S.stats.levelsDone || 0) >= 2) setTimeout(() => { if (!UI.isOpen()) UI.openDaily(); }, 1700);
}

function applySettings() {
  const s = Store.S().settings;
  Audio.setSfx(s.sfx);
  Audio.setMusic(s.music);
  haptics.set(s.haptics);
}

function applyThemeCss(t) {
  document.documentElement.style.setProperty('--bg1', t.bg[0]);
  document.documentElement.style.setProperty('--bg2', t.bg[1]);
  document.querySelector('meta[name="theme-color"]').setAttribute('content', t.bg[0]);
}

/** Tell the 3D camera how much room the HUD leaves for the board. */
function measure() {
  if (!renderer) return;
  const top = $('#hud-top').getBoundingClientRect().bottom + 8;
  const bar = $('#bottombar').getBoundingClientRect();
  const H = window.innerHeight;
  renderer.setSafe({ top, bottom: Math.max(60, H - bar.top + 16), left: 10, right: 10 });
}
function onResize() {
  if (!renderer) return;
  renderer.resize();
  measure();
  updateHand();
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 250));

// ---- unlock audio on the first real gesture (iOS needs touchend/click) -----------------------------------------
const unlockOnce = () => Audio.unlock();
['pointerup', 'touchend', 'click', 'keydown'].forEach((ev) => window.addEventListener(ev, unlockOnce, { capture: true }));

// ---- input ----------------------------------------------------------------------------------------------------------
function wireInput() {
  const cv = $('#gl');
  let sw = null;
  cv.addEventListener('pointerdown', (e) => {
    if (UI.isOpen()) return;
    sw = { x: e.clientX, y: e.clientY, id: e.pointerId, done: false };
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!sw || sw.done || e.pointerId !== sw.id) return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    if (Math.hypot(dx, dy) < 22) return;
    sw.done = true;
    onSwipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
  });
  const end = () => { sw = null; };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  window.addEventListener('keydown', (e) => {
    if (UI.isOpen()) return;
    const k = e.key.toLowerCase();
    const map = { arrowup: 0, w: 0, arrowright: 1, d: 1, arrowdown: 2, s: 2, arrowleft: 3, a: 3 };
    if (k in map) { e.preventDefault(); onSwipe(map[k]); } else if (k === 'z' || k === 'backspace') undo();
    else if (k === 'r') restart();
    else if (k === 'h') hint();
  });
  // keep iOS from scrolling/zooming the page under us
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => { if (!e.target.closest('.page-body')) e.preventDefault(); }, { passive: false });
}

function tapBtn(sel, fn) {
  const el = $(sel);
  el.addEventListener('click', (e) => { e.stopPropagation(); Audio.unlock(); haptics.tap(); fn(); });
}

function wireButtons() {
  tapBtn('#btn-settings', () => { sfx.click(); UI.openSettings({ skipCost: SKIP_COST }); });
  tapBtn('#btn-daily', () => { sfx.click(); UI.openDaily(); });
  tapBtn('#btn-modes', () => { sfx.click(); UI.openModes(); });
  tapBtn('#btn-themes', () => { sfx.click(); UI.openThemes(); });
  tapBtn('#btn-ach', () => { sfx.click(); UI.openAchievements(); });
  tapBtn('#btn-balls', () => { sfx.click(); UI.openBalls(); });
  tapBtn('#btn-undo', undo);
  tapBtn('#btn-hint', hint);
  tapBtn('#btn-restart', () => { sfx.click(); restart(); });

  UI.hooks.selectMode = (m) => { const S = Store.S(); S.mode = m; Store.persist(); G.mode = m; startLevel(m, S.level[m], {}); };
  UI.hooks.equipBall = (id) => {
    Store.S().ball = id; Store.persist();
    renderer.setBall(BALL_BY_ID[id]);
    refreshStage();
  };
  UI.hooks.equipTheme = (id) => {
    Store.S().theme = id; Store.persist();
    const t = THEME_BY_ID[id];
    applyThemeCss(t);
    renderer.setTheme(t);
    renderer.setBall(BALL_BY_ID[Store.S().ball]);
    if (G.L) renderer.loadLevel(G.L, G.st, { intro: true, coins: !G.replay, taken: takenCells() });
    UI.updateDots();
  };
  UI.hooks.settingChanged = (k) => {
    const s = Store.S().settings;
    if (k === 'sfx') Audio.setSfx(s.sfx);
    if (k === 'music') Audio.setMusic(s.music);
    if (k === 'haptics') haptics.set(s.haptics);
    if (k === 'quality') renderer.setQuality(s.quality);
  };
  UI.hooks.resetProgress = () => { Store.reset(); location.reload(); };
  UI.hooks.skip = skipLevel;
  UI.hooks.shopClosed = () => { refreshStage(); UI.updateDots(); };
  UI.hooks.dailyClaimed = () => UI.updateDots();
  UI.hooks.screens = () => { updateHand(); };
}

// ---- level lifecycle ---------------------------------------------------------------------------------------------------
function takenCells() {
  const t = Store.S().taken;
  return t && t.k === `${G.mode}:${G.n}` ? t.c : [];
}

async function startLevel(mode, n, opts = {}) {
  const token = ++G.token;
  G.loading = true;
  const L = await getLevel(n, mode);
  if (token !== G.token) return;
  const S = Store.S();
  G.mode = mode; G.n = n; G.L = L;
  G.st = newState(L);
  G.history = []; G.dirs = []; G.busy = false; G.queue = null; G.over = false;
  G.timeLeft = L.timeLimit; G.timing = false; G.loading = false;
  G.replay = n < S.level[mode];
  G.undos = 0; G.hints = 0;
  if (!S.taken || S.taken.k !== `${mode}:${n}`) S.taken = { k: `${mode}:${n}`, c: [] };
  renderer.loadLevel(L, G.st, { intro: true, coins: !G.replay, leave: !opts.first && !opts.noLeave, taken: S.taken.c });
  refreshHud();
  UI.updateDots();
  prefetch(n + 1, mode);
  measure();
  hideHand();
  const introMs = 1500;
  setTimeout(() => {
    if (token !== G.token) return;
    // first sight of a special tile: explain it
    for (const f of L.features) {
      if (!S.seen['f_' + f]) {
        S.seen['f_' + f] = true; Store.persist();
        UI.showFeature(f);
        break;
      }
    }
    updateHand();
    maybeInstallTip();
  }, introMs);
}

function refreshStage() {
  const ball = BALL_BY_ID[Store.S().ball];
  let url = '';
  try { url = ballImage(ball); } catch (e) { /* preview not available */ }
  UI.setStage(G.n, url);
  releasePreview();
}

function refreshHud() {
  UI.setTitle(G.n);
  refreshStage();
  UI.setCoins(Store.S().coins);
  updateStatus();
  $('#btn-hint small').innerHTML = `<svg viewBox="0 0 24 24"><use href="#i-coin"/></svg>${HINT_COST}`;
}

function updateButtons() {
  $('#btn-undo').classList.toggle('off', !G.history.length || G.over);
  $('#btn-hint').classList.toggle('off', G.over || Store.S().coins < HINT_COST);
}

function updateStatus() {
  const L = G.L;
  if (!L) return;
  updateButtons();
  if (G.mode === 'moves') {
    const left = Math.max(0, L.maxMoves - G.st.moves);
    UI.setStatus('MOVES LEFT', left, left <= 3);
  } else if (G.mode === 'time') {
    const t = Math.max(0, Math.ceil(G.timeLeft));
    UI.setStatus('TIME', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, t <= 10 && G.timing);
  } else UI.setStatus('MOVES', G.st.moves, false);
}

function tickLoop() {
  const now = performance.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;
  if (G.mode !== 'time' || !G.timing || G.over || UI.isOpen() || document.hidden || G.loading) return;
  const before = Math.ceil(G.timeLeft);
  G.timeLeft -= Math.min(dt, 0.5);
  if (Math.ceil(G.timeLeft) !== before && G.timeLeft <= 10 && G.timeLeft > 0) sfx.tickTock();
  if (G.timeLeft <= 0) { G.timeLeft = 0; updateStatus(); fail('time'); return; }
  updateStatus();
}

// ---- playing -------------------------------------------------------------------------------------------------------------
function onSwipe(dir) {
  if (!G.L || G.over || G.loading || UI.isOpen()) return;
  if (G.busy) { G.queue = dir; return; }
  doMove(dir);
}

function doMove(dir) {
  const L = G.L;
  const prev = cloneState(G.st);
  const res = slide(L, G.st, dir);
  if (res.steps === 0) { renderer.bump(dir); return; }
  G.history.push(prev);
  G.dirs.push(dir);
  G.busy = true;
  hideHand();
  if (G.mode === 'time') G.timing = true;
  Store.stat('totalMoves');
  for (const ev of res.events) if (ev.t === 1) { /* portal use counted by render event */ }
  const endKind = L.kind[G.st.pos] === STICKY ? 'sticky' : 'wall';
  updateStatus();
  renderer.playSlide(res.events, { steps: res.steps, endKind, dir }, onSlideEnd);
}

function onSlideEnd() {
  G.busy = false;
  if (G.over) return;
  if (isWon(G.st)) { win(); return; }
  if (G.mode === 'moves' && G.st.moves >= G.L.maxMoves) { fail('moves'); return; }
  if (!hasMoves(G.L, G.st)) { fail('stuck'); return; }
  if (G.queue !== null) {
    const d = G.queue;
    G.queue = null;
    doMove(d);
    return;
  }
  updateHand();
}

function undo() {
  if (G.over || G.busy || !G.history.length || UI.isOpen()) { if (!G.history.length && !G.over) UI.toast('Nothing to undo'); return; }
  G.st = G.history.pop();
  G.dirs.pop();
  G.undos++;
  Store.stat('undos');
  renderer.syncToState(G.st);
  renderer.burst(renderer.ballPos, '#ffffff', 8);
  sfx.undo();
  updateStatus();
  updateHand();
}

function restart() {
  if (!G.L || G.busy || UI.isOpen()) return;
  G.st = newState(G.L);
  G.history = []; G.dirs = []; G.queue = null; G.over = false;
  G.timeLeft = G.L.timeLimit; G.timing = false;
  renderer.syncToState(G.st);
  renderer.burst(renderer.ballPos, '#ffffff', 10);
  updateStatus();
  updateHand();
}

function startsWith(a, b) {
  if (a.length > b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Next hinted swipe from the player's current position, or null. */
function findHint(allowSolve) {
  const L = G.L;
  for (const sol of [L.solution, L.alt]) {
    if (sol && G.dirs.length < sol.length && startsWith(G.dirs, sol)) return sol[G.dirs.length];
  }
  if (!allowSolve) return null;
  const r = solve(L, G.st, { maxNodes: 120000, maxMs: 900 });
  return r.moves && r.moves.length ? r.moves[0] : null;
}

function hint() {
  if (!G.L || G.over || G.busy || UI.isOpen()) return;
  const S = Store.S();
  if (S.coins < HINT_COST) { sfx.deny(); UI.toast(`Hints cost ${HINT_COST} coins`); return; }
  const d = findHint(true);
  if (d === null) {
    sfx.deny();
    UI.toast('No hint from here. Try Undo or Restart!');
    return;
  }
  Store.spendCoins(HINT_COST);
  Store.stat('hintsUsed');
  G.hints++;
  // light up the path the swipe would take
  const c = cloneState(G.st);
  const r = slide(G.L, c, d);
  const cells = r.events.filter((e) => e.t === 0 || e.t === 1).map((e) => e.i);
  renderer.showHint(cells, d);
  sfx.hint();
  UI.updateDots();
}

// ---- tutorial hand ------------------------------------------------------------------------------------------------------------
function hideHand() { $('#hand').classList.add('hidden'); }
function updateHand() {
  const hand = $('#hand');
  if (!G.L || G.over || G.busy || UI.isOpen() || G.mode !== 'classic' || G.n > 2 || G.replay) { hand.classList.add('hidden'); return; }
  const d = findHint(false);
  if (d === null) { hand.classList.add('hidden'); return; }
  const p = renderer.toScreen(renderer.ballPos.x, renderer.ballPos.y, renderer.ballPos.z);
  hand.style.left = `${p.x}px`;
  hand.style.top = `${p.y}px`;
  hand.dataset.dir = d;
  hand.classList.remove('hidden');
}

// ---- render events -> sound, haptics, economy ---------------------------------------------------------------------------------------
function onRenderEvent(type, d) {
  switch (type) {
    case 'whoosh': sfx.whoosh(d.steps); break;
    case 'paint': sfx.tick(d.step); break;
    case 'coin': {
      Store.addCoins(1, true);
      UI.setCoins(Store.S().coins, true);
      const t = Store.S().taken;
      if (t && t.k === `${G.mode}:${G.n}`) t.c.push(d.cell);
      break;
    }
    case 'impact': sfx.thud(d.power); haptics.bump(d.power); break;
    case 'blocked': sfx.blocked(); haptics.tap(); break;
    case 'portal': sfx.portal(); Store.stat('portalsUsed'); break;
    case 'arrow': sfx.arrow(); break;
    case 'seal': sfx.seal(); Store.stat('sealsClosed'); break;
    case 'sticky': sfx.sticky(); Store.stat('stickyStops'); haptics.bump(5); break;
    default: break;
  }
}

// ---- finishing a level -------------------------------------------------------------------------------------------------------------
function starsFor(moves, par) {
  if (moves <= Math.ceil(par * 1.25) + 1) return 3;
  if (moves <= Math.ceil(par * 1.7) + 2) return 2;
  return 1;
}

function win() {
  G.over = true;
  const S = Store.S();
  const { L, mode, n } = G;
  const moves = G.st.moves;
  const stars = starsFor(moves, L.par);
  const key = `${mode}:${n}`;
  const first = !G.replay;
  let coins = 0;
  if (first) {
    coins = 8 + Math.floor(L.total / 5) + stars * 4 + (mode === 'moves' ? 6 : 0) + (mode === 'time' ? Math.floor(G.timeLeft / 3) : 0);
  }
  if ((S.stars[key] || 0) < stars) {
    if (stars === 3) Store.stat('threeStars');
    S.stars[key] = stars;
  }
  Store.addCoins(coins);
  Store.stat('levelsDone');
  Store.countLevelToday();
  if (first) {
    S.level[mode] = n + 1;
    S.taken = null;
  }
  let chest = null;
  if (first && n % 5 === 0) {
    Store.stat('chests');
    const nChest = Store.S().stats.chests;
    const cc = Math.min(600, 100 + 20 * Math.floor(n / 5));
    let ball = null;
    if (nChest % 3 === 0) {
      const pool = Store.unownedBalls().filter((b) => b.rarity !== 'legendary');
      if (pool.length) ball = pool[(Math.random() * pool.length) | 0];
    }
    chest = { coins: cc, ball };
  }
  Store.persist(true);
  UI.setCoins(S.coins);
  renderer.celebrate();
  sfx.win();
  haptics.success();
  UI.flash();
  UI.updateDots();
  const extra = mode === 'time' ? { label: 'TIME LEFT', value: `${Math.ceil(G.timeLeft)}s` } : null;
  setTimeout(() => {
    UI.showWin({
      n, stars, moves, par: L.par, coins, mode, maxMoves: L.maxMoves, extra,
      onNext: () => goNext(chest),
      onReplay: () => { startLevel(mode, n, { noLeave: true }); },
    });
  }, 1100);
}

function goNext(chest) {
  const next = G.n + 1;
  const proceed = () => startLevel(G.mode, G.replay ? Math.min(next, Store.S().level[G.mode]) : Store.S().level[G.mode], {});
  if (chest) {
    Store.addCoins(chest.coins);
    if (chest.ball) Store.ownBall(chest.ball.id);
    Store.persist(true);
    UI.showChest({ coins: chest.coins, ball: chest.ball, onDone: () => { UI.updateDots(); proceed(); } });
  } else proceed();
}

function fail(kind) {
  if (G.over) return;
  G.over = true;
  hideHand();
  setTimeout(() => {
    UI.showFail({
      kind, n: G.n, skipCost: SKIP_COST,
      onRetry: () => { G.over = false; restart(); },
      onSkip: skipLevel,
    });
  }, 350);
}

function skipLevel() {
  const S = Store.S();
  if (!G.L) return;
  if (S.coins < SKIP_COST) { sfx.deny(); UI.toast(`Skipping costs ${SKIP_COST} coins`); G.over = false; return; }
  Store.spendCoins(SKIP_COST);
  if (G.n === S.level[G.mode]) { S.level[G.mode] = G.n + 1; S.taken = null; }
  Store.persist(true);
  UI.updateDots();
  startLevel(G.mode, Math.min(G.n + 1, S.level[G.mode]), {});
}

function maybeInstallTip() {
  const S = Store.S();
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (ios && !standalone && !S.seen.install && (S.stats.levelsDone || 0) >= 2) {
    S.seen.install = true; Store.persist();
    UI.toast('Tip: tap Share, then "Add to Home Screen" to play offline', 5200);
  }
}

boot();

// handy for debugging from the console / automated tests
window.__glyde = { G, Store, UI, Audio, get renderer() { return renderer; }, startLevel, TILE_INFO, THEMES, BALLS, DX, DY };
