// waves.js — The wave director of STARFORGE.
//
// Ten waves. Waves 1–9 mix the four hunters in growing numbers and speed;
// wave 10 is the Devourer. Clearing a wave pays a bonus, heals a little,
// and opens a short intermission before the next banner. Ambient asteroids
// drift in from the edges all run long so the gravity well never starves.

import { spawnAtEdge } from './enemies.js';
import { spawnBoss } from './boss.js';
import { randRange } from './rng.js';

// Composition per wave: [type, count]. HP scales gently with the wave.
export const WAVE_COMPS = {
  1: [['mote', 6]],
  2: [['mote', 8], ['wisp', 3]],
  3: [['mote', 9], ['wisp', 5], ['spitter', 2]],
  4: [['mote', 10], ['wisp', 6], ['spitter', 3], ['brute', 1]],
  5: [['mote', 10], ['wisp', 8], ['spitter', 4], ['brute', 2]],
  6: [['mote', 12], ['wisp', 9], ['spitter', 5], ['brute', 3]],
  7: [['mote', 12], ['wisp', 11], ['spitter', 6], ['brute', 3]],
  8: [['mote', 14], ['wisp', 12], ['spitter', 7], ['brute', 4]],
  9: [['mote', 14], ['wisp', 13], ['spitter', 8], ['brute', 5]],
  10: [],
};

export const WAVE_NAMES = {
  1: 'FIRST LIGHT',
  2: 'DRIFTING MOTES',
  3: 'SPITTER NEST',
  4: 'BRUTE AWAKENS',
  5: 'THE SWARM THICKENS',
  6: 'EMBER STORM',
  7: 'HUNGER GROWS',
  8: 'THE LONG NIGHT',
  9: 'BEFORE THE MAW',
  10: 'THE DEVOURER',
};

export function startWave(state, n) {
  state.wave = n;
  state.waveKills = 0;
  state.spawnQueue = [];
  const comp = WAVE_COMPS[n] || [];
  for (const [type, count] of comp) {
    for (let i = 0; i < count; i++) state.spawnQueue.push(type);
  }
  // Shuffle the queue so the mix arrives interleaved, not in blocks.
  for (let i = state.spawnQueue.length - 1; i > 0; i--) {
    const j = Math.floor(state.rng() * (i + 1));
    [state.spawnQueue[i], state.spawnQueue[j]] = [state.spawnQueue[j], state.spawnQueue[i]];
  }
  state.waveTotal = state.spawnQueue.length;
  state.spawnTimer = 0.5;
  state.intermission = 0;
  state.banner = {
    text: `WAVE ${n} — ${WAVE_NAMES[n] || ''}`,
    sub: n === 10 ? 'The Devourer comes. Forge the final star.' : `${state.waveTotal} hunters incoming`,
    t: 2.6,
  };
  if (n === 10) {
    spawnBoss(state);
  }
}

export function updateWaves(state, dt) {
  // Ambient asteroids: the forge's fuel, always drifting in.
  state.asteroidTimer -= dt;
  if (state.asteroidTimer <= 0) {
    state.asteroidTimer = 1.1;
    spawnAsteroid(state);
  }

  if (state.intermission > 0) {
    state.intermission -= dt;
    if (state.intermission <= 0) {
      startWave(state, state.wave + 1);
    }
    return;
  }

  // Feed the spawn queue a few at a time so waves arrive in pulses.
  if (state.spawnQueue.length > 0) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      state.spawnTimer = 0.55;
      const hpScale = 1 + (state.wave - 1) * 0.09;
      const batch = Math.min(3, state.spawnQueue.length);
      for (let i = 0; i < batch; i++) {
        spawnAtEdge(state, state.spawnQueue.shift(), hpScale);
      }
    }
    return;
  }

  // Wave clear: no queue left and no hunters (or boss) standing.
  const bossAlive = state.boss !== null;
  if (state.enemies.length === 0 && !bossAlive && state.mode === 'playing') {
    if (state.wave >= 10) return; // victory is handled by the boss death
    const bonus = 100 + state.wave * 50;
    state.score += bonus;
    const p = state.player;
    p.hp = Math.min(p.maxHp, p.hp + 12);
    state.banner = { text: `WAVE ${state.wave} CLEARED`, sub: `+${bonus} score  ·  +12 HP  ·  next wave soon`, t: 2.4 };
    state.audio.waveClear();
    state.intermission = 3;
  }
}

export function spawnAsteroid(state) {
  const side = Math.floor(state.rng() * 4);
  const margin = 24;
  let x; let y; let vx; let vy;
  if (side === 0) { x = randRange(state.rng, 0, 1280); y = -margin; vx = randRange(state.rng, -18, 18); vy = randRange(state.rng, 34, 62); }
  else if (side === 1) { x = 1280 + margin; y = randRange(state.rng, 0, 720); vx = -randRange(state.rng, 34, 62); vy = randRange(state.rng, -18, 18); }
  else if (side === 2) { x = randRange(state.rng, 0, 1280); y = 720 + margin; vx = randRange(state.rng, -18, 18); vy = -randRange(state.rng, 34, 62); }
  else { x = -margin; y = randRange(state.rng, 0, 720); vx = randRange(state.rng, 34, 62); vy = randRange(state.rng, -18, 18); }
  state.asteroids.push({
    x, y, vx, vy,
    radius: randRange(state.rng, 7, 12),
    angle: randRange(state.rng, 0, Math.PI * 2),
    spin: randRange(state.rng, -1.2, 1.2),
    captured: false,
    life: 30,
  });
}
