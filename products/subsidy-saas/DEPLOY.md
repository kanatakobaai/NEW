# 補助金申請書AI — デプロイ手順

## 1. Supabase セットアップ（5分）

1. https://supabase.com でプロジェクト作成
2. SQL Editor で以下を実行：

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  stripe_customer_id TEXT,
  subscription_status TEXT DEFAULT 'free',
  free_uses INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

3. Project Settings → API から以下を取得：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`（service_role、公開しないこと）

---

## 2. Stripe セットアップ（10分）

1. https://stripe.com でアカウント作成
2. 商品を作成：
   - 名前：「補助金申請書AI プロプラン」
   - 金額：¥5,000/月（継続課金）
   - 取得した `Price ID` を `STRIPE_PRICE_ID` に設定
3. Webhook を設定：
   - エンドポイント: `https://your-domain.vercel.app/api/webhook`
   - イベント: `checkout.session.completed`, `customer.subscription.deleted`
   - Signing secret を `STRIPE_WEBHOOK_SECRET` に設定

---

## 3. Anthropic API キー取得（2分）

1. https://console.anthropic.com でAPIキー取得
2. `ANTHROPIC_API_KEY` に設定

---

## 4. Vercel デプロイ（5分）

```bash
npm install -g vercel
vercel
```

環境変数を Vercel Dashboard → Settings → Environment Variables に設定：

| 変数名 | 値 |
|---|---|
| `ANTHROPIC_API_KEY` | sk-ant-... |
| `NEXT_PUBLIC_SUPABASE_URL` | https://xxxx.supabase.co |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | eyJ... |
| `SUPABASE_SERVICE_ROLE_KEY` | eyJ... |
| `STRIPE_SECRET_KEY` | sk_live_... |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | pk_live_... |
| `STRIPE_WEBHOOK_SECRET` | whsec_... |
| `STRIPE_PRICE_ID` | price_... |
| `NEXT_PUBLIC_BASE_URL` | https://your-domain.vercel.app |

```bash
vercel --prod
```

---

## 5. コスト試算

| 項目 | 月額コスト |
|---|---|
| Vercel（Hobbyプラン） | 無料 |
| Supabase（Freeプラン） | 無料（50万行まで） |
| Claude API（Sonnet 4.6） | 約¥50〜200（生成100件想定） |
| Stripe 手数料 | 3.6%（¥5,000×3.6% = ¥180/件） |
| **合計固定費** | **実質 ¥0〜200/月** |

月10社（¥50,000）でも原価率は0.4%以下。

---

## 6. 収益目標

| 契約数 | 月収 |
|---|---|
| 10社 | ¥50,000 |
| 26社 | ¥130,000 |
| 50社 | ¥250,000 |
| 100社 | ¥500,000 |
