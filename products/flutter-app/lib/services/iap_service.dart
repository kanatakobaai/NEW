import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'storage_service.dart';

const String _kProductId = 'freelancebot_premium_monthly';

class IapService {
  static final IapService _instance = IapService._internal();
  factory IapService() => _instance;
  IapService._internal();

  final InAppPurchase _iap = InAppPurchase.instance;
  StreamSubscription<List<PurchaseDetails>>? _subscription;

  ProductDetails? _product;
  bool _isAvailable = false;
  bool _isPurchasing = false;

  bool get isAvailable => _isAvailable;
  bool get isPurchasing => _isPurchasing;
  ProductDetails? get product => _product;

  // Callbacks so UI can react without storing BuildContext
  VoidCallback? onPurchaseSuccess;
  void Function(String message)? onPurchaseError;

  Future<void> init() async {
    _isAvailable = await _iap.isAvailable();
    if (!_isAvailable) return;

    _subscription = _iap.purchaseStream.listen(
      _onPurchaseUpdate,
      onError: (e) => onPurchaseError?.call('購入ストリームエラー: $e'),
    );

    await _loadProduct();
  }

  Future<void> _loadProduct() async {
    final response = await _iap.queryProductDetails({_kProductId});
    if (response.error != null) {
      debugPrint('IAP product query error: ${response.error}');
      return;
    }
    if (response.productDetails.isNotEmpty) {
      _product = response.productDetails.first;
    }
  }

  Future<void> buyPremium() async {
    if (!_isAvailable || _product == null || _isPurchasing) return;
    _isPurchasing = true;

    final param = PurchaseParam(productDetails: _product!);
    try {
      await _iap.buyNonConsumable(purchaseParam: param);
    } catch (e) {
      _isPurchasing = false;
      onPurchaseError?.call('購入を開始できませんでした: $e');
    }
  }

  Future<void> restorePurchases() async {
    if (!_isAvailable) return;
    await _iap.restorePurchases();
  }

  Future<void> _onPurchaseUpdate(List<PurchaseDetails> purchases) async {
    for (final purchase in purchases) {
      if (purchase.productID != _kProductId) continue;

      if (purchase.status == PurchaseStatus.pending) {
        // Wait — no action needed
        continue;
      }

      if (purchase.status == PurchaseStatus.purchased ||
          purchase.status == PurchaseStatus.restored) {
        await StorageService.setPremium(true);
        _isPurchasing = false;
        onPurchaseSuccess?.call();
      }

      if (purchase.status == PurchaseStatus.error) {
        _isPurchasing = false;
        final msg = purchase.error?.message ?? '不明なエラー';
        onPurchaseError?.call('購入エラー: $msg');
      }

      if (purchase.status == PurchaseStatus.canceled) {
        _isPurchasing = false;
      }

      // Complete the purchase to remove it from the queue
      if (purchase.pendingCompletePurchase) {
        await _iap.completePurchase(purchase);
      }
    }
  }

  void dispose() {
    _subscription?.cancel();
  }
}
