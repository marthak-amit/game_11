// Fully procedural audio (WebAudio) - zero asset downloads, tiny APK.
import { store } from './storage.js';

const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

class Audio_ {
  constructor() { this.ctx = null; this.master = null; this.musicOn = false; this.step = 0; this.timer = null; this.intensity = 0; }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);
      this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  tone(freq, dur, type = 'sine', vol = 0.2, slideTo = 0, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, vol = 0.3, hp = 400) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur);
  }

  sfxOn() { return store().sfx; }
  move() { if (this.sfxOn()) this.tone(300, 0.07, 'triangle', 0.08, 520); }
  shard(combo = 0) { if (this.sfxOn()) this.tone(mtof(72 + PENTA[Math.min(combo, 9)]), 0.18, 'sine', 0.18); }
  graze(combo = 0) {
    if (!this.sfxOn()) return;
    const n = 76 + PENTA[Math.min(combo, 9)];
    this.tone(mtof(n), 0.12, 'square', 0.07); this.tone(mtof(n + 12), 0.22, 'sine', 0.1, 0, 0.05);
  }
  crash() { if (this.sfxOn()) { this.noise(0.7, 0.5, 120); this.tone(180, 0.6, 'sawtooth', 0.25, 30); } }
  phase() { if (this.sfxOn()) { this.tone(220, 0.5, 'sawtooth', 0.12, 1200); this.noise(0.4, 0.15, 2000); } }
  phaseEnd() { if (this.sfxOn()) this.tone(900, 0.3, 'triangle', 0.1, 200); }
  boost() { if (this.sfxOn()) this.tone(400, 0.35, 'square', 0.08, 1400); }
  ui() { if (this.sfxOn()) this.tone(660, 0.08, 'triangle', 0.1, 880); }
  reward() { if (this.sfxOn()) [0, 4, 7, 12].forEach((s, i) => this.tone(mtof(72 + s), 0.25, 'triangle', 0.14, 0, i * 0.08)); }
  zone() { if (this.sfxOn()) [0, 7, 12, 19].forEach((s, i) => this.tone(mtof(60 + s), 0.5, 'sine', 0.12, 0, i * 0.07)); }

  // --- Music: generative arpeggio + bass that intensifies with game speed
  startMusic() {
    if (!this.ctx || this.musicOn || !store().music) return;
    this.musicOn = true; this.step = 0; this.nextT = this.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.schedule(), 40);
  }
  stopMusic() { this.musicOn = false; clearInterval(this.timer); }
  schedule() {
    if (!this.ctx) return;
    const spb = 60 / (112 + this.intensity * 30) / 4; // 16th note
    while (this.nextT < this.ctx.currentTime + 0.15) {
      const i = this.step, w = this.nextT - this.ctx.currentTime;
      const root = [45, 45, 41, 43][Math.floor(i / 16) % 4];
      if (i % 4 === 0) this.tone(mtof(root - 12 + 12), 0.2, 'sine', 0.22, mtof(root - 12) , w);
      if (i % 2 === 0 || this.intensity > 0.5) {
        const n = root + 24 + PENTA[(i * 3 + Math.floor(i / 8)) % 7];
        this.tone(mtof(n), 0.14, 'triangle', 0.045 + this.intensity * 0.03, 0, w);
      }
      if (i % 8 === 4 && this.intensity > 0.25) this.noise(0.05, 0.05, 6000);
      this.nextT += spb; this.step++;
    }
  }
}
export const Sfx = new Audio_();
export const haptic = (ms) => { if (store().haptics && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } };
