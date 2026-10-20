// Level generation runs off the main thread so large boards never hitch the UI.
import { generateLevel } from './generator.js';

self.onmessage = (e) => {
  const { id, n, mode } = e.data;
  try {
    self.postMessage({ id, L: generateLevel(n, mode) });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
