// render.js — everything the player sees of the simulation, drawn on one
// canvas in arena coordinates. Order matters: backdrop, gravity well,
// shockwaves, rocks and shards, hunters, thrown rocks, the ship, sparks.
// The bright orbit ring against the dark starfield is the game's signature
// image, so captured rocks and their ring get the glow budget.

import { drawBackground, drawRings, drawParticles, drawTexts, WORLD_W, WORLD_H } from './world.js';
import { comboActive } from './combo.js';

const TAU = Math.PI * 2;

// hash01(n) — a tiny deterministic hash for rock silhouettes, so a rock's
// jagged outline is stable frame to frame without storing vertices.
function hash01(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

// drawRockShape(g, x, y, r, rot, shade, glow) — one irregular asteroid.
function drawRockShape(g, x, y, r, rot, shade, glow) {
  const tones = ['#8d99b8', '#7c8db0', '#9aa7c4'];
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  if (glow) {
    g.shadowColor = '#6ff7ff';
    g.shadowBlur = 14;
  }
  g.beginPath();
  const verts = 8;
  for (let i = 0; i < verts; i++) {
    const a = (i / verts) * TAU;
    const rad = r * (0.78 + hash01(shade * 31 + i * 7) * 0.34);
    if (i === 0) g.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
    else g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  g.closePath();
  g.fillStyle = tones[shade % tones.length];
  g.fill();
  g.shadowBlur = 0;
  g.strokeStyle = 'rgba(230,242,255,0.55)';
  g.lineWidth = 1.4;
  g.stroke();
  g.fillStyle = 'rgba(20,28,48,0.35)';
  g.beginPath();
  g.arc(-r * 0.25, -r * 0.15, r * 0.28, 0, TAU);
  g.fill();
  g.restore();
}

// drawGame(g, G) — the full arena frame for the current run state.
export function drawGame(g, G) {
  drawBackground(g);
  const p = G.player;
  if (G.mode === 'playing' || G.mode === 'levelup') {
    // The gravity well: a whisper-faint disc so players learn its reach.
    const wellGrad = g.createRadialGradient(p.x, p.y, G.mods.wellR * 0.55, p.x, p.y, G.mods.wellR);
    wellGrad.addColorStop(0, 'rgba(111,247,255,0)');
    wellGrad.addColorStop(0.8, 'rgba(111,247,255,0.04)');
    wellGrad.addColorStop(1, 'rgba(111,247,255,0.09)');
    g.fillStyle = wellGrad;
    g.beginPath();
    g.arc(p.x, p.y, G.mods.wellR, 0, TAU);
    g.fill();
  }
  drawRings(g);
  for (const rock of G.rocks) {
    drawRockShape(g, rock.x, rock.y, rock.r, rock.rot, rock.shade, false);
  }
  drawOrbit(g, G);
  drawShards(g, G);
  drawBolts(g, G);
  for (const e of G.enemies) drawEnemy(g, e, G.time);
  drawShots(g, G);
  if (!p.dead) drawPlayer(g, G);
  drawParticles(g);
  drawTexts(g);
  if (G.flashT > 0) {
    g.fillStyle = `rgba(190,240,255,${(G.flashT * 1.4).toFixed(3)})`;
    g.fillRect(0, 0, WORLD_W, WORLD_H);
  }
}

// drawOrbit(g, G) — the signature ring: one bright circle per occupied
// band, the captured rocks riding it, and the dashed aim line when the
// player has anything to throw.
function drawOrbit(g, G) {
  const p = G.player;
  if (G.orbit.length > 0) {
    const bands = new Set();
    for (const rock of G.orbit) bands.add(Math.round(rock.dist));
    const chained = comboActive(G);
    g.save();
    g.strokeStyle = chained ? 'rgba(255,200,87,0.7)' : 'rgba(140,250,255,0.55)';
    g.lineWidth = 2;
    g.shadowColor = chained ? '#ffc857' : '#6ff7ff';
    g.shadowBlur = 10;
    for (const d of bands) {
      g.beginPath();
      g.arc(p.x, p.y, d, 0, TAU);
      g.stroke();
    }
    g.restore();
    for (const rock of G.orbit) {
      drawRockShape(g, rock.x, rock.y, rock.r, rock.ang * 1.7, rock.shade, true);
    }
    if (G.mode === 'playing') {
      const a = Math.atan2(G.aimY - p.y, G.aimX - p.x);
      g.save();
      g.strokeStyle = 'rgba(234,252,255,0.4)';
      g.lineWidth = 1.6;
      g.setLineDash([7, 8]);
      g.beginPath();
      g.moveTo(p.x + Math.cos(a) * 26, p.y + Math.sin(a) * 26);
      g.lineTo(p.x + Math.cos(a) * 128, p.y + Math.sin(a) * 128);
      g.stroke();
      g.setLineDash([]);
      g.strokeStyle = 'rgba(234,252,255,0.65)';
      g.beginPath();
      g.arc(G.aimX, G.aimY, 9, 0, TAU);
      g.stroke();
      g.restore();
    }
  }
}

// drawShards(g, G) — XP as small bright diamonds, gently pulsing.
function drawShards(g, G) {
  for (const s of G.shards) {
    const pulse = 1 + Math.sin(G.time * 6 + s.x) * 0.18;
    const r = 6 * pulse;
    g.save();
    g.translate(s.x, s.y);
    g.rotate(G.time * 2.4 + s.x * 0.05);
    g.shadowColor = '#57ff9a';
    g.shadowBlur = 9;
    g.fillStyle = '#57ff9a';
    g.beginPath();
    g.moveTo(0, -r);
    g.lineTo(r * 0.62, 0);
    g.lineTo(0, r);
    g.lineTo(-r * 0.62, 0);
    g.closePath();
    g.fill();
    g.restore();
  }
}

// drawBolts(g, G) — Devourer void bolts: violet orbs with a hot core.
function drawBolts(g, G) {
  for (const b of G.bolts) {
    g.save();
    g.shadowColor = '#c77dff';
    g.shadowBlur = 12;
    g.fillStyle = '#c77dff';
    g.beginPath();
    g.arc(b.x, b.y, b.r + 1.5, 0, TAU);
    g.fill();
    g.fillStyle = '#f3e8ff';
    g.beginPath();
    g.arc(b.x, b.y, b.r * 0.5, 0, TAU);
    g.fill();
    g.restore();
  }
}

// drawShots(g, G) — thrown rocks with a speed streak; nova-thrown rocks
// burn magenta so the player can follow the chain they are feeding.
function drawShots(g, G) {
  for (const s of G.shots) {
    const back = 0.045;
    g.save();
    g.strokeStyle = s.nova ? 'rgba(255,79,216,0.6)' : 'rgba(160,230,255,0.45)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(s.x - s.vx * back, s.y - s.vy * back);
    g.lineTo(s.x, s.y);
    g.stroke();
    g.restore();
    drawRockShape(g, s.x, s.y, s.r, s.x * 0.02 + s.t * 6, s.shade, true);
  }
}

// drawEnemy(g, e, time) — one silhouette per kind, readable at thumbnail
// size: crimson arrowhead, cyan needle, magenta pentagon, orange mite,
// and the Devourer's rotating toothed maw. A fresh hit flashes white.
function drawEnemy(g, e, time) {
  const flash = e.flashT > 0.02;
  g.save();
  g.translate(e.x, e.y);
  if (e.kind === 'chaser') {
    const a = Math.atan2(e.vy, e.vx);
    g.rotate(a);
    g.fillStyle = flash ? '#ffffff' : '#ff3b5c';
    g.shadowColor = '#ff3b5c';
    g.shadowBlur = 10;
    g.beginPath();
    g.moveTo(17, 0);
    g.lineTo(-8, -11);
    g.lineTo(-3, 0);
    g.lineTo(-8, 11);
    g.closePath();
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = '#2b0a14';
    g.beginPath();
    g.arc(3, 0, 4.6, 0, TAU);
    g.fill();
  } else if (e.kind === 'mini') {
    const a = Math.atan2(e.vy, e.vx);
    g.rotate(a);
    g.fillStyle = flash ? '#ffffff' : '#ffb347';
    g.beginPath();
    g.moveTo(11, 0);
    g.lineTo(-7, -7);
    g.lineTo(-7, 7);
    g.closePath();
    g.fill();
  } else if (e.kind === 'dart') {
    const a = e.dashing > 0 || e.teleT > 0
      ? Math.atan2(e.dashDy, e.dashDx)
      : Math.atan2(e.vy, e.vx);
    if (e.teleT > 0) {
      // The telegraph: a bright dashed line down the coming dash path.
      g.save();
      g.rotate(a);
      g.strokeStyle = `rgba(255,80,90,${0.45 + Math.sin(time * 40) * 0.3})`;
      g.lineWidth = 2;
      g.setLineDash([6, 6]);
      g.beginPath();
      g.moveTo(14, 0);
      g.lineTo(190, 0);
      g.stroke();
      g.restore();
    }
    g.rotate(a);
    g.fillStyle = flash ? '#ffffff' : (e.teleT > 0 ? '#ffe66d' : '#57e6ff');
    g.shadowColor = '#57e6ff';
    g.shadowBlur = 9;
    g.beginPath();
    g.moveTo(19, 0);
    g.lineTo(-10, -4.6);
    g.lineTo(-6, 0);
    g.lineTo(-10, 4.6);
    g.closePath();
    g.fill();
  } else if (e.kind === 'splitter') {
    g.rotate(e.phase + time * 0.7);
    g.fillStyle = flash ? '#ffffff' : '#ff4fd8';
    g.shadowColor = '#ff4fd8';
    g.shadowBlur = 12;
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      const rad = e.r * (1 + Math.sin(time * 3 + i * 2.1) * 0.07);
      if (i === 0) g.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
      else g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    g.closePath();
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = '#3d0a2e';
    g.beginPath();
    g.arc(0, 0, e.r * 0.42, 0, TAU);
    g.fill();
    g.fillStyle = '#ffd7f6';
    g.beginPath();
    g.arc(0, 0, e.r * 0.18 + Math.sin(time * 5) * 1.2, 0, TAU);
    g.fill();
    if (e.hp <= e.hpMax / 2) {
      g.strokeStyle = 'rgba(20,4,16,0.7)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(-e.r * 0.6, -e.r * 0.3);
      g.lineTo(-e.r * 0.1, 0);
      g.lineTo(-e.r * 0.5, e.r * 0.45);
      g.stroke();
    }
  } else if (e.kind === 'boss') {
    drawBoss(g, e, time, flash);
  }
  g.restore();
}

// drawBoss(g, e, time, flash) — the Devourer: a ring of rotating teeth
// around a dark maw, a glowing core that burns red in phase 2, and a
// telegraph flash before each charge.
function drawBoss(g, e, time, flash) {
  const core = e.phase2 ? '#ff3b5c' : '#b78bff';
  if (e.teleT > 0) {
    const a = Math.atan2(e.chargeDy, e.chargeDx);
    g.save();
    g.rotate(a);
    g.strokeStyle = `rgba(255,60,80,${0.4 + Math.sin(time * 36) * 0.28})`;
    g.lineWidth = 3;
    g.setLineDash([8, 7]);
    g.beginPath();
    g.moveTo(e.r, 0);
    g.lineTo(e.r + 240, 0);
    g.stroke();
    g.restore();
  }
  g.save();
  g.rotate(e.rot);
  g.fillStyle = flash ? '#ffffff' : '#5b2a86';
  g.shadowColor = core;
  g.shadowBlur = 22;
  const teeth = 12;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * TAU;
    g.save();
    g.rotate(a);
    g.beginPath();
    g.moveTo(e.r - 4, -8);
    g.lineTo(e.r + 13, 0);
    g.lineTo(e.r - 4, 8);
    g.closePath();
    g.fill();
    g.restore();
  }
  g.beginPath();
  g.arc(0, 0, e.r - 2, 0, TAU);
  g.fillStyle = flash ? '#ffffff' : '#2a1245';
  g.fill();
  g.shadowBlur = 0;
  g.restore();
  const pulse = 1 + Math.sin(time * 4) * 0.12;
  g.fillStyle = core;
  g.shadowColor = core;
  g.shadowBlur = 26;
  g.beginPath();
  g.arc(0, 0, e.r * 0.3 * pulse, 0, TAU);
  g.fill();
  g.shadowBlur = 0;
  g.fillStyle = '#0b0616';
  g.beginPath();
  g.arc(0, 0, e.r * 0.13 * pulse, 0, TAU);
  g.fill();
}

// drawPlayer(g, G) — the little star at the centre of everything: a sleek
// cyan dart with a hot core, an engine flame when thrusting, an i-frame
// blink after a hit, and a golden aura while the nova sits ready.
function drawPlayer(g, G) {
  const p = G.player;
  if (p.invulnT > 0 && Math.sin(G.time * 34) > 0.25) return; // blink
  g.save();
  g.translate(p.x, p.y);
  if (p.novaCharge >= 1) {
    g.strokeStyle = `rgba(255,200,87,${0.55 + Math.sin(G.time * 7) * 0.3})`;
    g.lineWidth = 2.4;
    g.shadowColor = '#ffc857';
    g.shadowBlur = 14;
    g.beginPath();
    g.arc(0, 0, p.r + 9 + Math.sin(G.time * 7) * 2, 0, TAU);
    g.stroke();
    g.shadowBlur = 0;
  }
  g.rotate(p.face);
  const speed = Math.hypot(p.vx, p.vy);
  if (speed > 40) {
    const flame = 10 + Math.sin(G.time * 46) * 4 + speed * 0.02;
    g.fillStyle = 'rgba(255,170,60,0.85)';
    g.beginPath();
    g.moveTo(-11, -4.6);
    g.lineTo(-11 - flame, 0);
    g.lineTo(-11, 4.6);
    g.closePath();
    g.fill();
  }
  g.fillStyle = '#aef4ff';
  g.shadowColor = '#6ff7ff';
  g.shadowBlur = 16;
  g.beginPath();
  g.moveTo(19, 0);
  g.lineTo(-7, -8);
  g.lineTo(-13, -13);
  g.lineTo(-9, 0);
  g.lineTo(-13, 13);
  g.lineTo(-7, 8);
  g.closePath();
  g.fill();
  g.shadowBlur = 0;
  g.fillStyle = '#0b3954';
  g.beginPath();
  g.arc(4, 0, 4.4, 0, TAU);
  g.fill();
  g.fillStyle = '#eafcff';
  g.beginPath();
  g.arc(5, -1, 1.8, 0, TAU);
  g.fill();
  g.restore();
}
