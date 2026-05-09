const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Use in-memory/temp DB for tests
const tmpDb = path.join('/tmp', `test-db-${Date.now()}.sqlite`);
process.env.DATABASE_PATH = tmpDb;

const db = require('../src/services/database');

after(() => {
  try { fs.unlinkSync(tmpDb); } catch {}
});

describe('upsertUser / getUser', () => {
  test('新規ユーザーを作成できる', () => {
    const user = db.upsertUser('U001', 'テストユーザー');
    assert.ok(user);
    assert.equal(user.line_user_id, 'U001');
    assert.equal(user.display_name, 'テストユーザー');
    assert.equal(user.subscription_status, 'free');
  });

  test('同じIDで再度呼んでも重複しない', () => {
    db.upsertUser('U001', 'テストユーザー');
    db.upsertUser('U001', '別の名前');
    const user = db.getUser('U001');
    assert.equal(user.line_user_id, 'U001');
    // display_name は上書きしない設計
    assert.equal(user.display_name, 'テストユーザー');
  });

  test('存在しないユーザーはundefined', () => {
    assert.equal(db.getUser('NOTEXIST'), undefined);
  });
});

describe('canUseService / incrementUsage / getRemainingFreeUses', () => {
  before(() => db.upsertUser('U002', 'フリーユーザー'));

  test('新規ユーザーはサービス利用可能', () => {
    assert.ok(db.canUseService('U002'));
  });

  test('残り枠が3', () => {
    assert.equal(db.getRemainingFreeUses('U002'), 3);
  });

  test('3回使ったら利用不可', () => {
    db.incrementUsage('U002');
    db.incrementUsage('U002');
    db.incrementUsage('U002');
    assert.ok(!db.canUseService('U002'));
    assert.equal(db.getRemainingFreeUses('U002'), 0);
  });
});

describe('updateSubscription / getUserBySubscriptionId', () => {
  before(() => db.upsertUser('U003', 'プレミアムユーザー'));

  test('subscriptionをactiveにできる', () => {
    db.updateSubscription('U003', 'cus_123', 'sub_abc', 'active');
    const user = db.getUser('U003');
    assert.equal(user.subscription_status, 'active');
    assert.equal(user.subscription_id, 'sub_abc');
  });

  test('subscription IDでユーザーを検索できる', () => {
    const user = db.getUserBySubscriptionId('sub_abc');
    assert.ok(user);
    assert.equal(user.line_user_id, 'U003');
  });

  test('プレミアムユーザーは利用無制限', () => {
    assert.ok(db.canUseService('U003'));
    assert.equal(db.getRemainingFreeUses('U003'), Infinity);
  });

  test('解約でfreeに戻る', () => {
    db.updateSubscription('U003', 'cus_123', 'sub_abc', 'free');
    assert.equal(db.getUser('U003').subscription_status, 'free');
  });
});

describe('saveInvoice / updateInvoicePdfPath / getInvoices', () => {
  before(() => db.upsertUser('U004', '請求書ユーザー'));

  test('請求書を保存して取得できる', () => {
    const saved = db.saveInvoice('U004', {
      clientName: 'テスト株式会社',
      amount: 150000,
      description: 'Webサイト制作',
      taxRate: 0.10,
      dueDate: '2026-06-30',
    });
    assert.ok(saved.id);
    assert.match(saved.invoiceNumber, /^INV-\d{4}-\d{4}$/);

    const list = db.getInvoices('U004');
    assert.equal(list.length, 1);
    assert.equal(list[0].client_name, 'テスト株式会社');
    assert.equal(list[0].amount, 150000);
  });

  test('PDF pathを後から更新できる', () => {
    const saved = db.saveInvoice('U004', {
      clientName: 'B社', amount: 50000, description: '翻訳', taxRate: 0.10,
    });
    db.updateInvoicePdfPath(saved.id, '/data/pdfs/test.pdf');
    const list = db.getInvoices('U004');
    const updated = list.find(i => i.id === saved.id);
    assert.equal(updated.pdf_path, '/data/pdfs/test.pdf');
  });
});

describe('session操作', () => {
  before(() => db.upsertUser('U005', 'セッションユーザー'));

  test('セッション保存・取得', () => {
    db.setSession('U005', 'creating', { step: 1, clientName: 'A社' });
    const sess = db.getSession('U005');
    assert.equal(sess.mode, 'creating');
    assert.equal(sess.data.step, 1);
    assert.equal(sess.data.clientName, 'A社');
  });

  test('セッション上書き', () => {
    db.setSession('U005', 'confirming', { clientName: 'B社' });
    const sess = db.getSession('U005');
    assert.equal(sess.mode, 'confirming');
  });

  test('セッション削除', () => {
    db.clearSession('U005');
    assert.equal(db.getSession('U005'), null);
  });

  test('存在しないセッションはnull', () => {
    assert.equal(db.getSession('UXXX'), null);
  });
});
