// waves.js — what each wave throws at the star, and the spawner that trickles
// it in from the edges of the arena. Composition grows teeth as waves climb:
// darts join at wave 2, splitters at wave 3, and a Devourer owns every fifth
// wave. Wave 10's Devourer is the final one — kill it and the star ignites.

import { makeHostile, makeFinalDevourer } from './entities.js';
import { edgeSpawnPoint } from './world.js';

export const FINAL_WAVE = 10;

export function waveComposition(wave) {
  if (wave % 5 === 0) {
    // Boss waves: the Devourer plus a light escort that keeps pressure on.
    return { devourer: 1, chaser: 4, dart: 3, splitter: 1 };
  }
  return {
    devourer: 0,
    chaser: 3 + wave,
    dart: wave >= 2 ? 1 + wave : 0,
    splitter: wave >= 3 ? Math.floor(wave / 2) : 0,
  };
}

export function waveSpawnInterval(wave) {
  return Math.max(0.45, 1.15 - wave * 0.07);
}

export function waveTotal(comp) {
  return comp.devourer + comp.chaser + comp.dart + comp.splitter;
}

// A shuffled spawn queue for one wave. next() deals one hostile at a time so
// the arena fills at a fair pace instead of all at once.
export function createSpawner(wave, rng) {
  const comp = waveComposition(wave);
  const queue = [];
  if (comp.devourer > 0) queue.push(wave >= FINAL_WAVE ? 'final-devourer' : 'devourer');
  for (let i = 0; i < comp.chaser; i++) queue.push('chaser');
  for (let i = 0; i < comp.dart; i++) queue.push('dart');
  for (let i = 0; i < comp.splitter; i++) queue.push('splitter');
  // Shuffle everything behind the boss, so escorts arrive in mixed order.
  for (let i = queue.length - 1; i > 1; i--) {
    const j = 1 + Math.floor(rng() * i);
    const tmp = queue[i];
    queue[i] = queue[j];
    queue[j] = tmp;
  }
  return {
    wave,
    total: queue.length,
    remaining: queue.length,
    interval: waveSpawnInterval(wave),
    timer: 0.4, // first hostile arrives quickly
    next(game, dt) {
      if (this.remaining <= 0) return null;
      this.timer -= dt;
      if (this.timer > 0) return null;
      this.timer = this.interval;
      const type = queue[this.total - this.remaining];
      this.remaining--;
      const pt = edgeSpawnPoint(game.rng, 46);
      if (type === 'final-devourer') return makeFinalDevourer(pt.x, pt.y);
      return makeHostile(type, pt.x, pt.y, wave, rng);
    },
    done() {
      return this.remaining <= 0;
    },
  };
}
