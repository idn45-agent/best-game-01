// audio.js — every sound in STARFORGE is synthesised with WebAudio.
// No audio files, no network: oscillators for tones, a shared noise buffer
// for bursts, and short gain envelopes to keep everything punchy but clean.
// The context is created lazily on the first user gesture (browser policy),
// and sfx() quietly does nothing until then — demo and screenshot modes
// therefore stay silent without special cases.

let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;

// initAudio() — build the context and master chain. Safe to call often.
export function initAudio() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.42;
  master.connect(ctx.destination);
  const len = Math.floor(ctx.sampleRate * 0.6);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
}

// resumeAudio() — un-suspend after a gesture; called on start/restart.
export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

// toggleMute() — the M key. Returns the new muted state.
export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.42;
  return muted;
}

export function isMuted() {
  return muted;
}

// tone(freq, dur, type, vol, slideTo, delay) — one enveloped oscillator.
function tone(freq, dur, type, vol, slideTo = 0, delay = 0) {
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

// noise(dur, vol, freqFrom, freqTo, delay) — one enveloped noise burst
// through a sweeping lowpass: the base of explosions and whooshes.
function noise(dur, vol, freqFrom, freqTo, delay = 0) {
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(freqFrom, t0);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, freqTo), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

// sfx(name) — the game's sound vocabulary. Names: capture, fling, boom,
// bigboom, nova, levelup, hurt, shard, ui, bosshit, dash, split, wave.
export function sfx(name) {
  if (!ctx || muted || ctx.state !== 'running') return;
  switch (name) {
    case 'capture':
      tone(520, 0.14, 'sine', 0.16, 940);
      tone(1040, 0.1, 'triangle', 0.07, 1560, 0.03);
      break;
    case 'fling':
      noise(0.18, 0.2, 2600, 300);
      tone(300, 0.16, 'sawtooth', 0.05, 90);
      break;
    case 'boom':
      noise(0.28, 0.3, 1400, 120);
      tone(140, 0.22, 'sine', 0.22, 45);
      break;
    case 'bigboom':
      noise(0.55, 0.42, 1800, 60);
      tone(110, 0.5, 'sine', 0.3, 32);
      tone(64, 0.6, 'triangle', 0.2, 28, 0.04);
      break;
    case 'nova':
      tone(180, 0.5, 'sawtooth', 0.16, 1400);
      noise(0.5, 0.3, 3200, 200);
      tone(90, 0.55, 'sine', 0.28, 30, 0.02);
      break;
    case 'levelup':
      tone(523, 0.12, 'triangle', 0.16);
      tone(659, 0.12, 'triangle', 0.16, 0, 0.09);
      tone(784, 0.14, 'triangle', 0.16, 0, 0.18);
      tone(1046, 0.26, 'triangle', 0.18, 0, 0.27);
      break;
    case 'hurt':
      tone(220, 0.2, 'square', 0.14, 70);
      noise(0.16, 0.18, 900, 200);
      break;
    case 'shard':
      tone(1320, 0.07, 'sine', 0.08, 1760);
      break;
    case 'ui':
      tone(740, 0.07, 'triangle', 0.1, 990);
      break;
    case 'bosshit':
      tone(180, 0.1, 'square', 0.1, 120);
      noise(0.1, 0.12, 1200, 400);
      break;
    case 'dash':
      noise(0.22, 0.13, 1800, 500);
      break;
    case 'split':
      tone(420, 0.16, 'triangle', 0.13, 130);
      noise(0.14, 0.12, 1000, 300);
      break;
    case 'wave':
      tone(392, 0.14, 'triangle', 0.13);
      tone(587, 0.2, 'triangle', 0.13, 0, 0.1);
      break;
    default:
      break;
  }
}
