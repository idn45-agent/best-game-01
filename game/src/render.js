// render.js — Every pixel of STARFORGE.
//
// Canvas 2D, one fixed 1280x720 arena. This module draws the background
// starfield, the forge-ship and its orbit rocks, the hunters, the Devourer,
// the HUD (score, wave, HP, NOVA CHAIN, build badge, synergy badges, XP)
// and every screen: title, draft, pause, game over, victory. Nothing here
// changes state except the draft card rectangles, which main.js reads for
// clicks.

import { PATHS } from './upgrades.js';
import { orbitRockPosition } from './player.js';

const W = 1280;
const H = 720;

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function poly(ctx, x, y, radius, sides, rot, wobbleSeed) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    const r = radius * (0.78 + 0.28 * Math.sin(i * 2.7 + wobbleSeed));
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function glowCircle(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function render(state) {
  const ctx = state.ctx;
  ctx.save();
  // Screen shake: a decaying random offset.
  if (state.shake > 0.2) {
    ctx.translate(
      (state.rng() - 0.5) * state.shake,
      (state.rng() - 0.5) * state.shake,
    );
  }
  drawBackground(ctx, state);
  drawBurnZones(ctx, state);
  drawGems(ctx, state);
  drawAsteroids(ctx, state);
  drawEnemies(ctx, state);
  drawBoss(ctx, state);
  drawShots(ctx, state);
  drawPlayer(ctx, state);
  drawEnemyBullets(ctx, state);
  drawParticles(ctx, state);
  drawShockwaves(ctx, state);
  drawFloaters(ctx, state);
  ctx.restore();

  if (state.mode === 'title') drawTitle(ctx, state);
  else if (state.mode === 'draft') { drawHUD(ctx, state); drawDraft(ctx, state); }
  else if (state.mode === 'paused') { drawHUD(ctx, state); drawPaused(ctx, state); }
  else if (state.mode === 'gameover') drawGameOver(ctx, state);
  else if (state.mode === 'victory') drawVictory(ctx, state);
  else drawHUD(ctx, state);

  if (state.banner && state.banner.t > 0 &&
      (state.mode === 'playing' || state.mode === 'paused')) {
    drawBanner(ctx, state);
  }
}

function drawBackground(ctx, state) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#070a1c');
  g.addColorStop(0.55, '#0b1030');
  g.addColorStop(1, '#160b2e');
  ctx.fillStyle = g;
  ctx.fillRect(-20, -20, W + 40, H + 40);

  for (const n of state.nebulas) {
    glowCircle(ctx, n.x, n.y, n.r, n.color, 0.16);
  }
  for (const s of state.stars) {
    const tw = 0.5 + 0.5 * Math.sin(state.time * s.tw + s.ph);
    ctx.globalAlpha = 0.35 + 0.6 * tw;
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x, s.y, s.r, s.r);
  }
  ctx.globalAlpha = 1;

  // Arena edge: a faint neon frame.
  ctx.strokeStyle = 'rgba(127,231,255,0.18)';
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, W - 16, H - 16);
}

function drawBurnZones(ctx, state) {
  for (const z of state.burnZones) {
    const a = 0.10 + 0.08 * Math.sin(state.time * 6 + z.x);
    glowCircle(ctx, z.x, z.y, z.radius, '#ff7a2a', a + 0.12);
    ctx.strokeStyle = 'rgba(255,122,42,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.radius * (0.9 + 0.05 * Math.sin(state.time * 8)), 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawGems(ctx, state) {
  for (const g of state.gems) {
    const pulse = 1 + 0.2 * Math.sin(state.time * 8 + g.x);
    if (g.kind === 'heart') {
      ctx.fillStyle = '#7dff8a';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('♥', g.x, g.y);
    } else {
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ffe066';
      const s = 5 * pulse;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.restore();
    }
  }
}

function drawAsteroids(ctx, state) {
  for (const a of state.asteroids) {
    ctx.fillStyle = '#8d93a8';
    poly(ctx, a.x, a.y, a.radius, 7, a.angle, a.angle * 3);
    ctx.fill();
    ctx.fillStyle = '#6d7386';
    poly(ctx, a.x, a.y, a.radius * 0.55, 6, -a.angle, a.angle * 5);
    ctx.fill();
  }
}

function drawPlayer(ctx, state) {
  const p = state.player;
  if (state.mode === 'gameover') return;

  // Gravity well radius (faint, so the player reads the capture zone).
  ctx.strokeStyle = 'rgba(255,179,71,0.14)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(p.x, p.y, state.stats.wellRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Orbit rocks: shield and ammo, warm stone with a hot core.
  for (const rock of p.rocks) {
    const rp = orbitRockPosition(p, rock);
    glowCircle(ctx, rp.x, rp.y, rock.size + 8, '#ffb347', 0.25);
    ctx.fillStyle = '#c9a06a';
    poly(ctx, rp.x, rp.y, rock.size, 7, rock.angle, rock.angle * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe9b0';
    ctx.beginPath();
    ctx.arc(rp.x, rp.y, rock.size * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  // Forge-wisps.
  for (let i = 0; i < p.wispAngles.length; i++) {
    const a = p.wispAngles[i];
    const wx = p.x + Math.cos(a) * 74;
    const wy = p.y + Math.sin(a) * 74;
    glowCircle(ctx, wx, wy, 16, '#b78cff', 0.5);
    ctx.fillStyle = '#e9dcff';
    ctx.beginPath();
    ctx.arc(wx, wy, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // The ship: a forged arrowhead, blinking while invulnerable.
  const blink = p.iframes > 0 && Math.floor(state.time * 16) % 2 === 0;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  if (blink) ctx.globalAlpha = 0.35;
  glowCircle(ctx, 0, 0, 34, '#ff9d3c', 0.35);
  ctx.fillStyle = '#ffd9a0';
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(-14, -13);
  ctx.lineTo(-7, 0);
  ctx.lineTo(-14, 13);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff7a2a';
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(-8, -7);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-8, 7);
  ctx.closePath();
  ctx.fill();
  // Thruster flame.
  if (p.thrust > 0.1) {
    ctx.fillStyle = `rgba(255,150,60,${0.5 * p.thrust})`;
    ctx.beginPath();
    ctx.moveTo(-14, -6);
    ctx.lineTo(-14 - 14 * p.thrust - Math.random() * 6, 0);
    ctx.lineTo(-14, 6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Aim tick.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x + Math.cos(p.angle) * 30, p.y + Math.sin(p.angle) * 30);
  ctx.lineTo(p.x + Math.cos(p.angle) * 40, p.y + Math.sin(p.angle) * 40);
  ctx.stroke();
}

function drawEnemies(ctx, state) {
  for (const e of state.enemies) {
    const spawnScale = e.spawnT > 0 ? 1 - e.spawnT / 0.35 : 1;
    const telegraphing = e.telegraph > 0;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.scale(spawnScale, spawnScale);
    glowCircle(ctx, 0, 0, e.radius + 14, e.glow, 0.30);
    if (e.freeze > 0) {
      ctx.fillStyle = 'rgba(150,220,255,0.45)';
      ctx.beginPath();
      ctx.arc(0, 0, e.radius + 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.rotate(e.angle);
    ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : e.color;
    if (e.type === 'mote') {
      ctx.beginPath();
      ctx.moveTo(e.radius, 0);
      ctx.lineTo(-e.radius * 0.7, -e.radius * 0.8);
      ctx.lineTo(-e.radius * 0.3, 0);
      ctx.lineTo(-e.radius * 0.7, e.radius * 0.8);
      ctx.closePath();
      ctx.fill();
    } else if (e.type === 'wisp') {
      ctx.beginPath();
      ctx.moveTo(e.radius, 0);
      ctx.lineTo(0, -e.radius * 0.7);
      ctx.lineTo(-e.radius, 0);
      ctx.lineTo(0, e.radius * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,224,102,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-e.radius, 0);
      ctx.lineTo(-e.radius - 18, 0);
      ctx.stroke();
    } else if (e.type === 'spitter') {
      poly(ctx, 0, 0, e.radius, 6, 0, 1.3);
      ctx.fill();
      ctx.fillStyle = '#2a0a22';
      ctx.beginPath();
      ctx.arc(e.radius * 0.4, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.type === 'brute') {
      if (telegraphing) {
        ctx.strokeStyle = `rgba(255,60,60,${0.5 + 0.5 * Math.sin(state.time * 20)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius + 8, 0, Math.PI * 2);
        ctx.stroke();
      }
      poly(ctx, 0, 0, e.radius, 5, 0, 2.1);
      ctx.fill();
      ctx.fillStyle = '#3d0a0a';
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Burn flicker.
    if (e.burn > 0) {
      glowCircle(ctx, e.x, e.y, e.radius + 6, '#ff7a2a', 0.3 + 0.15 * Math.sin(state.time * 14));
    }
    // Health bar when hurt.
    if (e.hp < e.maxHp) {
      const w = e.radius * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(e.x - w / 2, e.y - e.radius - 12, w, 4);
      ctx.fillStyle = '#ff5d5d';
      ctx.fillRect(e.x - w / 2, e.y - e.radius - 12, w * (e.hp / e.maxHp), 4);
    }
  }
}

function drawBoss(ctx, state) {
  const boss = state.boss;
  if (!boss) return;
  const p = state.player;
  const entering = boss.entering;

  // Dash telegraph: a line from the boss toward the player.
  if (boss.telegraph > 0 && boss.telegraphKind === 'dash') {
    const a = Math.atan2(p.y - boss.y, p.x - boss.x);
    ctx.strokeStyle = `rgba(255,60,90,${0.35 + 0.35 * Math.sin(state.time * 18)})`;
    ctx.lineWidth = 26;
    ctx.beginPath();
    ctx.moveTo(boss.x, boss.y);
    ctx.lineTo(boss.x + Math.cos(a) * 900, boss.y + Math.sin(a) * 900);
    ctx.stroke();
  }
  // Radial telegraph: an expanding warning ring.
  if (boss.telegraph > 0 && boss.telegraphKind === 'radial') {
    const prog = 1 - boss.telegraph / 0.85;
    ctx.strokeStyle = `rgba(255,93,138,${0.4 + 0.4 * prog})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, boss.radius + 20 + prog * 60, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(boss.x, boss.y);
  const bob = entering ? 0 : Math.sin(boss.pulse * 2) * 4;
  ctx.translate(0, bob);
  glowCircle(ctx, 0, 0, boss.radius + 60, '#ff5d8a', boss.phase === 2 ? 0.5 : 0.35);

  // Spiked outer ring, rotating.
  ctx.rotate(boss.pulse * 0.5);
  ctx.fillStyle = boss.phase === 2 ? '#ff2e63' : '#8a2f5c';
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * boss.radius * 0.85, Math.sin(a) * boss.radius * 0.85);
    ctx.lineTo(Math.cos(a + 0.12) * boss.radius * 1.15, Math.sin(a + 0.12) * boss.radius * 1.15);
    ctx.lineTo(Math.cos(a + 0.24) * boss.radius * 0.85, Math.sin(a + 0.24) * boss.radius * 0.85);
    ctx.closePath();
    ctx.fill();
  }
  ctx.rotate(-boss.pulse * 0.5);

  // Body.
  ctx.fillStyle = boss.hitFlash > 0 ? '#ffffff' : '#3d1030';
  ctx.beginPath();
  ctx.arc(0, 0, boss.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ff5d8a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, boss.radius, 0, Math.PI * 2);
  ctx.stroke();

  // The eye: tracks the player.
  const eyeA = Math.atan2(p.y - boss.y, p.x - boss.x);
  const ex = Math.cos(eyeA) * 12;
  const ey = Math.sin(eyeA) * 12;
  ctx.fillStyle = boss.phase === 2 ? '#ff2e63' : '#ff8ab0';
  ctx.beginPath();
  ctx.arc(ex, ey, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#12060d';
  ctx.beginPath();
  ctx.arc(ex + Math.cos(eyeA) * 5, ey + Math.sin(eyeA) * 5, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Boss HP bar, top centre, with a phase marker at half.
  const bw = 520;
  const bx = (W - bw) / 2;
  const by = 58;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  rr(ctx, bx - 2, by - 2, bw + 4, 18, 6);
  ctx.fill();
  ctx.fillStyle = '#ff2e63';
  rr(ctx, bx, by, bw * Math.max(0, boss.hp / boss.maxHp), 14, 6);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(bx + bw / 2 - 1, by - 2, 2, 18);
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffb3c8';
  ctx.fillText(
    `THE DEVOURER  ·  PHASE ${boss.phase}  ·  ${Math.max(0, Math.ceil(boss.hp))} HP`,
    W / 2, by + 32,
  );
}

function drawShots(ctx, state) {
  for (const sh of state.shots) {
    glowCircle(ctx, sh.x, sh.y, sh.radius + 8, sh.color, 0.45);
    ctx.fillStyle = sh.color;
    ctx.beginPath();
    ctx.arc(sh.x, sh.y, sh.radius * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sh.x, sh.y);
    ctx.lineTo(sh.x - sh.vx * 0.02, sh.y - sh.vy * 0.02);
    ctx.stroke();
  }
}

function drawEnemyBullets(ctx, state) {
  for (const b of state.enemyBullets) {
    glowCircle(ctx, b.x, b.y, b.radius + 9, b.color, 0.5);
    ctx.fillStyle = '#ffd7e8';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawParticles(ctx, state) {
  for (const pt of state.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawShockwaves(ctx, state) {
  for (const r of state.shockwaves) {
    ctx.globalAlpha = Math.max(0, r.life / r.maxLife);
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawFloaters(ctx, state) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of state.floaters) {
    ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
    ctx.font = `bold ${f.size}px system-ui, sans-serif`;
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function drawHUD(ctx, state) {
  const p = state.player;
  ctx.textBaseline = 'alphabetic';

  // Top-left: score and best.
  ctx.textAlign = 'left';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`SCORE ${state.score.toLocaleString('en-US')}`, 22, 36);
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillStyle = '#9fb2d8';
  ctx.fillText(`BEST ${Math.max(state.best, state.score).toLocaleString('en-US')}   ·   KILLS ${state.kills}`, 22, 58);

  // Top-centre: wave + progress (boss bar is drawn by drawBoss).
  ctx.textAlign = 'center';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillStyle = '#ffe9b0';
  ctx.fillText(`WAVE ${Math.min(state.wave, 10)} / 10`, W / 2, 30);
  if (!state.boss && state.waveTotal > 0) {
    const prog = state.waveTotal > 0 ? state.waveKills / state.waveTotal : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    rr(ctx, W / 2 - 90, 40, 180, 7, 3);
    ctx.fill();
    ctx.fillStyle = '#7fe7ff';
    rr(ctx, W / 2 - 90, 40, 180 * Math.min(1, prog), 7, 3);
    ctx.fill();
  }

  // Top-right: HP bar.
  ctx.textAlign = 'right';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`HULL ${Math.ceil(p.hp)} / ${p.maxHp}`, W - 22, 30);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  rr(ctx, W - 222, 38, 200, 12, 5);
  ctx.fill();
  const hpFrac = Math.max(0, p.hp / p.maxHp);
  ctx.fillStyle = hpFrac > 0.5 ? '#7dff8a' : hpFrac > 0.25 ? '#ffe066' : '#ff5d5d';
  rr(ctx, W - 222, 38, 200 * hpFrac, 12, 5);
  ctx.fill();

  // NOVA CHAIN meter under the HP bar.
  if (state.chain > 1) {
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillStyle = '#ff9d3c';
    ctx.fillText(`NOVA CHAIN x${state.chain}`, W - 22, 76);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    rr(ctx, W - 222, 82, 200, 6, 3);
    ctx.fill();
    ctx.fillStyle = '#ff9d3c';
    rr(ctx, W - 222, 82, 200 * (state.chainTimer / state.stats.chainWindow), 6, 3);
    ctx.fill();
  }

  // Bottom-left: build badge + synergy badges + path counts.
  const build = state.build;
  ctx.textAlign = 'left';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillStyle = '#ffe9b0';
  ctx.fillText(`BUILD: ${build.title}`, 22, H - 66);
  ctx.font = '13px system-ui, sans-serif';
  const counts = build.counts || {};
  ctx.fillStyle = '#9fb2d8';
  ctx.fillText(
    `NOVA ${counts.nova || 0}   PIERCE ${counts.pierce || 0}   FORGE ${counts.forge || 0}`,
    22, H - 46,
  );
  const syns = state.synergies;
  if (syns.length > 0) {
    let sx = 22;
    ctx.font = 'bold 12px system-ui, sans-serif';
    for (const s of syns) {
      const label = `✦ ${s.name}`;
      const w = ctx.measureText(label).width + 16;
      ctx.fillStyle = 'rgba(255,157,60,0.25)';
      rr(ctx, sx, H - 34, w, 20, 10);
      ctx.fill();
      ctx.strokeStyle = '#ff9d3c';
      ctx.lineWidth = 1;
      rr(ctx, sx, H - 34, w, 20, 10);
      ctx.stroke();
      ctx.fillStyle = '#ffd9a0';
      ctx.fillText(label, sx + 8, H - 20);
      sx += w + 8;
    }
  }

  // Bottom-centre: XP bar + level.
  const xpFrac = p.xpNext > 0 ? p.xp / p.xpNext : 0;
  ctx.textAlign = 'center';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillStyle = '#ffe066';
  ctx.fillText(`LEVEL ${p.level}`, W / 2, H - 40);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  rr(ctx, W / 2 - 130, H - 32, 260, 8, 4);
  ctx.fill();
  ctx.fillStyle = '#ffe066';
  rr(ctx, W / 2 - 130, H - 32, 260 * Math.min(1, xpFrac), 8, 4);
  ctx.fill();

  // Bottom-right: NOVA status + rocks.
  ctx.textAlign = 'right';
  ctx.font = 'bold 15px system-ui, sans-serif';
  if (p.novaCd <= 0) {
    ctx.fillStyle = '#ff9d3c';
    ctx.fillText('NOVA READY  [E]', W - 22, H - 46);
  } else {
    ctx.fillStyle = '#9fb2d8';
    ctx.fillText(`NOVA ${p.novaCd.toFixed(1)}s`, W - 22, H - 46);
  }
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = '#c9a06a';
  ctx.fillText(`ROCKS ${p.rocks.length} / ${state.stats.maxRocks}   ·   [P] pause   [M] sound`, W - 22, H - 26);
}

function drawBanner(ctx, state) {
  const b = state.banner;
  const a = Math.min(1, b.t / 0.6);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.textAlign = 'center';
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#ff9d3c';
  ctx.shadowBlur = 24;
  ctx.fillText(b.text, W / 2, 190);
  ctx.shadowBlur = 0;
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = '#cfe0ff';
  ctx.fillText(b.sub, W / 2, 222);
  ctx.restore();
}

function drawTitle(ctx, state) {
  ctx.fillStyle = 'rgba(4,6,18,0.55)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';

  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.fillStyle = '#ffe9b0';
  ctx.shadowColor = '#ff7a2a';
  ctx.shadowBlur = 34;
  ctx.fillText('STARFORGE', W / 2, 168);
  ctx.shadowBlur = 0;
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillStyle = '#cfe0ff';
  ctx.fillText('Forge the stars. Break the Devourer. Survive ten waves.', W / 2, 208);

  // The loop, in one line each.
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  const lines = [
    'WASD / arrows — fly      ·      Mouse — aim',
    'Click / Space — throw an orbit rock      ·      E — NOVA: detonate every rock',
    'The well captures asteroids: your rocks are shield AND ammo.',
    'Chain kills to raise NOVA CHAIN. Draft 3 cards each level — build NOVA, PIERCE or FORGE.',
  ];
  lines.forEach((l, i) => ctx.fillText(l, W / 2, 268 + i * 28));

  // Build paths preview.
  ctx.font = 'bold 14px system-ui, sans-serif';
  const paths = [
    ['NOVA', '#ff9d3c', 'area · burn · chain'],
    ['PIERCE', '#7fe7ff', 'crits · throws · pierce'],
    ['FORGE', '#b78cff', 'wisps · tank · gravity'],
  ];
  let px = W / 2 - 330;
  for (const [name, color, desc] of paths) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    rr(ctx, px, 404, 210, 54, 10);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    rr(ctx, px, 404, 210, 54, 10);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(name, px + 105, 428);
    ctx.fillStyle = '#cfe0ff';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(desc, px + 105, 448);
    px += 220;
  }

  if (state.best > 0) {
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillStyle = '#ffe066';
    ctx.fillText(`BEST SCORE ${state.best.toLocaleString('en-US')}`, W / 2, 498);
  }

  const blink = state.frozen || Math.floor(state.time * 2) % 2 === 0;
  if (blink) {
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('CLICK OR PRESS ENTER TO FORGE', W / 2, 560);
  }
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = '#8fa3c8';
  ctx.fillText('v4 · deeper draft · nova-chain synergies · two-phase Devourer', W / 2, 600);
}

function drawDraft(ctx, state) {
  ctx.fillStyle = 'rgba(4,6,18,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillStyle = '#ffe9b0';
  ctx.fillText(`LEVEL ${state.player.level} — CHOOSE A FORGING`, W / 2, 110);
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillStyle = '#cfe0ff';
  ctx.fillText('Pick one card. Synergies unlock when two paired upgrades meet. Keys 1 / 2 / 3 work too.', W / 2, 142);

  const cardW = 300;
  const cardH = 300;
  const gap = 36;
  const totalW = cardW * 3 + gap * 2;
  let x = (W - totalW) / 2;
  const y = 190;
  state.draftRects = [];
  state.draftChoices.forEach((card, i) => {
    const path = PATHS[card.path];
    const hover = state.draftHover === i;
    ctx.save();
    if (hover) ctx.translate(0, -8);
    ctx.fillStyle = 'rgba(10,14,34,0.95)';
    rr(ctx, x, y, cardW, cardH, 14);
    ctx.fill();
    ctx.strokeStyle = path.color;
    ctx.lineWidth = hover ? 3 : 2;
    rr(ctx, x, y, cardW, cardH, 14);
    ctx.stroke();

    ctx.fillStyle = path.color;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(`${path.name}  ·  ${card.path.toUpperCase()} PATH`, x + cardW / 2, y + 30);
    ctx.font = '44px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(card.icon, x + cardW / 2, y + 96);
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(card.name, x + cardW / 2, y + 140);
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = '#cfe0ff';
    wrapText(ctx, card.desc, x + cardW / 2, y + 168, cardW - 40, 20);
    const stacks = state.upgradesTaken[card.id] || 0;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = '#9fb2d8';
    ctx.fillText(`Owned ${stacks} / ${card.max}`, x + cardW / 2, y + 252);
    if (card.completesSynergy) {
      ctx.fillStyle = '#ff9d3c';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText('✦ COMPLETES A SYNERGY ✦', x + cardW / 2, y + 278);
    }
    ctx.restore();
    state.draftRects.push({ x, y, w: cardW, h: cardH });
    x += cardW + gap;
  });
}

function wrapText(ctx, text, cx, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, cx, yy);
      line = word;
      yy += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, cx, yy);
}

function drawPaused(ctx, state) {
  ctx.fillStyle = 'rgba(4,6,18,0.6)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = 'bold 48px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('PAUSED', W / 2, 320);
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillStyle = '#cfe0ff';
  ctx.fillText('P / Esc — resume      ·      M — sound      ·      R — restart run', W / 2, 360);
}

function statsLines(state) {
  const p = state.player;
  const mins = Math.floor(state.elapsed / 60);
  const secs = Math.floor(state.elapsed % 60);
  return [
    ['SCORE', state.score.toLocaleString('en-US')],
    ['BEST', Math.max(state.best, state.score).toLocaleString('en-US')],
    ['WAVE REACHED', `${Math.min(state.wave, 10)} / 10`],
    ['LEVEL', String(p.level)],
    ['KILLS', String(state.kills)],
    ['BEST NOVA CHAIN', `x${state.chainBest}`],
    ['TIME', `${mins}:${String(secs).padStart(2, '0')}`],
    ['BUILD', state.build.title],
  ];
}

function drawEndPanel(ctx, state, title, titleColor, sub) {
  ctx.fillStyle = 'rgba(4,6,18,0.62)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = 'bold 56px system-ui, sans-serif';
  ctx.fillStyle = titleColor;
  ctx.shadowColor = titleColor;
  ctx.shadowBlur = 26;
  ctx.fillText(title, W / 2, 150);
  ctx.shadowBlur = 0;
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillStyle = '#cfe0ff';
  ctx.fillText(sub, W / 2, 188);

  const rows = statsLines(state);
  const y0 = 240;
  ctx.font = '17px system-ui, sans-serif';
  rows.forEach(([label, value], i) => {
    const y = y0 + i * 32;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#9fb2d8';
    ctx.fillText(label, W / 2 - 16, y);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(value, W / 2 + 16, y);
  });

  const blink = state.frozen || Math.floor(state.time * 2) % 2 === 0;
  if (blink) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('PRESS R OR CLICK TO FORGE AGAIN', W / 2, y0 + rows.length * 32 + 30);
  }
}

function drawGameOver(ctx, state) {
  drawEndPanel(ctx, state, 'THE FORGE GOES DARK', '#ff5d5d',
    'The Devourer keeps the dark — this time. The forge remembers your score.');
}

function drawVictory(ctx, state) {
  drawEndPanel(ctx, state, '★ STAR IGNITED ★', '#ffe066',
    'The Devourer falls. Ten waves forged into one new star.');
}
