// All sound is synthesised with WebAudio: no audio files, nothing to download, works offline.

let ctx = null;
let master, sfxBus, musicBus, noiseBuf, delay;
let sfxOn = true;
let musicOn = true;
let musicTimer = null;
let nextNoteTime = 0;
let step = 0;

const PENTA = [0, 2, 4, 7, 9];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function init() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp);
  comp.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = sfxOn ? 0.8 : 0;
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = musicOn ? 0.5 : 0;
  musicBus.connect(master);
  delay = ctx.createDelay(1);
  delay.delayTime.value = 0.34;
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1800;
  delay.connect(lp); lp.connect(fb); fb.connect(delay);
  lp.connect(musicBus);
  // 1s of white noise, reused by every noisy effect
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });
}

export function unlock() {
  init();
  if (!ctx) return;
  if (ctx.state !== 'running') ctx.resume();
  startMusic();
}

export function setSfx(on) { sfxOn = on; if (sfxBus) sfxBus.gain.value = on ? 0.8 : 0; }
export function setMusic(on) {
  musicOn = on;
  if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 0.1);
  if (on) startMusic();
}

// ---- building blocks ---------------------------------------------------------------------------
function tone({ f = 440, f2 = null, type = 'sine', t = 0, dur = 0.15, vol = 0.3, attack = 0.005, bus = sfxBus, detune = 0 }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + t;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  o.detune.value = detune;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(bus || sfxBus);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}
function noise({ t = 0, dur = 0.2, vol = 0.3, f = 1000, f2 = null, q = 1, type = 'bandpass' }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + t;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const flt = ctx.createBiquadFilter();
  flt.type = type;
  flt.Q.value = q;
  flt.frequency.setValueAtTime(f, t0);
  if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.02, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(flt); flt.connect(g); g.connect(sfxBus);
  s.start(t0, Math.random() * 0.5);
  s.stop(t0 + dur + 0.05);
}

// ---- sound effects ---------------------------------------------------------------------------
export const sfx = {
  /** a tile gets painted: climbs a pentatonic scale with the length of the roll */
  tick(i = 0) {
    if (!sfxOn || !ctx) return;
    const deg = PENTA[i % 5] + 12 * Math.floor(i / 5 % 3);
    const f = mtof(67 + deg);
    tone({ f, type: 'sine', dur: 0.16, vol: 0.2 });
    tone({ f: f * 2, type: 'triangle', dur: 0.09, vol: 0.07 });
  },
  whoosh(len = 4) {
    if (!sfxOn || !ctx) return;
    const d = Math.min(0.5, 0.12 + len * 0.03);
    noise({ dur: d, vol: 0.16, f: 500, f2: 2400, q: 0.9 });
  },
  thud(power = 1) {
    if (!sfxOn || !ctx) return;
    tone({ f: 170, f2: 45, type: 'sine', dur: 0.18, vol: 0.5 * Math.min(1, 0.45 + power * 0.18) });
    noise({ dur: 0.08, vol: 0.14, f: 900, type: 'lowpass' });
  },
  blocked() {
    if (!sfxOn || !ctx) return;
    tone({ f: 120, f2: 80, type: 'triangle', dur: 0.09, vol: 0.18 });
  },
  portal() {
    if (!sfxOn || !ctx) return;
    tone({ f: 260, f2: 1300, type: 'sine', dur: 0.2, vol: 0.2 });
    tone({ f: 1300, f2: 420, type: 'triangle', t: 0.12, dur: 0.22, vol: 0.12 });
    noise({ dur: 0.22, vol: 0.07, f: 3000, f2: 800, q: 4 });
  },
  arrow() {
    if (!sfxOn || !ctx) return;
    tone({ f: 500, f2: 900, type: 'square', dur: 0.08, vol: 0.06 });
  },
  sticky() {
    if (!sfxOn || !ctx) return;
    tone({ f: 380, f2: 90, type: 'sine', dur: 0.26, vol: 0.32 });
    tone({ f: 190, f2: 60, type: 'sine', t: 0.07, dur: 0.2, vol: 0.2 });
  },
  seal() {
    if (!sfxOn || !ctx) return;
    noise({ dur: 0.2, vol: 0.28, f: 500, f2: 180, q: 0.8 });
    tone({ f: 90, f2: 40, type: 'square', dur: 0.2, vol: 0.12 });
  },
  click() {
    if (!sfxOn || !ctx) return;
    tone({ f: 720, f2: 380, type: 'sine', dur: 0.07, vol: 0.2 });
  },
  back() {
    if (!sfxOn || !ctx) return;
    tone({ f: 520, f2: 260, type: 'sine', dur: 0.09, vol: 0.18 });
  },
  undo() {
    if (!sfxOn || !ctx) return;
    tone({ f: 600, f2: 300, type: 'triangle', dur: 0.15, vol: 0.18 });
    noise({ dur: 0.14, vol: 0.06, f: 2400, f2: 600 });
  },
  hint() {
    if (!sfxOn || !ctx) return;
    [0, 4, 7].forEach((s, i) => tone({ f: mtof(76 + s), t: i * 0.07, dur: 0.25, vol: 0.14, type: 'sine' }));
  },
  star(i = 0) {
    if (!sfxOn || !ctx) return;
    const f = mtof(72 + i * 4);
    tone({ f, dur: 0.5, vol: 0.28, type: 'triangle' });
    tone({ f: f * 2, dur: 0.4, vol: 0.12, type: 'sine' });
  },
  win() {
    if (!sfxOn || !ctx) return;
    [0, 4, 7, 12, 16, 19].forEach((s, i) => {
      tone({ f: mtof(72 + s), t: i * 0.075, dur: 0.5, vol: 0.2, type: 'triangle' });
      tone({ f: mtof(84 + s), t: i * 0.075, dur: 0.35, vol: 0.06, type: 'sine' });
    });
    tone({ f: mtof(60), t: 0.4, dur: 1.1, vol: 0.18, type: 'sine' });
  },
  fail() {
    if (!sfxOn || !ctx) return;
    [0, -3, -7, -12].forEach((s, i) => tone({ f: mtof(67 + s), t: i * 0.13, dur: 0.3, vol: 0.2, type: 'triangle' }));
  },
  coins(n = 6) {
    if (!sfxOn || !ctx) return;
    for (let i = 0; i < n; i++) {
      tone({ f: mtof(84 + PENTA[i % 5]), t: i * 0.055, dur: 0.18, vol: 0.14, type: 'sine' });
      tone({ f: mtof(96 + PENTA[i % 5]), t: i * 0.055, dur: 0.1, vol: 0.05, type: 'triangle' });
    }
  },
  chest() {
    if (!sfxOn || !ctx) return;
    noise({ dur: 0.3, vol: 0.12, f: 400, f2: 3000, q: 2 });
    [0, 7, 12, 16, 19, 24].forEach((s, i) => tone({ f: mtof(72 + s), t: 0.2 + i * 0.06, dur: 0.4, vol: 0.16, type: 'triangle' }));
  },
  buy() {
    if (!sfxOn || !ctx) return;
    tone({ f: mtof(79), dur: 0.12, vol: 0.2, type: 'square' });
    tone({ f: mtof(86), t: 0.08, dur: 0.25, vol: 0.2, type: 'square' });
  },
  deny() {
    if (!sfxOn || !ctx) return;
    tone({ f: 200, f2: 150, type: 'square', dur: 0.16, vol: 0.12 });
    tone({ f: 200, f2: 150, type: 'square', t: 0.12, dur: 0.16, vol: 0.12 });
  },
  tickTock() {
    if (!sfxOn || !ctx) return;
    tone({ f: 1000, type: 'square', dur: 0.04, vol: 0.06 });
  },
};

// ---- music: a soft generative loop -------------------------------------------------------------
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G
const TEMPO = 92;

function startMusic() {
  if (!ctx || musicTimer || !musicOn) return;
  nextNoteTime = ctx.currentTime + 0.1;
  step = 0;
  musicTimer = setInterval(schedule, 120);
}

function schedule() {
  if (!ctx || ctx.state !== 'running') return;
  const spb = 60 / TEMPO / 2; // 8th note
  while (nextNoteTime < ctx.currentTime + 0.3) {
    const bar = Math.floor(step / 8) % CHORDS.length;
    const chord = CHORDS[bar];
    const s = step % 8;
    const t = nextNoteTime - ctx.currentTime;
    if (s === 0) {
      note(chord[0] - 12, t, 1.9, 0.22, 'sine');
      chord.forEach((m) => note(m, t, 3.2, 0.05, 'triangle', true));
    }
    if (s === 4 && Math.random() < 0.6) note(chord[0] - 5 - 12 + 12, t, 0.8, 0.1, 'sine');
    if (Math.random() < 0.62) {
      const m = chord[(Math.random() * 3) | 0] + 12 + (Math.random() < 0.35 ? 12 : 0);
      note(m, t, 0.5, 0.075, 'triangle', false, true);
    }
    nextNoteTime += spb;
    step++;
  }
}

function note(m, t, dur, vol, type, soft = false, echo = false) {
  const f = mtof(m);
  const t0 = ctx.currentTime + t;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + (soft ? 0.5 : 0.012));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(musicBus);
  if (echo) g.connect(delay);
  o.start(t0);
  o.stop(t0 + dur + 0.1);
}
