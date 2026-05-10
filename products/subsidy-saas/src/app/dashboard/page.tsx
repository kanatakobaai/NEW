"use client";

import { useState } from "react";

interface FormData {
  email: string;
  companyName: string;
  industry: string;
  employees: string;
  revenue: string;
  currentProblems: string;
  itTool: string;
  expectedEffects: string;
}

interface GeneratedResult {
  section1: string;
  section2: string;
  section3: string;
}

const INDUSTRIES = [
  "製造業", "建設業", "小売業", "飲食業", "サービス業",
  "IT・情報通信業", "医療・福祉", "運輸業", "卸売業", "その他",
];

export default function DashboardPage() {
  const [form, setForm] = useState<FormData>({
    email: "", companyName: "", industry: "", employees: "",
    revenue: "", currentProblems: "", itTool: "", expectedEffects: "",
  });
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const update = (key: keyof FormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setShowUpgrade(false);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === "FREE_LIMIT") {
          setShowUpgrade(true);
        } else {
          setError(data.error ?? "エラーが発生しました");
        }
        return;
      }
      setResult(data);
      window.scrollTo({ top: document.getElementById("result")?.offsetTop ?? 0, behavior: "smooth" });
    } catch {
      setError("通信エラーが発生しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpgrade() {
    if (!form.email) return;
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.email }),
    });
    const { url } = await res.json();
    window.location.href = url;
  }

  async function copySection(key: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  function downloadAll() {
    if (!result) return;
    const text = [
      "■ 自社の現状と課題", result.section1, "",
      "■ 導入するITツールと期待される効果", result.section2, "",
      "■ 中長期的な事業計画・生産性向上目標", result.section3,
    ].join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "IT導入補助金申請書ドラフト.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  const fields: { key: keyof FormData; label: string; type: string; placeholder: string; required?: boolean }[] = [
    { key: "email", label: "メールアドレス", type: "email", placeholder: "your@email.com", required: true },
    { key: "companyName", label: "会社名・屋号", type: "text", placeholder: "例：山田商事株式会社", required: true },
    { key: "employees", label: "従業員数", type: "text", placeholder: "例：15", required: true },
    { key: "revenue", label: "年商（おおよそ）", type: "text", placeholder: "例：5,000万円", required: true },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-700 text-white py-4 px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <a href="/" className="font-bold text-lg">補助金申請書AI</a>
          <span className="text-blue-200 text-sm">IT導入補助金 対応</span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto py-10 px-4">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">申請書を生成する</h1>
          <p className="text-gray-600">以下の情報を入力すると、AIがIT導入補助金の申請書ドラフトを作成します。</p>
          <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 inline-block">
            <span className="text-blue-700 text-sm font-medium">🎁 無料プラン：3回まで無料</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-6">
          {/* Basic info */}
          <div className="grid md:grid-cols-2 gap-6">
            {fields.map(({ key, label, type, placeholder, required }) => (
              <div key={key}>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  {label} {required && <span className="text-red-500">*</span>}
                </label>
                <input
                  type={type}
                  value={form[key]}
                  onChange={update(key)}
                  placeholder={placeholder}
                  required={required}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                業種 <span className="text-red-500">*</span>
              </label>
              <select
                value={form.industry}
                onChange={update("industry")}
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">選択してください</option>
                {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
          </div>

          {/* Text areas */}
          {[
            {
              key: "currentProblems" as keyof FormData,
              label: "現在の課題・困っていること",
              placeholder: "例：在庫管理をExcelで行っており、月末の棚卸しに3日かかっている。入力ミスも月に5〜10件発生しており、在庫の過不足が頻繁に起きている。",
              hint: "数字を含めると採択率UP（例：○時間かかる、月○件のミスが発生）",
            },
            {
              key: "itTool" as keyof FormData,
              label: "導入したいITツール",
              placeholder: "例：クラウド型在庫管理システム（例：zaico）",
              hint: "ツール名・機能を具体的に",
            },
            {
              key: "expectedEffects" as keyof FormData,
              label: "期待している効果",
              placeholder: "例：在庫確認をリアルタイムで行えるようにし、棚卸し時間を大幅に削減したい。発注漏れや過剰在庫をなくしたい。",
              hint: "どう変われば嬉しいかを自由に書いてください",
            },
          ].map(({ key, label, placeholder, hint }) => (
            <div key={key}>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                {label} <span className="text-red-500">*</span>
              </label>
              {hint && <p className="text-xs text-blue-600 mb-1">💡 {hint}</p>}
              <textarea
                value={form[key]}
                onChange={update(key)}
                placeholder={placeholder}
                required
                rows={4}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          ))}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-700 text-white font-bold text-lg py-4 rounded-xl hover:bg-blue-800 disabled:opacity-60 transition"
          >
            {loading ? "🤖 AIが申請書を生成中..." : "✨ 申請書を生成する"}
          </button>
        </form>

        {/* Upgrade modal */}
        {showUpgrade && (
          <div className="mt-8 bg-amber-50 border-2 border-amber-400 rounded-2xl p-8 text-center">
            <div className="text-5xl mb-4">🎯</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">無料枠（3回）を使い切りました</h2>
            <p className="text-gray-600 mb-6">
              プロプランにアップグレードすると無制限に生成できます。<br />
              月額5,000円（コンサル費用の1/100以下）
            </p>
            <button
              onClick={handleUpgrade}
              className="bg-blue-700 text-white font-bold text-lg px-10 py-4 rounded-xl hover:bg-blue-800 transition"
            >
              プロプランに登録する（¥5,000/月）
            </button>
          </div>
        )}

        {/* Result */}
        {result && (
          <div id="result" className="mt-10">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-800">✅ 申請書ドラフトが完成しました</h2>
              <button
                onClick={downloadAll}
                className="bg-green-600 text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-green-700 transition text-sm"
              >
                📥 まとめてダウンロード
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 text-sm text-amber-800">
              ⚠️ このドラフトをそのまま提出せず、実際の数値・状況に合わせて必ず加筆修正してください。
            </div>

            {[
              { key: "section1", title: "① 自社の現状と課題", text: result.section1 },
              { key: "section2", title: "② 導入するITツールと期待される効果", text: result.section2 },
              { key: "section3", title: "③ 中長期的な事業計画・生産性向上目標", text: result.section3 },
            ].map(({ key, title, text }) => (
              <div key={key} className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-800">{title}</h3>
                  <button
                    onClick={() => copySection(key, text)}
                    className="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition"
                  >
                    {copied === key ? "✅ コピーしました" : "📋 コピー"}
                  </button>
                </div>
                <div className="text-gray-700 leading-relaxed whitespace-pre-wrap text-sm">{text}</div>
              </div>
            ))}

            <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
              <p className="text-blue-800 font-semibold mb-2">もっと生成したいですか？</p>
              <p className="text-gray-600 text-sm mb-4">プロプランで無制限に生成できます（月額¥5,000）</p>
              <button
                onClick={handleUpgrade}
                className="bg-blue-700 text-white font-bold px-8 py-3 rounded-xl hover:bg-blue-800 transition"
              >
                プロプランにアップグレード
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
