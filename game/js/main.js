// main.js — STARFORGE's conductor: owns the game state machine (title,
// playing, upgrade draft, paused, won, lost), the fixed-step loop, wave flow,
// scoring, and every event callback physics.js reports (kills, captures,
// hits, shards). It also runs the demo autopilot (?demo=1) and the frozen
// screenshot scenes (?shot=title|play|boss|over) the entry's images come from.
//
// STARFORGE: you are a newborn star. Capture asteroids into orbit with your
// gravity well — they shield you and become ammo. Fling them at the void,
// nova them outward to chain kills, draft upgrades, and destroy the final
// Devourer on wave 10 to ignite.

import { WORLD_W, WORLD_H, TAU, clamp, distance, angleTo, makeRng, createStarfield, createPools, edgeSpawnPoint } from './world.js';
import { resetEntityIds, makePlayer, makeRock, makeHostile, makeShard, makeParticle, makeFloater } from './entities.js';
import { stepPlayer, stepRocks, stepEnemies, stepShards, stepEffects, collide, flingRock, novaBlast, orbitingRocks } from './physics.js';
import { createSpawner, FINAL_WAVE } from './waves.js';
import { rollUpgrades } from './upgrades.js';
import { NovaChain } from './combo.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createSoundBank } from './audio.js';

const STEP = 1 / 60;
const AMBIENT_ROCK_TARGET = 9;

const params = new URLSearchParams(window.location.search);
const seed = Number.parseInt(params.get('seed') || '20261116', 10) || 20261116;
const demoMode = params.get('demo') === '1';
const shotMode = params.get('shot');

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const hud = createHud();
const input = createInput(canvas);
const sound = createSoundBank();

const game = {
  state: 'title',
  time: 0,
  score: 0,
  kills: 0,
  wave: 1,
  rng: makeRng(seed),
  field: null,
  pools: createPools(),
  player: null,
  spawner: null,
  combo: new NovaChain(),
  shake: 0,
  aimX: WORLD_W * 0.7,
  aimY: WORLD_H * 0.35,
  backdropRocks: [],
  frozen: false,
  demo: demoMode,
  clearT: 0,
  wavePhase: 'active',
  rockSpawnT: 0,
  autoFlingT: 0,
  autoPickT: 0,
  pendingChoices: null,
  sfxT: {},
};
game.field = createStarfield(game.rng);

// Decorative orbit for the title screen emblem.
for (let i = 0; i < 5; i++) {
  game.backdropRocks.push({
    angle: (i / 5) * TAU + 0.4,
    orbitRadius: 56 + (i % 3) * 17,
    r: 9 + (i % 3) * 3,
  });
}
// A few still drifters behind the title text.
for (let i = 0; i < 6; i++) {
  const rock = makeRock(game.rng, game.rng.range(60, WORLD_W - 60), game.rng.range(60, WORLD_H - 60));
  rock.vx = 0;
  rock.vy = 0;
  game.pools.rocks.push(rock);
}

// --- small helpers ----------------------------------------------------------

function sfxReady(key, gap) {
  const last = game.sfxT[key] || -9;
  if (game.time - last < gap) return false;
  game.sfxT[key] = game.time;
  return true;
}

function burst(x, y, color, count, speed = 260, lifeMax = 0.5) {
  for (let i = 0; i < count; i++) {
    const a = game.rng.range(0, TAU);
    const v = game.rng.range(speed * 0.25, speed);
    game.pools.particles.push(makeParticle(x, y, {
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      r: game.rng.range(1.6, 3.6),
      color,
      lifeMax: game.rng.range(lifeMax * 0.5, lifeMax),
    }));
  }
}

function ringFx(x, y, color, width = 4, lifeMax = 0.45) {
  game.pools.particles.push(makeParticle(x, y, { type: 'ring', r: 14, color, width, lifeMax }));
}

function floater(x, y, text, color, size) {
  game.pools.floaters.push(makeFloater(x, y, text, color, size));
}

function removeEnemy(enemy) {
  const idx = game.pools.enemies.findIndex((e) => e.id === enemy.id);
  if (idx >= 0) game.pools.enemies.splice(idx, 1);
}

function enemyColor(type) {
  return { chaser: '#ff4d6d', dart: '#ff7847', splitter: '#b46bff', devourer: '#c44dff' }[type] || '#ffffff';
}

// --- physics event callbacks --------------------------------------------------

game.onRockCaptured = (rock) => {
  ringFx(rock.x, rock.y, 'rgba(255, 210, 120, 0.9)', 3, 0.3);
  burst(rock.x, rock.y, '#ffd34d', 5, 150, 0.3);
  if (sfxReady('capture', 0.06)) sound.capture();
};

game.onRockFlung = () => {
  if (sfxReady('fling', 0.05)) sound.fling();
};

game.onNovaBlast = (count) => {
  game.combo.beginNova(game.time);
  game.shake = Math.max(game.shake, 13);
  ringFx(game.player.x, game.player.y, 'rgba(255, 120, 220, 0.95)', 7, 0.55);
  game.pools.particles.push(makeParticle(game.player.x, game.player.y, {
    type: 'glow', r: 120, color: 'rgba(255, 120, 220, 0.35)', lifeMax: 0.35,
  }));
  floater(game.player.x, game.player.y - 44, 'NOVA!', '#ff9ff0', 30);
  sound.nova();
};

game.onEnemyHit = (enemy) => {
  burst(enemy.x, enemy.y, '#ffffff', 3, 180, 0.25);
  if (sfxReady('hit', 0.05)) sound.hit();
};

game.onEnemyKilled = (enemy, cause, rock) => {
  removeEnemy(enemy);
  game.kills++;
  let multiplier = 1;
  if (cause === 'nova') {
    multiplier = game.combo.registerKill(game.time);
    if (multiplier > 1 && sfxReady('chain', 0.05)) sound.chain(multiplier);
  }
  const gained = enemy.score * multiplier;
  game.score += gained;
  burst(enemy.x, enemy.y, enemyColor(enemy.type), enemy.type === 'devourer' ? 42 : 12, 320, 0.6);
  game.pools.particles.push(makeParticle(enemy.x, enemy.y, {
    type: 'glow', r: enemy.r * 2.2, color: 'rgba(255,255,255,0.25)', lifeMax: 0.3,
  }));
  floater(enemy.x, enemy.y - 10, multiplier > 1 ? `+${gained} ×${multiplier}` : `+${gained}`, multiplier > 1 ? '#ffe259' : '#ffffff', multiplier > 1 ? 26 : 19);
  if (sfxReady('die', 0.05)) sound.die();
  for (let i = 0; i < enemy.xp; i++) {
    game.pools.shards.push(makeShard(enemy.x, enemy.y, game.rng));
  }
  if (enemy.type === 'splitter') {
    for (let i = 0; i < 3; i++) {
      const dart = makeHostile('dart', enemy.x, enemy.y, game.wave, game.rng);
      const a = (i / 3) * TAU + game.rng.range(0, 1);
      dart.x += Math.cos(a) * 14;
      dart.y += Math.sin(a) * 14;
      game.pools.enemies.push(dart);
    }
  }
  if (enemy.type === 'devourer') {
    game.shake = Math.max(game.shake, 16);
    if (game.wave >= FINAL_WAVE) {
      winGame();
    } else {
      floater(enemy.x, enemy.y - 30, 'DEVOURER DOWN', '#ff9ff0', 30);
    }
  }
};

game.onPlayerHit = (damage) => {
  const p = game.player;
  p.hull -= damage;
  p.invuln = 0.45;
  game.shake = Math.max(game.shake, 7);
  burst(p.x, p.y, '#ff5c5c', 10, 280, 0.45);
  sound.hurt();
  if (p.hull <= 0) {
    p.hull = 0;
    loseGame();
  }
};

game.onShardCollected = () => {
  const p = game.player;
  p.xp++;
  if (sfxReady('shard', 0.04)) sound.shard();
  if (p.xp >= p.xpNext && game.state === 'playing') levelUp();
};

game.onDevourerSpawn = (boss) => {
  const minions = game.pools.enemies.filter((e) => e.type !== 'devourer').length;
  if (minions >= 5) return;
  const minion = makeHostile('chaser', boss.x, boss.y, game.wave, game.rng);
  game.pools.enemies.push(minion);
  burst(boss.x, boss.y, '#c44dff', 6, 160, 0.35);
};

game.onDevourerFed = (boss, rock) => {
  burst(rock.x, rock.y, '#b46bff', 4, 120, 0.3);
  floater(boss.x, boss.y - boss.r - 14, 'FED +HP', '#d9b3ff', 15);
};

// --- run control --------------------------------------------------------------

function startRun() {
  resetEntityIds();
  game.pools = createPools();
  game.player = makePlayer();
  game.combo.reset();
  game.score = 0;
  game.kills = 0;
  game.time = 0;
  game.shake = 0;
  game.sfxT = {};
  // Opening drifters, so the first captures come quickly.
  for (let i = 0; i < 6; i++) {
    const pt = edgeSpawnPoint(game.rng, -30);
    const rock = makeRock(game.rng, clamp(pt.x, 40, WORLD_W - 40), clamp(pt.y, 40, WORLD_H - 40));
    game.pools.rocks.push(rock);
  }
  hud.hideOverlays();
  sound.unlock();
  sound.uiStart();
  startWave(1);
  game.state = 'playing';
}

function startWave(n) {
  game.wave = n;
  game.spawner = createSpawner(n, game.rng);
  game.wavePhase = 'active';
  hud.showBanner(n % 5 === 0 ? `WAVE ${n} — THE DEVOURER` : `WAVE ${n}`, game.time);
}

function levelUp() {
  const p = game.player;
  p.level++;
  p.xp -= p.xpNext;
  p.xpNext = 5 + p.level * 4;
  game.pendingChoices = rollUpgrades(game.rng, p, 3);
  sound.level();
  ringFx(p.x, p.y, 'rgba(103, 246, 255, 0.9)', 5, 0.5);
  if (game.demo) {
    game.autoPickT = 0.7;
    game.state = 'upgrade';
    hud.showUpgrades(game.pendingChoices, p, chooseUpgrade);
  } else {
    game.state = 'upgrade';
    hud.showUpgrades(game.pendingChoices, p, chooseUpgrade);
  }
}

function chooseUpgrade(choice) {
  if (game.state !== 'upgrade' || !game.pendingChoices) return;
  choice.apply(game.player);
  floater(game.player.x, game.player.y - 40, choice.name.toUpperCase(), '#67f6ff', 22);
  game.pendingChoices = null;
  hud.hideOverlays();
  game.state = 'playing';
}

function winGame() {
  if (game.state !== 'playing') return;
  game.score += Math.round(game.player.hull) * 10; // hull bonus
  game.state = 'won';
  sound.win();
  burst(game.player.x, game.player.y, '#ffd34d', 46, 420, 0.9);
  ringFx(game.player.x, game.player.y, 'rgba(255, 210, 120, 0.95)', 6, 0.8);
  hud.showEnd(true, game);
}

function loseGame() {
  if (game.state !== 'playing') return;
  game.state = 'lost';
  sound.lose();
  burst(game.player.x, game.player.y, '#ff8a3c', 40, 380, 0.8);
  game.shake = 18;
  hud.showEnd(false, game);
}

window.addEventListener('keydown', (event) => {
  if (game.state !== 'upgrade' || !game.pendingChoices) return;
  const idx = ['Digit1', 'Digit2', 'Digit3'].indexOf(event.code);
  if (idx >= 0 && game.pendingChoices[idx]) chooseUpgrade(game.pendingChoices[idx]);
});

// --- demo autopilot -------------------------------------------------------------

function nearestOf(list, x, y, filter) {
  let best = null;
  let bestD = Infinity;
  for (const item of list) {
    if (filter && !filter(item)) continue;
    const d = distance(x, y, item.x, item.y);
    if (d < bestD) {
      bestD = d;
      best = item;
    }
  }
  return best ? { item: best, dist: bestD } : null;
}

function autopilot(dt) {
  const p = game.player;
  const intent = { mx: 0, my: 0 };
  const orbit = orbitingRocks(game).length;
  // Pick a goal: fill the orbit first, then vacuum shards, then hold center.
  let goal = null;
  if (orbit < p.orbitCap) goal = nearestOf(game.pools.rocks, p.x, p.y, (r) => r.mode === 'drift');
  if (!goal) goal = nearestOf(game.pools.shards, p.x, p.y);
  let gx = WORLD_W / 2;
  let gy = WORLD_H / 2;
  if (goal) {
    gx = goal.item.x;
    gy = goal.item.y;
  }
  let mx = gx - p.x;
  let my = gy - p.y;
  // Flee anything close enough to bite.
  const threat = nearestOf(game.pools.enemies, p.x, p.y);
  if (threat && threat.dist < 165) {
    mx += (p.x - threat.item.x) * 2.4;
    my += (p.y - threat.item.y) * 2.4;
  }
  const len = Math.hypot(mx, my) || 1;
  intent.mx = clamp(mx / len, -1, 1);
  intent.my = clamp(my / len, -1, 1);
  // Aim and fire discipline: lead the target by the rock's flight time.
  if (threat) {
    const lead = threat.dist / 980;
    game.aimX = threat.item.x + threat.item.vx * lead;
    game.aimY = threat.item.y + threat.item.vy * lead;
  }
  game.autoFlingT -= dt;
  if (orbit >= 2 && threat && threat.dist < 430 && game.autoFlingT <= 0) {
    flingRock(game, game.aimX, game.aimY);
    game.autoFlingT = 0.65;
  }
  const nearCount = game.pools.enemies.filter((e) => distance(p.x, p.y, e.x, e.y) < 300).length;
  if (orbit >= 4 && p.novaCd <= 0 && nearCount >= 2) novaBlast(game);
  return intent;
}

// --- the step -------------------------------------------------------------------

function handleActions() {
  for (const action of input.drainActions()) {
    if (action === 'mute') {
      sound.unlock();
      hud.setMuted(sound.toggleMute());
      continue;
    }
    if (game.state === 'title' && action === 'start') {
      startRun();
    } else if (game.state === 'playing') {
      if (action === 'fling' && !game.demo) flingRock(game, game.aimX, game.aimY);
      else if (action === 'nova' && !game.demo) novaBlast(game);
      else if (action === 'pause') {
        game.state = 'paused';
        hud.showOverlay('pause');
      }
    } else if (game.state === 'paused' && action === 'pause') {
      game.state = 'playing';
      hud.hideOverlays();
    } else if ((game.state === 'won' || game.state === 'lost' || game.state === 'paused') && action === 'restart') {
      startRun();
    }
  }
}

function step(dt) {
  if (game.frozen) return;
  handleActions();
  if (game.state === 'paused' || game.state === 'upgrade') {
    if (game.state === 'upgrade' && game.demo && game.pendingChoices) {
      game.autoPickT -= dt;
      if (game.autoPickT <= 0) chooseUpgrade(game.pendingChoices[0]);
    }
    return;
  }
  game.time += dt;
  game.shake = Math.max(0, game.shake - dt * 30);
  if (game.state === 'title' || game.state === 'won' || game.state === 'lost') {
    stepEffects(game, dt);
    return;
  }
  // playing
  if (!game.demo) {
    game.aimX = input.mouse.x;
    game.aimY = input.mouse.y;
  }
  const intent = game.demo ? autopilot(dt) : normalizeMove(input.moveVector());
  stepPlayer(game, intent, dt);

  // Spawn the wave, one hostile at a time.
  if (game.spawner && game.wavePhase === 'active') {
    const spawned = game.spawner.next(game, dt);
    if (spawned) {
      spawned.bornAt = game.time;
      game.pools.enemies.push(spawned);
      if (spawned.type === 'devourer') {
        sound.bossRoar();
        game.shake = Math.max(game.shake, 8);
        hud.showBanner('THE DEVOURER AWAKENS', game.time, 1.8);
      }
    }
  }
  // Ambient asteroids drift in so there is always something to capture.
  game.rockSpawnT -= dt;
  if (game.rockSpawnT <= 0) {
    game.rockSpawnT = 0.8;
    if (game.pools.rocks.length < AMBIENT_ROCK_TARGET) {
      const pt = edgeSpawnPoint(game.rng, 24);
      const rock = makeRock(game.rng, pt.x, pt.y);
      const a = angleTo(rock.x, rock.y, WORLD_W / 2 + game.rng.range(-160, 160), WORLD_H / 2 + game.rng.range(-120, 120));
      const v = game.rng.range(24, 52);
      rock.vx = Math.cos(a) * v;
      rock.vy = Math.sin(a) * v;
      game.pools.rocks.push(rock);
    }
  }

  stepRocks(game, dt);
  stepEnemies(game, dt);
  stepShards(game, dt);
  collide(game);
  stepEffects(game, dt);

  // Wave clear: everything spawned and everything dead.
  if (game.wavePhase === 'active' && game.spawner && game.spawner.done() && game.pools.enemies.length === 0 && game.state === 'playing') {
    game.wavePhase = 'clear';
    game.clearT = 1.7;
    const bonus = 100 * game.wave;
    game.score += bonus;
    floater(WORLD_W / 2, WORLD_H / 2 - 60, `WAVE CLEAR +${bonus}`, '#67f6ff', 30);
  } else if (game.wavePhase === 'clear') {
    game.clearT -= dt;
    if (game.clearT <= 0 && game.state === 'playing') startWave(game.wave + 1);
  }
}

function normalizeMove({ mx, my }) {
  const len = Math.hypot(mx, my);
  if (len <= 1) return { mx, my };
  return { mx: mx / len, my: my / len };
}

// --- main loop --------------------------------------------------------------------

let lastStamp = performance.now();
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastStamp) / 1000);
  lastStamp = now;
  accumulator += dt;
  while (accumulator >= STEP) {
    step(STEP);
    accumulator -= STEP;
  }
  renderer.draw(game);
  hud.update(game);
}

// --- screenshot scenes ------------------------------------------------------------
// Frozen, hand-posed moments of real gameplay, rendered by this same code.
// The driver loads ?shot=<name>, waits for the scene to settle, and captures.

function poseOrbit(count) {
  const p = game.player;
  for (let i = 0; i < count; i++) {
    const rock = makeRock(game.rng, 0, 0);
    rock.mode = 'orbit';
    rock.orbitRadius = 56 + (i % 3) * 17;
    rock.orbitAngle = (i / count) * TAU + 0.55;
    rock.orbitTime = 3 - i * 0.35;
    rock.x = p.x + Math.cos(rock.orbitAngle) * rock.orbitRadius;
    rock.y = p.y + Math.sin(rock.orbitAngle) * rock.orbitRadius;
    game.pools.rocks.push(rock);
  }
}

function poseFlungRock(x, y, targetX, targetY) {
  const rock = makeRock(game.rng, x, y);
  rock.mode = 'flung';
  const a = angleTo(x, y, targetX, targetY);
  rock.vx = Math.cos(a) * 980;
  rock.vy = Math.sin(a) * 980;
  for (let i = 12; i >= 1; i--) {
    rock.trail.push({ x: x - Math.cos(a) * i * 13, y: y - Math.sin(a) * i * 13 });
  }
  game.pools.rocks.push(rock);
  return rock;
}

function setupShotPlay() {
  startRun();
  hud.hideBanner();
  const p = game.player;
  game.wave = 3;
  game.spawner = createSpawner(3, game.rng);
  game.spawner.remaining = 0;
  p.x = 430;
  p.y = 400;
  p.hull = 76;
  p.xp = 5;
  game.score = 1450;
  poseOrbit(5);
  game.pools.enemies.push(makeHostile('chaser', 770, 250, 3, game.rng));
  game.pools.enemies.push(makeHostile('chaser', 848, 448, 3, game.rng));
  game.pools.enemies.push(makeHostile('splitter', 688, 545, 3, game.rng));
  game.pools.enemies.push(makeHostile('dart', 612, 172, 3, game.rng));
  game.pools.enemies.push(makeHostile('dart', 908, 302, 3, game.rng));
  for (const [sx, sy] of [[560, 300], [598, 472], [516, 182], [982, 424], [736, 372]]) {
    game.pools.shards.push(makeShard(sx, sy, game.rng));
  }
  poseFlungRock(588, 332, 770, 250);
  burst(770, 250, '#ff4d6d', 7, 230, 0.6);
  game.combo.beginNova(0.02);
  game.combo.registerKill(0.06);
  game.combo.registerKill(0.1);
  game.aimX = 770;
  game.aimY = 250;
  game.frozen = true;
}

function setupShotBoss() {
  startRun();
  hud.hideBanner();
  const p = game.player;
  game.wave = 5;
  game.spawner = createSpawner(5, game.rng);
  game.spawner.remaining = 0;
  p.x = 395;
  p.y = 385;
  p.hull = 64;
  p.xp = 3;
  game.score = 3900;
  poseOrbit(4);
  const boss = makeHostile('devourer', 868, 318, 5, game.rng);
  boss.hp = 33;
  game.pools.enemies.push(boss);
  game.pools.enemies.push(makeHostile('chaser', 692, 168, 5, game.rng));
  game.pools.enemies.push(makeHostile('dart', 978, 472, 5, game.rng));
  poseFlungRock(520, 360, 868, 318);
  burst(868, 318, '#c44dff', 9, 260, 0.6);
  game.aimX = 868;
  game.aimY = 318;
  game.frozen = true;
}

function setupShotOver() {
  startRun();
  hud.hideBanner();
  game.score = 12850;
  game.kills = 132;
  game.wave = 10;
  game.time = 402.5;
  game.state = 'won';
  burst(game.player.x, game.player.y, '#ffd34d', 30, 380, 0.9);
  ringFx(game.player.x, game.player.y, 'rgba(255, 210, 120, 0.95)', 6, 0.8);
  hud.showEnd(true, game);
  game.frozen = true;
}

// --- boot ---------------------------------------------------------------------------

if (shotMode === 'play') setupShotPlay();
else if (shotMode === 'boss') setupShotBoss();
else if (shotMode === 'over') setupShotOver();
else if (demoMode) startRun();
else hud.showOverlay('title');

// A small handle for automated play-tests: read state, start a run, wound the
// star. It changes nothing for a human player.
window.__starforge = { game, startRun, version: 'starforge-v2' };

requestAnimationFrame(frame);
