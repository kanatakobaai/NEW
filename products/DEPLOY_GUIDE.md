# デプロイガイド（kanataの作業：約30分）

> Vercelではなく **Railway** を使います。
> 理由：PDFファイルの保存に永続的なファイルシステムが必要なため。
> Railwayは月$5から使えます（初月は無料クレジットあり）。

---

## 必要なアカウント

| サービス | 用途 | 費用 |
|---------|------|------|
| [LINE Developers](https://developers.line.biz) | LINEボット | 無料 |
| [Railway](https://railway.app) | サーバーホスティング | $5/月〜 |
| [Stripe](https://stripe.com/jp) | 決済処理 | 無料（手数料3.6%） |

---

## Step 1: LINE公式アカウント作成（10分）

1. https://developers.line.biz → LINEでログイン
2. 「新規プロバイダー作成」→ 名前：FreelanceBot
3. 「Messaging APIチャネルを作成」
   - チャネル名：**フリーランスBot**
   - カテゴリ：ビジネス
4. **チャネルシークレット** をコピー → `LINE_CHANNEL_SECRET`
5. 「Messaging API設定」→ チャネルアクセストークン「発行」→ コピー → `LINE_CHANNEL_ACCESS_TOKEN`
6. 「応答メッセージ」と「あいさつメッセージ」をOFF（Botで制御するため）

---

## Step 2: Stripe設定（10分）

1. https://stripe.com/jp → アカウント作成
2. ダッシュボード → 「製品カタログ」→ 「製品を追加」
   - 名前：**フリーランスBot プレミアム**
   - 料金：**¥980** / 月（定期支払い）
3. 作成後の **Price ID**（`price_xxx...`）をコピー → `STRIPE_PRICE_ID`
4. 「開発者」→「APIキー」→ **シークレットキー**（`sk_live_xxx...`）をコピー → `STRIPE_SECRET_KEY`

---

## Step 3: Railwayデプロイ（10分）

```bash
# 1. Railway CLIをインストール
npm install -g @railway/cli

# 2. ログイン
railway login

# 3. line-botディレクトリでプロジェクト作成
cd products/line-bot
railway init

# 4. デプロイ
railway up
```

または Railway ダッシュボード (railway.app) から GitHub リポジトリを直接連携。

### 環境変数の設定（Railway ダッシュボード → Variables）

```
LINE_CHANNEL_SECRET=（Step1でコピーした値）
LINE_CHANNEL_ACCESS_TOKEN=（Step1でコピーした値）
STRIPE_SECRET_KEY=（Step2でコピーした値）
STRIPE_PRICE_ID=（Step2でコピーした値）
STRIPE_WEBHOOK_SECRET=（Step4で設定後に追加）
BASE_URL=https://（Railway が発行するURL）.railway.app
DATABASE_PATH=/data/db.sqlite
PORT=3000
```

---

## Step 4: Webhook設定（5分）

### LINE Webhook
1. LINE Developersコンソール → Messaging API設定
2. Webhook URL：`https://xxx.railway.app/webhook`
3. 「Webhookの利用」→ **ON**
4. 「検証」ボタンで接続確認

### Stripe Webhook
1. Stripeダッシュボード → 「開発者」→「Webhook」→「エンドポイントを追加」
2. URL：`https://xxx.railway.app/stripe/webhook`
3. イベント：`checkout.session.completed`、`customer.subscription.deleted`
4. 「署名シークレット」をコピー → Railway の `STRIPE_WEBHOOK_SECRET` に追加

---

## Step 5: テスト（5分）

1. LINE Developersコンソール → QRコードを読み取ってBotを友達追加
2. 「田中商事に10万円の請求書、件名はWebサイト制作」と送信
3. カード型の確認メッセージが表示されたら「✅ 作成」ボタンを押す
4. PDFダウンロードリンクが届けば完成🎉

---

## 完了後の運用

| タスク | 自動化 |
|--------|--------|
| ユーザー対応 | ✅ Bot自動応答 |
| PDF生成・配信 | ✅ サーバー自動処理 |
| 月額請求 | ✅ Stripe自動決済 |
| 解約処理 | ✅ Webhook自動処理 |
| **kanataの日次作業** | **0分** |

---

## コスト vs 収益シミュレーション

| 項目 | 月額 |
|------|------|
| Railway | $5（約¥750） |
| Stripe手数料（売上の3.6%） | 売上による |
| **損益分岐点** | **有料ユーザー1人（¥980）で黒字** |
