// entities.js — factories for everything that exists in the arena: the player
// star, asteroids (drifting, orbiting or flung), the four hostile kinds, XP
// shards, particles and floating score text. Pure data plus base stats; all
// behaviour lives in physics.js and main.js.

import { WORLD_W, WORLD_H, TAU } from './world.js';

let nextId = 1;

export function resetEntityIds() {
  nextId = 1;
}

// The newborn star. Every field an upgrade can touch starts at its base value
// here, so upgrades.js reads like a list of deltas against this sheet.
export function makePlayer() {
  return {
    kind: 'player',
    x: WORLD_W / 2,
    y: WORLD_H / 2,
    vx: 0,
    vy: 0,
    r: 16,
    hull: 100,
    hullMax: 100,
    speed: 238,
    gravity: 128, // capture radius of the gravity well
    orbitCap: 5, // how many rocks can orbit at once
    flingDamage: 1,
    multiFling: 1, // rocks launched per fling
    novaCdMax: 9,
    novaCd: 0,
    magnet: 78, // shard attraction radius
    level: 1,
    xp: 0,
    xpNext: 9,
    invuln: 0,
    flingCd: 0,
    pulse: 0,
  };
}

// Asteroid sizes: bigger rocks are rarer, slower to arrive and hit harder.
const ROCK_TIERS = [
  { r: 9, damage: 1, weight: 5 },
  { r: 12, damage: 2, weight: 3 },
  { r: 15, damage: 3, weight: 1.4 },
];

export function makeRock(rng, x, y) {
  const totalWeight = ROCK_TIERS.reduce((sum, t) => sum + t.weight, 0);
  let roll = rng() * totalWeight;
  let tier = ROCK_TIERS[0];
  for (const t of ROCK_TIERS) {
    roll -= t.weight;
    if (roll <= 0) {
      tier = t;
      break;
    }
  }
  const heading = rng.range(0, TAU);
  const drift = rng.range(14, 40);
  return {
    id: nextId++,
    kind: 'rock',
    mode: 'drift', // drift -> orbit -> flung
    x,
    y,
    vx: Math.cos(heading) * drift,
    vy: Math.sin(heading) * drift,
    r: tier.r,
    damage: tier.damage,
    rot: rng.range(0, TAU),
    spin: rng.range(-0.7, 0.7),
    sides: rng.int(6, 8),
    jag: Array.from({ length: 8 }, () => rng.range(0.78, 1.18)),
    orbitAngle: 0,
    orbitRadius: 0,
    orbitTime: 0,
    novaBorn: -99,
    life: 0,
    trail: [],
  };
}

const HOSTILE_STATS = {
  chaser: { r: 13, hp: 2, speed: 96, damage: 9, score: 50, xp: 1 },
  dart: { r: 7, hp: 1, speed: 196, damage: 6, score: 25, xp: 1 },
  splitter: { r: 19, hp: 3, speed: 60, damage: 12, score: 80, xp: 2 },
  devourer: { r: 47, hp: 55, speed: 37, damage: 20, score: 1500, xp: 10 },
};

export function makeHostile(type, x, y, wave, rng) {
  const base = HOSTILE_STATS[type];
  const hpBonus = type === 'devourer' ? 0 : Math.floor(wave / 4);
  const speedScale = Math.min(1.45, 1 + wave * 0.03);
  return {
    id: nextId++,
    kind: 'enemy',
    type,
    x,
    y,
    vx: 0,
    vy: 0,
    r: base.r,
    hp: base.hp + hpBonus,
    hpMax: base.hp + hpBonus,
    speed: base.speed * speedScale,
    damage: base.damage,
    score: base.score,
    xp: base.xp,
    rot: 0,
    wobble: rng ? rng.range(0, TAU) : 0,
    bornAt: 0,
    spawnT: 0, // devourer minion timer
    hitFlash: 0,
  };
}

// The wave-10 Devourer is the same maw with a much deeper health pool.
export function makeFinalDevourer(x, y) {
  const boss = makeHostile('devourer', x, y, 10);
  boss.hp = 125;
  boss.hpMax = 125;
  boss.speed = 42;
  return boss;
}

export function makeShard(x, y, rng) {
  const heading = rng.range(0, TAU);
  const speed = rng.range(20, 70);
  return {
    id: nextId++,
    kind: 'shard',
    x,
    y,
    vx: Math.cos(heading) * speed,
    vy: Math.sin(heading) * speed,
    r: 6,
    rot: rng.range(0, TAU),
    life: 14, // seconds before it fades
  };
}

export function makeParticle(x, y, opts) {
  return {
    id: nextId++,
    kind: 'particle',
    type: opts.type || 'spark', // spark | ring | glow
    x,
    y,
    vx: opts.vx || 0,
    vy: opts.vy || 0,
    r: opts.r || 3,
    color: opts.color || '#ffd34d',
    life: 0,
    lifeMax: opts.lifeMax || 0.45,
    width: opts.width || 3,
  };
}

export function makeFloater(x, y, text, color, size) {
  return {
    id: nextId++,
    kind: 'floater',
    x,
    y,
    text,
    color: color || '#ffffff',
    size: size || 20,
    life: 0,
    lifeMax: 1.15,
  };
}
