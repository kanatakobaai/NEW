// 法的ページ（特商法・プライバシーポリシー・利用規約）
// kanataの会社情報を環境変数で設定する

const BUSINESS_NAME = process.env.BUSINESS_NAME || '（未設定）';
const BUSINESS_OWNER = process.env.BUSINESS_OWNER || '（未設定）';
const BUSINESS_ADDRESS = process.env.BUSINESS_ADDRESS || '（請求があった場合に開示）';
const BUSINESS_PHONE = process.env.BUSINESS_PHONE || '（請求があった場合に開示）';
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || 'support@example.com';

const wrap = (title, body) => `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8">
<title>${title} | フリーランスBot</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:720px;margin:0 auto;padding:40px 20px;line-height:1.7;color:#333}
  h1{border-bottom:2px solid #2c3e50;padding-bottom:10px;color:#2c3e50}
  h2{color:#2c3e50;margin-top:32px;font-size:1.2rem}
  table{width:100%;border-collapse:collapse;margin:20px 0}
  th,td{padding:12px;border:1px solid #ddd;text-align:left;vertical-align:top}
  th{background:#f8f9fa;width:30%;font-weight:600}
  .updated{color:#888;font-size:0.85rem;margin-top:40px;text-align:right}
  a{color:#2c3e50}
</style></head>
<body>
${body}
<p class="updated">最終更新日: 2026年5月9日</p>
</body></html>`;

function tokushoho(req, res) {
  const html = wrap('特定商取引法に基づく表記', `
<h1>特定商取引法に基づく表記</h1>

<table>
<tr><th>販売事業者</th><td>${BUSINESS_NAME}</td></tr>
<tr><th>運営責任者</th><td>${BUSINESS_OWNER}</td></tr>
<tr><th>所在地</th><td>${BUSINESS_ADDRESS}<br><span style="font-size:0.85em;color:#666">※請求があった場合、遅滞なく開示します</span></td></tr>
<tr><th>連絡先</th><td>電話: ${BUSINESS_PHONE}<br>メール: ${BUSINESS_EMAIL}<br><span style="font-size:0.85em;color:#666">※請求があった場合、遅滞なく開示します</span></td></tr>
<tr><th>サービス名</th><td>フリーランスBot</td></tr>
<tr><th>販売価格</th><td>プレミアムプラン: 月額 ¥980（税込）<br>無料プラン: 月3枚まで無料</td></tr>
<tr><th>支払方法</th><td>クレジットカード（Stripe決済）</td></tr>
<tr><th>支払時期</th><td>毎月、登録時の決済日に自動課金</td></tr>
<tr><th>サービスの提供時期</th><td>決済完了後、即時</td></tr>
<tr><th>解約方法</th><td>LINEで「解約」と送信、またはStripe顧客ポータルから手続き</td></tr>
<tr><th>返金</th><td>サービスの性質上、返金は原則として行いません。月途中の解約も日割り返金はありません。</td></tr>
<tr><th>動作環境</th><td>LINEアプリ（iOS/Android/PC）</td></tr>
</table>
`);
  res.send(html);
}

function privacy(req, res) {
  const html = wrap('プライバシーポリシー', `
<h1>プライバシーポリシー</h1>

<p>${BUSINESS_NAME}（以下「当社」）は、ユーザーの個人情報の取り扱いについて、以下の通り定めます。</p>

<h2>1. 取得する情報</h2>
<ul>
  <li>LINEユーザーID、表示名、プロフィール画像</li>
  <li>ユーザーが入力した会社名・氏名・住所・銀行情報</li>
  <li>請求書に関する情報（クライアント名・金額等）</li>
  <li>Stripe経由で取得する決済情報（カード情報は当社では保持しません）</li>
</ul>

<h2>2. 利用目的</h2>
<ul>
  <li>請求書PDFの生成・配信</li>
  <li>サブスクリプション課金の管理</li>
  <li>サービスの改善・統計分析</li>
</ul>

<h2>3. 第三者提供</h2>
<p>以下の場合を除き、第三者に提供しません：</p>
<ul>
  <li>Stripe（決済処理のため）</li>
  <li>LINE（メッセージ配信のため）</li>
  <li>法令に基づく場合</li>
</ul>

<h2>4. データの保管・削除</h2>
<p>サービス退会または解約から30日後に個人情報を削除します。請求書PDFは生成から90日後に自動削除します。</p>

<h2>5. お問い合わせ</h2>
<p>個人情報に関するお問い合わせは ${BUSINESS_EMAIL} までご連絡ください。</p>
`);
  res.send(html);
}

function terms(req, res) {
  const html = wrap('利用規約', `
<h1>フリーランスBot 利用規約</h1>

<h2>第1条（適用）</h2>
<p>本規約は、${BUSINESS_NAME}（以下「当社」）が提供する「フリーランスBot」（以下「本サービス」）の利用条件を定めます。</p>

<h2>第2条（サービス内容）</h2>
<p>本サービスは、LINEを通じて請求書PDFを自動生成するサービスです。本サービスはあくまで請求書発行を補助するツールであり、生成内容の正確性については最終的にユーザーの責任で確認・使用するものとします。</p>

<h2>第3条（料金）</h2>
<ul>
  <li>無料プラン: 月3枚まで</li>
  <li>プレミアムプラン: 月額 ¥980（税込）で無制限</li>
</ul>

<h2>第4条（解約）</h2>
<p>ユーザーはいつでも解約できます。解約後の日割り返金はありません。</p>

<h2>第5条（禁止事項）</h2>
<ul>
  <li>虚偽の請求書を作成する行為</li>
  <li>サービスの不正利用、リバースエンジニアリング</li>
  <li>他者の権利を侵害する行為</li>
  <li>法令に違反する行為</li>
</ul>

<h2>第6条（免責）</h2>
<p>当社は、本サービスの利用または利用不能から生じる一切の損害について責任を負いません（故意または重過失の場合を除く）。生成された請求書の内容について、税法・会計上の正確性は保証しません。</p>

<h2>第7条（規約変更）</h2>
<p>当社は本規約を変更することがあります。変更後の規約は本ページに掲示した時点で効力を生じます。</p>

<h2>第8条（準拠法）</h2>
<p>本規約は日本法に準拠し、本サービスに関する紛争は当社所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。</p>
`);
  res.send(html);
}

module.exports = { tokushoho, privacy, terms };
