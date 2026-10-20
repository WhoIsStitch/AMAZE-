// Procedural textures and materials. Everything is drawn on <canvas> at runtime, so the game
// ships with zero image assets.
import * as THREE from '../vendor/three.module.min.js';
import { mulberry32 } from './rng.js';

// ---- noise -----------------------------------------------------------------------------------------
function h3(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const sm = (t) => t * t * (3 - 2 * t);
export function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = sm(x - xi), yf = sm(y - yi), zf = sm(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(h3(xi, yi, zi), h3(xi + 1, yi, zi), xf), l(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), xf), yf),
    l(l(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), xf), l(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), xf), yf),
    zf,
  );
}
export function fbm(x, y, z, o = 4) {
  let a = 0.5, s = 0, f = 1;
  for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f, z * f); f *= 2; a *= 0.5; }
  return s;
}

const mkCanvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
};
function toTex(c, { srgb = true, repeat = false, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso;
  return t;
}

/** Paint an equirectangular sphere texture by evaluating fn at each pixel's 3D point. */
function paintSphere(W, H, fn) {
  const c = mkCanvas(W, H), cx = c.getContext('2d');
  const img = cx.createImageData(W, H);
  let ec = null, eimg = null;
  for (let py = 0; py < H; py++) {
    const v = (py + 0.5) / H, th = v * Math.PI;
    const sy = Math.cos(th), sr = Math.sin(th);
    for (let px = 0; px < W; px++) {
      const u = (px + 0.5) / W, ph = u * Math.PI * 2;
      const x = -Math.cos(ph) * sr, z = Math.sin(ph) * sr;
      const r = fn(x, sy, z, u, v);
      const i = (py * W + px) * 4;
      img.data[i] = r.c[0]; img.data[i + 1] = r.c[1]; img.data[i + 2] = r.c[2]; img.data[i + 3] = 255;
      if (r.e) {
        if (!ec) { ec = mkCanvas(W, H); eimg = ec.getContext('2d').createImageData(W, H); }
        eimg.data[i] = r.e[0]; eimg.data[i + 1] = r.e[1]; eimg.data[i + 2] = r.e[2]; eimg.data[i + 3] = 255;
      }
    }
  }
  cx.putImageData(img, 0, 0);
  if (ec) ec.getContext('2d').putImageData(eimg, 0, 0);
  return { map: toTex(c), emissive: ec ? toTex(ec) : null };
}

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (s) => { const n = parseInt(s.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ---- ball skins ------------------------------------------------------------------------------------
const ballCache = new Map();
const W = 256, H = 128;

function icoGeo(detail, colors) {
  const g = new THREE.IcosahedronGeometry(0.5, detail); // already non-indexed, so each face can carry its own colour
  if (colors) {
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const rng = mulberry32(7);
    for (let i = 0; i < n; i += 3) {
      const c = new THREE.Color(colors[(rng() * colors.length) | 0]);
      for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r; col[(i + k) * 3 + 1] = c.g; col[(i + k) * 3 + 2] = c.b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  return g;
}

/** Returns { material, geometry: BufferGeometry|null (null = sphere), update(t) } */
export function ballLook(look) {
  const key = JSON.stringify(look);
  if (ballCache.has(key)) return ballCache.get(key);
  const out = buildBall(look);
  ballCache.set(key, out);
  return out;
}

function buildBall(look) {
  const k = look.kind;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  let material, geometry = null, update = null;

  if (k === 'metal') {
    material = std({ color: look.color, metalness: 1, roughness: look.rough ?? 0.25, envMapIntensity: 1.5 });
  } else if (k === 'plain') {
    material = phys({ color: look.color, metalness: 0, roughness: look.rough ?? 0.2, clearcoat: look.clearcoat ? 1 : 0.6, clearcoatRoughness: 0.1, envMapIntensity: 1.1 });
  } else if (k === 'tennis') {
    const t = paintSphere(W, H, (x, y, z, u, v) => {
      const n = fbm(x * 18, y * 18, z * 18, 2);
      let c = mix(hex('#c6e233'), hex('#e6f760'), n);
      // two seam curves
      const s1 = Math.abs(y - 0.55 * Math.sin(Math.atan2(z, x) * 2 + 0.6));
      const s2 = Math.abs(y + 0.55 * Math.sin(Math.atan2(z, x) * 2 + 0.6 + Math.PI));
      const seam = Math.min(s1, s2);
      c = mix(c, [250, 250, 245], 1 - smooth(0.04, 0.09, seam));
      return { c };
    });
    material = std({ map: t.map, roughness: 0.95, metalness: 0 });
  } else if (k === 'stripes') {
    const t = paintSphere(W, H, (x, y) => {
      const cols = ['#ff4b4b', '#ff9f43', '#ffe14d', '#4cd964', '#3aa0ff', '#8e5cff'];
      const f = (y * 0.5 + 0.5) * cols.length;
      const i = Math.min(cols.length - 1, Math.max(0, Math.floor(f)));
      const edge = Math.abs(f - Math.round(f));
      let c = hex(cols[i]);
      c = mix(c, [255, 255, 255], 1 - smooth(0.0, 0.06, edge));
      return { c };
    });
    material = std({ map: t.map, roughness: 0.75, metalness: 0 });
  } else if (k === 'crater') {
    const rng = mulberry32(11);
    const craters = [];
    for (let i = 0; i < 26; i++) {
      const th = Math.acos(2 * rng() - 1), ph = rng() * Math.PI * 2;
      craters.push([Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph), 0.1 + rng() * 0.24]);
    }
    const t = paintSphere(W, H, (x, y, z) => {
      let n = fbm(x * 5, y * 5, z * 5, 4);
      let shade = 0.55 + n * 0.5;
      for (const c of craters) {
        const d = Math.hypot(x - c[0], y - c[1], z - c[2]) / c[3];
        if (d < 1.25) shade += (d < 0.9 ? -0.22 * (1 - d) * 2 : 0.18 * (1 - Math.abs(d - 1.05) / 0.2));
      }
      shade = clamp01(shade);
      return { c: [shade * 230, shade * 232, shade * 240] };
    });
    material = std({ map: t.map, roughness: 0.95, metalness: 0 });
  } else if (k === 'eye') {
    const t = paintSphere(W, H, (x, y, z) => {
      const d = Math.hypot(x, y - 0.2, z - 1); // distance from the spot facing the camera
      let c = [248, 244, 242];
      const veins = fbm(x * 14, y * 14, z * 14, 3);
      c = mix(c, [235, 110, 120], smooth(0.5, 0.75, veins) * smooth(0.5, 1.4, d) * 0.7);
      if (d < 0.6) c = mix([70, 175, 255], [20, 70, 190], smooth(0.28, 0.6, d)); // iris
      if (d < 0.28) c = [8, 8, 14]; // pupil
      if (Math.hypot(x - 0.14, y - 0.5, z - 0.95) < 0.07) c = [255, 255, 255]; // glint
      return { c };
    });
    material = phys({ map: t.map, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03 });
  } else if (k === 'face') {
    const t = paintSphere(W, H, (x, y, z) => {
      let c = mix(hex('#ffd83a'), hex('#ffee88'), clamp01(y * 0.5 + 0.5) * 0.6);
      if (z > 0.2) {
        const eye = (s) => Math.hypot((x - s * 0.32) / 0.09, (y - 0.3) / 0.15);
        const smileY = -0.12 - 0.22 * (1 - (x / 0.5) * (x / 0.5));
        if (eye(1) < 1 || eye(-1) < 1) c = [48, 30, 10];
        else if (Math.abs(x) < 0.5 && Math.abs(y - smileY) < 0.035) c = [48, 30, 10];
      }
      return { c };
    });
    material = phys({ map: t.map, roughness: 0.25, clearcoat: 0.8 });
  } else if (k === 'basket') {
    const t = paintSphere(W, H, (x, y, z) => {
      let c = mix(hex('#e8731a'), hex('#ff9b3d'), fbm(x * 12, y * 12, z * 12, 2));
      const d = Math.min(Math.abs(y), Math.abs(x), Math.abs(Math.abs(z) - 0.8) * 0.8);
      c = mix(c, [32, 18, 10], 1 - smooth(0.02, 0.055, d));
      return { c };
    });
    material = std({ map: t.map, roughness: 0.65, metalness: 0 });
  } else if (k === 'ice') {
    const t = paintSphere(W, H, (x, y, z) => {
      const n = fbm(x * 4, y * 4, z * 4, 4);
      const crack = Math.abs(fbm(x * 7 + 3, y * 7, z * 7, 3) - 0.5);
      let c = mix(hex('#4cb8f5'), hex('#a8e4ff'), n);
      c = mix(c, [235, 250, 255], 1 - smooth(0.0, 0.02, crack));
      return { c };
    });
    material = phys({ map: t.map, roughness: 0.08, metalness: 0.05, clearcoat: 1, envMapIntensity: 1.1 });
  } else if (k === 'swirl') {
    const t = paintSphere(W, H, (x, y, z, u, v) => {
      const s = (u * 6 + v * 3.2) % 1;
      const c = s < 0.5 ? hex('#ff4f9a') : [255, 245, 250];
      return { c };
    });
    material = phys({ map: t.map, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
  } else if (k === 'galaxy') {
    const t = paintSphere(W, H, (x, y, z) => {
      const n = fbm(x * 3, y * 3, z * 3, 5);
      const n2 = fbm(x * 5 + 9, y * 5, z * 5, 4);
      let c = mix(hex('#0a0630'), hex('#5b2bb8'), smooth(0.35, 0.8, n));
      c = mix(c, hex('#ff4fb0'), smooth(0.55, 0.85, n2) * 0.7);
      const star = h3(Math.floor(x * 60), Math.floor(y * 60), Math.floor(z * 60));
      if (star > 0.985) c = mix(c, [255, 255, 255], 1);
      return { c, e: c.map((q) => q * 0.55) };
    });
    material = std({ map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.3 });
  } else if (k === 'earth') {
    const t = paintSphere(W, H, (x, y, z) => {
      const n = fbm(x * 2.4 + 1, y * 2.4, z * 2.4, 5);
      const land = smooth(0.5, 0.54, n);
      const lat = Math.abs(y);
      let c = mix(hex('#1a64c8'), hex('#3ea0f0'), fbm(x * 8, y * 8, z * 8, 2));
      const g = mix(hex('#3f9d4a'), hex('#9a8a4a'), smooth(0.55, 0.7, n));
      c = mix(c, g, land);
      c = mix(c, [245, 250, 255], smooth(0.82, 0.92, lat));
      const cl = smooth(0.58, 0.72, fbm(x * 4 + 5, y * 4, z * 4 + 2, 4));
      c = mix(c, [255, 255, 255], cl * 0.85);
      return { c };
    });
    material = std({ map: t.map, roughness: 0.6, metalness: 0 });
  } else if (k === 'grid') {
    const t = paintSphere(W, H, (x, y, z, u, v) => {
      const gu = Math.abs(((u * 16) % 1) - 0.5), gv = Math.abs(((v * 8) % 1) - 0.5);
      const line = 1 - smooth(0.42, 0.5, Math.max(gu, gv));
      const c = mix(hex('#0b0a2a'), hex('#1a1060'), v);
      const glow = mix(hex('#00f0ff'), hex('#ff3df2'), v);
      return { c: mix(c, glow, line), e: [glow[0] * line, glow[1] * line, glow[2] * line] };
    });
    material = std({ map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.3, metalness: 0.6 });
  } else if (k === 'disco') {
    geometry = icoGeo(2, ['#ffffff', '#e8f0ff', '#fff0fa', '#d8fff6', '#fff6d8', '#f0d8ff']);
    material = std({ color: 0xffffff, vertexColors: true, metalness: 1, roughness: 0.04, flatShading: true, envMapIntensity: 2.2 });
  } else if (k === 'melon') {
    const t = paintSphere(W, H, (x, y, z) => {
      const a = Math.atan2(z, x);
      const w = Math.sin(a * 6 + fbm(x * 3, y * 3, z * 3, 2) * 4) * 0.5 + 0.5;
      const c = mix(hex('#1e8a3a'), hex('#8fe36a'), smooth(0.35, 0.7, w));
      return { c };
    });
    material = phys({ map: t.map, roughness: 0.3, clearcoat: 0.7 });
  } else if (k === 'circuit') {
    const rng = mulberry32(5);
    const cv = mkCanvas(512, 256), cx = cv.getContext('2d');
    cx.fillStyle = '#052a1c'; cx.fillRect(0, 0, 512, 256);
    const ev = mkCanvas(512, 256), ex = ev.getContext('2d');
    ex.fillStyle = '#000'; ex.fillRect(0, 0, 512, 256);
    for (const ctx2 of [cx, ex]) {
      ctx2.strokeStyle = '#3dffa0'; ctx2.fillStyle = '#9dffd0'; ctx2.lineWidth = 3; ctx2.lineCap = 'round';
    }
    const r2 = mulberry32(5);
    for (let i = 0; i < 46; i++) {
      let x = r2() * 512, y = r2() * 256;
      for (const ctx2 of [cx, ex]) { ctx2.beginPath(); ctx2.moveTo(x, y); }
      let px = x, py = y;
      const segs = 2 + ((r2() * 3) | 0);
      for (let s = 0; s < segs; s++) {
        const horiz = r2() < 0.5;
        const len = 20 + r2() * 60;
        const dx = horiz ? len * (r2() < 0.5 ? -1 : 1) : 0, dy = horiz ? 0 : len * (r2() < 0.5 ? -1 : 1);
        px += dx; py += dy;
        for (const ctx2 of [cx, ex]) ctx2.lineTo(px, py);
        px += dy ? 0 : 0;
      }
      for (const ctx2 of [cx, ex]) { ctx2.stroke(); ctx2.beginPath(); ctx2.arc(px, py, 5, 0, 7); ctx2.fill(); }
    }
    void rng;
    material = std({ map: toTex(cv), emissiveMap: toTex(ev), emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.35, metalness: 0.7 });
  } else if (k === 'hue') {
    material = std({ color: 0xff5599, metalness: 0.55, roughness: 0.15, envMapIntensity: 1.1, emissive: 0xff5599, emissiveIntensity: 0.32 });
    const col = new THREE.Color();
    update = (t) => { col.setHSL((t * 0.25) % 1, 1, 0.5); material.color.copy(col); material.emissive.copy(col); };
  } else if (k === 'diamond') {
    geometry = icoGeo(1, null);
    material = phys({ color: 0x8fe3ff, metalness: 0.35, roughness: 0.02, flatShading: true, envMapIntensity: 2.4, clearcoat: 1, emissive: 0x2db8ff, emissiveIntensity: 0.35, iridescence: 1 });
  } else if (k === 'fire') {
    const t = paintSphere(W, H, (x, y, z) => {
      const n = fbm(x * 3.2, y * 3.2 - 0.0, z * 3.2, 5);
      const f = smooth(0.25, 0.8, n);
      const c = mix(hex('#4a0600'), hex('#ff5a10'), f);
      const c2 = mix(c, hex('#ffe066'), smooth(0.6, 0.9, n));
      return { c: c2, e: c2 };
    });
    material = std({ map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.55 });
    update = (t) => { material.emissiveIntensity = 1.0 + Math.sin(t * 9) * 0.25 + Math.sin(t * 23) * 0.1; };
  } else if (k === 'ghost') {
    const t = paintSphere(W, H, (x, y, z) => {
      let c = [236, 251, 255];
      const fz = z > 0.3;
      if (fz) {
        if (Math.hypot((x - 0.3) / 0.1, (y - 0.25) / 0.17) < 1 || Math.hypot((x + 0.3) / 0.1, (y - 0.25) / 0.17) < 1) c = [24, 40, 70];
        if (Math.hypot(x / 0.12, (y + 0.1) / 0.18) < 1) c = [24, 40, 70];
      }
      return { c, e: c.map((q) => q * 0.35) };
    });
    material = std({ map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 0.25, transparent: true, opacity: 0.88 });
    update = (t) => { material.opacity = 0.8 + Math.sin(t * 3) * 0.08; };
  } else if (k === 'void') {
    const t = paintSphere(W, H, (x, y, z, u, v) => {
      const band = Math.exp(-Math.pow((y) / 0.12, 2));
      const sw = fbm(u * 12, v * 3, 0.5, 3);
      const c = mix([4, 2, 10], [30, 8, 70], sw * 0.6);
      const e = mix([40, 8, 120], [255, 160, 255], band * sw);
      return { c: mix(c, [255, 190, 255], band * 0.6), e: [e[0] * band, e[1] * band, e[2] * band] };
    });
    material = std({ map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.2, metalness: 0.9, envMapIntensity: 0.6 });
  } else {
    material = std({ color: 0xffffff });
  }
  return { material, geometry, update };
}

// ---- board themes ------------------------------------------------------------------------------------
const themeCache = new Map();

function noiseFill(cx, w, h, base, amt, rng, scale = 1) {
  cx.fillStyle = base; cx.fillRect(0, 0, w, h);
  const n = Math.floor((w * h) / (60 * scale));
  for (let i = 0; i < n; i++) {
    const a = rng() * amt;
    cx.fillStyle = rng() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.8})`;
    cx.fillRect(rng() * w, rng() * h, 1 + rng() * 2 * scale, 1 + rng() * 2 * scale);
  }
}

function woodCanvas(base, dark, light, seed = 1, S = 256) {
  const c = mkCanvas(S, S), cx = c.getContext('2d'), rng = mulberry32(seed);
  cx.fillStyle = base; cx.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 1) {
    const f = 0.5 + 0.5 * Math.sin(y * 0.55 + Math.sin(y * 0.09) * 3);
    cx.fillStyle = `rgba(${dark},${0.05 + 0.13 * f * rng()})`;
    cx.fillRect(0, y, S, 1);
  }
  for (let i = 0; i < 26; i++) {
    const y = rng() * S, a = 0.1 + rng() * 0.16;
    cx.strokeStyle = rng() < 0.6 ? `rgba(${dark},${a})` : `rgba(${light},${a})`;
    cx.lineWidth = 0.6 + rng() * 1.6;
    cx.beginPath(); cx.moveTo(0, y);
    const k = 1 + ((rng() * 3) | 0), ph = rng() * 6;
    for (let x = 0; x <= S; x += 8) cx.lineTo(x, y + Math.sin((x / S) * Math.PI * 2 * k + ph) * (1.5 + rng() * 2.5));
    cx.stroke();
  }
  for (let i = 0; i < 2; i++) {
    const kx = rng() * S, ky = rng() * S;
    for (let r = 3; r < 16; r += 2) {
      cx.strokeStyle = `rgba(${dark},${0.12})`; cx.lineWidth = 1;
      cx.beginPath(); cx.ellipse(kx, ky, r * 1.9, r * 0.8, 0, 0, 7); cx.stroke();
    }
  }
  return c;
}

export function themeTextures(theme) {
  if (themeCache.has(theme.id)) return themeCache.get(theme.id);
  const out = { wall: null, wallE: null, floor: null, floorE: null, base: null, wallBump: null };
  const S = 256;
  const rng = mulberry32(99);
  if (theme.tex === 'wood') {
    out.wall = toTex(woodCanvas('#ffffff', '110,55,20', '255,225,180', 3));
    out.floor = toTex(woodCanvas('#ffffff', '60,28,10', '255,200,150', 8));
    out.base = toTex(woodCanvas('#ffffff', '80,36,10', '255,200,140', 5), { repeat: true });
  } else if (theme.tex === 'bricks') {
    const c = mkCanvas(S, S), cx = c.getContext('2d');
    noiseFill(cx, S, S, '#fafafa', 0.05, rng);
    out.wall = toTex(c);
    const f = mkCanvas(S, S), fx = f.getContext('2d');
    noiseFill(fx, S, S, '#f1f3f7', 0.05, rng);
    fx.fillStyle = 'rgba(0,0,0,0.07)';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { fx.beginPath(); fx.arc(32 + i * 64, 32 + j * 64, 18, 0, 7); fx.fill(); }
    out.floor = toTex(f);
  } else if (theme.tex === 'neon') {
    const mk = (fill, line, w) => {
      const c = mkCanvas(S, S), cx = c.getContext('2d');
      cx.fillStyle = fill; cx.fillRect(0, 0, S, S);
      cx.shadowColor = line; cx.shadowBlur = 18; cx.strokeStyle = line; cx.lineWidth = w;
      cx.strokeRect(10, 10, S - 20, S - 20);
      cx.shadowBlur = 0; cx.strokeStyle = line; cx.lineWidth = w * 0.45; cx.strokeRect(10, 10, S - 20, S - 20);
      return c;
    };
    out.wall = toTex(mkCanvas(2, 2));
    const wc = mkCanvas(S, S), wx = wc.getContext('2d');
    wx.fillStyle = '#ffffff'; wx.fillRect(0, 0, S, S);
    wx.strokeStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < S; i += 32) { wx.beginPath(); wx.moveTo(i, 0); wx.lineTo(i, S); wx.stroke(); }
    out.wall = toTex(wc);
    out.wallE = toTex(mk('#000', theme.edge[0], 9));
    out.floor = null;
    out.floorE = toTex(mk('#000', theme.edge[1], 5));
  } else if (theme.tex === 'golf') {
    const f = mkCanvas(S, S), fx = f.getContext('2d');
    noiseFill(fx, S, S, '#ffffff', 0.1, rng, 0.4);
    for (let i = 0; i < 8; i++) { fx.fillStyle = i % 2 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'; fx.fillRect(0, i * 32, S, 32); }
    out.floor = toTex(f);
    const w = mkCanvas(S, S), wx = w.getContext('2d');
    noiseFill(wx, S, S, '#ffffff', 0.12, rng, 0.5);
    for (let i = 0; i < 60; i++) { wx.fillStyle = 'rgba(0,0,0,0.06)'; wx.beginPath(); wx.arc(rng() * S, rng() * S, 2 + rng() * 4, 0, 7); wx.fill(); }
    out.wall = toTex(w);
  } else if (theme.tex === 'volcanic') {
    const w = mkCanvas(S, S), wx = w.getContext('2d');
    const e = mkCanvas(S, S), ex = e.getContext('2d');
    noiseFill(wx, S, S, '#ffffff', 0.18, rng, 0.6);
    ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
    ex.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      let x = rng() * S, y = rng() * S;
      ex.strokeStyle = `rgba(255,${100 + rng() * 80 | 0},20,${0.5 + rng() * 0.5})`;
      ex.lineWidth = 1.5 + rng() * 2.5;
      ex.shadowColor = '#ff6a00'; ex.shadowBlur = 10;
      ex.beginPath(); ex.moveTo(x, y);
      for (let s = 0; s < 5; s++) { x += (rng() - 0.5) * 70; y += (rng() - 0.5) * 70; ex.lineTo(x, y); }
      ex.stroke();
    }
    out.wall = toTex(w); out.wallE = toTex(e);
    const f = mkCanvas(S, S), fx = f.getContext('2d');
    noiseFill(fx, S, S, '#ffffff', 0.12, rng, 0.8);
    out.floor = toTex(f);
  } else { // plastic
    const w = mkCanvas(S, S), wx = w.getContext('2d');
    wx.fillStyle = '#fff'; wx.fillRect(0, 0, S, S);
    const g = wx.createLinearGradient(0, 0, S, S); g.addColorStop(0, 'rgba(255,255,255,0.0)'); g.addColorStop(1, 'rgba(0,0,0,0.06)');
    wx.fillStyle = g; wx.fillRect(0, 0, S, S);
    out.wall = toTex(w);
    out.floor = out.wall;
  }
  themeCache.set(theme.id, out);
  return out;
}

// ---- special tile + effect textures -----------------------------------------------------------------
const misc = {};
export function glowTexture() {
  if (misc.glow) return misc.glow;
  const c = mkCanvas(128, 128), cx = c.getContext('2d');
  const g = cx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = g; cx.fillRect(0, 0, 128, 128);
  return (misc.glow = toTex(c));
}
export function shadowBlobTexture() {
  if (misc.blob) return misc.blob;
  const c = mkCanvas(128, 128), cx = c.getContext('2d');
  const g = cx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  cx.fillStyle = g; cx.fillRect(0, 0, 128, 128);
  return (misc.blob = toTex(c));
}
export function chevronTexture() {
  if (misc.chev) return misc.chev;
  const c = mkCanvas(128, 256), cx = c.getContext('2d');
  cx.clearRect(0, 0, 128, 256);
  cx.lineCap = 'round'; cx.lineJoin = 'round';
  for (let i = 0; i < 2; i++) {
    const y = 64 + i * 128;
    cx.strokeStyle = '#ffffff'; cx.lineWidth = 20;
    cx.beginPath(); cx.moveTo(22, y + 26); cx.lineTo(64, y - 18); cx.lineTo(106, y + 26); cx.stroke();
  }
  const t = toTex(c, { repeat: true });
  return (misc.chev = t);
}
export function portalTexture() {
  if (misc.portal) return misc.portal;
  const S2 = 256, c = mkCanvas(S2, S2), cx = c.getContext('2d');
  const img = cx.createImageData(S2, S2);
  for (let y = 0; y < S2; y++) for (let x = 0; x < S2; x++) {
    const dx = (x - 127.5) / 127.5, dy = (y - 127.5) / 127.5;
    const r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const spiral = 0.5 + 0.5 * Math.sin(a * 3 + r * 11);
    const edge = smooth(1.0, 0.8, r);
    const core = smooth(0.0, 0.5, r);
    const v = (0.35 + 0.65 * spiral) * edge * (0.4 + 0.6 * core);
    const i = (y * S2 + x) * 4;
    img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = Math.min(255, v * 255 + (1 - core) * edge * 60);
  }
  cx.putImageData(img, 0, 0);
  return (misc.portal = toTex(c));
}
export function crackTexture() {
  if (misc.crack) return misc.crack;
  const c = mkCanvas(128, 128), cx = c.getContext('2d'), rng = mulberry32(21);
  noiseFill(cx, 128, 128, '#b79566', 0.2, rng, 0.4);
  cx.strokeStyle = 'rgba(40,24,10,0.85)'; cx.lineWidth = 2.5; cx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    let x = 64 + (rng() - 0.5) * 30, y = 64 + (rng() - 0.5) * 30;
    cx.beginPath(); cx.moveTo(x, y);
    for (let s = 0; s < 4; s++) { x += (rng() - 0.5) * 60; y += (rng() - 0.5) * 60; cx.lineTo(x, y); }
    cx.stroke();
  }
  cx.strokeStyle = 'rgba(255,230,170,0.5)'; cx.lineWidth = 4; cx.strokeRect(5, 5, 118, 118);
  return (misc.crack = toTex(c));
}
export function ringTexture() {
  if (misc.ring) return misc.ring;
  const c = mkCanvas(128, 128), cx = c.getContext('2d');
  cx.strokeStyle = '#fff'; cx.lineWidth = 8; cx.shadowColor = '#fff'; cx.shadowBlur = 8;
  cx.beginPath(); cx.arc(64, 64, 46, 0, 7); cx.stroke();
  return (misc.ring = toTex(c));
}
