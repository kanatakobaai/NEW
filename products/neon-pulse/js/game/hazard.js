// A neon shard that flies from the edge toward the core.
import { TAU } from '../engine/math.js';

export class Hazard {
  constructor() {
    this.reset();
  }

  reset() {
    this.active = false;
    this.angle = 0;      // angle of approach (where it sits around the core)
    this.dist = 0;       // distance from core center
    this.speed = 0;      // inward speed (px/s)
    this.spin = 0;
    this.rot = 0;
    this.size = 14;
    this.deflected = false;
    this.flashedNearMiss = false;
    // color (neon)
    this.r = 255; this.g = 60; this.b = 120;
  }

  spawn(angle, dist, speed, palette) {
    this.reset();
    this.active = true;
    this.angle = angle;
    this.dist = dist;
    this.speed = speed;
    this.spin = (Math.random() - 0.5) * 6;
    this.size = 13 + Math.random() * 6;
    this.r = palette[0]; this.g = palette[1]; this.b = palette[2];
  }

  update(dt) {
    if (!this.active) return;
    if (this.deflected) {
      this.dist += this.speed * dt; // fly back out
      this.rot += this.spin * 2 * dt;
      if (this.dist > 2000) this.active = false;
    } else {
      this.dist -= this.speed * dt;
      this.rot += this.spin * dt;
    }
  }

  pos(cx, cy) {
    return [cx + Math.cos(this.angle) * this.dist, cy + Math.sin(this.angle) * this.dist];
  }

  render(ctx, cx, cy) {
    if (!this.active) return;
    const [x, y] = this.pos(cx, cy);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.rot);
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = `rgb(${this.r},${this.g},${this.b})`;
    ctx.shadowBlur = 18;
    ctx.fillStyle = `rgb(${this.r},${this.g},${this.b})`;
    // diamond shard
    const s = this.size;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.7, 0);
    ctx.lineTo(0, s);
    ctx.lineTo(-s * 0.7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
