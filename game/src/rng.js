// rng.js — one seeded random stream for the whole game.
// Every random choice in STARFORGE flows through here, so a run is fully
// reproducible from its seed (?seed=N in the URL, or a shot's fixed seed).
// The generator is mulberry32: tiny, fast, and good enough for arcade work.

let state = 1;

// initRng(seed) — (re)seed the stream. Seed 0 is remapped because a zero
// state would stick mulberry32 at a degenerate point.
export function initRng(seed) {
  state = (seed >>> 0) || 0x9e3779b9;
}

// rnd() — the next float in [0, 1).
export function rnd() {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// rr(a, b) — float in [a, b). ri(a, b) — integer in [a, b], inclusive.
export function rr(a, b) {
  return a + rnd() * (b - a);
}

export function ri(a, b) {
  return Math.floor(rr(a, b + 1));
}

// pick(arr) — one element at random. chance(p) — true with probability p.
export function pick(arr) {
  return arr[Math.floor(rnd() * arr.length)];
}

export function chance(p) {
  return rnd() < p;
}

// angle() — a random direction in radians. jitter(v, amt) — v ± amt.
export function angle() {
  return rnd() * Math.PI * 2;
}

export function jitter(v, amt) {
  return v + rr(-amt, amt);
}
