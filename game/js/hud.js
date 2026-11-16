// hud.js — the DOM heads-up display and the full-screen overlays. Big,
// high-contrast readouts (hull, wave, score, XP, nova charge, orbit count,
// the NOVA CHAIN badge and the Devourer bar) refreshed from game state every
// frame, plus the title, level-up, pause and end screens. Canvas art lives
// in render.js; this file never draws pixels.

import { clamp } from './world.js';

function el(id) {
  return document.getElementById(id);
}

export function createHud() {
  const hud = el('hud');
  const hullFill = el('hud-hull-fill');
  const hullText = el('hud-hull-text');
  const waveText = el('hud-wave');
  const leftText = el('hud-left');
  const scoreText = el('hud-score');
  const muteText = el('hud-mute');
  const xpFill = el('hud-xp-fill');
  const levelText = el('hud-level');
  const orbitText = el('hud-orbit');
  const novaFill = el('hud-nova-fill');
  const novaLabel = el('hud-nova-label');
  const comboBadge = el('combo');
  const banner = el('banner');
  const bossbar = el('bossbar');
  const bossFill = el('hud-boss-fill');
  const overlays = {
    title: el('ov-title'),
    upgrade: el('ov-upgrade'),
    pause: el('ov-pause'),
    end: el('ov-end'),
  };
  let bannerUntil = -1;

  function showOverlay(name) {
    for (const key of Object.keys(overlays)) {
      overlays[key].classList.toggle('hidden', key !== name);
    }
    hud.classList.toggle('hidden', name === 'title');
  }

  function hideOverlays() {
    for (const key of Object.keys(overlays)) overlays[key].classList.add('hidden');
    hud.classList.remove('hidden');
  }

  function showBanner(text, now, seconds = 1.6) {
    banner.textContent = text;
    banner.classList.remove('hidden');
    bannerUntil = now + seconds;
  }

  function hideBanner() {
    banner.classList.add('hidden');
    bannerUntil = -1;
  }

  function update(game) {
    const p = game.player;
    if (!p) return;
    const hullPct = clamp((p.hull / p.hullMax) * 100, 0, 100);
    hullFill.style.width = `${hullPct}%`;
    hullFill.classList.toggle('low', hullPct < 30);
    hullText.textContent = `${Math.ceil(p.hull)} / ${p.hullMax}`;
    waveText.textContent = `WAVE ${game.wave}`;
    const left = game.pools.enemies.length + (game.spawner ? game.spawner.remaining : 0);
    leftText.textContent = `HOSTILES ${left}`;
    scoreText.textContent = game.score.toLocaleString('en-US');
    xpFill.style.width = `${clamp((p.xp / p.xpNext) * 100, 0, 100)}%`;
    levelText.textContent = `${p.level}`;
    const orbitCount = game.pools.rocks.filter((r) => r.mode === 'orbit').length;
    orbitText.textContent = `${orbitCount} / ${p.orbitCap}`;
    const novaPct = p.novaCd <= 0 ? 100 : clamp((1 - p.novaCd / p.novaCdMax) * 100, 0, 100);
    novaFill.style.width = `${novaPct}%`;
    const novaReady = p.novaCd <= 0 && orbitCount > 0;
    novaFill.classList.toggle('ready', novaReady);
    novaLabel.classList.toggle('ready', novaReady);
    novaLabel.textContent = p.novaCd > 0 ? `NOVA ${p.novaCd.toFixed(1)}s` : orbitCount > 0 ? 'NOVA READY — E' : 'NOVA NEEDS ORBIT';
    // The chain badge only exists while a nova chain is live.
    const mult = game.combo.currentMultiplier(game.time);
    if (game.combo.isActive(game.time)) {
      comboBadge.textContent = `NOVA CHAIN ×${mult}`;
      comboBadge.classList.remove('hidden');
    } else {
      comboBadge.classList.add('hidden');
    }
    if (bannerUntil > 0 && game.time > bannerUntil) {
      banner.classList.add('hidden');
      bannerUntil = -1;
    }
    const boss = game.pools.enemies.find((e) => e.type === 'devourer');
    if (boss) {
      bossbar.classList.remove('hidden');
      bossFill.style.width = `${clamp((boss.hp / boss.hpMax) * 100, 0, 100)}%`;
    } else {
      bossbar.classList.add('hidden');
    }
  }

  function setMuted(muted) {
    muteText.textContent = muted ? 'SOUND OFF (M)' : 'SOUND ON';
  }

  // Build the three level-up cards; clicking one (or pressing 1-3) chooses.
  function showUpgrades(choices, player, onChoose) {
    const wrap = el('upg-cards');
    wrap.innerHTML = '';
    choices.forEach((choice, i) => {
      const card = document.createElement('div');
      card.className = 'upg-card';
      const glyph = document.createElement('div');
      glyph.className = 'upg-glyph';
      glyph.textContent = choice.glyph;
      const name = document.createElement('div');
      name.className = 'upg-name';
      name.textContent = `${i + 1}. ${choice.name}`;
      const desc = document.createElement('div');
      desc.className = 'upg-desc';
      desc.textContent = choice.desc(player);
      card.append(glyph, name, desc);
      card.addEventListener('click', () => onChoose(choice));
      wrap.appendChild(card);
    });
    showOverlay('upgrade');
  }

  function showEnd(won, game) {
    el('end-title').textContent = won ? 'STAR IGNITED' : 'COLLAPSE';
    el('end-sub').textContent = won
      ? 'Wave 10 cleared. The Devourer is stardust and your light burns on.'
      : `Your star fell on wave ${game.wave}. The void keeps the rocks.`;
    const mins = Math.floor(game.time / 60);
    const secs = Math.floor(game.time % 60).toString().padStart(2, '0');
    el('end-stats').innerHTML = '';
    const stats = [
      [game.score.toLocaleString('en-US'), 'SCORE'],
      [`${mins}:${secs}`, 'TIME'],
      [`${game.kills}`, 'KILLS'],
      [`${game.wave}`, 'WAVE'],
    ];
    for (const [num, lbl] of stats) {
      const box = document.createElement('div');
      box.className = 'end-stat';
      const n = document.createElement('div');
      n.className = 'num';
      n.textContent = num;
      const l = document.createElement('div');
      l.className = 'lbl';
      l.textContent = lbl;
      box.append(n, l);
      el('end-stats').appendChild(box);
    }
    showOverlay('end');
  }

  return { update, showOverlay, hideOverlays, showBanner, hideBanner, showUpgrades, showEnd, setMuted };
}
