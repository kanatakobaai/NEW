require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const Stripe = require('stripe');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3001;
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// ── Database (shared schema with LINE bot) ───────────
const dbPath = process.env.DATABASE_PATH || './data/db.sqlite';
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS web_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    stripe_customer_id TEXT,
    subscription_status TEXT DEFAULT 'free',
    free_uses_this_month INTEGER DEFAULT 0,
    last_reset_month TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    my_company_name TEXT,
    my_name TEXT,
    my_address TEXT,
    my_bank_info TEXT,
    invoice_registration_number TEXT
  );
  CREATE TABLE IF NOT EXISTS web_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    client_name TEXT,
    amount INTEGER,
    description TEXT,
    tax_rate REAL DEFAULT 0.10,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

const FREE_LIMIT = 3;

// ── Middleware ───────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-me-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 },
}));

// Stripe webhook needs raw body
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    if (event.type === 'checkout.session.completed') {
      const cs = event.data.object;
      const email = cs.metadata?.user_email;
      if (email) {
        db.prepare(`UPDATE web_users SET stripe_customer_id=?, subscription_status='active' WHERE email=?`)
          .run(cs.customer, email);
      }
    }
    res.json({ received: true });
  } catch (e) { res.status(400).send(`Error: ${e.message}`); }
});

// ── Auth (email-only, simple magic link or session) ──
function requireUser(req, res, next) {
  if (!req.session.email) return res.redirect('/login');
  let user = db.prepare('SELECT * FROM web_users WHERE email = ?').get(req.session.email);
  if (!user) {
    db.prepare('INSERT INTO web_users (email) VALUES (?)').run(req.session.email);
    user = db.prepare('SELECT * FROM web_users WHERE email = ?').get(req.session.email);
  }
  req.user = user;
  next();
}

// ── Routes ───────────────────────────────────────────
const layout = (title, body, opts = {}) => `<!DOCTYPE html><html lang="ja"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="LINEまたはWebで請求書を30秒で作成。インボイス制度対応・月額980円。">
<style>
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",sans-serif;margin:0;background:#f8f9fa;color:#1a1a1a;line-height:1.6}
.nav{background:#fff;border-bottom:1px solid #e0e0e0;padding:14px 24px;display:flex;justify-content:space-between;align-items:center}
.nav a{color:#2c3e50;text-decoration:none;margin-left:20px}
.nav .logo{font-weight:bold;font-size:1.2rem}
.container{max-width:720px;margin:0 auto;padding:32px 20px}
.card{background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 10px rgba(0,0,0,.05);margin-bottom:24px}
h1{margin-top:0;color:#2c3e50}
.field{margin-bottom:18px}
label{display:block;font-weight:600;margin-bottom:6px;color:#444;font-size:0.95rem}
input,select,textarea{width:100%;padding:12px;border:1px solid #ddd;border-radius:8px;font-size:1rem;font-family:inherit}
input:focus,select:focus,textarea:focus{outline:none;border-color:#2c3e50}
.btn{background:#2c3e50;color:#fff;padding:14px 28px;border:none;border-radius:8px;font-size:1rem;cursor:pointer;font-weight:600;text-decoration:none;display:inline-block}
.btn:hover{background:#34495e}
.btn-primary{background:#27ae60}
.btn-primary:hover{background:#229954}
.muted{color:#888;font-size:0.9rem}
footer{text-align:center;padding:32px 20px;color:#888;font-size:0.85rem}
footer a{color:#888;margin:0 8px}
.alert{padding:12px;border-radius:8px;margin-bottom:16px}
.alert-info{background:#e3f2fd;color:#1565c0;border-left:4px solid #1976d2}
.alert-warning{background:#fff3cd;color:#856404;border-left:4px solid #ffc107}
.row{display:flex;gap:16px}.row > *{flex:1}
@media (max-width:600px){.row{flex-direction:column}}
</style></head><body>
<nav class="nav">
  <a href="/" class="logo">📄 フリーランスBot</a>
  <div>
    ${opts.user ? `<span class="muted">${opts.user.email}</span> <a href="/logout">ログアウト</a>` : '<a href="/login">ログイン</a>'}
  </div>
</nav>
<div class="container">${body}</div>
<footer>
  <a href="/legal/tokushoho">特定商取引法に基づく表記</a>
  <a href="/legal/privacy">プライバシーポリシー</a>
  <a href="/legal/terms">利用規約</a>
  <p>&copy; 2026 フリーランスBot</p>
</footer>
</body></html>`;

app.get('/', (req, res) => {
  const user = req.session.email ? db.prepare('SELECT * FROM web_users WHERE email = ?').get(req.session.email) : null;
  res.send(layout('フリーランスBot - 請求書を30秒で作成', `
<div class="card">
  <h1>請求書を30秒で作成</h1>
  <p>名前と金額を入れるだけ。インボイス制度対応のPDFが即ダウンロードできます。</p>
  <a class="btn btn-primary" href="${user ? '/create' : '/login'}">今すぐ作成</a>
  ${!user ? '<p class="muted" style="margin-top:16px">LINEで使う方は <a href="https://line.me/R/" style="color:#06C755">こちら</a></p>' : ''}
</div>
<div class="card">
  <h2 style="margin-top:0">料金</h2>
  <div class="row">
    <div><strong>無料プラン</strong><br>月3枚まで</div>
    <div><strong>プレミアム</strong><br>月¥980で無制限</div>
  </div>
</div>
`, { user }));
});

app.get('/login', (req, res) => {
  res.send(layout('ログイン', `
<div class="card">
  <h1>ログイン / 新規登録</h1>
  <form action="/login" method="post">
    <div class="field"><label>メールアドレス</label><input type="email" name="email" required></div>
    <button class="btn btn-primary" type="submit">続ける</button>
  </form>
  <p class="muted" style="margin-top:24px">※ 簡易ログインです。本番版ではマジックリンク認証になります。</p>
</div>
`));
});

app.post('/login', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.redirect('/login');
  req.session.email = email;
  res.redirect('/create');
});

app.get('/logout', (req, res) => { req.session.destroy(() => res.redirect('/')); });

app.get('/create', requireUser, (req, res) => {
  const remaining = getRemaining(req.user);
  res.send(layout('請求書作成', `
<div class="card">
  <h1>請求書を作成</h1>
  ${remaining === 0 ? '<div class="alert alert-warning">今月の無料枠を使い切りました。<a href="/upgrade">プレミアムにアップグレード</a></div>' :
    remaining !== Infinity ? `<div class="alert alert-info">今月あと${remaining}枚無料で作れます</div>` : ''}
  <form action="/create" method="post">
    <div class="field"><label>請求先 *</label><input name="clientName" required placeholder="例：田中商事"></div>
    <div class="field"><label>件名 *</label><input name="description" required placeholder="例：Webサイト制作"></div>
    <div class="row">
      <div class="field"><label>金額（税抜）*</label><input name="amount" type="number" required placeholder="150000"></div>
      <div class="field"><label>税率</label>
        <select name="taxRate"><option value="0.10">10%（標準）</option><option value="0.08">8%（軽減）</option><option value="0">非課税</option></select>
      </div>
    </div>
    <button class="btn btn-primary" type="submit" ${remaining === 0 ? 'disabled style="opacity:.5"' : ''}>PDFを生成</button>
  </form>
</div>
<div class="card">
  <h2 style="margin-top:0">設定</h2>
  <p class="muted">請求書に表示される自分の情報を登録</p>
  <a class="btn" href="/settings">設定を編集</a>
</div>
`, { user: req.user }));
});

app.post('/create', requireUser, async (req, res) => {
  const remaining = getRemaining(req.user);
  if (remaining === 0) return res.redirect('/upgrade');

  const { clientName, description } = req.body;
  const amount = parseInt(req.body.amount);
  const taxRate = parseFloat(req.body.taxRate);

  const count = db.prepare('SELECT COUNT(*) as c FROM web_invoices WHERE user_email = ?').get(req.user.email).c;
  const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

  db.prepare(`INSERT INTO web_invoices (user_email, invoice_number, client_name, amount, description, tax_rate)
    VALUES (?, ?, ?, ?, ?, ?)`).run(req.user.email, invoiceNumber, clientName, amount, description, taxRate);

  if (req.user.subscription_status !== 'active') {
    incrementUsage(req.user.email);
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="invoice_${invoiceNumber}.pdf"`);
  generatePDF({ invoiceNumber, clientName, amount, description, taxRate }, req.user, res);
});

app.get('/settings', requireUser, (req, res) => {
  res.send(layout('設定', `
<div class="card">
  <h1>設定</h1>
  <form action="/settings" method="post">
    <div class="field"><label>会社名・屋号</label><input name="my_company_name" value="${req.user.my_company_name || ''}"></div>
    <div class="field"><label>担当者名</label><input name="my_name" value="${req.user.my_name || ''}"></div>
    <div class="field"><label>住所</label><input name="my_address" value="${req.user.my_address || ''}"></div>
    <div class="field"><label>登録番号（インボイス）</label><input name="invoice_registration_number" value="${req.user.invoice_registration_number || ''}" placeholder="T1234567890123" pattern="T?\\d{13}"></div>
    <div class="field"><label>振込先（銀行・支店・口座番号）</label><input name="my_bank_info" value="${req.user.my_bank_info || ''}"></div>
    <button class="btn btn-primary" type="submit">保存</button>
  </form>
</div>
`, { user: req.user }));
});

app.post('/settings', requireUser, (req, res) => {
  const fields = ['my_company_name', 'my_name', 'my_address', 'invoice_registration_number', 'my_bank_info'];
  const sets = fields.map(f => `${f} = ?`).join(', ');
  const vals = fields.map(f => req.body[f] || null);
  db.prepare(`UPDATE web_users SET ${sets} WHERE email = ?`).run(...vals, req.user.email);
  res.redirect('/create');
});

app.get('/upgrade', requireUser, async (req, res) => {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    mode: 'subscription',
    customer_email: req.user.email,
    success_url: `${process.env.BASE_URL}/?upgrade=success`,
    cancel_url: `${process.env.BASE_URL}/upgrade`,
    metadata: { user_email: req.user.email },
  });
  res.redirect(session.url);
});

// ── Legal pages ──────────────────────────────────────
const { tokushoho, privacy, terms } = require('../../line-bot/src/handlers/legalPages');
app.get('/legal/tokushoho', tokushoho);
app.get('/legal/privacy', privacy);
app.get('/legal/terms', terms);

// ── Helpers ──────────────────────────────────────────
function getRemaining(user) {
  if (user.subscription_status === 'active') return Infinity;
  const month = new Date().toISOString().slice(0, 7);
  if (user.last_reset_month !== month) {
    db.prepare(`UPDATE web_users SET free_uses_this_month=0, last_reset_month=? WHERE email=?`).run(month, user.email);
    return FREE_LIMIT;
  }
  return Math.max(0, FREE_LIMIT - user.free_uses_this_month);
}

function incrementUsage(email) {
  db.prepare('UPDATE web_users SET free_uses_this_month = free_uses_this_month + 1 WHERE email = ?').run(email);
}

function generatePDF(invoice, user, res) {
  // Reuse line-bot's PDF generator logic - simplified here
  const fontPath = path.join(__dirname, '../../line-bot/assets/fonts/NotoSansJP-Regular.otf');
  const useJP = fs.existsSync(fontPath);
  const doc = new PDFDocument({ size: 'A4', margin: 60 });
  doc.pipe(res);
  if (useJP) doc.registerFont('JP', fontPath);
  const f = (b) => useJP ? doc.font('JP') : doc.font(b ? 'Helvetica-Bold' : 'Helvetica');

  const taxAmount = Math.floor(invoice.amount * invoice.taxRate);
  const total = invoice.amount + taxAmount;
  const fmt = (a) => `¥${a.toLocaleString('ja-JP')}`;

  f(true).fontSize(28).text('請求書', { align: 'center' });
  doc.moveDown();
  f(false).fontSize(9).text(`請求書番号: ${invoice.invoiceNumber}`, { align: 'right' });
  doc.text(`発行日: ${new Date().toLocaleDateString('ja-JP')}`, { align: 'right' });
  doc.moveDown(2);
  f(true).fontSize(14).text(`${invoice.clientName} 御中`);
  doc.moveDown(0.5);
  f(false).fontSize(10);
  if (user.my_company_name) doc.text(user.my_company_name, { align: 'right' });
  if (user.my_name) doc.text(user.my_name, { align: 'right' });
  if (user.invoice_registration_number) doc.text(`登録番号: ${user.invoice_registration_number}`, { align: 'right' });
  doc.moveDown(2);
  f(true).fontSize(20).text(`ご請求金額（税込）: ${fmt(total)}`);
  doc.moveDown();
  f(false).fontSize(11).text(`件名: ${invoice.description}`);
  doc.text(`小計: ${fmt(invoice.amount)}`);
  doc.text(`消費税(${invoice.taxRate * 100}%): ${fmt(taxAmount)}`);
  doc.text(`合計: ${fmt(total)}`);
  if (user.my_bank_info) {
    doc.moveDown();
    f(true).text('お振込先');
    f(false).text(user.my_bank_info);
  }
  doc.end();
}

app.listen(PORT, () => console.log(`Web tool running on port ${PORT}`));
