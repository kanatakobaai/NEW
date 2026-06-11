// Pooled particle system. Pre-allocates particles to avoid GC churn at 60fps.
import { TAU, rand } from './math.js';

export class ParticleSystem {
  constructor(max = 1200) {
    this.max = max;
    this.pool = new Array(max);
    for (let i = 0; i < max; i++) {
      this.pool[i] = {
        active: false, x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 1, size: 1, drag: 0.9,
        r: 255, g: 255, b: 255, glow: true,
      };
    }
    this.cursor = 0;
  }

  _next() {
    // Round-robin search for a free slot; reuse oldest if all busy.
    for (let i = 0; i < this.max; i++) {
      const idx = (this.cursor + i) % this.max;
      if (!this.pool[idx].active) {
        this.cursor = (idx + 1) % this.max;
        return this.pool[idx];
      }
    }
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    return p;
  }

  // Emit a radial burst of particles at (x, y).
  burst(x, y, count, { r = 255, g = 255, b = 255, speed = 220, spread = 1, size = 3, life = 0.6 } = {}) {
    for (let i = 0; i < count; i++) {
      const p = this._next();
      const a = rand(0, TAU);
      const s = rand(speed * 0.3, speed) * spread;
      p.active = true;
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.maxLife = p.life = rand(life * 0.6, life);
      p.size = rand(size * 0.6, size);
      p.drag = 0.90;
      p.r = r; p.g = g; p.b = b;
      p.glow = true;
    }
  }

  // Emit a directional spark stream (used for trails / deflections).
  spark(x, y, angle, count, opts = {}) {
    const { r = 255, g = 255, b = 255, speed = 180, size = 2.5, life = 0.4, cone = 0.7 } = opts;
    for (let i = 0; i < count; i++) {
      const p = this._next();
      const a = angle + rand(-cone, cone);
      const s = rand(speed * 0.4, speed);
      p.active = true;
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.maxLife = p.life = rand(life * 0.5, life);
      p.size = rand(size * 0.5, size);
      p.drag = 0.86;
      p.r = r; p.g = g; p.b = b;
      p.glow = true;
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d;
      p.vy *= d;
    }
  }

  render(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.max; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      const t = p.life / p.maxLife;
      const alpha = t * t;
      const sz = p.size * (0.4 + t * 0.6);
      ctx.beginPath();
      ctx.fillStyle = `rgba(${p.r|0},${p.g|0},${p.b|0},${alpha})`;
      ctx.arc(p.x, p.y, sz, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  clear() {
    for (let i = 0; i < this.max; i++) this.pool[i].active = false;
  }
}
