const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { parseAmount, parseInvoiceRequest, getMissingFields } = require('../src/services/invoiceParser');

// ── parseAmount ────────────────────────────────────────

describe('parseAmount', () => {
  test('万円のみ', () => assert.equal(parseAmount('15万円'), 150000));
  test('1万5千円', () => assert.equal(parseAmount('1万5千円'), 15000));
  test('1万5000円', () => assert.equal(parseAmount('1万5000円'), 15000));
  test('2.5万円', () => assert.equal(parseAmount('2.5万円'), 25000));
  test('X千円', () => assert.equal(parseAmount('500千円'), 500000));
  test('カンマ区切り', () => assert.equal(parseAmount('100,000円'), 100000));
  test('円のみ', () => assert.equal(parseAmount('98000円'), 98000));
  test('数字のみ（大きい）', () => assert.equal(parseAmount('50000'), 50000));
  test('null on garbage', () => assert.equal(parseAmount('曖昧なテキスト'), null));
  test('10万円', () => assert.equal(parseAmount('10万円'), 100000));
  test('0.5万円', () => assert.equal(parseAmount('0.5万円'), 5000));
});

// ── parseInvoiceRequest ────────────────────────────────

describe('parseInvoiceRequest', () => {
  test('基本パターン：田中商事に15万円', () => {
    const r = parseInvoiceRequest('田中商事に15万円の請求書、件名はWebサイト制作');
    assert.equal(r.clientName, '田中商事');
    assert.equal(r.amount, 150000);
    assert.equal(r.description, 'Webサイト制作');
    assert.ok(r.confidence >= 80);
  });

  test('金額のみ：クライアント名なし', () => {
    const r = parseInvoiceRequest('15万円の請求書');
    assert.equal(r.amount, 150000);
    assert.equal(r.clientName, null);
    assert.ok(r.confidence < 80);
  });

  test('軽減税率8%', () => {
    const r = parseInvoiceRequest('田中商事に5万円、軽減税率');
    assert.equal(r.taxRate, 0.08);
  });

  test('税込→税率0', () => {
    const r = parseInvoiceRequest('田中商事に10万円、税込');
    assert.equal(r.taxRate, 0);
  });

  test('件名パターン：件名：〇〇', () => {
    const r = parseInvoiceRequest('A社に20万円、件名：システム開発');
    assert.equal(r.amount, 200000);
    assert.equal(r.description, 'システム開発');
  });

  test('請求先：パターン', () => {
    const r = parseInvoiceRequest('請求先：株式会社テスト に10万円');
    assert.equal(r.clientName, '株式会社テスト');
  });

  test('信頼度：clientName+amount+descriptionで100', () => {
    const r = parseInvoiceRequest('鈴木工務店に5万円、件名：外壁塗装');
    assert.equal(r.confidence, 100);
  });
});

// ── getMissingFields ───────────────────────────────────

describe('getMissingFields', () => {
  test('全部揃ってたら空配列', () => {
    const parsed = { clientName: 'A社', amount: 10000, description: '作業費' };
    assert.deepEqual(getMissingFields(parsed), []);
  });

  test('clientNameなし → 1件返す', () => {
    const missing = getMissingFields({ clientName: null, amount: 10000, description: '作業費' });
    assert.equal(missing.length, 1);
    assert.equal(missing[0].field, 'clientName');
  });

  test('amountとdescriptionなし → 2件返す', () => {
    const missing = getMissingFields({ clientName: 'A社', amount: null, description: null });
    assert.equal(missing.length, 2);
  });
});
