// physics.js — the simulation: movement, gravity capture, orbits, flung
// rocks, the nova blast, enemy behaviour, and every collision that matters.
// It mutates the run state G (built in main.js) and reports drama through
// world.js effects and audio.js sounds; render.js only ever reads.

import { rr, angle, chance } from './rng.js';
import { sfx } from './audio.js';
import { spawnBurst, spawnRing, spawnText, WORLD_W, WORLD_H } from './world.js';
import { dropShards, makeBolt, makeEnemy } from './entities.js';
import { comboHit } from './combo.js';
import { xpForLevel } from './upgrades.js';

const TAU = Math.PI * 2;

// dist2(ax, ay, bx, by) — squared distance, the collision workhorse.
function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

// banner(G, text, sub, life) — ask the HUD for a centre-screen announcement.
export function banner(G, text, sub = '', life = 2.2) {
  G.banner = { text, sub, t: 0, life };
}

// updatePlayer(G, dt, move) — thrust, damping, wall clamp, timers, and the
// engine sparkle trail. `move` is input's normalised steering vector (the
// demo autopilot writes the same shape, so both drive one code path).
export function updatePlayer(G, dt, move) {
  const p = G.player;
  const accel = 1500 * G.mods.speedMul;
  p.vx += move.x * accel * dt;
  p.vy += move.y * accel * dt;
  const damp = Math.max(0, 1 - 5.4 * dt);
  p.vx *= damp;
  p.vy *= damp;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.x = Math.max(p.r, Math.min(WORLD_W - p.r, p.x));
  p.y = Math.max(p.r, Math.min(WORLD_H - p.r, p.y));
  if (p.invulnT > 0) p.invulnT -= dt;
  if (p.flingCd > 0) p.flingCd -= dt;
  const speed = Math.hypot(p.vx, p.vy);
  if (speed > 60) {
    p.trailT = (p.trailT || 0) - dt;
    if (p.trailT <= 0) {
      p.trailT = 0.03;
      spawnBurst(
        p.x - Math.cos(p.face) * 12, p.y - Math.sin(p.face) * 12,
        '#3fd9ff', 1, 40, 0.3, 2,
      );
    }
  }
}

// updateRocks(G, dt) — free asteroids drift and tumble; inside the gravity
// well they are reeled in, and close enough in they snap into orbit: that
// capture is the game's central verb, so it pays a sparkle, a sound, and a
// slice of nova charge. When the orbit is full they are pushed back out.
export function updateRocks(G, dt) {
  const p = G.player;
  const wellR = G.mods.wellR;
  for (let i = G.rocks.length - 1; i >= 0; i--) {
    const rock = G.rocks[i];
    const dx = rock.x - p.x;
    const dy = rock.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < wellR) {
      // Tangential reel: match the orbit's flow, bleed off radial speed.
      const tx = -dy / d;
      const ty = dx / d;
      const orbitSpeed = 150;
      rock.vx += (tx * orbitSpeed - rock.vx) * Math.min(1, 3.2 * dt);
      rock.vy += (ty * orbitSpeed - rock.vy) * Math.min(1, 3.2 * dt);
      if (d < 78 && G.orbit.length < G.mods.orbitCap) {
        G.rocks.splice(i, 1);
        G.orbit.push({
          ang: Math.atan2(dy, dx), dist: Math.max(46, d),
          r: rock.r, shade: rock.shade, t: 0, x: rock.x, y: rock.y,
        });
        G.stats.captures += 1;
        p.novaCharge = Math.min(1, p.novaCharge + 0.07 * G.mods.chargeMul);
        spawnBurst(rock.x, rock.y, '#6ff7ff', 7, 130, 0.35, 2.2);
        sfx('capture');
        continue;
      }
      if (d < 60) {
        rock.vx += (dx / d) * 260 * dt;
        rock.vy += (dy / d) * 260 * dt;
      }
    }
    rock.x += rock.vx * dt;
    rock.y += rock.vy * dt;
    rock.rot += rock.rotV * dt;
    if (rock.x < -60 || rock.x > WORLD_W + 60 || rock.y < -60 || rock.y > WORLD_H + 60) {
      rock.dead = true;
    }
  }
  G.rocks = G.rocks.filter((r) => !r.dead);
}

// updateOrbit(G, dt) — settle every captured rock onto its ring band and
// advance it. Inner bands run faster, like real orbits; positions are
// written back onto the rocks so rendering and collisions share them.
export function updateOrbit(G, dt) {
  const p = G.player;
  for (let i = 0; i < G.orbit.length; i++) {
    const rock = G.orbit[i];
    const band = 50 + (i % 3) * 13;
    rock.dist += (band - rock.dist) * Math.min(1, 4 * dt);
    rock.ang += (170 / rock.dist) * dt;
    rock.t += dt;
    rock.x = p.x + Math.cos(rock.ang) * rock.dist;
    rock.y = p.y + Math.sin(rock.ang) * rock.dist;
  }
}

// flingRock(G, tx, ty) — throw the longest-orbiting rock at a target point.
// The thrown rock becomes a shot: fast, heavy, and the only thing that can
// grow the NOVA CHAIN. Returns false when there is nothing to throw or the
// throw is still cooling down.
export function flingRock(G, tx, ty) {
  const p = G.player;
  if (G.orbit.length === 0 || p.flingCd > 0) return false;
  let best = 0;
  for (let i = 1; i < G.orbit.length; i++) {
    if (G.orbit[i].t > G.orbit[best].t) best = i;
  }
  const rock = G.orbit.splice(best, 1)[0];
  const a = Math.atan2(ty - rock.y, tx - rock.x);
  G.shots.push({
    x: rock.x, y: rock.y,
    vx: Math.cos(a) * 920, vy: Math.sin(a) * 920,
    r: rock.r, shade: rock.shade,
    dmg: G.mods.flingDmg, pierce: G.mods.pierce,
    nova: false, t: 0, hitIds: null, dead: false,
  });
  p.flingCd = 0.22 * G.mods.flingCdMul;
  G.stats.flings += 1;
  sfx('fling');
  return true;
}

// fireNova(G) — the E key's payoff, at full charge: every orbiting rock
// blasts radially outward as a heavy shot, nearby hunters are mauled and
// shoved back, void bolts in range dissolve, and the arena shakes.
export function fireNova(G) {
  const p = G.player;
  if (p.novaCharge < 1) return false;
  const novaR = 250 * G.mods.novaRadiusMul;
  for (const rock of G.orbit) {
    const a = Math.atan2(rock.y - p.y, rock.x - p.x);
    G.shots.push({
      x: rock.x, y: rock.y,
      vx: Math.cos(a) * 800, vy: Math.sin(a) * 800,
      r: rock.r, shade: rock.shade,
      dmg: G.mods.flingDmg + 1, pierce: G.mods.pierce + 1,
      nova: true, t: 0, hitIds: null, dead: false,
    });
  }
  G.orbit.length = 0;
  for (const e of G.enemies) {
    const d2 = dist2(e.x, e.y, p.x, p.y);
    if (d2 < novaR * novaR) {
      const d = Math.sqrt(d2) || 1;
      e.vx += ((e.x - p.x) / d) * 430;
      e.vy += ((e.y - p.y) / d) * 430;
      damageEnemy(G, e, 3, 'nova');
    }
  }
  for (const b of G.bolts) {
    if (dist2(b.x, b.y, p.x, p.y) < novaR * novaR) b.dead = true;
  }
  p.novaCharge = 0;
  G.stats.novas += 1;
  G.shake = Math.max(G.shake, 13);
  spawnRing(p.x, p.y, '#6ff7ff', novaR, 5);
  spawnRing(p.x, p.y, '#ff4fd8', novaR * 0.66, 3);
  spawnBurst(p.x, p.y, '#eafcff', 26, 420, 0.6, 3);
  sfx('nova');
  return true;
}

// damageEnemy(G, e, dmg, cause) — apply damage with a hit flash; kills are
// routed through killEnemy so score, shards and splits live in one place.
export function damageEnemy(G, e, dmg, cause) {
  if (e.dead) return;
  e.hp -= dmg;
  e.flashT = 0.09;
  if (e.kind === 'boss') sfx('bosshit');
  if (e.hp <= 0) killEnemy(G, e, cause);
}

// killEnemy(G, e, cause) — settle a kill: score (chained causes multiply),
// nova charge, XP shards, split spawns, leech heals, and the explosion.
// cause is 'fling' | 'nova' | 'shield' | 'ram'; only flung rocks chain.
export function killEnemy(G, e, cause) {
  if (e.dead) return;
  e.dead = true;
  G.kills += 1;
  const chained = cause === 'fling' || cause === 'nova';
  const mult = chained ? comboHit(G) : 1;
  const gained = Math.round(e.score * mult);
  G.score += gained;
  G.player.novaCharge = Math.min(1, G.player.novaCharge + 0.03 * G.mods.chargeMul);
  const colors = {
    chaser: '#ff3b5c', dart: '#57e6ff', splitter: '#ff4fd8',
    mini: '#ffb347', boss: '#b78bff',
  };
  spawnText(
    e.x, e.y - 10,
    mult > 1 ? `+${gained} ×${mult}` : `+${gained}`,
    mult > 1 ? '#ffc857' : '#eafcff', mult > 1 ? 20 : 15,
  );
  spawnBurst(e.x, e.y, colors[e.kind] || '#ffffff', e.kind === 'boss' ? 46 : 14,
    e.kind === 'boss' ? 380 : 240, 0.6, 3);
  dropShards(G, e.x, e.y, e.xp);
  if (e.kind === 'splitter') {
    for (let i = 0; i < 3; i++) {
      const a = angle();
      const mini = makeEnemy('mini', e.x, e.y, G.wave);
      mini.vx = Math.cos(a) * 190;
      mini.vy = Math.sin(a) * 190;
      G.enemies.push(mini);
    }
    sfx('split');
  } else if (e.kind === 'boss') {
    G.shake = Math.max(G.shake, 18);
    spawnRing(e.x, e.y, '#b78bff', 260, 6);
    spawnRing(e.x, e.y, '#eafcff', 170, 4);
    sfx('bigboom');
    if (e.final) G.pendingWin = true;
    else banner(G, 'DEVOURER DOWN', 'the arena breathes again', 2.4);
  } else {
    sfx('boom');
  }
  if (G.mods.leechEvery > 0) {
    G.stats.leechCount = (G.stats.leechCount || 0) + 1;
    if (G.stats.leechCount >= G.mods.leechEvery) {
      G.stats.leechCount = 0;
      const p = G.player;
      if (p.hull < p.hullMax) {
        p.hull = Math.min(p.hullMax, p.hull + 4);
        spawnText(p.x, p.y - 30, '+4 HULL', '#57ff9a', 15);
      }
    }
  }
}

// hurtPlayer(G, dmg) — hull damage with i-frames, knockback shake and the
// death flag. Armour mods scale the hit before it lands.
export function hurtPlayer(G, dmg) {
  const p = G.player;
  if (p.invulnT > 0 || p.dead) return;
  p.hull -= dmg * G.mods.armorMul;
  p.invulnT = 0.9;
  G.shake = Math.max(G.shake, 9);
  spawnBurst(p.x, p.y, '#ff3b5c', 12, 240, 0.45, 2.6);
  sfx('hurt');
  if (p.hull <= 0) {
    p.hull = 0;
    p.dead = true;
    G.pendingLose = true;
    G.shake = 22;
    spawnBurst(p.x, p.y, '#6ff7ff', 40, 380, 0.9, 3.4);
    spawnBurst(p.x, p.y, '#ffc857', 24, 260, 0.8, 3);
    spawnRing(p.x, p.y, '#6ff7ff', 200, 5);
    sfx('bigboom');
  }
}

// updateShots(G, dt) — flung rocks fly straight and heavy; a short life and
// the arena walls bound them. Hits are settled in resolveCollisions.
export function updateShots(G, dt) {
  for (const s of G.shots) {
    s.t += dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.t > 1.7 || s.x < -50 || s.x > WORLD_W + 50 || s.y < -50 || s.y > WORLD_H + 50) {
      s.dead = true;
    }
  }
  G.shots = G.shots.filter((s) => !s.dead);
}

// steer(e, tx, ty, strength, dt) — ease an enemy's velocity toward a target.
function steer(e, tx, ty, strength, dt) {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = Math.hypot(dx, dy) || 1;
  e.vx += ((dx / d) * e.speed - e.vx) * Math.min(1, strength * dt);
  e.vy += ((dy / d) * e.speed - e.vy) * Math.min(1, strength * dt);
}

// updateEnemies(G, dt) — one behaviour per kind:
//   chaser/mini — committed seekers, minis quicker to turn.
//   splitter — a slow wobbling wall of hull that bursts into minis.
//   dart — stalks, telegraphs a bright line, then lunges in a straight dash.
//   boss — the Devourer: strafes at range, breathes bolt rings and aimed
//     fans, sheds chasers, and telegraphs hull-first charges; the final
//     Devourer rages at half hull (phase 2: faster everything, more bolts).
export function updateEnemies(G, dt) {
  const p = G.player;
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.t += dt;
    if (e.flashT > 0) e.flashT -= dt;
    if (e.kind === 'chaser' || e.kind === 'mini') {
      steer(e, p.x, p.y, e.kind === 'mini' ? 5 : 3.1, dt);
    } else if (e.kind === 'splitter') {
      steer(e, p.x, p.y, 2.2, dt);
      const wob = Math.sin(e.t * 2.1 + e.phase) * 34;
      e.x += -Math.sin(Math.atan2(p.y - e.y, p.x - e.x)) * wob * dt;
      e.y += Math.cos(Math.atan2(p.y - e.y, p.x - e.x)) * wob * dt;
    } else if (e.kind === 'dart') {
      if (e.dashing > 0) {
        e.dashing -= dt;
      } else if (e.teleT > 0) {
        e.teleT -= dt;
        e.vx *= 1 - 6 * dt;
        e.vy *= 1 - 6 * dt;
        if (e.teleT <= 0) {
          e.dashing = 0.42;
          e.vx = e.dashDx * 560;
          e.vy = e.dashDy * 560;
          sfx('dash');
        }
      } else {
        steer(e, p.x, p.y, 2.6, dt);
        e.dashT -= dt;
        const d = Math.hypot(p.x - e.x, p.y - e.y);
        if (e.dashT <= 0 && d < 560 && d > 60) {
          e.teleT = 0.35;
          e.dashDx = (p.x - e.x) / d;
          e.dashDy = (p.y - e.y) / d;
          e.dashT = rr(1.5, 2.5);
        }
      }
    } else if (e.kind === 'boss') {
      updateBoss(G, e, dt);
    }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
  }
  // Gentle separation so packs read as individuals, not one blob.
  const list = G.enemies;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (a.dead || b.dead || a.kind === 'boss' || b.kind === 'boss') continue;
      const rr2 = (a.r + b.r) * (a.r + b.r);
      const d2 = dist2(a.x, a.y, b.x, b.y);
      if (d2 > 0.01 && d2 < rr2) {
        const d = Math.sqrt(d2);
        const push = ((Math.sqrt(rr2) - d) / d) * 26 * dt;
        const px = (a.x - b.x) * push;
        const py = (a.y - b.y) * push;
        a.x += px;
        a.y += py;
        b.x -= px;
        b.y -= py;
      }
    }
  }
  G.enemies = G.enemies.filter((e) => !e.dead);
}

// updateBoss(G, e, dt) — the Devourer's brain, run inside updateEnemies.
function updateBoss(G, e, dt) {
  const p = G.player;
  e.rot += dt * (e.phase2 ? 1.6 : 1.0);
  if (e.final && !e.phase2 && e.hp <= e.hpMax / 2) {
    e.phase2 = true;
    banner(G, 'THE DEVOURER RAGES', 'phase two — hold the orbit', 2.2);
    spawnRing(e.x, e.y, '#ff3b5c', 240, 6);
    G.shake = Math.max(G.shake, 12);
    sfx('nova');
  }
  const dx = e.x - p.x;
  const dy = e.y - p.y;
  const d = Math.hypot(dx, dy) || 1;
  if (e.charging > 0) {
    e.charging -= dt;
  } else if (e.teleT > 0) {
    e.teleT -= dt;
    e.vx *= 1 - 5 * dt;
    e.vy *= 1 - 5 * dt;
    if (e.teleT <= 0) {
      e.charging = 0.55;
      e.vx = e.chargeDx * 430;
      e.vy = e.chargeDy * 430;
      sfx('dash');
    }
  } else {
    // Hold a strafing ring around the player, drifting sideways.
    const tx = p.x + (dx / d) * 270 + (-dy / d) * Math.sin(e.t * 0.6) * 60;
    const ty = p.y + (dy / d) * 270 + (dx / d) * Math.sin(e.t * 0.6) * 60;
    const sp = e.speed * (e.phase2 ? 1.5 : 1);
    const dvx = Math.max(-sp, Math.min(sp, (tx - e.x) * 1.2));
    const dvy = Math.max(-sp, Math.min(sp, (ty - e.y) * 1.2));
    const ease = Math.min(1, 2.2 * dt);
    e.vx += (dvx - e.vx) * ease;
    e.vy += (dvy - e.vy) * ease;
    e.chargeT -= dt;
    if (e.chargeT <= 0 && d < 560) {
      e.teleT = 0.6;
      e.chargeDx = (p.x - e.x) / d;
      e.chargeDy = (p.y - e.y) / d;
      e.chargeT = e.phase2 ? rr(4.5, 6) : rr(6, 8);
    }
  }
  const rate = e.phase2 ? 0.72 : 1;
  e.burstT -= dt;
  if (e.burstT <= 0) {
    e.burstT = 3.2 * rate;
    const n = (e.final ? 14 : 10) + (e.phase2 ? 2 : 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + e.rot;
      G.bolts.push(makeBolt(
        e.x + Math.cos(a) * (e.r - 6), e.y + Math.sin(a) * (e.r - 6),
        Math.cos(a) * 168, Math.sin(a) * 168,
      ));
    }
    sfx('dash');
  }
  e.spreadT -= dt;
  if (e.spreadT <= 0) {
    e.spreadT = 5 * rate;
    const base = Math.atan2(p.y - e.y, p.x - e.x);
    for (let i = -2; i <= 2; i++) {
      const a = base + i * 0.16;
      G.bolts.push(makeBolt(
        e.x + Math.cos(a) * (e.r - 6), e.y + Math.sin(a) * (e.r - 6),
        Math.cos(a) * 215, Math.sin(a) * 215,
      ));
    }
  }
  e.spawnT -= dt;
  if (e.spawnT <= 0) {
    e.spawnT = 8 * rate;
    const escorts = G.enemies.filter((o) => o.kind !== 'boss').length;
    if (escorts < 6) {
      for (let i = 0; i < 2; i++) {
        const a = angle();
        const c = makeEnemy(
          'chaser',
          e.x + Math.cos(a) * (e.r + 16), e.y + Math.sin(a) * (e.r + 16),
          G.wave,
        );
        c.vx = Math.cos(a) * 120;
        c.vy = Math.sin(a) * 120;
        G.enemies.push(c);
      }
    }
  }
}

// updateBolts(G, dt) — void bolts drift straight; six seconds or a wall
// ends them. What they hit is settled in resolveCollisions.
export function updateBolts(G, dt) {
  for (const b of G.bolts) {
    b.t += dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.t > 6 || b.x < -30 || b.x > WORLD_W + 30 || b.y < -30 || b.y > WORLD_H + 30) {
      b.dead = true;
    }
  }
  G.bolts = G.bolts.filter((b) => !b.dead);
}

// updateShards(G, dt) — shards coast, then the magnet takes them: inside
// magnet range they accelerate home, and collection feeds the level track.
// Crossing a threshold raises G.pendingLevel; main.js pauses for the choice.
let shardSfxAt = -1;
export function updateShards(G, dt) {
  const p = G.player;
  for (const s of G.shards) {
    s.t += dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vx *= 1 - 3 * dt;
    s.vy *= 1 - 3 * dt;
    const dx = p.x - s.x;
    const dy = p.y - s.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < G.mods.magnetR) {
      s.vx += (dx / d) * 1500 * dt;
      s.vy += (dy / d) * 1500 * dt;
    }
    if (d < 30) {
      s.dead = true;
      G.xp += s.value;
      if (G.time - shardSfxAt > 0.06) {
        shardSfxAt = G.time;
        sfx('shard');
      }
      while (G.xp >= G.xpNext) {
        G.xp -= G.xpNext;
        G.level += 1;
        G.xpNext = xpForLevel(G.level);
        G.pendingLevel = true;
      }
    }
  }
  G.shards = G.shards.filter((s) => !s.dead);
}

// resolveCollisions(G) — the one place where things touch:
//   flung rocks vs hunters (pierce counts down, one hit per hunter each),
//   hunters vs the orbit (the orbit is a shield that spends rocks) and
//   vs the hull (contact damage, with the hunter knocked back),
//   void bolts vs the orbit and the hull (the Aegis Array synergy lets a
//   rock sometimes shrug a bolt off instead of being spent).
export function resolveCollisions(G) {
  const p = G.player;
  for (const s of G.shots) {
    if (s.dead) continue;
    for (const e of G.enemies) {
      if (e.dead) continue;
      if (s.hitIds && s.hitIds.has(e)) continue;
      const rrSum = s.r + e.r;
      if (dist2(s.x, s.y, e.x, e.y) < rrSum * rrSum) {
        if (!s.hitIds) s.hitIds = new Set();
        s.hitIds.add(e);
        spawnBurst(s.x, s.y, '#eafcff', 5, 170, 0.3, 2.2);
        damageEnemy(G, e, s.dmg, s.nova ? 'nova' : 'fling');
        if (s.pierce > 0) s.pierce -= 1;
        else {
          s.dead = true;
          break;
        }
      }
    }
  }
  for (const e of G.enemies) {
    if (e.dead) continue;
    for (let i = G.orbit.length - 1; i >= 0; i--) {
      const rock = G.orbit[i];
      const rrSum = e.r + rock.r * 0.85;
      if (dist2(e.x, e.y, rock.x, rock.y) < rrSum * rrSum) {
        G.orbit.splice(i, 1);
        spawnBurst(rock.x, rock.y, '#9fb7d9', 10, 200, 0.4, 2.6);
        if (e.kind === 'boss') damageEnemy(G, e, 2, 'shield');
        else killEnemy(G, e, 'shield');
        break;
      }
    }
    if (e.dead) continue;
    const rrShip = e.r + p.r;
    if (dist2(e.x, e.y, p.x, p.y) < rrShip * rrShip) {
      hurtPlayer(G, e.dmg);
      const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
      e.vx = ((e.x - p.x) / d) * 260;
      e.vy = ((e.y - p.y) / d) * 260;
      if (e.kind !== 'boss') damageEnemy(G, e, 1, 'ram');
    }
  }
  for (const b of G.bolts) {
    if (b.dead) continue;
    for (let i = G.orbit.length - 1; i >= 0; i--) {
      const rock = G.orbit[i];
      const rrSum = b.r + rock.r * 0.85;
      if (dist2(b.x, b.y, rock.x, rock.y) < rrSum * rrSum) {
        b.dead = true;
        const shrug = G.mods.aegisArray && chance(0.25);
        if (!shrug) {
          G.orbit.splice(i, 1);
          spawnBurst(rock.x, rock.y, '#9fb7d9', 8, 180, 0.35, 2.4);
        } else {
          spawnText(rock.x, rock.y - 14, 'AEGIS', '#57ff9a', 12);
        }
        break;
      }
    }
    if (b.dead) continue;
    const rrShip = b.r + p.r;
    if (dist2(b.x, b.y, p.x, p.y) < rrShip * rrShip) {
      b.dead = true;
      hurtPlayer(G, b.dmg);
    }
  }
  G.shots = G.shots.filter((s) => !s.dead);
  G.bolts = G.bolts.filter((b) => !b.dead);
  G.enemies = G.enemies.filter((e) => !e.dead);
}
