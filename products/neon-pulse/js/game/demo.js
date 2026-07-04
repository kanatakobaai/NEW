// Demo / attract mode for ad recording.
// An AI plays a choreographed run: builds a big combo, survives one
// scripted near-miss in slow-mo, then dies at 98/100 — the classic
// "so close" short-video ad beat. Everything (HUD, captions, end card)
// is drawn on canvas so offline frame capture includes it.
import { TAU, clamp, lerp, rand, angleDelta, normAngle } from '../engine/math.js';

const TARGET = 100;

export class DemoDirector {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.phase = 'intro';        // intro -> play -> nearmiss -> final -> dead -> endcard
    this.spawnTimer = 1.6;
    this.aiTarget = null;
    this.aiDelay = 0;            // human-ish reaction latency
    this.wobblePhase = 0;
    this.nearMissDone = false;
    this.finalWave = null;       // indices of the killer wave
    this.deadAt = -1;
    this.done = false;
    this.caption = { text: '', until: 0, big: false };
    game.onGameOver = () => { this.phase = 'dead'; this.deadAt = this.t; };
  }

  say(text, dur, big = false) {
    this.caption = { text, until: this.t + dur, big };
  }

  // Spawn one shard with a controlled visible travel time.
  spawn(angle, travelTime) {
    const g = this.game;
    const hz = g.hazards.find((h) => !h.active);
    if (!hz) return null;
    const edgeDist = Math.min(
      g.w / 2 / Math.max(Math.abs(Math.cos(angle)), 1e-6),
      g.h / 2 / Math.max(Math.abs(Math.sin(angle)), 1e-6)
    );
    const PALETTES = [
      [255, 60, 120], [80, 200, 255], [180, 120, 255], [120, 255, 160], [255, 200, 80],
    ];
    hz.spawn(angle, edgeDist + 50, (edgeDist - g.shieldR) / travelTime,
      PALETTES[(Math.random() * PALETTES.length) | 0]);
    g.audio.spawn();
    return hz;
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    this.wobblePhase += dt * 5;

    if (this.phase === 'intro') {
      if (this.t < 0.2) this.say('99%がクリアできない', 2.2, true);
      if (this.t >= 2.2) { this.phase = 'play'; this.say('コアを守れ', 1.5); }
      return;
    }

    if (this.phase === 'dead') {
      if (this.t - this.deadAt > 1.6) { this.phase = 'endcard'; }
      return;
    }
    if (this.phase === 'endcard') {
      if (this.t - this.deadAt > 4.4) this.done = true;
      return;
    }

    // ---- spawning ----
    if (this.phase === 'play') {
      // difficulty ramps with time
      const k = clamp((this.t - 2.2) / 14, 0, 1);       // 0..1 over 14s
      const interval = lerp(0.95, 0.38, k);
      const travel = lerp(1.9, 1.0, k);
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = interval * rand(0.9, 1.1);
        const a = rand(0, TAU);
        this.spawn(a, travel);
        // occasional close pair the AI can chain (looks skilled)
        if (k > 0.4 && Math.random() < 0.35) {
          this.spawn(a + rand(0.9, 1.6) * (Math.random() < 0.5 ? 1 : -1), travel * 1.25);
        }
      }
      // one scripted near-miss once combo is impressive
      if (!this.nearMissDone && g.combo >= 14) {
        this.nearMissDone = true;
        const a = rand(0, TAU);
        this.spawn(a, 1.1);
        this.spawn(a + Math.PI * 0.94, 1.55); // opposite side, arrives later
        this.say('!!', 1.2, true);
      }
      // hand off to the killer wave when catching two more shards would
      // land the score at 97-99: maximum "so close" pain
      const gain = 1 + Math.floor(g.combo / 5);
      if (g.score + gain * 2 >= TARGET - 3) {
        this.phase = 'final';
        this.say('あと少し…', 1.6, true);
        const base = rand(0, TAU);
        this.finalWave = [
          this.spawn(base, 1.3),
          this.spawn(base + TAU / 3, 1.6),
          this.spawn(base + (TAU * 2) / 3, 1.9), // this one lands
        ];
      }
    }

    // ---- AI shield control ----
    // Aim at the shard that reaches the shield soonest; small reaction
    // delay + wobble so it reads as human play.
    let best = null, bestT = Infinity;
    for (const hz of g.hazards) {
      if (!hz.active || hz.deflected) continue;
      const tta = (hz.dist - g.shieldR) / hz.speed;
      if (tta < bestT) { bestT = tta; best = hz; }
    }
    if (this.phase === 'final' && this.finalWave) {
      // Deliberately commit to the first two shards; the third wins.
      const alive = this.finalWave.filter((h) => h && h.active && !h.deflected);
      if (alive.length >= 2) best = alive[0];
      else if (alive.length === 1 && alive[0] === this.finalWave[2]) {
        // point AWAY from the last shard: the "couldn't get back in time" shot
        g.input.angle = normAngle(alive[0].angle + Math.PI * 0.7);
        return;
      }
    }
    if (best !== this.aiTarget) {
      this.aiTarget = best;
      // no hesitation during the finale — the AI must visibly catch two
      this.aiDelay = this.phase === 'final' ? 0 : 0.09;
    }
    if (this.aiDelay > 0) { this.aiDelay -= dt; return; }
    if (best) {
      const wobble = Math.sin(this.wobblePhase) * 0.05;
      g.input.angle = normAngle(best.angle + wobble);
    }
  }

  // Canvas-drawn HUD + captions + end card (DOM-free for offline capture).
  renderOverlay(ctx) {
    const g = this.game;
    const w = g.w, h = g.h;
    const score = Math.min(g.score, TARGET - 1);

    ctx.save();
    ctx.textAlign = 'center';

    if (this.phase !== 'endcard') {
      // target bar
      const bw = w * 0.64, bh = 10, bx = (w - bw) / 2, by = h * 0.075;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 5); ctx.fill();
      const p = clamp(score / TARGET, 0, 1);
      const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      grad.addColorStop(0, '#6ff'); grad.addColorStop(1, '#f6a');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.roundRect(bx, by, bw * p, bh, 5); ctx.fill();
      ctx.fillStyle = '#9fb3d0';
      ctx.font = `700 ${Math.round(h * 0.017)}px system-ui, sans-serif`;
      ctx.fillText(`TARGET ${TARGET}`, w / 2, by - 10);
      // score
      ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(110,255,255,0.9)';
      ctx.shadowBlur = 22;
      ctx.font = `800 ${Math.round(h * 0.055)}px system-ui, sans-serif`;
      ctx.fillText(String(score), w / 2, by + bh + h * 0.055);
      ctx.shadowBlur = 0;
      // combo
      if (g.combo > 1) {
        ctx.fillStyle = '#ff3c78';
        ctx.shadowColor = 'rgba(255,60,120,0.9)';
        ctx.shadowBlur = 16;
        ctx.font = `800 ${Math.round(h * 0.026)}px system-ui, sans-serif`;
        ctx.fillText(`x${g.combo}`, w / 2, by + bh + h * 0.085);
        ctx.shadowBlur = 0;
      }
    }

    // caption
    if (this.caption.text && this.t < this.caption.until) {
      const sz = this.caption.big ? h * 0.042 : h * 0.028;
      ctx.fillStyle = '#eafcff';
      ctx.shadowColor = 'rgba(110,255,255,0.8)';
      ctx.shadowBlur = 24;
      ctx.font = `900 ${Math.round(sz)}px system-ui, sans-serif`;
      ctx.fillText(this.caption.text, w / 2, h * 0.30);
      ctx.shadowBlur = 0;
    }

    if (this.phase === 'dead' || this.phase === 'endcard') {
      const td = this.t - this.deadAt;
      if (td > 0.35) {
        ctx.fillStyle = '#ff3c78';
        ctx.shadowColor = 'rgba(255,60,120,0.8)';
        ctx.shadowBlur = 30;
        ctx.font = `900 ${Math.round(h * 0.055)}px system-ui, sans-serif`;
        ctx.fillText('GAME OVER', w / 2, h * 0.40);
        ctx.shadowBlur = 0;
      }
      if (td > 0.9) {
        ctx.fillStyle = '#fff';
        ctx.shadowColor = 'rgba(110,255,255,0.9)';
        ctx.shadowBlur = 26;
        ctx.font = `900 ${Math.round(h * 0.09)}px system-ui, sans-serif`;
        ctx.fillText(`${score} / ${TARGET}`, w / 2, h * 0.51);
        ctx.shadowBlur = 0;
      }
      if (this.phase === 'endcard') {
        const te = td - 1.6;
        const a = clamp(te / 0.4, 0, 1);
        ctx.globalAlpha = a;
        ctx.fillStyle = '#eafcff';
        ctx.font = `900 ${Math.round(h * 0.04)}px system-ui, sans-serif`;
        ctx.fillText('あなたならクリアできる？', w / 2, h * 0.62);
        // pulsing CTA pill
        const pulse = 1 + Math.sin(this.t * 6) * 0.04;
        const pw = w * 0.5 * pulse, ph = h * 0.062 * pulse;
        const px = w / 2 - pw / 2, py = h * 0.66;
        const grad2 = ctx.createLinearGradient(px, 0, px + pw, 0);
        grad2.addColorStop(0, '#8ff'); grad2.addColorStop(1, '#6cf');
        ctx.fillStyle = grad2;
        ctx.shadowColor = 'rgba(110,255,255,0.8)';
        ctx.shadowBlur = 30;
        ctx.beginPath(); ctx.roundRect(px, py, pw, ph, ph / 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#05060f';
        ctx.font = `900 ${Math.round(h * 0.028)}px system-ui, sans-serif`;
        ctx.fillText('▶ 今すぐ挑戦', w / 2, py + ph * 0.66);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }
}
