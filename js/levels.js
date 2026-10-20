// Level supply: generation in a worker, with caching + prefetch and a synchronous fallback.
import { generateLevel } from './generator.js';

const cache = new Map();
const pending = new Map();
let worker = null;
let workerBroken = false;
let seq = 0;

function startWorker() {
  if (worker || workerBroken) return;
  try {
    // single-file builds embed the worker source in the page; otherwise load it as a module worker
    const inline = document.getElementById('gen-worker-src');
    worker = inline
      ? new Worker(URL.createObjectURL(new Blob([inline.textContent], { type: 'text/javascript' })))
      : new Worker(new URL('./gen-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, L, error } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (error || !L) { p.fallback(); return; }
      p.resolve(L);
    };
    worker.onerror = () => {
      workerBroken = true;
      worker = null;
      for (const p of pending.values()) p.fallback();
      pending.clear();
    };
  } catch (e) {
    workerBroken = true;
    worker = null;
  }
}

const key = (n, mode) => `${mode}:${n}`;

export function getLevel(n, mode) {
  const k = key(n, mode);
  if (cache.has(k)) return cache.get(k);
  const sync = () => generateLevel(n, mode);
  const promise = new Promise((resolve) => {
    startWorker();
    if (!worker) { resolve(sync()); return; }
    const id = ++seq;
    const t = setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve(sync()); } }, 9000);
    pending.set(id, {
      resolve: (L) => { clearTimeout(t); resolve(L); },
      fallback: () => { clearTimeout(t); resolve(sync()); },
    });
    worker.postMessage({ id, n, mode });
  });
  cache.set(k, promise);
  // keep memory bounded
  if (cache.size > 12) cache.delete(cache.keys().next().value);
  return promise;
}

export function prefetch(n, mode) {
  getLevel(n, mode);
}
