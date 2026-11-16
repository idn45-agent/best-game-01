// entities.js — factories for everything that moves in the arena.
// Plain data objects only; behaviour lives in physics.js, drawing in
// render.js. Keeping creation in one place means waves.js and the shot
// staging in main.js build scenes out of the same pieces as live play.

import { rr, ri, angle } from './rng.js';
import { WORLD_W, WORLD_H } from './world.js';

// ENEMY_INFO — the stat block per kind: hull points, body radius, contact
// damage, score value, xp shard value and top speed (before wave scaling).
export const ENEMY_INFO = {
  chaser: { hp: 2, r: 15, dmg: 10, score: 40, xp: 2, speed: 102 },
  dart: { hp: 1, r: 11, dmg: 8, score: 60, xp: 1, speed: 88 },
  splitter: { hp: 5, r: 21, dmg: 14, score: 90, xp: 3, speed: 56 },
  mini: { hp: 1, r: 9, dmg: 5, score: 25, xp: 1, speed: 148 },
  boss: { hp: 130, r: 54, dmg: 20, score: 1500, xp: 25, speed: 44 },
};

// makePlayer() — the starship at arena centre, full hull, empty nova.
export function makePlayer() {
  return {
    x: WORLD_W / 2, y: WORLD_H / 2,
    vx: 0, vy: 0, r: 14,
    hull: 100, hullMax: 100,
    face: -Math.PI / 2,
    invulnT: 0, flingCd: 0,
    novaCharge: 0.5,
    dead: false,
  };
}

// makeRock(x, y) — a free asteroid: irregular radius, slow tumble, and a
// shade index so the renderer can vary its grey-violet rock tones.
export function makeRock(x, y) {
  const a = angle();
  const sp = rr(14, 42);
  return {
    x, y,
    vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
    r: rr(11, 19),
    rot: angle(), rotV: rr(-0.9, 0.9),
    shade: ri(0, 2),
    state: 'free',
  };
}

// spawnRockAtEdge(player) — a new asteroid drifting in from just outside a
// random edge, biased to appear away from the player so it is a small trip.
export function spawnRockAtEdge(player) {
  let x = 0;
  let y = 0;
  for (let tries = 0; tries < 8; tries++) {
    const side = ri(0, 3);
    if (side === 0) { x = rr(0, WORLD_W); y = -24; }
    if (side === 1) { x = rr(0, WORLD_W); y = WORLD_H + 24; }
    if (side === 2) { x = -24; y = rr(0, WORLD_H); }
    if (side === 3) { x = WORLD_W + 24; y = rr(0, WORLD_H); }
    const d = Math.hypot(x - player.x, y - player.y);
    if (d > 300 || tries === 7) break;
  }
  const rock = makeRock(x, y);
  const inward = Math.atan2(WORLD_H / 2 - y, WORLD_W / 2 - x) + rr(-0.5, 0.5);
  const sp = rr(20, 46);
  rock.vx = Math.cos(inward) * sp;
  rock.vy = Math.sin(inward) * sp;
  return rock;
}

// makeEnemy(kind, x, y, wave) — one hunter. Speeds creep up with the wave
// number; darts get a dash clock, splitters a wobble phase, all of them a
// small random phase so groups never move in perfect lockstep.
export function makeEnemy(kind, x, y, wave = 1) {
  const info = ENEMY_INFO[kind];
  const speedScale = 1 + (wave - 1) * 0.045;
  return {
    kind, x, y,
    vx: 0, vy: 0,
    hp: info.hp, hpMax: info.hp,
    r: info.r, dmg: info.dmg,
    score: info.score, xp: info.xp,
    speed: info.speed * speedScale,
    t: 0, phase: angle(),
    flashT: 0,
    dashT: rr(1.2, 2.4), dashing: 0, teleT: 0, dashDx: 0, dashDy: 0,
    dead: false,
  };
}

// spawnEnemyAtEdge(kind, wave, player) — a hunter entering from an edge,
// kept away from the player's immediate neighbourhood.
export function spawnEnemyAtEdge(kind, wave, player) {
  let x = 0;
  let y = 0;
  for (let tries = 0; tries < 8; tries++) {
    const side = ri(0, 3);
    if (side === 0) { x = rr(30, WORLD_W - 30); y = -30; }
    if (side === 1) { x = rr(30, WORLD_W - 30); y = WORLD_H + 30; }
    if (side === 2) { x = -30; y = rr(30, WORLD_H - 30); }
    if (side === 3) { x = WORLD_W + 30; y = rr(30, WORLD_H - 30); }
    if (Math.hypot(x - player.x, y - player.y) > 340 || tries === 7) break;
  }
  return makeEnemy(kind, x, y, wave);
}

// makeBoss(finalBoss) — the Devourer. The wave-5 Devourer is a heavy maw
// ship; the wave-10 final Devourer is bigger, tougher, and gains a second
// phase at half hull (faster bursts, charges). Attack clocks live here so
// physics.js only reads and decrements them.
export function makeBoss(finalBoss) {
  const hp = finalBoss ? 300 : 130;
  return {
    kind: 'boss', final: finalBoss,
    x: WORLD_W / 2, y: 120,
    vx: 0, vy: 0,
    hp, hpMax: hp,
    r: finalBoss ? 64 : 54,
    dmg: ENEMY_INFO.boss.dmg,
    score: finalBoss ? 4000 : 1500,
    xp: ENEMY_INFO.boss.xp,
    speed: ENEMY_INFO.boss.speed,
    t: 0, phase: angle(),
    flashT: 0, rot: 0,
    phase2: false,
    burstT: 2.2, spreadT: 3.6, spawnT: 5.5, chargeT: 6.5,
    charging: 0, teleT: 0, chargeDx: 0, chargeDy: 0,
    dead: false,
  };
}

// makeShard(x, y, value) — one XP shard with a small scatter velocity.
export function makeShard(x, y, value) {
  const a = angle();
  const sp = rr(30, 90);
  return {
    x, y,
    vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
    value, t: 0, dead: false,
  };
}

// makeBolt(x, y, vx, vy) — a Devourer void bolt: slow, blockable by an
// orbiting rock, painful on the hull.
export function makeBolt(x, y, vx, vy) {
  return { x, y, vx, vy, r: 5, dmg: 8, t: 0, dead: false };
}

// dropShards(G, x, y, totalXp) — split an xp value into 1–4 shard objects
// and add them to the run. Big kills spill several shards for the magnet
// to sweep up, which reads far better than one fat pickup.
export function dropShards(G, x, y, totalXp) {
  let remaining = totalXp;
  while (remaining > 0) {
    const v = Math.min(remaining, ri(1, 3));
    G.shards.push(makeShard(x, y, v));
    remaining -= v;
    if (G.shards.length > 220) break;
  }
}
