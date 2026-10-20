// Save data. Everything lives in localStorage so the app works fully offline.
import { ACHIEVEMENTS, BALLS, THEMES } from './data.js';

const KEY = 'glyde.save.v1';

const defaults = () => ({
  v: 1,
  coins: 150,
  level: { classic: 1, moves: 1, time: 1 },
  mode: 'classic',
  ball: 'gold',
  owned: ['gold'],
  theme: 'wood',
  stars: {}, // 'classic:12' -> 3
  settings: { sfx: true, music: true, haptics: true, quality: 'high' },
  seen: {}, // tutorial / feature intros
  daily: { day: 0, last: '' }, // day = last claimed day (1..7), last = yyyy-mm-dd
  play: { last: '', streak: 0, best: 0, today: 0, todayDate: '' },
  stats: {},
  claimed: {},
  stage: { chests: 0 },
  created: Date.now(),
});

let data = defaults();
let timer = null;
const listeners = new Set();

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      data = deepMerge(defaults(), parsed);
    }
  } catch (e) { /* private mode etc. */ }
  return data;
}

function deepMerge(base, over) {
  for (const k of Object.keys(over || {})) {
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object') deepMerge(base[k], over[k]);
    else base[k] = over[k];
  }
  return base;
}

export function persist(now = false) {
  const write = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ } };
  if (now) { clearTimeout(timer); write(); return; }
  clearTimeout(timer);
  timer = setTimeout(write, 250);
}
window.addEventListener('pagehide', () => persist(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(true); });

export const S = () => data;
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (what) => { for (const fn of listeners) fn(what); };

export function reset() {
  data = defaults();
  persist(true);
  emit('reset');
}

export function addCoins(n, collected = false) {
  data.coins += n;
  if (collected) stat('coinsCollected', n);
  persist();
  emit('coins');
}
export function spendCoins(n) {
  if (data.coins < n) return false;
  data.coins -= n;
  persist();
  emit('coins');
  return true;
}

export function stat(key, inc = 1) {
  data.stats[key] = (data.stats[key] || 0) + inc;
}
export function statMax(key, v) {
  if (v > (data.stats[key] || 0)) data.stats[key] = v;
}

export function maxLevel() {
  return Math.max(data.level.classic, data.level.moves, data.level.time);
}
export function themeUnlocked(t) {
  return maxLevel() >= t.unlock;
}

export function ownBall(id) {
  if (!data.owned.includes(id)) {
    data.owned.push(id);
    persist();
    emit('owned');
  }
}

export function achievementValue(a) {
  if (a.stat.startsWith('lvl_')) return data.level[a.stat.slice(4)] || 1;
  if (a.stat === 'ballsOwned') return data.owned.length;
  if (a.stat === 'bestStreak') return data.play.best || 0;
  return data.stats[a.stat] || 0;
}
export function claimableCount() {
  let c = 0;
  for (const a of ACHIEVEMENTS) if (!data.claimed[a.id] && achievementValue(a) >= a.target) c++;
  return c;
}

// ---- dates -----------------------------------------------------------------------------------
export function todayStr(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function dayDiff(a, b) {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}

/** Call once per launch: maintains the play-streak counter. */
export function touchDay() {
  const t = todayStr();
  const p = data.play;
  if (p.last !== t) {
    p.streak = p.last && dayDiff(p.last, t) === 1 ? p.streak + 1 : 1;
    p.best = Math.max(p.best, p.streak);
    p.last = t;
  }
  if (p.todayDate !== t) { p.today = 0; p.todayDate = t; }
  persist();
}
export function countLevelToday() {
  touchDay();
  data.play.today++;
  statMax('bestDay', data.play.today);
}

export function dailyAvailable() {
  return data.daily.last !== todayStr();
}
/** Which reward day (1..7) would be claimed next. Missing a day resets the cycle. */
export function dailyNextDay() {
  const d = data.daily;
  if (!d.last) return 1;
  const gap = dayDiff(d.last, todayStr());
  if (gap > 1) return 1;
  return d.day >= 7 ? 1 : d.day + 1;
}
export function msToMidnight() {
  const n = new Date();
  const m = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1);
  return m - n;
}

export function unownedBalls() {
  return BALLS.filter((b) => !data.owned.includes(b.id));
}
export function sanityCheck() {
  if (!BALLS.some((b) => b.id === data.ball) || !data.owned.includes(data.ball)) data.ball = 'gold';
  if (!THEMES.some((t) => t.id === data.theme)) data.theme = 'wood';
  if (!data.owned.includes('gold')) data.owned.push('gold');
}
