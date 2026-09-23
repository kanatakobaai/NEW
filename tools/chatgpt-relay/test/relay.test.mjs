// relay.mjs のテスト。ChatGPT 役として報告ファイルを書き、CLI の反応を確かめる。
// 実行: node --test tools/chatgpt-relay/test/relay.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../relay.mjs', import.meta.url));
const CHAT = 'https://chatgpt.com/c/abc-123';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const parse = (out, code) => ({ code, out, result: /^RESULT: (\S+)/m.exec(out)?.[1] });

function project(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-test-'));
  const env = { ...process.env, RELAY_ROOT: root, RELAY_POLL_MS: '50' };
  const run = (...args) => {
    const r = spawnSync(process.execPath, [CLI, ...args], { env, encoding: 'utf8' });
    return parse(r.stdout, r.status);
  };
  const start = (...args) =>
    new Promise((resolve) => {
      const p = spawn(process.execPath, [CLI, ...args], { env });
      let out = '';
      p.stdout.on('data', (d) => (out += d));
      p.on('close', (code) => resolve(parse(out, code)));
    });
  assert.equal(run('setup', CHAT).result, 'OK');
  const cfgFile = path.join(root, '.relay', 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
  fs.writeFileSync(cfgFile, JSON.stringify({ ...cfg, stableSec: 0.2, minIntervalSec: 0, invalidGraceSec: 60, ...overrides }));
  const inbox = (name) => path.join(root, '.relay', 'inbox', name);
  const report = (id) => path.join(root, '.relay', 'outbox', `${id}.md`);
  const newTask = (title = 'テスト') => {
    const r = run('new', title);
    const id = /ID: (\d{4})/.exec(r.out)[1];
    fs.writeFileSync(inbox(`${id}.md`), fs.readFileSync(inbox(`${id}.md`), 'utf8').replaceAll('（Claude が書く）', '内容'));
    return id;
  };
  const state = () => JSON.parse(fs.readFileSync(path.join(root, '.relay', 'state.json'), 'utf8'));
  return { root, run, start, inbox, report, newTask, state };
}

test('setup: チャットURLを検証して正規化する', () => {
  const p = project();
  for (const bad of ['http://chatgpt.com/c/abc', 'https://example.com/c/abc', 'https://chatgpt.com/', 'https://chatgpt.com/share/abc', 'なにか']) {
    assert.equal(p.run('setup', bad).result, 'ERROR', bad);
  }
  const cases = {
    'https://chatgpt.com/c/abc-123?model=gpt-5#x': 'https://chatgpt.com/c/abc-123',
    'https://chat.openai.com/c/abc-123/': 'https://chatgpt.com/c/abc-123',
    'https://chatgpt.com/g/g-p-6789-myproj/c/abc-123': 'https://chatgpt.com/g/g-p-6789-myproj/c/abc-123',
  };
  for (const [input, want] of Object.entries(cases)) {
    assert.equal(p.run('setup', input).result, 'OK', input);
    assert.equal(JSON.parse(fs.readFileSync(path.join(p.root, '.relay', 'config.json'), 'utf8')).chatUrl, want);
  }
});

test('new と prepare: 番号の割り当て、テンプレートのままなら送らない、1行メッセージと正しいJS', () => {
  const p = project();
  assert.match(p.run('new', 'A').out, /ID: 0001/);
  assert.equal(p.run('prepare', '1', 'task').result, 'ERROR'); // テンプレートのまま
  const id = p.newTask('B');
  assert.equal(id, '0002');
  const r = p.run('prepare', id, 'task');
  assert.equal(r.result, 'READY');
  const message = /^メッセージ: (.*)$/m.exec(r.out)[1];
  assert.match(message, /^【relay 0002】/);
  assert.ok(message.includes(path.join(p.root, '.relay', 'inbox', '0002.md')));
  assert.ok(message.includes(path.join(p.root, '.relay', 'outbox', '0002.md')));
  const js = /----- ここから.*-----\n([\s\S]*?)\n----- ここまで -----/.exec(r.out)[1];
  assert.doesNotThrow(() => new vm.Script(js)); // 構文として正しい
  assert.ok(js.includes(JSON.stringify(CHAT)));
  assert.equal(p.run('prepare', id, 'bogus').result, 'ERROR');
});

test('途中報告 → 続けて → 完了: 分割書き込みを待ち、古い報告は拾わない', async () => {
  const p = project();
  const id = p.newTask();
  assert.equal(p.run('prepare', id, 'task').result, 'READY');

  // 1回目: 本文を先に書き、少しあとで STATUS を追記（Desktop Commander の分割書き込み）
  const waiting = p.start('wait', id, '--timeout', '10');
  await delay(300);
  fs.writeFileSync(p.report(id), '# 報告\n## やったこと\n- 途中まで\n');
  await delay(400);
  fs.appendFileSync(p.report(id), 'STATUS: IN_PROGRESS\n');
  const r1 = await waiting;
  assert.equal(r1.result, 'IN_PROGRESS');
  assert.equal(r1.code, 10);
  assert.ok(fs.existsSync(path.join(p.root, '.relay', 'log', `${id}-r1.md`)));

  // 続けてを送ったあと、古い IN_PROGRESS の報告を完了扱いにしない
  assert.equal(p.run('prepare', id, 'continue').result, 'READY');
  const stale = p.run('wait', id, '--timeout', '1');
  assert.equal(stale.result, 'TIMEOUT');

  // 2回目: Windows で書かれた報告（BOM・CRLF・全角コロン・太字）
  const waiting2 = p.start('wait', id, '--timeout', '10');
  await delay(300);
  fs.writeFileSync(p.report(id), '\uFEFF# 報告\r\n## やったこと\r\n- 全部\r\n\r\n**STATUS： done**\r\n');
  const r2 = await waiting2;
  assert.equal(r2.result, 'DONE');
  assert.equal(r2.code, 0);
  assert.equal(p.state().tasks[id].state, 'done');
  assert.equal(p.state().tasks[id].revisions, 2);
});

test('受け取っていない報告があるときは送らない（--force で上書き可）', async () => {
  const p = project();
  const id = p.newTask();
  p.run('prepare', id, 'task');
  fs.writeFileSync(p.report(id), '# 報告\nSTATUS: IN_PROGRESS\n');
  assert.equal(p.run('wait', id, '--timeout', '5').result, 'IN_PROGRESS');
  // ChatGPT がさらに書き換えた（まだ wait していない）
  fs.writeFileSync(p.report(id), '# 報告\n- 追記\nSTATUS: DONE\n');
  const r = p.run('prepare', id, 'continue');
  assert.equal(r.result, 'UNPROCESSED');
  assert.equal(r.code, 4);
  assert.equal(p.state().tasks[id].sends.continue ?? 0, 0); // 送信として数えない
  assert.equal(p.run('wait', id, '--timeout', '5').result, 'DONE');
  assert.equal(p.run('prepare', id, 'continue').result, 'READY'); // 受け取ったあとは送れる
  fs.writeFileSync(p.report(id), '# 報告\n- さらに\nSTATUS: DONE\n');
  assert.equal(p.run('prepare', id, 'nudge', '--force').result, 'READY');
});

test('STATUS のない報告は INVALID_REPORT で早めに知らせ、そのあと催促を送れる', async () => {
  const p = project({ invalidGraceSec: 0.5 });
  const id = p.newTask();
  p.run('prepare', id, 'task');
  fs.writeFileSync(p.report(id), '# 報告\n作業しました\n');
  const started = Date.now();
  const r = p.run('wait', id, '--timeout', '20');
  assert.equal(r.result, 'INVALID_REPORT');
  assert.equal(r.code, 21);
  assert.ok(Date.now() - started < 10000);
  assert.equal(p.run('prepare', id, 'nudge').result, 'READY');
});

test('時間切れのとき、名前違いの報告ファイルを知らせる', () => {
  const p = project();
  const id = p.newTask();
  p.run('prepare', id, 'task');
  fs.writeFileSync(path.join(p.root, '.relay', 'outbox', `${id}-report.md`), '# 報告\nSTATUS: DONE\n');
  const r = p.run('wait', id, '--timeout', '1');
  assert.equal(r.result, 'TIMEOUT');
  assert.equal(r.code, 20);
  assert.ok(r.out.includes(`${id}-report.md`));

  // まだ送っていないタスクで待つ（短い待ち時間として使う）ときは、ほかの報告を候補に出さない
  const next = p.newTask();
  const r2 = p.run('wait', next, '--timeout', '1');
  assert.equal(r2.result, 'TIMEOUT');
  assert.ok(!r2.out.includes('名前違い'));
});

test('STATUS の書き方の揺れと、認めない書き方', async () => {
  const p = project({ invalidGraceSec: 0.5 });
  const ok = {
    'STATUS: IN-PROGRESS': 'IN_PROGRESS',
    '> STATUS: NEED_INPUT': 'NEED_INPUT',
    'STATUS: DONE\n```': 'DONE',
    '- `STATUS: DONE`。': 'DONE',
    'status:need input': 'NEED_INPUT',
  };
  for (const [last, want] of Object.entries(ok)) {
    const id = p.newTask();
    p.run('prepare', id, 'task');
    fs.writeFileSync(p.report(id), `# 報告\n\n${last}\n\n`);
    assert.equal(p.run('wait', id, '--timeout', '5').result, want, last);
  }
  for (const last of ['STATUS: DONE（全部できました）', '状態: 完了', 'STATUS: DONE\n補足です']) {
    const id = p.newTask();
    p.run('prepare', id, 'task');
    fs.writeFileSync(p.report(id), `# 報告\n${last}\n`);
    assert.equal(p.run('wait', id, '--timeout', '5').result, 'INVALID_REPORT', last);
  }
});

test('NEED_INPUT と、fix / answer のファイル指定', () => {
  const p = project();
  const id = p.newTask();
  p.run('prepare', id, 'task');
  fs.writeFileSync(p.report(id), '# 報告\n## 質問\n- A か B か\nSTATUS: NEED_INPUT\n');
  const r = p.run('wait', id, '--timeout', '5');
  assert.equal(r.result, 'NEED_INPUT');
  assert.equal(r.code, 11);

  assert.equal(p.run('prepare', id, 'answer').result, 'ERROR'); // --file なし
  const outside = path.join(p.root, 'answer.md');
  fs.writeFileSync(outside, 'A');
  assert.equal(p.run('prepare', id, 'answer', '--file', outside).result, 'ERROR'); // inbox の外
  const answer = p.inbox(`${id}-answer-1.md`);
  fs.writeFileSync(answer, 'A にしてください');
  const ok = p.run('prepare', id, 'answer', '--file', path.relative(p.root, answer));
  assert.equal(ok.result, 'READY');
  assert.ok(ok.out.includes(answer));
});

test('送信の上限: 実行全体と種類ごと。begin でリセット', () => {
  const p = project({ maxSendsPerRun: 2, maxNudgesPerTask: 1 });
  const id = p.newTask();
  assert.equal(p.run('prepare', id, 'task').result, 'READY');
  assert.equal(p.run('prepare', id, 'nudge').result, 'READY');
  const r = p.run('prepare', id, 'continue');
  assert.equal(r.result, 'LIMIT');
  assert.equal(r.code, 3);
  assert.equal(p.run('begin', '次の目標').result, 'OK');
  assert.equal(p.run('prepare', id, 'nudge').result, 'LIMIT'); // 催促はタスクごとに1回まで
  assert.equal(p.run('prepare', id, 'continue').result, 'READY');
});

test('status と mark', () => {
  const p = project();
  const id = p.newTask('ログイン画面');
  p.run('prepare', id, 'task');
  assert.equal(p.run('mark', id, 'verified', '--note', 'テスト通過').result, 'OK');
  assert.equal(p.run('mark', id, 'unknown').result, 'ERROR');
  const s = p.run('status');
  assert.equal(s.result, 'OK');
  assert.match(s.out, new RegExp(`${id} \\[verified\\] ログイン画面`));
});
