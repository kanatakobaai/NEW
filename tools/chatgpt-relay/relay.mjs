#!/usr/bin/env node
// ChatGPT 中継（relay）
// Claude Code（監督）と ChatGPT のチャット（実作業）を、ファイルでつなぐための道具。
//   Claude Code → .relay/inbox/NNNN.md に指示を書く → Chrome でチャットに短いメッセージを送る
//   ChatGPT     → Desktop Commander で指示を読んで作業 → .relay/outbox/NNNN.md に報告を書く
//   このスクリプト → 報告の更新を待ち、最終行の STATUS を読んで Claude Code に知らせる
// 依存パッケージなし（Node.js 18 以上）。使い方は同じフォルダの README.md を参照。

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.RELAY_ROOT || path.join(TOOL_DIR, '..', '..'));
const RELAY_DIR = path.join(ROOT, '.relay');
const INBOX = path.join(RELAY_DIR, 'inbox');
const OUTBOX = path.join(RELAY_DIR, 'outbox');
const LOG_DIR = path.join(RELAY_DIR, 'log');
const CONFIG_FILE = path.join(RELAY_DIR, 'config.json');
const STATE_FILE = path.join(RELAY_DIR, 'state.json');
const EVENTS_FILE = path.join(LOG_DIR, 'events.jsonl');
const RULES_FILE = path.join(TOOL_DIR, 'RULES.md');
const CLI = 'node tools/chatgpt-relay/relay.mjs';
const POLL_MS = Number(process.env.RELAY_POLL_MS) || 2000;
const TEMPLATE_MARK = '（Claude が書く）';

const DEFAULTS = {
  chatUrl: null,
  maxSendsPerRun: 30, // 1回の実行（begin から）で送るメッセージの上限
  maxContinuesPerTask: 10, // 1タスクで「続けて」を送る上限
  maxFixesPerTask: 3, // 1タスクで修正依頼を送る上限（超えたら人に相談）
  maxAnswersPerTask: 5,
  maxNudgesPerTask: 2, // 報告が来ないときの催促の上限
  waitTimeoutSec: 1200, // wait の既定の待ち時間
  stableSec: 5, // 報告ファイルがこの秒数変化しなければ書き終わりとみなす
  invalidGraceSec: 120, // STATUS のない報告がこの秒数変わらなければ INVALID_REPORT として知らせる
  minIntervalSec: 10, // 送信の最小間隔
};

const KINDS = {
  task: () => 3,
  continue: (c) => c.maxContinuesPerTask,
  fix: (c) => c.maxFixesPerTask,
  answer: (c) => c.maxAnswersPerTask,
  nudge: (c) => c.maxNudgesPerTask,
};

const EXIT = { DONE: 0, ERROR: 1, NOT_READY: 2, LIMIT: 3, UNPROCESSED: 4, IN_PROGRESS: 10, NEED_INPUT: 11, TIMEOUT: 20, INVALID_REPORT: 21 };

// ChatGPT の画面部品。UI が変わったらここを直す。
const SELECTORS = {
  composer: '#prompt-textarea',
  send: '[data-testid="send-button"], #composer-submit-button, button[aria-label*="Send"], button[aria-label*="送信"]',
  stop: '[data-testid="stop-button"], button[aria-label*="Stop"], button[aria-label*="停止"]',
};

// ---------- 小道具 ----------

class RelayError extends Error {}
const fail = (msg) => {
  throw new RelayError(msg);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const now = () => new Date().toISOString();
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const rel = (p) => path.relative(ROOT, p) || '.';

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    fail(`${rel(file)} を読めません: ${e.message}`);
  }
}

function writeJson(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (e) {
      // Windows では読み込み中のファイルを置き換えられないことがあるので、少し待って再試行
      if (i >= 20 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
}

function ensureDirs() {
  for (const d of [INBOX, OUTBOX, LOG_DIR]) fs.mkdirSync(d, { recursive: true });
}

const loadConfig = () => ({ ...DEFAULTS, ...readJson(CONFIG_FILE, {}) });

function loadState() {
  const s = readJson(STATE_FILE, {});
  return { run: { goal: null, startedAt: null, sends: 0, ...s.run }, lastSendAt: s.lastSendAt ?? null, tasks: s.tasks ?? {} };
}

function saveState(state) {
  ensureDirs();
  writeJson(STATE_FILE, state);
}

function logEvent(ev) {
  ensureDirs();
  fs.appendFileSync(EVENTS_FILE, JSON.stringify({ at: now(), ...ev }) + '\n', 'utf8');
}

function parseArgs(argv) {
  const pos = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) opts[key] = true;
      else opts[key] = argv[++i];
    } else pos.push(a);
  }
  return { pos, opts };
}

function normId(x) {
  if (!/^\d{1,4}$/.test(String(x ?? ''))) fail(`タスク番号の形式が違います: ${x}（例: 0001）`);
  return String(x).padStart(4, '0');
}

const inboxFile = (id) => path.join(INBOX, `${id}.md`);
const outboxFile = (id) => path.join(OUTBOX, `${id}.md`);

// 登録するチャットURLの正規化。https://chatgpt.com/c/<id> か、プロジェクト・GPT 内の /g/<名前>/c/<id> だけを受け付ける。
function normalizeChatUrl(input) {
  let u;
  try {
    u = new URL(String(input ?? '').trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  let host = u.hostname.toLowerCase();
  if (host === 'chat.openai.com' || host === 'www.chatgpt.com') host = 'chatgpt.com';
  if (host !== 'chatgpt.com') return null;
  const p = u.pathname.replace(/\/+$/, '');
  if (!/^\/(?:g\/[^/]+\/)?c\/[A-Za-z0-9-]+$/.test(p)) return null;
  return `https://${host}${p}`;
}

// 報告の最終行（空行・コードフェンスを除く）から STATUS を読む。見つからなければ null。
function parseStatus(text) {
  const lines = String(text)
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !/^(`{3,}|~{3,})\S*$/.test(s));
  if (!lines.length) return null;
  const last = lines[lines.length - 1]
    .replace(/[*`]/g, '')
    .replace(/^[>#\-\s]+/, '')
    .replace(/[\s。．.]+$/, '');
  const m = last.match(/^STATUS\s*[:：]\s*(DONE|IN[\s_-]?PROGRESS|NEED[\s_-]?INPUT)$/i);
  if (!m) return null;
  const v = m[1].toUpperCase();
  if (v.includes('PROGRESS')) return 'IN_PROGRESS';
  if (v.includes('INPUT')) return 'NEED_INPUT';
  return 'DONE';
}

// 報告ファイルを読む。書き込み中で読めない（Windows のロックなど）ときは null。
function readReport(file) {
  try {
    const buf = fs.readFileSync(file);
    return { exists: true, hash: sha(buf), text: buf.toString('utf8') };
  } catch (e) {
    if (e.code === 'ENOENT') return { exists: false, hash: null, text: '' };
    if (['EBUSY', 'EPERM', 'EACCES'].includes(e.code)) return null;
    throw e;
  }
}

function nextId(state) {
  let max = 0;
  const bump = (name) => {
    const m = /^(\d{4})/.exec(name);
    if (m) max = Math.max(max, Number(m[1]));
  };
  for (const d of [INBOX, OUTBOX]) if (fs.existsSync(d)) fs.readdirSync(d).forEach(bump);
  Object.keys(state.tasks).forEach(bump);
  return String(max + 1).padStart(4, '0');
}

function requireTask(state, id) {
  const t = state.tasks[id];
  if (!t) fail(`タスク ${id} がありません。先に「${CLI} new "<タイトル>"」で作成してください。`);
  t.sends ??= {};
  return t;
}

function minutesSince(iso) {
  return iso ? Math.round((Date.now() - Date.parse(iso)) / 60000) : null;
}

// ---------- ChatGPT に送るメッセージ（すべて1行。改行を含めると途中で送信されるため） ----------

function buildMessage(kind, id, file) {
  const tag = `【relay ${id}】`;
  const report = outboxFile(id);
  const statusRule = '最終行は STATUS: DONE / STATUS: IN_PROGRESS / STATUS: NEED_INPUT のどれか1行だけ';
  switch (kind) {
    case 'task':
      return `${tag}このチャット専用の作業ルール ${RULES_FILE} を読み、指示 ${inboxFile(id)} を実行して、報告を ${report} に書いてください（${statusRule}）。このルールはこのチャットの中だけで使い、メモリやカスタム指示には保存しないでください。`;
    case 'continue':
      return `${tag}続けてください。区切りのよいところで報告 ${report} を上書きしてください（${statusRule}）。`;
    case 'fix':
      return `${tag}確認で直してほしい点が見つかりました。${file} を読んで対応し、報告 ${report} を上書きしてください（${statusRule}）。`;
    case 'answer':
      return `${tag}質問への回答です。${file} を読んで作業を再開し、報告 ${report} を上書きしてください（${statusRule}）。`;
    case 'nudge':
      return `${tag}報告 ${report} がまだ更新されていません。作業を続け、区切りのよいところで報告を書いてください（${statusRule}）。`;
    default:
      fail(`メッセージの種類が違います: ${kind}`);
  }
}

// ---------- Chrome（javascript_tool）で実行するコード ----------
// 画面から読むのは「URL」「生成中か（停止ボタンの有無）」「入力欄が空か」だけ。ChatGPT の回答本文は読まない。

function jsPrelude(chatUrl) {
  return `  const EXPECTED = ${JSON.stringify(chatUrl)};
  const out = (o) => JSON.stringify(o);
  const u = new URL(location.href);
  const here = 'https://' + (u.hostname === 'chat.openai.com' ? 'chatgpt.com' : u.hostname) + u.pathname.replace(/\\/+$/, '');
  if (here !== EXPECTED) return out({ ok: false, reason: 'URL_MISMATCH', url: here });
  const box = () => document.querySelector(${JSON.stringify(SELECTORS.composer)});
  const scope = () => (box() && box().closest('form')) || document;
  const stop = () => scope().querySelector(${JSON.stringify(SELECTORS.stop)});
  const norm = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
  const textOf = (el) => norm(el && (el.value !== undefined ? el.value : el.innerText));`;
}

function buildSendJs(chatUrl, message) {
  return `(async () => {
${jsPrelude(chatUrl)}
  const MESSAGE = norm(${JSON.stringify(message)});
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!box()) return out({ ok: false, reason: 'NO_COMPOSER' });
  if (stop()) return out({ ok: false, reason: 'BUSY' });
  const draft = textOf(box());
  if (draft && draft !== MESSAGE) return out({ ok: false, reason: 'COMPOSER_NOT_EMPTY' });
  if (!draft) {
    const el = box();
    el.focus();
    if (el.tagName === 'TEXTAREA') {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, MESSAGE);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      document.execCommand('insertText', false, MESSAGE);
    }
    if (textOf(box()) !== MESSAGE) return out({ ok: false, reason: 'INSERT_FAILED' });
  }
  let send = null;
  for (let i = 0; i < 25 && !(send && !send.disabled); i++) {
    await sleep(200);
    send = scope().querySelector(${JSON.stringify(SELECTORS.send)});
  }
  if (!send || send.disabled) return out({ ok: false, reason: 'NO_SEND_BUTTON' });
  send.click();
  for (let i = 0; i < 30; i++) {
    await sleep(200);
    if (stop() || !textOf(box())) return out({ ok: true, reason: 'SENT' });
  }
  return out({ ok: false, reason: 'NOT_CONFIRMED' });
})()`;
}

function buildProbeJs(chatUrl) {
  return `(() => {
${jsPrelude(chatUrl)}
  return out({ ok: true, busy: !!(box() && stop()), composer: !!box(), draftLength: box() ? textOf(box()).length : -1 });
})()`;
}

// ---------- コマンド ----------

function cmdSetup([url]) {
  const chatUrl = normalizeChatUrl(url);
  if (!chatUrl) {
    fail(
      'チャットURLの形式が違います。ChatGPT で作業用のチャットを開き、アドレスバーの URL（https://chatgpt.com/c/... の形）をそのまま渡してください。一時チャットや共有リンクは使えません。',
    );
  }
  ensureDirs();
  writeJson(CONFIG_FILE, { ...loadConfig(), chatUrl });
  logEvent({ type: 'setup', chatUrl });
  console.log(`RESULT: OK
チャットURLを登録しました: ${chatUrl}
Claude はこの URL と完全に一致するタブにだけ入力します。
次: ${CLI} doctor で準備状況を確認してください。`);
}

function cmdDoctor() {
  const cfg = loadConfig();
  const lines = [];
  let ready = true;
  const ok = (m) => lines.push(`  OK   ${m}`);
  const warn = (m) => lines.push(`  注意 ${m}`);
  const bad = (m) => {
    ready = false;
    lines.push(`  NG   ${m}`);
  };

  const major = Number(process.versions.node.split('.')[0]);
  major >= 18 ? ok(`Node.js ${process.versions.node}`) : bad(`Node.js ${process.versions.node}（18 以上が必要）`);
  fs.existsSync(RULES_FILE) ? ok(`作業ルール: ${RULES_FILE}`) : bad(`作業ルールがありません: ${RULES_FILE}`);
  cfg.chatUrl ? ok(`チャットURL: ${cfg.chatUrl}`) : bad(`チャットURLが未登録です（${CLI} setup <URL>）`);

  try {
    ensureDirs();
    const probe = path.join(RELAY_DIR, `.write-test-${process.pid}`);
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    ok(`作業用フォルダに書き込めます: ${RELAY_DIR}`);
  } catch (e) {
    bad(`作業用フォルダに書き込めません: ${RELAY_DIR}（${e.message}）`);
  }

  const gitignore = path.join(ROOT, '.gitignore');
  const ignored = fs.existsSync(gitignore) && /^\/?\.relay\/?\s*$/m.test(fs.readFileSync(gitignore, 'utf8'));
  ignored ? ok('.relay/ は git の対象外です') : warn('.gitignore に .relay/ がありません（指示や報告がコミットに混ざります）');

  try {
    // .claude/（権限の設定など）はタスクのコミットに含めないので、ここでも数えない
    const dirty = execFileSync('git', ['status', '--porcelain', '--', '.', ':(exclude).claude'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    dirty
      ? warn('未コミットの変更があります。タスクごとのコミットに混ざらないよう、開始前にコミットしておくのがおすすめです')
      : ok('git: 未コミットの変更なし');
  } catch {
    warn('git の状態を確認できません（git リポジトリでない、または git が見つからない）');
  }

  console.log(`RESULT: ${ready ? 'READY' : 'NOT_READY'}
${lines.join('\n')}

ChatGPT が使うパス（Desktop Commander からこのフォルダを読み書きできる必要があります）:
  プロジェクト: ${ROOT}
  指示:         ${INBOX}
  報告:         ${OUTBOX}`);
  if (!ready) process.exitCode = EXIT.NOT_READY;
}

function cmdBegin([goal]) {
  if (!goal) fail(`目標を指定してください: ${CLI} begin "<目標>"`);
  const state = loadState();
  state.run = { goal, startedAt: now(), sends: 0 };
  saveState(state);
  logEvent({ type: 'begin', goal });
  console.log(`RESULT: OK\n実行を開始しました（送信回数をリセット）: ${goal}`);
}

function cmdNew([title]) {
  if (!title) fail(`タイトルを指定してください: ${CLI} new "<タイトル>"`);
  ensureDirs();
  const state = loadState();
  const id = nextId(state);
  const clean = String(title).replace(/\s+/g, ' ').trim();
  const body = `# 指示 ${id}: ${clean}

## 目的
${TEMPLATE_MARK}

## やること
- ${TEMPLATE_MARK}

## 完了条件（Claude がこの内容で確認します）
- ${TEMPLATE_MARK}

## 制約
- 作業フォルダ: ${ROOT}（この中だけで作業する）
- git commit / git push はしない（確認後に Claude がコミットします）
- 作業ルール: ${RULES_FILE}

## 報告
- 報告ファイル: ${outboxFile(id)}（毎回上書き）
- 最終行は \`STATUS: DONE\` / \`STATUS: IN_PROGRESS\` / \`STATUS: NEED_INPUT\` のどれか1行だけ
`;
  fs.writeFileSync(inboxFile(id), body, 'utf8');
  state.tasks[id] = { title: clean, createdAt: now(), state: 'draft', sends: {}, revisions: 0 };
  saveState(state);
  logEvent({ type: 'new', task: id, title: clean });
  console.log(`RESULT: OK
ID: ${id}
指示ファイル: ${inboxFile(id)}
「${TEMPLATE_MARK}」の部分を書き換えてから、${CLI} prepare ${id} task を実行してください。`);
}

async function cmdPrepare([rawId, kind], opts) {
  const id = normId(rawId);
  const cfg = loadConfig();
  if (!cfg.chatUrl) fail(`チャットURLが未登録です。先に ${CLI} setup <URL> を実行してください。`);
  if (!KINDS[kind]) fail('種類は task / continue / fix / answer / nudge のどれかです。');
  const state = loadState();
  const t = requireTask(state, id);

  let file = null;
  if (kind === 'task') {
    file = inboxFile(id);
    if (!fs.existsSync(file)) fail(`指示ファイルがありません: ${file}`);
    if (fs.readFileSync(file, 'utf8').includes(TEMPLATE_MARK)) fail(`指示ファイルにまだ「${TEMPLATE_MARK}」が残っています: ${file}`);
  }
  if (kind === 'fix' || kind === 'answer') {
    if (!opts.file || opts.file === true) fail(`${kind} には --file <.relay/inbox/ の中のファイル> が必要です。`);
    file = path.resolve(ROOT, opts.file);
    if (path.relative(INBOX, file).startsWith('..') || path.isAbsolute(path.relative(INBOX, file))) {
      fail(`--file は ${INBOX} の中のファイルにしてください: ${file}`);
    }
    if (!fs.existsSync(file)) fail(`ファイルがありません: ${file}`);
  }

  // まだ受け取っていない新しい報告があるなら、送らずに先に読ませる（途中の報告の見落とし・二重送信を防ぐ）
  const cur = readReport(outboxFile(id));
  const unprocessed = cur === null || (cur.exists && cur.hash !== t.processedHash && cur.hash !== t.snapshotHash);
  if (unprocessed && !opts.force) {
    console.log(`RESULT: UNPROCESSED
報告 ${outboxFile(id)} が更新されていて、まだ受け取っていません（または書き込み中です）。
送信はせずに、先に ${CLI} wait ${id} で受け取ってから判断し直してください。`);
    process.exitCode = EXIT.UNPROCESSED;
    return;
  }

  const limit = KINDS[kind](cfg);
  const used = t.sends[kind] ?? 0;
  if (state.run.sends >= cfg.maxSendsPerRun || used >= limit) {
    const which = state.run.sends >= cfg.maxSendsPerRun ? `この実行での送信 ${state.run.sends}/${cfg.maxSendsPerRun} 回` : `タスク ${id} の「${kind}」${used}/${limit} 回`;
    logEvent({ type: 'limit', task: id, kind, which });
    console.log(`RESULT: LIMIT
送信の上限に達しました（${which}）。送信せずに止まり、ユーザーに状況を報告してください。
上限は ${CONFIG_FILE} で変えられます。`);
    process.exitCode = EXIT.LIMIT;
    return;
  }

  const waitMs = state.lastSendAt ? cfg.minIntervalSec * 1000 - (Date.now() - Date.parse(state.lastSendAt)) : 0;
  if (waitMs > 0) await sleep(waitMs);

  const at = now();
  t.snapshotHash = cur.exists ? cur.hash : null;
  t.sends[kind] = used + 1;
  t.lastSend = { kind, at, ...(file && kind !== 'task' ? { file } : {}) };
  t.state = 'waiting';
  state.run.sends += 1;
  state.lastSendAt = at;
  saveState(state);
  logEvent({ type: 'send', task: id, kind, file: file && rel(file) });

  const message = buildMessage(kind, id, file);
  console.log(`RESULT: READY
タスク ${id} / 種類 ${kind} / 送信回数: この実行 ${state.run.sends}/${cfg.maxSendsPerRun}、この種類 ${used + 1}/${limit}
メッセージ: ${message}
----- ここから javascript_tool にそのまま渡すコード -----
${buildSendJs(cfg.chatUrl, message)}
----- ここまで -----
送信できたら ${CLI} wait ${id} を run_in_background で実行して報告を待ちます。`);
}

async function cmdWait([rawId], opts) {
  const id = normId(rawId);
  const cfg = loadConfig();
  const timeoutSec = opts.timeout && opts.timeout !== true ? Number(opts.timeout) : cfg.waitTimeoutSec;
  if (!(timeoutSec > 0)) fail('--timeout には秒数を指定してください。');
  const file = outboxFile(id);
  let t = requireTask(loadState(), id);
  const deadline = Date.now() + timeoutSec * 1000;
  const stableMs = cfg.stableSec * 1000;
  let candidate = null;
  let invalid = null;

  for (;;) {
    const cur = readReport(file);
    if (cur && cur.exists && cur.hash !== t.snapshotHash && cur.hash !== t.processedHash) {
      const status = parseStatus(cur.text);
      if (status) {
        invalid = null;
        if (!candidate || candidate.hash !== cur.hash) candidate = { hash: cur.hash, since: Date.now() };
        if (Date.now() - candidate.since >= stableMs) return acceptReport(id, cur, status);
      } else {
        candidate = null;
        if (!invalid || invalid.hash !== cur.hash) invalid = { ...cur, since: Date.now() };
      }
    } else {
      candidate = null;
    }

    const invalidTooLong = invalid && Date.now() - invalid.since >= cfg.invalidGraceSec * 1000;
    if (Date.now() >= deadline || invalidTooLong) {
      const state = loadState();
      t = requireTask(state, id);
      const elapsed = minutesSince(t.lastSend?.at);
      if (invalid) {
        // 最終行に STATUS がない報告。受け取り済みとして記録し、催促（nudge）を送れるようにする。
        t.processedHash = invalid.hash;
        t.state = 'invalid_report';
        saveState(state);
        logEvent({ type: 'invalid_report', task: id });
        console.log(`RESULT: INVALID_REPORT
報告 ${file} は更新されましたが、最終行に STATUS がありません。
報告を読み、作業が続いているなら少し待ち、止まっているなら nudge を送ってください。（最終送信から ${elapsed ?? '?'} 分）`);
        process.exitCode = EXIT.INVALID_REPORT;
        return;
      }
      // 名前違いの報告の候補（送信したあとに書かれた、別名のファイル）
      const since = t.lastSend?.at ? Date.parse(t.lastSend.at) : null;
      const others = since !== null && fs.existsSync(OUTBOX)
        ? fs
            .readdirSync(OUTBOX)
            .filter((n) => n !== `${id}.md` && fs.statSync(path.join(OUTBOX, n)).mtimeMs > since)
            .map((n) => path.join(OUTBOX, n))
        : [];
      logEvent({ type: 'timeout', task: id, elapsedMin: elapsed });
      console.log(`RESULT: TIMEOUT
${timeoutSec} 秒待ちましたが、報告 ${file} は更新されませんでした。（最終送信から ${elapsed ?? '?'} 分、催促 ${t.sends.nudge ?? 0}/${cfg.maxNudgesPerTask} 回）${
        others.length ? `\n別の名前で書かれた報告があります（名前違いの可能性）:\n${others.map((f) => `  ${f}`).join('\n')}` : ''
      }`);
      process.exitCode = EXIT.TIMEOUT;
      return;
    }
    await sleep(POLL_MS);
  }
}

function acceptReport(id, cur, status) {
  const state = loadState();
  const t = requireTask(state, id);
  t.revisions = (t.revisions ?? 0) + 1;
  const copy = path.join(LOG_DIR, `${id}-r${t.revisions}.md`);
  ensureDirs();
  fs.writeFileSync(copy, cur.text, 'utf8');
  t.processedHash = cur.hash;
  t.lastStatus = status;
  t.state = { DONE: 'done', IN_PROGRESS: 'in_progress', NEED_INPUT: 'need_input' }[status];
  t.updatedAt = now();
  saveState(state);
  logEvent({ type: 'report', task: id, status, revision: t.revisions });
  const next = {
    DONE: `変更（git diff）と完了条件を確認 → 合格なら ${CLI} mark ${id} verified してコミット、不合格なら fix を送る`,
    IN_PROGRESS: '報告を読み、方向が合っていれば continue、ずれていれば fix を送る',
    NEED_INPUT: '報告の質問を読み、決められる内容なら answer、方針・費用・公開などの判断ならユーザーに聞く',
  }[status];
  console.log(`RESULT: ${status}
タスク ${id}（報告 第${t.revisions}版）
報告: ${outboxFile(id)}
控え: ${copy}
次: ${next}`);
  process.exitCode = EXIT[status];
}

function cmdMark([rawId, st], opts) {
  const id = normId(rawId);
  if (!['verified', 'failed', 'cancelled'].includes(st)) fail('状態は verified / failed / cancelled のどれかです。');
  const state = loadState();
  const t = requireTask(state, id);
  t.state = st;
  t.updatedAt = now();
  if (opts.note && opts.note !== true) t.note = String(opts.note);
  saveState(state);
  logEvent({ type: 'mark', task: id, state: st, note: t.note });
  console.log(`RESULT: OK\nタスク ${id} を ${st} にしました。`);
}

function cmdStatus() {
  const cfg = loadConfig();
  const state = loadState();
  const ids = Object.keys(state.tasks).sort();
  const rows = ids.map((id) => {
    const t = state.tasks[id];
    const sends = Object.entries(t.sends ?? {})
      .map(([k, v]) => `${k}${v}`)
      .join(' ');
    const last = t.lastSend ? `最終送信 ${minutesSince(t.lastSend.at)}分前(${t.lastSend.kind})` : '未送信';
    return `  ${id} [${t.state}] ${t.title}  報告${t.revisions ?? 0}版  送信: ${sends || 'なし'}  ${last}`;
  });
  console.log(`RESULT: OK
チャットURL: ${cfg.chatUrl ?? '（未登録）'}
実行: ${state.run.goal ?? '（未開始）'}${state.run.startedAt ? `（開始 ${state.run.startedAt}）` : ''}  送信 ${state.run.sends}/${cfg.maxSendsPerRun}
タスク:
${rows.length ? rows.join('\n') : '  （なし）'}`);
}

function cmdProbe() {
  const cfg = loadConfig();
  if (!cfg.chatUrl) fail(`チャットURLが未登録です。先に ${CLI} setup <URL> を実行してください。`);
  console.log(`RESULT: OK
----- ここから javascript_tool にそのまま渡すコード -----
${buildProbeJs(cfg.chatUrl)}
----- ここまで -----
結果の busy が true なら ChatGPT はまだ応答中です。`);
}

const HELP = `ChatGPT 中継（relay）
使い方: ${CLI} <コマンド>
  setup <チャットURL>                 作業用チャットを登録
  doctor                              準備状況を確認
  begin "<目標>"                      実行を開始（送信回数をリセット）
  new "<タイトル>"                    次の指示ファイル .relay/inbox/NNNN.md を作成
  prepare <ID> <種類> [--file <パス>]  送信前の確認をして、送るメッセージと Chrome 用コードを表示
                                      種類: task / continue / fix / answer / nudge
  wait <ID> [--timeout <秒>]          報告の更新を待つ（RESULT: DONE / IN_PROGRESS / NEED_INPUT / TIMEOUT / INVALID_REPORT）
  probe                               ChatGPT が応答中かを調べる Chrome 用コードを表示
  mark <ID> <verified|failed|cancelled> [--note "<メモ>"]
  status                              状況の一覧`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos, opts } = parseArgs(rest);
  const commands = {
    setup: () => cmdSetup(pos),
    doctor: () => cmdDoctor(),
    begin: () => cmdBegin(pos),
    new: () => cmdNew(pos),
    prepare: () => cmdPrepare(pos, opts),
    wait: () => cmdWait(pos, opts),
    probe: () => cmdProbe(),
    mark: () => cmdMark(pos, opts),
    status: () => cmdStatus(),
  };
  if (!commands[cmd]) {
    console.log(HELP);
    if (cmd && cmd !== 'help' && cmd !== '--help') process.exitCode = EXIT.ERROR;
    return;
  }
  try {
    await commands[cmd]();
  } catch (e) {
    console.log(`RESULT: ERROR\n${e instanceof RelayError ? e.message : e.stack}`);
    process.exitCode = EXIT.ERROR;
  }
}

main();
