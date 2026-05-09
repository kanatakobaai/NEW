const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');

before(() => {
  process.env.LINE_CHANNEL_SECRET = 'test-secret-1234';
});

const { signInvoice, verifyInvoiceSig, genToken } = require('../src/security');

describe('signInvoice / verifyInvoiceSig', () => {
  test('署名が16文字の16進数', () => {
    const sig = signInvoice(42, 'Uabcdef');
    assert.match(sig, /^[0-9a-f]{16}$/);
  });

  test('同じ入力→同じ署名（決定論的）', () => {
    assert.equal(signInvoice(1, 'Utest'), signInvoice(1, 'Utest'));
  });

  test('異なる invoiceId → 異なる署名', () => {
    assert.notEqual(signInvoice(1, 'Utest'), signInvoice(2, 'Utest'));
  });

  test('verifyInvoiceSig：正しい署名を受け入れる', () => {
    const sig = signInvoice(5, 'Uuser1');
    assert.ok(verifyInvoiceSig(5, 'Uuser1', sig));
  });

  test('verifyInvoiceSig：改ざんされた署名を拒否', () => {
    const sig = signInvoice(5, 'Uuser1');
    const tampered = sig.replace(sig[0], sig[0] === 'a' ? 'b' : 'a');
    assert.ok(!verifyInvoiceSig(5, 'Uuser1', tampered));
  });

  test('verifyInvoiceSig：別ユーザーIDを拒否', () => {
    const sig = signInvoice(5, 'Uuser1');
    assert.ok(!verifyInvoiceSig(5, 'Uuser2', sig));
  });

  test('verifyInvoiceSig：短すぎる署名を拒否', () => {
    assert.ok(!verifyInvoiceSig(5, 'Uuser1', 'short'));
  });

  test('verifyInvoiceSig：空文字を拒否', () => {
    assert.ok(!verifyInvoiceSig(5, 'Uuser1', ''));
  });
});

describe('genToken', () => {
  test('デフォルト16バイト→32文字hex', () => {
    assert.equal(genToken().length, 32);
  });

  test('32バイト→64文字hex', () => {
    assert.equal(genToken(32).length, 64);
  });

  test('毎回異なるトークン', () => {
    assert.notEqual(genToken(), genToken());
  });
});
