// waves.js — the ten-wave campaign: what hunts you, in what order, and
// when the arena is clear. Waves trickle in from the edges so the fight
// builds instead of arriving as one wall; boss waves send the Devourer in
// first and keep a slow escort trickle behind it. Clearing a wave pays a
// score bonus and a gulp of nova charge, then a short breather.

import { sfx } from './audio.js';
import { spawnEnemyAtEdge, makeBoss } from './entities.js';
import { banner } from './physics.js';
import { rnd } from './rng.js';

// WAVE_TABLE — 1-indexed by wave number (index 0 unused). boss: 1 is the
// wave-5 Devourer, 2 is the wave-10 final Devourer.
export const WAVE_TABLE = [
  null,
  { chaser: 6, dart: 0, splitter: 0, boss: 0 },
  { chaser: 8, dart: 2, splitter: 0, boss: 0 },
  { chaser: 10, dart: 3, splitter: 1, boss: 0 },
  { chaser: 12, dart: 4, splitter: 3, boss: 0 },
  { chaser: 5, dart: 0, splitter: 0, boss: 1 },
  { chaser: 14, dart: 6, splitter: 4, boss: 0 },
  { chaser: 16, dart: 8, splitter: 5, boss: 0 },
  { chaser: 18, dart: 8, splitter: 6, boss: 0 },
  { chaser: 20, dart: 10, splitter: 7, boss: 0 },
  { chaser: 6, dart: 4, splitter: 2, boss: 2 },
];

export const LAST_WAVE = 10;

// buildQueue(row) — flatten a wave row into a spawn queue with the kinds
// interleaved (splitters and darts spread through the chasers, not stacked
// at the front), shuffled with the game stream.
function buildQueue(row) {
  const queue = [];
  for (let i = 0; i < row.chaser; i++) queue.push('chaser');
  for (let i = 0; i < row.dart; i++) queue.push('dart');
  for (let i = 0; i < row.splitter; i++) queue.push('splitter');
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = queue[i];
    queue[i] = queue[j];
    queue[j] = tmp;
  }
  return queue;
}

// startWave(G, n) — open wave n: banner, boss if the row has one, and a
// fresh trickle queue. The run's wave state lives on G.waveState.
export function startWave(G, n) {
  G.wave = n;
  const row = WAVE_TABLE[n];
  G.waveState = {
    queue: buildQueue(row),
    spawnT: 0.9,
    interval: row.boss ? 2.6 : 0.85,
    betweenT: 0,
    cleared: false,
  };
  if (row.boss === 1) {
    G.enemies.push(makeBoss(false));
    banner(G, 'THE DEVOURER AWAKENS', 'wave 5 — break its hull', 2.6);
  } else if (row.boss === 2) {
    G.enemies.push(makeBoss(true));
    banner(G, 'THE FINAL DEVOURER', 'wave 10 — ignite the star', 2.6);
  } else {
    banner(G, `WAVE ${n}`, waveTagline(n), 1.8);
  }
  sfx('wave');
}

// waveTagline(n) — the small line under a wave banner.
function waveTagline(n) {
  const lines = {
    1: 'catch rocks. throw rocks. survive.',
    2: 'darts are coming — watch for the bright line',
    3: 'splitters burst into minis',
    4: 'the swarm thickens',
    6: 'faster now — keep the chain alive',
    7: 'hold the orbit, spend it well',
    8: 'the dark is full of teeth',
    9: 'one more push',
  };
  return lines[n] || '';
}

// updateWaves(G, dt) — trickle spawns, detect the clear, run the breather,
// and open the next wave. The win itself comes from the final boss's death
// (physics sets G.pendingWin), so clearing wave 10's escorts alone does
// nothing while the Devourer lives.
export function updateWaves(G, dt) {
  const ws = G.waveState;
  if (!ws) return;
  if (ws.queue.length > 0) {
    ws.spawnT -= dt;
    const escorts = G.enemies.filter((e) => e.kind !== 'boss').length;
    if (ws.spawnT <= 0 && escorts < 14) {
      ws.spawnT = ws.interval;
      const kind = ws.queue.shift();
      G.enemies.push(spawnEnemyAtEdge(kind, G.wave, G.player));
    }
  } else if (!ws.cleared && G.enemies.length === 0) {
    ws.cleared = true;
    ws.betweenT = 2.4;
    const bonus = 50 + G.wave * 25;
    G.score += bonus;
    G.player.novaCharge = Math.min(1, G.player.novaCharge + 0.2);
    if (G.wave < LAST_WAVE) {
      banner(G, `WAVE ${G.wave} CLEARED`, `+${bonus} — breathe`, 1.8);
      sfx('wave');
    }
  } else if (ws.cleared && G.wave < LAST_WAVE) {
    ws.betweenT -= dt;
    if (ws.betweenT <= 0) startWave(G, G.wave + 1);
  }
}

// waveProgress(G) — hunters left to kill this wave (queued + alive), for
// the HUD's wave counter. Boss waves count the boss as one.
export function waveProgress(G) {
  const ws = G.waveState;
  if (!ws) return 0;
  return ws.queue.length + G.enemies.length;
}
