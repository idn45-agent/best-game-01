// physics.js — movement, gravity and combat for STARFORGE.
// The star's gravity well bends drifting asteroids in; close ones are
// captured into orbit, where they shield the star and wait to be flung.
// This module steps every actor and resolves every collision.

import { makeShard, spawnExplosion, spawnTrailSpark } from './entities.js';

const ORBIT_RADIUS = 58;

function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

export function stepPhysics(state, dt, control) {
  const star = state.star;
  star.pulse += dt * 2.4;
  star.invulnTimer = Math.max(0, star.invulnTimer - dt);
  star.novaTimer = Math.max(0, star.novaTimer - dt);
  state.flingTimer = Math.max(0, state.flingTimer - dt);

  moveStar(state, dt, control);
  bendAsteroids(state, dt);
  stepOrbit(state, dt);
  if (control.fling && state.flingTimer <= 0) flingRocks(state, control);
  if (control.nova) novaBlast(state);
  stepProjectiles(state, dt);
  stepEnemies(state, dt);
  stepShards(state, dt);
  stepParticles(state, dt);
  collideOrbitWithEnemies(state);
  collideEnemiesWithStar(state);
}

function moveStar(state, dt, control) {
  const star = state.star;
  const accel = 1500;
  star.vx += control.mx * accel * dt;
  star.vy += control.my * accel * dt;
  const drag = Math.pow(0.0015, dt);
  star.vx *= drag; star.vy *= drag;
  const sp = Math.hypot(star.vx, star.vy);
  if (sp > star.speed) {
    star.vx = (star.vx / sp) * star.speed;
    star.vy = (star.vy / sp) * star.speed;
  }
  star.x += star.vx * dt;
  star.y += star.vy * dt;
  const m = star.radius + 4;
  star.x = Math.min(state.width - m, Math.max(m, star.x));
  star.y = Math.min(state.height - m, Math.max(m, star.y));
  if (sp > 60 && state.rng() < 0.5) {
    spawnTrailSpark(state, star.x - star.vx * 0.05, star.y - star.vy * 0.05, '#54f0ff');
  }
}

// Gravity bends drifting asteroids toward the star; the Devourer bends
// them toward itself and swallows what reaches it, stealing future ammo.
function bendAsteroids(state, dt) {
  const star = state.star;
  const boss = state.enemies.find((e) => e.kind === 'devourer');
  for (const a of state.asteroids) {
    if (a.state !== 'drift') continue;
    const dStar = Math.sqrt(dist2(a.x, a.y, star.x, star.y));
    if (dStar < star.gravityRadius + 60) {
      const pull = 260 * (1 - dStar / (star.gravityRadius + 140)) + 60;
      a.vx += ((star.x - a.x) / (dStar || 1)) * pull * dt;
      a.vy += ((star.y - a.y) / (dStar || 1)) * pull * dt;
    }
    if (boss) {
      const dBoss = Math.sqrt(dist2(a.x, a.y, boss.x, boss.y));
      if (dBoss < 210) {
        a.vx += ((boss.x - a.x) / (dBoss || 1)) * 150 * dt;
        a.vy += ((boss.y - a.y) / (dBoss || 1)) * 150 * dt;
        if (dBoss < boss.radius + a.radius * 0.5) {
          a.state = 'gone';
          spawnExplosion(state, a.x, a.y, '#ff3860', 6, 90);
        }
      }
    }
    if (dStar < 80 && state.orbit.length < star.orbitCapacity) {
      a.state = 'orbit';
      a.orbitTime = 0;
      a.orbitAngle = Math.atan2(a.y - star.y, a.x - star.x);
      state.orbit.push(a);
      state.audio.capture();
      spawnExplosion(state, a.x, a.y, '#54f0ff', 5, 70);
    }
  }
  state.asteroids = state.asteroids.filter((a) => a.state !== 'gone');
}

// Orbiting rocks ride a ring around the star, oldest at the front.
function stepOrbit(state, dt) {
  const star = state.star;
  state.orbit = state.orbit.filter((a) => a.state === 'orbit');
  state.orbit.forEach((a, i) => {
    a.orbitTime += dt;
    a.orbitAngle += dt * 1.7;
    const wobble = Math.sin(state.time * 2 + i * 1.7) * 3;
    a.x = star.x + Math.cos(a.orbitAngle) * (ORBIT_RADIUS + wobble);
    a.y = star.y + Math.sin(a.orbitAngle) * (ORBIT_RADIUS + wobble);
    a.angle += a.spin * dt;
  });
}

function flingRocks(state, control) {
  const star = state.star;
  if (!state.orbit.length) return;
  const n = Math.min(star.multiFling, state.orbit.length);
  const aim = Math.atan2(control.aimY - star.y, control.aimX - star.x);
  state.orbit.sort((a, b) => b.orbitTime - a.orbitTime);
  for (let i = 0; i < n; i++) {
    const rock = state.orbit.shift();
    rock.state = 'shot';
    const spread = (i - (n - 1) / 2) * 0.14;
    const dir = aim + spread;
    state.projectiles.push({
      x: rock.x, y: rock.y,
      vx: Math.cos(dir) * 760, vy: Math.sin(dir) * 760,
      radius: rock.radius, verts: rock.verts,
      angle: rock.angle, spin: rock.spin * 6,
      damage: star.flingDamage, life: 1.5,
    });
  }
  state.flingTimer = star.flingRate;
  state.audio.fling();
}

function novaBlast(state) {
  const star = state.star;
  if (star.novaTimer > 0) return;
  if (!state.orbit.length) { state.shake = Math.max(state.shake, 2); return; }
  const rocks = state.orbit.splice(0, state.orbit.length);
  for (const rock of rocks) {
    const dir = Math.atan2(rock.y - star.y, rock.x - star.x);
    state.projectiles.push({
      x: rock.x, y: rock.y,
      vx: Math.cos(dir) * 640, vy: Math.sin(dir) * 640,
      radius: rock.radius, verts: rock.verts,
      angle: rock.angle, spin: rock.spin * 6,
      damage: star.novaDamage, life: 1.1,
    });
  }
  for (const e of state.enemies) {
    if (dist2(e.x, e.y, star.x, star.y) < 150 * 150) {
      damageEnemy(state, e, star.novaDamage * 0.6);
    }
  }
  state.shockwaves.push({ x: star.x, y: star.y, r: 10, maxR: star.novaRadius, life: 0.4, maxLife: 0.4 });
  star.novaTimer = star.novaCooldownMax;
  state.shake = Math.max(state.shake, 9);
  state.audio.nova();
}

function stepProjectiles(state, dt) {
  for (const p of state.projectiles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.angle += p.spin * dt;
    p.life -= dt;
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      const rr = p.radius + e.radius;
      if (dist2(p.x, p.y, e.x, e.y) < rr * rr) {
        damageEnemy(state, e, p.damage);
        state.audio.hit();
        p.life = 0;
        break;
      }
    }
  }
  state.projectiles = state.projectiles.filter((p) =>
    p.life > 0 && p.x > -60 && p.x < state.width + 60 && p.y > -60 && p.y < state.height + 60);
}

function stepEnemies(state, dt) {
  const star = state.star;
  for (const e of state.enemies) {
    e.flash = Math.max(0, e.flash - dt);
    e.wobble += dt * 3;
    const dx = star.x - e.x, dy = star.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    let vx = (dx / d) * e.speed;
    let vy = (dy / d) * e.speed;
    if (e.kind === 'chaser' || e.kind === 'mini') {
      vx += Math.cos(e.wobble) * 26;
      vy += Math.sin(e.wobble * 1.3) * 26;
    }
    if (e.kind === 'dart') {
      vx += Math.cos(e.wobble * 2.1) * 12;
      vy += Math.sin(e.wobble * 2.1) * 46;
    }
    if (e.kind === 'devourer') {
      e.dartTimer -= dt;
      if (e.dartTimer <= 0 && state.enemies.length < 26) {
        e.dartTimer = 3.2;
        const a = state.rng() * Math.PI * 2;
        state.enemies.push(state.spawnEnemy('dart',
          e.x + Math.cos(a) * (e.radius + 18), e.y + Math.sin(a) * (e.radius + 18)));
        spawnExplosion(state, e.x, e.y, '#ff7847', 6, 80);
      }
    }
    e.x += vx * dt;
    e.y += vy * dt;
  }
  state.enemies = state.enemies.filter((e) => e.hp > 0);
}

function stepShards(state, dt) {
  const star = state.star;
  for (const s of state.shards) {
    s.life -= dt;
    s.spin += dt * 4;
    const d = Math.sqrt(dist2(s.x, s.y, star.x, star.y));
    if (d < star.magnet) {
      const pull = 620 * (1 - d / (star.magnet + 60)) + 120;
      s.vx += ((star.x - s.x) / (d || 1)) * pull * dt;
      s.vy += ((star.y - s.y) / (d || 1)) * pull * dt;
    } else {
      s.vx *= Math.pow(0.02, dt);
      s.vy *= Math.pow(0.02, dt);
    }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (d < star.radius + 12) {
      s.life = 0;
      star.xp += s.value;
      state.score += 10;
      state.audio.pickup();
      spawnExplosion(state, s.x, s.y, '#ffe066', 3, 50);
      if (star.xp >= star.xpNext) state.levelReady = true;
    }
  }
  state.shards = state.shards.filter((s) => s.life > 0);
}

function stepParticles(state, dt) {
  for (const p of state.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(0.05, dt);
    p.vy *= Math.pow(0.05, dt);
  }
  state.particles = state.particles.filter((p) => p.life > 0);
  for (const f of state.floaters) {
    f.life -= dt;
    f.y -= 44 * dt;
  }
  state.floaters = state.floaters.filter((f) => f.life > 0);
  for (const w of state.shockwaves) {
    w.life -= dt;
    w.r += (w.maxR - w.r) * Math.min(1, dt * 9);
  }
  state.shockwaves = state.shockwaves.filter((w) => w.life > 0);
}

// An orbiting rock that touches a wraith destroys it and is spent:
// the ring is a shield you must keep refilling from the asteroid field.
function collideOrbitWithEnemies(state) {
  for (const rock of [...state.orbit]) {
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      const rr = rock.radius + e.radius - 2;
      if (dist2(rock.x, rock.y, e.x, e.y) < rr * rr) {
        rock.state = 'gone';
        state.orbit.splice(state.orbit.indexOf(rock), 1);
        state.asteroids.splice(state.asteroids.indexOf(rock), 1);
        damageEnemy(state, e, 70);
        spawnExplosion(state, rock.x, rock.y, '#ffd9a0', 10, 130);
        break;
      }
    }
  }
}

// A wraith that reaches the star crashes into it. An orbiting rock
// intercepts the crash; without one, the hull takes the damage.
function collideEnemiesWithStar(state) {
  const star = state.star;
  for (const e of [...state.enemies]) {
    if (e.hp <= 0) continue;
    const rr = star.radius + e.radius - 2;
    if (dist2(e.x, e.y, star.x, star.y) >= rr * rr) continue;
    if (state.orbit.length) {
      const rock = state.orbit.shift();
      rock.state = 'gone';
      state.asteroids.splice(state.asteroids.indexOf(rock), 1);
      spawnExplosion(state, rock.x, rock.y, '#54f0ff', 12, 150);
      damageEnemy(state, e, 9999);
      state.shake = Math.max(state.shake, 4);
    } else if (star.invulnTimer <= 0) {
      star.hull -= e.damage;
      star.invulnTimer = 0.9;
      state.shake = Math.max(state.shake, 10);
      state.audio.hurt();
      damageEnemy(state, e, 9999);
      state.floaters.push({ x: star.x, y: star.y - 30, text: `-${e.damage} HULL`, color: '#ff5470', life: 1, maxLife: 1 });
      if (star.hull <= 0) {
        star.hull = 0;
        state.starDead = true;
      }
    }
  }
}

export function damageEnemy(state, e, dmg) {
  if (e.hp <= 0) return;
  e.hp -= dmg;
  e.flash = 0.09;
  if (dmg >= 25) {
    state.floaters.push({
      x: e.x + (state.rng() - 0.5) * 14, y: e.y - e.radius - 4,
      text: String(Math.round(dmg)), color: '#ffffff', life: 0.6, maxLife: 0.6,
    });
  }
  if (e.hp > 0) return;
  state.kills += 1;
  state.score += e.score;
  spawnExplosion(state, e.x, e.y, e.color, e.kind === 'devourer' ? 60 : 16, e.kind === 'devourer' ? 320 : 200);
  state.audio.explode();
  for (let i = 0; i < e.xp; i++) state.shards.push(makeShard(e.x, e.y, state.rng));
  if (e.kind === 'splitter') {
    for (let i = 0; i < 2; i++) {
      const m = state.spawnEnemy('mini', e.x + (i ? 16 : -16), e.y + (i ? -10 : 10));
      state.enemies.push(m);
    }
  }
  if (e.kind === 'devourer') {
    state.shake = Math.max(state.shake, 14);
    if (state.finalBoss === e) state.bossDown = true;
  }
}
