// audio.js — every sound in STARFORGE is synthesized live with WebAudio:
// oscillators and shaped noise, no audio files. The context is created lazily
// on the first user gesture (browsers refuse it sooner), and M mutes the
// master gain. Each method is one game event: capture snap, fling whoosh,
// nova boom, chain chime, hurt thud, level-up arpeggio…

export function createSoundBank() {
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
    master.gain.value = muted ? 0 : 0.42;
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
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.02);
  }

  function noise(seconds, volume, filterFreq, delay = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  return {
    unlock,
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.42;
      return muted;
    },
    uiStart() { tone(523, 523, 0.09, 'sine', 0.25); tone(784, 784, 0.14, 'sine', 0.25, 0.08); },
    capture() { tone(620, 990, 0.09, 'sine', 0.18); },
    fling() { noise(0.16, 0.2, 2400); tone(340, 130, 0.14, 'square', 0.06); },
    hit() { noise(0.07, 0.22, 1500); tone(190, 90, 0.08, 'triangle', 0.2); },
    die() { tone(420, 70, 0.22, 'square', 0.16); noise(0.18, 0.16, 900); },
    chain(step) { tone(660 + step * 90, 660 + step * 90, 0.1, 'sine', 0.2); },
    nova() {
      tone(140, 38, 0.5, 'sawtooth', 0.3);
      noise(0.5, 0.32, 700);
      tone(880, 1760, 0.3, 'sine', 0.1, 0.03);
    },
    hurt() { tone(130, 65, 0.18, 'sawtooth', 0.28); noise(0.12, 0.2, 500); },
    shard() { tone(1180, 1560, 0.06, 'sine', 0.07); },
    level() {
      tone(523, 523, 0.1, 'triangle', 0.22);
      tone(659, 659, 0.1, 'triangle', 0.22, 0.09);
      tone(784, 784, 0.1, 'triangle', 0.22, 0.18);
      tone(1046, 1046, 0.2, 'triangle', 0.24, 0.27);
    },
    bossRoar() { tone(82, 55, 0.7, 'sawtooth', 0.3); tone(110, 73, 0.7, 'square', 0.14, 0.05); },
    win() {
      tone(523, 523, 0.14, 'triangle', 0.24);
      tone(659, 659, 0.14, 'triangle', 0.24, 0.13);
      tone(784, 784, 0.14, 'triangle', 0.24, 0.26);
      tone(1046, 1046, 0.4, 'triangle', 0.26, 0.39);
    },
    lose() { tone(330, 55, 0.9, 'sawtooth', 0.24); noise(0.7, 0.14, 300, 0.1); },
  };
}
