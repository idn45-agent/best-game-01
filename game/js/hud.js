// hud.js — everything drawn over the playfield: the HUD (hull, XP, wave,
// score, rock count, nova charge, boss bar) and the full screens for the
// title, level-up choice, pause, victory and collapse.

const FONT = '"Segoe UI", system-ui, sans-serif';

export function drawHud(ctx, state) {
  const star = state.star;
  ctx.save();
  ctx.textAlign = 'left';
  // Hull bar, top-left.
  ctx.font = `700 12px ${FONT}`;
  ctx.fillStyle = '#8fa3c8';
  ctx.fillText('HULL', 22, 30);
  bar(ctx, 22, 38, 230, 14, star.hull / star.maxHull, star.hull > 30 ? '#37e08b' : '#ff5470');
  ctx.font = `700 12px ${FONT}`;
  ctx.fillStyle = '#e8ecff';
  ctx.fillText(`${Math.ceil(star.hull)} / ${star.maxHull}`, 262, 50);
  // XP bar under it.
  ctx.fillStyle = '#8fa3c8';
  ctx.font = `700 12px ${FONT}`;
  ctx.fillText(`LV ${star.level}`, 22, 74);
  bar(ctx, 66, 66, 186, 9, star.xp / star.xpNext, '#ffe066');
  // Wave and score, top-centre and top-right.
  ctx.textAlign = 'center';
  ctx.font = `800 26px ${FONT}`;
  ctx.fillStyle = '#e8ecff';
  ctx.fillText(state.wave >= 10 ? 'FINAL WAVE' : `WAVE ${state.wave}`, state.width / 2, 40);
  ctx.textAlign = 'right';
  ctx.font = `800 22px ${FONT}`;
  ctx.fillStyle = '#ffd166';
  ctx.fillText(String(state.score).padStart(6, '0'), state.width - 22, 36);
  ctx.font = `600 13px ${FONT}`;
  ctx.fillStyle = '#8fa3c8';
  ctx.fillText(`KILLS ${state.kills}   ·   TIME ${formatTime(state.time)}`, state.width - 22, 58);
  drawBossBar(ctx, state);
  drawRockPips(ctx, state);
  drawNovaMeter(ctx, state);
  if (state.audio.muted) {
    ctx.textAlign = 'right';
    ctx.font = `600 12px ${FONT}`;
    ctx.fillStyle = '#8fa3c8';
    ctx.fillText('MUTED (M)', state.width - 22, state.height - 16);
  }
  ctx.restore();
}

function bar(ctx, x, y, w, h, frac, color) {
  ctx.fillStyle = 'rgba(10, 14, 34, 0.8)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  ctx.strokeStyle = 'rgba(232, 236, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}

function drawBossBar(ctx, state) {
  const boss = state.enemies.find((e) => e.kind === 'devourer');
  if (!boss) return;
  const w = 420;
  const x = (state.width - w) / 2;
  ctx.textAlign = 'center';
  ctx.font = `800 13px ${FONT}`;
  ctx.fillStyle = '#ff7d9c';
  ctx.fillText(state.wave >= 10 ? 'THE FINAL DEVOURER' : 'DEVOURER', state.width / 2, 66);
  bar(ctx, x, 72, w, 10, boss.hp / boss.maxHp, '#ff3860');
}

function drawRockPips(ctx, state) {
  const star = state.star;
  ctx.textAlign = 'left';
  ctx.font = `700 12px ${FONT}`;
  ctx.fillStyle = '#8fa3c8';
  ctx.fillText('ORBIT', 22, state.height - 40);
  for (let i = 0; i < star.orbitCapacity; i++) {
    ctx.beginPath();
    ctx.arc(32 + i * 20, state.height - 22, 6, 0, Math.PI * 2);
    if (i < state.orbit.length) {
      ctx.fillStyle = '#ffd9a0';
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(143, 163, 200, 0.5)';
      ctx.stroke();
    }
  }
}

function drawNovaMeter(ctx, state) {
  const star = state.star;
  const ready = star.novaTimer <= 0;
  const frac = 1 - star.novaTimer / star.novaCooldownMax;
  ctx.textAlign = 'right';
  ctx.font = `800 13px ${FONT}`;
  ctx.fillStyle = ready ? (state.orbit.length ? '#ff3ea8' : '#8fa3c8') : '#8fa3c8';
  const label = ready ? (state.orbit.length ? 'NOVA READY — E' : 'NOVA NEEDS ROCKS') : 'NOVA CHARGING';
  ctx.fillText(label, state.width - 22, state.height - 40);
  bar(ctx, state.width - 252, state.height - 32, 230, 10, frac, '#ff3ea8');
}

export function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function dim(ctx, state, alpha = 0.62) {
  ctx.fillStyle = `rgba(3, 4, 12, ${alpha})`;
  ctx.fillRect(0, 0, state.width, state.height);
}

export function drawTitleScreen(ctx, state) {
  dim(ctx, state, 0.45);
  ctx.save();
  // A soft veil behind the text block keeps the story and controls readable
  // while the ambient star burns behind them.
  const veil = ctx.createRadialGradient(state.width / 2, 330, 60, state.width / 2, 330, 430);
  veil.addColorStop(0, 'rgba(2, 3, 10, 0.5)');
  veil.addColorStop(1, 'rgba(2, 3, 10, 0)');
  ctx.fillStyle = veil;
  ctx.fillRect(0, 90, state.width, 560);
  ctx.textAlign = 'center';
  const cx = state.width / 2;
  ctx.font = `900 92px ${FONT}`;
  const g = ctx.createLinearGradient(cx - 300, 0, cx + 300, 0);
  g.addColorStop(0, '#54f0ff');
  g.addColorStop(0.5, '#e8ecff');
  g.addColorStop(1, '#ff3ea8');
  ctx.shadowColor = '#54f0ff';
  ctx.shadowBlur = 34;
  ctx.fillStyle = g;
  ctx.fillText('STARFORGE', cx, 218);
  ctx.shadowBlur = 0;
  ctx.font = `800 21px ${FONT}`;
  ctx.fillStyle = '#ffd166';
  ctx.fillText('G R A V I T Y   I S   T H E   W E A P O N', cx, 262);
  ctx.font = `400 17px ${FONT}`;
  ctx.fillStyle = '#c7d2ee';
  ctx.fillText('You are a newborn star in a neon nebula. The void sends wraiths to snuff you out.', cx, 316);
  ctx.fillText('Catch passing asteroids in your gravity well. Orbit them as a shield — then fling them back.', cx, 342);
  ctx.fillText('Survive ten waves and destroy the Final Devourer to ignite.', cx, 368);
  ctx.font = `600 16px ${FONT}`;
  ctx.fillStyle = '#8fa3c8';
  ctx.fillText('WASD / arrows — move        mouse — aim        click / Space — fling rock', cx, 428);
  ctx.fillText('E / Shift — nova blast        P — pause        M — mute        1-3 — choose upgrade', cx, 456);
  const pulse = 0.65 + 0.35 * Math.sin(state.time * 3);
  ctx.globalAlpha = pulse;
  ctx.font = `800 24px ${FONT}`;
  ctx.fillStyle = '#7dffcb';
  ctx.fillText('CLICK OR PRESS ENTER TO IGNITE', cx, 540);
  ctx.globalAlpha = 1;
  ctx.restore();
}

export function upgradeCardRects(state) {
  const w = 250, h = 188, gap = 26;
  const total = w * 3 + gap * 2;
  const x0 = (state.width - total) / 2;
  const y = 268;
  return [0, 1, 2].map((i) => ({ x: x0 + i * (w + gap), y, w, h }));
}

export function drawLevelUpScreen(ctx, state) {
  dim(ctx, state, 0.66);
  ctx.save();
  ctx.textAlign = 'center';
  const cx = state.width / 2;
  ctx.font = `900 44px ${FONT}`;
  ctx.shadowColor = '#ffe066';
  ctx.shadowBlur = 22;
  ctx.fillStyle = '#ffe066';
  ctx.fillText('LEVEL UP', cx, 168);
  ctx.shadowBlur = 0;
  ctx.font = `400 17px ${FONT}`;
  ctx.fillStyle = '#c7d2ee';
  ctx.fillText(`Your star grows brighter — level ${state.star.level}. Choose one gift of the forge:`, cx, 204);
  const rects = upgradeCardRects(state);
  state.choices.forEach((choice, i) => {
    const r = rects[i];
    ctx.fillStyle = 'rgba(10, 14, 34, 0.92)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = choice.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = choice.color;
    ctx.fillRect(r.x, r.y, r.w, 8);
    ctx.font = `800 21px ${FONT}`;
    ctx.fillStyle = '#e8ecff';
    ctx.fillText(choice.name, r.x + r.w / 2, r.y + 52);
    ctx.font = `400 14.5px ${FONT}`;
    ctx.fillStyle = '#aebadd';
    wrapText(ctx, choice.desc, r.x + r.w / 2, r.y + 86, r.w - 30, 20);
    ctx.font = `800 15px ${FONT}`;
    ctx.fillStyle = choice.color;
    ctx.fillText(`[ ${i + 1} ]`, r.x + r.w / 2, r.y + r.h - 18);
  });
  ctx.restore();
}

function wrapText(ctx, text, cx, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, cx, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, cx, yy);
}

export function drawPausedOverlay(ctx, state) {
  dim(ctx, state, 0.55);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `900 52px ${FONT}`;
  ctx.fillStyle = '#e8ecff';
  ctx.fillText('PAUSED', state.width / 2, state.height / 2 - 10);
  ctx.font = `600 17px ${FONT}`;
  ctx.fillStyle = '#8fa3c8';
  ctx.fillText('Press P to resume', state.width / 2, state.height / 2 + 30);
  ctx.restore();
}

export function drawEndScreen(ctx, state, won) {
  dim(ctx, state, 0.6);
  ctx.save();
  ctx.textAlign = 'center';
  const cx = state.width / 2;
  ctx.font = `900 74px ${FONT}`;
  if (won) {
    ctx.shadowColor = '#ffd166';
    ctx.shadowBlur = 36;
    ctx.fillStyle = '#ffd166';
    ctx.fillText('STAR IGNITED', cx, 216);
  } else {
    ctx.shadowColor = '#ff3860';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#ff5470';
    ctx.fillText('COLLAPSE', cx, 216);
  }
  ctx.shadowBlur = 0;
  ctx.font = `400 18px ${FONT}`;
  ctx.fillStyle = '#c7d2ee';
  ctx.fillText(won
    ? 'The Final Devourer is shattered. Your light joins the nebula — forever burning.'
    : 'Your light gutters and folds into the dark. The nebula remembers every star.', cx, 262);
  ctx.font = `700 25px ${FONT}`;
  ctx.fillStyle = '#e8ecff';
  const rows = [
    `SCORE  ${state.score}`,
    `WAVE REACHED  ${state.wave} / 10`,
    `KILLS  ${state.kills}`,
    `LEVEL  ${state.star.level}`,
    `TIME  ${formatTime(state.time)}`,
  ];
  rows.forEach((row, i) => ctx.fillText(row, cx, 336 + i * 38));
  const pulse = 0.65 + 0.35 * Math.sin(state.time * 3);
  ctx.globalAlpha = pulse;
  ctx.font = `800 22px ${FONT}`;
  ctx.fillStyle = '#7dffcb';
  ctx.fillText('PRESS R OR CLICK TO FORGE AGAIN', cx, 580);
  ctx.globalAlpha = 1;
  ctx.restore();
}

export function drawWaveBanner(ctx, state) {
  if (state.director.phase !== 'announce') return;
  const t = state.director.timer;
  ctx.save();
  ctx.globalAlpha = Math.min(1, t);
  ctx.textAlign = 'center';
  ctx.font = `900 46px ${FONT}`;
  ctx.shadowColor = '#ff3ea8';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#e8ecff';
  const label = state.wave % 5 === 0 ? `WAVE ${state.wave} — SOMETHING VAST APPROACHES` : `WAVE ${state.wave}`;
  ctx.fillText(label, state.width / 2, 150);
  ctx.restore();
}
