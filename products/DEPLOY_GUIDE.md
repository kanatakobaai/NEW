# デプロイガイド（kanataの作業：約30〜45分）

> Vercelではなく **Railway** を推奨します（永続ファイルシステム必要）。

---

## 必要なアカウント

| サービス | 用途 | 費用 |
|---------|------|------|
| [LINE Developers](https://developers.line.biz) | LINEボット | 無料 |
| [Railway](https://railway.app) | サーバーホスティング | $5/月〜 |
| [Stripe](https://stripe.com/jp) | 決済処理 | 無料（手数料3.6%+¥40） |

---

## Step 1: LINE公式アカウント作成（10分）

1. https://developers.line.biz → LINEでログイン
2. 「新規プロバイダー作成」→ 名前：FreelanceBot
3. 「Messaging APIチャネルを作成」
4. **チャネルシークレット** をコピー → 環境変数 `LINE_CHANNEL_SECRET`
5. 「Messaging API設定」→ チャネルアクセストークン「発行」→ コピー → `LINE_CHANNEL_ACCESS_TOKEN`
6. 「応答メッセージ」と「あいさつメッセージ」を**OFF**

---

## Step 2: Stripe設定（15分）

### 2-1. アカウント設定
1. https://stripe.com/jp → アカウント作成
2. 本番モードに切り替え（テスト→本番）
3. ビジネス情報を入力（特商法表記の事業者名・住所と整合）

### 2-2. 商品作成
1. ダッシュボード → 「製品カタログ」→ 「製品を追加」
   - 名前：**フリーランスBot プレミアム**
   - 料金：**¥980** / 月（定期支払い）
2. **Price ID**（`price_xxx...`）をコピー → `STRIPE_PRICE_ID`
3. 「APIキー」→ シークレットキー → `STRIPE_SECRET_KEY`

---

## Step 3: 法的情報の設定（5分）

特定商取引法に基づく表記には実在する事業者情報が必要です。

```env
BUSINESS_NAME=（屋号または法人名）
BUSINESS_OWNER=（代表者の戸籍上の氏名）
BUSINESS_ADDRESS=（事業所住所）
BUSINESS_PHONE=（連絡先電話）
BUSINESS_EMAIL=（連絡先メール）
```

⚠️ **個人事業主の場合の注意**：
- 戸籍上の氏名を記載する必要あり（屋号のみ不可）
- 住所・電話は「請求があれば遅滞なく開示」運用も可能
- バーチャルオフィスの利用も可

---

## Step 4: Railwayデプロイ（10分）

```bash
npm install -g @railway/cli
railway login
cd products/line-bot
railway init
railway up
```

### 永続ボリューム設定（Railway ダッシュボード）
- Volumes → New Volume
- Mount Path: `/data`

### 環境変数設定（Railway Variables）

```
LINE_CHANNEL_SECRET=...
LINE_CHANNEL_ACCESS_TOKEN=...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...（Step5で追加）
BASE_URL=https://xxx.railway.app
DATABASE_PATH=/data/db.sqlite
PORT=3000
BUSINESS_NAME=...
BUSINESS_OWNER=...
BUSINESS_ADDRESS=...
BUSINESS_PHONE=...
BUSINESS_EMAIL=...
```

---

## Step 5: Webhook設定（5分）

### LINE Webhook
1. LINE Developersコンソール → Messaging API設定
2. Webhook URL：`https://xxx.railway.app/webhook`
3. 「Webhookの利用」→ **ON**
4. 「検証」で接続確認

### Stripe Webhook
1. Stripeダッシュボード → 「開発者」→「Webhook」→「エンドポイントを追加」
2. URL：`https://xxx.railway.app/stripe/webhook`
3. イベント：
   - `checkout.session.completed`
   - `customer.subscription.deleted`
4. 「署名シークレット」をコピー → Railway の `STRIPE_WEBHOOK_SECRET` に設定

---

## Step 6: 動作確認（5分）

1. ブラウザで `https://xxx.railway.app/` を開く → ランディング表示確認
2. `/legal/tokushoho`、`/legal/privacy`、`/legal/terms` を開く → 法的ページ確認
3. LINEでBotを友達追加 → ウェルカムメッセージ確認
4. 「田中商事に10万円の請求書、件名はWebサイト制作」と送信
5. カード型確認画面で「✅ 作成」 → PDFダウンロードリンク取得
6. Stripeで「プレミアム」課金フロー確認（テストカード `4242 4242 4242 4242`）

---

## 完了後の運用コスト

| 項目 | 月額 |
|------|------|
| Railway | ¥750 |
| LINE（200通以下） | ¥0 |
| Stripe（売上3.6% + ¥40/件） | 売上による |

### 損益分岐点

| LINE通信量 | LINEプラン | 損益分岐点 |
|-----------|----------|-----------|
| 200通以下 | 無料 | **有料1人で黒字** |
| 200〜5,000通 | ライト¥5,000 | **有料7人で黒字** |
| 5,000〜30,000通 | スタンダード¥15,000 | **有料18人で黒字** |

---

## 法的監査チェックリスト（リリース前）

- [x] 特定商取引法に基づく表記（事業者名・氏名・住所・連絡先・価格・解約方法）
- [x] プライバシーポリシー（取得情報・利用目的・第三者提供）
- [x] 利用規約（禁止事項・免責・準拠法）
- [x] インボイス制度対応（登録番号・税率別表示）
- [x] 軽減税率対応（8%）
- [x] 個人情報保護法対応（同意取得・削除手続き）

---

## トラブルシューティング

**Q: PDFが文字化けする**
A: 起動ログで「Japanese font ready」が出ているか確認。出てなければNotoSansJPのDLが失敗している。手動で `assets/fonts/NotoSansJP-Regular.otf` を配置すれば解決。

**Q: PDFダウンロードリンクが404**
A: Railwayの永続ボリュームが `/data` にマウントされているか確認。`DATABASE_PATH=/data/db.sqlite` 設定があるか確認。

**Q: LINEから返信が来ない**
A: Railwayのログで `Event handling error` を確認。Webhook URLが正しいか、`/webhook` を含んでいるか確認。

**Q: Stripeで決済できない**
A: 本番モードのキーを使っているか確認。`sk_test_` ではなく `sk_live_` のキーが必要。

**Q: Webツールでログインメールが届かない**
A: SMTP設定を確認。`SMTP_HOST` `SMTP_USER` `SMTP_PASS` を環境変数に設定。
   開発時は届かなくてもサーバーログにマジックリンクURLが出力される。

**Q: 「Missing required env vars」エラーで起動失敗**
A: 必須環境変数が不足している。エラーメッセージに記載された変数を Railway に追加。

---

## 永続ボリューム（Railway）の重要設定

LINE Bot/Web ツール両方で **必ず設定** してください：

1. Railway ダッシュボード → サービス → Volumes → New Volume
2. Mount Path: `/data`
3. 環境変数 `DATABASE_PATH=/data/db.sqlite` を設定

これがないと、デプロイのたびにDBとPDFが消えます。
