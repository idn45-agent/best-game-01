// world.js — the deep-space backdrop and the drifting asteroid field.
// Owns the seeded RNG (mulberry32) so demo runs and screenshots are
// reproducible, the parallax starfield and nebula blobs, and the supply
// of free asteroids that wander in from the edges of the arena.

export function createRng(seed) {
  let a = (seed >>> 0) || 1;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NEBULA_TINTS = [
  'rgba(64, 40, 140, 0.20)',
  'rgba(16, 90, 130, 0.18)',
  'rgba(140, 30, 110, 0.14)',
  'rgba(30, 60, 160, 0.16)',
  'rgba(120, 60, 20, 0.10)',
];

export function createBackdrop(rng, width, height) {
  const layers = [];
  const layerSpecs = [
    { count: 110, speed: 6, size: 1.1, alpha: 0.5 },
    { count: 70, speed: 14, size: 1.7, alpha: 0.75 },
    { count: 34, speed: 26, size: 2.4, alpha: 1.0 },
  ];
  for (const spec of layerSpecs) {
    const stars = [];
    for (let i = 0; i < spec.count; i++) {
      stars.push({
        x: rng() * width,
        y: rng() * height,
        twinkle: rng() * Math.PI * 2,
        tint: rng() < 0.16 ? '#ffd9a0' : (rng() < 0.3 ? '#a8e6ff' : '#e8ecff'),
      });
    }
    layers.push({ ...spec, stars });
  }
  const blobs = [];
  for (let i = 0; i < 9; i++) {
    blobs.push({
      x: rng() * width,
      y: rng() * height,
      r: 130 + rng() * 260,
      tint: NEBULA_TINTS[i % NEBULA_TINTS.length],
      drift: 2 + rng() * 5,
    });
  }
  return { layers, blobs, width, height };
}

// A free asteroid: a grey-brown rock with a hand-drawn irregular outline.
// It drifts in a straight line until the star's gravity claims it.
export function makeAsteroid(rng, width, height) {
  const edge = Math.floor(rng() * 4);
  let x, y;
  if (edge === 0) { x = -30; y = rng() * height; }
  else if (edge === 1) { x = width + 30; y = rng() * height; }
  else if (edge === 2) { x = rng() * width; y = -30; }
  else { x = rng() * width; y = height + 30; }
  const aimX = width * (0.3 + rng() * 0.4);
  const aimY = height * (0.3 + rng() * 0.4);
  const dx = aimX - x, dy = aimY - y;
  const len = Math.hypot(dx, dy) || 1;
  const speed = 14 + rng() * 26;
  const radius = 9 + rng() * 8;
  const verts = [];
  const n = 8 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    verts.push({ a: (i / n) * Math.PI * 2, m: 0.72 + rng() * 0.42 });
  }
  return {
    kind: 'asteroid', x, y,
    vx: (dx / len) * speed, vy: (dy / len) * speed,
    radius, verts,
    spin: (rng() - 0.5) * 0.8, angle: rng() * Math.PI * 2,
    state: 'drift', // drift -> captured (handled in physics) -> orbit / gone
    orbitAngle: 0, orbitTime: 0,
  };
}

// Keeps a healthy supply of drifting asteroids on the field.
export function maintainAsteroids(state, dt) {
  const target = 9;
  state.asteroidTimer -= dt;
  const drifting = state.asteroids.filter((a) => a.state === 'drift').length;
  if (state.asteroidTimer <= 0 && drifting < target) {
    state.asteroids.push(makeAsteroid(state.rng, state.width, state.height));
    state.asteroidTimer = 0.7;
  }
  for (const a of state.asteroids) {
    if (a.state !== 'drift') continue;
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.angle += a.spin * dt;
  }
  // Drifting rocks that leave the arena are dropped; flung rocks are
  // dropped too (their projectile flies on without them); orbit rocks stay.
  state.asteroids = state.asteroids.filter((a) =>
    a.state === 'orbit' ||
    (a.state === 'drift' && a.x > -90 && a.x < state.width + 90 && a.y > -90 && a.y < state.height + 90));
}
