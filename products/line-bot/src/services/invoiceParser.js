// Natural language invoice parser - Japanese amount formats + client name detection

function parseAmount(text) {
  // Remove commas and spaces
  const t = text.replace(/,|、/g, '');

  // 1万5千円 → 15000
  const manSen2 = t.match(/(\d+(?:\.\d+)?)万(\d+)千円?/);
  if (manSen2) return Math.round(parseFloat(manSen2[1]) * 10000 + parseInt(manSen2[2]) * 1000);

  // 1万5000円 → 15000
  const manNum = t.match(/(\d+(?:\.\d+)?)万(\d{1,4})円?/);
  if (manNum) return Math.round(parseFloat(manNum[1]) * 10000 + parseInt(manNum[2]));

  // X万円
  const man = t.match(/(\d+(?:\.\d+)?)万円?/);
  if (man) return Math.round(parseFloat(man[1]) * 10000);

  // X千円
  const sen = t.match(/(\d+)千円?/);
  if (sen) return parseInt(sen[1]) * 1000;

  // X円 (with optional commas already removed)
  const yen = t.match(/(\d+)円/);
  if (yen) return parseInt(yen[1]);

  // Plain number (last resort)
  const plain = t.match(/(\d{4,})/);
  if (plain) return parseInt(plain[1]);

  return null;
}

function parseInvoiceRequest(text) {
  const result = {
    clientName: null,
    amount: null,
    description: null,
    dueDate: null,
    taxRate: 0.10,
    confidence: 0,
  };

  // ── Client name ──────────────────────────────────────
  // Patterns: XにYの請求書 / X宛て / X御中 / 請求先：X
  const clientPatterns = [
    /(?:請求先|クライアント)[：:]\s*(.+?)(?:に|へ|、|\s|$)/,
    /^(.+?)(?:に|宛て?|御中)(?:の|、|\s)/,
    /^(.+?)(?:に|宛て?)(?:\d|[一二三四五六七八九十百千万億])/,
  ];
  for (const p of clientPatterns) {
    const m = text.match(p);
    if (m && m[1].length >= 2) { result.clientName = m[1].trim(); break; }
  }

  // ── Amount ───────────────────────────────────────────
  result.amount = parseAmount(text);

  // ── Description ──────────────────────────────────────
  const descPatterns = [
    /(?:件名|内容|名目|項目|作業内容)[：:は]\s*(.+?)(?:で|、|。|$)/,
    /(?:請求書[、,]?\s*)(.{3,20})(?:の請求|で|、|。|$)/,
    /(?:の請求書[、,]?\s*)(.{2,20})(?:で|、|。|$)/,
  ];
  for (const p of descPatterns) {
    const m = text.match(p);
    if (m && m[1] && m[1].length >= 2 && !m[1].match(/^\d+$/)) {
      result.description = m[1].trim(); break;
    }
  }

  // ── Due date ─────────────────────────────────────────
  const duePatterns = [
    { re: /(\d+)日以内/, fn: (m) => addDays(parseInt(m[1])) },
    { re: /(\d+)営業日/, fn: (m) => addDays(parseInt(m[1]) * 1.4) },
    { re: /(\d+)月(\d+)日まで/, fn: (m) => `${new Date().getFullYear()}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}` },
    { re: /来月末/, fn: () => endOfNextMonth() },
    { re: /月末/, fn: () => endOfMonth() },
  ];
  for (const { re, fn } of duePatterns) {
    const m = text.match(re);
    if (m) { result.dueDate = fn(m); break; }
  }

  // ── Tax rate ─────────────────────────────────────────
  if (/税抜|外税/.test(text)) result.taxRate = 0.10;
  if (/税込|内税/.test(text)) result.taxRate = 0;
  if (/非課税/.test(text)) result.taxRate = 0;
  if (/軽減税率|8%|８％/.test(text)) result.taxRate = 0.08;

  // ── Confidence score ─────────────────────────────────
  if (result.clientName) result.confidence += 40;
  if (result.amount)     result.confidence += 40;
  if (result.description) result.confidence += 20;

  return result;
}

function addDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + Math.round(n));
  return d.toISOString().slice(0, 10);
}

function endOfMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
}

function endOfNextMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() + 2, 0);
  return d.toISOString().slice(0, 10);
}

function getMissingFields(parsed) {
  const missing = [];
  if (!parsed.clientName) missing.push({ field: 'clientName', label: '請求先名（例：田中商事）' });
  if (!parsed.amount)     missing.push({ field: 'amount',     label: '金額（例：15万円）' });
  if (!parsed.description) missing.push({ field: 'description', label: '件名（例：Webサイト制作）' });
  return missing;
}

module.exports = { parseInvoiceRequest, getMissingFields, parseAmount };
