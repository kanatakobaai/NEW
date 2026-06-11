// Unified pointer input (touch + mouse). Reports the angle of the pointer
// relative to the screen center, which drives the shield rotation.
import { normAngle } from './math.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.active = false;
    this.angle = -Math.PI / 2; // start pointing up
    this.tapped = false;
    this._cx = 0;
    this._cy = 0;
    this._bind();
  }

  setCenter(cx, cy) { this._cx = cx; this._cy = cy; }

  _update(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (this.canvas.width / rect.width);
    const y = (clientY - rect.top) * (this.canvas.height / rect.height);
    this.angle = normAngle(Math.atan2(y - this._cy, x - this._cx));
  }

  _bind() {
    const opts = { passive: false };

    const down = (e) => {
      e.preventDefault();
      this.active = true;
      this.tapped = true;
      const t = e.touches ? e.touches[0] : e;
      this._update(t.clientX, t.clientY);
    };
    const move = (e) => {
      if (!this.active) return;
      e.preventDefault();
      const t = e.touches ? e.touches[0] : e;
      this._update(t.clientX, t.clientY);
    };
    const up = (e) => { e.preventDefault(); this.active = false; };

    this.canvas.addEventListener('touchstart', down, opts);
    this.canvas.addEventListener('touchmove', move, opts);
    this.canvas.addEventListener('touchend', up, opts);
    this.canvas.addEventListener('mousedown', down, opts);
    window.addEventListener('mousemove', move, opts);
    window.addEventListener('mouseup', up, opts);
  }

  consumeTap() {
    const t = this.tapped;
    this.tapped = false;
    return t;
  }
}
