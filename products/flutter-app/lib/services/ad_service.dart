import 'dart:io';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'storage_service.dart';

class AdService {
  // Production unit IDs (replace before release)
  // Test IDs are used by default - safe for development
  static String get _bannerUnitId {
    if (StorageService.isPremium()) return '';
    if (Platform.isAndroid) return 'ca-app-pub-3940256099942544/6300978111';
    if (Platform.isIOS) return 'ca-app-pub-3940256099942544/2934735716';
    return '';
  }

  static String get _interstitialUnitId {
    if (Platform.isAndroid) return 'ca-app-pub-3940256099942544/1033173712';
    if (Platform.isIOS) return 'ca-app-pub-3940256099942544/4411468910';
    return '';
  }

  static String get _rewardedUnitId {
    if (Platform.isAndroid) return 'ca-app-pub-3940256099942544/5224354917';
    if (Platform.isIOS) return 'ca-app-pub-3940256099942544/1712485313';
    return '';
  }

  static InterstitialAd? _interstitialAd;
  static RewardedAd? _rewardedAd;

  static Future<void> init() async {
    await MobileAds.instance.initialize();
    _loadInterstitial();
    _loadRewarded();
  }

  // ── Banner ──
  static BannerAd? createBannerAd() {
    if (StorageService.isPremium()) return null;
    final ad = BannerAd(
      adUnitId: _bannerUnitId,
      size: AdSize.banner,
      request: const AdRequest(),
      listener: BannerAdListener(
        onAdLoaded: (_) {},
        onAdFailedToLoad: (ad, err) { ad.dispose(); },
      ),
    );
    ad.load();
    return ad;
  }

  // ── Interstitial ──
  static void _loadInterstitial() {
    if (StorageService.isPremium()) return;
    InterstitialAd.load(
      adUnitId: _interstitialUnitId,
      request: const AdRequest(),
      adLoadCallback: InterstitialAdLoadCallback(
        onAdLoaded: (ad) { _interstitialAd = ad; },
        onAdFailedToLoad: (_) { _interstitialAd = null; },
      ),
    );
  }

  static Future<void> showInterstitial() async {
    if (StorageService.isPremium() || _interstitialAd == null) return;
    _interstitialAd!.fullScreenContentCallback = FullScreenContentCallback(
      onAdDismissedFullScreenContent: (ad) { ad.dispose(); _loadInterstitial(); },
      onAdFailedToShowFullScreenContent: (ad, _) { ad.dispose(); _loadInterstitial(); },
    );
    await _interstitialAd!.show();
    _interstitialAd = null;
  }

  // ── Rewarded ──
  static void _loadRewarded() {
    if (StorageService.isPremium()) return;
    RewardedAd.load(
      adUnitId: _rewardedUnitId,
      request: const AdRequest(),
      rewardedAdLoadCallback: RewardedAdLoadCallback(
        onAdLoaded: (ad) { _rewardedAd = ad; },
        onAdFailedToLoad: (_) { _rewardedAd = null; },
      ),
    );
  }

  static Future<bool> showRewarded() async {
    if (StorageService.isPremium() || _rewardedAd == null) return false;
    bool earned = false;
    _rewardedAd!.fullScreenContentCallback = FullScreenContentCallback(
      onAdDismissedFullScreenContent: (ad) { ad.dispose(); _loadRewarded(); },
      onAdFailedToShowFullScreenContent: (ad, _) { ad.dispose(); _loadRewarded(); },
    );
    await _rewardedAd!.show(onUserEarnedReward: (ad, reward) { earned = true; });
    _rewardedAd = null;
    return earned;
  }
}
