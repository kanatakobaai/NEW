# デプロイガイド（kanataの作業：30分）

## 必要なアカウント（全て無料で作れる）

| サービス | 用途 | URL |
|---------|------|-----|
| LINE Developers | LINEボット作成 | https://developers.line.biz |
| Vercel | サーバーホスティング（無料） | https://vercel.com |
| Stripe | 決済処理 | https://stripe.com/jp |

---

## Step 1: LINE公式アカウント作成（10分）

1. https://developers.line.biz にアクセス
2. 「コンソールへのログイン」→ LINEアカウントでログイン
3. 「新規プロバイダー作成」→ 名前：FreelanceBot
4. 「Messaging APIチャネルを作成」
   - チャネル名：フリーランスBot
   - チャネル説明：請求書を30秒で作れるLINEボット
5. 「チャネルシークレット」をコピー → `.env`の`LINE_CHANNEL_SECRET`に貼る
6. 「Messaging API設定」タブ →「チャネルアクセストークン」発行 → コピー → `LINE_CHANNEL_ACCESS_TOKEN`に貼る

---

## Step 2: Stripe設定（10分）

1. https://stripe.com/jp でアカウント作成
2. ダッシュボード → 「製品」→「製品を追加」
   - 名前：フリーランスBot プレミアム
   - 料金：¥980/月（定期支払い）
3. 作成後に表示される「Price ID」をコピー → `STRIPE_PRICE_ID`に貼る
4. 「APIキー」→ シークレットキーをコピー → `STRIPE_SECRET_KEY`に貼る
5. Webhookは後でVercelデプロイ後に設定

---

## Step 3: Vercelデプロイ（10分）

```bash
# 1. Vercel CLIをインストール
npm install -g vercel

# 2. line-botディレクトリで実行
cd products/line-bot
vercel

# 3. 環境変数を設定（Vercelダッシュボード → Settings → Environment Variables）
LINE_CHANNEL_SECRET=...
LINE_CHANNEL_ACCESS_TOKEN=...
STRIPE_SECRET_KEY=...
STRIPE_PRICE_ID=...
BASE_URL=https://your-project.vercel.app
```

---

## Step 4: 接続設定（5分）

### LINE Webhook設定
1. LINE Developersコンソール → Messaging API設定
2. Webhook URL：`https://your-project.vercel.app/webhook`
3. 「Webhookの利用」をON

### Stripe Webhook設定
1. Stripeダッシュボード → 「開発者」→「Webhook」
2. エンドポイント追加：`https://your-project.vercel.app/stripe/webhook`
3. イベント：`checkout.session.completed`, `customer.subscription.deleted`
4. 署名シークレットをコピー → `STRIPE_WEBHOOK_SECRET`に追加

---

## Step 5: テスト（5分）

1. LINE Developersコンソール → QRコードでBotを友達追加
2. 「田中商事に10万円の請求書、件名はWebサイト制作」と送信
3. 請求書確認メッセージが来たら「作成」と返信
4. ダウンロードリンクが届けば完成🎉

---

## 完了後：完全自動運用

- 新規ユーザー → Bot自動対応
- 請求書生成 → Bot自動処理
- 支払い → Stripe自動決済
- **kanataの作業：0分/日**
