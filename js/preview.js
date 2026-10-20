// Renders small still images of ball skins for the shop (own tiny WebGL context, disposed when idle).
import * as THREE from '../vendor/three.module.min.js';
import { ballLook } from './textures.js';
import { createEnv } from './render.js';

let r = null;
let scene, cam, mesh, sphere;
const cache = new Map();

function init() {
  if (r) return;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 192;
  r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(192, 192, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.NoToneMapping;
  scene = new THREE.Scene();
  scene.environment = createEnv(r);
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-2, 3, 3);
  scene.add(key, new THREE.HemisphereLight(0xffffff, 0x8877aa, 0.9));
  cam = new THREE.PerspectiveCamera(26, 1, 0.1, 20);
  cam.position.set(0, 0.25, 3.3);
  cam.lookAt(0, 0, 0);
  sphere = new THREE.SphereGeometry(0.5, 48, 32);
  mesh = new THREE.Mesh(sphere, new THREE.MeshStandardMaterial());
  mesh.scale.setScalar(1.22);
  scene.add(mesh);
}

export function ballImage(skin) {
  if (cache.has(skin.id)) return cache.get(skin.id);
  init();
  const look = ballLook(skin.look);
  mesh.geometry = look.geometry || sphere;
  mesh.material = look.material;
  if (look.update) look.update(skin.look.kind === 'hue' ? 3.5 : 0.35);
  const front = ['face', 'eye', 'ghost'].includes(skin.look.kind); // these have a "front" that should face the viewer
  mesh.rotation.set(front ? 0.1 : 0.25, front ? 0 : 0.7, 0);
  r.render(scene, cam);
  const url = r.domElement.toDataURL('image/png');
  cache.set(skin.id, url);
  return url;
}

/** Free the GPU context once the shop is closed. */
export function releasePreview() {
  if (!r) return;
  scene.environment && scene.environment.dispose();
  r.dispose();
  r.forceContextLoss();
  r = null;
}
