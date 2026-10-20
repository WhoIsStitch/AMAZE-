// DOM screens and HUD. Game logic lives in main.js, which plugs into `hooks`.
import { BALLS, BALL_BY_ID, RARITIES, THEMES, THEME_BY_ID, TILE_INFO, ACHIEVEMENTS, DAILY_REWARDS } from './data.js';
import * as Store from './store.js';
import { sfx } from './audio.js';
import { haptics } from './haptics.js';
import { ballImage, releasePreview } from './preview.js';

export const hooks = {};
const stack = [];
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const svg = (id, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24"><use href="#i-${id}"/></svg>`;
const fmt = (n) => Number(n).toLocaleString('en-US');
const tick = () => new Promise((r) => setTimeout(r, 0));

export const MODE_INFO = {
  classic: { name: 'CLASSIC', desc: 'Paint every tile. No limits, just you and the maze.', icon: 'ball', cls: 'm-classic' },
  moves: { name: 'LIMITED MOVES', desc: 'Every swipe counts. Finish before you run out.', icon: 'moves', cls: 'm-moves' },
  time: { name: 'TIME RUSH', desc: 'The clock starts on your first swipe. Be quick!', icon: 'clock', cls: 'm-time' },
};

export function isOpen() { return stack.length > 0; }

function tap(el, fn, silent) {
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!silent) { sfx.click(); haptics.tap(); }
    fn(e);
  });
}

function mount(html, { kind = 'modal', onClose } = {}) {
  const el = document.createElement('div');
  el.className = `screen ${kind}`;
  el.innerHTML = html;
  $('#screens').appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
  const rec = { el, onClose, closed: false };
  stack.push(rec);
  hooks.screens && hooks.screens();
  return rec;
}

export function closeScreen(rec) {
  if (!rec || rec.closed) return;
  rec.closed = true;
  rec.el.classList.remove('in');
  const i = stack.indexOf(rec);
  if (i >= 0) stack.splice(i, 1);
  setTimeout(() => rec.el.remove(), 280);
  if (rec.onClose) rec.onClose();
  hooks.screens && hooks.screens();
}
export function closeAll() { [...stack].forEach(closeScreen); }

// ---- HUD ---------------------------------------------------------------------------------------------------
export function initHud() {
  const ic = (id, name) => { $(id).insertAdjacentHTML('afterbegin', svg(name)); };
  ic('#btn-settings', 'gear'); ic('#btn-daily', 'calendar'); ic('#btn-modes', 'modes'); ic('#btn-themes', 'brush');
  ic('#btn-ach', 'trophy'); ic('#btn-balls', 'ball');
  $('#btn-undo .ico').innerHTML = svg('undo');
  $('#btn-hint .ico').innerHTML = svg('bulb');
  $('#btn-restart .ico').innerHTML = svg('restart');
  $('#btn-settings').style.color = '#fff';
}

export function setCoins(n, bump = false) {
  $('#coin-count').textContent = fmt(n);
  $$('.coin-live').forEach((e) => { e.textContent = fmt(n); });
  if (bump) {
    const c = $('#coins');
    c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
  }
}

export function setTitle(n) { $('#level-title').textContent = `LEVEL ${n}`; }

export function setStage(n, ballUrl) {
  const idx = (n - 1) % 5;
  let html = `<div class="fillbar" style="width:calc((100% - 44px) * ${idx / 4})"></div>`;
  for (let j = 0; j < 5; j++) {
    if (j === 4) html += `<div class="node chest ${idx === 4 ? 'hot' : ''}">${svg('chest')}</div>`;
    else if (j < idx) html += `<div class="node done">${svg('check')}</div>`;
    else if (j === idx) html += `<div class="node cur"><img alt="" src="${ballUrl || ''}"></div>`;
    else html += '<div class="node next"></div>';
  }
  $('#stage').innerHTML = html;
}

export function setStatus(label, val, warn = false) {
  $('#status-label').textContent = label;
  $('#status-val').textContent = val;
  $('#status').classList.toggle('warn', warn);
}

export function updateDots() {
  $('#dot-ach').classList.toggle('hidden', Store.claimableCount() === 0);
  $('#dot-daily').classList.toggle('hidden', !Store.dailyAvailable());
  const s = Store.S();
  const newTheme = THEMES.some((t) => Store.themeUnlocked(t) && !s.seen['t_' + t.id] && t.id !== 'wood');
  $('#dot-themes').classList.toggle('hidden', !newTheme);
  const afford = BALLS.some((b) => !s.owned.includes(b.id) && b.rarity === 'common' && s.coins >= b.price);
  $('#dot-balls').classList.toggle('hidden', !afford);
  updateDailyChip();
}

export function updateDailyChip() {
  const el = $('#daily-timer');
  if (Store.dailyAvailable()) { el.textContent = 'CLAIM!'; el.classList.add('ready'); return; }
  el.classList.remove('ready');
  const ms = Store.msToMidnight();
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  el.textContent = `${h}H ${String(m).padStart(2, '0')}M`;
}

let toastT = null;
export function toast(msg, ms = 1800) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), ms);
}

export function flash() {
  const f = $('#flash');
  f.classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
}

function coinChip(n, cls = '') { return `<span class="${cls}">${svg('coin', 'ci')}${fmt(n)}</span>`; }

// ---- generic modals -----------------------------------------------------------------------------------------
export function confirmBox({ title = 'ARE YOU SURE?', text = '', yes = 'YES', no = 'NO', yesCls = 'green', ribbon = '' }) {
  return new Promise((resolve) => {
    const rec = mount(`
      <div class="card"><div class="ribbon ${ribbon}">${title}</div>
        <div class="msg">${text}</div>
        <div class="btnrow"><button class="btn gray small" data-no>${no}</button><button class="btn ${yesCls}" data-yes>${yes}</button></div>
      </div>`, { onClose: () => resolve(false) });
    tap($('[data-no]', rec.el), () => closeScreen(rec));
    tap($('[data-yes]', rec.el), () => { rec.onClose = null; closeScreen(rec); resolve(true); });
  });
}

export function showFeature(kind) {
  const info = TILE_INFO[kind];
  const icon = { portal: 'portal', arrow: 'next', sticky: 'sticky', seal: 'seal' }[kind];
  const rec = mount(`
    <div class="card"><div class="ribbon orange">NEW TILE!</div>
      <div class="bigicon float" style="background:${info.color}">${svg(icon)}</div>
      <div class="page-title" style="font-size:40px;margin:0">${info.title}</div>
      <div class="msg" style="margin-top:10px">${info.text}</div>
      <button class="btn big" data-ok>GOT IT!</button>
    </div>`);
  tap($('[data-ok]', rec.el), () => closeScreen(rec));
  sfx.star(1);
  return rec;
}

export function showWin(info) {
  const { n, stars, moves, par, coins, mode, extra, onNext, onReplay } = info;
  const starHtml = [0, 1, 2].map((i) => `<svg viewBox="0 0 24 24" class="s${i}"><use href="#i-star"/></svg>`).join('');
  const rec = mount(`
    <div class="card"><div class="ribbon green">LEVEL ${n}</div>
      <div class="stars">${starHtml}</div>
      <div class="stats">
        <div class="stat"><span>MOVES</span><b>${moves}${mode === 'moves' ? ' / ' + info.maxMoves : ''}</b></div>
        ${extra ? `<div class="stat"><span>${extra.label}</span><b>${extra.value}</b></div>` : ''}
        ${coins > 0 ? `<div class="stat"><span>COINS</span><b>${svg('coin')}+<i class="count" data-to="${coins}">0</i></b></div>` : ''}
      </div>
      <div class="btnrow"><button class="btn blue small" data-replay>${svg('restart')}</button><button class="btn big" data-next>NEXT ${svg('next')}</button></div>
    </div>`);
  const svgs = $$('.stars svg', rec.el);
  svgs.forEach((s, i) => {
    if (i < stars) setTimeout(() => { s.classList.add('on'); sfx.star(i); haptics.tap(); }, 450 + i * 330);
  });
  // coin count-up
  const cnt = $('.count', rec.el);
  if (cnt) {
    const t0 = performance.now() + 300;
    const step = () => {
      const p = Math.min(1, Math.max(0, (performance.now() - t0) / 900));
      cnt.textContent = fmt(Math.round(coins * p));
      if (p < 1 && !rec.closed) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    setTimeout(() => sfx.coins(7), 350);
  }
  tap($('[data-next]', rec.el), () => { closeScreen(rec); onNext(); });
  tap($('[data-replay]', rec.el), () => { closeScreen(rec); onReplay(); });
  return rec;
}

export function showFail({ kind, n, onRetry, onSkip, skipCost }) {
  const t = kind === 'moves' ? ['OUT OF MOVES', 'You ran out of swipes. Plan the route, then go again!']
    : kind === 'time' ? ["TIME'S UP", 'The clock beat you this time. Be quick!']
      : ['TRAPPED!', 'No way to roll from here. Undo or restart.'];
  const rec = mount(`
    <div class="card"><div class="ribbon red">${t[0]}</div>
      <div class="bigicon" style="background:linear-gradient(#ff8aa0,#ee4766)">${svg(kind === 'time' ? 'clock' : 'restart')}</div>
      <div class="msg">${t[1]}</div>
      <div class="btnrow"><button class="btn gray small" data-skip>${svg('skip')} ${coinChip(skipCost)}</button><button class="btn big" data-retry>RETRY</button></div>
    </div>`);
  tap($('[data-retry]', rec.el), () => { closeScreen(rec); onRetry(); });
  tap($('[data-skip]', rec.el), () => { closeScreen(rec); onSkip(); });
  sfx.fail();
  return rec;
}

export function showChest({ coins, ball, onDone }) {
  const rec = mount(`
    <div class="card"><div class="ribbon orange">STAGE COMPLETE!</div>
      <div class="chest-big bigicon" style="background:transparent;box-shadow:none;width:170px;height:150px">${svg('chest')}</div>
      <div class="reveal"></div>
      <button class="btn big hidden" data-ok>AWESOME!</button>
    </div>`);
  const chest = $('.chest-big', rec.el);
  const reveal = $('.reveal', rec.el);
  chest.classList.add('float');
  const open = () => {
    chest.classList.remove('float'); chest.classList.add('open');
    sfx.chest(); haptics.success();
    reveal.innerHTML = `<div class="reward">${svg('coin')}+${fmt(coins)}</div>` + (ball ? `<div class="msg" style="margin:0">NEW BALL: ${ball.name.toUpperCase()}</div><div class="ballshow"><img alt="" src="${ballImage(ball)}"></div>` : '');
    $('[data-ok]', rec.el).classList.remove('hidden');
  };
  const hint = document.createElement('div');
  hint.className = 'msg';
  hint.textContent = 'TAP THE CHEST!';
  reveal.appendChild(hint);
  let opened = false;
  tap(chest, () => { if (opened) return; opened = true; open(); }, true);
  tap($('[data-ok]', rec.el), () => { closeScreen(rec); onDone && onDone(); });
  return rec;
}

export function showReveal(ball, { title = 'NEW BALL!', onEquip } = {}) {
  const rec = mount(`
    <div class="card"><div class="ribbon orange">${title}</div>
      <div class="ballshow"><img alt="" src="${ballImage(ball)}"></div>
      <div class="page-title" style="font-size:38px;margin:4px 0 0">${ball.name.toUpperCase()}</div>
      <div class="msg" style="color:${RARITIES.find((r) => r.id === ball.rarity).color}">${ball.rarity.toUpperCase()}</div>
      <div class="btnrow"><button class="btn gray small" data-no>NICE</button><button class="btn" data-equip>EQUIP</button></div>
    </div>`);
  tap($('[data-no]', rec.el), () => closeScreen(rec));
  tap($('[data-equip]', rec.el), () => { onEquip && onEquip(); closeScreen(rec); });
  sfx.chest();
  return rec;
}

// ---- modes ---------------------------------------------------------------------------------------------------
export function openModes() {
  const s = Store.S();
  const rec = mount(`
    <div class="card"><button class="xbtn" data-x>${svg('close')}</button><div class="ribbon">GAME MODES</div>
      <div class="mode-list">${Object.keys(MODE_INFO).map((m) => `
        <button class="mode ${MODE_INFO[m].cls} ${s.mode === m ? 'sel' : ''}" data-mode="${m}">
          <div class="mi">${svg(MODE_INFO[m].icon)}</div>
          <div><h3>${MODE_INFO[m].name}</h3><p>${MODE_INFO[m].desc}</p></div>
          <div class="lv">LV ${s.level[m]}</div>
        </button>`).join('')}
      </div>
    </div>`);
  tap($('[data-x]', rec.el), () => closeScreen(rec));
  $$('[data-mode]', rec.el).forEach((b) => tap(b, () => { closeScreen(rec); hooks.selectMode(b.dataset.mode); }));
}

// ---- balls shop ----------------------------------------------------------------------------------------------
const MYSTERY_COST = 600;
export function openBalls() {
  const s = Store.S();
  let tab = RARITIES.findIndex((r) => r.id === (BALL_BY_ID[s.ball] || BALLS[0]).rarity);
  const rec = mount(`
    <div class="page-head"><button class="backbtn" data-back>${svg('back')}</button><div class="coins">${svg('coin', 'coin-ico')}<b class="coin-live">${fmt(s.coins)}</b></div></div>
    <div class="page-title">BALLS</div>
    <div class="tabs">${RARITIES.map((r, i) => `<button class="tab" data-tab="${i}" style="background:${r.color}">${r.name}</button>`).join('')}</div>
    <div class="tabline"></div>
    <div class="page-body"><div class="grid3"></div>
      <button class="btn orange mystery" data-mystery>MYSTERY BALL ${coinChip(MYSTERY_COST)}</button>
    </div>`, { kind: 'page', onClose: () => { releasePreview(); hooks.shopClosed && hooks.shopClosed(); } });
  const grid = $('.grid3', rec.el);
  let gen = 0;

  const render = () => {
    const my = ++gen;
    $$('.tab', rec.el).forEach((t, i) => t.classList.toggle('on', i === tab));
    $('.tabline', rec.el).style.background = RARITIES[tab].color;
    const list = BALLS.filter((b) => b.rarity === RARITIES[tab].id);
    const cur = Store.S();
    grid.style.setProperty('--rc', RARITIES[tab].color);
    grid.innerHTML = list.map((b) => {
      const own = cur.owned.includes(b.id);
      const poor = !own && cur.coins < b.price;
      return `<button class="item ${own ? '' : 'locked'} ${cur.ball === b.id ? 'sel' : ''}" data-id="${b.id}" style="--rc:${RARITIES[tab].color}">
        <div class="skel"></div>
        ${cur.ball === b.id ? `<div class="tick">${svg('check')}</div>` : ''}
        ${own ? '' : `<div class="price ${poor ? 'poor' : ''}">${svg('coin')}${fmt(b.price)}</div>`}
      </button>`;
    }).join('');
    $$('.item', grid).forEach((el) => tap(el, () => onItem(el, BALL_BY_ID[el.dataset.id])));
    (async () => {
      for (const el of $$('.item', grid)) {
        await tick();
        if (my !== gen) return;
        const b = BALL_BY_ID[el.dataset.id];
        const img = new Image();
        img.alt = '';
        img.src = ballImage(b);
        const sk = $('.skel', el);
        if (sk) sk.replaceWith(img);
      }
    })();
  };

  const buy = async (b) => {
    const ok = await confirmBox({ title: b.name.toUpperCase(), text: `Buy for ${fmt(b.price)} coins?`, yes: 'BUY' });
    if (!ok) return;
    if (!Store.spendCoins(b.price)) { sfx.deny(); return; }
    Store.ownBall(b.id);
    sfx.buy(); haptics.success();
    hooks.equipBall(b.id);
    render(); updateDots();
  };
  const onItem = (el, b) => {
    const cur = Store.S();
    if (cur.owned.includes(b.id)) { hooks.equipBall(b.id); render(); return; }
    if (cur.coins < b.price) {
      sfx.deny(); haptics.bump(5);
      el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
      toast(`Need ${fmt(b.price - cur.coins)} more coins`);
      return;
    }
    buy(b);
  };
  $$('.tab', rec.el).forEach((t) => tap(t, () => { tab = +t.dataset.tab; render(); }));
  tap($('[data-back]', rec.el), () => closeScreen(rec));
  tap($('[data-mystery]', rec.el), () => {
    const cur = Store.S();
    const pool = Store.unownedBalls().filter((b) => b.rarity !== 'legendary' || Math.random() < 0.25);
    if (!pool.length) { toast('You own every ball!'); return; }
    if (cur.coins < MYSTERY_COST) { sfx.deny(); toast(`Need ${fmt(MYSTERY_COST - cur.coins)} more coins`); return; }
    Store.spendCoins(MYSTERY_COST);
    const w = { common: 6, rare: 3, epic: 1.2, legendary: 0.3 };
    let r = Math.random() * pool.reduce((a, b) => a + w[b.rarity], 0), pick = pool[0];
    for (const b of pool) { r -= w[b.rarity]; if (r <= 0) { pick = b; break; } }
    Store.ownBall(pick.id);
    tab = RARITIES.findIndex((x) => x.id === pick.rarity);
    render(); updateDots(); haptics.success();
    showReveal(pick, { onEquip: () => { hooks.equipBall(pick.id); render(); } });
  });
  render();
}

// ---- themes ------------------------------------------------------------------------------------------------------
function drawThemePreview(canvas, t, ballColor) {
  const S = 184;
  canvas.width = S; canvas.height = S;
  const c = canvas.getContext('2d');
  const rr = (x, y, w, h, r) => { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); };
  const g = c.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, t.bg[0]); g.addColorStop(1, t.bg[1]);
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  c.fillStyle = t.base; rr(12, 12, S - 24, S - 24, 16); c.fill();
  const pad = 20, cell = (S - pad * 2) / 3;
  const pat = ['FPB', 'WFW', 'FFW'];
  let seed = 3;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
    const ch = pat[y][x];
    const px = pad + x * cell, py = pad + y * cell;
    if (ch === 'W') {
      const col = t.palette ? t.palette[(rnd() * t.palette.length) | 0] : t.wall;
      c.fillStyle = 'rgba(0,0,0,.35)'; rr(px + 2, py + 6, cell - 4, cell - 4, 8); c.fill();
      c.fillStyle = col; rr(px + 2, py, cell - 4, cell - 6, 8); c.fill();
      c.fillStyle = 'rgba(255,255,255,.28)'; rr(px + 6, py + 3, cell - 12, 8, 4); c.fill();
      if (t.studs) { c.fillStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.arc(px + cell / 2, py + cell / 2 - 3, 8, 0, 7); c.fill(); }
      if (t.edge) { c.strokeStyle = t.edge[0]; c.lineWidth = 3; c.shadowColor = t.edge[0]; c.shadowBlur = 8; rr(px + 5, py + 3, cell - 10, cell - 12, 6); c.stroke(); c.shadowBlur = 0; }
    } else {
      c.fillStyle = ch === 'P' || ch === 'B' ? ballColor : t.floor;
      rr(px + 3, py + 3, cell - 6, cell - 6, 8); c.fill();
      if (t.edge && ch === 'F') { c.strokeStyle = t.edge[1]; c.globalAlpha = 0.6; c.lineWidth = 2; rr(px + 6, py + 6, cell - 12, cell - 12, 6); c.stroke(); c.globalAlpha = 1; }
      if (ch === 'B') {
        const cx = px + cell / 2, cy = py + cell / 2;
        const rg = c.createRadialGradient(cx - 6, cy - 7, 2, cx, cy, cell * 0.36);
        rg.addColorStop(0, '#fff'); rg.addColorStop(0.35, '#ffd24a'); rg.addColorStop(1, '#b77a00');
        c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(cx, cy + cell * 0.28, cell * 0.3, cell * 0.12, 0, 0, 7); c.fill();
        c.fillStyle = rg; c.beginPath(); c.arc(cx, cy, cell * 0.34, 0, 7); c.fill();
      }
    }
  }
}

export function openThemes() {
  const s = Store.S();
  const rec = mount(`
    <div class="page-head"><button class="backbtn" data-back>${svg('back')}</button><div class="coins">${svg('coin', 'coin-ico')}<b class="coin-live">${fmt(s.coins)}</b></div></div>
    <div class="page-title">THEMES</div>
    <div class="page-body"><div class="tlist"></div></div>`, { kind: 'page' });
  const list = $('.tlist', rec.el);
  const render = () => {
    const cur = Store.S();
    list.innerHTML = THEMES.map((t) => {
      const open = Store.themeUnlocked(t);
      return `<button class="theme ${open ? '' : 'locked'} ${cur.theme === t.id ? 'on' : ''}" data-id="${t.id}">
        <canvas></canvas>
        <div><h3>${t.name.toUpperCase()}</h3>${open ? '' : `<div class="need">${svg('lock')}LEVEL ${t.unlock}</div>`}</div>
        ${cur.theme === t.id ? `<div class="sel">${svg('check')}</div>` : ''}
      </button>`;
    }).join('');
    const ball = BALL_BY_ID[cur.ball] || BALLS[0];
    $$('.theme', list).forEach((el) => {
      const t = THEME_BY_ID[el.dataset.id];
      drawThemePreview($('canvas', el), t, ball.paint === 'rainbow' ? '#ff8ad0' : ball.paint);
      tap(el, () => {
        if (!Store.themeUnlocked(t)) { sfx.deny(); haptics.bump(5); toast(`Reach level ${t.unlock} to unlock`); return; }
        Store.S().seen['t_' + t.id] = true;
        hooks.equipTheme(t.id); render(); updateDots();
      });
    });
  };
  tap($('[data-back]', rec.el), () => closeScreen(rec));
  render();
}

// ---- achievements -----------------------------------------------------------------------------------------------
export function openAchievements() {
  const s = Store.S();
  const rec = mount(`
    <div class="page-head"><button class="backbtn" data-back>${svg('back')}</button><div class="coins">${svg('coin', 'coin-ico')}<b class="coin-live">${fmt(s.coins)}</b></div></div>
    <div class="page-title">ACHIEVEMENTS</div>
    <div class="page-sub" id="ach-sub"></div>
    <div class="page-body"><div class="alist"></div></div>`, { kind: 'page' });
  const list = $('.alist', rec.el);
  const render = () => {
    const cur = Store.S();
    const rows = ACHIEVEMENTS.map((a) => {
      const v = Store.achievementValue(a);
      return { a, v, done: !!cur.claimed[a.id], ready: !cur.claimed[a.id] && v >= a.target };
    });
    const done = rows.filter((r) => r.done).length;
    $('#ach-sub', rec.el).textContent = `COMPLETED ${done}/${rows.length}`;
    // within a category show only the next unfinished tier (+ finished ones at the bottom)
    const seenCat = new Set();
    const shown = [];
    rows.sort((x, y) => (y.ready - x.ready) || (x.done - y.done) || (y.v / y.a.target - x.v / x.a.target));
    for (const r of rows) {
      if (r.done) continue;
      const key = r.a.stat;
      if (!r.ready) { if (seenCat.has(key)) continue; seenCat.add(key); }
      shown.push(r);
    }
    for (const r of rows) if (r.done) shown.push(r);
    list.innerHTML = shown.map(({ a, v, done: d, ready }) => {
      const p = Math.min(1, v / a.target);
      return `<div class="ach ${d ? 'done' : ''} ${ready ? 'ready' : ''}" style="--ac:${a.color}">
        <div class="ai">${svg(a.icon)}</div>
        <div class="at"><h4>${a.title}</h4><p>${a.sub}</p><div class="bar"><i style="width:${p * 100}%"></i><b>${fmt(Math.min(v, a.target))}/${fmt(a.target)}</b></div></div>
        ${ready ? `<button class="btn small" data-claim="${a.id}">CLAIM ${svg('coin', 'ci')}${fmt(a.reward)}</button>`
    : d ? `<div class="rew">${svg('check')}</div>` : `<div class="rew">+${fmt(a.reward)}${svg('coin')}</div>`}
      </div>`;
    }).join('');
    $$('[data-claim]', list).forEach((b) => tap(b, () => {
      const a = ACHIEVEMENTS.find((x) => x.id === b.dataset.claim);
      Store.S().claimed[a.id] = true;
      Store.addCoins(a.reward);
      sfx.coins(8); haptics.success();
      toast(`+${fmt(a.reward)} coins!`);
      render(); updateDots();
    }));
  };
  tap($('[data-back]', rec.el), () => closeScreen(rec));
  render();
}

// ---- daily reward ------------------------------------------------------------------------------------------------
export function openDaily() {
  const s = Store.S();
  const avail = Store.dailyAvailable();
  const next = Store.dailyNextDay();
  const claimedUpTo = avail ? (next === 1 ? 0 : next - 1) : s.daily.day;
  const cell = (d) => {
    const r = DAILY_REWARDS[d - 1];
    const claimed = d <= claimedUpTo;
    const today = avail && d === next;
    const cls = `day ${d === 7 ? 'big' : ''} ${claimed ? 'claimed' : ''} ${today ? 'today' : ''}`;
    let body;
    if (claimed) body = svg('check');
    else if (today || d <= next) body = d === 7 ? svg('gift') : `${svg('coin')}`;
    else body = d === 7 ? svg('gift') : '?';
    const label = (claimed || today) && d !== 7 ? `<small>${fmt(r.coins)} COINS</small>` : (d === 7 ? `<small style="color:#a86a00;font-size:18px">${fmt(r.coins)} COINS + MYSTERY BALL</small>` : '');
    return `<div class="${cls}"><h4>DAY ${d}</h4><div class="body"><div>${body}${label}</div></div></div>`;
  };
  const rec = mount(`
    <div class="card"><button class="xbtn" data-x>${svg('close')}</button><div class="ribbon">DAILY REWARDS</div>
      <div class="daily-grid">${[1, 2, 3, 4, 5, 6].map(cell).join('')}${cell(7)}</div>
      ${avail ? '<button class="btn big" data-claim style="margin-top:20px">CLAIM!</button>' : `<div class="daily-foot">Come back tomorrow for day ${s.daily.day >= 7 ? 1 : s.daily.day + 1}!<br>Miss a day and the streak restarts.</div>`}
    </div>`);
  tap($('[data-x]', rec.el), () => closeScreen(rec));
  const cb = $('[data-claim]', rec.el);
  if (cb) tap(cb, () => {
    const day = Store.dailyNextDay();
    const r = DAILY_REWARDS[day - 1];
    const st = Store.S();
    st.daily.day = day; st.daily.last = Store.todayStr();
    Store.addCoins(r.coins);
    Store.stat('dailyClaims');
    sfx.coins(9); haptics.success();
    let ball = null;
    if (r.gift) {
      const pool = Store.unownedBalls().filter((b) => b.rarity !== 'legendary');
      if (pool.length) { ball = pool[(Math.random() * pool.length) | 0]; Store.ownBall(ball.id); }
    }
    Store.persist(true);
    closeScreen(rec);
    updateDots();
    toast(`+${fmt(r.coins)} coins!`, 2200);
    if (ball) setTimeout(() => showReveal(ball, { title: 'DAY 7 GIFT!', onEquip: () => hooks.equipBall(ball.id) }), 500);
    hooks.dailyClaimed && hooks.dailyClaimed();
  });
}

// ---- settings -----------------------------------------------------------------------------------------------------
export function openSettings({ skipCost }) {
  const s = Store.S();
  const row = (icon, label, key) => `<div class="row">${svg(icon)}<span class="sp">${label}</span><button class="sw ${s.settings[key] ? 'on' : ''}" data-sw="${key}" aria-label="${label}"></button></div>`;
  const rec = mount(`
    <div class="card"><button class="xbtn" data-x>${svg('close')}</button><div class="ribbon">SETTINGS</div>
      <div class="rows">
        ${row('sound', 'SOUND FX', 'sfx')}${row('music', 'MUSIC', 'music')}${row('vibe', 'VIBRATION', 'haptics')}
        <div class="row">${svg('gfx')}<span class="sp">GRAPHICS</span><div class="seg"><button data-q="high" class="${s.settings.quality === 'high' ? 'on' : ''}">HIGH</button><button data-q="low" class="${s.settings.quality === 'low' ? 'on' : ''}">LOW</button></div></div>
      </div>
      <div class="btnrow" style="margin-top:16px;flex-wrap:wrap"><button class="btn blue small" data-skip>${svg('skip')}SKIP LEVEL ${coinChip(skipCost)}</button><button class="btn red small" data-reset>RESET</button></div>
      <div class="fine">GLYDE · works fully offline<br>Add it to your Home Screen for fullscreen play.<br>iPhone vibration needs iOS 17.4+ and Settings → Sounds &amp; Haptics → System Haptics on.</div>
    </div>`);
  tap($('[data-x]', rec.el), () => closeScreen(rec));
  $$('[data-sw]', rec.el).forEach((b) => tap(b, () => {
    const k = b.dataset.sw;
    const st = Store.S();
    st.settings[k] = !st.settings[k];
    b.classList.toggle('on', st.settings[k]);
    Store.persist();
    hooks.settingChanged(k);
  }));
  $$('[data-q]', rec.el).forEach((b) => tap(b, () => {
    Store.S().settings.quality = b.dataset.q;
    $$('[data-q]', rec.el).forEach((x) => x.classList.toggle('on', x === b));
    Store.persist();
    hooks.settingChanged('quality');
  }));
  tap($('[data-skip]', rec.el), () => { closeScreen(rec); hooks.skip(); });
  tap($('[data-reset]', rec.el), async () => {
    const ok = await confirmBox({ title: 'RESET GAME?', text: 'This erases ALL progress, coins and balls.', yes: 'RESET', yesCls: 'red', ribbon: 'red' });
    if (ok) { closeAll(); hooks.resetProgress(); }
  });
}
