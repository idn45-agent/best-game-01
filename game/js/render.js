// render.js — every canvas drawing of the playfield: the nebula backdrop,
// the gravity well, rocks in drift and orbit, wraiths, shards, particles
// and the star. HUD and screens live in hud.js; this file only draws the
// world itself.

export function drawScene(ctx, state) {
  const { width, height } = state;
  drawBackdrop(ctx, state);
  drawGravityWell(ctx, state);
  for (const a of state.asteroids) if (a.state === 'drift') drawRock(ctx, a, '#9a8f83');
  for (const s of state.shards) drawShard(ctx, s);
  for (const e of state.enemies) drawEnemy(ctx, state, e);
  for (const rock of state.orbit) drawRock(ctx, rock, '#c9bda9');
  for (const p of state.projectiles) drawRock(ctx, p, '#ffe9c9');
  drawParticles(ctx, state);
  if (!state.starHidden) drawStar(ctx, state);
  drawAim(ctx, state);
}

function drawBackdrop(ctx, state) {
  const { width, height, backdrop, time, star } = state;
  const g = ctx.createRadialGradient(width / 2, height / 2, 60, width / 2, height / 2, height * 0.85);
  g.addColorStop(0, '#0a0e27');
  g.addColorStop(0.55, '#060818');
  g.addColorStop(1, '#03040c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);

  for (const blob of backdrop.blobs) {
    const bx = blob.x + Math.sin(time * 0.05 + blob.r) * blob.drift * 4;
    const by = blob.y + Math.cos(time * 0.04 + blob.r) * blob.drift * 3;
    const rg = ctx.createRadialGradient(bx, by, 0, bx, by, blob.r);
    rg.addColorStop(0, blob.tint);
    rg.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = rg;
    ctx.fillRect(bx - blob.r, by - blob.r, blob.r * 2, blob.r * 2);
  }

  const px = (star.x - width / 2) / width;
  const py = (star.y - height / 2) / height;
  for (const layer of backdrop.layers) {
    const ox = -px * layer.speed * 2.2;
    const oy = -py * layer.speed * 2.2;
    for (const s of layer.stars) {
      const tw = 0.55 + 0.45 * Math.sin(time * 1.7 + s.twinkle);
      ctx.globalAlpha = layer.alpha * tw;
      ctx.fillStyle = s.tint;
      ctx.fillRect(s.x + ox, s.y + oy, layer.size, layer.size);
    }
  }
  ctx.globalAlpha = 1;
}

function drawGravityWell(ctx, state) {
  const star = state.star;
  ctx.save();
  ctx.strokeStyle = 'rgba(84, 240, 255, 0.13)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 9]);
  ctx.lineDashOffset = -state.time * 22;
  ctx.beginPath();
  ctx.arc(star.x, star.y, star.gravityRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(84, 240, 255, 0.20)';
  ctx.beginPath();
  ctx.arc(star.x, star.y, 58, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function rockPath(ctx, rock) {
  ctx.beginPath();
  const n = rock.verts.length;
  for (let i = 0; i < n; i++) {
    const v = rock.verts[i];
    const r = rock.radius * v.m;
    const x = Math.cos(v.a + rock.angle) * r;
    const y = Math.sin(v.a + rock.angle) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawRock(ctx, rock, fill) {
  ctx.save();
  ctx.translate(rock.x, rock.y);
  rockPath(ctx, rock);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.20)';
  ctx.beginPath();
  ctx.arc(-rock.radius * 0.25, -rock.radius * 0.3, rock.radius * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawShard(ctx, s) {
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.spin);
  ctx.shadowColor = '#ffe066';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#ffe066';
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4, 0);
  ctx.lineTo(0, 6);
  ctx.lineTo(-4, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawParticles(ctx, state) {
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  for (const w of state.shockwaves) {
    ctx.save();
    ctx.globalAlpha = (w.life / w.maxLife) * 0.7;
    ctx.strokeStyle = '#ff3ea8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const f of state.floaters) {
    ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function drawEnemy(ctx, state, e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  const flash = e.flash > 0;
  ctx.shadowColor = e.color;
  ctx.shadowBlur = 16;
  ctx.fillStyle = flash ? '#ffffff' : e.color;
  if (e.kind === 'dart') {
    const a = Math.atan2(state.star.y - e.y, state.star.x - e.x);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(13, 0);
    ctx.lineTo(-9, -8);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-9, 8);
    ctx.closePath();
    ctx.fill();
  } else if (e.kind === 'devourer') {
    const pulse = 1 + Math.sin(state.time * 2.2) * 0.05;
    ctx.scale(pulse, pulse);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + state.time * 0.4;
      const r = e.radius * (i % 2 ? 0.78 : 1.05);
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#1a0210';
    ctx.beginPath();
    ctx.arc(0, 0, e.radius * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(0, 0, e.radius * 0.16 + Math.sin(state.time * 3) * 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Chasers, splitters and minis: spiky wraith orbs, splitter wears a ring.
    ctx.beginPath();
    const spikes = e.kind === 'splitter' ? 8 : 6;
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2 + e.wobble * 0.4;
      const r = e.radius * (i % 2 ? 0.72 : 1.08);
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(10, 2, 16, 0.85)';
    ctx.beginPath();
    ctx.arc(-e.radius * 0.3, -e.radius * 0.15, e.radius * 0.16, 0, Math.PI * 2);
    ctx.arc(e.radius * 0.3, -e.radius * 0.15, e.radius * 0.16, 0, Math.PI * 2);
    ctx.fill();
    if (e.kind === 'splitter') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 1.18, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
  if (e.kind === 'devourer' || (e.maxHp >= 60 && e.hp < e.maxHp)) {
    const w = e.radius * 2;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(e.x - w / 2, e.y - e.radius - 14, w, 5);
    ctx.fillStyle = e.kind === 'devourer' ? '#ff3860' : '#ff9ecb';
    ctx.fillRect(e.x - w / 2, e.y - e.radius - 14, w * Math.max(0, e.hp / e.maxHp), 5);
  }
}

function drawStar(ctx, state) {
  const star = state.star;
  const blink = star.invulnTimer > 0 && Math.floor(state.time * 14) % 2 === 0;
  ctx.save();
  ctx.translate(star.x, star.y);
  const glowR = star.radius * (3.1 + Math.sin(star.pulse) * 0.35);
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, glowR);
  g.addColorStop(0, 'rgba(160, 245, 255, 0.55)');
  g.addColorStop(0.35, 'rgba(84, 240, 255, 0.20)');
  g.addColorStop(1, 'rgba(84, 240, 255, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, glowR, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = blink ? 0.35 : 1;
  ctx.shadowColor = '#54f0ff';
  ctx.shadowBlur = 24;
  const core = ctx.createRadialGradient(-4, -4, 1, 0, 0, star.radius);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(0.55, '#aef4ff');
  core.addColorStop(1, '#2fb9d8');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, star.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawAim(ctx, state) {
  if (state.mode !== 'playing' || !state.orbit.length) return;
  const star = state.star;
  const { aimX, aimY } = state.aim;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 224, 102, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 8]);
  ctx.beginPath();
  ctx.moveTo(star.x, star.y);
  ctx.lineTo(aimX, aimY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255, 224, 102, 0.8)';
  ctx.beginPath();
  ctx.arc(aimX, aimY, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
