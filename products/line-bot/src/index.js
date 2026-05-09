require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const path = require('path');
const fs = require('fs');
const { handleMessage } = require('./handlers/messageHandler');
const { constructWebhookEvent } = require('./services/stripe');
const { createCheckoutSession } = require('./services/stripe');
const db = require('./services/database');
const { ensureJapaneseFont } = require('./services/fontManager');
const { menuFlex } = require('./services/flexMessages');

const app = express();
const PORT = process.env.PORT || 3000;

const lineConfig = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

// ── LINE webhook ─────────────────────────────────────
app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  res.status(200).json({ status: 'ok' });
  for (const event of req.body.events) {
    try {
      if (event.type === 'message' && event.message.type === 'text') {
        await handleMessage(client, event);
      } else if (event.type === 'follow') {
        await handleFollow(client, event);
      }
    } catch (err) {
      console.error('Event handling error:', err);
    }
  }
});

async function handleFollow(client, event) {
  const userId = event.source.userId;
  let profile;
  try { profile = await client.getProfile(userId); } catch { profile = { displayName: 'ユーザー' }; }
  db.upsertUser(userId, profile.displayName);

  await client.pushMessage({
    to: userId,
    messages: [
      {
        type: 'text',
        text: [
          `🎉 ${profile.displayName}さん、フリーランスBotへようこそ！`,
          '',
          '📄 LINEで請求書を30秒で作れます。',
          '',
          '【使い方】',
          '「田中商事に15万円の請求書、件名はWebサイト制作」',
          '',
          'と送るだけ。あとはボタン1つで完成です。',
          '',
          '⚙️ まず「設定」と送って、会社名や口座情報を登録しましょう。',
        ].join('\n'),
      },
      menuFlex(profile.displayName, 3),
    ],
  });
}

// ── Stripe webhook ───────────────────────────────────
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  try {
    const event = await constructWebhookEvent(req.body, sig);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const lineUserId = session.metadata?.line_user_id;
      if (lineUserId) {
        db.updateSubscription(lineUserId, session.customer, session.subscription, 'active');
        await client.pushMessage({
          to: lineUserId,
          messages: [{
            type: 'text',
            text: '🎉 プレミアムプランへのご登録ありがとうございます！\n請求書が毎月無制限で作れるようになりました。',
          }],
        });
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const user = db.db?.prepare?.('SELECT * FROM users WHERE subscription_id = ?').get(sub.id);
      if (user) {
        db.updateSubscription(user.line_user_id, user.stripe_customer_id, sub.id, 'free');
        await client.pushMessage({
          to: user.line_user_id,
          messages: [{ type: 'text', text: '⚠️ プレミアムプランが終了しました。無料プラン（月3枚）に戻りました。\n再度「プレミアム」と送ると再登録できます。' }],
        });
      }
    }

    res.json({ received: true });
  } catch (e) {
    console.error('Stripe webhook error:', e);
    res.status(400).send(`Webhook Error: ${e.message}`);
  }
});

app.use(express.json());

// ── PDF download ─────────────────────────────────────
app.get('/invoice/download/:userId/:invoiceId', (req, res) => {
  const { userId, invoiceId } = req.params;
  const invoices = invoiceId === 'latest'
    ? db.getInvoices(userId, 1)
    : db.getInvoices(userId, 50).filter(inv => inv.id === parseInt(invoiceId));

  if (!invoices.length || !invoices[0].pdf_path) {
    return res.status(404).send('請求書が見つかりません');
  }
  const filepath = invoices[0].pdf_path;
  if (!fs.existsSync(filepath)) return res.status(404).send('ファイルが存在しません（期限切れの可能性があります）');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filepath)}"`);
  fs.createReadStream(filepath).pipe(res);
});

// ── Payment pages ─────────────────────────────────────
app.get('/payment/success', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"><title>登録完了</title>
<style>body{font-family:-apple-system,sans-serif;text-align:center;padding:60px 20px;background:#f8f9fa}
.card{background:#fff;border-radius:12px;padding:40px;max-width:400px;margin:0 auto;box-shadow:0 2px 20px rgba(0,0,0,.1)}
h1{color:#27ae60;font-size:2rem;margin-bottom:8px}p{color:#666;margin:8px 0}
.btn{display:inline-block;background:#06C755;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;margin-top:20px;font-weight:bold}
</style></head><body>
<div class="card"><h1>✅ 登録完了！</h1>
<p>プレミアムプランへのご登録ありがとうございます。</p>
<p>LINEに戻って、無制限に請求書を作り始めましょう。</p>
<a href="https://line.me/R/" class="btn">LINEに戻る</a></div>
</body></html>`);
});

app.get('/payment/cancel', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"><title>キャンセル</title>
<style>body{font-family:-apple-system,sans-serif;text-align:center;padding:60px 20px;background:#f8f9fa}
.card{background:#fff;border-radius:12px;padding:40px;max-width:400px;margin:0 auto;box-shadow:0 2px 20px rgba(0,0,0,.1)}
h1{color:#e67e22;font-size:1.8rem}p{color:#666}
.btn{display:inline-block;background:#2c3e50;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;margin-top:20px}
</style></head><body>
<div class="card"><h1>キャンセルしました</h1>
<p>いつでもLINEから「プレミアム」と送るとご登録いただけます。</p>
<a href="https://line.me/R/" class="btn">LINEに戻る</a></div>
</body></html>`);
});

// ── Health check ──────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Start ─────────────────────────────────────────────
async function start() {
  try {
    await ensureJapaneseFont();
    console.log('✅ Japanese font ready');
  } catch (e) {
    console.warn('⚠️ Japanese font download failed. PDF will use fallback font.', e.message);
  }
  app.listen(PORT, () => console.log(`🚀 LINE Bot running on port ${PORT}`));
}

start();
