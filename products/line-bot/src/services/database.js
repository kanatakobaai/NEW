const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DATABASE_PATH || './data/db.sqlite';
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    line_user_id TEXT PRIMARY KEY,
    display_name TEXT,
    stripe_customer_id TEXT,
    subscription_status TEXT DEFAULT 'free',
    subscription_id TEXT,
    free_uses_this_month INTEGER DEFAULT 0,
    last_reset_month TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    my_company_name TEXT,
    my_name TEXT,
    my_address TEXT,
    my_bank_info TEXT,
    invoice_registration_number TEXT,
    accepted_terms_at TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    line_user_id TEXT PRIMARY KEY,
    mode TEXT,
    data TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    line_user_id TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    client_name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    description TEXT NOT NULL,
    tax_rate REAL DEFAULT 0.10,
    due_date TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    pdf_path TEXT,
    FOREIGN KEY (line_user_id) REFERENCES users(line_user_id)
  );
`);

// 🔧 FIX: Idempotent migrations for existing deployments
const migrations = [
  "ALTER TABLE users ADD COLUMN invoice_registration_number TEXT",
  "ALTER TABLE users ADD COLUMN accepted_terms_at TEXT",
];
for (const sql of migrations) {
  try { db.exec(sql); }
  catch (e) { /* column already exists - ignore */ }
}

const FREE_LIMIT = 3;

function getUser(lineUserId) {
  return db.prepare('SELECT * FROM users WHERE line_user_id = ?').get(lineUserId);
}

function upsertUser(lineUserId, displayName) {
  const now = new Date().toISOString().slice(0, 7);
  const existing = getUser(lineUserId);
  if (!existing) {
    db.prepare(`
      INSERT INTO users (line_user_id, display_name, last_reset_month)
      VALUES (?, ?, ?)
    `).run(lineUserId, displayName, now);
  }
  return getUser(lineUserId);
}

function canUseService(lineUserId) {
  const user = getUser(lineUserId);
  if (!user) return false;
  if (user.subscription_status === 'active') return true;

  const now = new Date().toISOString().slice(0, 7);
  if (user.last_reset_month !== now) {
    db.prepare('UPDATE users SET free_uses_this_month = 0, last_reset_month = ? WHERE line_user_id = ?')
      .run(now, lineUserId);
    return true;
  }
  return user.free_uses_this_month < FREE_LIMIT;
}

function incrementUsage(lineUserId) {
  db.prepare('UPDATE users SET free_uses_this_month = free_uses_this_month + 1 WHERE line_user_id = ?')
    .run(lineUserId);
}

function getRemainingFreeUses(lineUserId) {
  const user = getUser(lineUserId);
  if (!user) return 0;
  if (user.subscription_status === 'active') return Infinity;
  const now = new Date().toISOString().slice(0, 7);
  if (user.last_reset_month !== now) return FREE_LIMIT;
  return Math.max(0, FREE_LIMIT - user.free_uses_this_month);
}

function updateSubscription(lineUserId, stripeCustomerId, subscriptionId, status) {
  db.prepare(`
    UPDATE users SET stripe_customer_id = ?, subscription_id = ?, subscription_status = ?
    WHERE line_user_id = ?
  `).run(stripeCustomerId, subscriptionId, status, lineUserId);
}

function updateUserProfile(lineUserId, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE users SET ${sets} WHERE line_user_id = ?`)
    .run(...keys.map(k => fields[k]), lineUserId);
}

function saveInvoice(lineUserId, invoiceData) {
  const count = db.prepare('SELECT COUNT(*) as c FROM invoices WHERE line_user_id = ?').get(lineUserId).c;
  const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
  const result = db.prepare(`
    INSERT INTO invoices (line_user_id, invoice_number, client_name, amount, description, tax_rate, due_date, pdf_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(lineUserId, invoiceNumber, invoiceData.clientName, invoiceData.amount,
    invoiceData.description, invoiceData.taxRate || 0.10, invoiceData.dueDate, invoiceData.pdfPath || null);
  return { ...invoiceData, invoiceNumber, id: result.lastInsertRowid };
}

// 🔧 FIX: Update invoice with PDF path after generation
function updateInvoicePdfPath(invoiceId, pdfPath) {
  db.prepare('UPDATE invoices SET pdf_path = ? WHERE id = ?').run(pdfPath, invoiceId);
}

function getInvoices(lineUserId, limit = 5) {
  return db.prepare('SELECT * FROM invoices WHERE line_user_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(lineUserId, limit);
}

// 🔧 FIX: Get user by Stripe subscription ID (for cancellation webhook)
function getUserBySubscriptionId(subscriptionId) {
  return db.prepare('SELECT * FROM users WHERE subscription_id = ?').get(subscriptionId);
}

function getSession(lineUserId) {
  const row = db.prepare('SELECT * FROM sessions WHERE line_user_id = ?').get(lineUserId);
  if (!row) return null;
  return { mode: row.mode, data: row.data ? JSON.parse(row.data) : {} };
}

function setSession(lineUserId, mode, data = {}) {
  db.prepare(`
    INSERT INTO sessions (line_user_id, mode, data, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(line_user_id) DO UPDATE SET mode=excluded.mode, data=excluded.data, updated_at=excluded.updated_at
  `).run(lineUserId, mode, JSON.stringify(data));
}

function clearSession(lineUserId) {
  db.prepare('DELETE FROM sessions WHERE line_user_id = ?').run(lineUserId);
}

module.exports = {
  getUser, upsertUser, canUseService, incrementUsage, getRemainingFreeUses,
  updateSubscription, updateUserProfile, saveInvoice, updateInvoicePdfPath,
  getInvoices, getUserBySubscriptionId,
  getSession, setSession, clearSession,
};
