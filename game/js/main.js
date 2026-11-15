// main.js — STARFORGE boot and game loop.
// Owns the shared game state, the mode machine (title, playing, levelup,
// paused, won, lost), the demo autopilot used for screenshots, and the
// staged scenes the ?shot= parameter asks for.

import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRng, createBackdrop, makeAsteroid, maintainAsteroids } from './world.js';
import { makeStar, makeEnemy, spawnExplosion } from './entities.js';
import { stepPhysics } from './physics.js';
import { createDirector, makeSpawnEnemy } from './waves.js';
import { rollChoices } from './upgrades.js';
import { drawScene } from './render.js';
import {
  drawHud, drawTitleScreen, drawLevelUpScreen,
  drawPausedOverlay, drawEndScreen, drawWaveBanner, upgradeCardRects,
} from './hud.js';

const WIDTH = 1280;
const HEIGHT = 720;

const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') ?? 7) || 7;
const demo = params.get('demo') === '1';
const shot = params.get('shot');

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput(canvas);
const audio = createAudio();

window.__shotReady = false;

function createState() {
  const rng = createRng(seed);
  const state = {
    width: WIDTH, height: HEIGHT,
    time: 0, rng, audio,
    backdrop: createBackdrop(rng, WIDTH, HEIGHT),
    star: makeStar(WIDTH / 2, HEIGHT / 2),
    asteroids: [], orbit: [], projectiles: [], enemies: [],
    shards: [], particles: [], floaters: [], shockwaves: [],
    score: 0, kills: 0, wave: 1,
    director: createDirector(),
    mode: 'title',
    aim: { aimX: WIDTH / 2 + 200, aimY: HEIGHT / 2 - 80 },
    flingTimer: 0, asteroidTimer: 0, shake: 0,
    choices: [], levelReady: false,
    starDead: false, starHidden: false, deathTimer: 0,
    bossDown: false, finalBoss: null,
    demo, endAt: 0,
  };
  state.spawnEnemy = makeSpawnEnemy(state);
  return state;
}

let state = createState();

function resetGame() {
  const fresh = createState();
  fresh.demo = state.demo;
  state = fresh;
  state.mode = 'playing';
  // A few asteroids already drifting inside the field, ready to catch.
  for (let i = 0; i < 6; i++) {
    const a = makeAsteroid(state.rng, WIDTH, HEIGHT);
    a.x = 120 + state.rng() * (WIDTH - 240);
    a.y = 100 + state.rng() * (HEIGHT - 200);
    state.asteroids.push(a);
  }
}

// --- staged scenes for screenshots (?shot=...) --------------------------

function giveOrbitRocks(count) {
  for (let i = 0; i < count; i++) {
    const a = makeAsteroid(state.rng, WIDTH, HEIGHT);
    a.state = 'orbit';
    a.orbitTime = 2 + i * 0.7;
    a.orbitAngle = (i / count) * Math.PI * 2;
    a.x = state.star.x + Math.cos(a.orbitAngle) * 58;
    a.y = state.star.y + Math.sin(a.orbitAngle) * 58;
    state.asteroids.push(a);
    state.orbit.push(a);
  }
}

function stagePlay() {
  resetGame();
  state.wave = 3;
  state.director.phase = 'fighting';
  state.score = 1250;
  state.kills = 17;
  state.star.hull = 78;
  state.star.xp = 3;
  giveOrbitRocks(6);
  const spots = [[880, 210], [1010, 430], [820, 520], [300, 180], [240, 480]];
  const kinds = ['chaser', 'splitter', 'chaser', 'dart', 'chaser'];
  kinds.forEach((kind, i) => {
    state.enemies.push(state.spawnEnemy(kind, spots[i][0], spots[i][1]));
  });
  for (let i = 0; i < 7; i++) {
    state.shards.push({
      x: 420 + state.rng() * 260, y: 260 + state.rng() * 200,
      vx: 0, vy: 0, radius: 5, value: 1, life: 14, spin: state.rng() * 3,
    });
  }
}

function stageBoss() {
  resetGame();
  state.wave = 5;
  state.director.phase = 'fighting';
  state.score = 4920;
  state.kills = 74;
  state.star.level = 4;
  state.star.hull = 64;
  state.star.novaTimer = 5; // let the staged ring read before the autopilot novas
  giveOrbitRocks(6);
  const boss = makeEnemy('devourer', 930, 300, 1.3);
  boss.hp = Math.round(boss.maxHp * 0.55);
  state.enemies.push(boss);
  state.enemies.push(state.spawnEnemy('chaser', 240, 160));
  state.enemies.push(state.spawnEnemy('dart', 300, 560));
}

function stageOver() {
  resetGame();
  state.mode = 'lost';
  state.score = 8640;
  state.wave = 7;
  state.kills = 132;
  state.star.level = 6;
  state.time = 342;
  state.starHidden = true;
  spawnExplosion(state, state.star.x, state.star.y, '#54f0ff', 40, 300);
}

function stageTitle() {
  resetGame();
  state.mode = 'title';
  giveOrbitRocks(4);
}

if (shot === 'title') stageTitle();
else if (shot === 'play') stagePlay();
else if (shot === 'boss') stageBoss();
else if (shot === 'over') stageOver();
else if (demo) resetGame();

// --- control: human input, or the demo autopilot -------------------------

function playerControl() {
  const mx = (input.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (input.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
  const my = (input.isDown('KeyS', 'ArrowDown') ? 1 : 0) - (input.isDown('KeyW', 'ArrowUp') ? 1 : 0);
  return {
    mx, my,
    fling: input.mouse.down || input.isDown('Space'),
    nova: input.wasPressed('KeyE') || input.wasPressed('ShiftLeft') || input.wasPressed('ShiftRight'),
    aimX: input.mouse.x, aimY: input.mouse.y,
  };
}

function autopilotControl() {
  const star = state.star;
  let threat = null, threatDist = Infinity;
  for (const e of state.enemies) {
    const d = Math.hypot(e.x - star.x, e.y - star.y);
    if (d < threatDist) { threatDist = d; threat = e; }
  }
  let goal = null, goalDist = Infinity;
  for (const s of state.shards) {
    const d = Math.hypot(s.x - star.x, s.y - star.y);
    if (d < goalDist) { goalDist = d; goal = s; }
  }
  if (!goal) {
    for (const a of state.asteroids) {
      if (a.state !== 'drift') continue;
      const d = Math.hypot(a.x - star.x, a.y - star.y);
      if (d < goalDist) { goalDist = d; goal = a; }
    }
  }
  let mx = 0, my = 0;
  if (goal) { mx += (goal.x - star.x) / (goalDist || 1); my += (goal.y - star.y) / (goalDist || 1); }
  if (threat && threatDist < 200) {
    mx += ((star.x - threat.x) / threatDist) * 1.6;
    my += ((star.y - threat.y) / threatDist) * 1.6;
  }
  if (star.x < 130) mx += 1.2; else if (star.x > WIDTH - 130) mx -= 1.2;
  if (star.y < 120) my += 1.2; else if (star.y > HEIGHT - 120) my -= 1.2;
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  let near = 0;
  for (const e of state.enemies) {
    if (Math.hypot(e.x - star.x, e.y - star.y) < 185) near++;
  }
  return {
    mx, my,
    fling: Boolean(threat && threatDist < 560 && state.orbit.length > 0),
    nova: near >= 3 && state.orbit.length >= 3 && star.novaTimer <= 0,
    aimX: threat ? threat.x : star.x + 220,
    aimY: threat ? threat.y : star.y - 60,
  };
}

// --- mode machine ---------------------------------------------------------

function enterLevelUp() {
  const star = state.star;
  star.level += 1;
  star.xp -= star.xpNext;
  star.xpNext = 6 + (star.level - 1) * 5;
  state.choices = rollChoices(state.rng);
  state.mode = 'levelup';
  state.levelTimer = 0.8;
  audio.levelup();
}

function chooseUpgrade(i) {
  const choice = state.choices[i];
  if (!choice) return;
  choice.apply(state.star);
  state.floaters.push({
    x: state.star.x, y: state.star.y - 44,
    text: choice.name.toUpperCase(), color: choice.color, life: 1.1, maxLife: 1.1,
  });
  if (state.star.xp >= state.star.xpNext) {
    enterLevelUp();
  } else {
    state.mode = 'playing';
  }
}

function update(dt) {
  state.time += dt;
  state.shake = Math.max(0, state.shake - dt * 30);
  if (input.wasPressed('KeyM')) audio.toggleMute();
  if (input.mouse.clicked) audio.unlock();

  if (state.mode === 'title') {
    maintainAsteroids(state, dt);
    stepPhysics(state, dt, { mx: 0, my: 0, fling: false, nova: false, aimX: 0, aimY: 0 });
    if (input.mouse.clicked || input.wasPressed('Enter')) {
      audio.unlock();
      resetGame();
    }
    return;
  }

  if (state.mode === 'levelup') {
    if (state.demo) {
      state.levelTimer -= dt;
      if (state.levelTimer <= 0) chooseUpgrade(Math.floor(state.rng() * state.choices.length));
      return;
    }
    for (let i = 0; i < 3; i++) {
      if (input.wasPressed(`Digit${i + 1}`)) chooseUpgrade(i);
    }
    if (input.mouse.clicked) {
      const rects = upgradeCardRects(state);
      rects.forEach((r, i) => {
        const m = input.mouse;
        if (m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h) chooseUpgrade(i);
      });
    }
    return;
  }

  if (state.mode === 'paused') {
    if (input.wasPressed('KeyP') || input.mouse.clicked) state.mode = 'playing';
    return;
  }

  if (state.mode === 'won' || state.mode === 'lost') {
    state.endAt += dt;
    const restart = input.wasPressed('KeyR') || input.wasPressed('Enter') ||
      (input.mouse.clicked && state.endAt > 0.4);
    if (restart || (state.demo && state.endAt > 3)) resetGame();
    return;
  }

  // playing
  if (input.wasPressed('KeyP') && !state.demo) {
    state.mode = 'paused';
    return;
  }
  state.director.update(state, dt);
  maintainAsteroids(state, dt);
  const control = state.demo ? autopilotControl() : playerControl();
  state.aim = control;
  stepPhysics(state, dt, control);

  if (state.bossDown) {
    state.mode = 'won';
    state.endAt = 0;
    audio.win();
    spawnExplosion(state, state.star.x, state.star.y, '#ffd166', 50, 320);
    return;
  }
  if (state.starDead) {
    if (!state.starHidden) {
      state.starHidden = true;
      state.deathTimer = 1.3;
      spawnExplosion(state, state.star.x, state.star.y, '#54f0ff', 46, 320);
    }
    state.deathTimer -= dt;
    if (state.deathTimer <= 0) {
      state.mode = 'lost';
      state.endAt = 0;
    }
    return;
  }
  if (state.levelReady) {
    state.levelReady = false;
    enterLevelUp();
  }
}

function render() {
  ctx.save();
  if (state.shake > 0.3) {
    ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
  }
  drawScene(ctx, state);
  ctx.restore();
  if (state.mode === 'playing' || state.mode === 'levelup' || state.mode === 'paused') {
    drawHud(ctx, state);
    drawWaveBanner(ctx, state);
  }
  if (state.mode === 'title') drawTitleScreen(ctx, state);
  else if (state.mode === 'levelup') drawLevelUpScreen(ctx, state);
  else if (state.mode === 'paused') drawPausedOverlay(ctx, state);
  else if (state.mode === 'won') drawEndScreen(ctx, state, true);
  else if (state.mode === 'lost') drawEndScreen(ctx, state, false);
}

let last = performance.now();
let frames = 0;
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000 || 0.016);
  last = now;
  update(dt);
  render();
  input.endFrame();
  frames += 1;
  if (frames > 40 && !window.__shotReady) window.__shotReady = true;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
