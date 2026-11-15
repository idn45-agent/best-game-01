// waves.js — the wave director. Decides what the void sends at the star:
// escalating packs of wraiths, a Devourer boss on waves 5 and 10, and a
// short breather between waves. Wave 10's Devourer is the final one:
// killing it ignites the star and wins the game.

import { makeEnemy } from './entities.js';

export const FINAL_WAVE = 10;

export function hpScaleFor(wave) {
  return 1 + (wave - 1) * 0.16;
}

export function makeSpawnEnemy(state) {
  return (kind, x, y) => makeEnemy(kind, x, y, hpScaleFor(state.wave));
}

function spawnPoint(state) {
  const side = Math.floor(state.rng() * 4);
  const m = 46;
  if (side === 0) return { x: state.rng() * state.width, y: -m };
  if (side === 1) return { x: state.width + m, y: state.rng() * state.height };
  if (side === 2) return { x: state.rng() * state.width, y: state.height + m };
  return { x: -m, y: state.rng() * state.height };
}

function compositionFor(wave) {
  const list = [];
  const chasers = 4 + wave * 2;
  for (let i = 0; i < chasers; i++) list.push('chaser');
  if (wave >= 2) for (let i = 0; i < 2 + wave; i++) list.push('dart');
  if (wave >= 3) for (let i = 0; i < Math.floor(wave * 0.8); i++) list.push('splitter');
  return list;
}

export function createDirector() {
  return {
    phase: 'announce', // announce -> spawning -> fighting -> breather
    timer: 1.6,
    queue: [],
    bossSpawned: false,

    update(state, dt) {
      this.timer -= dt;
      if (this.phase === 'announce') {
        if (this.timer > 0) return;
        this.queue = compositionFor(state.wave);
        // Shuffle the pack so kinds arrive mixed.
        for (let i = this.queue.length - 1; i > 0; i--) {
          const j = Math.floor(state.rng() * (i + 1));
          [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
        }
        if (state.wave % 5 === 0) {
          const p = spawnPoint(state);
          const boss = makeEnemy('devourer', p.x, p.y, hpScaleFor(state.wave) * (state.wave >= 10 ? 1.7 : 1));
          state.enemies.push(boss);
          if (state.wave >= FINAL_WAVE) state.finalBoss = boss;
          state.audio.roar();
          state.shake = Math.max(state.shake, 8);
          this.bossSpawned = true;
        }
        this.phase = 'spawning';
        this.timer = 0;
        return;
      }
      if (this.phase === 'spawning') {
        if (this.timer <= 0 && this.queue.length) {
          const kind = this.queue.shift();
          const p = spawnPoint(state);
          state.enemies.push(state.spawnEnemy(kind, p.x, p.y));
          this.timer = Math.max(0.28, 0.9 - state.wave * 0.055);
        }
        if (!this.queue.length) this.phase = 'fighting';
        return;
      }
      if (this.phase === 'fighting') {
        if (!state.enemies.length) {
          state.score += 100 * state.wave;
          state.wave += 1;
          this.bossSpawned = false;
          this.phase = 'announce';
          this.timer = 2.4;
        }
      }
    },
  };
}
