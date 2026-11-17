// player.js — The forge-ship and everything it does in STARFORGE.
//
// Movement, the gravity well (capture asteroids into orbit), throwing
// orbit rocks, the NOVA detonation, forge-wisps, the ember trail, XP gems
// and level-ups, and all collision: shots vs hunters, bullets vs ship and
// rocks, and contact damage. The ship's rocks are shield and ammo at once:
// an enemy bullet that hits a rock destroys the rock, not the ship.

import { spawnSparks, spawnRing, spawnFloater } from './particles.js';
import { damageEnemy, igniteEnemy } from './enemies.js';
import { damageBoss } from './boss.js';
import { rollDraft } from './upgrades.js';
import { randRange } from './rng.js';

const ARENA_W = 1280;
const ARENA_H = 720;

export function createPlayer() {
  return {
    x: 640, y: 360,
    vx: 0, vy: 0,
    angle: -Math.PI / 2,
    radius: 20,
    hp: 100, maxHp: 100,
    level: 1, xp: 0, xpNext: 8,
    rocks: [], // {angle, dist, size}
    throwCd: 0,
    novaCd: 0,
    iframes: 0,
    trailTick: 0,
    wispCd: 0,
    wispAngles: [],
    thrust: 0,
  };
}

export function orbitRockPosition(p, rock) {
  return {
    x: p.x + Math.cos(rock.angle) * rock.dist,
    y: p.y + Math.sin(rock.angle) * rock.dist,
  };
}

export function updatePlayer(state, dt) {
  const p = state.player;
  const s = state.stats;
  const input = state.input;

  if (p.iframes > 0) p.iframes -= dt;
  if (p.throwCd > 0) p.throwCd -= dt;
  if (p.novaCd > 0) p.novaCd -= dt;

  // Movement: snappy acceleration, soft damping.
  const mv = input.moveVector();
  const accel = 2400;
  p.vx += mv.x * accel * dt;
  p.vy += mv.y * accel * dt;
  const damp = Math.pow(0.0015, dt);
  p.vx *= damp;
  p.vy *= damp;
  const spd = Math.hypot(p.vx, p.vy);
  const maxSpd = s.moveSpeed;
  if (spd > maxSpd) {
    p.vx = (p.vx / spd) * maxSpd;
    p.vy = (p.vy / spd) * maxSpd;
  }
  p.x = Math.max(24, Math.min(ARENA_W - 24, p.x + p.vx * dt));
  p.y = Math.max(24, Math.min(ARENA_H - 24, p.y + p.vy * dt));
  p.thrust = Math.min(1, spd / maxSpd);
  p.angle = input.aimAngle(p.x, p.y);

  // Regeneration.
  if (s.regen > 0 && p.hp < p.maxHp) {
    p.hp = Math.min(p.maxHp, p.hp + s.regen * dt);
  }

  // Gravity well: pull drifting asteroids in and capture them into orbit.
  for (let i = state.asteroids.length - 1; i >= 0; i--) {
    const a = state.asteroids[i];
    a.life -= dt;
    if (a.life <= 0) {
      state.asteroids.splice(i, 1);
      continue;
    }
    const dx = p.x - a.x;
    const dy = p.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    // Outer tug: the well bends nearby asteroids toward the ship from
    // twice its radius, so the forge is never starved while moving.
    if (d < s.wellRadius * 2) {
      const tug = 150 * (1 - d / (s.wellRadius * 2));
      a.vx += (dx / d) * tug * dt;
      a.vy += (dy / d) * tug * dt;
    }
    if (d < s.wellRadius) {
      const pull = 420 * (1 - d / s.wellRadius) + 60;
      a.vx += (dx / d) * pull * dt;
      a.vy += (dy / d) * pull * dt;
    }
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.angle += a.spin * dt;
    if (Math.abs(a.x) > 1400 || Math.abs(a.y) > 840) {
      state.asteroids.splice(i, 1);
      continue;
    }
    if (d < p.radius + 30 && p.rocks.length < s.maxRocks) {
      state.asteroids.splice(i, 1);
      p.rocks.push({
        angle: Math.atan2(a.y - p.y, a.x - p.x),
        dist: 54 + p.rocks.length * 9,
        size: a.radius,
      });
      spawnSparks(state, p.x, p.y, '#ffb347', 5, 90, 0.35);
      state.audio.pickup();
    }
  }

  // Orbit the captured rocks.
  for (const rock of p.rocks) {
    rock.angle += s.orbitSpeed * dt;
  }

  // Ember trail: moving leaves burning ground behind.
  if (s.emberTrail && spd > 60) {
    p.trailTick -= dt;
    if (p.trailTick <= 0) {
      p.trailTick = 0.14;
      if (state.burnZones.length < 26) {
        state.burnZones.push({ x: p.x, y: p.y, radius: 26, life: 2.2, dps: s.emberDps });
      }
    }
  }

  // Forge-wisps: orbit and fire bolts at the nearest hunter.
  const wantWisps = s.wispCount;
  while (p.wispAngles.length < wantWisps) p.wispAngles.push(state.rng() * Math.PI * 2);
  while (p.wispAngles.length > wantWisps) p.wispAngles.pop();
  p.wispCd -= dt;
  if (wantWisps > 0 && p.wispCd <= 0 && state.enemies.length > 0) {
    p.wispCd = 0.85;
    let best = null;
    let bestD = 460;
    for (const e of state.enemies) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (best) {
      const wi = Math.floor(state.rng() * wantWisps);
      const wa = p.wispAngles[wi] || 0;
      const wx = p.x + Math.cos(wa) * 74;
      const wy = p.y + Math.sin(wa) * 74;
      const a = Math.atan2(best.y - wy, best.x - wx);
      state.shots.push({
        x: wx, y: wy, vx: Math.cos(a) * 540, vy: Math.sin(a) * 540,
        damage: 14, pierce: 0, radius: 5, life: 1.4,
        crit: false, split: false, hasSplit: true, bounced: true,
        color: '#b78cff', kind: 'wisp',
      });
      state.audio.shoot();
    }
  }
  for (let i = 0; i < p.wispAngles.length; i++) {
    p.wispAngles[i] += 2.2 * dt;
  }

  // Throw: hold mouse or Space to hurl the outermost rock at the aim.
  const wantThrow = input.mouseDown || input.isDown(' ');
  if (wantThrow && p.throwCd <= 0 && p.rocks.length > 0) {
    p.throwCd = s.throwCooldown;
    const count = Math.min(s.throwCount, p.rocks.length);
    for (let i = 0; i < count; i++) {
      const rock = p.rocks.pop();
      const spread = (i - (count - 1) / 2) * 0.14;
      const a = p.angle + spread;
      const crit = state.rng() < s.critChance;
      state.shots.push({
        x: p.x + Math.cos(a) * 30,
        y: p.y + Math.sin(a) * 30,
        vx: Math.cos(a) * 660,
        vy: Math.sin(a) * 660,
        damage: s.throwDamage * (crit ? s.critMult : 1),
        pierce: s.pierce,
        radius: rock.size + 2,
        life: 1.1,
        crit,
        split: s.split,
        hasSplit: false,
        bounced: !s.ricochet,
        color: '#ffb347',
        kind: 'rock',
        hitIds: new Set(),
      });
      state.runStats.shotsFired++;
    }
    state.audio.throwRock();
    spawnSparks(state, p.x, p.y, '#ffb347', 4, 120, 0.25);
  }

  // NOVA: detonate every orbit rock. Big blast, clears bullets, procs.
  const wantNova = input.wasPressed('e') || input.wasPressed('shift');
  if (wantNova && p.novaCd <= 0 && p.rocks.length > 0) {
    detonateNova(state);
  }

  updateShots(state, dt);
  updateEnemyBullets(state, dt);
  updateGems(state, dt);
  updateBurnZones(state, dt);
  updateContact(state, dt);

  // NOVA CHAIN timer.
  if (state.chainTimer > 0) {
    state.chainTimer -= dt;
    if (state.chainTimer <= 0) state.chain = 0;
  }
}

export function detonateNova(state) {
  const p = state.player;
  const s = state.stats;
  const rocksUsed = p.rocks.length;
  p.rocks.length = 0;
  p.novaCd = s.novaCooldown;
  state.runStats.novas++;
  const chainBonus = 1 + Math.min(state.chain, 12) * 0.08;
  const dmg = s.novaDamage * chainBonus;
  const radius = s.novaRadius + rocksUsed * 8;

  state.audio.nova();
  state.shake = Math.min(state.shake + 9, 16);
  spawnRing(state, p.x, p.y, '#ff9d3c', radius, 0.55);
  if (s.novaRings > 1) spawnRing(state, p.x, p.y, '#ffe066', radius * 0.8, 0.7);
  spawnSparks(state, p.x, p.y, '#ff9d3c', 30, 320, 0.7);
  spawnFloater(state, p.x, p.y - 44, `NOVA x${state.chain > 0 ? state.chain : 1}`, '#ff9d3c', 20);

  // Clear enemy bullets inside the blast: the nova is the counter-play.
  for (let i = state.enemyBullets.length - 1; i >= 0; i--) {
    const b = state.enemyBullets[i];
    if (Math.hypot(b.x - p.x, b.y - p.y) < radius) {
      spawnSparks(state, b.x, b.y, '#ff8ab0', 3, 80, 0.3);
      state.enemyBullets.splice(i, 1);
    }
  }
  // Damage hunters and the boss.
  for (const e of state.enemies.slice()) {
    if (Math.hypot(e.x - p.x, e.y - p.y) < radius + e.radius) {
      damageEnemy(state, e, dmg, { silent: false });
    }
  }
  if (state.boss && Math.hypot(state.boss.x - p.x, state.boss.y - p.y) < radius + state.boss.radius) {
    damageBoss(state, dmg, {});
  }
  // Synergy procs.
  if (hasSynergyLocal(state, 'pyrochain')) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + state.rng();
      state.burnZones.push({
        x: p.x + Math.cos(a) * radius * 0.55,
        y: p.y + Math.sin(a) * radius * 0.55,
        radius: 34, life: 3, dps: s.emberDps + 10,
      });
    }
  }
  if (hasSynergyLocal(state, 'stormforge')) {
    let zapped = 0;
    const targets = state.enemies.slice().sort((a, b) =>
      Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    for (const e of targets) {
      if (zapped >= 5) break;
      spawnSparks(state, e.x, e.y, '#ffe066', 10, 180, 0.4);
      damageEnemy(state, e, 55, { silent: true, noChain: true });
      zapped++;
    }
    if (state.boss) damageBoss(state, 55, { silent: true });
  }
  if (hasSynergyLocal(state, 'cryonova')) {
    for (const e of state.enemies) {
      if (Math.hypot(e.x - p.x, e.y - p.y) < radius + e.radius) e.freeze = 2;
    }
    if (state.boss) state.boss.freeze = 2;
  }
}

function hasSynergyLocal(state, id) {
  // Local alias so this module does not import the whole upgrades table.
  const SYNERGY_PAIRS = {
    pyrochain: ['nova-chain', 'ember-trail'],
    stormforge: ['chain-lightning', 'nova-chain'],
    cryonova: ['frost-veil', 'nova-chain'],
  };
  const pair = SYNERGY_PAIRS[id];
  if (!pair) return false;
  return (state.upgradesTaken[pair[0]] || 0) > 0 && (state.upgradesTaken[pair[1]] || 0) > 0;
}

function updateShots(state, dt) {
  for (let i = state.shots.length - 1; i >= 0; i--) {
    const sh = state.shots[i];
    sh.life -= dt;
    sh.x += sh.vx * dt;
    sh.y += sh.vy * dt;
    if (sh.life <= 0 || sh.x < -20 || sh.x > 1300 || sh.y < -20 || sh.y > 740) {
      state.shots.splice(i, 1);
      continue;
    }
    let consumed = false;
    // Hit hunters.
    for (const e of state.enemies.slice()) {
      if (sh.hitIds && sh.hitIds.has(e.id)) continue;
      const d = Math.hypot(e.x - sh.x, e.y - sh.y);
      if (d < e.radius + sh.radius) {
        if (sh.hitIds) sh.hitIds.add(e.id);
        const died = damageEnemy(state, e, sh.damage, { crit: sh.crit });
        state.audio.hit();
        spawnSparks(state, sh.x, sh.y, sh.color, 6, 140, 0.3);
        if (sh.split && !sh.hasSplit) {
          sh.hasSplit = true;
          for (const off of [-0.5, 0.5]) {
            const a = Math.atan2(sh.vy, sh.vx) + off;
            state.shots.push({
              x: sh.x, y: sh.y,
              vx: Math.cos(a) * 560, vy: Math.sin(a) * 560,
              damage: sh.damage * 0.6, pierce: 0, radius: 5, life: 0.8,
              crit: false, split: false, hasSplit: true, bounced: true,
              color: '#ffb347', kind: 'shard', hitIds: new Set(),
            });
          }
        }
        if (!sh.bounced) {
          sh.bounced = true;
          let best = null;
          let bestD = 180;
          for (const o of state.enemies) {
            if (o === e) continue;
            const od = Math.hypot(o.x - e.x, o.y - e.y);
            if (od < bestD) { bestD = od; best = o; }
          }
          if (best) {
            const a = Math.atan2(best.y - sh.y, best.x - sh.x);
            const sp = Math.hypot(sh.vx, sh.vy);
            sh.vx = Math.cos(a) * sp;
            sh.vy = Math.sin(a) * sp;
            sh.damage *= 0.7;
            spawnSparks(state, sh.x, sh.y, '#7fe7ff', 6, 120, 0.3);
          }
        }
        if (sh.pierce > 0) {
          sh.pierce--;
        } else {
          state.shots.splice(i, 1);
          consumed = true;
        }
        break;
      }
    }
    if (consumed) continue;
    // Hit the boss.
    const boss = state.boss;
    if (boss && !boss.entering) {
      const d = Math.hypot(boss.x - sh.x, boss.y - sh.y);
      if (d < boss.radius + sh.radius) {
        const died = damageBoss(state, sh.damage, { crit: sh.crit });
        state.audio.hit();
        spawnSparks(state, sh.x, sh.y, sh.color, 8, 160, 0.35);
        if (died) {
          state.shots.splice(i, 1);
          continue;
        }
        if (sh.pierce > 0) {
          sh.pierce--;
        } else {
          state.shots.splice(i, 1);
          continue;
        }
      }
    }
  }
}

function updateEnemyBullets(state, dt) {
  const p = state.player;
  for (let i = state.enemyBullets.length - 1; i >= 0; i--) {
    const b = state.enemyBullets[i];
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.life <= 0 || b.x < -20 || b.x > 1300 || b.y < -20 || b.y > 740) {
      state.enemyBullets.splice(i, 1);
      continue;
    }
    // Orbit rocks block bullets: the rock dies instead of the ship.
    let blocked = false;
    for (let r = p.rocks.length - 1; r >= 0; r--) {
      const rp = orbitRockPosition(p, p.rocks[r]);
      if (Math.hypot(b.x - rp.x, b.y - rp.y) < p.rocks[r].size + b.radius + 2) {
        spawnSparks(state, rp.x, rp.y, '#ffb347', 10, 160, 0.4);
        p.rocks.splice(r, 1);
        state.enemyBullets.splice(i, 1);
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    // Hit the ship.
    if (Math.hypot(b.x - p.x, b.y - p.y) < 20 + b.radius) {
      state.enemyBullets.splice(i, 1);
      damagePlayer(state, b.damage);
    }
  }
}

function updateGems(state, dt) {
  const p = state.player;
  for (let i = state.gems.length - 1; i >= 0; i--) {
    const g = state.gems[i];
    g.life -= dt;
    if (g.life <= 0) {
      state.gems.splice(i, 1);
      continue;
    }
    const dx = p.x - g.x;
    const dy = p.y - g.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < state.stats.magnetRadius) {
      const pull = 900 * (1 - d / (state.stats.magnetRadius + 40)) + 120;
      g.vx += (dx / d) * pull * dt;
      g.vy += (dy / d) * pull * dt;
    }
    g.vx *= 0.94;
    g.vy *= 0.94;
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    if (d < 28) {
      state.gems.splice(i, 1);
      if (g.kind === 'heart') {
        p.hp = Math.min(p.maxHp, p.hp + g.value);
        spawnFloater(state, p.x, p.y - 26, `+${g.value} HP`, '#7dff8a', 14);
      } else {
        p.xp += g.value;
        state.audio.pickup();
      }
      spawnSparks(state, p.x, p.y, g.kind === 'heart' ? '#7dff8a' : '#ffe066', 4, 80, 0.3);
      // Level up: open the draft. Queued levels wait their turn.
      while (p.xp >= p.xpNext) {
        p.xp -= p.xpNext;
        p.level++;
        p.xpNext = Math.floor(8 * Math.pow(1.32, p.level - 1));
        state.pendingLevels++;
      }
      if (state.pendingLevels > 0 && state.mode === 'playing') {
        state.pendingLevels--;
        state.draftChoices = rollDraft(state);
        state.mode = 'draft';
        state.audio.levelUp();
      }
    }
  }
}

function updateBurnZones(state, dt) {
  for (let i = state.burnZones.length - 1; i >= 0; i--) {
    const z = state.burnZones[i];
    z.life -= dt;
    if (z.life <= 0) {
      state.burnZones.splice(i, 1);
      continue;
    }
    for (const e of state.enemies.slice()) {
      if (Math.hypot(e.x - z.x, e.y - z.y) < z.radius + e.radius) {
        igniteEnemy(state, e, z.dps, 0.6);
      }
    }
    const boss = state.boss;
    if (boss && Math.hypot(boss.x - z.x, boss.y - z.y) < z.radius + boss.radius) {
      boss.burn = Math.max(boss.burn, 0.6);
      boss.burnDps = Math.max(boss.burnDps, z.dps);
    }
  }
}

function updateContact(state, dt) {
  const p = state.player;
  for (const e of state.enemies.slice()) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < e.radius + 20 && e.spawnT <= 0) {
      // Shove the hunter back so it cannot sit on the ship.
      const nx = (e.x - p.x) / (d || 1);
      const ny = (e.y - p.y) / (d || 1);
      e.x = p.x + nx * (e.radius + 22);
      e.y = p.y + ny * (e.radius + 22);
      damagePlayer(state, e.damage);
    }
  }
  const boss = state.boss;
  if (boss && !boss.entering) {
    const d = Math.hypot(boss.x - p.x, boss.y - p.y);
    if (d < boss.radius + 20) {
      const nx = (p.x - boss.x) / (d || 1);
      const ny = (p.y - boss.y) / (d || 1);
      p.x += nx * 30;
      p.y += ny * 30;
      damagePlayer(state, 25);
    }
  }
}

export function damagePlayer(state, amount) {
  const p = state.player;
  if (p.iframes > 0 || state.mode !== 'playing') return;
  p.hp -= amount;
  p.iframes = 0.7;
  state.shake = Math.min(state.shake + 6, 14);
  state.audio.hurt();
  spawnSparks(state, p.x, p.y, '#ff5d5d', 14, 200, 0.5);
  spawnFloater(state, p.x, p.y - 30, `-${amount}`, '#ff5d5d', 16);
  if (p.hp <= 0) {
    p.hp = 0;
    state.mode = 'gameover';
    state.audio.gameOver();
    saveBest(state);
  }
}

export function saveBest(state) {
  if (state.score > state.best) {
    state.best = state.score;
    try {
      localStorage.setItem('starforge-best', String(state.best));
    } catch (err) { /* storage unavailable: best score is session-only */ }
  }
}

export function loadBest() {
  try {
    return parseInt(localStorage.getItem('starforge-best') || '0', 10) || 0;
  } catch (err) {
    return 0;
  }
}
