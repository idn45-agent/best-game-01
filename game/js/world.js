// world.js — the arena itself: world dimensions, small math helpers, a seeded
// random generator (so demo runs and screenshots are reproducible), the calm
// starfield backdrop, and the empty entity pools every run starts from.

export const WORLD_W = 1280;
export const WORLD_H = 720;
export const TAU = Math.PI * 2;

export function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function distance(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

// mulberry32: a tiny deterministic PRNG. The same seed always deals the same
// starfield, the same rock sizes and the same wave shuffles.
export function makeRng(seed) {
  let state = (seed >>> 0) || 1;
  const rng = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (lo, hi) => lo + rng() * (hi - lo);
  rng.int = (lo, hi) => Math.floor(rng.range(lo, hi + 1));
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.sign = () => (rng() < 0.5 ? -1 : 1);
  return rng;
}

// A deliberately calm backdrop: three parallax star layers over two very dim
// nebula washes, so the bright gameplay silhouettes always win the eye.
export function createStarfield(rng) {
  const layers = [];
  const layerSpecs = [
    { count: 90, factor: 0.012, size: 1.1, alpha: 0.5 },
    { count: 60, factor: 0.03, size: 1.7, alpha: 0.7 },
    { count: 30, factor: 0.06, size: 2.4, alpha: 0.95 },
  ];
  for (const spec of layerSpecs) {
    const stars = [];
    for (let i = 0; i < spec.count; i++) {
      stars.push({
        x: rng.range(0, WORLD_W),
        y: rng.range(0, WORLD_H),
        r: spec.size * rng.range(0.6, 1.3),
        tw: rng.range(0, TAU),
      });
    }
    layers.push({ stars, factor: spec.factor, alpha: spec.alpha });
  }
  const nebulas = [
    { x: 260, y: 150, r: 340, color: '64, 60, 160' },
    { x: 1030, y: 560, r: 380, color: '20, 110, 130' },
    { x: 880, y: 120, r: 240, color: '120, 40, 110' },
  ];
  return { layers, nebulas };
}

// Every entity the game can hold, grouped by kind. main.js owns one of these
// per run; physics, render and the spawner all read and write it.
export function createPools() {
  return {
    rocks: [],
    enemies: [],
    shards: [],
    particles: [],
    floaters: [],
  };
}

// Spawn just outside a random edge, so hostiles always fly in from the dark.
export function edgeSpawnPoint(rng, margin = 50) {
  const side = rng.int(0, 3);
  if (side === 0) return { x: rng.range(0, WORLD_W), y: -margin };
  if (side === 1) return { x: WORLD_W + margin, y: rng.range(0, WORLD_H) };
  if (side === 2) return { x: rng.range(0, WORLD_W), y: WORLD_H + margin };
  return { x: -margin, y: rng.range(0, WORLD_H) };
}
