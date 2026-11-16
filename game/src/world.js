// world.js — the arena's dressing and its transient effects.
// Owns the starfield and nebula backdrop (pre-rendered once to an offscreen
// canvas, so the per-frame cost is a single drawImage), plus the particle
// sparks, shockwave rings and floating score texts that give hits their feel.

import { initRng, rr, ri, angle } from './rng.js';

export const WORLD_W = 1280;
export const WORLD_H = 720;

let backdrop = null;
const particles = [];
const rings = [];
const texts = [];

// buildBackdrop(w, h, seed) — paint stars and nebula onto an offscreen
// canvas with its own seeded stream. It reseeds the shared stream, which
// is safe here: every run reseeds it again when the run starts.
function buildBackdrop(w, h, seed) {
  initRng(seed ^ 0x51ab);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#04060f');
  grad.addColorStop(0.55, '#070d24');
  grad.addColorStop(1, '#04060f');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const nebula = [
    ['rgba(38,64,160,0.20)', 0.22, 0.3, 340],
    ['rgba(110,40,150,0.16)', 0.8, 0.22, 300],
    ['rgba(16,90,110,0.15)', 0.62, 0.78, 360],
    ['rgba(70,30,90,0.13)', 0.12, 0.85, 260],
  ];
  for (const [color, fx, fy, r] of nebula) {
    const rg = g.createRadialGradient(w * fx, h * fy, 0, w * fx, h * fy, r);
    rg.addColorStop(0, color);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, w, h);
  }
  for (let layer = 0; layer < 2; layer++) {
    const n = layer === 0 ? 150 : 70;
    for (let i = 0; i < n; i++) {
      const x = rr(0, w);
      const y = rr(0, h);
      const s = layer === 0 ? rr(0.5, 1.3) : rr(1.2, 2.4);
      g.globalAlpha = rr(0.25, layer === 0 ? 0.6 : 0.95);
      g.fillStyle = layer === 0 ? '#aebfff' : '#eaf2ff';
      g.beginPath();
      g.arc(x, y, s, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 1;
  return c;
}

// initWorld(seed) — (re)build the backdrop; fx arrays start empty.
export function initWorld(seed) {
  backdrop = buildBackdrop(WORLD_W, WORLD_H, seed);
  particles.length = 0;
  rings.length = 0;
  texts.length = 0;
}

// drawBackground(g) — the whole backdrop in one blit.
export function drawBackground(g) {
  if (backdrop) g.drawImage(backdrop, 0, 0);
}

// spawnBurst(x, y, color, n, speed, life, size) — a fan of sparks.
export function spawnBurst(x, y, color, n = 10, speed = 190, life = 0.5, size = 2.4) {
  for (let i = 0; i < n; i++) {
    const a = angle();
    const v = rr(speed * 0.25, speed);
    particles.push({
      x, y,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      t: 0, life: rr(life * 0.5, life),
      size: rr(size * 0.5, size), color,
    });
  }
}

// spawnRing(x, y, color, maxR, width) — an expanding shockwave ring.
export function spawnRing(x, y, color, maxR = 120, width = 3) {
  rings.push({ x, y, r: 6, maxR, width, color, t: 0, life: 0.42 });
}

// spawnText(x, y, str, color, size) — a floating score popup that rises
// and fades; the caller composes the string (score, chain, labels).
export function spawnText(x, y, str, color = '#eafcff', size = 17) {
  texts.push({ x, y, str, color, size, t: 0, life: 0.95 });
}

// updateFx(dt) — advance every transient effect; dead ones are swapped out.
export function updateFx(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.t += dt;
    if (p.t >= p.life) {
      particles[i] = particles[particles.length - 1];
      particles.pop();
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - 2.6 * dt;
    p.vy *= 1 - 2.6 * dt;
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.t += dt;
    r.r = 6 + (r.maxR - 6) * (1 - Math.pow(1 - r.t / r.life, 3));
    if (r.t >= r.life) rings.splice(i, 1);
  }
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    t.t += dt;
    t.y -= 44 * dt;
    if (t.t >= t.life) texts.splice(i, 1);
  }
}

// drawRings(g) — shockwaves sit under the entities.
export function drawRings(g) {
  for (const r of rings) {
    const k = 1 - r.t / r.life;
    g.globalAlpha = k * 0.85;
    g.strokeStyle = r.color;
    g.lineWidth = Math.max(1, r.width * k);
    g.beginPath();
    g.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    g.stroke();
  }
  g.globalAlpha = 1;
}

// drawParticles(g) and drawTexts(g) — sparks and popups above the action.
export function drawParticles(g) {
  for (const p of particles) {
    const k = 1 - p.t / p.life;
    g.globalAlpha = k;
    g.fillStyle = p.color;
    g.beginPath();
    g.arc(p.x, p.y, Math.max(0.4, p.size * k), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

export function drawTexts(g) {
  g.textAlign = 'center';
  for (const t of texts) {
    const k = 1 - t.t / t.life;
    g.globalAlpha = Math.min(1, k * 1.6);
    g.font = `700 ${t.size}px 'Segoe UI', system-ui, sans-serif`;
    g.fillStyle = t.color;
    g.fillText(t.str, t.x, t.y);
  }
  g.globalAlpha = 1;
}

// fxCounts() — live effect counts, for the debug/testing handle.
export function fxCounts() {
  return { particles: particles.length, rings: rings.length, texts: texts.length };
}
