// Bootstrap: fixed-timestep game loop, DPR-aware canvas, UI wiring.
import { AudioEngine } from './engine/audio.js';
import { Input } from './engine/input.js';
import { Game, State } from './game/game.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

const audio = new AudioEngine();
const input = new Input(canvas);
const game = new Game(audio, input);

// UI elements
const ui = {
  menu: document.getElementById('menu'),
  dead: document.getElementById('dead'),
  hud: document.getElementById('hud'),
  score: document.getElementById('score'),
  combo: document.getElementById('combo'),
  finalScore: document.getElementById('finalScore'),
  finalBest: document.getElementById('finalBest'),
  finalCombo: document.getElementById('finalCombo'),
  menuBest: document.getElementById('menuBest'),
  playBtn: document.getElementById('playBtn'),
  retryBtn: document.getElementById('retryBtn'),
  muteBtn: document.getElementById('muteBtn'),
};

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  game.resize(w, h);
}
window.addEventListener('resize', resize);
resize();

function show(el, on) { el.classList.toggle('hidden', !on); }

function toMenu() {
  game.state = State.MENU;
  ui.menuBest.textContent = game.best;
  show(ui.menu, true);
  show(ui.dead, false);
  show(ui.hud, false);
}

function play() {
  audio.init();
  audio.resume();
  game.start();
  show(ui.menu, false);
  show(ui.dead, false);
  show(ui.hud, true);
}

game.onGameOver = () => {
  setTimeout(() => {
    ui.finalScore.textContent = game.score;
    ui.finalBest.textContent = game.best;
    ui.finalCombo.textContent = game.bestCombo;
    show(ui.hud, false);
    show(ui.dead, true);
  }, 650);
};

ui.playBtn.addEventListener('click', play);
ui.retryBtn.addEventListener('click', play);
ui.muteBtn.addEventListener('click', () => {
  const muted = audio.toggleMute();
  ui.muteBtn.textContent = muted ? '🔇' : '🔊';
});

// Fixed timestep loop with accumulator for stable physics.
const STEP = 1 / 120;
let acc = 0;
let last = performance.now();

function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25; // avoid spiral of death after tab switch
  acc += dt;
  while (acc >= STEP) {
    game.update(STEP);
    acc -= STEP;
  }
  game.render(ctx);

  if (game.state === State.PLAYING) {
    ui.score.textContent = game.score;
    ui.combo.textContent = game.combo > 1 ? `x${game.combo}` : '';
  }
  requestAnimationFrame(frame);
}

// ---- Demo / ad-recording mode ----
const params = new URLSearchParams(location.search);
const DEMO = params.get('demo') === '1';
const RECORD = params.get('record') === '1';

if (DEMO) {
  const { DemoDirector } = await import('./game/demo.js');
  // Hide DOM chrome; the director draws its own canvas HUD.
  show(ui.menu, false); show(ui.dead, false); show(ui.hud, false);
  ui.muteBtn.classList.add('hidden');

  // Log sfx events (for offline audio rendering during capture).
  const sfxLog = [];
  let demoClock = 0;
  const realAudio = audio;
  const loggedAudio = new Proxy(realAudio, {
    get(t, prop) {
      const v = t[prop];
      if (typeof v === 'function' && ['deflect', 'spawn', 'nearMiss', 'hit'].includes(prop)) {
        return (...args) => { sfxLog.push({ t: demoClock, fn: prop, args }); return v.apply(t, args); };
      }
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
  game.audio = loggedAudio;

  game.autoSpawn = false;
  game.start();
  const director = new DemoDirector(game);

  const demoRender = () => {
    game.render(ctx);
    director.renderOverlay(ctx);
  };

  if (RECORD) {
    // Manual stepping API driven by the recorder (deterministic offline).
    window.__demo = {
      step(dt) {
        demoClock += dt;
        director.update(dt);
        game.update(dt);
        demoRender();
        return { phase: director.phase, score: game.score, done: director.done, dead: game.state === State.DEAD };
      },
      sfx: () => sfxLog,
      size(w, h, dpr) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        game.resize(w, h);
      },
    };
  } else {
    // Live demo: normal rAF loop with AI at the wheel.
    audio.init();
    let dLast = performance.now();
    let dAcc = 0;
    const demoFrame = (now) => {
      let dt = (now - dLast) / 1000; dLast = now;
      if (dt > 0.25) dt = 0.25;
      dAcc += dt;
      while (dAcc >= STEP) {
        demoClock += STEP;
        director.update(STEP);
        game.update(STEP);
        dAcc -= STEP;
      }
      demoRender();
      if (director.done) { location.search = ''; return; }
      requestAnimationFrame(demoFrame);
    };
    requestAnimationFrame(demoFrame);
  }
} else {
  toMenu();
  requestAnimationFrame(frame);
}

// Register service worker for PWA install (ignored on file://).
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
