import 'package:flutter/services.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:intl/intl.dart';
import '../models/invoice.dart';

class PdfService {
  static final NumberFormat _yenFormat = NumberFormat.currency(locale: 'ja_JP', symbol: '¥', decimalDigits: 0);
  static final DateFormat _dateFormat = DateFormat('yyyy年M月d日', 'ja');

  static Future<Uint8List> generateInvoicePdf(Invoice invoice, UserProfile user) async {
    final pdf = pw.Document();

    // Load Japanese font
    final fontData = await rootBundle.load('assets/fonts/NotoSansJP-Regular.otf');
    final font = pw.Font.ttf(fontData);
    final boldData = await rootBundle.load('assets/fonts/NotoSansJP-Bold.otf');
    final boldFont = pw.Font.ttf(boldData);

    final theme = pw.ThemeData.withFont(base: font, bold: boldFont);

    final today = _dateFormat.format(DateTime.now());
    final dueDate = _dateFormat.format(invoice.dueDate ?? DateTime.now().add(const Duration(days: 30)));

    pdf.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4,
        theme: theme,
        margin: const pw.EdgeInsets.all(40),
        build: (context) => _buildInvoicePage(invoice, user, today, dueDate),
      ),
    );

    return pdf.save();
  }

  static pw.Widget _buildInvoicePage(Invoice invoice, UserProfile user, String today, String dueDate) {
    final hasRegistration = (user.invoiceRegistrationNumber ?? '').isNotEmpty;

    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.stretch,
      children: [
        // Title
        pw.Center(
          child: pw.Text('請求書', style: pw.TextStyle(fontSize: 28, fontWeight: pw.FontWeight.bold)),
        ),
        if (hasRegistration)
          pw.Center(child: pw.Text('（適格請求書）', style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey700))),
        pw.SizedBox(height: 16),

        // Meta
        pw.Align(
          alignment: pw.Alignment.centerRight,
          child: pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.end,
            children: [
              pw.Text('請求書番号: ${invoice.invoiceNumber}', style: const pw.TextStyle(fontSize: 9)),
              pw.Text('発行日: $today', style: const pw.TextStyle(fontSize: 9)),
              pw.Text('支払期限: $dueDate', style: const pw.TextStyle(fontSize: 9)),
            ],
          ),
        ),
        pw.Divider(color: PdfColors.grey400),
        pw.SizedBox(height: 12),

        // Client + Sender
        pw.Row(
          children: [
            pw.Expanded(
              child: pw.Text('${invoice.clientName}　御中',
                style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold)),
            ),
            pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.end,
              children: [
                if (user.companyName != null) pw.Text(user.companyName!, style: const pw.TextStyle(fontSize: 9)),
                if (user.personName != null) pw.Text(user.personName!, style: const pw.TextStyle(fontSize: 9)),
                if (user.address != null) pw.Text(user.address!, style: const pw.TextStyle(fontSize: 9)),
                if (hasRegistration)
                  pw.Text('登録番号: ${user.invoiceRegistrationNumber}',
                    style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold)),
              ],
            ),
          ],
        ),
        pw.SizedBox(height: 20),

        // Total amount box
        pw.Container(
          padding: const pw.EdgeInsets.all(14),
          decoration: pw.BoxDecoration(
            color: PdfColors.grey100,
            borderRadius: const pw.BorderRadius.all(pw.Radius.circular(4)),
          ),
          child: pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Text('ご請求金額（税込）', style: const pw.TextStyle(fontSize: 10, color: PdfColors.grey700)),
              pw.SizedBox(height: 4),
              pw.Text(_yenFormat.format(invoice.totalAmount),
                style: pw.TextStyle(fontSize: 26, fontWeight: pw.FontWeight.bold)),
            ],
          ),
        ),
        pw.SizedBox(height: 24),

        // Items table
        pw.Table(
          border: pw.TableBorder.all(color: PdfColors.grey400, width: 0.5),
          columnWidths: const {
            0: pw.FlexColumnWidth(3),
            1: pw.FlexColumnWidth(1),
            2: pw.FlexColumnWidth(1.5),
            3: pw.FlexColumnWidth(0.7),
            4: pw.FlexColumnWidth(1.5),
          },
          children: [
            pw.TableRow(
              decoration: const pw.BoxDecoration(color: PdfColors.blueGrey800),
              children: [
                _headerCell('品目・内容'),
                _headerCell('税率'),
                _headerCell('単価'),
                _headerCell('数量'),
                _headerCell('金額'),
              ],
            ),
            pw.TableRow(
              children: [
                _bodyCell('${invoice.description}${invoice.isReducedRate ? '※' : ''}'),
                _bodyCell('${(invoice.taxRate * 100).toInt()}%'),
                _bodyCell(_yenFormat.format(invoice.amount)),
                _bodyCell('1'),
                _bodyCell(_yenFormat.format(invoice.amount)),
              ],
            ),
          ],
        ),
        if (invoice.isReducedRate)
          pw.Padding(
            padding: const pw.EdgeInsets.only(top: 4),
            child: pw.Text('※は軽減税率（8%）対象品目', style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey700)),
          ),

        pw.SizedBox(height: 20),

        // Tax summary by rate (インボイス制度必須)
        pw.Container(
          padding: const pw.EdgeInsets.all(8),
          decoration: pw.BoxDecoration(
            border: pw.Border.all(color: PdfColors.grey400, width: 0.5),
          ),
          child: pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Text('税率ごとの内訳', style: pw.TextStyle(fontSize: 10, fontWeight: pw.FontWeight.bold)),
              pw.SizedBox(height: 4),
              pw.Text('${(invoice.taxRate * 100).toInt()}%対象: ${_yenFormat.format(invoice.amount)}（消費税 ${_yenFormat.format(invoice.taxAmount)}）',
                style: const pw.TextStyle(fontSize: 9)),
            ],
          ),
        ),

        pw.SizedBox(height: 16),

        // Subtotals (right-aligned)
        pw.Align(
          alignment: pw.Alignment.centerRight,
          child: pw.Container(
            width: 220,
            child: pw.Column(
              children: [
                _summaryRow('小計', _yenFormat.format(invoice.amount)),
                _summaryRow('消費税(${(invoice.taxRate * 100).toInt()}%)', _yenFormat.format(invoice.taxAmount)),
                pw.Divider(color: PdfColors.grey400),
                _summaryRow('合計', _yenFormat.format(invoice.totalAmount), bold: true),
              ],
            ),
          ),
        ),

        pw.Spacer(),

        // Bank info
        if (user.bankInfo != null)
          pw.Container(
            padding: const pw.EdgeInsets.all(12),
            decoration: pw.BoxDecoration(
              color: PdfColors.lightBlue50,
              borderRadius: const pw.BorderRadius.all(pw.Radius.circular(4)),
            ),
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text('お振込先', style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold)),
                pw.SizedBox(height: 4),
                pw.Text(user.bankInfo!, style: const pw.TextStyle(fontSize: 9)),
              ],
            ),
          ),

        pw.SizedBox(height: 12),
        pw.Center(
          child: pw.Text('このPDFはフリーランスBotにより自動生成されました',
            style: const pw.TextStyle(fontSize: 7, color: PdfColors.grey500)),
        ),
      ],
    );
  }

  static pw.Widget _headerCell(String text) => pw.Padding(
    padding: const pw.EdgeInsets.all(6),
    child: pw.Text(text, style: pw.TextStyle(color: PdfColors.white, fontSize: 9, fontWeight: pw.FontWeight.bold)),
  );

  static pw.Widget _bodyCell(String text) => pw.Padding(
    padding: const pw.EdgeInsets.all(6),
    child: pw.Text(text, style: const pw.TextStyle(fontSize: 9)),
  );

  static pw.Widget _summaryRow(String label, String value, {bool bold = false}) => pw.Padding(
    padding: const pw.EdgeInsets.symmetric(vertical: 2),
    child: pw.Row(
      mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
      children: [
        pw.Text(label, style: pw.TextStyle(fontSize: bold ? 11 : 9, fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal)),
        pw.Text(value, style: pw.TextStyle(fontSize: bold ? 11 : 9, fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal)),
      ],
    ),
  );
}
