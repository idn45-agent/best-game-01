// entities.js — factories for every actor in STARFORGE: the player star,
// the void-wraith enemy kinds, XP shards, particles and floating text.
// Pure data plus spawn helpers; movement and combat live in physics.js.

export function makeStar(x, y) {
  return {
    x, y, vx: 0, vy: 0,
    radius: 16,
    hull: 100, maxHull: 100,
    speed: 268,
    level: 1, xp: 0, xpNext: 6,
    gravityRadius: 150,
    orbitCapacity: 6,
    flingDamage: 34,
    flingRate: 0.20,
    multiFling: 1,
    novaCooldownMax: 9,
    novaTimer: 0,
    novaDamage: 95,
    novaRadius: 250,
    magnet: 130,
    invulnTimer: 0,
    pulse: 0,
  };
}

export const ENEMY_KINDS = {
  chaser:   { radius: 14, hp: 42,  speed: 96,  damage: 12, xp: 1, score: 50,  color: '#ff3ea8' },
  dart:     { radius: 9,  hp: 18,  speed: 178, damage: 8,  xp: 1, score: 80,  color: '#ff7847' },
  splitter: { radius: 21, hp: 68,  speed: 68,  damage: 14, xp: 2, score: 120, color: '#b46bff' },
  mini:     { radius: 9,  hp: 14,  speed: 138, damage: 7,  xp: 1, score: 40,  color: '#d98cff' },
  devourer: { radius: 46, hp: 950, speed: 50,  damage: 22, xp: 25, score: 1500, color: '#ff3860' },
};

export function makeEnemy(kind, x, y, hpScale = 1) {
  const base = ENEMY_KINDS[kind];
  return {
    kind, x, y, vx: 0, vy: 0,
    radius: base.radius,
    hp: Math.round(base.hp * hpScale),
    maxHp: Math.round(base.hp * hpScale),
    speed: base.speed,
    damage: base.damage,
    xp: base.xp,
    score: base.score,
    color: base.color,
    wobble: Math.random() * Math.PI * 2,
    flash: 0,
    spawnTimer: 0,
    dartTimer: 2.5,
  };
}

export function makeShard(x, y, rng) {
  return {
    x, y, vx: (rng() - 0.5) * 60, vy: (rng() - 0.5) * 60,
    radius: 5, value: 1, life: 14, spin: rng() * Math.PI * 2,
  };
}

export function makeParticle(x, y, vx, vy, life, size, color) {
  return { x, y, vx, vy, life, maxLife: life, size, color };
}

export function makeFloater(x, y, text, color) {
  return { x, y, text, color, life: 0.9, maxLife: 0.9 };
}

// A radial burst of glowing debris; colours come from whatever died.
export function spawnExplosion(state, x, y, color, count = 16, power = 190) {
  for (let i = 0; i < count; i++) {
    const a = state.rng() * Math.PI * 2;
    const sp = 30 + state.rng() * power;
    state.particles.push(makeParticle(
      x, y,
      Math.cos(a) * sp, Math.sin(a) * sp,
      0.35 + state.rng() * 0.55,
      1.5 + state.rng() * 2.6,
      state.rng() < 0.3 ? '#ffffff' : color,
    ));
  }
}

export function spawnTrailSpark(state, x, y, color) {
  state.particles.push(makeParticle(
    x + (state.rng() - 0.5) * 10, y + (state.rng() - 0.5) * 10,
    (state.rng() - 0.5) * 24, (state.rng() - 0.5) * 24,
    0.3 + state.rng() * 0.3, 1.4 + state.rng() * 1.6, color,
  ));
}
