import 'package:hive/hive.dart';

part 'invoice.g.dart';

@HiveType(typeId: 0)
class Invoice extends HiveObject {
  @HiveField(0)
  String invoiceNumber;

  @HiveField(1)
  String clientName;

  @HiveField(2)
  String description;

  @HiveField(3)
  int amount;

  @HiveField(4)
  double taxRate;

  @HiveField(5)
  DateTime createdAt;

  @HiveField(6)
  DateTime? dueDate;

  @HiveField(7)
  bool isReducedRate;

  Invoice({
    required this.invoiceNumber,
    required this.clientName,
    required this.description,
    required this.amount,
    this.taxRate = 0.10,
    DateTime? createdAt,
    this.dueDate,
    this.isReducedRate = false,
  }) : createdAt = createdAt ?? DateTime.now();

  int get taxAmount => (amount * taxRate).floor();
  int get totalAmount => amount + taxAmount;
}

@HiveType(typeId: 1)
class UserProfile extends HiveObject {
  @HiveField(0)
  String? companyName;

  @HiveField(1)
  String? personName;

  @HiveField(2)
  String? address;

  @HiveField(3)
  String? bankInfo;

  @HiveField(4)
  String? invoiceRegistrationNumber;

  @HiveField(5)
  bool acceptedTerms;

  UserProfile({
    this.companyName,
    this.personName,
    this.address,
    this.bankInfo,
    this.invoiceRegistrationNumber,
    this.acceptedTerms = false,
  });
}
