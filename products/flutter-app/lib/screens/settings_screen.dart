import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/invoice.dart';
import '../services/storage_service.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _formKey = GlobalKey<FormState>();
  final _companyCtrl = TextEditingController();
  final _nameCtrl = TextEditingController();
  final _addressCtrl = TextEditingController();
  final _bankCtrl = TextEditingController();
  final _registrationCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    final p = StorageService.getProfile();
    _companyCtrl.text = p.companyName ?? '';
    _nameCtrl.text = p.personName ?? '';
    _addressCtrl.text = p.address ?? '';
    _bankCtrl.text = p.bankInfo ?? '';
    _registrationCtrl.text = p.invoiceRegistrationNumber ?? '';
  }

  @override
  void dispose() {
    _companyCtrl.dispose();
    _nameCtrl.dispose();
    _addressCtrl.dispose();
    _bankCtrl.dispose();
    _registrationCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('設定')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('請求書に表示される情報',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 16),

              _label('会社名・屋号'),
              TextFormField(
                controller: _companyCtrl,
                decoration: const InputDecoration(hintText: '〇〇株式会社'),
                maxLength: 100,
              ),
              const SizedBox(height: 16),

              _label('担当者名'),
              TextFormField(
                controller: _nameCtrl,
                decoration: const InputDecoration(hintText: '山田太郎'),
                maxLength: 50,
              ),
              const SizedBox(height: 16),

              _label('住所'),
              TextFormField(
                controller: _addressCtrl,
                decoration: const InputDecoration(hintText: '東京都渋谷区...'),
                maxLength: 200,
              ),
              const SizedBox(height: 16),

              _label('登録番号（インボイス）'),
              TextFormField(
                controller: _registrationCtrl,
                decoration: const InputDecoration(hintText: 'T1234567890123'),
                validator: (v) {
                  if (v == null || v.isEmpty) return null;
                  if (!RegExp(r'^T?\d{13}$').hasMatch(v)) return 'T+13桁の形式で入力';
                  return null;
                },
              ),
              const SizedBox(height: 4),
              Text('設定すると適格請求書として発行されます',
                  style: TextStyle(color: Colors.grey[600], fontSize: 12)),
              const SizedBox(height: 16),

              _label('振込先'),
              TextFormField(
                controller: _bankCtrl,
                decoration: const InputDecoration(hintText: '〇〇銀行 〇〇支店 普通 1234567'),
                maxLength: 200,
              ),
              const SizedBox(height: 32),

              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _save,
                  child: const Text('保存'),
                ),
              ),
              const SizedBox(height: 32),
              const Divider(),
              const SizedBox(height: 16),
              ListTile(
                leading: const Icon(Icons.privacy_tip),
                title: const Text('プライバシーポリシー'),
                trailing: const Icon(Icons.open_in_new, size: 16),
                onTap: () => _launch('https://your-domain.com/legal/privacy'),
              ),
              ListTile(
                leading: const Icon(Icons.description),
                title: const Text('利用規約'),
                trailing: const Icon(Icons.open_in_new, size: 16),
                onTap: () => _launch('https://your-domain.com/legal/terms'),
              ),
              ListTile(
                leading: const Icon(Icons.policy),
                title: const Text('特定商取引法に基づく表記'),
                trailing: const Icon(Icons.open_in_new, size: 16),
                onTap: () => _launch('https://your-domain.com/legal/tokushoho'),
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

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;

    String? regNum = _registrationCtrl.text.trim();
    if (regNum.isNotEmpty) {
      final m = RegExp(r'T?(\d{13})').firstMatch(regNum);
      regNum = m != null ? 'T${m.group(1)}' : null;
    } else {
      regNum = null;
    }

    final profile = UserProfile(
      companyName: _companyCtrl.text.trim().isEmpty ? null : _companyCtrl.text.trim(),
      personName: _nameCtrl.text.trim().isEmpty ? null : _nameCtrl.text.trim(),
      address: _addressCtrl.text.trim().isEmpty ? null : _addressCtrl.text.trim(),
      bankInfo: _bankCtrl.text.trim().isEmpty ? null : _bankCtrl.text.trim(),
      invoiceRegistrationNumber: regNum,
      acceptedTerms: true,
    );
    await StorageService.saveProfile(profile);

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('保存しました')),
    );
    Navigator.pop(context);
  }

  Future<void> _launch(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }
}
