// boss.js — The Devourer, final boss of STARFORGE.
//
// Two phases with different patterns and clear telegraphs, so the fight is
// a duel you can learn, not a bullet wall you survive by luck:
//   Phase 1 (100–50% HP): slow drift, telegraphed radial bursts, mote summons.
//   Phase 2 (<50% HP): faster, spiral bullet streams, telegraphed dash
//   charges across the arena, spitter summons.
// Counter-play is built in: orbit rocks block bullets, NOVA clears bullets,
// and every pattern has a wind-up you can read.

import { spawnSparks, spawnRing, spawnFloater } from './particles.js';
import { spawnEnemy } from './enemies.js';
import { randRange } from './rng.js';

export function spawnBoss(state) {
  const boss = {
    type: 'devourer',
    x: 640, y: -80,
    vx: 0, vy: 0,
    hp: 1500, maxHp: 1500,
    radius: 56,
    phase: 1,
    phaseAnnounced: false,
    entering: true,
    pattern: 'drift',
    patternT: 2.5,
    telegraph: 0,
    telegraphKind: '',
    spiralAngle: 0,
    spiralT: 0,
    dashVx: 0, dashVy: 0,
    dashing: 0,
    summonCd: 6,
    hitFlash: 0,
    burn: 0, burnDps: 0,
    freeze: 0,
    pulse: 0,
  };
  state.boss = boss;
  state.banner = { text: 'THE DEVOURER', sub: 'Forge the final star — survive the hunger', t: 3 };
  state.audio.bossRoar();
  state.shake = 10;
  return boss;
}

function fireRadial(state, boss, count, speed, offset) {
  for (let i = 0; i < count; i++) {
    const a = offset + (i / count) * Math.PI * 2;
    state.enemyBullets.push({
      x: boss.x + Math.cos(a) * (boss.radius + 6),
      y: boss.y + Math.sin(a) * (boss.radius + 6),
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      radius: 7, damage: 12, life: 6, color: '#ff5d8a',
    });
  }
}

function fireAimed(state, boss, count, spread, speed) {
  const p = state.player;
  const base = Math.atan2(p.y - boss.y, p.x - boss.x);
  for (let i = 0; i < count; i++) {
    const a = base + (i - (count - 1) / 2) * spread;
    state.enemyBullets.push({
      x: boss.x + Math.cos(a) * (boss.radius + 6),
      y: boss.y + Math.sin(a) * (boss.radius + 6),
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      radius: 7, damage: 12, life: 6, color: '#ff5d8a',
    });
  }
}

export function updateBoss(state, dt) {
  const boss = state.boss;
  if (!boss) return;
  const p = state.player;
  if (boss.hitFlash > 0) boss.hitFlash -= dt;
  boss.pulse += dt;

  // Burn over time.
  if (boss.burn > 0) {
    boss.burn -= dt;
    boss.hp -= boss.burnDps * dt;
  }
  if (boss.freeze > 0) {
    boss.freeze -= dt;
    return;
  }

  // Entrance: drift down to the top third, then the fight starts.
  if (boss.entering) {
    boss.y += 60 * dt;
    if (boss.y >= 170) {
      boss.entering = false;
      boss.patternT = 1.2;
    }
    return;
  }

  // Phase 2 begins at half health: new patterns, faster, angrier.
  if (boss.phase === 1 && boss.hp <= boss.maxHp * 0.5) {
    boss.phase = 2;
    boss.pattern = 'spiral';
    boss.patternT = 1.0;
    boss.spiralT = 0;
    state.banner = { text: 'PHASE II — STARHUNGER', sub: 'The Devourer sheds its shell. Watch the lines.', t: 2.6 };
    state.audio.bossPhase();
    state.shake = 12;
    spawnRing(state, boss.x, boss.y, '#ff5d8a', 320, 0.7);
    spawnSparks(state, boss.x, boss.y, '#ff5d8a', 40, 300, 0.8);
    // Clear the bullet field so the phase change is readable, not a trap.
    state.enemyBullets.length = 0;
  }

  const dx = p.x - boss.x;
  const dy = p.y - boss.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;

  // Telegraphs resolve into attacks.
  if (boss.telegraph > 0) {
    boss.telegraph -= dt;
    if (boss.telegraph <= 0) {
      if (boss.telegraphKind === 'radial') {
        fireRadial(state, boss, boss.phase === 2 ? 18 : 12, 170, state.rng() * Math.PI);
        state.audio.hit();
        spawnRing(state, boss.x, boss.y, '#ff5d8a', 200, 0.4);
      } else if (boss.telegraphKind === 'aimed') {
        fireAimed(state, boss, 5, 0.22, 260);
        state.audio.hit();
      } else if (boss.telegraphKind === 'dash') {
        boss.dashing = 0.7;
        boss.dashVx = nx * 520;
        boss.dashVy = ny * 520;
        state.audio.bossRoar();
        state.shake = Math.min(state.shake + 6, 12);
      }
    }
    return;
  }

  // Dashing: hurtling across the arena, then a breather.
  if (boss.dashing > 0) {
    boss.dashing -= dt;
    boss.x += boss.dashVx * dt;
    boss.y += boss.dashVy * dt;
    boss.x = Math.max(70, Math.min(1210, boss.x));
    boss.y = Math.max(70, Math.min(650, boss.y));
    spawnSparks(state, boss.x, boss.y, '#ff5d8a', 3, 60, 0.3);
    if (boss.dashing <= 0) {
      boss.patternT = 1.6;
      boss.pattern = 'drift';
    }
    return;
  }

  // Spiral stream (phase 2 only): a rotating emitter, dodge the lanes.
  if (boss.pattern === 'spiral') {
    boss.spiralT += dt;
    boss.spiralAngle += dt * 2.4;
    if (boss.spiralT > 0.08) {
      boss.spiralT = 0;
      for (const off of [0, Math.PI]) {
        const a = boss.spiralAngle + off;
        state.enemyBullets.push({
          x: boss.x + Math.cos(a) * (boss.radius + 6),
          y: boss.y + Math.sin(a) * (boss.radius + 6),
          vx: Math.cos(a) * 150, vy: Math.sin(a) * 150,
          radius: 6, damage: 10, life: 6, color: '#ff8ab0',
        });
      }
    }
    boss.x += nx * 26 * dt;
    boss.y += ny * 26 * dt;
    boss.patternT -= dt;
    if (boss.patternT <= 0) {
      boss.pattern = 'drift';
      boss.patternT = 1.4;
    }
    return;
  }

  // Drift: slow chase, with a summoned escort now and then.
  boss.patternT -= dt;
  const driftSpeed = boss.phase === 2 ? 52 : 34;
  boss.x += nx * driftSpeed * dt;
  boss.y += ny * driftSpeed * dt;
  boss.summonCd -= dt;
  if (boss.summonCd <= 0 && state.enemies.length < 6) {
    boss.summonCd = boss.phase === 2 ? 7 : 9;
    const kind = boss.phase === 2 ? 'spitter' : 'mote';
    for (let i = 0; i < (boss.phase === 2 ? 2 : 3); i++) {
      const a = randRange(state.rng, 0, Math.PI * 2);
      spawnEnemy(state, kind, boss.x + Math.cos(a) * 90, boss.y + Math.sin(a) * 90, 1);
    }
    spawnRing(state, boss.x, boss.y, '#ff5d8a', 160, 0.5);
    spawnFloater(state, boss.x, boss.y - 70, 'SUMMON', '#ff8ab0', 13);
  }

  // Pick the next attack pattern.
  if (boss.patternT <= 0) {
    const roll = state.rng();
    if (boss.phase === 2 && roll < 0.35) {
      boss.pattern = 'dash';
      boss.telegraph = 1.0;
      boss.telegraphKind = 'dash';
      spawnFloater(state, boss.x, boss.y - 70, '!! DASH !!', '#ff5d5d', 16);
    } else if (roll < 0.55) {
      boss.pattern = 'radial';
      boss.telegraph = 0.85;
      boss.telegraphKind = 'radial';
      spawnFloater(state, boss.x, boss.y - 70, 'BURST', '#ff8ab0', 14);
    } else if (roll < 0.8) {
      boss.pattern = 'aimed';
      boss.telegraph = 0.6;
      boss.telegraphKind = 'aimed';
    } else {
      boss.pattern = 'spiral';
      boss.patternT = boss.phase === 2 ? 3.2 : 2.0;
      boss.spiralT = 0;
    }
    if (boss.pattern !== 'spiral') boss.patternT = 2.2 + state.rng() * 1.4;
  }
}

// Damage the boss. Returns true when the boss dies.
export function damageBoss(state, rawDamage, opts) {
  const boss = state.boss;
  if (!boss) return false;
  const o = opts || {};
  boss.hp -= rawDamage;
  boss.hitFlash = 0.09;
  if (!o.silent) {
    spawnFloater(state, boss.x + (state.rng() - 0.5) * 60, boss.y - boss.radius - 8,
      String(Math.round(rawDamage)), o.crit ? '#ffe066' : '#ffffff', o.crit ? 18 : 14);
  }
  if (boss.hp > 0) return false;
  // Death: the star ignites.
  state.boss = null;
  state.score += 1000 * (1 + Math.min(state.chain, 12) * 0.15);
  spawnSparks(state, boss.x, boss.y, '#ff5d8a', 60, 380, 1.1);
  spawnSparks(state, boss.x, boss.y, '#ffe066', 40, 260, 1.0);
  spawnSparks(state, boss.x, boss.y, '#ffffff', 30, 200, 0.9);
  spawnRing(state, boss.x, boss.y, '#ffe066', 420, 0.9);
  spawnRing(state, boss.x, boss.y, '#ff5d8a', 300, 0.7);
  state.shake = 16;
  state.audio.victory();
  return true;
}
