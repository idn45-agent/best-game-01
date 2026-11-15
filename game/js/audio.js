// audio.js — every sound in STARFORGE is synthesised with WebAudio:
// short oscillator blips with pitch envelopes for actions, and filtered
// noise bursts for explosions. No audio files are loaded, ever.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
  }

  function tone(freqFrom, freqTo, seconds, type, volume, delay = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqFrom, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), t0 + seconds);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.02);
  }

  function noise(seconds, volume, cutoff) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
  }

  return {
    unlock,
    get muted() { return muted; },
    toggleMute() { muted = !muted; return muted; },
    fling() { tone(880, 220, 0.14, 'square', 0.16); },
    throwRock() { tone(520, 180, 0.10, 'sawtooth', 0.10); },
    hit() { tone(300, 90, 0.08, 'triangle', 0.22); noise(0.06, 0.10, 2400); },
    explode() { noise(0.32, 0.30, 900); tone(140, 40, 0.30, 'sine', 0.26); },
    pickup() { tone(1180, 1560, 0.07, 'sine', 0.10); },
    capture() { tone(340, 690, 0.12, 'sine', 0.12); },
    levelup() {
      tone(523, 523, 0.10, 'triangle', 0.18);
      tone(659, 659, 0.10, 'triangle', 0.18, 0.09);
      tone(784, 784, 0.16, 'triangle', 0.20, 0.18);
      tone(1046, 1046, 0.22, 'triangle', 0.20, 0.27);
    },
    nova() { noise(0.55, 0.34, 1600); tone(90, 420, 0.5, 'sawtooth', 0.16); },
    hurt() { tone(220, 55, 0.28, 'sawtooth', 0.28); noise(0.2, 0.18, 700); },
    roar() { tone(70, 38, 0.9, 'sawtooth', 0.30); tone(96, 44, 0.9, 'square', 0.14, 0.08); },
    win() {
      tone(392, 392, 0.14, 'triangle', 0.2);
      tone(523, 523, 0.14, 'triangle', 0.2, 0.13);
      tone(659, 659, 0.14, 'triangle', 0.2, 0.26);
      tone(784, 784, 0.34, 'triangle', 0.24, 0.39);
    },
  };
}
