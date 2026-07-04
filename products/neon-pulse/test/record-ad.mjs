// Records the demo mode as a 9:16 short-video ad (1080x1920 @ 60fps).
// Deterministic offline capture: steps the game frame by frame via
// window.__demo.step(), grabs canvas pixels, synthesizes the sfx track
// from the logged audio events, and muxes with Playwright's ffmpeg.
//
// Usage: node test/record-ad.mjs [outDir]
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || path.join(ROOT, 'ad-out');
const FPS = 60;
const W = 540, H = 960, DPR = 2; // canvas backing store = 1080x1920

import { createRequire } from 'node:module';
const FFMPEG = createRequire(import.meta.url)('@ffmpeg-installer/ffmpeg').path;
const CHROMIUM_DIR = fs.readdirSync('/opt/pw-browsers').find((d) => d.startsWith('chromium-'));
const CHROME = `/opt/pw-browsers/${CHROMIUM_DIR}/chrome-linux/chrome`;

// ---- tiny static server ----
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]);
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'text/plain' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;

// ---- offline sfx synthesis (mirrors AudioEngine's oscillator math) ----
const SR = 44100;
function synthTone(buf, startSec, freq, dur, { type = 'sine', vol = 0.5, slideTo = null, attack = 0.005 } = {}) {
  const n0 = Math.floor(startSec * SR);
  const n = Math.floor((dur + 0.02) * SR);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = slideTo ? freq * Math.pow(slideTo / freq, Math.min(t / dur, 1)) : freq;
    phase += (2 * Math.PI * f) / SR;
    let s = type === 'sine' ? Math.sin(phase)
      : type === 'triangle' ? (2 / Math.PI) * Math.asin(Math.sin(phase))
      : type === 'sawtooth' ? 2 * ((phase / (2 * Math.PI)) % 1) - 1
      : Math.sign(Math.sin(phase));
    const env = t < attack ? t / attack : Math.exp(-6.5 * (t - attack) / Math.max(dur - attack, 0.001));
    const idx = n0 + i;
    if (idx < buf.length) buf[idx] += s * vol * env * 0.35;
  }
}
function synthNoise(buf, startSec, dur, vol) {
  const n0 = Math.floor(startSec * SR);
  const n = Math.floor(dur * SR);
  for (let i = 0; i < n; i++) {
    const idx = n0 + i;
    if (idx < buf.length) buf[idx] += (Math.random() * 2 - 1) * vol * (1 - i / n) * 0.35;
  }
}
function renderSfx(events, totalSec) {
  const buf = new Float32Array(Math.ceil(totalSec * SR));
  for (const ev of events) {
    if (ev.fn === 'deflect') {
      const combo = ev.args[0] || 0;
      const base = 440 + Math.min(combo, 30) * 28;
      synthTone(buf, ev.t, base, 0.12, { type: 'triangle', vol: 0.5, slideTo: base * 1.5 });
    } else if (ev.fn === 'spawn') {
      synthTone(buf, ev.t, 180, 0.08, { type: 'sawtooth', vol: 0.12, slideTo: 120 });
    } else if (ev.fn === 'nearMiss') {
      synthTone(buf, ev.t, 900, 0.18, { type: 'sine', vol: 0.25, slideTo: 1500 });
    } else if (ev.fn === 'hit') {
      synthTone(buf, ev.t, 140, 0.5, { type: 'sawtooth', vol: 0.6, slideTo: 50 });
      synthNoise(buf, ev.t, 0.3, 0.5);
    }
  }
  // clip-protect + 16bit PCM WAV
  const pcm = Buffer.alloc(44 + buf.length * 2);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + buf.length * 2, 4); pcm.write('WAVE', 8);
  pcm.write('fmt ', 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34);
  pcm.write('data', 36); pcm.writeUInt32LE(buf.length * 2, 40);
  for (let i = 0; i < buf.length; i++) {
    const v = Math.max(-1, Math.min(1, buf[i]));
    pcm.writeInt16LE((v * 32767) | 0, 44 + i * 2);
  }
  return pcm;
}

// ---- capture ----
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });

const MAX_TAKES = 6;
let take = 0, ok = false, sfxEvents = [], frameCount = 0;

while (take < MAX_TAKES && !ok) {
  take++;
  console.log(`--- take ${take} ---`);
  await page.goto(`http://localhost:${PORT}/index.html?demo=1&record=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__demo, { timeout: 10000 });
  await page.evaluate(({ W, H, DPR }) => window.__demo.size(W, H, DPR), { W, H, DPR });

  frameCount = 0;
  let state = null;
  let goodRun = true;
  const maxFrames = FPS * 40; // hard cap 40s

  while (frameCount < maxFrames) {
    state = await page.evaluate((dt) => window.__demo.step(dt), 1 / FPS);
    // dying before the scripted finale = bad take, retry
    if (state.dead && state.phase !== 'dead' && state.phase !== 'endcard') { goodRun = false; break; }
    if (state.dead && state.score < 93) { goodRun = false; break; } // must be a "so close" death
    const buf = await page.evaluate(() => {
      const c = document.getElementById('game');
      return c.toDataURL('image/jpeg', 0.95).slice('data:image/jpeg;base64,'.length);
    });
    fs.writeFileSync(path.join(OUT, 'frames', `f${String(frameCount).padStart(5, '0')}.jpg`), Buffer.from(buf, 'base64'));
    frameCount++;
    if (state.done) break;
    if (frameCount % 300 === 0) console.log(`  ${frameCount} frames, phase=${state.phase}, score=${state.score}`);
  }

  if (goodRun && state && state.done) {
    ok = true;
    sfxEvents = await page.evaluate(() => window.__demo.sfx());
    console.log(`take ${take}: GOOD — ${frameCount} frames (${(frameCount / FPS).toFixed(1)}s), final score=${state.score}, sfx=${sfxEvents.length}`);
  } else {
    console.log(`take ${take}: bad (early death, score=${state?.score}) — retrying`);
    // wipe frames from the bad take
    for (const f of fs.readdirSync(path.join(OUT, 'frames'))) fs.unlinkSync(path.join(OUT, 'frames', f));
  }
}

await browser.close();
server.close();

if (!ok) { console.error('FAILED: no good take'); process.exit(1); }

// ---- audio + mux ----
const wav = renderSfx(sfxEvents, frameCount / FPS + 0.5);
fs.writeFileSync(path.join(OUT, 'sfx.wav'), wav);

console.log('encoding mp4...');
execFileSync(FFMPEG, [
  '-y',
  '-framerate', String(FPS),
  '-i', path.join(OUT, 'frames', 'f%05d.jpg'),
  '-i', path.join(OUT, 'sfx.wav'),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
  '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '128k',
  '-shortest',
  '-movflags', '+faststart',
  path.join(OUT, 'neon-pulse-ad.mp4'),
], { stdio: 'inherit' });

const size = fs.statSync(path.join(OUT, 'neon-pulse-ad.mp4')).size;
console.log(`DONE: ${path.join(OUT, 'neon-pulse-ad.mp4')} (${(size / 1e6).toFixed(1)} MB, ${(frameCount / FPS).toFixed(1)}s, 1080x1920@${FPS}fps)`);
