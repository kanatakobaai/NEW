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

/**
 * インボイス制度（適格請求書）対応PDF生成
 *
 * 必須項目（消費税法施行令第49条）:
 * 1. 適格請求書発行事業者の氏名・名称・登録番号
 * 2. 取引年月日
 * 3. 取引内容（軽減税率対象品目はその旨）
 * 4. 税率ごとに区分した対価の額（税抜・税込）と適用税率
 * 5. 税率ごとに区分した消費税額等
 * 6. 書類の交付を受ける事業者の氏名・名称
 */
async function generateInvoicePDF(invoice, user) {
  return new Promise((resolve, reject) => {
    const filename = `invoice_${invoice.invoiceNumber}_${Date.now()}.pdf`;
    const filepath = path.join(OUTPUT_DIR, filename);
    const fontPath = getFontPath();

    const doc = new PDFDocument({
      size: 'A4', margin: 60,
      info: {
        Title: `請求書 ${invoice.invoiceNumber}`,
        Author: user.my_company_name || user.display_name || 'FreelanceBot',
        Subject: '適格請求書',
      },
    });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    const useJP = !!fontPath;
    if (useJP) doc.registerFont('JP', fontPath);
    const setFont = (bold) => {
      if (useJP) return doc.font('JP');
      return bold ? doc.font('Helvetica-Bold') : doc.font('Helvetica');
    };

    const taxRate = invoice.taxRate || 0.10;
    const isReducedRate = Math.abs(taxRate - 0.08) < 0.001;
    const taxAmount = Math.floor(invoice.amount * taxRate);
    const totalAmount = invoice.amount + taxAmount;
    const today = fmtDate(new Date().toISOString());
    const dueDate = invoice.dueDate
      ? fmtDate(invoice.dueDate)
      : fmtDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());

    const W = 595 - 120;
    const LEFT = 60;
    const RIGHT = 535;

    // ── Title ──────────────────────────────────────────
    setFont(true).fontSize(28).fillColor('#1a1a1a')
      .text('請求書', LEFT, 60, { align: 'center', width: W });
    if (user.invoice_registration_number) {
      setFont(false).fontSize(8).fillColor('#888888')
        .text('（適格請求書）', LEFT, 90, { align: 'center', width: W });
    }

    // ── Meta ───────────────────────────────────────────
    setFont(false).fontSize(9).fillColor('#666666');
    doc.text(`請求書番号: ${invoice.invoiceNumber}`, LEFT, 110, { align: 'right', width: W });
    doc.text(`発行日: ${today}`, LEFT, 123, { align: 'right', width: W });
    doc.text(`支払期限: ${dueDate}`, LEFT, 136, { align: 'right', width: W });

    doc.moveTo(LEFT, 153).lineTo(RIGHT, 153).lineWidth(0.5).strokeColor('#cccccc').stroke();

    // ── Client ─────────────────────────────────────────
    setFont(true).fontSize(14).fillColor('#1a1a1a')
      .text(`${invoice.clientName}　御中`, LEFT, 165);

    // ── Sender ─────────────────────────────────────────
    let sy = 165;
    setFont(false).fontSize(9).fillColor('#444444');
    if (user.my_company_name) { doc.text(user.my_company_name, LEFT, sy, { align: 'right', width: W }); sy += 13; }
    if (user.my_name)         { doc.text(user.my_name, LEFT, sy, { align: 'right', width: W }); sy += 13; }
    if (user.my_address)      { doc.text(user.my_address, LEFT, sy, { align: 'right', width: W }); sy += 13; }
    if (user.invoice_registration_number) {
      setFont(true).fillColor('#1a1a1a')
        .text(`登録番号: ${user.invoice_registration_number}`, LEFT, sy, { align: 'right', width: W });
      sy += 13;
    }

    // ── Total ──────────────────────────────────────────
    const boxY = 235;
    doc.roundedRect(LEFT, boxY, W, 56, 4)
      .fillAndStroke('#f8f9fa', '#e0e0e0');
    setFont(false).fontSize(10).fillColor('#666666')
      .text('ご請求金額（税込）', LEFT + 16, boxY + 10);
    setFont(true).fontSize(26).fillColor('#1a1a1a')
      .text(fmt(totalAmount), LEFT + 16, boxY + 24);

    // ── Items table ────────────────────────────────────
    const tableY = boxY + 80;
    const col = { desc: LEFT, rate: LEFT + 230, price: LEFT + 290, qty: LEFT + 360, amount: LEFT + 415 };

    doc.rect(LEFT, tableY, W, 22).fill('#2c3e50');
    setFont(true).fontSize(9).fillColor('#ffffff');
    doc.text('品目・内容',  col.desc + 4,   tableY + 6);
    doc.text('税率',        col.rate + 4,   tableY + 6);
    doc.text('単価',        col.price + 4,  tableY + 6);
    doc.text('数量',        col.qty + 4,    tableY + 6);
    doc.text('金額',        col.amount + 4, tableY + 6);

    const rowY = tableY + 22;
    doc.rect(LEFT, rowY, W, 32).fill('#ffffff');
    doc.moveTo(LEFT, rowY + 32).lineTo(RIGHT, rowY + 32).lineWidth(0.5).strokeColor('#e0e0e0').stroke();
    setFont(false).fontSize(9).fillColor('#1a1a1a');
    const descText = invoice.description + (isReducedRate ? '※' : '');
    doc.text(descText, col.desc + 4, rowY + 10, { width: 220, height: 20, ellipsis: true });
    doc.text(`${(taxRate * 100).toFixed(0)}%`, col.rate + 4, rowY + 10);
    doc.text(fmt(invoice.amount),  col.price + 4,  rowY + 10);
    doc.text('1',                  col.qty + 4,    rowY + 10);
    doc.text(fmt(invoice.amount),  col.amount + 4, rowY + 10);

    // 軽減税率の注記
    if (isReducedRate) {
      setFont(false).fontSize(8).fillColor('#666666')
        .text('※は軽減税率（8%）対象品目', LEFT, rowY + 38);
    }

    // ── Tax summary by rate (インボイス制度必須) ─────────
    const taxY = rowY + 55;
    setFont(true).fontSize(9).fillColor('#1a1a1a')
      .text('税率ごとの内訳', LEFT, taxY);

    const summaryY = taxY + 14;
    setFont(false).fontSize(9).fillColor('#444444');
    doc.text(`${(taxRate * 100).toFixed(0)}%対象`, LEFT + 10, summaryY);
    doc.text(fmt(invoice.amount), LEFT + 100, summaryY);
    doc.text(`(消費税 ${fmt(taxAmount)})`, LEFT + 200, summaryY);

    // ── Subtotals ──────────────────────────────────────
    const subY = summaryY + 30;
    const subLabel = LEFT + 310;
    const subValue = LEFT + 415;

    setFont(false).fontSize(9).fillColor('#444444');
    doc.text('小計',  subLabel, subY);
    doc.text(fmt(invoice.amount), subValue, subY);
    doc.text(`消費税(${(taxRate * 100).toFixed(0)}%)`, subLabel, subY + 16);
    doc.text(fmt(taxAmount), subValue, subY + 16);

    doc.moveTo(subLabel, subY + 32).lineTo(RIGHT, subY + 32).lineWidth(0.5).strokeColor('#cccccc').stroke();

    setFont(true).fontSize(11).fillColor('#1a1a1a');
    doc.text('合計', subLabel, subY + 38);
    doc.text(fmt(totalAmount), subValue, subY + 38);

    // ── Bank info ──────────────────────────────────────
    if (user.my_bank_info) {
      const bankY = subY + 80;
      doc.roundedRect(LEFT, bankY, W, 50, 4).fill('#f0f4f8');
      setFont(true).fontSize(9).fillColor('#2c3e50')
        .text('お振込先', LEFT + 12, bankY + 10);
      setFont(false).fontSize(9).fillColor('#444444')
        .text(user.my_bank_info, LEFT + 12, bankY + 24, { width: W - 24 });
    }

    setFont(false).fontSize(7).fillColor('#aaaaaa')
      .text('このPDFはフリーランスBot（LINE）により自動生成されました', LEFT, 780, { align: 'center', width: W });

    doc.end();
    stream.on('finish', () => resolve({ filepath, filename }));
    stream.on('error', reject);
  });
}

module.exports = { generateInvoicePDF };
