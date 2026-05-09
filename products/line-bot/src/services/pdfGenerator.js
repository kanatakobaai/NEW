const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { getFontPath } = require('./fontManager');

const OUTPUT_DIR = path.join(__dirname, '../../data/pdfs');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function fmt(amount) {
  return `¥${Number(amount).toLocaleString('ja-JP')}`;
}

function fmtDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

async function generateInvoicePDF(invoice, user) {
  return new Promise((resolve, reject) => {
    const filename = `invoice_${invoice.invoiceNumber}_${Date.now()}.pdf`;
    const filepath = path.join(OUTPUT_DIR, filename);
    const fontPath = getFontPath();

    const doc = new PDFDocument({ size: 'A4', margin: 60, info: {
      Title: `請求書 ${invoice.invoiceNumber}`,
      Author: user.my_company_name || user.display_name || 'FreelanceBot',
    }});
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    const useJP = !!fontPath;
    const font = (bold) => {
      if (useJP) return doc.font(fontPath);
      return bold ? doc.font('Helvetica-Bold') : doc.font('Helvetica');
    };

    const taxAmount = Math.floor(invoice.amount * invoice.taxRate);
    const totalAmount = invoice.amount + taxAmount;
    const today = fmtDate(new Date().toISOString());
    const dueDate = invoice.dueDate
      ? fmtDate(invoice.dueDate)
      : fmtDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());

    const W = 595 - 120; // page width minus margins
    const LEFT = 60;
    const RIGHT = 535;

    // ── Title ──────────────────────────────────────────
    font(true).fontSize(28).fillColor('#1a1a1a')
      .text('請求書', LEFT, 60, { align: 'center', width: W });

    // ── Meta ───────────────────────────────────────────
    font(false).fontSize(9).fillColor('#666666');
    doc.text(`請求書番号: ${invoice.invoiceNumber}`, LEFT, 105, { align: 'right', width: W });
    doc.text(`発行日: ${today}`, LEFT, 118, { align: 'right', width: W });
    doc.text(`支払期限: ${dueDate}`, LEFT, 131, { align: 'right', width: W });

    // ── Divider ────────────────────────────────────────
    doc.moveTo(LEFT, 148).lineTo(RIGHT, 148).lineWidth(0.5).strokeColor('#cccccc').stroke();

    // ── Client ─────────────────────────────────────────
    font(true).fontSize(14).fillColor('#1a1a1a')
      .text(`${invoice.clientName}　御中`, LEFT, 160);

    // ── Sender (right side) ────────────────────────────
    const senderY = 160;
    font(false).fontSize(9).fillColor('#444444');
    let sy = senderY;
    if (user.my_company_name) { doc.text(user.my_company_name, LEFT, sy, { align: 'right', width: W }); sy += 13; }
    if (user.my_name)         { doc.text(user.my_name, LEFT, sy, { align: 'right', width: W }); sy += 13; }
    if (user.my_address)      { doc.text(user.my_address, LEFT, sy, { align: 'right', width: W }); sy += 13; }

    // ── Total Amount Box ───────────────────────────────
    const boxY = 220;
    doc.roundedRect(LEFT, boxY, W, 56, 4)
      .fillAndStroke('#f8f9fa', '#e0e0e0');
    font(false).fontSize(10).fillColor('#666666')
      .text('ご請求金額（税込）', LEFT + 16, boxY + 10);
    font(true).fontSize(26).fillColor('#1a1a1a')
      .text(fmt(totalAmount), LEFT + 16, boxY + 24);

    // ── Table ──────────────────────────────────────────
    const tableY = boxY + 80;
    const col = { desc: LEFT, price: LEFT + 240, qty: LEFT + 330, amount: LEFT + 400 };

    // Header
    doc.rect(LEFT, tableY, W, 22).fill('#2c3e50');
    font(true).fontSize(9).fillColor('#ffffff');
    doc.text('品目・内容',   col.desc  + 4, tableY + 6);
    doc.text('単価',        col.price + 4, tableY + 6);
    doc.text('数量',        col.qty   + 4, tableY + 6);
    doc.text('金額',        col.amount + 4, tableY + 6);

    // Row
    const rowY = tableY + 22;
    doc.rect(LEFT, rowY, W, 28).fill('#ffffff');
    doc.moveTo(LEFT, rowY + 28).lineTo(RIGHT, rowY + 28).lineWidth(0.5).strokeColor('#e0e0e0').stroke();
    font(false).fontSize(9).fillColor('#1a1a1a');
    doc.text(invoice.description, col.desc + 4,   rowY + 8, { width: 230, height: 20, ellipsis: true });
    doc.text(fmt(invoice.amount),  col.price + 4,  rowY + 8);
    doc.text('1',                  col.qty + 4,    rowY + 8);
    doc.text(fmt(invoice.amount),  col.amount + 4, rowY + 8);

    // Subtotals
    const subY = rowY + 40;
    const subLabel = LEFT + 310;
    const subValue = LEFT + 400;

    font(false).fontSize(9).fillColor('#444444');
    doc.text('小計',                               subLabel, subY);
    doc.text(fmt(invoice.amount),                  subValue, subY);
    doc.text(`消費税 (${invoice.taxRate * 100}%)`, subLabel, subY + 16);
    doc.text(fmt(taxAmount),                       subValue, subY + 16);

    doc.moveTo(subLabel, subY + 32).lineTo(RIGHT, subY + 32).lineWidth(0.5).strokeColor('#cccccc').stroke();

    font(true).fontSize(11).fillColor('#1a1a1a');
    doc.text('合計',         subLabel, subY + 38);
    doc.text(fmt(totalAmount), subValue, subY + 38);

    // ── Bank Info ──────────────────────────────────────
    if (user.my_bank_info) {
      const bankY = subY + 80;
      doc.roundedRect(LEFT, bankY, W, 50, 4).fill('#f0f4f8');
      font(true).fontSize(9).fillColor('#2c3e50')
        .text('お振込先', LEFT + 12, bankY + 10);
      font(false).fontSize(9).fillColor('#444444')
        .text(user.my_bank_info, LEFT + 12, bankY + 24, { width: W - 24 });
    }

    // ── Footer ─────────────────────────────────────────
    font(false).fontSize(7).fillColor('#aaaaaa')
      .text('このPDFはフリーランスBot（LINE）により自動生成されました', LEFT, 780, { align: 'center', width: W });

    doc.end();
    stream.on('finish', () => resolve({ filepath, filename }));
    stream.on('error', reject);
  });
}

module.exports = { generateInvoicePDF };
