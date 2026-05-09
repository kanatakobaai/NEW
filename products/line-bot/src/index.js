require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const path = require('path');
const fs = require('fs');
const { handleMessage } = require('./handlers/messageHandler');
const { constructWebhookEvent } = require('./services/stripe');
const db = require('./services/database');

const app = express();
const PORT = process.env.PORT || 3000;

const lineConfig = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

// LINE webhook
app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  res.status(200).json({ status: 'ok' });
  const events = req.body.events;
  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      await handleMessage(client, event).catch(console.error);
    } else if (event.type === 'follow') {
      await client.pushMessage(event.source.userId, {
        type: 'text',
        text: [
          '🎉 フリーランスBotへようこそ！',
          '',
          '請求書をLINEで30秒で作れます。',
          '',
          '📄 今すぐ試す：',
          '「田中商事に10万円の請求書、件名はデザイン制作」',
          '',
          '⚙️ まず「設定」と送って会社名・口座を登録しましょう。',
          '',
          '💳 無料：月3枚まで | プレミアム：月額980円で無制限',
        ].join('\n'),
      }).catch(console.error);
    }
  }
});

// Stripe webhook
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  try {
    const event = await constructWebhookEvent(req.body, sig);
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const lineUserId = session.metadata.line_user_id;
      db.updateSubscription(lineUserId, session.customer, session.subscription, 'active');
      await client.pushMessage(lineUserId, {
        type: 'text',
        text: '🎉 プレミアムプランへのご登録ありがとうございます！\n請求書が無制限で作れるようになりました。',
      }).catch(console.error);
    }
    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const user = db.db?.prepare('SELECT * FROM users WHERE subscription_id = ?').get(sub.id);
      if (user) {
        db.updateSubscription(user.line_user_id, user.stripe_customer_id, sub.id, 'free');
        await client.pushMessage(user.line_user_id, {
          type: 'text',
          text: '⚠️ プレミアムプランが終了しました。無料プラン（月3枚）に戻りました。',
        }).catch(console.error);
      }
    }
    res.json({ received: true });
  } catch (e) {
    console.error('Stripe webhook error:', e);
    res.status(400).send(`Webhook Error: ${e.message}`);
  }
});

app.use(express.json());

// PDF download endpoint
app.get('/invoice/download/:userId/latest', (req, res) => {
  const { userId } = req.params;
  const invoices = db.getInvoices(userId, 1);
  if (!invoices.length || !invoices[0].pdf_path) {
    return res.status(404).send('請求書が見つかりません');
  }
  const filepath = invoices[0].pdf_path;
  if (!fs.existsSync(filepath)) return res.status(404).send('ファイルが見つかりません');
  res.download(filepath, path.basename(filepath));
});

// Payment success/cancel pages
app.get('/payment/success', (req, res) => {
  res.send('<html><body style="font-family:sans-serif;text-align:center;padding:50px"><h1>✅ 登録完了！</h1><p>LINEに戻って請求書を作り始めましょう。</p></body></html>');
});

app.get('/payment/cancel', (req, res) => {
  res.send('<html><body style="font-family:sans-serif;text-align:center;padding:50px"><h1>キャンセルしました</h1><p>LINEに戻ってください。</p></body></html>');
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.listen(PORT, () => console.log(`LINE Bot server running on port ${PORT}`));
