import 'package:hive_flutter/hive_flutter.dart';
import '../models/invoice.dart';

class StorageService {
  static const String _invoicesBox = 'invoices';
  static const String _profileBox = 'profile';
  static const String _usageBox = 'usage';

  static Future<void> init() async {
    await Hive.initFlutter();
    Hive.registerAdapter(InvoiceAdapter());
    Hive.registerAdapter(UserProfileAdapter());
    await Hive.openBox<Invoice>(_invoicesBox);
    await Hive.openBox<UserProfile>(_profileBox);
    await Hive.openBox(_usageBox);
  }

  static Box<Invoice> get invoices => Hive.box<Invoice>(_invoicesBox);
  static Box<UserProfile> get profile => Hive.box<UserProfile>(_profileBox);
  static Box get usage => Hive.box(_usageBox);

  static UserProfile getProfile() {
    return profile.get('me') ?? UserProfile();
  }

  static Future<void> saveProfile(UserProfile p) async {
    await profile.put('me', p);
  }

  static Future<void> saveInvoice(Invoice inv) async {
    await invoices.add(inv);
    await _incrementUsage();
  }

  static List<Invoice> getInvoices() {
    final list = invoices.values.toList();
    list.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return list;
  }

  static String generateInvoiceNumber() {
    final year = DateTime.now().year;
    final count = invoices.length + 1;
    return 'INV-$year-${count.toString().padLeft(4, '0')}';
  }

  // ── Usage tracking for free tier limit ──
  static const int FREE_LIMIT = 3;

  static int getCurrentMonthUsage() {
    final month = _currentMonthKey();
    return (usage.get(month) as int?) ?? 0;
  }

  static int getRemainingFreeUses() {
    if (isPremium()) return -1; // unlimited
    return (FREE_LIMIT - getCurrentMonthUsage()).clamp(0, FREE_LIMIT);
  }

  static bool canCreateInvoice() {
    if (isPremium()) return true;
    return getCurrentMonthUsage() < FREE_LIMIT;
  }

  static Future<void> _incrementUsage() async {
    final month = _currentMonthKey();
    final current = getCurrentMonthUsage();
    await usage.put(month, current + 1);
  }

  static String _currentMonthKey() {
    final now = DateTime.now();
    return '${now.year}-${now.month.toString().padLeft(2, '0')}';
  }

  // ── Premium subscription state ──
  static bool isPremium() {
    return (usage.get('is_premium') as bool?) ?? false;
  }

  static Future<void> setPremium(bool value) async {
    await usage.put('is_premium', value);
  }
}
