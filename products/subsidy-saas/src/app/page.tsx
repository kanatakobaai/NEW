import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-700 to-blue-900 text-white py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-block bg-blue-500 text-white text-sm font-bold px-4 py-1 rounded-full mb-6">
            🎯 IT導入補助金 対応
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
            補助金申請書を<br />
            <span className="text-yellow-300">AIが60秒で</span>自動生成
          </h1>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            会社情報と課題を入力するだけ。採択率の高い申請書文章をAIが自動作成します。
            コンサルに頼む前に、まず試してみてください。
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/dashboard"
              className="bg-yellow-400 text-blue-900 font-bold text-lg px-8 py-4 rounded-xl hover:bg-yellow-300 transition"
            >
              無料で試す（3回まで無料）
            </Link>
            <a
              href="#how"
              className="border-2 border-white text-white font-semibold text-lg px-8 py-4 rounded-xl hover:bg-white hover:text-blue-900 transition"
            >
              使い方を見る
            </a>
          </div>
          <p className="mt-4 text-blue-200 text-sm">クレジットカード不要 · 登録3秒</p>
        </div>
      </section>

      {/* Pain points */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-gray-800 mb-10">
            こんな悩みはありませんか？
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { emoji: "😩", text: "申請書の「課題」欄に何を書けばいいか分からない" },
              { emoji: "⏰", text: "コンサルに依頼すると数十万円かかる" },
              { emoji: "📝", text: "採択されるための書き方のコツが分からない" },
            ].map(({ emoji, text }) => (
              <div key={text} className="bg-red-50 border border-red-100 rounded-xl p-6 text-center">
                <div className="text-4xl mb-3">{emoji}</div>
                <p className="text-gray-700 font-medium">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-16 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-gray-800 mb-10">
            使い方はたった3ステップ
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: "01", title: "会社情報を入力", desc: "業種・従業員数・年商などの基本情報を入力" },
              { step: "02", title: "課題とツールを記述", desc: "現在困っていること・導入したいITツールを自分の言葉で入力" },
              { step: "03", title: "AIが申請書を生成", desc: "60秒で採択率の高い申請文章が完成。コピーして使うだけ" },
            ].map(({ step, title, desc }) => (
              <div key={step} className="text-center">
                <div className="w-16 h-16 bg-blue-700 text-white text-2xl font-bold rounded-full flex items-center justify-center mx-auto mb-4">
                  {step}
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">{title}</h3>
                <p className="text-gray-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-10">シンプルな料金</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="border-2 border-gray-200 rounded-2xl p-8">
              <h3 className="text-lg font-bold text-gray-600 mb-2">無料プラン</h3>
              <div className="text-4xl font-bold text-gray-800 mb-4">¥0</div>
              <ul className="text-left space-y-2 text-gray-600 mb-6">
                <li>✅ 申請書生成 3回まで</li>
                <li>✅ IT導入補助金対応</li>
                <li>✅ コピー・ダウンロード</li>
              </ul>
              <Link
                href="/dashboard"
                className="block w-full bg-gray-100 text-gray-800 font-bold py-3 rounded-xl hover:bg-gray-200 transition text-center"
              >
                無料で試す
              </Link>
            </div>
            <div className="border-2 border-blue-600 rounded-2xl p-8 bg-blue-50 relative">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-sm font-bold px-4 py-1 rounded-full">
                おすすめ
              </div>
              <h3 className="text-lg font-bold text-blue-700 mb-2">プロプラン</h3>
              <div className="text-4xl font-bold text-blue-800 mb-1">¥5,000</div>
              <div className="text-blue-600 mb-4">/ 月（税込）</div>
              <ul className="text-left space-y-2 text-gray-700 mb-6">
                <li>✅ 申請書生成 <strong>無制限</strong></li>
                <li>✅ 複数補助金対応（近日追加）</li>
                <li>✅ 過去の生成履歴</li>
                <li>✅ 優先サポート</li>
              </ul>
              <Link
                href="/dashboard"
                className="block w-full bg-blue-700 text-white font-bold py-3 rounded-xl hover:bg-blue-800 transition text-center"
              >
                今すぐ始める
              </Link>
            </div>
          </div>
          <p className="mt-6 text-gray-500 text-sm">
            ※ コンサルに頼む費用（5〜30万円）の代わりに、月額5,000円で何度でも生成できます
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 bg-blue-700 text-white text-center">
        <h2 className="text-3xl font-bold mb-4">まず無料で試してみましょう</h2>
        <p className="text-blue-200 mb-8">クレジットカード不要。60秒で申請書のドラフトが完成します。</p>
        <Link
          href="/dashboard"
          className="bg-yellow-400 text-blue-900 font-bold text-lg px-10 py-4 rounded-xl hover:bg-yellow-300 transition inline-block"
        >
          無料で試す
        </Link>
      </section>

      <footer className="py-8 text-center text-gray-500 text-sm bg-gray-100">
        <p>© 2026 補助金申請書AI</p>
        <p className="mt-2 text-xs">
          ※ 本ツールはAIによる申請書作成の補助ツールです。申請代行・採択保証は行いません。最終確認は必ずご自身または専門家が行ってください。
        </p>
      </footer>
    </main>
  );
}
