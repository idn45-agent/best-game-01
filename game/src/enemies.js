// enemies.js — The four hunters of STARFORGE.
//
// Mote (drifter), Wisp (fast zigzag), Spitter (ranged, keeps its distance)
// and Brute (tanky charger). Each has its own movement brain, health and
// damage so waves feel different as the mix changes. Enemy bullets live in
// state.enemyBullets; status effects (burn, freeze, slow) ride on the
// enemy object itself.

import { spawnSparks, spawnFloater } from './particles.js';
import { randRange, randAngle } from './rng.js';

export const ENEMY_TYPES = {
  mote: {
    name: 'Mote', hp: 18, speed: 72, radius: 12, damage: 8,
    score: 10, xp: 1, color: '#7fe7ff', glow: '#2fa8c9',
  },
  wisp: {
    name: 'Wisp', hp: 12, speed: 155, radius: 10, damage: 6,
    score: 15, xp: 1, color: '#ffe066', glow: '#c9a52f',
  },
  spitter: {
    name: 'Spitter', hp: 26, speed: 58, radius: 14, damage: 10,
    score: 25, xp: 2, color: '#ff7ad9', glow: '#c92f8f',
  },
  brute: {
    name: 'Brute', hp: 95, speed: 46, radius: 23, damage: 18,
    score: 40, xp: 3, color: '#ff5d5d', glow: '#a32f2f',
  },
};

let enemyIdCounter = 1;

export function spawnEnemy(state, type, x, y, hpScale) {
  const def = ENEMY_TYPES[type];
  const hp = Math.round(def.hp * (hpScale || 1));
  const enemy = {
    id: enemyIdCounter++,
    type,
    x, y,
    vx: 0, vy: 0,
    hp, maxHp: hp,
    radius: def.radius,
    speed: def.speed * (0.9 + state.rng() * 0.2),
    damage: def.damage,
    score: def.score,
    xp: def.xp,
    color: def.color,
    glow: def.glow,
    angle: randAngle(state.rng),
    wobble: randRange(state.rng, 0, Math.PI * 2),
    shootCd: randRange(state.rng, 1.2, 2.4),
    chargeCd: randRange(state.rng, 2.5, 4),
    charging: 0,
    chargeVx: 0, chargeVy: 0,
    telegraph: 0,
    burn: 0, burnDps: 0,
    freeze: 0,
    slow: 0,
    hitFlash: 0,
    spawnT: 0.35,
  };
  state.enemies.push(enemy);
  return enemy;
}

// Spawn just outside the arena, on a random edge.
export function spawnAtEdge(state, type, hpScale) {
  const margin = 30;
  const side = Math.floor(state.rng() * 4);
  let x; let y;
  if (side === 0) { x = randRange(state.rng, 0, 1280); y = -margin; }
  else if (side === 1) { x = 1280 + margin; y = randRange(state.rng, 0, 720); }
  else if (side === 2) { x = randRange(state.rng, 0, 1280); y = 720 + margin; }
  else { x = -margin; y = randRange(state.rng, 0, 720); }
  return spawnEnemy(state, type, x, y, hpScale);
}

function applySlow(enemy, factor) {
  return enemy.freeze > 0 ? 0 : enemy.speed * factor;
}

export function updateEnemies(state, dt) {
  const p = state.player;
  const frostOn = state.stats.frostRadius > 0;
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    if (e.spawnT > 0) e.spawnT -= dt;
    if (e.hitFlash > 0) e.hitFlash -= dt;
    if (e.freeze > 0) {
      e.freeze -= dt;
      continue; // frozen solid: no movement, no attacks
    }
    // Burn damage over time.
    if (e.burn > 0) {
      e.burn -= dt;
      damageEnemy(state, e, e.burnDps * dt, { silent: true, noChain: true });
      if (e.hp <= 0) continue;
    }
    // Frost veil: foes near the ship are slowed and take +15% damage.
    let speedMul = 1;
    if (frostOn) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < state.stats.frostRadius) speedMul = 1 - state.stats.frostSlow;
    }
    if (e.slow > 0) {
      e.slow -= dt;
      speedMul *= 0.6;
    }

    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    if (e.type === 'mote') {
      e.wobble += dt * 2.2;
      const wob = Math.sin(e.wobble) * 0.5;
      const px = -ny * wob;
      const py = nx * wob;
      e.vx = (nx + px) * e.speed * speedMul;
      e.vy = (ny + py) * e.speed * speedMul;
    } else if (e.type === 'wisp') {
      e.wobble += dt * 6;
      const wob = Math.sin(e.wobble) * 0.9;
      e.vx = (nx - ny * wob) * e.speed * speedMul;
      e.vy = (ny + nx * wob) * e.speed * speedMul;
    } else if (e.type === 'spitter') {
      // Keep a ~260 ring around the player and spit plasma.
      const want = 260;
      const radial = dist < want - 40 ? -1 : dist > want + 40 ? 1 : 0;
      e.vx = nx * radial * e.speed * speedMul;
      e.vy = ny * radial * e.speed * speedMul;
      e.shootCd -= dt;
      if (e.shootCd <= 0 && dist < 560 && e.spawnT <= 0) {
        e.shootCd = 2.1 + state.rng() * 0.7;
        const bs = 190;
        state.enemyBullets.push({
          x: e.x, y: e.y,
          vx: nx * bs, vy: ny * bs,
          radius: 6, damage: e.damage, life: 4, color: '#ff7ad9',
        });
        spawnSparks(state, e.x, e.y, '#ff7ad9', 4, 60, 0.3);
      }
    } else if (e.type === 'brute') {
      e.chargeCd -= dt;
      if (e.charging > 0) {
        e.charging -= dt;
        e.vx = e.chargeVx;
        e.vy = e.chargeVy;
        if (e.charging <= 0) e.chargeCd = 3 + state.rng() * 1.5;
      } else if (e.telegraph > 0) {
        e.telegraph -= dt;
        e.vx = 0;
        e.vy = 0;
        if (e.telegraph <= 0) {
          e.charging = 0.55;
          e.chargeVx = nx * 340;
          e.chargeVy = ny * 340;
          state.audio.hit();
        }
      } else {
        e.vx = nx * e.speed * speedMul;
        e.vy = ny * e.speed * speedMul;
        if (e.chargeCd <= 0 && dist < 320 && dist > 60) {
          e.telegraph = 0.6;
          spawnSparks(state, e.x, e.y, '#ff5d5d', 8, 90, 0.4);
        }
      }
    }

    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.x = Math.max(16, Math.min(1264, e.x));
    e.y = Math.max(16, Math.min(704, e.y));
    e.angle = Math.atan2(e.vy, e.vx);

    // Separation: hunters do not stack on one point.
    for (let j = 0; j < state.enemies.length; j++) {
      const o = state.enemies[j];
      if (o === e) continue;
      const ox = e.x - o.x;
      const oy = e.y - o.y;
      const od = Math.hypot(ox, oy);
      const min = e.radius + o.radius + 2;
      if (od > 0.01 && od < min) {
        const push = (min - od) * 0.5;
        e.x += (ox / od) * push;
        e.y += (oy / od) * push;
      }
    }
  }
}

// Damage one enemy. Handles death: score, chain, gems, particles, procs.
export function damageEnemy(state, enemy, rawDamage, opts) {
  const o = opts || {};
  let dmg = rawDamage;
  if (state.stats.frostRadius > 0) {
    const d = Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y);
    if (d < state.stats.frostRadius) dmg *= 1.15;
  }
  enemy.hp -= dmg;
  enemy.hitFlash = 0.09;
  if (!o.silent) {
    spawnFloater(state, enemy.x, enemy.y - enemy.radius - 6,
      String(Math.round(dmg)), o.crit ? '#ffe066' : '#ffffff', o.crit ? 17 : 13);
  }
  if (enemy.hp > 0) return false;

  // Death.
  const idx = state.enemies.indexOf(enemy);
  if (idx >= 0) state.enemies.splice(idx, 1);
  state.kills++;
  state.waveKills++;
  const chainMul = 1 + Math.min(state.chain, 12) * 0.15;
  const gained = Math.round(enemy.score * chainMul);
  state.score += gained;
  spawnSparks(state, enemy.x, enemy.y, enemy.color, 16, 220, 0.6);
  spawnSparks(state, enemy.x, enemy.y, '#ffffff', 6, 140, 0.4);
  spawnFloater(state, enemy.x, enemy.y, `+${gained}`, '#7fe7ff', 15);
  state.audio.enemyDie();
  state.shake = Math.min(state.shake + 2, 7);

  // NOVA CHAIN: kills inside the window stack the multiplier.
  if (!o.noChain) {
    state.chain += 1;
    state.chainTimer = state.stats.chainWindow;
    if (state.chain > state.chainBest) state.chainBest = state.chain;
    if (state.chain > 0 && state.chain % 8 === 0 && state.stats.bloodEmberHeal > 0) {
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + state.stats.bloodEmberHeal);
      spawnFloater(state, state.player.x, state.player.y - 26, `+${state.stats.bloodEmberHeal} HP`, '#7dff8a', 14);
    }
    if (state.stats.killHeal > 0) {
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + state.stats.killHeal);
    }
    // Chain lightning: the kill zaps the nearest foes.
    if (state.stats.chainZap > 0) {
      let remaining = 2;
      let fromX = enemy.x;
      let fromY = enemy.y;
      const hitSet = new Set();
      while (remaining > 0) {
        let best = null;
        let bestD = 320;
        for (const e of state.enemies) {
          if (hitSet.has(e.id)) continue;
          const d = Math.hypot(e.x - fromX, e.y - fromY);
          if (d < bestD) { bestD = d; best = e; }
        }
        if (!best) break;
        hitSet.add(best.id);
        spawnSparks(state, best.x, best.y, '#ffe066', 8, 160, 0.35);
        damageEnemy(state, best, state.stats.chainZap, { silent: true, noChain: true });
        fromX = best.x;
        fromY = best.y;
        remaining--;
      }
    }
  }

  // Drop starshards (XP gems), sometimes a heart.
  const gems = enemy.xp;
  for (let g = 0; g < gems; g++) {
    state.gems.push({
      x: enemy.x + (state.rng() - 0.5) * 24,
      y: enemy.y + (state.rng() - 0.5) * 24,
      vx: (state.rng() - 0.5) * 60,
      vy: (state.rng() - 0.5) * 60,
      value: 1,
      kind: 'shard',
      life: 14,
    });
  }
  if (state.rng() < 0.06) {
    state.gems.push({
      x: enemy.x, y: enemy.y,
      vx: 0, vy: 0, value: 12, kind: 'heart', life: 10,
    });
  }
  return true;
}

// Burn an enemy over time (ember trail, pyrochain zones).
export function igniteEnemy(state, enemy, dps, seconds) {
  enemy.burn = Math.max(enemy.burn, seconds);
  enemy.burnDps = Math.max(enemy.burnDps, dps);
}
