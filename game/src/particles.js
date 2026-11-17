// particles.js — Juice for STARFORGE: sparks, shockwaves, floating text.
//
// Particles are plain objects in state.particles; shockwave rings in
// state.shockwaves; damage/score popups in state.floaters. All three are
// updated by updateParticles and drawn by render.js. Nothing here allocates
// per frame beyond the particles themselves.

export function spawnSparks(state, x, y, color, count, speed, life) {
  for (let i = 0; i < count; i++) {
    const a = state.rng() * Math.PI * 2;
    const s = (speed || 160) * (0.3 + state.rng() * 0.9);
    state.particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: (life || 0.5) * (0.6 + state.rng() * 0.8),
      maxLife: life || 0.5,
      size: 1.5 + state.rng() * 2.5,
      color,
      drag: 0.92,
      kind: 'spark',
    });
  }
}

export function spawnEmbers(state, x, y, color, count) {
  for (let i = 0; i < count; i++) {
    state.particles.push({
      x: x + (state.rng() - 0.5) * 24,
      y: y + (state.rng() - 0.5) * 24,
      vx: (state.rng() - 0.5) * 30,
      vy: -30 - state.rng() * 50,
      life: 0.8 + state.rng() * 0.7,
      maxLife: 1.2,
      size: 2 + state.rng() * 3,
      color,
      drag: 0.99,
      kind: 'ember',
    });
  }
}

export function spawnRing(state, x, y, color, maxRadius, life) {
  state.shockwaves.push({
    x, y, color,
    radius: 6,
    maxRadius: maxRadius || 120,
    life: life || 0.45,
    maxLife: life || 0.45,
  });
}

export function spawnFloater(state, x, y, text, color, size) {
  state.floaters.push({
    x, y,
    text,
    color: color || '#ffffff',
    size: size || 14,
    life: 0.9,
    maxLife: 0.9,
  });
}

export function updateParticles(state, dt) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      state.particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= p.drag;
    p.vy *= p.drag;
  }
  for (let i = state.shockwaves.length - 1; i >= 0; i--) {
    const r = state.shockwaves[i];
    r.life -= dt;
    if (r.life <= 0) {
      state.shockwaves.splice(i, 1);
      continue;
    }
    const t = 1 - r.life / r.maxLife;
    r.radius = 6 + (r.maxRadius - 6) * (1 - (1 - t) * (1 - t));
  }
  for (let i = state.floaters.length - 1; i >= 0; i--) {
    const f = state.floaters[i];
    f.life -= dt;
    f.y -= 34 * dt;
    if (f.life <= 0) state.floaters.splice(i, 1);
  }
}
