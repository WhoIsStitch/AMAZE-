// 3D renderer for GLYDE (Three.js, vendored so the game works offline).
import * as THREE from '../vendor/three.module.min.js';
import { WALL, PORTAL, ARROW, STICKY, SEAL, DX, DY } from './engine.js';
import {
  ballLook, themeTextures, glowTexture, shadowBlobTexture, chevronTexture, portalTexture, crackTexture, ringTexture,
} from './textures.js';
import { mulberry32 } from './rng.js';

const PORTAL_COLORS = ['#ff4fd8', '#3ad6ff', '#ffd23a'];
const ARROW_COLOR = '#2de2e6';
const TILE_H = 0.2; // floor tile thickness (top sits at y = 0)
const WALL_H = 0.72;
const BALL_R = 0.36;
const NEVER = -1e6; // sentinel: this tile has never been painted / coin never taken / seal still open
const LONG = -1e5; // sentinel: it happened a long time ago (no animation)

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

// ---- geometry helpers ---------------------------------------------------------------------------------
function roundedBox(w, h, d, r, seg = 2) {
  const n = seg * 2 + 1;
  const g = new THREE.BoxGeometry(1, 1, 1, n, n, n).toNonIndexed();
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  const hs = 0.5 / n;
  const half = [w / 2 - r, h / 2 - r, d / 2 - r];
  const p = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const ox = Math.abs(nor.getX(i)), oy = Math.abs(nor.getY(i));
    p.fromBufferAttribute(pos, i);
    nn.copy(p);
    nn.x -= Math.sign(nn.x) * hs; nn.y -= Math.sign(nn.y) * hs; nn.z -= Math.sign(nn.z) * hs;
    nn.normalize();
    const x = half[0] * Math.sign(p.x) + nn.x * r;
    const y = half[1] * Math.sign(p.y) + nn.y * r;
    const z = half[2] * Math.sign(p.z) + nn.z * r;
    pos.setXYZ(i, x, y, z);
    nor.setXYZ(i, nn.x, nn.y, nn.z);
    if (oy > 0.5) uv.setXY(i, x / w + 0.5, z / d + 0.5);
    else if (ox > 0.5) uv.setXY(i, z / d + 0.5, y / h + 0.5);
    else uv.setXY(i, x / w + 0.5, y / h + 0.5);
  }
  return g;
}

let GEO = null;
function geos() {
  if (GEO) return GEO;
  const coin = new THREE.CylinderGeometry(0.19, 0.19, 0.055, 24);
  coin.rotateX(Math.PI / 2 - 0.5);
  GEO = {
    tile: roundedBox(0.95, TILE_H, 0.95, 0.07, 1),
    wall: roundedBox(1, WALL_H + 0.1, 1, 0.1, 2),
    coin,
    stud: new THREE.CylinderGeometry(0.17, 0.17, 0.12, 16),
    plane: (() => { const p = new THREE.PlaneGeometry(1, 1); p.rotateX(-Math.PI / 2); return p; })(),
    sphere: new THREE.SphereGeometry(0.5, 40, 28),
    torus: new THREE.TorusGeometry(0.36, 0.055, 12, 36),
    sticky: new THREE.CylinderGeometry(0.4, 0.44, 0.12, 28),
    bubble: new THREE.SphereGeometry(0.1, 12, 10),
  };
  return GEO;
}

// ---- particles ----------------------------------------------------------------------------------------
class Particles {
  constructor(max, additive) {
    this.max = max;
    this.i = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.life0 = new Float32Array(max).fill(1);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.size0 = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { uScale: { value: 400 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        uniform float uScale; varying vec3 vC; varying float vA;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = max(0.0, size * uScale / -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        varying vec3 vC; varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.12, d) * vA;
          if (a < 0.01) discard; gl_FragColor = vec4(vC, a);
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.geo = g;
  }

  emit(x, y, z, vx, vy, vz, color, size, life, o = {}) {
    const i = this.i;
    this.i = (this.i + 1) % this.max;
    const k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    const c = color.isColor ? color : _c.set(color);
    this.col[k] = c.r; this.col[k + 1] = c.g; this.col[k + 2] = c.b;
    this.size[i] = size; this.size0[i] = size;
    this.life[i] = life; this.life0[i] = life;
    this.alpha[i] = o.alpha ?? 1;
    this.grav[i] = o.grav ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.grow[i] = o.grow ?? 0;
  }

  update(dt) {
    const { pos, vel, life, life0, size, size0, alpha, grav, drag, grow } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) { if (size[i] !== 0) { size[i] = 0; alpha[i] = 0; } continue; }
      life[i] -= dt;
      const k = i * 3;
      const dr = Math.max(0, 1 - drag[i] * dt);
      vel[k] *= dr; vel[k + 1] = vel[k + 1] * dr - grav[i] * dt; vel[k + 2] *= dr;
      pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
      const t = clamp(1 - life[i] / life0[i]);
      size[i] = size0[i] * (1 + grow[i] * t) * (t > 0.7 ? 1 - (t - 0.7) / 0.3 * 0.6 : 1);
      alpha[i] = life[i] <= 0 ? 0 : Math.min(1, (1 - t) * 2.2);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }
}

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _col = new THREE.Color();
const _col2 = new THREE.Color();
const QID = new THREE.Quaternion();
const _qo = new THREE.Quaternion();
const _eo = new THREE.Euler();

/** Soft studio environment so metals and glossy balls have something to reflect. */
export function createEnv(renderer, top = '#bfe3ff', bottom = '#4a3b52', warm = '#ffe2bd') {
  const scene = new THREE.Scene();
  const sph = new THREE.SphereGeometry(20, 24, 16);
  const cols = [];
  const pos = sph.attributes.position;
  const ct = new THREE.Color(top), cb = new THREE.Color(bottom), cm = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 20;
    cm.copy(cb).lerp(ct, clamp(y * 0.5 + 0.5)).multiplyScalar(0.9 + clamp(y) * 0.6);
    cols.push(cm.r, cm.g, cm.b);
  }
  sph.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  scene.add(new THREE.Mesh(sph, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const panel = (w, h, x, y, z, c, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  panel(14, 9, 0, 17, 4, '#ffffff', 9);
  panel(8, 12, -16, 7, 4, warm, 6);
  panel(10, 5, 14, 5, 12, '#cfe6ff', 5);
  panel(10, 4, 0, 4, -17, '#ffffff', 3);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.03);
  pm.dispose();
  sph.dispose();
  return rt.texture;
}

export class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.r = r;
    r.setClearColor(0x000000, 0);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping; // keeps the candy colours saturated
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.quality = 'high';

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.5, 300);
    this.fitCam = new THREE.PerspectiveCamera(32, 1, 0.5, 300);
    this.target = new THREE.Vector3();
    this.pitch = THREE.MathUtils.degToRad(61);
    this.dist = 30;
    this.safe = { top: 150, bottom: 110, left: 10, right: 10 };
    this.W = 1; this.H = 1;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x886644, 0.75);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3.5;
    this.scene.add(this.sun, this.sun.target);
    this.ballLight = new THREE.PointLight(0xffffff, 6, 5, 2);
    this.scene.add(this.ballLight);

    this.board = new THREE.Group();
    this.scene.add(this.board);
    this.leaving = [];
    this.outro = null;
    this.landed = true;

    this.particles = new Particles(900, false);
    this.glows = new Particles(500, true);
    this.scene.add(this.particles.points, this.glows.points);

    // ball
    this.ball = new THREE.Group();
    this.ballMesh = new THREE.Mesh(geos().sphere, new THREE.MeshStandardMaterial());
    this.ballMesh.castShadow = true;
    this.ballMesh.scale.setScalar(BALL_R * 2);
    this.ball.add(this.ballMesh);
    this.ballBlob = new THREE.Mesh(geos().plane, new THREE.MeshBasicMaterial({ map: shadowBlobTexture(), transparent: true, depthWrite: false, opacity: 0.9 }));
    this.ballBlob.scale.set(1.15, 1, 1.15);
    this.ballBlob.renderOrder = 2;
    this.scene.add(this.ball, this.ballBlob);

    this.ballPos = new THREE.Vector3();
    this.ballDir = 1;
    this.ballScaleMul = 1;
    this.squash = null;
    this.moving = false;
    this.stretch = 0;
    this.anim = null;
    this.shake = 0;
    this.time = 0;
    this.paintColor = new THREE.Color('#ffe066');
    this.rainbow = false;
    this.trailColor = new THREE.Color('#ffd24a');
    this.trailRainbow = false;
    this.ballUpdate = null;
    this.stepCount = 0;
    this.hintObjs = [];
    this.hintT = 0;
    this.celebrating = 0;
    this.camZoom = 1;
    this.introT = 99;
    this.maxDelay = 0;
    this.onEvent = () => {};
    this.L = null;
    this.st = null;
    this.theme = null;
    this.mats = null;
    this.envTex = null;
    this.hasCoins = true;

    this.blobFloor = null;
    this.clock = new THREE.Clock();
    this.running = false;
  }

  // ---- setup ------------------------------------------------------------------------------------------
  setQuality(q) {
    this.quality = q;
    this.r.shadowMap.enabled = q === 'high';
    this.sun.castShadow = q === 'high';
    this.sun.shadow.mapSize.set(q === 'high' ? 2048 : 512, q === 'high' ? 2048 : 512);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.resize();
  }

  resize(w = window.innerWidth, h = window.innerHeight) {
    this.W = w; this.H = h;
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 2.5 : 1.5);
    this.r.setPixelRatio(dpr);
    this.r.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.fitCam.aspect = w / h;
    const f = this.camera.fov * Math.PI / 180;
    const uScale = (h * dpr) / (2 * Math.tan(f / 2));
    this.particles.uniforms.uScale.value = uScale;
    this.glows.uniforms.uScale.value = uScale;
    this.fit();
  }

  setSafe(s) {
    this.safe = { ...this.safe, ...s };
    this.fit();
  }

  /** Distance at which the whole board fits inside the area between the HUD and the bottom bar. */
  fit() {
    if (!this.L) return;
    const { W, H, safe } = this;
    const hx = (W - safe.left - safe.right) / W;
    const hy = (H - safe.top - safe.bottom) / H;
    const bw = this.L.w + 0.8, bh = this.L.h + 0.8;
    const dir = new THREE.Vector3(0, Math.sin(this.pitch), Math.cos(this.pitch));
    const corners = [];
    for (const x of [-bw / 2, bw / 2]) for (const z of [-bh / 2, bh / 2]) for (const y of [-0.9, 0.9]) corners.push(new THREE.Vector3(x, y, z));
    let lo = 4, hi = 160;
    const v = new THREE.Vector3();
    const cam = this.fitCam;
    for (let it = 0; it < 28; it++) {
      const d = (lo + hi) / 2;
      cam.position.copy(this.target).addScaledVector(dir, d);
      cam.lookAt(this.target);
      cam.updateMatrixWorld(true);
      cam.updateProjectionMatrix();
      let mx = 0, my = 0;
      for (const c of corners) {
        v.copy(c).project(cam);
        mx = Math.max(mx, Math.abs(v.x)); my = Math.max(my, Math.abs(v.y));
      }
      if (mx <= hx && my <= hy) hi = d; else lo = d;
    }
    this.dist = hi;
    const cx = (safe.left + (W - safe.right)) / 2, cy = (safe.top + (H - safe.bottom)) / 2;
    this.camera.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
    this.camera.updateProjectionMatrix();
  }

  setTheme(theme) {
    this.theme = theme;
    const tx = themeTextures(theme);
    const M = THREE.MeshStandardMaterial;
    const emi = (map) => (map ? { emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 1.5 } : {});
    this.mats = {
      wall: new M({ color: 0xffffff, map: tx.wall, roughness: theme.rough, metalness: theme.metal || 0, envMapIntensity: 0.8, ...emi(tx.wallE) }),
      floor: new M({ color: 0xffffff, map: tx.floor, roughness: Math.min(0.9, theme.rough + 0.1), metalness: 0, envMapIntensity: 0.5, ...emi(tx.floorE), emissiveIntensity: 1.1 }),
      base: new M({ color: theme.base, map: tx.base, roughness: 0.6, metalness: 0, envMapIntensity: 0.4 }),
      stud: new M({ color: 0xffffff, roughness: 0.3, metalness: 0, envMapIntensity: 0.9 }),
      coin: new M({ color: 0xffc928, metalness: 0.9, roughness: 0.22, emissive: 0xff9a00, emissiveIntensity: 0.35, envMapIntensity: 1.6 }),
    };
    this.hemi.color.set(theme.sky); this.hemi.groundColor.set(theme.ground);
    this.hemi.intensity = theme.glow ? 0.5 : 0.55;
    this.sun.color.set(theme.sun);
    this.sun.intensity = theme.glow ? 1.1 : 1.3;
    this.scene.environment = null;
    if (this.envTex) this.envTex.dispose();
    const tops = { wood: ['#fff1de', '#6a4a3a', '#ffe0b8'], bricks: ['#e8f6ff', '#6a7a90', '#ffffff'], neon: ['#7a5cff', '#10082a', '#ff5cf2'], plastic: ['#fff0fb', '#8a70e0', '#fff'], golf: ['#e8fbff', '#3c7a3c', '#fffbe0'], volcanic: ['#ff9a5c', '#1a0505', '#ff7a2a'] };
    const e = tops[theme.id] || tops.wood;
    this.envTex = createEnv(this.r, e[0], e[1], e[2]);
    this.scene.environment = this.envTex;
    this.mats.wall.needsUpdate = true;
  }

  setBall(skin) {
    this.skin = skin;
    const look = ballLook(skin.look);
    this.ballMesh.geometry = look.geometry || geos().sphere;
    this.ballMesh.material = look.material;
    this.ballUpdate = look.update;
    this.rainbow = skin.paint === 'rainbow';
    this.trailRainbow = skin.trail === 'rainbow';
    this.paintColor.set(this.rainbow ? '#ff6ea8' : skin.paint);
    this.trailColor.set(this.trailRainbow ? '#ffffff' : skin.trail);
    this.ballLight.color.copy(this.rainbow ? _col.set('#ffffff') : this.paintColor);
    // repaint already-painted tiles in the new colour, without disturbing any animation in flight
    if (this.L && this.st) {
      for (let k = 0; k < this.floorCells.length; k++) {
        if (!this.st.painted[this.floorCells[k]]) continue;
        const c = this.paintColorFor(k + (this.L.n || 0));
        this.paintRGB[k * 3] = c.r; this.paintRGB[k * 3 + 1] = c.g; this.paintRGB[k * 3 + 2] = c.b;
      }
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    const loop = () => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, this.clock.getDelta());
      this.update(dt);
      this.r.render(this.scene, this.camera);
    };
    loop();
  }

  cell(i) {
    const w = this.L.w;
    return { x: (i % w) - this.cx, z: ((i / w) | 0) - this.cz };
  }

  // ---- building a level -------------------------------------------------------------------------------
  /**
   * Build the 3D board for a level. `st` is the engine state to display.
   * opts.intro: play the drop-in animation; opts.coins: spawn collectible coins; opts.leave: let the old board fall away.
   */
  loadLevel(L, st, opts = {}) {
    const old = this.board;
    if (opts.leave && this.L) {
      this.leaving.push({ group: old, t: 0 });
    } else this.disposeGroup(old);
    this.board = new THREE.Group();
    this.scene.add(this.board);
    this.L = L; this.st = st;
    this.hasCoins = opts.coins !== false;
    this.cx = (L.w - 1) / 2; this.cz = (L.h - 1) / 2;
    this.target.set(0, 0.1, 0);
    const G = geos();
    const T = this.theme, mats = this.mats;
    const N = L.w * L.h;
    const rng = mulberry32(L.n * 131 + 7);

    this.floorCells = [];
    this.wallCells = [];
    this.tileOf = new Int16Array(N).fill(-1);
    this.wallOf = new Int16Array(N).fill(-1);
    this.coinOf = new Int16Array(N).fill(-1);
    this.coinCells = [];
    for (let i = 0; i < N; i++) {
      if (L.kind[i] === WALL) { this.wallOf[i] = this.wallCells.length; this.wallCells.push(i); } else {
        this.tileOf[i] = this.floorCells.length; this.floorCells.push(i);
        if (L.kind[i] === SEAL) { this.wallOf[i] = this.wallCells.length; this.wallCells.push(i); }
        if (this.hasCoins && i !== L.start && L.kind[i] !== PORTAL) { this.coinOf[i] = this.coinCells.length; this.coinCells.push(i); }
      }
    }
    const nf = this.floorCells.length, nw = this.wallCells.length;
    this.paintedAt = new Float32Array(nf).fill(NEVER);
    this.popAt = new Float32Array(nf).fill(-99);
    this.paintRGB = new Float32Array(nf * 3);
    this.coinTaken = new Float32Array(this.coinCells.length).fill(NEVER);
    for (const ti of opts.taken || []) if (this.coinOf[ti] >= 0) this.coinTaken[this.coinOf[ti]] = LONG;
    this.sealedAt = new Float32Array(nw).fill(NEVER);
    this.delay = new Float32Array(N);
    this.maxDelay = 0;
    const sc = this.cell(L.start);
    for (let i = 0; i < N; i++) {
      const c = this.cell(i);
      this.delay[i] = Math.hypot(c.x - sc.x, c.z - sc.z) * 0.035 + rng() * 0.12;
      this.maxDelay = Math.max(this.maxDelay, this.delay[i]);
    }

    // floor tiles
    this.floorMesh = new THREE.InstancedMesh(G.tile, mats.floor, nf);
    this.floorMesh.receiveShadow = true;
    this.floorMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.floorMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(nf * 3), 3);
    this.floorMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.floorBase = new THREE.Color(T.floor);
    this.board.add(this.floorMesh);

    // walls (+ reserved slots for seal tiles)
    this.wallMesh = new THREE.InstancedMesh(G.wall, mats.wall, nw);
    this.wallMesh.castShadow = true; this.wallMesh.receiveShadow = true;
    this.wallMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.wallMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(nw * 3), 3);
    const wc = new THREE.Color(T.wall);
    for (let k = 0; k < nw; k++) {
      if (T.palette) _col.set(T.palette[(rng() * T.palette.length) | 0]);
      else { _col.copy(wc); const v = 0.92 + rng() * 0.14; _col.multiplyScalar(v); }
      this.wallMesh.setColorAt(k, _col);
    }
    this.board.add(this.wallMesh);
    this.wallJitter = new Float32Array(nw).map(() => rng());
    if (T.studs) {
      this.studMesh = new THREE.InstancedMesh(G.stud, mats.stud, nw);
      this.studMesh.castShadow = true;
      this.studMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.studMesh.instanceColor = this.wallMesh.instanceColor;
      this.board.add(this.studMesh);
    } else this.studMesh = null;

    // coins
    this.coinMesh = null;
    if (this.coinCells.length) {
      this.coinMesh = new THREE.InstancedMesh(G.coin, mats.coin, this.coinCells.length);
      this.coinMesh.castShadow = true;
      this.coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.board.add(this.coinMesh);
    }

    // base slab + soft ground shadow
    const slab = new THREE.Mesh(roundedBox(L.w + 0.5, 0.7, L.h + 0.5, 0.25, 2), mats.base);
    this.slabY = -TILE_H - 0.35 + 0.02;
    slab.position.set(0, this.slabY, 0);
    slab.receiveShadow = true;
    this.board.add(slab);
    this.slab = slab;
    if (mats.base.map) { mats.base.map.repeat.set((L.w + 1) / 6, (L.h + 1) / 6); }
    const blob = new THREE.Mesh(G.plane, new THREE.MeshBasicMaterial({ map: shadowBlobTexture(), transparent: true, depthWrite: false, opacity: 0.55 }));
    blob.scale.set(L.w * 1.6, 1, L.h * 1.5);
    blob.position.set(0.5, -3.2, 1.2);
    this.board.add(blob);
    this.groundBlob = blob;

    // special tiles
    this.dyn = [];
    this.arrowTex = chevronTexture();
    this.overlays = new Map();
    const portalCols = PORTAL_COLORS;
    for (let i = 0; i < N; i++) {
      const k = L.kind[i];
      if (k === PORTAL) this.makePortal(i, portalCols[L.aux[i] % 3]);
      else if (k === ARROW) this.makeArrow(i);
      else if (k === STICKY) this.makeSticky(i);
      else if (k === SEAL) this.makeSeal(i);
    }
    // start marker
    const ring = new THREE.Mesh(G.plane, new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, opacity: 0.55, depthWrite: false, color: 0xffffff }));
    const sp = this.cell(L.start);
    ring.position.set(sp.x, 0.05, sp.z);
    ring.scale.setScalar(0.9);
    this.board.add(ring);
    this.startRing = ring;

    // theme extras
    this.embers = !!T.embers;

    // light + camera framing
    const S = Math.max(L.w, L.h) * 0.8 + 3;
    const sh = this.sun.shadow.camera;
    sh.left = -S; sh.right = S; sh.top = S; sh.bottom = -S; sh.near = 1; sh.far = 90;
    sh.updateProjectionMatrix();
    this.sun.position.set(-L.w * 0.5 - 6, 26, L.h * 0.25 + 10);
    this.sun.target.position.set(0, 0, 0);
    this.sun.target.updateMatrixWorld();

    this.fit();
    this.outro = null;
    this.introT = opts.intro === false ? 99 : (opts.leave ? -0.3 : 0);
    this.landed = opts.intro === false;
    if (opts.intro !== false) this.onEvent('intro', {});
    this.syncToState(st, true);
    this.camZoom = 1;
    this.camera.position.copy(this.target).addScaledVector(_p.set(0, Math.sin(this.pitch), Math.cos(this.pitch)), this.dist * 1.0);
    this.celebrating = 0;
    this.clearHint();
    this.updateBoardMatrices(0);
  }

  disposeGroup(g) {
    g.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
    this.scene.remove(g);
  }

  makePortal(i, color) {
    const G = geos();
    const c = this.cell(i);
    const grp = new THREE.Group();
    grp.position.set(c.x, 0.02, c.z);
    const col = new THREE.Color(color);
    const disc = new THREE.Mesh(G.plane, new THREE.MeshBasicMaterial({ map: portalTexture(), color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    disc.scale.setScalar(1.0); disc.position.y = 0.06;
    const disc2 = new THREE.Mesh(G.plane, new THREE.MeshBasicMaterial({ map: portalTexture(), color: col.clone().lerp(new THREE.Color('#ffffff'), 0.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 }));
    disc2.scale.setScalar(0.7); disc2.position.y = 0.08;
    const ring = new THREE.Mesh(G.torus, new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.3, roughness: 0.3, metalness: 0.2 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.09; ring.scale.setScalar(0.95);
    const glow = new THREE.Mesh(G.plane, new THREE.MeshBasicMaterial({ map: glowTexture(), color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 }));
    glow.scale.setScalar(1.9); glow.position.y = 0.03;
    grp.add(glow, disc, disc2, ring);
    this.board.add(grp);
    const ph = (i * 0.37) % 6;
    this.dyn.push({ cell: i, kind: 'portal', grp, disc, disc2, ring, glow, col, ph, pulse: -9 });
  }

  makeArrow(i) {
    const G = geos();
    const c = this.cell(i);
    const d = this.L.aux[i];
    const grp = new THREE.Group();
    grp.position.set(c.x, 0.04, c.z);
    grp.rotation.y = -d * Math.PI / 2;
    const under = new THREE.Mesh(G.plane, new THREE.MeshBasicMaterial({ color: ARROW_COLOR, transparent: true, opacity: 0.38, depthWrite: false }));
    under.scale.setScalar(0.88);
    const tex = this.arrowTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(1, 1);
    const chev = new THREE.Mesh(G.plane, new THREE.MeshBasicMaterial({ map: tex, color: ARROW_COLOR, transparent: true, depthWrite: false }));
    chev.scale.setScalar(0.88); chev.position.y = 0.012;
    grp.add(under, chev);
    this.board.add(grp);
    this.dyn.push({ cell: i, kind: 'arrow', grp, tex, under, pulse: -9 });
  }

  makeSticky(i) {
    const G = geos();
    const c = this.cell(i);
    const grp = new THREE.Group();
    grp.position.set(c.x, 0.04, c.z);
    const mat = new THREE.MeshPhysicalMaterial({ color: '#ff5fc0', roughness: 0.12, clearcoat: 1, metalness: 0, envMapIntensity: 1.4, emissive: '#ff2d9c', emissiveIntensity: 0.25 });
    const pad = new THREE.Mesh(G.sticky, mat);
    pad.position.y = 0.04; pad.castShadow = true;
    grp.add(pad);
    const bubbles = [];
    for (let b = 0; b < 3; b++) {
      const m = new THREE.Mesh(G.bubble, mat);
      m.position.set((b - 1) * 0.16, 0.12, ((b * 7) % 3 - 1) * 0.12);
      m.scale.setScalar(0.6 + b * 0.18);
      grp.add(m); bubbles.push(m);
    }
    this.board.add(grp);
    this.dyn.push({ cell: i, kind: 'sticky', grp, pad, bubbles, ph: i * 0.9, pulse: -9 });
  }

  makeSeal(i) {
    const G = geos();
    const c = this.cell(i);
    const grp = new THREE.Group();
    grp.position.set(c.x, 0.03, c.z);
    const m = new THREE.Mesh(G.plane, new THREE.MeshBasicMaterial({ map: crackTexture(), transparent: true, opacity: 0.94, depthWrite: false }));
    m.scale.setScalar(0.94);
    grp.add(m);
    this.board.add(grp);
    this.dyn.push({ cell: i, kind: 'seal', grp, m, pulse: -9 });
    this.overlays.set(i, grp);
  }

  // ---- state sync -----------------------------------------------------------------------------------------
  paintColorFor(step) {
    if (this.rainbow) return _col2.setHSL((step * 0.037) % 1, 0.85, 0.62);
    return this.paintColor;
  }

  /** Jump the whole view to a given engine state (restart / undo / load). */
  syncToState(st, keepCoins = false) {
    this.st = st;
    const L = this.L;
    for (let k = 0; k < this.floorCells.length; k++) {
      const i = this.floorCells[k];
      if (st.painted[i]) {
        if (this.paintedAt[k] === NEVER || !keepCoins) this.paintedAt[k] = LONG;
        const c = this.paintColorFor(k + (L.n || 0));
        this.paintRGB[k * 3] = c.r; this.paintRGB[k * 3 + 1] = c.g; this.paintRGB[k * 3 + 2] = c.b;
      } else this.paintedAt[k] = NEVER;
    }
    for (let j = 0; j < this.coinCells.length; j++) {
      const i = this.coinCells[j];
      if (st.painted[i] && this.coinTaken[j] === NEVER) this.coinTaken[j] = LONG; // already collected earlier this level
    }
    for (let w = 0; w < this.wallCells.length; w++) {
      const i = this.wallCells[w];
      if (L.kind[i] === SEAL) {
        if (st.sealed[i]) { if (this.sealedAt[w] === NEVER) this.sealedAt[w] = LONG; } else this.sealedAt[w] = NEVER;
        const ov = this.overlays.get(i);
        if (ov) ov.visible = !st.sealed[i];
      }
    }
    const p = this.cell(st.pos);
    this.ballPos.set(p.x, BALL_R, p.z);
    this.anim = null;
    this.moving = false;
    this.squash = null;
    this.stretch = 0;
    this.stepCount = 0;
  }

  // ---- animation of a slide --------------------------------------------------------------------------------
  /** events come straight from engine.slide(). `info` = { steps, endKind, dir } */
  playSlide(events, info, onDone) {
    const speed = 17;
    const items = [];
    let T = 0;
    let cur = this.st && this.cellFromPos();
    let first = true;
    let lastDir = info.dir;
    for (const ev of events) {
      if (ev.t === 0) {
        const dur = (1 / speed) * (first ? 1.5 : 1);
        items.push({ type: 'move', t0: T, t1: T + dur, from: this.cell(cur), to: this.cell(ev.i), ev, first });
        T += dur; cur = ev.i; first = false; lastDir = ev.d;
      } else if (ev.t === 1) {
        items.push({ type: 'tele', t0: T, t1: T + 0.2, from: this.cell(ev.from), to: this.cell(ev.i), ev });
        T += 0.2; cur = ev.i;
      } else if (ev.t === 2) { items.push({ type: 'turn', t0: T, t1: T, ev }); lastDir = ev.d; } else if (ev.t === 3) items.push({ type: 'seal', t0: T, t1: T, ev });
    }
    this.anim = { items, idx: 0, t: 0, total: T, info, lastDir, onDone, fired: 0, doneCalled: false, steps: info.steps, endKind: info.endKind };
    this.moving = true;
    this.clearHint();
    this.onEvent('whoosh', { steps: info.steps });
  }

  /**
   * Level exit: a ripple spreads out from the ball. Each tile lifts slightly, then tumbles away
   * and shrinks. Resolves when the whole board is gone (the next loadLevel replaces it).
   */
  playOutro() {
    if (!this.L) return Promise.resolve();
    if (this.outro) return this.outro.promise;
    const L = this.L, N = L.w * L.h, bp = this.ballPos;
    let maxDist = 0.001;
    for (let i = 0; i < N; i++) { const c = this.cell(i); maxDist = Math.max(maxDist, Math.hypot(c.x - bp.x, c.z - bp.z)); }
    const k = Math.min(0.045, 0.4 / maxDist); // the whole ripple always takes about 0.4s, however big the board
    const rng = mulberry32(L.n * 7 + 3);
    const od = new Float32Array(N);
    let max = 0;
    for (let i = 0; i < N; i++) {
      const c = this.cell(i);
      od[i] = Math.hypot(c.x - bp.x, c.z - bp.z) * k + rng() * 0.08;
      if (od[i] > max) max = od[i];
    }
    const o = { t: 0, od, max, done: false, resolve: null, promise: null };
    o.promise = new Promise((r) => { o.resolve = r; });
    this.outro = o;
    this.clearHint();
    this.queueHint = null;
    if (this.startRing) this.startRing.visible = false;
    this.shake = Math.max(this.shake, 0.03);
    this.onEvent('outro', {});
    return o.promise;
  }

  /** Sets this._dy / this._s / _qo for instance cell i during the outro. Returns false when it hasn't started falling yet. */
  outroFx(i) {
    const o = this.outro;
    if (!o) return false;
    const q = o.t - o.od[i];
    if (q <= 0) return false;
    const fall = Math.max(0, q - 0.1);
    this._dy = 0.2 * clamp(q / 0.1) - fall * fall * 20; // tiny anticipation lift, then gravity
    this._s = Math.max(0.0001, 1 - fall * 1.7);
    const h1 = (o.od[i] * 977) % 1, h2 = (o.od[i] * 313) % 1;
    _eo.set((h1 - 0.5) * q * 4.5, 0, (h2 - 0.5) * q * 4.5);
    _qo.setFromEuler(_eo);
    return true;
  }

  /** CSS-pixel screen position of a world point (for the tutorial hand). */
  toScreen(x, y, z) {
    _p.set(x, y, z).project(this.camera);
    return { x: (_p.x * 0.5 + 0.5) * this.W, y: (-_p.y * 0.5 + 0.5) * this.H };
  }

  cellFromPos() {
    return Math.round(this.ballPos.z + this.cz) * this.L.w + Math.round(this.ballPos.x + this.cx);
  }

  bump(dir) {
    this.squash = { t: 0, dir, amp: 0.45 };
    this.nudge = { t: 0, dir };
    this.onEvent('blocked', {});
  }

  arrive(item) {
    const ev = item.ev;
    const i = ev.i;
    const k = this.tileOf[i];
    const c = this.cell(i);
    if (ev.new && k >= 0) {
      this.paintedAt[k] = this.time;
      this.popAt[k] = this.time;
      const pc = this.paintColorFor(this.stepCount);
      this.paintRGB[k * 3] = pc.r; this.paintRGB[k * 3 + 1] = pc.g; this.paintRGB[k * 3 + 2] = pc.b;
      for (let n = 0; n < 5; n++) {
        const a = Math.random() * 6.28, s = 0.5 + Math.random() * 1.3;
        this.glows.emit(c.x, 0.08, c.z, Math.cos(a) * s, 1.4 + Math.random() * 1.4, Math.sin(a) * s, pc, 0.14 + Math.random() * 0.1, 0.45 + Math.random() * 0.3, { grav: 4, alpha: 0.9 });
      }
      this.onEvent('paint', { step: this.stepCount, cell: i });
      this.stepCount++;
    } else if (!ev.new) {
      this.onEvent('tread', { cell: i });
    }
    const ci = this.coinOf[i];
    if (ci >= 0 && this.coinTaken[ci] === NEVER) {
      this.coinTaken[ci] = this.time;
      this.onEvent('coin', { cell: i, x: c.x, z: c.z });
      for (let n = 0; n < 6; n++) this.glows.emit(c.x, 0.5, c.z, (Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2, '#ffd23a', 0.12, 0.5, { grav: 3 });
    }
    if (item.ev.new && this.L.kind[i] === PORTAL) { /* painted via tele */ }
  }

  step(dt) {
    const a = this.anim;
    if (!a) return;
    a.t += dt;
    const it = a.items;
    // fire completed items
    while (a.idx < it.length && it[a.idx].t1 <= a.t) {
      const item = it[a.idx];
      if (item.type === 'move') {
        this.arrive(item);
        const k = this.L.kind[item.ev.i];
        if (k === PORTAL) {
          const d = this.dyn.find((x) => x.cell === item.ev.i);
          if (d) d.pulse = this.time;
          this.onEvent('portal', { cell: item.ev.i });
        } else if (k === ARROW) { /* handled by the turn item */ }
      } else if (item.type === 'tele') {
        this.arrive(item);
        const d = this.dyn.find((x) => x.cell === item.ev.i);
        if (d) d.pulse = this.time;
      } else if (item.type === 'turn') {
        const d = this.dyn.find((x) => x.cell === item.ev.i);
        if (d) d.pulse = this.time;
        this.onEvent('arrow', { cell: item.ev.i });
      } else if (item.type === 'seal') {
        const w = this.wallOf[item.ev.i];
        if (w >= 0) {
          this.sealedAt[w] = this.time;
          const ov = this.overlays.get(item.ev.i);
          if (ov) ov.visible = false;
          const c = this.cell(item.ev.i);
          for (let n = 0; n < 10; n++) this.particles.emit(c.x + (Math.random() - 0.5) * 0.6, 0.15, c.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 1.5, 1.2 + Math.random(), (Math.random() - 0.5) * 1.5, '#d9c29a', 0.2, 0.55, { grav: 5, drag: 1.5 });
        }
        this.onEvent('seal', { cell: item.ev.i });
      }
      a.idx++;
    }
    // ball position
    let cur = null;
    for (let n = Math.max(0, a.idx - 1); n < it.length; n++) { if (it[n].t0 <= a.t && a.t < it[n].t1) { cur = it[n]; break; } }
    if (cur) {
      const p = clamp((a.t - cur.t0) / (cur.t1 - cur.t0));
      if (cur.type === 'move') {
        const e = cur.first ? p * p : p;
        this.ballPos.set(cur.from.x + (cur.to.x - cur.from.x) * e, BALL_R, cur.from.z + (cur.to.z - cur.from.z) * e);
        const dx = cur.to.x - cur.from.x, dz = cur.to.z - cur.from.z;
        const dirv = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 1 : 3) : (dz > 0 ? 2 : 0);
        this.ballDir = dirv;
        this.rollBy(dx * dt * 17, dz * dt * 17);
        this.stretch = Math.min(1, this.stretch + dt * 14);
      } else if (cur.type === 'tele') {
        if (p < 0.5) { this.ballPos.set(cur.from.x, BALL_R, cur.from.z); this.ballScaleMul = 1 - p * 2; } else { this.ballPos.set(cur.to.x, BALL_R, cur.to.z); this.ballScaleMul = (p - 0.5) * 2; }
        if (!cur.fired && p > 0.45) {
          cur.fired = true;
          this.ballScaleMul = 0;
          this.burst(cur.to, '#ffffff', 10);
        }
      }
    } else if (a.idx >= it.length) {
      const last = it[it.length - 1];
      if (last && last.type === 'move') this.ballPos.set(last.to.x, BALL_R, last.to.z);
      else if (last && last.type === 'tele') this.ballPos.set(last.to.x, BALL_R, last.to.z);
      this.ballScaleMul = 1;
    }
    // trail
    if (cur && cur.type === 'move') this.spawnTrail(dt);
    // finished
    if (a.t >= a.total && !a.doneCalled) {
      a.doneCalled = true;
      this.ballScaleMul = 1;
      this.moving = false;
      this.stretch = 0;
      const power = Math.min(10, a.steps);
      if (a.endKind === 'sticky') {
        this.squash = { t: 0, dir: a.lastDir, amp: 0.9, sticky: true };
        this.onEvent('sticky', {});
        this.burst(this.ballPos, '#ff7ac6', 12);
      } else {
        this.squash = { t: 0, dir: a.lastDir, amp: Math.min(1, 0.35 + power * 0.08) };
        this.shake = Math.max(this.shake, Math.min(0.09, 0.015 + power * 0.007));
        const hit = _p.set(this.ballPos.x + DX[a.lastDir] * 0.42, 0.12, this.ballPos.z + DY[a.lastDir] * 0.42);
        for (let n = 0; n < 7; n++) {
          this.particles.emit(hit.x, hit.y, hit.z, (Math.random() - 0.5) * 1.6 - DX[a.lastDir] * 0.8, 0.8 + Math.random() * 1.2, (Math.random() - 0.5) * 1.6 - DY[a.lastDir] * 0.8, '#ffffff', 0.2, 0.4 + Math.random() * 0.2, { grav: 2.5, drag: 2, grow: 1.2, alpha: 0.55 });
        }
        this.onEvent('impact', { power });
      }
      const cb = a.onDone;
      this.anim = null;
      if (cb) cb();
    }
  }

  rollBy(dx, dz) {
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return;
    _p.set(dz / len, 0, -dx / len); // axis = up x dir
    _q.setFromAxisAngle(_p, len / BALL_R);
    this.ballMesh.quaternion.premultiply(_q);
  }

  burst(p, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, s = 0.6 + Math.random() * 1.6;
      this.glows.emit(p.x, BALL_R, p.z, Math.cos(a) * s, Math.random() * 1.5, Math.sin(a) * s, color, 0.16, 0.5, { grav: 1, drag: 1.5 });
    }
  }

  spawnTrail(dt) {
    const n = Math.ceil(dt * 90);
    for (let k = 0; k < n; k++) {
      const col = this.trailRainbow ? _col2.setHSL((this.time * 1.6 + Math.random() * 0.2) % 1, 0.9, 0.62) : this.trailColor;
      const jitter = 0.12;
      this.glows.emit(
        this.ballPos.x - DX[this.ballDir] * 0.18 + (Math.random() - 0.5) * jitter, BALL_R + (Math.random() - 0.5) * 0.18, this.ballPos.z - DY[this.ballDir] * 0.18 + (Math.random() - 0.5) * jitter,
        -DX[this.ballDir] * 0.4, 0.2, -DY[this.ballDir] * 0.4, col, 0.2 + Math.random() * 0.12, 0.35 + Math.random() * 0.15, { alpha: 0.75, drag: 2 },
      );
    }
    if (this.skin && this.skin.look.kind === 'fire') {
      this.particles.emit(this.ballPos.x - DX[this.ballDir] * 0.2, BALL_R + 0.1, this.ballPos.z - DY[this.ballDir] * 0.2, (Math.random() - 0.5) * 0.4, 0.8 + Math.random(), (Math.random() - 0.5) * 0.4, _col2.set(Math.random() < 0.5 ? '#ff7a1a' : '#ffd23a'), 0.22, 0.5, { alpha: 0.8 });
    }
  }

  // ---- hints ---------------------------------------------------------------------------------------------------
  showHint(cells, dir) {
    this.clearHint();
    const G = geos();
    this.hintT = this.time;
    for (const i of cells) {
      const c = this.cell(i);
      const m = new THREE.Mesh(G.plane, new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
      m.position.set(c.x, 0.2, c.z); m.scale.setScalar(1.1);
      this.scene.add(m);
      this.hintObjs.push({ m, i });
    }
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 4), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#7fe9ff', emissiveIntensity: 1.2, roughness: 0.3 }));
    cone.rotation.z = -Math.PI / 2; // cone points +x
    this.hintCone = { m: cone, dir };
    this.scene.add(cone);
  }

  clearHint() {
    for (const h of this.hintObjs) { this.scene.remove(h.m); h.m.material.dispose(); }
    this.hintObjs = [];
    if (this.hintCone) { this.scene.remove(this.hintCone.m); this.hintCone = null; }
  }

  // ---- celebration ---------------------------------------------------------------------------------------------
  celebrate() {
    this.celebrating = this.time;
    const sp = this.cell(this.st.pos);
    for (let k = 0; k < this.floorCells.length; k++) {
      const c = this.cell(this.floorCells[k]);
      this.popAt[k] = this.time + Math.hypot(c.x - sp.x, c.z - sp.z) * 0.045;
    }
    const cols = ['#ff5a7a', '#ffd23a', '#5be37d', '#4db8ff', '#c78bff', '#ff9a3c'];
    for (let n = 0; n < 220; n++) {
      const a = Math.random() * 6.283, s = 2 + Math.random() * 6;
      this.particles.emit((Math.random() - 0.5) * this.L.w * 0.5, 1 + Math.random() * 2, (Math.random() - 0.5) * this.L.h * 0.5, Math.cos(a) * s * 0.7, 5 + Math.random() * 7, Math.sin(a) * s * 0.7, cols[n % cols.length], 0.17 + Math.random() * 0.13, 1.6 + Math.random() * 1.1, { grav: 9, drag: 0.6, alpha: 1 });
    }
    this.shake = 0.04;
  }

  /** a little hop and spin when the level starts */
  popBall() {
    this.introBall = this.time;
  }

  // ---- per frame --------------------------------------------------------------------------------------------------
  update(dt) {
    this.time += dt;
    this.introT += dt;
    if (!this.L) { this.particles.update(dt); this.glows.update(dt); return; }
    if (this.outro) {
      const o = this.outro;
      o.t += dt;
      const q = Math.max(0, o.t - o.max * 0.6 - 0.1);
      if (this.slab) {
        this.slab.position.y = this.slabY - q * q * 20;
        this.slab.scale.setScalar(Math.max(0.0001, 1 - q * 1.5));
      }
      if (this.groundBlob) this.groundBlob.material.opacity = 0.55 * clamp(1 - (o.t - o.max) / 0.4);
      if (!o.done && o.t > o.max + 0.6) { o.done = true; o.resolve(); }
    }
    if (this.slab && !this.outro) {
      // the tray springs up just ahead of its tiles
      const e = this.introT < 0.7 ? easeOutBack(clamp(this.introT / 0.55)) : 1;
      this.slab.scale.setScalar(Math.max(0.0001, e));
      this.slab.position.y = this.slabY - (1 - e) * 2.2;
    }
    if (!this.landed && this.introT > this.maxDelay + 0.75) {
      this.landed = true;
      this.shake = Math.max(this.shake, 0.02);
      this.burst(this.ballPos, '#ffffff', 14);
      this.onEvent('landed', {});
    }
    this.step(dt);
    this.updateBoardMatrices(dt);
    this.updateBall(dt);
    this.updateDyn(dt);
    this.updateHint();
    this.updateCamera(dt);
    this.particles.update(dt);
    this.glows.update(dt);
    // old boards falling away
    for (let n = this.leaving.length - 1; n >= 0; n--) {
      const l = this.leaving[n];
      l.t += dt;
      l.group.position.y -= dt * (3 + l.t * 40);
      l.group.rotation.x += dt * 0.5;
      if (l.t > 0.8) { this.disposeGroup(l.group); this.leaving.splice(n, 1); }
    }
    if (this.embers && Math.random() < dt * 22) {
      const x = (Math.random() - 0.5) * this.L.w, z = (Math.random() - 0.5) * this.L.h;
      this.glows.emit(x, 0.2, z, (Math.random() - 0.5) * 0.3, 0.8 + Math.random(), (Math.random() - 0.5) * 0.3, Math.random() < 0.5 ? '#ff7a1a' : '#ffb347', 0.12 + Math.random() * 0.08, 2.2, { alpha: 0.9 });
    }
  }

  updateBoardMatrices(dt) {
    const L = this.L;
    const t = this.time;
    const intro = this.introT < this.maxDelay + 1.4;
    const delayOf = (i) => (intro ? this.delay[i] : 0);
    const ip = (i, extra = 0) => {
      if (!intro) return 1;
      return clamp((this.introT - delayOf(i) - extra) / 0.55);
    };
    // floor tiles
    const fm = this.floorMesh;
    for (let k = 0; k < this.floorCells.length; k++) {
      const i = this.floorCells[k];
      const c = this.cell(i);
      const p = ip(i);
      const pa = this.paintedAt[k];
      let y = -TILE_H / 2, s = 1;
      let r = this.floorBase.r, g = this.floorBase.g, b = this.floorBase.b;
      if (pa !== NEVER && pa !== LONG) {
        const age = t - pa;
        const f = clamp(age / 0.3);
        const e = easeOutCubic(f);
        r += (this.paintRGB[k * 3] - r) * e; g += (this.paintRGB[k * 3 + 1] - g) * e; b += (this.paintRGB[k * 3 + 2] - b) * e;
        y += 0.045;
      } else if (pa === LONG) {
        r = this.paintRGB[k * 3]; g = this.paintRGB[k * 3 + 1]; b = this.paintRGB[k * 3 + 2];
        y += 0.045;
      }
      const pop = t - this.popAt[k];
      if (pop > 0 && pop < 0.5) y += Math.sin((pop / 0.5) * Math.PI) * 0.16 * (1 - pop / 0.5);
      if (p < 1) { const e = easeOutBack(p); s = Math.max(0.0001, e); y += (1 - e) * -2.2; }
      let rq = QID;
      if (this.outroFx(i)) { y += this._dy; s *= this._s; rq = _qo; }
      _p.set(c.x, y, c.z);
      _s.set(s, s, s);
      _m.compose(_p, rq, _s);
      fm.setMatrixAt(k, _m);
      fm.setColorAt(k, _col.setRGB(r, g, b));
    }
    fm.instanceMatrix.needsUpdate = true;
    fm.instanceColor.needsUpdate = true;
    // walls
    const wmesh = this.wallMesh;
    for (let w = 0; w < this.wallCells.length; w++) {
      const i = this.wallCells[w];
      const c = this.cell(i);
      const isSeal = L.kind[i] === SEAL;
      let s = 1, y = WALL_H / 2 - 0.1 + 0.05 - 0.02;
      if (isSeal) {
        const sa = this.sealedAt[w];
        if (sa === NEVER) s = 0.0001;
        else if (sa !== LONG) {
          const q = clamp((t - sa) / 0.4);
          s = Math.max(0.0001, easeOutBack(q));
          y += (1 - clamp(q)) * -0.5;
        }
        if (intro) { const pp = ip(i); if (pp < 1) s = Math.min(s, Math.max(0.0001, easeOutBack(pp))); }
      } else if (intro) {
        const p = ip(i, 0.15);
        const e = easeOutBack(p);
        s = Math.max(0.0001, e); y += (1 - e) * -2.5;
      }
      let so = 1, rq = QID;
      if (this.outroFx(i)) { y += this._dy; so = this._s; rq = _qo; }
      _p.set(c.x, y, c.z);
      _s.set(so, s * so, so);
      _m.compose(_p, rq, _s);
      wmesh.setMatrixAt(w, _m);
      if (this.studMesh) {
        _p.set(c.x, y + (WALL_H / 2 + 0.07) * s * so, c.z);
        _s.set(s * so, s * so, s * so);
        _m.compose(_p, rq, _s);
        this.studMesh.setMatrixAt(w, _m);
      }
    }
    wmesh.instanceMatrix.needsUpdate = true;
    if (this.studMesh) this.studMesh.instanceMatrix.needsUpdate = true;
    // coins
    if (this.coinMesh) {
      for (let j = 0; j < this.coinCells.length; j++) {
        const i = this.coinCells[j];
        const c = this.cell(i);
        const taken = this.coinTaken[j];
        let s = 1, y = 0.42 + Math.sin(t * 2.4 + i) * 0.04;
        if (taken !== NEVER && taken !== LONG) {
          const age = t - taken;
          s = Math.max(0.0001, 1 - age / 0.32);
          y += age * 2.4;
          if (age > 0.32) s = 0.0001;
        } else if (taken === LONG) s = 0.0001;
        if (intro) { const p = ip(i, 0.3); s *= Math.max(0.0001, easeOutBack(p)); }
        if (this.outroFx(i)) { y += this._dy; s *= this._s; }
        _p.set(c.x, y, c.z);
        _e.set(0, t * 2.6 + i * 0.7, 0);
        _q.setFromEuler(_e);
        _s.set(s, s, s);
        _m.compose(_p, _q, _s);
        this.coinMesh.setMatrixAt(j, _m);
      }
      this.coinMesh.instanceMatrix.needsUpdate = true;
    }
    // start ring fades once the ball has left
    if (this.startRing) {
      this.startRing.material.opacity = 0.35 + Math.sin(t * 2) * 0.1;
      const k = this.tileOf[this.L.start];
      this.startRing.position.y = 0.05 + (k >= 0 ? 0.045 : 0);
    }
    this.groundBlob.position.y = -3.2;
    void dt;
  }

  updateBall(dt) {
    const t = this.time;
    const p = this.ballPos;
    let sx = 1, sy = 1, sz = 1;
    let yoff = 0;
    if (this.moving) {
      const along = 1 + 0.16 * this.stretch;
      const perp = 1 - 0.07 * this.stretch;
      if (this.ballDir & 1) { sx = along; sz = perp; sy = perp; } else { sz = along; sx = perp; sy = perp; }
    }
    if (this.squash) {
      const q = this.squash;
      q.t += dt;
      const a = q.amp * Math.exp(-q.t * (q.sticky ? 7 : 11)) * Math.cos(q.t * (q.sticky ? 20 : 30));
      const c = a;
      const al = 1 - 0.28 * c, pe = 1 + 0.14 * c;
      if (q.dir & 1) { sx *= al; sz *= pe; } else { sz *= al; sx *= pe; }
      sy *= pe;
      if (q.t > 0.5) this.squash = null;
    }
    let ox = 0, oz = 0;
    if (this.nudge) {
      const n = this.nudge;
      n.t += dt;
      const e = Math.sin(clamp(n.t / 0.16) * Math.PI) * 0.1;
      ox = DX[n.dir] * e; oz = DY[n.dir] * e;
      if (n.t > 0.16) this.nudge = null;
    }
    // intro hop
    let introS = 1;
    const ib = this.introT - (this.maxDelay + 0.35);
    if (this.introT < 90 && ib < 0.7) {
      if (ib < 0) introS = 0.0001;
      else { const q = clamp(ib / 0.7); introS = Math.max(0.0001, easeOutBack(q)); yoff += Math.abs(Math.sin(q * Math.PI * 2)) * 0.5 * (1 - q); }
    }
    if (this.celebrating && t - this.celebrating < 1.2) {
      const q = t - this.celebrating;
      yoff += Math.abs(Math.sin(q * 7)) * 0.5 * Math.exp(-q * 2.2);
    }
    let mul = this.ballScaleMul * introS;
    if (this.outro && this.outroFx(this.cellFromPos())) { yoff += this._dy; mul *= this._s; }
    this.ball.position.set(p.x + ox, p.y + yoff, p.z + oz);
    this.ball.scale.set(sx * mul, sy * mul, sz * mul);
    this.ballBlob.position.set(p.x + ox, 0.07, p.z + oz);
    const h = clamp(1 - yoff * 1.4);
    this.ballBlob.scale.set(1.1 * h * mul, 1, 1.1 * h * mul);
    this.ballBlob.material.opacity = 0.8 * h;
    this.ballLight.position.set(p.x, 1.2, p.z);
    this.ballLight.intensity = (this.theme && this.theme.glow ? 9 : 5) * (this.paintColor ? 1 : 1);
    if (this.rainbow) this.ballLight.color.setHSL((t * 0.25) % 1, 0.8, 0.6);
    if (this.ballUpdate) this.ballUpdate(t);
  }

  updateDyn(dt) {
    const t = this.time;
    for (const d of this.dyn) {
      if (d.by === undefined) d.by = d.grp.position.y;
      if (this.outro) {
        if (this.outroFx(d.cell)) { d.grp.position.y = d.by + this._dy; d.grp.scale.setScalar(this._s); }
      }
      const pulse = clamp(1 - (t - d.pulse) / 0.5);
      if (d.kind === 'portal') {
        d.disc.rotation.y = t * 1.8 + d.ph;
        d.disc2.rotation.y = -t * 2.6 + d.ph;
        const s = 1 + Math.sin(t * 3 + d.ph) * 0.04 + pulse * 0.35;
        d.ring.scale.setScalar(0.95 * s);
        d.glow.material.opacity = 0.5 + pulse * 0.5;
        if (Math.random() < dt * 5) this.glows.emit(d.grp.position.x + (Math.random() - 0.5) * 0.5, 0.1, d.grp.position.z + (Math.random() - 0.5) * 0.5, 0, 0.7 + Math.random() * 0.5, 0, d.col, 0.1, 0.9, { alpha: 0.9 });
      } else if (d.kind === 'arrow') {
        d.tex.offset.y -= dt * 0.8;
        d.under.material.opacity = 0.34 + pulse * 0.5 + Math.sin(t * 4) * 0.05;
      } else if (d.kind === 'sticky') {
        const w = 1 + Math.sin(t * 3 + d.ph) * 0.04;
        d.pad.scale.set(w, 1 + pulse * 0.4, w);
        d.bubbles.forEach((b, i) => { b.position.y = 0.12 + Math.abs(Math.sin(t * 2 + d.ph + i * 1.7)) * 0.07; });
      } else if (d.kind === 'seal') {
        d.m.material.opacity = 0.9 + Math.sin(t * 5) * 0.06;
      }
    }
  }

  updateHint() {
    if (!this.hintObjs.length && !this.hintCone) return;
    const age = this.time - this.hintT;
    const fade = clamp(1 - (age - 3.0) / 0.6);
    for (let n = 0; n < this.hintObjs.length; n++) {
      const h = this.hintObjs[n];
      const w = Math.sin(age * 6 - n * 0.5) * 0.5 + 0.5;
      h.m.material.opacity = (0.35 + w * 0.65) * fade;
    }
    if (this.hintCone) {
      const { m, dir } = this.hintCone;
      const bob = Math.sin(age * 7) * 0.12;
      m.position.set(this.ballPos.x + DX[dir] * (0.75 + bob), 0.55, this.ballPos.z + DY[dir] * (0.75 + bob));
      m.rotation.set(0, [Math.PI / 2, 0, -Math.PI / 2, Math.PI][dir], -Math.PI / 2);
      m.scale.setScalar(fade);
    }
    if (age > 3.6) this.clearHint();
  }

  updateCamera(dt) {
    const t = this.time;
    this.shake = Math.max(0, this.shake - dt * 0.35);
    const sway = Math.sin(t * 0.37) * 0.035;
    const pitch = this.pitch + Math.sin(t * 0.29) * 0.012;
    let zoom = 1;
    if (this.celebrating && t - this.celebrating < 2) zoom = 1 - 0.07 * Math.sin(clamp((t - this.celebrating) / 0.8) * Math.PI / 2);
    this.camZoom += (zoom - this.camZoom) * Math.min(1, dt * 4);
    // intro: camera glides in from a little further away
    const intro = this.introT < 1.2 ? 1 + (1 - easeOutCubic(this.introT / 1.2)) * 0.18 : 1;
    const out = this.outro ? 1 + 0.06 * easeOutCubic(clamp(this.outro.t / 0.9)) : 1;
    const d = this.dist * this.camZoom * intro * out;
    const az = sway;
    _p.set(Math.sin(az) * Math.cos(pitch), Math.sin(pitch), Math.cos(az) * Math.cos(pitch)).multiplyScalar(d);
    this.camera.position.copy(this.target).add(_p);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 2;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 2;
    }
    this.camera.lookAt(this.target);
    // the ground shadow blob follows the camera-facing slab
    if (this.groundBlob) this.groundBlob.position.x = 0.3;
    this.board.rotation.y = 0;
  }
}
