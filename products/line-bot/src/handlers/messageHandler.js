const db = require('../services/database');
const { parseInvoiceRequest, getMissingFields } = require('../services/invoiceParser');
const { generateInvoicePDF } = require('../services/pdfGenerator');
const { createCheckoutSession } = require('../services/stripe');
const {
  invoiceConfirmFlex, invoiceCreatedFlex, premiumUpgradeFlex, menuFlex, quickReply,
} = require('../services/flexMessages');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function getProfile(client, userId) {
  try { return await client.getProfile(userId); }
  catch { return { displayName: 'ユーザー', userId }; }
}

async function handleMessage(client, event) {
  const userId = event.source.userId;
  const text = event.message.text.trim();

  const profile = await getProfile(client, userId);
  db.upsertUser(userId, profile.displayName);
  const user = db.getUser(userId);
  const session = db.getSession(userId) || {};

  // ── Session: waiting for missing field ──────────────
  if (session.mode === 'await_field') {
    return handleAwaitField(client, event, userId, user, text, session.data);
  }

  // ── Session: confirm invoice ─────────────────────────
  if (session.mode === 'confirm') {
    return handleConfirm(client, event, userId, user, text, session.data);
  }

  // ── Session: setup ───────────────────────────────────
  if (session.mode === 'setup') {
    return handleSetup(client, event, userId, text);
  }

  // ── Commands ─────────────────────────────────────────
  const cmd = text.toLowerCase();

  if (['メニュー', 'menu', 'help', 'ヘルプ', 'へるぷ'].includes(cmd)) {
    db.clearSession(userId);
    const remaining = db.getRemainingFreeUses(userId);
    return reply(client, event, menuFlex(profile.displayName, remaining));
  }

  if (['設定', 'setting', 'せってい'].includes(cmd)) {
    db.setSession(userId, 'setup');
    return reply(client, event, {
      type: 'text',
      text: '⚙️ 設定モード\n\n以下の形式で送ってください（不要な項目はスキップ可）:\n\n会社名：〇〇株式会社\n担当者名：山田太郎\n住所：東京都渋谷区...\n銀行口座：〇〇銀行 普通 1234567',
      quickReply: quickReply([
        { label: '現在の設定を見る', text: '設定確認' },
        { label: 'キャンセル', text: 'キャンセル' },
      ]),
    });
  }

  if (['設定確認', '設定を見る'].includes(text)) {
    const lines = [
      '⚙️ 現在の設定',
      '',
      `会社名: ${user.my_company_name || '（未設定）'}`,
      `担当者名: ${user.my_name || '（未設定）'}`,
      `住所: ${user.my_address || '（未設定）'}`,
      `口座: ${user.my_bank_info || '（未設定）'}`,
    ].join('\n');
    return reply(client, event, { type: 'text', text: lines });
  }

  if (['履歴', '請求書一覧', '過去の請求書'].includes(text)) {
    const invoices = db.getInvoices(userId, 5);
    if (!invoices.length) {
      return reply(client, event, { type: 'text', text: '📊 まだ請求書がありません。\n\n「請求書作成」と送って最初の請求書を作りましょう！' });
    }
    const lines = invoices.map((inv, i) => {
      const total = Math.floor(inv.amount * (1 + inv.tax_rate));
      return `${i + 1}. ${inv.invoice_number}\n   ${inv.client_name}\n   ¥${total.toLocaleString()} | ${inv.created_at.slice(0, 10)}`;
    });
    return reply(client, event, {
      type: 'text',
      text: `📊 最近の請求書\n\n${lines.join('\n\n')}`,
      quickReply: quickReply([{ label: '新しく作成', text: '請求書作成' }]),
    });
  }

  if (['プレミアム', 'premium', 'アップグレード', '課金'].includes(text)) {
    const session2 = await createCheckoutSession(userId, profile.displayName);
    return reply(client, event, premiumUpgradeFlex(session2.url, db.getRemainingFreeUses(userId)));
  }

  if (['キャンセル', 'cancel', 'やめる'].includes(cmd)) {
    db.clearSession(userId);
    return reply(client, event, { type: 'text', text: 'キャンセルしました。', quickReply: quickReply([{ label: 'メニュー', text: 'メニュー' }]) });
  }

  // ── Natural language invoice parse ───────────────────
  const parsed = parseInvoiceRequest(text);

  if (parsed.confidence >= 80) {
    db.setSession(userId, 'confirm', parsed);
    return reply(client, event, invoiceConfirmFlex(parsed));
  }

  if (parsed.confidence > 0) {
    // Partial parse: guide user through missing fields
    const missing = getMissingFields(parsed);
    db.setSession(userId, 'await_field', { parsed, missing, missingIndex: 0 });
    return reply(client, event, {
      type: 'text',
      text: `📝 ${missing[0].label}を教えてください。`,
    });
  }

  // ── Default ──────────────────────────────────────────
  const remaining = db.getRemainingFreeUses(userId);
  return reply(client, event, menuFlex(profile.displayName, remaining));
}

async function handleAwaitField(client, event, userId, user, text, data) {
  const { parsed, missing, missingIndex } = data;
  const currentField = missing[missingIndex];

  // Apply the user's input to the missing field
  if (currentField.field === 'clientName') parsed.clientName = text;
  else if (currentField.field === 'amount') {
    const { parseAmount } = require('../services/invoiceParser');
    parsed.amount = parseAmount(text) || parseInt(text.replace(/[^\d]/g, ''));
    if (!parsed.amount) {
      return reply(client, event, { type: 'text', text: '⚠️ 金額を数字で入力してください。例：15万円 / 150000' });
    }
  } else if (currentField.field === 'description') parsed.description = text;

  const nextIndex = missingIndex + 1;
  if (nextIndex < missing.length) {
    db.setSession(userId, 'await_field', { parsed, missing, missingIndex: nextIndex });
    return reply(client, event, { type: 'text', text: `📝 ${missing[nextIndex].label}を教えてください。` });
  }

  // All fields collected
  parsed.confidence = 100;
  db.setSession(userId, 'confirm', parsed);
  return reply(client, event, invoiceConfirmFlex(parsed));
}

async function handleConfirm(client, event, userId, user, text, parsed) {
  const yes = ['作成', 'はい', 'ok', 'OK', 'yes', 'Yes'].includes(text);
  const no  = ['キャンセル', 'いいえ', 'no', 'No', 'NG', 'ng'].includes(text);

  if (!yes && !no) {
    return reply(client, event, {
      type: 'text', text: '「作成」または「キャンセル」を選んでください。',
      quickReply: quickReply([{ label: '✅ 作成', text: '作成' }, { label: '❌ キャンセル', text: 'キャンセル' }]),
    });
  }

  if (no) {
    db.clearSession(userId);
    return reply(client, event, { type: 'text', text: 'キャンセルしました。', quickReply: quickReply([{ label: 'メニュー', text: 'メニュー' }]) });
  }

  // Check usage limit
  if (!db.canUseService(userId)) {
    db.clearSession(userId);
    const cs = await createCheckoutSession(userId, user.display_name);
    return reply(client, event, premiumUpgradeFlex(cs.url, 0));
  }

  // Generate PDF
  try {
    const savedInvoice = db.saveInvoice(userId, parsed);
    const { filepath, filename } = await generateInvoicePDF(savedInvoice, user);
    db.incrementUsage(userId);
    db.clearSession(userId);

    const remaining = db.getRemainingFreeUses(userId);
    const total = savedInvoice.amount + Math.floor(savedInvoice.amount * (savedInvoice.taxRate || 0.10));
    const downloadUrl = `${BASE_URL}/invoice/download/${userId}/${savedInvoice.id}`;

    return push(client, userId, invoiceCreatedFlex(savedInvoice.invoiceNumber, savedInvoice.clientName, total, downloadUrl, remaining));
  } catch (err) {
    console.error('Invoice generation error:', err);
    db.clearSession(userId);
    return push(client, userId, {
      type: 'text',
      text: '❌ 請求書の生成中にエラーが発生しました。\nもう一度お試しください。',
      quickReply: quickReply([{ label: '再試行', text: '請求書作成' }, { label: 'サポート', text: 'ヘルプ' }]),
    });
  }
}

async function handleSetup(client, event, userId, text) {
  if (['キャンセル', 'cancel'].includes(text.toLowerCase())) {
    db.clearSession(userId);
    return reply(client, event, { type: 'text', text: 'キャンセルしました。' });
  }

  const updates = {};
  const lines = text.split('\n');
  for (const line of lines) {
    const [key, ...rest] = line.split(/[：:]/);
    const val = rest.join(':').trim();
    if (!val) continue;
    if (/会社名|屋号/.test(key)) updates.my_company_name = val;
    if (/担当者名|名前|氏名|お名前/.test(key)) updates.my_name = val;
    if (/住所|所在地/.test(key)) updates.my_address = val;
    if (/銀行|口座|振込/.test(key)) updates.my_bank_info = val;
  }

  if (!Object.keys(updates).length) {
    return reply(client, event, {
      type: 'text',
      text: '⚠️ 形式が正しくありません。\n\n例：\n会社名：〇〇株式会社\n担当者名：山田太郎\n銀行口座：〇〇銀行 普通 1234567',
    });
  }

  db.updateUserProfile(userId, updates);
  db.clearSession(userId);
  return reply(client, event, {
    type: 'text',
    text: '✅ 設定を保存しました！\n次回から請求書に自動で入力されます。',
    quickReply: quickReply([{ label: '請求書を作成', text: '請求書作成' }]),
  });
}

function reply(client, event, message) {
  return client.replyMessage({ replyToken: event.replyToken, messages: [message] });
}

function push(client, userId, message) {
  return client.pushMessage({ to: userId, messages: [message] });
}

module.exports = { handleMessage };
