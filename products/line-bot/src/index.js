require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const { handleMessage } = require('./handlers/messageHandler');
const { constructWebhookEvent } = require('./services/stripe');
const db = require('./services/database');
const { ensureJapaneseFont } = require('./services/fontManager');
const { menuFlex } = require('./services/flexMessages');
const { tokushoho, privacy, terms } = require('./handlers/legalPages');
const { validateEnv, signInvoice, verifyInvoiceSig } = require('./security');

validateEnv();

const app = express();
app.set('trust proxy', 1); // behind Railway proxy
const PORT = process.env.PORT || 3000;

// Rate limiting
const webhookLimit = rateLimit({ windowMs: 60 * 1000, max: 120 });
const downloadLimit = rateLimit({ windowMs: 60 * 1000, max: 30 });
const generalLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });

const lineConfig = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

// ── LINE webhook ─────────────────────────────────────
app.post('/webhook', webhookLimit, line.middleware(lineConfig), async (req, res) => {
  res.status(200).json({ status: 'ok' });
  for (const event of req.body.events) {
    try {
      if (event.type === 'message' && event.message.type === 'text') {
        await handleMessage(client, event);
      } else if (event.type === 'follow') {
        await handleFollow(client, event);
      }
    } catch (err) {
      console.error(JSON.stringify({
        level: 'error', msg: 'Event handling error',
        error: err.message, eventType: event.type,
        ts: new Date().toISOString(),
      }));
    }
  }
});

async function handleFollow(client, event) {
  const userId = event.source.userId;
  let profile;
  try { profile = await client.getProfile(userId); } catch { profile = { displayName: 'ユーザー' }; }
  db.upsertUser(userId, profile.displayName);

  // 🔧 FIX: replyMessage instead of pushMessage saves quota (follow events have replyToken)
  await client.replyMessage({
    replyToken: event.replyToken,
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
      // 🔧 CRITICAL FIX: was calling non-existent db.db.prepare, now uses proper helper
      const user = db.getUserBySubscriptionId(sub.id);
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
app.use(generalLimit);

// ── PDF download (HMAC-signed URL only) ──────────────
app.get('/invoice/download/:userId/:invoiceId/:sig', downloadLimit, (req, res) => {
  const { userId, invoiceId, sig } = req.params;

  // ✅ Verify HMAC signature - prevents URL guessing attacks
  if (!verifyInvoiceSig(invoiceId, userId, sig)) {
    return res.status(403).send('Forbidden: invalid signature');
  }

  // ✅ Validate invoiceId is numeric (prevents path traversal)
  const id = parseInt(invoiceId);
  if (isNaN(id) || id <= 0) return res.status(400).send('Bad request');

  const invoices = db.getInvoices(userId, 100).filter(inv => inv.id === id);
  if (!invoices.length || !invoices[0].pdf_path) return res.status(404).send('請求書が見つかりません');

  const filepath = invoices[0].pdf_path;
  // ✅ Ensure path is within OUTPUT_DIR (prevent directory traversal)
  const allowedDir = path.resolve(__dirname, '../data/pdfs');
  const resolved = path.resolve(filepath);
  if (!resolved.startsWith(allowedDir)) return res.status(403).send('Forbidden');

  if (!fs.existsSync(resolved)) return res.status(404).send('ファイルが存在しません（90日経過で自動削除されます）');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${path.basename(resolved)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-cache');
  fs.createReadStream(resolved).pipe(res);
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

// ── Legal pages（法令必須） ─────────────────────────
app.get('/legal/tokushoho', tokushoho);
app.get('/legal/privacy', privacy);
app.get('/legal/terms', terms);

// ── Landing page ─────────────────────────────────────
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>フリーランスBot - LINEで請求書を30秒</title>
<meta name="description" content="LINEに一言送るだけで請求書PDFが自動生成。インボイス制度対応。月額980円で無制限。">
<style>
body{font-family:-apple-system,sans-serif;margin:0;background:#f8f9fa;color:#1a1a1a;line-height:1.6}
.hero{background:linear-gradient(135deg,#2c3e50 0%,#34495e 100%);color:#fff;padding:80px 20px;text-align:center}
.hero h1{font-size:2.5rem;margin:0 0 16px}
.hero p{font-size:1.2rem;opacity:.9}
.cta{display:inline-block;background:#06C755;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:24px;font-size:1.1rem}
.section{max-width:720px;margin:0 auto;padding:60px 20px}
.feature{background:#fff;padding:24px;border-radius:12px;margin:16px 0;box-shadow:0 2px 10px rgba(0,0,0,.05)}
.feature h3{margin-top:0;color:#2c3e50}
.price{text-align:center;padding:40px 20px;background:#fff;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.05)}
.price .amount{font-size:3rem;font-weight:bold;color:#e74c3c}
footer{background:#2c3e50;color:#fff;padding:32px 20px;text-align:center;font-size:0.9rem}
footer a{color:#fff;margin:0 12px}
</style></head><body>
<div class="hero">
  <h1>📄 フリーランスBot</h1>
  <p>LINEに一言送るだけで、請求書が30秒で完成。</p>
  <a class="cta" href="https://line.me/R/">LINEで友達追加</a>
</div>
<div class="section">
  <h2>3ステップで完成</h2>
  <div class="feature"><h3>1. LINEで送る</h3><p>「田中商事に15万円の請求書、件名はWeb制作」</p></div>
  <div class="feature"><h3>2. 内容を確認</h3><p>カード型で表示される内容を確認して「作成」をタップ</p></div>
  <div class="feature"><h3>3. PDFをダウンロード</h3><p>適格請求書（インボイス制度対応）として発行</p></div>
</div>
<div class="section">
  <h2>料金</h2>
  <div class="price">
    <h3>無料プラン</h3>
    <div class="amount">¥0</div>
    <p>月3枚まで</p>
    <hr style="margin:24px 0">
    <h3>プレミアムプラン</h3>
    <div class="amount">¥980<span style="font-size:1rem">/月</span></div>
    <p>無制限・優先サポート</p>
  </div>
</div>
<footer>
  <a href="/legal/tokushoho">特定商取引法に基づく表記</a>
  <a href="/legal/privacy">プライバシーポリシー</a>
  <a href="/legal/terms">利用規約</a>
  <p style="margin-top:20px;opacity:.6">&copy; 2026 フリーランスBot</p>
</footer>
</body></html>`);
});

// ── Health check ──────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Error handler (no stack trace leaks) ─────────────
app.use((err, req, res, next) => {
  console.error(JSON.stringify({
    level: 'error',
    msg: err.message,
    method: req.method,
    path: req.path,
    ts: new Date().toISOString(),
  }));
  if (res.headersSent) return next(err);
  res.status(500).send('Internal Server Error');
});

// ── Cron: cleanup old PDFs (90 days, GDPR compliance) ─
const PDF_DIR = path.join(__dirname, '../data/pdfs');
cron.schedule('0 3 * * *', () => {
  if (!fs.existsSync(PDF_DIR)) return;
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  let deleted = 0;
  for (const file of fs.readdirSync(PDF_DIR)) {
    const fp = path.join(PDF_DIR, file);
    try {
      const stat = fs.statSync(fp);
      if (stat.mtimeMs < cutoff) { fs.unlinkSync(fp); deleted++; }
    } catch (e) { /* ignore */ }
  }
  if (deleted > 0) console.log(`🧹 Cleaned up ${deleted} old PDFs`);
});

// ── Cron: daily SQLite backup (keep 7 days rolling) ──
const DB_PATH = process.env.DATABASE_PATH || './data/db.sqlite';
const BACKUP_DIR = path.join(path.dirname(DB_PATH), 'backups');
cron.schedule('0 2 * * *', () => {
  if (!fs.existsSync(DB_PATH)) return;
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    fs.copyFileSync(DB_PATH, path.join(BACKUP_DIR, `db-${stamp}.sqlite`));

    // Remove backups older than 7 days
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const f of fs.readdirSync(BACKUP_DIR)) {
      const fp = path.join(BACKUP_DIR, f);
      try {
        if (fs.statSync(fp).mtimeMs < cutoff) fs.unlinkSync(fp);
      } catch (e) { /* ignore */ }
    }
    console.log(`💾 DB backup: db-${stamp}.sqlite`);
  } catch (e) {
    console.error('DB backup failed:', e.message);
  }
});

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
