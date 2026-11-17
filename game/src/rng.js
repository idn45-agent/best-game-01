// rng.js — Seeded random numbers (mulberry32) for STARFORGE.
//
// Every random draw in the game goes through one of these helpers so a
// screenshot scene (?shot=…&seed=N) renders deterministically: same seed,
// same asteroids, same enemies, same draft.

export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Integer in [min, max] inclusive.
export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

// Float in [min, max).
export function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

// Pick one element of an array.
export function randPick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Fisher–Yates shuffle, in place, using the seeded rng.
export function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// A random angle in radians.
export function randAngle(rng) {
  return rng() * Math.PI * 2;
}
