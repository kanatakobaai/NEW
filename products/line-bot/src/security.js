const crypto = require('crypto');

function validateEnv() {
  const required = [
    'LINE_CHANNEL_SECRET',
    'LINE_CHANNEL_ACCESS_TOKEN',
    'STRIPE_SECRET_KEY',
    'STRIPE_PRICE_ID',
    'BASE_URL',
  ];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`❌ Missing required env vars: ${missing.join(', ')}`);
    if (process.env.NODE_ENV === 'production') process.exit(1);
  }
}

function genToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

// Sign a download URL with HMAC for tamper-proof access
function signInvoice(invoiceId, lineUserId) {
  const secret = process.env.LINE_CHANNEL_SECRET || 'fallback';
  return crypto.createHmac('sha256', secret)
    .update(`${invoiceId}:${lineUserId}`)
    .digest('hex')
    .slice(0, 16);
}

function verifyInvoiceSig(invoiceId, lineUserId, sig) {
  if (!sig || sig.length !== 16) return false;
  const expected = signInvoice(invoiceId, lineUserId);
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch { return false; }
}

module.exports = { validateEnv, genToken, signInvoice, verifyInvoiceSig };
