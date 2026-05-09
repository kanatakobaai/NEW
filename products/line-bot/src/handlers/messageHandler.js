const db = require('../services/database');
const { parseInvoiceRequest, buildConfirmMessage } = require('../services/invoiceParser');
const { generateInvoicePDF } = require('../services/pdfGenerator');
const { createCheckoutSession } = require('../services/stripe');
const fs = require('fs');

// In-memory session for multi-step flows
const sessions = new Map();

const MENU_MESSAGE = [
  '📋 フリーランスBot メニュー',
  '',
  '📄「請求書作成」→ 請求書をすぐ作ります',
  '📊「履歴」→ 過去の請求書一覧',
  '⚙️「設定」→ 会社名・口座情報の登録',
  '💳「プレミアム」→ 無制限プランに登録',
  '',
  '💡 直接入力例：',
  '「田中商事に15万円の請求書、件名はWebサイト制作」',
].join('\n');

const SETUP_GUIDE = [
  '⚙️ 設定モード',
  '',
  '以下の形式で送ってください：',
  '',
  '会社名：〇〇株式会社',
  '担当者名：山田太郎',
  '住所：東京都渋谷区...',
  '銀行口座：〇〇銀行 〇〇支店 普通 1234567',
  '',
  '（設定しない項目はスキップできます）',
].join('\n');

async function handleMessage(client, event) {
  const userId = event.source.userId;
  const text = event.message.text.trim();

  // Get or create user
  let profile;
  try { profile = await client.getProfile(userId); } catch (e) { profile = { displayName: 'ユーザー' }; }
  const user = db.upsertUser(userId, profile.displayName);

  const session = sessions.get(userId) || {};

  // Setup flow
  if (session.mode === 'setup') {
    return handleSetup(client, event, userId, user, text);
  }

  // Confirmation flow
  if (session.mode === 'confirm_invoice') {
    return handleInvoiceConfirmation(client, event, userId, user, text, session);
  }

  // Commands
  if (text === 'メニュー' || text === 'menu' || text === 'help' || text === 'ヘルプ') {
    sessions.delete(userId);
    return client.replyMessage(event.replyToken, { type: 'text', text: MENU_MESSAGE });
  }

  if (text === '設定' || text === 'setting') {
    sessions.set(userId, { mode: 'setup', data: {} });
    return client.replyMessage(event.replyToken, { type: 'text', text: SETUP_GUIDE });
  }

  if (text === '履歴' || text === '請求書一覧') {
    const invoices = db.getInvoices(userId);
    if (invoices.length === 0) {
      return client.replyMessage(event.replyToken, { type: 'text', text: '📊 請求書の履歴はまだありません。' });
    }
    const list = invoices.map((inv, i) =>
      `${i + 1}. ${inv.invoice_number}\n   ${inv.client_name} ¥${(inv.amount * 1.1).toLocaleString()}\n   ${inv.created_at.slice(0, 10)}`
    ).join('\n\n');
    return client.replyMessage(event.replyToken, { type: 'text', text: `📊 最近の請求書\n\n${list}` });
  }

  if (text === 'プレミアム' || text === '課金' || text === 'upgrade') {
    const session2 = await createCheckoutSession(userId, profile.displayName);
    return client.replyMessage(event.replyToken, {
      type: 'template',
      altText: 'プレミアムプランへのアップグレード',
      template: {
        type: 'buttons',
        title: '💳 プレミアムプラン',
        text: '月額980円で請求書が無制限に作れます\n（現在: 月3枚まで無料）',
        actions: [{ type: 'uri', label: '今すぐ登録', uri: session2.url }],
      },
    });
  }

  if (text === '請求書作成' || text === '請求書') {
    sessions.set(userId, { mode: 'invoice_start' });
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '📄 請求書を作ります！\n\n以下の形式で送ってください：\n\n「[請求先名]に[金額]の請求書、件名は[内容]」\n\n例：\n「田中商事に15万円の請求書、件名はWebサイト制作」',
    });
  }

  // Try to parse as invoice request (natural language)
  const parsed = parseInvoiceRequest(text);
  if (parsed.confidence >= 80) {
    sessions.set(userId, { mode: 'confirm_invoice', parsed });
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: buildConfirmMessage(parsed),
    });
  }

  if (parsed.confidence >= 40) {
    // Partial parse - ask for missing info
    const missing = [];
    if (!parsed.clientName) missing.push('請求先名（例：田中商事）');
    if (!parsed.amount) missing.push('金額（例：15万円）');
    if (!parsed.description) missing.push('件名（例：Webサイト制作）');
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `⚠️ 以下の情報が不足しています：\n\n${missing.map(m => `・${m}`).join('\n')}\n\nもう一度入力してください。`,
    });
  }

  // Default: show menu
  const remaining = db.getRemainingFreeUses(userId);
  const remainingText = remaining === Infinity ? '無制限（プレミアム）' : `残り${remaining}回（今月）`;
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: `こんにちは、${profile.displayName}さん👋\n\n${MENU_MESSAGE}\n\n📊 今月の利用状況：${remainingText}`,
  });
}

async function handleInvoiceConfirmation(client, event, userId, user, text, session) {
  if (text === '作成' || text === 'はい' || text === 'OK' || text === 'ok') {
    if (!db.canUseService(userId)) {
      sessions.delete(userId);
      const checkoutSession = await createCheckoutSession(userId, user.display_name);
      return client.replyMessage(event.replyToken, {
        type: 'template',
        altText: '今月の無料枠を使い切りました',
        template: {
          type: 'buttons',
          title: '⚠️ 今月の無料枠終了',
          text: '月額980円のプレミアムプランで無制限に使えます',
          actions: [{ type: 'uri', label: 'プレミアムに登録', uri: checkoutSession.url }],
        },
      });
    }

    try {
      await client.replyMessage(event.replyToken, { type: 'text', text: '⏳ PDFを生成中です...' });
      const { filepath } = await generateInvoicePDF(session.parsed, user);
      db.saveInvoice(userId, { ...session.parsed, pdfPath: filepath });
      db.incrementUsage(userId);
      sessions.delete(userId);

      // Send PDF as file message
      // Note: LINE requires a public URL for file sending
      // For now, confirm success and instruct to download via web
      const remaining = db.getRemainingFreeUses(userId);
      const remainingText = remaining === Infinity ? '無制限（プレミアム）' : `残り${remaining}回`;
      return client.pushMessage(userId, {
        type: 'text',
        text: [
          `✅ 請求書 ${session.parsed.invoiceNumber || ''} を作成しました！`,
          '',
          '📥 ダウンロードはこちら：',
          `${process.env.BASE_URL}/invoice/download/${userId}/latest`,
          '',
          `📊 今月の残り無料回数：${remainingText}`,
        ].join('\n'),
      });
    } catch (e) {
      console.error('PDF generation error:', e);
      sessions.delete(userId);
      return client.pushMessage(userId, { type: 'text', text: '❌ エラーが発生しました。もう一度お試しください。' });
    }
  } else if (text === 'キャンセル' || text === 'いいえ' || text === 'NG') {
    sessions.delete(userId);
    return client.replyMessage(event.replyToken, { type: 'text', text: '❌ キャンセルしました。' });
  } else {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '「作成」または「キャンセル」と送ってください。',
    });
  }
}

async function handleSetup(client, event, userId, user, text) {
  const updates = {};
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.includes('会社名：') || line.includes('会社名:')) updates.my_company_name = line.split(/：|:/)[1]?.trim();
    if (line.includes('担当者名：') || line.includes('名前：') || line.includes('氏名：')) updates.my_name = line.split(/：|:/)[1]?.trim();
    if (line.includes('住所：') || line.includes('住所:')) updates.my_address = line.split(/：|:/)[1]?.trim();
    if (line.includes('銀行') || line.includes('口座')) updates.my_bank_info = line.split(/：|:/)[1]?.trim() || line;
  }

  if (Object.keys(updates).length > 0) {
    db.updateUserProfile(userId, updates);
    sessions.delete(userId);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '✅ 設定を保存しました！\n次回から請求書に自動で入力されます。',
    });
  }

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: '⚠️ 設定の形式が正しくありません。\n\n例：\n会社名：〇〇合同会社\n担当者名：山田太郎',
  });
}

module.exports = { handleMessage };
