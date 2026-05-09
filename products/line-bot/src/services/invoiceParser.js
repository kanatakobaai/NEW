// Parse natural language invoice requests from LINE messages
// Example: "田中商事に15万円の請求書、件名はWebサイト制作"

function parseInvoiceRequest(text) {
  const result = {
    clientName: null,
    amount: null,
    description: null,
    dueDate: null,
    taxRate: 0.10,
    confidence: 0,
  };

  // Extract client name (Xに / X宛)
  const clientMatch = text.match(/^(.+?)(?:に|宛て?|御中)/);
  if (clientMatch) result.clientName = clientMatch[1].trim();

  // Extract amount (various formats)
  const amountPatterns = [
    /(\d+(?:,\d+)*)円/,
    /(\d+(?:\.\d+)?)万円/,
    /(\d+)千円/,
  ];
  for (const pattern of amountPatterns) {
    const m = text.match(pattern);
    if (m) {
      if (pattern.source.includes('万')) {
        result.amount = Math.round(parseFloat(m[1]) * 10000);
      } else if (pattern.source.includes('千')) {
        result.amount = parseInt(m[1]) * 1000;
      } else {
        result.amount = parseInt(m[1].replace(/,/g, ''));
      }
      break;
    }
  }

  // Extract description (件名: / 内容: / 名目: / is after の / は)
  const descPatterns = [
    /(?:件名|内容|名目|項目)[：:は]?\s*(.+?)(?:で|、|。|$)/,
    /(?:の|は)\s*(.+?)(?:の請求|で|、|。|$)/,
  ];
  for (const pattern of descPatterns) {
    const m = text.match(pattern);
    if (m && m[1].length > 1) {
      result.description = m[1].trim();
      break;
    }
  }

  // Extract due date
  const dueMatch = text.match(/(\d+)日以内|(\d+)(?:月)(\d+)(?:日)まで/);
  if (dueMatch) {
    if (dueMatch[1]) {
      const due = new Date();
      due.setDate(due.getDate() + parseInt(dueMatch[1]));
      result.dueDate = due.toISOString().slice(0, 10);
    }
  }

  // Tax rate
  if (text.includes('税抜') || text.includes('外税')) result.taxRate = 0.10;
  if (text.includes('税込') || text.includes('内税')) result.taxRate = 0;
  if (text.includes('非課税')) result.taxRate = 0;

  // Confidence score
  let score = 0;
  if (result.clientName) score += 40;
  if (result.amount) score += 40;
  if (result.description) score += 20;
  result.confidence = score;

  return result;
}

function buildConfirmMessage(parsed) {
  const taxAmount = Math.floor(parsed.amount * parsed.taxRate);
  const total = parsed.amount + taxAmount;
  return [
    '📄 以下の内容で請求書を作成します。よろしいですか？',
    '',
    `📌 請求先：${parsed.clientName}`,
    `💼 件名：${parsed.description}`,
    `💴 金額：¥${parsed.amount.toLocaleString()}`,
    parsed.taxRate > 0 ? `🧾 消費税（${parsed.taxRate * 100}%）：¥${taxAmount.toLocaleString()}` : '🧾 消費税：なし',
    `💰 合計：¥${total.toLocaleString()}`,
    '',
    '✅「作成」で確定　❌「キャンセル」で中止',
  ].join('\n');
}

module.exports = { parseInvoiceRequest, buildConfirmMessage };
