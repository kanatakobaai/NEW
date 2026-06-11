// Headless smoke test: drives the real Game logic without a browser.
// Mocks localStorage + injected audio/input so we exercise update/render math.
globalThis.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); },
};

const { Game, State } = await import('../js/game/game.js');

let audioCalls = 0;
const audio = new Proxy({}, { get: () => () => { audioCalls++; } });

const input = {
  angle: -Math.PI / 2,
  setCenter() {},
};

const game = new Game(audio, input);
game.resize(390, 844); // iPhone-ish portrait

// Fake 2D context that records draw calls but does nothing.
const ctx = new Proxy({}, {
  get(_, prop) {
    if (prop === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (prop === 'canvas') return { width: 390, height: 844 };
    return () => {};
  },
});

let assertions = 0;
function assert(cond, msg) {
  assertions++;
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

assert(game.state === State.MENU, 'starts in menu');

game.start();
assert(game.state === State.PLAYING, 'enters playing on start');

// Simulate ~30 seconds at 120Hz. Keep the shield aligned to incoming hazards
// so we exercise the deflect path and score growth.
const STEP = 1 / 120;
let steps = 0;
let everSpawned = false;
for (let t = 0; t < 30 && game.state === State.PLAYING; t += STEP) {
  // Aim shield at the nearest active hazard to force deflections.
  let nearest = null;
  for (const hz of game.hazards) {
    if (hz.active && !hz.deflected) {
      if (!nearest || hz.dist < nearest.dist) nearest = hz;
    }
  }
  if (nearest) { input.angle = nearest.angle; everSpawned = true; }
  game.update(STEP);
  game.render(ctx);
  steps++;
}

assert(steps > 100, 'ran many frames');
assert(everSpawned, 'hazards spawned');
assert(game.score >= 0, 'score is non-negative');
assert(Number.isFinite(game.shieldAngle), 'shield angle stays finite');
assert(game.particles.pool.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), 'particles finite');

// Force a game over: spawn a hazard right on the core, look away.
const hz = game.hazards.find((h) => !h.active);
hz.spawn(0, game.coreR + 1, 200, [255, 0, 0]);
input.angle = Math.PI; // shield opposite side
for (let i = 0; i < 240 && game.state === State.PLAYING; i++) game.update(STEP);
assert(game.state === State.DEAD, 'core hit triggers game over');
assert(game.best >= 0, 'best persisted');

console.log(`PASS: ${assertions} assertions, ${steps} frames simulated, score=${game.score}, bestCombo=${game.bestCombo}, audioCalls=${audioCalls}`);
