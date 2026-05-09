# Flutterアプリ セットアップ・リリースガイド

## 1. ローカル環境準備（kanata作業）

### Flutter SDK インストール

```bash
# Flutter公式: https://docs.flutter.dev/get-started/install
# macOSの場合
brew install --cask flutter
flutter doctor   # 必要な追加ツールが表示される
```

### プロジェクト初期化

```bash
cd products/flutter-app
flutter create . --org com.freelancebot --project-name freelancebot --platforms ios,android
flutter pub get
```

### 日本語フォント配置

```bash
# NotoSansJP-Regular.otf と NotoSansJP-Bold.otf を assets/fonts/ に配置
# https://fonts.google.com/noto/specimen/Noto+Sans+JP からDL
```

### ビルド & 実行（開発時）

```bash
flutter run                    # 接続中のデバイスで実行
flutter run --release          # 本番ビルドで実行
```

---

## 2. AdMob設定

### 2-1. AdMobアカウント作成
1. https://admob.google.com → サインアップ
2. アプリを追加：「フリーランスBot」（Android & iOS 両方）
3. 各広告ユニット作成：
   - バナー広告
   - インタースティシャル広告
   - リワード広告

### 2-2. アプリIDを設定

**Android**: `android/app/src/main/AndroidManifest.xml`
```xml
<application>
  <meta-data
    android:name="com.google.android.gms.ads.APPLICATION_ID"
    android:value="ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY"/>
</application>
```

**iOS**: `ios/Runner/Info.plist`
```xml
<key>GADApplicationIdentifier</key>
<string>ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY</string>
```

### 2-3. 広告ユニットIDを反映
`lib/services/ad_service.dart` の各 `_*UnitId` を本番IDに置き換え。

---

## 3. App内課金（IAP）設定

### Google Play Console
1. プロダクト追加：商品ID `premium_monthly_980`、定期購入、¥980/月

### App Store Connect
1. App内課金追加：プロダクトID `premium_monthly_980`、自動更新サブスク、¥980/月

### Flutter コード
`storage_service.dart` の `setPremium(true)` を呼び出すよう、IAP購入完了時に処理を追加。

---

## 4. ストア申請

### iOS
```bash
flutter build ipa
# Xcodeでビルド・署名・アップロード
```

### Android
```bash
flutter build appbundle
# Google Play Console にアップロード
```

### 必要書類（両ストア共通）
- アプリアイコン（1024x1024）
- スクリーンショット（複数サイズ）
- プライバシーポリシーURL → https://your-domain.com/legal/privacy
- App Privacy（iOS）/ Data Safety（Android）の入力

---

## 5. リリース後

| 指標 | 目標 |
|---|---|
| ASOキーワード | 「請求書 アプリ」「請求書 PDF」「インボイス 作成」 |
| 初月DL目標 | 500 |
| 課金転換率目標 | 5% |

---

## トラブルシューティング

**Q: PDFが文字化け**
A: assets/fonts/ にNotoSansJP-{Regular,Bold}.otfが配置されているか確認。

**Q: AdMob広告が表示されない**
A: テストモード（テストID使用中）のまま。本番リリース前にIDを置き換え＆テスト端末を実機に。

**Q: ビルドエラー（Hive）**
A: `flutter pub run build_runner build --delete-conflicting-outputs` を実行
