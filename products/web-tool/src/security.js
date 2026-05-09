const crypto = require('crypto');

// ── HTML escape (XSS対策) ────────────────────────────
function escape(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Required env vars validation ─────────────────────
function validateEnv() {
  const required = ['STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID', 'BASE_URL', 'SESSION_SECRET'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`❌ Missing required env vars: ${missing.join(', ')}`);
    if (process.env.NODE_ENV === 'production') process.exit(1);
  }
  if (process.env.SESSION_SECRET === 'change_me_to_random_string' || process.env.SESSION_SECRET === 'change-me-in-production') {
    console.error('❌ SESSION_SECRET is using default value. Set a random string!');
    if (process.env.NODE_ENV === 'production') process.exit(1);
  }
}

// ── Random token generation ──────────────────────────
function genToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

// ── Signed PDF download URL ──────────────────────────
function signPdfId(invoiceId, secret) {
  return crypto.createHmac('sha256', secret).update(String(invoiceId)).digest('hex').slice(0, 16);
}

function verifyPdfSig(invoiceId, sig, secret) {
  const expected = signPdfId(invoiceId, secret);
  return crypto.timingSafeEqual(Buffer.from(sig.padEnd(16, '0')), Buffer.from(expected));
}

module.exports = { escape, validateEnv, genToken, signPdfId, verifyPdfSig };
