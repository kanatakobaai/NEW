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

toMenu();
requestAnimationFrame(frame);

// Register service worker for PWA install (ignored on file://).
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
