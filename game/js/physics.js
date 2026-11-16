// physics.js — all motion and contact in the arena: player thrust, asteroid
// drift, the gravity well that captures rocks into orbit, orbit following,
// flung-rock ballistics, hostile steering, shard magnetism, and every
// circle-vs-circle collision. It reports events through callbacks on the game
// object (onEnemyKilled, onPlayerHit, onShardCollected) so main.js owns the
// rules and this file owns the movement.

import { WORLD_W, WORLD_H, TAU, clamp, distance, angleTo } from './world.js';

const FLUNG_SPEED = 980;
const FLUNG_LIFE = 1.7;
const CAPTURE_PULL = 165; // inward acceleration just outside the well

export function orbitingRocks(game) {
  return game.pools.rocks.filter((rock) => rock.mode === 'orbit');
}

// --- player ---------------------------------------------------------------

export function stepPlayer(game, intent, dt) {
  const p = game.player;
  const accel = 1500;
  p.vx += intent.mx * accel * dt;
  p.vy += intent.my * accel * dt;
  // Drag tuned so top speed lands on p.speed for a full-strength input.
  const drag = Math.pow(0.0018, dt);
  if (intent.mx === 0) p.vx *= drag;
  if (intent.my === 0) p.vy *= drag;
  const speed = Math.hypot(p.vx, p.vy);
  const top = p.speed * (Math.hypot(intent.mx, intent.my) > 0 ? 1 : 1.6);
  if (speed > top && intent.mx === 0 && intent.my === 0) {
    // coasting after a knockback: bleed down to cruise speed
    p.vx *= Math.pow(0.05, dt);
    p.vy *= Math.pow(0.05, dt);
  } else if (speed > p.speed && (intent.mx !== 0 || intent.my !== 0)) {
    p.vx = (p.vx / speed) * p.speed;
    p.vy = (p.vy / speed) * p.speed;
  }
  p.x = clamp(p.x + p.vx * dt, p.r, WORLD_W - p.r);
  p.y = clamp(p.y + p.vy * dt, p.r, WORLD_H - p.r);
  p.pulse += dt * 2.4;
  if (p.invuln > 0) p.invuln -= dt;
  if (p.flingCd > 0) p.flingCd -= dt;
  if (p.novaCd > 0) p.novaCd -= dt;
}

// --- rocks ------------------------------------------------------------------

function captureRock(game, rock) {
  const p = game.player;
  const orbit = orbitingRocks(game);
  rock.mode = 'orbit';
  rock.orbitAngle = angleTo(p.x, p.y, rock.x, rock.y);
  rock.orbitRadius = 56 + (orbit.length % 3) * 17;
  rock.orbitTime = 0;
  rock.vx = 0;
  rock.vy = 0;
  game.onRockCaptured(rock);
}

export function stepRocks(game, dt) {
  const p = game.player;
  const rocks = game.pools.rocks;
  for (let i = rocks.length - 1; i >= 0; i--) {
    const rock = rocks[i];
    rock.rot += rock.spin * dt;
    if (rock.mode === 'drift') {
      const d = distance(p.x, p.y, rock.x, rock.y);
      if (d < p.gravity && orbitingRocks(game).length < p.orbitCap) {
        captureRock(game, rock);
      } else if (d < p.gravity + 48) {
        // The well's fringe: a gentle inward tug so rocks stream toward it.
        const a = angleTo(rock.x, rock.y, p.x, p.y);
        rock.vx += Math.cos(a) * CAPTURE_PULL * dt;
        rock.vy += Math.sin(a) * CAPTURE_PULL * dt;
      }
      rock.x += rock.vx * dt;
      rock.y += rock.vy * dt;
      // Soft-bounce off the arena walls so drifters stay in play.
      if (rock.x < rock.r || rock.x > WORLD_W - rock.r) rock.vx *= -1;
      if (rock.y < rock.r || rock.y > WORLD_H - rock.r) rock.vy *= -1;
      rock.x = clamp(rock.x, rock.r, WORLD_W - rock.r);
      rock.y = clamp(rock.y, rock.r, WORLD_H - rock.r);
    } else if (rock.mode === 'orbit') {
      rock.orbitTime += dt;
      const angularSpeed = clamp(150 / rock.orbitRadius, 1.05, 2.6);
      rock.orbitAngle += angularSpeed * dt;
      rock.x = p.x + Math.cos(rock.orbitAngle) * rock.orbitRadius;
      rock.y = p.y + Math.sin(rock.orbitAngle) * rock.orbitRadius;
      rock.rot += dt * 1.4;
    } else {
      // flung: straight ballistic flight with a fading particle trail
      rock.life += dt;
      rock.x += rock.vx * dt;
      rock.y += rock.vy * dt;
      rock.rot += rock.spin * 4 * dt;
      rock.trail.push({ x: rock.x, y: rock.y });
      if (rock.trail.length > 14) rock.trail.shift();
      if (rock.life > FLUNG_LIFE || rock.x < -30 || rock.x > WORLD_W + 30 || rock.y < -30 || rock.y > WORLD_H + 30) {
        rocks.splice(i, 1);
      }
    }
  }
}

// Launch the longest-orbiting rock (then the next, for multi-fling) toward a
// point. Returns how many rocks were launched.
export function flingRock(game, aimX, aimY) {
  const p = game.player;
  if (p.flingCd > 0) return 0;
  const orbit = orbitingRocks(game).sort((a, b) => b.orbitTime - a.orbitTime);
  if (orbit.length === 0) return 0;
  const count = Math.min(p.multiFling, orbit.length);
  const baseAngle = angleTo(p.x, p.y, aimX, aimY);
  for (let i = 0; i < count; i++) {
    const rock = orbit[i];
    const spread = (i - (count - 1) / 2) * 0.13;
    const a = baseAngle + spread;
    rock.mode = 'flung';
    rock.life = 0;
    rock.trail = [];
    rock.novaBorn = -99;
    rock.vx = Math.cos(a) * FLUNG_SPEED;
    rock.vy = Math.sin(a) * FLUNG_SPEED;
  }
  p.flingCd = 0.14;
  game.onRockFlung(count);
  return count;
}

// NOVA: every orbiting rock blasts radially outward at once. The kills those
// rocks score inside the chain window are what combo.js multiplies.
export function novaBlast(game) {
  const p = game.player;
  if (p.novaCd > 0) return 0;
  const orbit = orbitingRocks(game);
  if (orbit.length === 0) return 0;
  for (const rock of orbit) {
    rock.mode = 'flung';
    rock.life = 0;
    rock.trail = [];
    rock.novaBorn = game.time;
    rock.vx = Math.cos(rock.orbitAngle) * 840;
    rock.vy = Math.sin(rock.orbitAngle) * 840;
  }
  p.novaCd = p.novaCdMax;
  game.onNovaBlast(orbit.length);
  return orbit.length;
}

// --- hostiles ---------------------------------------------------------------

export function stepEnemies(game, dt) {
  const p = game.player;
  const enemies = game.pools.enemies;
  for (const e of enemies) {
    if (e.hitFlash > 0) e.hitFlash -= dt;
    e.wobble += dt * 3;
    let tx = p.x;
    let ty = p.y;
    if (e.type === 'devourer') {
      // The maw drifts at the star and drags loose matter toward itself.
      e.spawnT += dt;
      pullMatterToward(game, e, dt);
      if (e.spawnT > 6.5) {
        e.spawnT = 0;
        game.onDevourerSpawn(e);
      }
    }
    const a = angleTo(e.x, e.y, tx, ty);
    let steer = e.speed;
    let vx = Math.cos(a) * steer;
    let vy = Math.sin(a) * steer;
    if (e.type === 'dart') {
      const sway = Math.sin(e.wobble * 2.2) * 60;
      vx += Math.cos(a + Math.PI / 2) * sway;
      vy += Math.sin(a + Math.PI / 2) * sway;
    }
    if (e.type === 'splitter') {
      vx *= 0.9 + Math.sin(e.wobble) * 0.1;
      vy *= 0.9 + Math.cos(e.wobble) * 0.1;
    }
    e.vx = vx;
    e.vy = vy;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.rot = a;
    e.x = clamp(e.x, -60, WORLD_W + 60);
    e.y = clamp(e.y, -60, WORLD_H + 60);
  }
  // Gentle separation so hostiles read as individuals, not a single blob.
  for (let i = 0; i < enemies.length; i++) {
    for (let j = i + 1; j < enemies.length; j++) {
      const a = enemies[i];
      const b = enemies[j];
      const d = distance(a.x, a.y, b.x, b.y);
      const min = a.r + b.r + 2;
      if (d > 0 && d < min) {
        const push = ((min - d) / min) * 26 * dt;
        const ang = angleTo(b.x, b.y, a.x, a.y);
        a.x += Math.cos(ang) * push;
        a.y += Math.sin(ang) * push;
        b.x -= Math.cos(ang) * push;
        b.y -= Math.sin(ang) * push;
      }
    }
  }
}

// The Devourer's gravity: loose rocks and the player star feel a slow drag
// inside its reach. Orbiting rocks are locked to the star and immune.
function pullMatterToward(game, boss, dt) {
  const reach = 320;
  for (const rock of game.pools.rocks) {
    if (rock.mode !== 'drift') continue;
    const d = distance(boss.x, boss.y, rock.x, rock.y);
    if (d < reach && d > boss.r + rock.r) {
      const a = angleTo(rock.x, rock.y, boss.x, boss.y);
      rock.vx += Math.cos(a) * 95 * dt;
      rock.vy += Math.sin(a) * 95 * dt;
    }
  }
  const p = game.player;
  const dp = distance(boss.x, boss.y, p.x, p.y);
  if (dp < reach && dp > boss.r) {
    const a = angleTo(p.x, p.y, boss.x, boss.y);
    p.vx += Math.cos(a) * 58 * dt;
    p.vy += Math.sin(a) * 58 * dt;
  }
}

// --- shards -----------------------------------------------------------------

export function stepShards(game, dt) {
  const p = game.player;
  const shards = game.pools.shards;
  for (let i = shards.length - 1; i >= 0; i--) {
    const s = shards[i];
    s.life -= dt;
    if (s.life <= 0) {
      shards.splice(i, 1);
      continue;
    }
    const d = distance(p.x, p.y, s.x, s.y);
    if (d < p.magnet) {
      const a = angleTo(s.x, s.y, p.x, p.y);
      const pull = 560 * (1 - d / p.magnet) + 120;
      s.vx += Math.cos(a) * pull * dt * 3;
      s.vy += Math.sin(a) * pull * dt * 3;
    }
    s.vx *= Math.pow(0.12, dt);
    s.vy *= Math.pow(0.12, dt);
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.rot += dt * 2.6;
    if (d < p.r + s.r + 6) {
      shards.splice(i, 1);
      game.onShardCollected(s);
    }
  }
}

// --- particles and floaters ---------------------------------------------------

export function stepEffects(game, dt) {
  const particles = game.pools.particles;
  for (let i = particles.length - 1; i >= 0; i--) {
    const fx = particles[i];
    fx.life += dt;
    if (fx.life >= fx.lifeMax) {
      particles.splice(i, 1);
      continue;
    }
    fx.x += fx.vx * dt;
    fx.y += fx.vy * dt;
    fx.vx *= Math.pow(0.02, dt);
    fx.vy *= Math.pow(0.02, dt);
    if (fx.type === 'ring') fx.r += 620 * dt;
  }
  const floaters = game.pools.floaters;
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.life += dt;
    f.y -= 36 * dt;
    if (f.life >= f.lifeMax) floaters.splice(i, 1);
  }
}

// --- collisions ---------------------------------------------------------------

function circlesTouch(ax, ay, ar, bx, by, br) {
  const dx = bx - ax;
  const dy = by - ay;
  const rr = ar + br;
  return dx * dx + dy * dy < rr * rr;
}

function damageEnemy(game, enemy, amount, cause, rock) {
  enemy.hp -= amount;
  enemy.hitFlash = 0.09;
  if (enemy.hp <= 0) {
    game.onEnemyKilled(enemy, cause, rock);
  } else {
    game.onEnemyHit(enemy, cause);
  }
}

export function collide(game) {
  const p = game.player;
  const rocks = game.pools.rocks;
  const enemies = game.pools.enemies;

  // Flung rocks strike hostiles.
  for (let i = rocks.length - 1; i >= 0; i--) {
    const rock = rocks[i];
    if (rock.mode !== 'flung') continue;
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (circlesTouch(rock.x, rock.y, rock.r, e.x, e.y, e.r)) {
        const wasNova = rock.novaBorn > 0 && game.time - rock.novaBorn < 2.5;
        rocks.splice(i, 1);
        damageEnemy(game, e, rock.damage + game.player.flingDamage - 1, wasNova ? 'nova' : 'fling', rock);
        break;
      }
    }
  }

  // Orbiting rocks are a shield: a hostile that reaches one dies with it.
  for (let i = rocks.length - 1; i >= 0; i--) {
    const rock = rocks[i];
    if (rock.mode !== 'orbit') continue;
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (e.type === 'devourer') continue; // the maw is too big to stop this way
      if (circlesTouch(rock.x, rock.y, rock.r + 2, e.x, e.y, e.r)) {
        rocks.splice(i, 1);
        game.onEnemyKilled(e, 'orbit', rock);
        break;
      }
    }
  }

  // Hostiles that reach the star bite it. The Devourer stays and keeps biting.
  for (let j = enemies.length - 1; j >= 0; j--) {
    const e = enemies[j];
    if (!circlesTouch(p.x, p.y, p.r + 4, e.x, e.y, e.r)) continue;
    if (e.type === 'devourer') {
      if (p.invuln <= 0) game.onPlayerHit(e.damage, e);
      const a = angleTo(e.x, e.y, p.x, p.y);
      p.vx += Math.cos(a) * 320;
      p.vy += Math.sin(a) * 320;
    } else {
      game.onEnemyKilled(e, 'ram', null);
      if (p.invuln <= 0) game.onPlayerHit(e.damage, e);
    }
  }

  // The Devourer eats loose asteroids to heal — deny it its food.
  for (let i = rocks.length - 1; i >= 0; i--) {
    const rock = rocks[i];
    if (rock.mode !== 'drift') continue;
    for (const e of enemies) {
      if (e.type !== 'devourer') continue;
      if (circlesTouch(rock.x, rock.y, rock.r, e.x, e.y, e.r - 6)) {
        rocks.splice(i, 1);
        e.hp = Math.min(e.hpMax, e.hp + 2);
        game.onDevourerFed(e, rock);
        break;
      }
    }
  }
}
