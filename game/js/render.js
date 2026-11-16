// render.js — everything the eye sees, drawn on one canvas: the calm parallax
// starfield, the glowing orbit rings, the player star with its corona, bright
// captured rocks against grey drifters, four hostile silhouettes that read at
// a glance, particle juice and floating score text. HUD text lives in hud.js;
// this file never touches the DOM.

import { WORLD_W, WORLD_H, TAU, clamp } from './world.js';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(640, Math.round(rect.width * dpr));
    canvas.height = Math.max(360, Math.round(rect.height * dpr));
  }
  window.addEventListener('resize', resize);
  resize();

  function draw(game) {
    const scale = canvas.width / WORLD_W;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (game.shake > 0.2) {
      const s = game.shake;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    drawBackground(game);
    drawShards(game);
    drawRocks(game);
    drawEnemies(game);
    if (game.state !== 'title') drawPlayer(game);
    if (game.state === 'title') drawTitleStar(game);
    drawParticles(game);
    drawAim(game);
    drawFloaters(game);
    drawVignette(game);
  }

  function drawBackground(game) {
    const grad = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    grad.addColorStop(0, '#070d24');
    grad.addColorStop(0.55, '#050914');
    grad.addColorStop(1, '#03060f');
    ctx.fillStyle = grad;
    ctx.fillRect(-30, -30, WORLD_W + 60, WORLD_H + 60);
    const px = game.player ? game.player.x - WORLD_W / 2 : 0;
    const py = game.player ? game.player.y - WORLD_H / 2 : 0;
    for (const neb of game.field.nebulas) {
      const g = ctx.createRadialGradient(neb.x - px * 0.02, neb.y - py * 0.02, 0, neb.x - px * 0.02, neb.y - py * 0.02, neb.r);
      g.addColorStop(0, `rgba(${neb.color}, 0.16)`);
      g.addColorStop(1, `rgba(${neb.color}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(neb.x - neb.r - 40, neb.y - neb.r - 40, neb.r * 2 + 80, neb.r * 2 + 80);
    }
    for (const layer of game.field.layers) {
      ctx.fillStyle = '#cfe4ff';
      for (const star of layer.stars) {
        const tw = 0.72 + 0.28 * Math.sin(game.time * 1.7 + star.tw);
        ctx.globalAlpha = layer.alpha * tw;
        const x = wrap(star.x - px * layer.factor, WORLD_W);
        const y = wrap(star.y - py * layer.factor, WORLD_H);
        ctx.beginPath();
        ctx.arc(x, y, star.r, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function wrap(v, max) {
    return ((v % max) + max) % max;
  }

  // The gravity well and the orbit rings: the game's signature image. The
  // faint outer circle is capture range; the bright rings are the orbit lanes.
  function drawOrbitRings(game) {
    const p = game.player;
    ctx.save();
    ctx.strokeStyle = 'rgba(110, 190, 255, 0.13)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 9]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.gravity, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let lane = 0; lane < 3; lane++) {
      const radius = 56 + lane * 17;
      const grad = ctx.createRadialGradient(p.x, p.y, radius - 3, p.x, p.y, radius + 3);
      grad.addColorStop(0, 'rgba(255, 190, 80, 0)');
      grad.addColorStop(0.5, 'rgba(255, 196, 107, 0.5)');
      grad.addColorStop(1, 'rgba(255, 190, 80, 0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, TAU);
      ctx.stroke();
      // A bright comet arc runs each lane so the ring reads as motion.
      const a0 = game.time * (150 / radius) + lane * 2.1;
      ctx.strokeStyle = 'rgba(255, 230, 170, 0.9)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, a0, a0 + 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function rockPath(rock) {
    ctx.beginPath();
    const n = rock.sides;
    for (let i = 0; i < n; i++) {
      const a = rock.rot + (i / n) * TAU;
      const rr = rock.r * rock.jag[i % rock.jag.length];
      const x = rock.x + Math.cos(a) * rr;
      const y = rock.y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function drawRocks(game) {
    for (const rock of game.pools.rocks) {
      if (rock.mode === 'flung' && rock.trail.length > 1) {
        ctx.save();
        ctx.strokeStyle = rock.novaBorn > 0 ? 'rgba(255, 120, 220, 0.55)' : 'rgba(255, 196, 107, 0.5)';
        ctx.lineWidth = rock.r * 0.9;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(rock.trail[0].x, rock.trail[0].y);
        for (const pt of rock.trail) ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
        ctx.restore();
      }
      rockPath(rock);
      if (rock.mode === 'drift') {
        ctx.fillStyle = '#5d6d8f';
        ctx.fill();
        ctx.strokeStyle = '#8b9cc0';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        // Captured rocks burn bright amber: shield and ammo you can see.
        ctx.save();
        ctx.shadowColor = 'rgba(255, 170, 50, 0.95)';
        ctx.shadowBlur = 16;
        ctx.fillStyle = '#ffc46b';
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = '#ffe6b0';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  function drawPlayer(game) {
    const p = game.player;
    drawOrbitRings(game);
    ctx.save();
    if (p.invuln > 0 && Math.floor(game.time * 14) % 2 === 0) ctx.globalAlpha = 0.45;
    // Corona: two counter-rotating rings of spikes behind a hot core.
    const pulse = 1 + Math.sin(p.pulse) * 0.06;
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3.4);
    glow.addColorStop(0, 'rgba(255, 214, 90, 0.55)');
    glow.addColorStop(0.5, 'rgba(255, 150, 50, 0.18)');
    glow.addColorStop(1, 'rgba(255, 140, 40, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 3.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffb84d';
    for (const [dir, len, count] of [[1, 1.55, 8], [-1, 1.3, 8]]) {
      for (let i = 0; i < count; i++) {
        const a = p.pulse * 0.35 * dir + (i / count) * TAU;
        const r1 = p.r * 0.92 * pulse;
        const r2 = p.r * len * pulse;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(a - 0.13) * r1, p.y + Math.sin(a - 0.13) * r1);
        ctx.lineTo(p.x + Math.cos(a) * r2, p.y + Math.sin(a) * r2);
        ctx.lineTo(p.x + Math.cos(a + 0.13) * r1, p.y + Math.sin(a + 0.13) * r1);
        ctx.closePath();
        ctx.fill();
      }
    }
    const core = ctx.createRadialGradient(p.x - 4, p.y - 4, 1, p.x, p.y, p.r);
    core.addColorStop(0, '#fffbe8');
    core.addColorStop(0.55, '#ffd34d');
    core.addColorStop(1, '#ff9a3c');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * pulse, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // The title screen's living emblem: a star wearing its orbit of rocks.
  function drawTitleStar(game) {
    const cx = WORLD_W / 2;
    const cy = WORLD_H / 2 + 30;
    const fakePlayer = { x: cx, y: cy, gravity: 150, pulse: game.time * 2.4, invuln: 0, r: 21 };
    const saved = game.player;
    game.player = fakePlayer;
    drawOrbitRings(game);
    game.player = saved;
    ctx.save();
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 74);
    glow.addColorStop(0, 'rgba(255, 214, 90, 0.6)');
    glow.addColorStop(1, 'rgba(255, 140, 40, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 74, 0, TAU);
    ctx.fill();
    const core = ctx.createRadialGradient(cx - 5, cy - 5, 2, cx, cy, 21);
    core.addColorStop(0, '#fffbe8');
    core.addColorStop(0.55, '#ffd34d');
    core.addColorStop(1, '#ff9a3c');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, 21, 0, TAU);
    ctx.fill();
    ctx.restore();
    for (const rock of game.backdropRocks) {
      const a = rock.angle + game.time * (150 / rock.orbitRadius) * 0.7;
      const x = cx + Math.cos(a) * rock.orbitRadius;
      const y = cy + Math.sin(a) * rock.orbitRadius;
      ctx.save();
      ctx.shadowColor = 'rgba(255, 170, 50, 0.95)';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#ffc46b';
      ctx.beginPath();
      ctx.arc(x, y, rock.r, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#ffe6b0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, rock.r, 0, TAU);
      ctx.stroke();
    }
  }

  function drawShards(game) {
    for (const s of game.pools.shards) {
      const blink = s.life < 3 ? (Math.floor(game.time * 6) % 2 === 0 ? 0.35 : 1) : 1;
      ctx.save();
      ctx.globalAlpha = blink;
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.shadowColor = 'rgba(103, 246, 255, 0.9)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#67f6ff';
      ctx.beginPath();
      ctx.moveTo(0, -s.r - 2);
      ctx.lineTo(s.r * 0.7, 0);
      ctx.lineTo(0, s.r + 2);
      ctx.lineTo(-s.r * 0.7, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawEnemies(game) {
    for (const e of game.pools.enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);
      if (e.type === 'chaser') drawChaser(e);
      else if (e.type === 'dart') drawDart(e);
      else if (e.type === 'splitter') drawSplitter(e, game);
      else if (e.type === 'devourer') drawDevourer(e, game);
      if (e.hitFlash > 0) {
        ctx.globalAlpha = Math.min(1, e.hitFlash * 6);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, e.r, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      if (e.type === 'devourer') drawBossUnderbar(e);
    }
  }

  function drawChaser(e) {
    ctx.rotate(e.rot);
    ctx.shadowColor = 'rgba(255, 77, 109, 0.8)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ff4d6d';
    ctx.beginPath();
    ctx.moveTo(e.r + 4, 0);
    ctx.lineTo(-e.r, -e.r * 0.85);
    ctx.lineTo(-e.r * 0.45, 0);
    ctx.lineTo(-e.r, e.r * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#2b0a14';
    ctx.beginPath();
    ctx.arc(e.r * 0.25, 0, e.r * 0.34, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.arc(e.r * 0.25, 0, e.r * 0.15, 0, TAU);
    ctx.fill();
  }

  function drawDart(e) {
    ctx.rotate(e.rot);
    ctx.fillStyle = '#ff7847';
    ctx.beginPath();
    ctx.moveTo(e.r + 3, 0);
    ctx.lineTo(-e.r, -e.r * 0.7);
    ctx.lineTo(-e.r, e.r * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffe6b0';
    ctx.beginPath();
    ctx.arc(e.r * 0.2, 0, e.r * 0.28, 0, TAU);
    ctx.fill();
  }

  function drawSplitter(e, game) {
    ctx.rotate(game.time * 0.7);
    ctx.shadowColor = 'rgba(180, 107, 255, 0.8)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#8b46d9';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const x = Math.cos(a) * e.r;
      const y = Math.sin(a) * e.r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#d9b3ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Fracture lines hint that it bursts into darts when killed.
    ctx.strokeStyle = 'rgba(20, 6, 34, 0.85)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * e.r, Math.sin(a) * e.r);
      ctx.stroke();
    }
    ctx.fillStyle = '#e9d5ff';
    ctx.beginPath();
    ctx.arc(0, 0, e.r * 0.3, 0, TAU);
    ctx.fill();
  }

  function drawDevourer(e, game) {
    const open = 0.75 + Math.sin(game.time * 2.2) * 0.12;
    ctx.shadowColor = 'rgba(160, 40, 200, 0.85)';
    ctx.shadowBlur = 26;
    const body = ctx.createRadialGradient(-8, -8, 6, 0, 0, e.r);
    body.addColorStop(0, '#4a1577');
    body.addColorStop(0.75, '#2c0b47');
    body.addColorStop(1, '#17052a');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, e.r, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    // A ring of teeth around a glowing gullet, all aimed at the star.
    ctx.rotate(e.rot);
    ctx.fillStyle = '#f4e9ff';
    const teeth = 11;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * TAU;
      if (Math.abs(Math.sin(a)) > open) continue; // the mouth gap faces travel
      const x1 = Math.cos(a) * e.r * 0.98;
      const y1 = Math.sin(a) * e.r * 0.98;
      const x2 = Math.cos(a) * e.r * 0.66;
      const y2 = Math.sin(a) * e.r * 0.66;
      const px = Math.cos(a + 0.09) * e.r * 0.82;
      const py = Math.sin(a + 0.09) * e.r * 0.82;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(px, py);
      ctx.closePath();
      ctx.fill();
    }
    const gullet = ctx.createRadialGradient(0, 0, 1, 0, 0, e.r * 0.6);
    gullet.addColorStop(0, 'rgba(255, 77, 109, 0.95)');
    gullet.addColorStop(0.6, 'rgba(160, 30, 90, 0.55)');
    gullet.addColorStop(1, 'rgba(80, 10, 50, 0)');
    ctx.fillStyle = gullet;
    ctx.beginPath();
    ctx.arc(0, 0, e.r * 0.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffe259';
    ctx.beginPath();
    ctx.arc(e.r * 0.18, 0, e.r * 0.1, 0, TAU);
    ctx.fill();
  }

  function drawBossUnderbar(e) {
    const w = e.r * 1.7;
    ctx.fillStyle = 'rgba(10, 6, 24, 0.8)';
    ctx.fillRect(e.x - w / 2, e.y - e.r - 16, w, 6);
    ctx.fillStyle = '#ff4d6d';
    ctx.fillRect(e.x - w / 2, e.y - e.r - 16, (w * Math.max(0, e.hp)) / e.hpMax, 6);
  }

  function drawParticles(game) {
    for (const fx of game.pools.particles) {
      const t = fx.life / fx.lifeMax;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      if (fx.type === 'ring') {
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = fx.width * (1 - t) + 0.5;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, fx.r, 0, TAU);
        ctx.stroke();
      } else if (fx.type === 'glow') {
        const g = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, fx.r);
        g.addColorStop(0, fx.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, fx.r, 0, TAU);
        ctx.fill();
      } else {
        ctx.fillStyle = fx.color;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, fx.r * (1 - t * 0.6), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawAim(game) {
    if (game.state !== 'playing' && game.state !== 'shot') return;
    const p = game.player;
    if (!p) return;
    const hasAmmo = game.pools.rocks.some((r) => r.mode === 'orbit');
    if (!hasAmmo) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 240, 200, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 8]);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(game.aimX, game.aimY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255, 240, 200, 0.9)';
    ctx.beginPath();
    ctx.arc(game.aimX, game.aimY, 9, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(game.aimX - 13, game.aimY);
    ctx.lineTo(game.aimX + 13, game.aimY);
    ctx.moveTo(game.aimX, game.aimY - 13);
    ctx.lineTo(game.aimX, game.aimY + 13);
    ctx.stroke();
    ctx.restore();
  }

  function drawFloaters(game) {
    ctx.save();
    ctx.textAlign = 'center';
    for (const f of game.pools.floaters) {
      const t = f.life / f.lifeMax;
      ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      ctx.font = `800 ${f.size}px "Segoe UI", system-ui, sans-serif`;
      ctx.fillStyle = f.color;
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 6;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }

  function drawVignette(game) {
    const g = ctx.createRadialGradient(WORLD_W / 2, WORLD_H / 2, WORLD_H * 0.42, WORLD_W / 2, WORLD_H / 2, WORLD_H * 0.86);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    const p = game.player;
    if (p && game.state === 'playing' && p.hull < p.hullMax * 0.3) {
      const pulse = 0.1 + 0.07 * Math.sin(game.time * 5);
      const red = ctx.createRadialGradient(WORLD_W / 2, WORLD_H / 2, WORLD_H * 0.36, WORLD_W / 2, WORLD_H / 2, WORLD_H * 0.8);
      red.addColorStop(0, 'rgba(255,30,50,0)');
      red.addColorStop(1, `rgba(255,30,50,${pulse + 0.08})`);
      ctx.fillStyle = red;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }
  }

  return { draw, resize };
}
