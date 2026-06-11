// Procedural sound via Web Audio. No asset files needed.
// All sounds are synthesized so the game stays tiny and "technical".
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
  }

  // Must be called from a user gesture (mobile autoplay policy).
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _tone(freq, dur, { type = 'sine', vol = 0.5, slideTo = null, attack = 0.005 } = {}) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  deflect(combo = 0) {
    // Pitch rises with combo for a satisfying ramp.
    const base = 440 + Math.min(combo, 30) * 28;
    this._tone(base, 0.12, { type: 'triangle', vol: 0.5, slideTo: base * 1.5 });
  }

  spawn() {
    this._tone(180, 0.08, { type: 'sawtooth', vol: 0.12, slideTo: 120 });
  }

  nearMiss() {
    this._tone(900, 0.18, { type: 'sine', vol: 0.25, slideTo: 1500 });
  }

  hit() {
    // Game over thud + noise.
    this._tone(140, 0.5, { type: 'sawtooth', vol: 0.6, slideTo: 50 });
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.3, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const noise = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
    noise.buffer = buf;
    noise.connect(g).connect(this.master);
    noise.start(t0);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  }
}
