// GENERATED CODE - run `flutter pub run build_runner build` to regenerate
// This file is hand-written equivalent of the build_runner output for development.

part of 'invoice.dart';

class InvoiceAdapter extends TypeAdapter<Invoice> {
  @override
  final int typeId = 0;

  @override
  Invoice read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return Invoice(
      invoiceNumber: fields[0] as String,
      clientName: fields[1] as String,
      description: fields[2] as String,
      amount: fields[3] as int,
      taxRate: (fields[4] as num).toDouble(),
      createdAt: fields[5] as DateTime?,
      dueDate: fields[6] as DateTime?,
      isReducedRate: fields[7] as bool? ?? false,
    );
  }

  @override
  void write(BinaryWriter writer, Invoice obj) {
    writer
      ..writeByte(8)
      ..writeByte(0)..write(obj.invoiceNumber)
      ..writeByte(1)..write(obj.clientName)
      ..writeByte(2)..write(obj.description)
      ..writeByte(3)..write(obj.amount)
      ..writeByte(4)..write(obj.taxRate)
      ..writeByte(5)..write(obj.createdAt)
      ..writeByte(6)..write(obj.dueDate)
      ..writeByte(7)..write(obj.isReducedRate);
  }
}

class UserProfileAdapter extends TypeAdapter<UserProfile> {
  @override
  final int typeId = 1;

  @override
  UserProfile read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return UserProfile(
      companyName: fields[0] as String?,
      personName: fields[1] as String?,
      address: fields[2] as String?,
      bankInfo: fields[3] as String?,
      invoiceRegistrationNumber: fields[4] as String?,
      acceptedTerms: fields[5] as bool? ?? false,
    );
  }

  @override
  void write(BinaryWriter writer, UserProfile obj) {
    writer
      ..writeByte(6)
      ..writeByte(0)..write(obj.companyName)
      ..writeByte(1)..write(obj.personName)
      ..writeByte(2)..write(obj.address)
      ..writeByte(3)..write(obj.bankInfo)
      ..writeByte(4)..write(obj.invoiceRegistrationNumber)
      ..writeByte(5)..write(obj.acceptedTerms);
  }
}
