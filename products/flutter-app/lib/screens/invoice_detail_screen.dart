import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:printing/printing.dart';
import 'package:share_plus/share_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'dart:io';
import '../models/invoice.dart';
import '../services/storage_service.dart';
import '../services/pdf_service.dart';

class InvoiceDetailScreen extends StatefulWidget {
  final Invoice invoice;
  const InvoiceDetailScreen({super.key, required this.invoice});

  @override
  State<InvoiceDetailScreen> createState() => _InvoiceDetailScreenState();
}

class _InvoiceDetailScreenState extends State<InvoiceDetailScreen> {
  final _yenFormat = NumberFormat.currency(locale: 'ja_JP', symbol: '¥', decimalDigits: 0);
  final _dateFormat = DateFormat('yyyy/M/d');

  @override
  Widget build(BuildContext context) {
    final inv = widget.invoice;
    return Scaffold(
      appBar: AppBar(
        title: Text(inv.invoiceNumber),
        actions: [
          IconButton(icon: const Icon(Icons.share), onPressed: _share),
        ],
      ),
      body: PdfPreview(
        build: (format) async {
          final user = StorageService.getProfile();
          return PdfService.generateInvoicePdf(inv, user);
        },
        canChangePageFormat: false,
        canChangeOrientation: false,
        actions: [
          PdfPreviewAction(
            icon: const Icon(Icons.share),
            onPressed: (_, __, ___) => _share(),
          ),
        ],
      ),
    );
  }

  Future<void> _share() async {
    final user = StorageService.getProfile();
    final pdfBytes = await PdfService.generateInvoicePdf(widget.invoice, user);
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/${widget.invoice.invoiceNumber}.pdf');
    await file.writeAsBytes(pdfBytes);
    await Share.shareXFiles([XFile(file.path)], subject: '請求書 ${widget.invoice.invoiceNumber}');
  }
}
