import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/invoice.dart';
import '../services/storage_service.dart';
import '../services/ad_service.dart';
import 'invoice_detail_screen.dart';

class CreateScreen extends StatefulWidget {
  const CreateScreen({super.key});

  @override
  State<CreateScreen> createState() => _CreateScreenState();
}

class _CreateScreenState extends State<CreateScreen> {
  final _formKey = GlobalKey<FormState>();
  final _clientCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final _amountCtrl = TextEditingController();
  double _taxRate = 0.10;

  @override
  void dispose() {
    _clientCtrl.dispose();
    _descCtrl.dispose();
    _amountCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('請求書を作成')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _label('請求先 *'),
              TextFormField(
                controller: _clientCtrl,
                decoration: const InputDecoration(hintText: '例：田中商事'),
                maxLength: 100,
                validator: (v) => v?.trim().isEmpty == true ? '入力してください' : null,
              ),
              const SizedBox(height: 16),

              _label('件名 *'),
              TextFormField(
                controller: _descCtrl,
                decoration: const InputDecoration(hintText: '例：Webサイト制作'),
                maxLength: 200,
                validator: (v) => v?.trim().isEmpty == true ? '入力してください' : null,
              ),
              const SizedBox(height: 16),

              _label('金額（税抜）*'),
              TextFormField(
                controller: _amountCtrl,
                decoration: const InputDecoration(hintText: '150000', prefixText: '¥ '),
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                validator: (v) {
                  if (v?.trim().isEmpty == true) return '入力してください';
                  final n = int.tryParse(v ?? '');
                  if (n == null || n <= 0) return '正の整数を入力してください';
                  if (n > 999999999) return '金額が大きすぎます';
                  return null;
                },
              ),
              const SizedBox(height: 16),

              _label('税率'),
              SegmentedButton<double>(
                segments: const [
                  ButtonSegment(value: 0.10, label: Text('10%（標準）')),
                  ButtonSegment(value: 0.08, label: Text('8%（軽減）')),
                  ButtonSegment(value: 0.0, label: Text('非課税')),
                ],
                selected: {_taxRate},
                onSelectionChanged: (s) => setState(() => _taxRate = s.first),
              ),
              const SizedBox(height: 32),

              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _onSubmit,
                  icon: const Icon(Icons.picture_as_pdf),
                  label: const Text('PDFを生成'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _label(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(text, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
  );

  Future<void> _onSubmit() async {
    if (!_formKey.currentState!.validate()) return;
    if (!StorageService.canCreateInvoice()) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('今月の無料枠を使い切りました')),
      );
      return;
    }

    final invoice = Invoice(
      invoiceNumber: StorageService.generateInvoiceNumber(),
      clientName: _clientCtrl.text.trim(),
      description: _descCtrl.text.trim(),
      amount: int.parse(_amountCtrl.text),
      taxRate: _taxRate,
      isReducedRate: _taxRate == 0.08,
    );

    await StorageService.saveInvoice(invoice);

    // Show interstitial ad after creation (free users only)
    await AdService.showInterstitial();

    if (!mounted) return;
    Navigator.pop(context, true);
    Navigator.push(context, MaterialPageRoute(
      builder: (_) => InvoiceDetailScreen(invoice: invoice),
    ));
  }
}
