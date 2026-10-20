export function hash32(a, b = 0, c = 0) {
  let h = 0x811c9dc5 ^ a;
  h = Math.imul(h ^ (b + 0x9e3779b9), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13) ^ (c + 0x7f4a7c15), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  const f = function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.int = (n) => Math.floor(f() * n);
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.range = (a, b) => a + f() * (b - a);
  return f;
}
