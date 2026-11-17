// audio.js — Synthesised sound for STARFORGE.
//
// No audio files: every effect is built from WebAudio oscillators and
// filtered noise at play time, and the ambient music is a slow pad of
// detuned oscillators. The engine starts on the first user gesture
// (browsers block audio before interaction) and stays silent until then.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.muted = false;
    this.musicStarted = false;
  }

  // Call from a user gesture (click / keydown). Safe to call repeatedly.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.12;
    this.musicGain.connect(this.master);
    this.startAmbientPad();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  // A short oscillator blip with an exponential decay envelope.
  blip(freqFrom, freqTo, duration, type, volume) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freqFrom, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), t + duration);
    gain.gain.setValueAtTime(volume || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  // Filtered noise burst (explosions, nova, hits).
  noise(duration, filterFreq, volume, type) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume || 0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + duration);
  }

  shoot() { this.blip(720, 240, 0.09, 'square', 0.10); }
  throwRock() { this.blip(300, 140, 0.12, 'triangle', 0.16); }
  hit() { this.blip(180, 90, 0.08, 'sawtooth', 0.12); }
  enemyDie() { this.noise(0.22, 900, 0.22); this.blip(320, 60, 0.18, 'sawtooth', 0.12); }
  pickup() { this.blip(880, 1320, 0.10, 'sine', 0.12); }
  hurt() { this.noise(0.25, 500, 0.30); this.blip(140, 50, 0.25, 'sawtooth', 0.20); }
  nova() {
    this.noise(0.7, 1400, 0.4, 'lowpass');
    this.blip(90, 28, 0.6, 'sine', 0.4);
    this.blip(1200, 200, 0.3, 'triangle', 0.12);
  }
  levelUp() {
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => this.blip(f, f, 0.16, 'triangle', 0.16), i * 70);
    });
  }
  waveClear() {
    [392, 523, 659].forEach((f, i) => {
      setTimeout(() => this.blip(f, f, 0.2, 'sine', 0.15), i * 90);
    });
  }
  bossRoar() {
    this.noise(0.9, 300, 0.4, 'lowpass');
    this.blip(70, 38, 0.9, 'sawtooth', 0.3);
  }
  bossPhase() {
    this.noise(0.6, 2000, 0.3, 'highpass');
    this.blip(200, 1200, 0.5, 'sawtooth', 0.15);
  }
  gameOver() {
    [392, 330, 262, 196].forEach((f, i) => {
      setTimeout(() => this.blip(f, f * 0.94, 0.3, 'triangle', 0.18), i * 160);
    });
  }
  victory() {
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => {
      setTimeout(() => this.blip(f, f, 0.25, 'triangle', 0.16), i * 110);
    });
  }

  // Slow ambient pad: two detuned triangle oscillators through a lowpass,
  // drifting between two chords. Runs quietly under everything.
  startAmbientPad() {
    if (!this.ctx || this.musicStarted) return;
    this.musicStarted = true;
    const chords = [[110, 164.8, 220], [98, 146.8, 196]];
    let chordIndex = 0;
    const oscs = [];
    const playChord = () => {
      for (const o of oscs) { try { o.stop(); } catch (e) { /* already stopped */ } }
      oscs.length = 0;
      const notes = chords[chordIndex % chords.length];
      chordIndex++;
      for (const freq of notes) {
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        osc.detune.value = (Math.random() - 0.5) * 8;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.33, this.ctx.currentTime + 2.5);
        g.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 9);
        osc.connect(g);
        g.connect(this.musicGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 9.2);
        oscs.push(osc);
      }
    };
    playChord();
    this.padTimer = setInterval(() => { if (!this.muted) playChord(); }, 8000);
  }
}
