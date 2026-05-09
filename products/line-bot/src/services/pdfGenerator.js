const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = './data/pdfs';
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function formatCurrency(amount) {
  return `¥${amount.toLocaleString('ja-JP')}`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

async function generateInvoicePDF(invoice, user) {
  return new Promise((resolve, reject) => {
    const filename = `invoice_${invoice.invoiceNumber}_${Date.now()}.pdf`;
    const filepath = path.join(OUTPUT_DIR, filename);
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    const taxAmount = Math.floor(invoice.amount * invoice.taxRate);
    const totalAmount = invoice.amount + taxAmount;
    const today = formatDate(new Date().toISOString());
    const dueDate = invoice.dueDate ? formatDate(invoice.dueDate) : formatDate(
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    );

    // Register Japanese font fallback (use built-in Helvetica for now)
    // Production: add IPAGothic or NotoSansCJK font file

    // Header
    doc.fontSize(24).font('Helvetica-Bold').text('請求書', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').text(`請求書番号: ${invoice.invoiceNumber}`, { align: 'right' });
    doc.text(`発行日: ${today}`, { align: 'right' });
    doc.text(`支払期限: ${dueDate}`, { align: 'right' });

    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    // Client info
    doc.fontSize(12).font('Helvetica-Bold').text(`${invoice.clientName} 御中`);
    doc.moveDown(1);

    // Sender info
    const senderX = 350;
    const senderY = 150;
    doc.fontSize(10).font('Helvetica');
    if (user.my_company_name) doc.text(user.my_company_name, senderX, senderY);
    if (user.my_name) doc.text(user.my_name, senderX);
    if (user.my_address) doc.text(user.my_address, senderX);

    // Amount box
    doc.moveDown(2);
    doc.fontSize(12).font('Helvetica-Bold').text('ご請求金額');
    doc.fontSize(20).text(formatCurrency(totalAmount), { continued: false });
    doc.moveDown(0.5);

    // Items table
    doc.fontSize(10).font('Helvetica');
    const tableTop = doc.y + 10;
    const col1 = 50, col2 = 300, col3 = 400, col4 = 495;

    // Table header
    doc.font('Helvetica-Bold');
    doc.text('品目・内容', col1, tableTop);
    doc.text('単価', col2, tableTop);
    doc.text('数量', col3, tableTop);
    doc.text('金額', col4, tableTop, { align: 'right' });
    doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).stroke();

    // Table row
    doc.font('Helvetica');
    const rowY = tableTop + 20;
    doc.text(invoice.description, col1, rowY, { width: 240 });
    doc.text(formatCurrency(invoice.amount), col2, rowY);
    doc.text('1', col3, rowY);
    doc.text(formatCurrency(invoice.amount), col4, rowY, { align: 'right' });

    // Subtotals
    const subtotalY = rowY + 40;
    doc.moveTo(50, subtotalY - 5).lineTo(545, subtotalY - 5).stroke();
    doc.text('小計', col3, subtotalY);
    doc.text(formatCurrency(invoice.amount), col4, subtotalY, { align: 'right' });
    doc.text(`消費税 (${invoice.taxRate * 100}%)`, col3, subtotalY + 18);
    doc.text(formatCurrency(taxAmount), col4, subtotalY + 18, { align: 'right' });
    doc.font('Helvetica-Bold');
    doc.text('合計', col3, subtotalY + 36);
    doc.text(formatCurrency(totalAmount), col4, subtotalY + 36, { align: 'right' });

    // Bank info
    if (user.my_bank_info) {
      doc.moveDown(4);
      doc.font('Helvetica-Bold').text('お振込先');
      doc.font('Helvetica').text(user.my_bank_info);
    }

    // Footer
    doc.fontSize(8).font('Helvetica').text(
      'このPDFはFreelance Bot（LINE）により自動生成されました',
      50, 780, { align: 'center' }
    );

    doc.end();
    stream.on('finish', () => resolve({ filepath, filename }));
    stream.on('error', reject);
  });
}

module.exports = { generateInvoicePDF };
