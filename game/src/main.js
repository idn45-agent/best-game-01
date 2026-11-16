// main.js — STARFORGE's conductor: owns the run state G, the mode machine
// (title → playing ⇄ levelup → won/lost, plus the demo attract mode), the
// frame loop, and the deterministic ?shot= staging used for screenshots.
// The simulation lives in physics.js, the pictures in render.js and hud.js;
// this file only decides what happens next.
//
// URL hooks: ?seed=N fixes the random stream, ?demo=1 starts the autopilot
// attract mode, ?shot=title|play|boss|win|lose stages one frozen scene and
// raises window.__shotReady when it is safe to capture.

import { initRng, rnd, ri } from './rng.js';
import { initInput, keys, mouse, pressed, endFrame, moveVector } from './input.js';
import { initAudio, resumeAudio, toggleMute, sfx } from './audio.js';
import { initWorld, updateFx, WORLD_W, WORLD_H } from './world.js';
import { makePlayer, makeRock, makeEnemy, spawnRockAtEdge } from './entities.js';
import {
  updatePlayer, updateRocks, updateOrbit, updateShots, updateEnemies,
  updateBolts, updateShards, resolveCollisions, flingRock, fireNova, banner,
} from './physics.js';
import { createCombo, updateCombo } from './combo.js';
import { defaultMods, xpForLevel, rollChoices, applyUpgrade } from './upgrades.js';
import { startWave, updateWaves } from './waves.js';
import { drawGame } from './render.js';
import { drawHud, drawTitle, drawLevelUp, drawEndScreen, cardRects } from './hud.js';

const params = new URLSearchParams(location.search);
const seedParam = Number.parseInt(params.get('seed') || '', 10);
const hasSeed = Number.isFinite(seedParam);
const demoParam = params.get('demo') === '1';
const shotName = params.get('shot');

const canvas = document.getElementById('game');
const g = canvas.getContext('2d');

// toWorld(clientX, clientY) — page pixels to arena pixels; the canvas is
// CSS-scaled as one block, so a single ratio per axis is exact.
function toWorld(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (clientX - r.left) * (WORLD_W / r.width),
    y: (clientY - r.top) * (WORLD_H / r.height),
  };
}

// freshRun(seed) — a complete new run state. Everything the other modules
// read hangs off this object; nothing about a run lives anywhere else.
function freshRun(seed) {
  initRng(seed);
  return {
    mode: 'playing',
    time: 0,
    runTime: 0,
    score: 0,
    kills: 0,
    wave: 0,
    level: 1,
    xp: 0,
    xpNext: xpForLevel(1),
    player: makePlayer(),
    mods: defaultMods(),
    taken: {},
    synergyCannonPierce: false,
    rocks: [],
    orbit: [],
    shots: [],
    enemies: [],
    bolts: [],
    shards: [],
    combo: createCombo(),
    stats: { captures: 0, flings: 0, novas: 0, maxChain: 0, leechCount: 0 },
    banner: null,
    choices: [],
    waveState: null,
    aimX: WORLD_W / 2,
    aimY: 140,
    shake: 0,
    flashT: 0,
    rockT: 0,
    pendingLevel: false,
    pendingWin: false,
    pendingLose: false,
    endT: 0,
    endWon: false,
    levelT: 0,
    paused: false,
    demo: false,
    seed,
  };
}

let G = null;
let runCount = 0;
let titleIdle = 0;

// runSeed() — the seed for the next run: the URL's when given (so links
// and screenshots reproduce), otherwise a fresh one from the clock.
function runSeed() {
  runCount += 1;
  return hasSeed ? seedParam + runCount * 7919 : (Date.now() % 90000) + 10000;
}

// toTitle() — park on the title screen with an empty, quiet arena.
function toTitle() {
  G = freshRun(hasSeed ? seedParam : 4242);
  G.mode = 'title';
  G.player.dead = true; // the emblem replaces the ship on the title
  titleIdle = 0;
}

// startRun(demo) — a real run: wave 1, a starter scatter of rocks, and
// (for humans) the audio context unlocked by the gesture that got us here.
function startRun(demo) {
  G = freshRun(runSeed());
  G.demo = demo;
  for (let i = 0; i < 6; i++) {
    const rock = makeRock(140 + rnd() * (WORLD_W - 280), 120 + rnd() * (WORLD_H - 240));
    G.rocks.push(rock);
  }
  startWave(G, 1);
  if (!demo) {
    initAudio();
    resumeAudio();
  }
}

// autopilot(G) — the demo pilot, and the play-test driver: it plays the
// real game through the same control shape a human produces. It feeds the
// orbit first, then holds a strafing distance, leads its throws, and novas
// into crowds. Returns { move, aimX, aimY, fling, nova }.
function autopilot(G) {
  const p = G.player;
  const ctrl = { move: { x: 0, y: 0 }, aimX: p.x + 100, aimY: p.y, fling: false, nova: false };
  let nearestRock = null;
  let rockD = Infinity;
  for (const r of G.rocks) {
    const d = Math.hypot(r.x - p.x, r.y - p.y);
    if (d < rockD) { rockD = d; nearestRock = r; }
  }
  let nearestFoe = null;
  let foeD = Infinity;
  let crowd = 0;
  for (const e of G.enemies) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < foeD) { foeD = d; nearestFoe = e; }
    if (d < 250) crowd += 1;
  }
  if (G.orbit.length < 3 && nearestRock) {
    // Feed the orbit: park just off the rock and let the well reel it in.
    const want = 92;
    const dx = nearestRock.x - p.x;
    const dy = nearestRock.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    ctrl.move.x = (dx / d) * (d > want ? 1 : -0.4);
    ctrl.move.y = (dy / d) * (d > want ? 1 : -0.4);
  } else if (nearestFoe) {
    // Strafe the nearest hunter at range, circling slowly.
    const dx = p.x - nearestFoe.x;
    const dy = p.y - nearestFoe.y;
    const d = Math.hypot(dx, dy) || 1;
    const radial = foeD < 240 ? 1 : foeD > 380 ? -1 : 0;
    const side = Math.sin(G.time * 0.7) > 0 ? 1 : -1;
    ctrl.move.x = (dx / d) * radial + (-dy / d) * 0.7 * side;
    ctrl.move.y = (dy / d) * radial + (dx / d) * 0.7 * side;
    const len = Math.hypot(ctrl.move.x, ctrl.move.y) || 1;
    ctrl.move.x /= len;
    ctrl.move.y /= len;
  }
  // Dodge the nearest inbound bolt with a perpendicular step.
  for (const b of G.bolts) {
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (d < 130) {
      const bl = Math.hypot(b.vx, b.vy) || 1;
      ctrl.move.x += (-b.vy / bl) * 0.9;
      ctrl.move.y += (b.vx / bl) * 0.9;
    }
  }
  if (nearestFoe) {
    const lead = foeD / 920;
    ctrl.aimX = nearestFoe.x + nearestFoe.vx * lead;
    ctrl.aimY = nearestFoe.y + nearestFoe.vy * lead;
    if (G.orbit.length > 0 && foeD < 560 && p.flingCd <= 0) ctrl.fling = true;
    if (p.novaCharge >= 1 && G.orbit.length >= 3 && (crowd >= 3 || (nearestFoe.kind === 'boss' && foeD < 280))) {
      ctrl.nova = true;
    }
  }
  return ctrl;
}

// humanControl() — this frame's control from keyboard and mouse.
function humanControl() {
  return {
    move: moveVector(),
    aimX: mouse.x,
    aimY: mouse.y,
    fling: mouse.down || keys.Space === true,
    nova: pressed('KeyE') || pressed('ShiftLeft') || pressed('ShiftRight'),
  };
}

// updatePlaying(G, dt, ctrl) — one simulation step of a live run, shared
// by human play, the demo, and screenshot staging.
function updatePlaying(G, dt, ctrl) {
  const p = G.player;
  G.time += dt;
  G.runTime += dt;
  if (G.banner) {
    G.banner.t += dt;
    if (G.banner.t >= G.banner.life) G.banner = null;
  }
  p.face = Math.atan2(ctrl.aimY - p.y, ctrl.aimX - p.x);
  G.aimX = ctrl.aimX;
  G.aimY = ctrl.aimY;
  updatePlayer(G, dt, ctrl.move);
  if (ctrl.fling) flingRock(G, ctrl.aimX, ctrl.aimY);
  if (ctrl.nova) fireNova(G);
  updateRocks(G, dt);
  updateOrbit(G, dt);
  updateShots(G, dt);
  updateEnemies(G, dt);
  updateBolts(G, dt);
  updateShards(G, dt);
  resolveCollisions(G);
  updateCombo(G, dt);
  updateWaves(G, dt);
  updateFx(dt);
  // Keep the asteroid supply flowing: orbit ammo has to come from somewhere.
  G.rockT -= dt;
  if (G.rocks.length + G.orbit.length < 9 && G.rockT <= 0) {
    G.rocks.push(spawnRockAtEdge(p));
    G.rockT = 1.1;
  }
  G.shake = Math.max(0, G.shake - dt * 34);
  if (G.flashT > 0) G.flashT -= dt;
  if (G.pendingWin || G.pendingLose) {
    G.endWon = G.pendingWin;
    G.pendingWin = false;
    G.pendingLose = false;
    G.endT = 1.1;
    G.mode = 'ending';
    if (G.endWon) p.invulnT = 999;
  } else if (G.pendingLevel && !p.dead) {
    G.pendingLevel = false;
    G.choices = rollChoices(G);
    G.levelT = 0;
    G.mode = 'levelup';
    sfx('levelup');
  }
}

// anyUserInput() — has the human touched anything this frame? The demo
// yields the moment they do.
function anyUserInput() {
  if (mouse.clicked) return true;
  const codes = [
    'Enter', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyE', 'KeyR',
  ];
  return codes.some((c) => pressed(c));
}

// step(dt) — advance the mode machine one frame.
function step(dt) {
  if (pressed('KeyM')) toggleMute();
  switch (G.mode) {
    case 'title': {
      G.time += dt;
      titleIdle += dt;
      if (pressed('Enter') || mouse.clicked) startRun(false);
      else if (titleIdle > 12 && !shotName) startRun(true);
      break;
    }
    case 'playing': {
      if (G.demo) {
        if (anyUserInput()) {
          toTitle();
          break;
        }
        updatePlaying(G, dt, autopilot(G));
      } else {
        if (pressed('KeyP')) G.paused = !G.paused;
        if (!G.paused) updatePlaying(G, dt, humanControl());
      }
      break;
    }
    case 'levelup': {
      G.time += dt;
      G.levelT += dt;
      updateFx(dt);
      let pickIdx = -1;
      if (pressed('Digit1')) pickIdx = 0;
      if (pressed('Digit2')) pickIdx = 1;
      if (pressed('Digit3')) pickIdx = 2;
      if (mouse.clicked) {
        const rects = cardRects();
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i];
          if (mouse.x >= r.x && mouse.x <= r.x + r.w && mouse.y >= r.y && mouse.y <= r.y + r.h) {
            pickIdx = i;
          }
        }
      }
      if (G.demo && G.levelT > 0.9) pickIdx = ri(0, G.choices.length - 1);
      if (pickIdx >= 0 && G.choices[pickIdx]) {
        applyUpgrade(G, G.choices[pickIdx]);
        sfx('ui');
        if (G.pendingLevel) {
          G.pendingLevel = false;
          G.choices = rollChoices(G);
          G.levelT = 0;
        } else {
          G.mode = 'playing';
        }
      }
      break;
    }
    case 'ending': {
      G.time += dt;
      G.endT -= dt;
      updateFx(dt);
      updateShots(G, dt);
      updateBolts(G, dt);
      if (G.endT <= 0) G.mode = G.endWon ? 'won' : 'lost';
      break;
    }
    case 'won':
    case 'lost': {
      G.time += dt;
      updateFx(dt);
      if (G.demo) {
        G.endT += dt;
        if (G.endT > 4.5) startRun(true);
      } else if (pressed('KeyR') || pressed('Enter')) {
        startRun(false);
      }
      break;
    }
    default:
      break;
  }
}

// render() — arena first (screen-shaken by impacts), screens over it.
function render() {
  g.save();
  if (G.shake > 0.2) {
    g.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);
  }
  drawGame(g, G);
  g.restore();
  if (G.mode === 'title') drawTitle(g, G);
  else if (G.mode === 'playing' || G.mode === 'ending') drawHud(g, G);
  else if (G.mode === 'levelup') {
    drawHud(g, G);
    drawLevelUp(g, G);
  } else if (G.mode === 'won') drawEndScreen(g, G, true);
  else if (G.mode === 'lost') drawEndScreen(g, G, false);
  if (G.paused && G.mode === 'playing') {
    g.fillStyle = 'rgba(3,6,16,0.55)';
    g.fillRect(0, 0, WORLD_W, WORLD_H);
    g.font = "800 42px 'Segoe UI', system-ui, sans-serif";
    g.textAlign = 'center';
    g.fillStyle = '#eafcff';
    g.fillText('PAUSED', WORLD_W / 2, WORLD_H / 2);
    g.font = "600 16px 'Segoe UI', system-ui, sans-serif";
    g.fillStyle = 'rgba(190,220,245,0.8)';
    g.fillText('P — resume', WORLD_W / 2, WORLD_H / 2 + 32);
  }
  if (G.demo && (G.mode === 'playing' || G.mode === 'levelup')) {
    g.font = "700 13px 'Segoe UI', system-ui, sans-serif";
    g.textAlign = 'center';
    g.fillStyle = 'rgba(190,220,245,0.65)';
    g.fillText('DEMO — press any key to play', WORLD_W / 2, WORLD_H - 12);
  }
}

// stageShot(name) — build one frozen, deterministic scene for a screenshot.
// Gameplay scenes are assembled from the real factories, settled with real
// simulation steps, then pinned (hull, chain, boss HP) so the capture is
// composed rather than lucky. Ends by freezing the state and raising
// window.__shotReady for the capture harness.
function stageShot(name) {
  const still = { move: { x: 0, y: 0 }, aimX: 800, aimY: 215, fling: false, nova: false };
  if (name === 'title') {
    toTitle();
    for (let i = 0; i < 100; i++) step(1 / 60);
    G.time = 2.0; // pin the clock so the PRESS ENTER blink is mid-visible
  } else if (name === 'play' || name === 'boss') {
    startRun(false);
    const bossScene = name === 'boss';
    startWave(G, bossScene ? 10 : 3);
    G.waveState.queue.length = 0;
    G.banner = null;
    const p = G.player;
    p.x = bossScene ? 420 : 470;
    p.y = bossScene ? 445 : 400;
    p.invulnT = 30;
    G.rocks = [makeRock(240, 180), makeRock(1085, 615)];
    const orbitN = bossScene ? 4 : 5;
    for (let i = 0; i < orbitN; i++) {
      const rock = makeRock(0, 0);
      G.orbit.push({
        ang: (i / orbitN) * Math.PI * 2 + 0.5,
        dist: 50 + (i % 3) * 15,
        r: rock.r, shade: rock.shade, t: 3 + i, x: 0, y: 0,
      });
    }
    if (bossScene) {
      const boss = G.enemies.find((e) => e.kind === 'boss');
      boss.x = 865;
      boss.y = 295;
      boss.hp = Math.round(boss.hpMax * 0.62);
      G.enemies.push(...stageFoes([['chaser', 1015, 520], ['dart', 705, 150]]));
      still.aimX = 865;
      still.aimY = 295;
      G.score = 38900;
      G.level = 7;
    } else {
      G.enemies.push(
        ...stageFoes([
          ['splitter', 800, 215], ['chaser', 905, 330],
          ['dart', 990, 480], ['chaser', 1052, 208],
        ]),
      );
      G.score = 12480;
      G.level = 4;
    }
    G.xpNext = xpForLevel(G.level);
    G.xp = Math.floor(G.xpNext * 0.45);
    for (let i = 0; i < 36; i++) updatePlaying(G, 1 / 60, still);
    // Pin the composed values the simulation may have nudged.
    p.invulnT = 0; // staging set a long i-frame; its blink would hide the ship
    p.hull = bossScene ? 56 : 78;
    p.novaCharge = bossScene ? 1 : 0.65;
    G.combo.chain = bossScene ? 2 : 3;
    G.combo.timer = G.mods.comboWindow;
    G.combo.best = bossScene ? 6 : 5;
    G.stats.maxChain = G.combo.best;
    G.aimX = still.aimX;
    G.aimY = still.aimY;
    G.banner = null;
  } else if (name === 'win' || name === 'lose') {
    startRun(false);
    const won = name === 'win';
    G.waveState.queue.length = 0;
    G.enemies.length = 0;
    G.banner = null;
    G.score = won ? 61240 : 28410;
    G.kills = won ? 148 : 86;
    G.level = won ? 9 : 6;
    G.wave = won ? 10 : 7;
    G.runTime = won ? 512 : 388;
    G.stats.captures = won ? 96 : 61;
    G.stats.flings = won ? 210 : 132;
    G.stats.novas = won ? 11 : 7;
    G.stats.maxChain = won ? 8 : 6;
    G.combo.best = G.stats.maxChain;
    if (won) {
      for (let i = 0; i < 5; i++) {
        const rock = makeRock(0, 0);
        G.orbit.push({
          ang: (i / 5) * Math.PI * 2 + 0.4, dist: 50 + (i % 3) * 15,
          r: rock.r, shade: rock.shade, t: 4, x: 0, y: 0,
        });
      }
      for (let i = 0; i < 6; i++) updateOrbit(G, 1 / 60);
    } else {
      G.player.dead = true;
      G.enemies.push(...stageFoes([['chaser', 830, 250], ['dart', 380, 520], ['splitter', 950, 480]]));
    }
    G.mode = won ? 'won' : 'lost';
  }
  G.frozen = true;
  window.__shotReady = true;
}

// stageFoes(list) — build staged enemies from [kind, x, y] triples. Kept
// as a tiny local helper so stageShot reads as composition, not plumbing.
function stageFoes(list) {
  return list.map(([kind, x, y]) => makeEnemy(kind, x, y, G.wave));
}

// Boot: backdrop, input, the testing handle, then the opening state.
initWorld(hasSeed ? seedParam : 20261);
initInput(canvas, toWorld);
window.__sfState = () => ({
  mode: G.mode,
  score: G.score,
  wave: G.wave,
  level: G.level,
  kills: G.kills,
  enemies: G.enemies.length,
  orbit: G.orbit.length,
  hull: Math.round(G.player.hull),
});
if (shotName) stageShot(shotName);
else if (demoParam) startRun(true);
else toTitle();

// The frame loop: fixed-cap dt, frozen solid in shot mode.
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.033, Math.max(0.0005, (now - last) / 1000));
  last = now;
  if (!G.frozen) step(dt);
  render();
  endFrame();
}
requestAnimationFrame(frame);
