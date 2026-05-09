const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { escape, genToken, signPdfId, verifyPdfSig } = require('../src/security');

describe('escape (XSS対策)', () => {
  test('< > をエスケープ', () => {
    assert.equal(escape('<script>'), '&lt;script&gt;');
  });

  test('" \' をエスケープ', () => {
    assert.equal(escape('"hello\''), '&quot;hello&#39;');
  });

  test('& をエスケープ', () => {
    assert.equal(escape('A & B'), 'A &amp; B');
  });

  test('通常テキストは変更なし', () => {
    assert.equal(escape('田中商事'), '田中商事');
  });

  test('null → 空文字', () => {
    assert.equal(escape(null), '');
  });

  test('undefined → 空文字', () => {
    assert.equal(escape(undefined), '');
  });

  test('数値を文字列化してエスケープ', () => {
    assert.equal(escape(42), '42');
  });

  test('XSS攻撃ベクター全部エスケープ', () => {
    const input = '<img src=x onerror="alert(1)">';
    const out = escape(input);
    assert.ok(!out.includes('<'));
    assert.ok(!out.includes('>'));
    assert.ok(!out.includes('"'));
  });
});

describe('genToken', () => {
  test('デフォルト32バイト→64文字hex', () => {
    assert.equal(genToken().length, 64);
  });

  test('16バイト→32文字hex', () => {
    assert.equal(genToken(16).length, 32);
  });

  test('毎回異なるトークン', () => {
    assert.notEqual(genToken(), genToken());
  });

  test('16進数文字のみ', () => {
    assert.match(genToken(), /^[0-9a-f]+$/);
  });
});

describe('signPdfId / verifyPdfSig', () => {
  const secret = 'test-session-secret';

  test('署名が16文字の16進数', () => {
    const sig = signPdfId(1, secret);
    assert.match(sig, /^[0-9a-f]{16}$/);
  });

  test('同じ入力→同じ署名', () => {
    assert.equal(signPdfId(5, secret), signPdfId(5, secret));
  });

  test('異なるID→異なる署名', () => {
    assert.notEqual(signPdfId(1, secret), signPdfId(2, secret));
  });

  test('正しい署名を受け入れる', () => {
    const sig = signPdfId(10, secret);
    assert.ok(verifyPdfSig(10, sig, secret));
  });

  test('改ざんされた署名を拒否', () => {
    const sig = signPdfId(10, secret);
    const bad = sig.replace(sig[0], sig[0] === 'a' ? 'b' : 'a');
    assert.ok(!verifyPdfSig(10, bad, secret));
  });

  test('別シークレットの署名を拒否', () => {
    const sig = signPdfId(10, 'other-secret');
    assert.ok(!verifyPdfSig(10, sig, secret));
  });
});
