// main.js — STARFORGE: state, game loop and mode machine.
//
// Modes: title → playing → draft (level-up) / paused → gameover | victory.
// A run is ten waves; wave 10 is the Devourer, and killing it ignites the
// star (victory). The loop runs at a clamped delta so a slow frame cannot
// tunnel a bullet through the ship.
//
// Deterministic screenshots: ?shot=title|play|boss|victory&seed=N builds a
// fixed scene with a seeded RNG, advances it a fixed number of ticks with a
// scripted autopilot, freezes, and sets window.__shotReady.

import { makeRng, randRange } from './rng.js';
import { SoundEngine } from './audio.js';
import { Input } from './input.js';
import { updateParticles } from './particles.js';
import {
  computeStats, rollDraft, applyUpgradeChoice,
  dominantBuild, activeSynergies,
} from './upgrades.js';
import { updateEnemies, spawnEnemy } from './enemies.js';
import { updateBoss } from './boss.js';
import { startWave, updateWaves, spawnAsteroid } from './waves.js';
import { createPlayer, updatePlayer, saveBest, loadBest, detonateNova } from './player.js';
import { render } from './render.js';

const W = 1280;
const H = 720;

export function createState(canvas) {
  const rng = makeRng((Math.random() * 0xffffffff) >>> 0);
  const state = {
    canvas,
    ctx: canvas.getContext('2d'),
    rng,
    input: new Input(canvas),
    audio: new SoundEngine(),
    mode: 'title',
    frozen: false,
    time: 0,
    elapsed: 0,
    wave: 0,
    waveTotal: 0,
    waveKills: 0,
    score: 0,
    best: loadBest(),
    kills: 0,
    chain: 0,
    chainTimer: 0,
    chainBest: 0,
    player: createPlayer(),
    enemies: [],
    shots: [],
    enemyBullets: [],
    gems: [],
    asteroids: [],
    burnZones: [],
    particles: [],
    shockwaves: [],
    floaters: [],
    upgradesTaken: {},
    paths: { nova: 0, pierce: 0, forge: 0 },
    draftChoices: [],
    draftRects: [],
    draftHover: -1,
    pendingLevels: 0,
    boss: null,
    bossSpawned: false,
    spawnQueue: [],
    spawnTimer: 0,
    intermission: 0,
    asteroidTimer: 0,
    banner: null,
    shake: 0,
    stars: [],
    nebulas: [],
    stats: null,
    build: { key: 'mixed', title: 'UNFORGED', counts: {} },
    synergies: [],
    runStats: { shotsFired: 0, novas: 0 },
  };
  // Starfield and nebulae: fixed for the run, twinkle by time.
  for (let i = 0; i < 170; i++) {
    state.stars.push({
      x: randRange(rng, 0, W),
      y: randRange(rng, 0, H),
      r: randRange(rng, 1, 2.4),
      tw: randRange(rng, 0.6, 2.4),
      ph: randRange(rng, 0, Math.PI * 2),
      color: rng() < 0.8 ? '#cfe0ff' : '#ffe9b0',
    });
  }
  const nebColors = ['#2a1a5e', '#123a5e', '#4a1a3a', '#1a4a3a'];
  for (let i = 0; i < 5; i++) {
    state.nebulas.push({
      x: randRange(rng, 0, W),
      y: randRange(rng, 0, H),
      r: randRange(rng, 180, 320),
      color: nebColors[i % nebColors.length],
    });
  }
  state.stats = computeStats(state);
  refreshBuild(state);
  return state;
}

export function refreshBuild(state) {
  state.build = dominantBuild(state);
  state.synergies = activeSynergies(state);
}

export function resetRun(state) {
  state.player = createPlayer();
  state.enemies = [];
  state.shots = [];
  state.enemyBullets = [];
  state.gems = [];
  state.asteroids = [];
  state.burnZones = [];
  state.particles = [];
  state.shockwaves = [];
  state.floaters = [];
  state.upgradesTaken = {};
  state.paths = { nova: 0, pierce: 0, forge: 0 };
  state.draftChoices = [];
  state.pendingLevels = 0;
  state.boss = null;
  state.bossSpawned = false;
  state.spawnQueue = [];
  state.intermission = 0;
  state.asteroidTimer = 0;
  state.score = 0;
  state.kills = 0;
  state.chain = 0;
  state.chainTimer = 0;
  state.chainBest = 0;
  state.elapsed = 0;
  state.wave = 0;
  state.banner = null;
  state.shake = 0;
  state.runStats = { shotsFired: 0, novas: 0 };
  state.stats = computeStats(state);
  refreshBuild(state);
  // Opening fuel: four asteroids already drifting toward the well, so the
  // first rocks are captured within a second or two — the forge is never
  // left with no shield and no ammo at the start of a run.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.5;
    state.asteroids.push({
      x: 640 + Math.cos(a) * 180,
      y: 360 + Math.sin(a) * 180,
      vx: -Math.cos(a) * 55,
      vy: -Math.sin(a) * 55,
      radius: 9,
      angle: a,
      spin: 0.6,
      captured: false,
      life: 30,
    });
  }
  for (let i = 0; i < 2; i++) spawnAsteroid(state);
}

export function startRun(state) {
  resetRun(state);
  state.mode = 'playing';
  startWave(state, 1);
}

function chooseDraftCard(state, index) {
  const card = state.draftChoices[index];
  if (!card) return;
  applyUpgradeChoice(state, card);
  refreshBuild(state);
  state.audio.pickup();
  if (state.pendingLevels > 0) {
    state.pendingLevels--;
    state.draftChoices = rollDraft(state);
  } else {
    state.mode = 'playing';
  }
}

function handleInput(state) {
  const input = state.input;
  if (input.anyGesture) {
    state.audio.ensure();
    input.anyGesture = false;
  }
  if (input.wasPressed('m')) {
    const muted = state.audio.toggleMute();
    state.banner = { text: muted ? 'SOUND OFF' : 'SOUND ON', sub: '', t: 0.9 };
  }

  if (state.mode === 'title') {
    if (input.mouseClicked || input.wasPressed('enter') || input.wasPressed(' ')) {
      startRun(state);
    }
    return;
  }
  if (state.mode === 'playing') {
    if (input.wasPressed('p') || input.wasPressed('escape')) {
      state.mode = 'paused';
    } else if (input.wasPressed('r')) {
      startRun(state);
    }
    return;
  }
  if (state.mode === 'paused') {
    if (input.wasPressed('p') || input.wasPressed('escape')) {
      state.mode = 'playing';
    } else if (input.wasPressed('r')) {
      startRun(state);
    }
    return;
  }
  if (state.mode === 'draft') {
    if (input.wasPressed('1')) chooseDraftCard(state, 0);
    else if (input.wasPressed('2')) chooseDraftCard(state, 1);
    else if (input.wasPressed('3')) chooseDraftCard(state, 2);
    else if (input.mouseClicked) {
      for (let i = 0; i < state.draftRects.length; i++) {
        const r = state.draftRects[i];
        if (input.mouseX >= r.x && input.mouseX <= r.x + r.w &&
            input.mouseY >= r.y && input.mouseY <= r.y + r.h) {
          chooseDraftCard(state, i);
          break;
        }
      }
    }
    // Hover highlight for the card under the mouse.
    state.draftHover = -1;
    for (let i = 0; i < state.draftRects.length; i++) {
      const r = state.draftRects[i];
      if (input.mouseX >= r.x && input.mouseX <= r.x + r.w &&
          input.mouseY >= r.y && input.mouseY <= r.y + r.h) {
        state.draftHover = i;
        break;
      }
    }
    return;
  }
  if (state.mode === 'gameover' || state.mode === 'victory') {
    if (input.wasPressed('r') || input.wasPressed('enter') || input.mouseClicked) {
      startRun(state);
    }
  }
}

function updateAmbient(state, dt) {
  // Title backdrop: asteroids drift through the well's view.
  for (let i = state.asteroids.length - 1; i >= 0; i--) {
    const a = state.asteroids[i];
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.angle += a.spin * dt;
    if (Math.abs(a.x) > 1400 || Math.abs(a.y) > 840) state.asteroids.splice(i, 1);
  }
  state.asteroidTimer -= dt;
  if (state.asteroidTimer <= 0) {
    state.asteroidTimer = 1.4;
    spawnAsteroid(state);
  }
}

function update(state, dt) {
  state.time += dt;
  if (state.banner && state.banner.t > 0) state.banner.t -= dt;
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 26);

  if (state.mode === 'title') {
    updateAmbient(state, dt);
    updateParticles(state, dt);
    return;
  }
  if (state.mode === 'paused' || state.mode === 'draft') {
    updateParticles(state, dt);
    return;
  }
  if (state.mode === 'gameover' || state.mode === 'victory') {
    updateParticles(state, dt);
    updateAmbient(state, dt);
    return;
  }
  if (state.mode !== 'playing') return;

  state.elapsed += dt;
  updatePlayer(state, dt);
  if (state.mode !== 'playing') return; // player died mid-update
  updateEnemies(state, dt);
  updateBoss(state, dt);
  updateWaves(state, dt);
  updateParticles(state, dt);

  // Victory: the boss is gone and the run reached wave 10.
  if (state.bossSpawned && !state.boss && state.mode === 'playing') {
    state.mode = 'victory';
    state.banner = null;
    saveBest(state);
  }
}

function frame(state, dt) {
  handleInput(state);
  update(state, dt);
  render(state);
  state.input.endFrame();
}

// --- Deterministic screenshot scenes -------------------------------------
//
// ?shot=title|play|boss|victory&seed=N — build a fixed scene, advance it a
// fixed number of ticks with a scripted autopilot, freeze, and signal
// readiness. The render is the game's own code, no edits, no composites.

function autopilotTick(state, tick, target) {
  const input = state.input;
  const p = state.player;
  input.keys.clear();
  // Low on rocks? Chase the nearest asteroid first — the forge needs fuel.
  // Otherwise wander between two patrol points so the scene has motion.
  let tx = tick % 360 < 180 ? 480 : 800;
  let ty = tick % 360 < 180 ? 300 : 430;
  if (p.rocks.length < 2 && state.asteroids.length > 0) {
    let best = null;
    let bestD = 1e9;
    for (const a of state.asteroids) {
      const d = Math.hypot(a.x - p.x, a.y - p.y);
      if (d < bestD) { bestD = d; best = a; }
    }
    if (best) { tx = best.x; ty = best.y; }
  }
  if (p.x < tx - 20) input.keys.add('d');
  if (p.x > tx + 20) input.keys.add('a');
  if (p.y < ty - 20) input.keys.add('s');
  if (p.y > ty + 20) input.keys.add('w');
  // Aim at the nearest threat and throw when loaded.
  let aim = target;
  if (!aim) {
    let bestD = 1e9;
    for (const e of state.enemies) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < bestD) { bestD = d; aim = e; }
    }
    if (state.boss) aim = state.boss;
  }
  if (aim) {
    input.mouseX = aim.x;
    input.mouseY = aim.y;
  }
  input.mouseDown = p.throwCd <= 0 && p.rocks.length > 0;
  if (tick === 150 && p.novaCd <= 0 && p.rocks.length >= 3) {
    input.pressed.add('e');
  }
}

function buildShotScene(state, scene, seed) {
  state.rng = makeRng(seed);
  if (scene === 'title') {
    state.mode = 'title';
    for (let i = 0; i < 4; i++) {
      state.player.rocks.push({
        angle: (i / 4) * Math.PI * 2,
        dist: 54 + i * 9,
        size: 9,
      });
    }
    for (let i = 0; i < 6; i++) spawnAsteroid(state);
    for (let i = 0; i < 90; i++) frame(state, 1 / 60);
  } else if (scene === 'play') {
    startRun(state);
    // Jump to wave 3 with a head start: a few upgrades, a live chain.
    startWave(state, 3);
    applyUpgradeChoice(state, { id: 'nova-chain', path: 'nova' });
    applyUpgradeChoice(state, { id: 'ember-trail', path: 'nova' });
    applyUpgradeChoice(state, { id: 'deadeye', path: 'pierce' });
    refreshBuild(state);
    state.score = 2450;
    state.kills = 41;
    state.chain = 6;
    state.chainTimer = state.stats.chainWindow;
    state.player.level = 4;
    state.player.xp = 5;
    for (let i = 0; i < 300; i++) {
      autopilotTick(state, i);
      frame(state, 1 / 60);
      if (state.mode === 'draft') {
        // The autopilot levelled up: take the first card and keep playing.
        chooseDraftCard(state, 0);
      }
      if (state.mode !== 'playing') break;
    }
    // Stage the frozen frame for legibility: a full orbit of rocks, a live
    // chain, and a busy arena — all from the game's own state.
    while (state.player.rocks.length < state.stats.maxRocks) {
      state.player.rocks.push({
        angle: state.rng() * Math.PI * 2,
        dist: 54 + state.player.rocks.length * 9,
        size: 9,
      });
    }
    state.chain = 6;
    state.chainTimer = state.stats.chainWindow;
    state.player.novaCd = 0;
    const extraSpots = [
      [220, 180, 'mote'], [1060, 160, 'wisp'], [980, 520, 'spitter'],
      [180, 540, 'brute'], [640, 120, 'mote'], [1120, 380, 'wisp'],
    ];
    for (const [x, y, type] of extraSpots) {
      if (state.enemies.length < 10) spawnEnemy(state, type, x, y, 1);
    }
  } else if (scene === 'boss') {
    startRun(state);
    startWave(state, 10);
    applyUpgradeChoice(state, { id: 'nova-chain', path: 'nova' });
    applyUpgradeChoice(state, { id: 'frost-veil', path: 'nova' });
    applyUpgradeChoice(state, { id: 'railshot', path: 'pierce' });
    applyUpgradeChoice(state, { id: 'overforge', path: 'forge' });
    applyUpgradeChoice(state, { id: 'wisp-ally', path: 'forge' });
    refreshBuild(state);
    state.score = 9800;
    state.kills = 167;
    state.player.level = 9;
    state.player.hp = 74;
    // Force phase 2 so the shot shows the harder pattern set.
    if (state.boss) state.boss.hp = state.boss.maxHp * 0.42;
    for (let i = 0; i < 420; i++) {
      autopilotTick(state, i);
      frame(state, 1 / 60);
      if (state.mode !== 'playing') break;
    }
    // Stage the dash telegraph for the frozen frame: the line is readable.
    if (state.boss && state.mode === 'playing') {
      state.boss.telegraph = 0.7;
      state.boss.telegraphKind = 'dash';
      state.boss.patternT = 5;
      // Pull the ship clear of the boss so both read at a glance.
      state.player.x = 640;
      state.player.y = 540;
      state.player.vx = 0;
      state.player.vy = 0;
      while (state.player.rocks.length < state.stats.maxRocks) {
        state.player.rocks.push({
          angle: state.rng() * Math.PI * 2,
          dist: 54 + state.player.rocks.length * 9,
          size: 9,
        });
      }
      state.player.novaCd = 0;
      state.chain = 4;
      state.chainTimer = state.stats.chainWindow;
    }
  } else if (scene === 'victory') {
    startRun(state);
    state.banner = null;
    state.mode = 'victory';
    state.wave = 10;
    state.score = 12840;
    state.kills = 243;
    state.player.level = 12;
    state.player.hp = 61;
    state.chainBest = 14;
    state.elapsed = 742;
    applyUpgradeChoice(state, { id: 'nova-chain', path: 'nova' });
    applyUpgradeChoice(state, { id: 'ember-trail', path: 'nova' });
    applyUpgradeChoice(state, { id: 'chain-lightning', path: 'nova' });
    applyUpgradeChoice(state, { id: 'deadeye', path: 'pierce' });
    refreshBuild(state);
    frame(state, 1 / 60);
  }
  state.frozen = true;
  render(state);
  window.__shotReady = true;
}

function boot() {
  const canvas = document.getElementById('game');
  const state = createState(canvas);
  // Debug handle for play-tests (read-only inspection from the console).
  window.__starforge = state;
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (shot) {
    const seed = parseInt(params.get('seed') || '7', 10) || 7;
    buildShotScene(state, shot, seed);
    // Keep rendering the frozen frame (particles twinkle via time).
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      state.time += dt;
      render(state);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return;
  }

  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    frame(state, dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot();
