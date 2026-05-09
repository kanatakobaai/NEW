# フリーランスBot - モバイルアプリ（Flutter）

LINE Bot/Webツールの **モバイルアプリ版**。
AdMobで収益化し、ストア検索流入を獲得する第3の収益チャネル。

## 戦略上の位置づけ

```
       │ LINE Bot      │ Webツール    │ モバイルアプリ
集客   │ SNS拡散       │ SEO         │ App Store検索
収益   │ Stripe月額    │ Stripe月額  │ AdMob + IAP
顧客   │ 既存LINEユーザー│ 検索者     │ アプリ派ユーザー
```

3つの入口で同じバックエンドを使う。

## なぜFlutter

- iOS/Android両方を1コードベースで
- 1週間で完成可能
- AdMob公式パッケージ`google_mobile_ads`が安定

## 開発開始手順

```bash
# Flutterインストール（kanataローカル環境で）
# https://docs.flutter.dev/get-started/install

cd products/flutter-app
flutter create . --org com.freelancebot --project-name freelancebot
flutter pub add google_mobile_ads
flutter pub add hive hive_flutter
flutter pub add pdf
flutter pub add http
flutter pub add intl
```

## 画面構成（仕様）

| 画面 | 機能 |
|------|------|
| ホーム | 過去の請求書一覧・新規作成ボタン |
| 作成 | フォーム（請求先・金額・件名・税率・登録番号）|
| 確認 | 内容確認・ベターレビュー・PDF生成 |
| プレビュー | PDF表示・共有・保存 |
| 設定 | 自分の情報（会社名・住所・登録番号・口座） |

## AdMob配置

| 広告 | 表示タイミング |
|------|---------------|
| バナー | ホーム画面下部 |
| インタースティシャル | PDF生成完了後（自然な切り替わり）|
| リワード | 「テンプレート色をプレミアム化」「ロゴ追加」等の機能解放 |

## 収益モデル

```
無料：月3枚まで（バナー広告表示）
   ↓ リワード広告で追加3枚
プレミアム（IAP月¥980）：無制限・広告非表示
```

## 開発タスク（次回セッション）

- [ ] Flutterプロジェクト初期化
- [ ] Hive(ローカルDB)スキーマ
- [ ] 5画面のUI実装
- [ ] PDF生成（Flutter標準pdfパッケージ）
- [ ] AdMob統合
- [ ] App内課金（IAP）統合
- [ ] App Store / Google Play申請

## 法的対応（バックエンドと共通）

- 利用規約・プライバシーポリシー：line-botと共通URL使用
- App Store Connect で App Privacy 設定必須
- AdMobの GDPR/IDFA 対応（Apple ATT）
