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

## 5. コスト試算（Vercel Pro契約済み前提）

| 項目 | 月額コスト |
|---|---|
| **Vercel Pro**（契約済み） | 約¥3,000（$20）固定 |
| Supabase（Freeプラン） | 無料（50万行まで） |
| Claude API（Sonnet 4.6） | 約¥50〜200（生成100件想定） |
| Stripe 手数料 | 3.6%（¥5,000×3.6% = ¥180/件） |
| **合計固定費** | **約 ¥3,000/月** |

10社（¥50,000）でもVercel代を引いて利益¥47,000。原価率は6%以下。

### Vercel Proの利点（このプロジェクトで活かせる点）
- ✅ **商用利用が許諾されている**（HobbyプランはSaaS等の商用利用が規約上NG。Proは必須）
- ✅ **Function実行時間が最大300秒**（Hobbyは60秒）→ Claude APIの長文生成に余裕
- ✅ **帯域 1TB/月**（Hobbyは100GB）→ LP拡散時のアクセス急増にも耐える
- ✅ **本番Analytics・Speed Insights**→ LPのCVR改善に活用可能
- ✅ **チームメンバー追加可能**→ 後で外部協力者を招待しても良い

### 推奨：Function実行時間の上限を引き上げ
`/api/generate` のClaude呼び出しは長文生成で30秒前後かかる可能性があるため、Proプランの上限を活用するよう設定済みにすると安心です。

---

## 6. 収益目標

| 契約数 | 月収 |
|---|---|
| 10社 | ¥50,000 |
| 26社 | ¥130,000 |
| 50社 | ¥250,000 |
| 100社 | ¥500,000 |
