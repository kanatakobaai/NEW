import 'package:flutter/material.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'package:intl/intl.dart';
import '../models/invoice.dart';
import '../services/storage_service.dart';
import '../services/ad_service.dart';
import 'create_screen.dart';
import 'settings_screen.dart';
import 'invoice_detail_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  BannerAd? _bannerAd;
  final _yenFormat = NumberFormat.currency(locale: 'ja_JP', symbol: '¥', decimalDigits: 0);
  final _dateFormat = DateFormat('M/d');

  @override
  void initState() {
    super.initState();
    _bannerAd = AdService.createBannerAd();
  }

  @override
  void dispose() {
    _bannerAd?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final invoices = StorageService.getInvoices();
    final remaining = StorageService.getRemainingFreeUses();
    final isPremium = StorageService.isPremium();

    return Scaffold(
      appBar: AppBar(
        title: const Text('フリーランスBot'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () => _navigate(const SettingsScreen()),
          ),
        ],
      ),
      body: Column(
        children: [
          // Status bar
          Container(
            padding: const EdgeInsets.all(12),
            color: isPremium ? Colors.amber[50] : Colors.blue[50],
            child: Row(
              children: [
                Icon(isPremium ? Icons.workspace_premium : Icons.info_outline,
                    color: isPremium ? Colors.amber[800] : Colors.blue[800]),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    isPremium
                        ? 'プレミアムプラン（無制限）'
                        : '今月あと$remaining枚 無料で作成できます',
                    style: TextStyle(color: isPremium ? Colors.amber[900] : Colors.blue[900]),
                  ),
                ),
                if (!isPremium)
                  TextButton(
                    onPressed: _showUpgradeDialog,
                    child: const Text('アップグレード'),
                  ),
              ],
            ),
          ),

          // Invoice list
          Expanded(
            child: invoices.isEmpty
                ? _emptyState()
                : ListView.builder(
                    padding: const EdgeInsets.all(8),
                    itemCount: invoices.length,
                    itemBuilder: (context, i) => _invoiceCard(invoices[i]),
                  ),
          ),

          // Banner ad (only for free users)
          if (_bannerAd != null && !isPremium)
            SizedBox(
              width: _bannerAd!.size.width.toDouble(),
              height: _bannerAd!.size.height.toDouble(),
              child: AdWidget(ad: _bannerAd!),
            ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _onCreatePressed,
        icon: const Icon(Icons.add),
        label: const Text('新規作成'),
      ),
    );
  }

  Widget _emptyState() => Center(
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(Icons.description_outlined, size: 80, color: Colors.grey[400]),
        const SizedBox(height: 16),
        Text('まだ請求書がありません', style: TextStyle(color: Colors.grey[600], fontSize: 16)),
        const SizedBox(height: 8),
        Text('右下の「新規作成」から始めましょう', style: TextStyle(color: Colors.grey[500])),
      ],
    ),
  );

  Widget _invoiceCard(Invoice invoice) => Card(
    margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
    child: ListTile(
      leading: CircleAvatar(
        backgroundColor: const Color(0xFF2C3E50),
        child: const Icon(Icons.description, color: Colors.white, size: 20),
      ),
      title: Text(invoice.clientName, style: const TextStyle(fontWeight: FontWeight.bold)),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(invoice.description, maxLines: 1, overflow: TextOverflow.ellipsis),
          Text('${invoice.invoiceNumber} | ${_dateFormat.format(invoice.createdAt)}',
              style: TextStyle(color: Colors.grey[600], fontSize: 12)),
        ],
      ),
      trailing: Text(
        _yenFormat.format(invoice.totalAmount),
        style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFFE74C3C), fontSize: 16),
      ),
      onTap: () => _navigate(InvoiceDetailScreen(invoice: invoice)),
    ),
  );

  Future<void> _onCreatePressed() async {
    if (!StorageService.canCreateInvoice()) {
      _showUpgradeDialog();
      return;
    }
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const CreateScreen()),
    );
    if (created == true) setState(() {});
  }

  void _showUpgradeDialog() {
    final remaining = StorageService.getRemainingFreeUses();
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('プレミアムプラン'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (remaining == 0)
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.orange[50],
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text('今月の無料枠を使い切りました', style: TextStyle(fontWeight: FontWeight.bold)),
              ),
            const SizedBox(height: 12),
            const Text('月額 ¥980', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            const Text('• 請求書を無制限に作成'),
            const Text('• 広告を非表示'),
            const Text('• 優先サポート'),
            const SizedBox(height: 16),
            if (remaining == 0) Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    icon: const Icon(Icons.video_library),
                    label: const Text('広告を見て+1枚'),
                    onPressed: () async {
                      final earned = await AdService.showRewarded();
                      if (earned && context.mounted) {
                        Navigator.pop(context);
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('+1枚 追加されました')),
                        );
                      }
                    },
                  ),
                ),
              ],
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('後で')),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('App内課金は本番版で有効になります')),
              );
            },
            child: const Text('登録する'),
          ),
        ],
      ),
    );
  }

  Future<void> _navigate(Widget screen) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
    setState(() {});
  }
}
