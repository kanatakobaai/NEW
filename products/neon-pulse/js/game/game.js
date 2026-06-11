// Core game logic for NEON PULSE.
// Rotate a shield arc around the central core to deflect incoming shards.
import { TAU, clamp, lerp, rand, angleDelta, normAngle, easeOutCubic } from '../engine/math.js';
import { ParticleSystem } from '../engine/particles.js';
import { Hazard } from './hazard.js';

const PALETTES = [
  [255, 60, 120],  // pink
  [80, 200, 255],  // cyan
  [180, 120, 255], // purple
  [120, 255, 160], // green
  [255, 200, 80],  // amber
];

export const State = { MENU: 'menu', PLAYING: 'playing', DEAD: 'dead' };

export class Game {
  constructor(audio, input) {
    this.audio = audio;
    this.input = input;
    this.particles = new ParticleSystem(1400);
    this.hazards = [];
    for (let i = 0; i < 64; i++) this.hazards.push(new Hazard());

    this.state = State.MENU;
    this.w = 0; this.h = 0;
    this.cx = 0; this.cy = 0;
    this.coreR = 46;
    this.shieldR = 92;        // radius of the shield arc
    this.shieldArc = 1.05;    // half-width of the arc in radians
    this.shieldAngle = -Math.PI / 2;

    this.score = 0;
    this.best = Number(localStorage.getItem('neonpulse_best') || 0);
    this.combo = 0;
    this.bestCombo = 0;

    this.timeScale = 1;       // for slow-mo juice
    this.shake = 0;
    this.spawnTimer = 0;
    this.spawnInterval = 1.4;
    this.elapsed = 0;
    this.flash = 0;
    this.corePulse = 0;
    this.onGameOver = null;
  }

  resize(w, h) {
    this.w = w; this.h = h;
    this.cx = w / 2; this.cy = h / 2;
    const base = Math.min(w, h);
    this.coreR = base * 0.085;
    this.shieldR = base * 0.20;
    this.input.setCenter(this.cx, this.cy);
  }

  start() {
    this.state = State.PLAYING;
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.elapsed = 0;
    this.spawnTimer = 0;
    this.spawnInterval = 1.4;
    this.timeScale = 1;
    this.shake = 0;
    this.particles.clear();
    for (const hz of this.hazards) hz.active = false;
    this.audio.resume();
  }

  _spawnHazard() {
    const hz = this.hazards.find((h) => !h.active);
    if (!hz) return;
    const angle = rand(0, TAU);
    const dist = Math.max(this.w, this.h) * 0.62 + 40;
    // difficulty curve: speed ramps with elapsed time
    const speed = 150 + Math.min(this.elapsed * 7, 360) + rand(-20, 40);
    const palette = PALETTES[(Math.random() * PALETTES.length) | 0];
    hz.spawn(angle, dist, speed, palette);
    this.audio.spawn();
  }

  _difficulty(dt) {
    this.elapsed += dt;
    // Spawn faster over time, floor at 0.42s.
    this.spawnInterval = Math.max(0.42, 1.4 - this.elapsed * 0.012);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.spawnInterval * rand(0.8, 1.2);
      this._spawnHazard();
      // occasional double spawn at higher difficulty
      if (this.elapsed > 25 && Math.random() < 0.3) this._spawnHazard();
    }
  }

  _gameOver(x, y, hz) {
    this.state = State.DEAD;
    this.audio.hit();
    this.shake = 28;
    this.flash = 1;
    this.particles.burst(x, y, 90, { r: hz.r, g: hz.g, b: hz.b, speed: 460, size: 5, life: 1.0 });
    this.particles.burst(this.cx, this.cy, 60, { r: 255, g: 255, b: 255, speed: 380, size: 4, life: 0.9 });
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem('neonpulse_best', String(this.best));
    }
    if (this.onGameOver) this.onGameOver();
  }

  update(rawDt) {
    // Smoothly recover from slow-mo.
    this.timeScale = lerp(this.timeScale, 1, 0.06);
    const dt = rawDt * this.timeScale;

    // Shield follows pointer when held; otherwise eases toward last pointer angle.
    const target = this.input.angle;
    const d = angleDelta(this.shieldAngle, target);
    this.shieldAngle = normAngle(this.shieldAngle + d * clamp(rawDt * 16, 0, 1));

    this.shake *= Math.pow(0.86, rawDt * 60);
    this.flash *= Math.pow(0.88, rawDt * 60);
    this.corePulse += rawDt * 4;

    if (this.state === State.PLAYING) this._difficulty(dt);

    // Hazards
    for (const hz of this.hazards) {
      if (!hz.active) continue;
      hz.update(dt);
      if (hz.deflected) continue;

      // Near-miss / slow-mo trigger zone
      if (!hz.flashedNearMiss && hz.dist < this.shieldR + 60 && hz.dist > this.shieldR) {
        const within = Math.abs(angleDelta(hz.angle, this.shieldAngle)) < this.shieldArc + 0.25;
        if (!within) {
          hz.flashedNearMiss = true;
          this.timeScale = 0.45;
          this.audio.nearMiss();
        }
      }

      // Deflection check at shield radius
      if (hz.dist <= this.shieldR + hz.size * 0.5 && hz.dist >= this.shieldR - hz.size * 0.6) {
        const within = Math.abs(angleDelta(hz.angle, this.shieldAngle)) <= this.shieldArc;
        if (within && this.state === State.PLAYING) {
          this._deflect(hz);
          continue;
        }
      }

      // Reached the core -> game over
      if (hz.dist <= this.coreR + hz.size * 0.4 && this.state === State.PLAYING) {
        const [x, y] = hz.pos(this.cx, this.cy);
        hz.active = false;
        this._gameOver(x, y, hz);
      }
    }

    this.particles.update(dt);
  }

  _deflect(hz) {
    hz.deflected = true;
    hz.speed *= 1.6;
    this.combo += 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const gain = 1 + Math.floor(this.combo / 5);
    this.score += gain;
    this.shake = Math.min(this.shake + 6, 16);
    this.corePulse = 0;
    const [x, y] = hz.pos(this.cx, this.cy);
    const out = hz.angle;
    this.particles.spark(x, y, out, 22, { r: hz.r, g: hz.g, b: hz.b, speed: 320, life: 0.5, cone: 1.0 });
    this.particles.burst(x, y, 8, { r: 255, g: 255, b: 255, speed: 200, size: 3, life: 0.35 });
    this.audio.deflect(this.combo);
  }

  // ---- Rendering ----
  render(ctx) {
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;

    // background gradient
    ctx.save();
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, this.w, this.h);
    // subtle radial vignette glow
    const g = ctx.createRadialGradient(this.cx, this.cy, this.coreR, this.cx, this.cy, Math.max(this.w, this.h) * 0.7);
    g.addColorStop(0, 'rgba(30,40,90,0.35)');
    g.addColorStop(1, 'rgba(2,3,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();

    ctx.save();
    ctx.translate(sx, sy);

    this._renderCore(ctx);
    this._renderShield(ctx);
    for (const hz of this.hazards) hz.render(ctx, this.cx, this.cy);
    this.particles.render(ctx);

    ctx.restore();

    // white flash on death
    if (this.flash > 0.01) {
      ctx.save();
      ctx.globalAlpha = clamp(this.flash, 0, 1) * 0.7;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
    }
  }

  _renderCore(ctx) {
    const pulse = Math.max(0, 1 - this.corePulse) * 10;
    const r = this.coreR + Math.sin(this.corePulse * 0.5) * 2 + pulse;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = '#4cf';
    ctx.shadowBlur = 40;
    const grad = ctx.createRadialGradient(this.cx, this.cy, r * 0.2, this.cx, this.cy, r);
    grad.addColorStop(0, 'rgba(180,230,255,0.95)');
    grad.addColorStop(0.7, 'rgba(60,160,255,0.6)');
    grad.addColorStop(1, 'rgba(40,90,220,0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  _renderShield(ctx) {
    const a0 = this.shieldAngle - this.shieldArc;
    const a1 = this.shieldAngle + this.shieldArc;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.shadowColor = '#9ff';
    ctx.shadowBlur = 24;
    // outer glow stroke
    ctx.strokeStyle = 'rgba(140,255,255,0.85)';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.shieldR, a0, a1);
    ctx.stroke();
    // bright inner stroke
    ctx.shadowBlur = 8;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.shieldR, a0, a1);
    ctx.stroke();
    ctx.restore();
  }
}
