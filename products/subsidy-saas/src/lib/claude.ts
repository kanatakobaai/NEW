import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ApplicationInput {
  companyName: string;
  industry: string;
  employees: string;
  revenue: string;
  currentProblems: string;
  itTool: string;
  expectedEffects: string;
}

export interface GeneratedApplication {
  section1: string; // 自社の現状と課題
  section2: string; // 導入するITツールと期待される効果
  section3: string; // 中長期的な事業計画・生産性向上目標
}

export async function generateApplication(
  input: ApplicationInput
): Promise<GeneratedApplication> {
  const prompt = `あなたはIT導入補助金の申請書作成の専門コンサルタントです。
採択率を最大化するために、具体的な数値・ビフォーアフター形式・国のDX推進政策との整合性を盛り込んで各セクションを作成してください。

【会社情報】
- 会社名: ${input.companyName}
- 業種: ${input.industry}
- 従業員数: ${input.employees}名
- 年商: ${input.revenue}

【現在抱えている課題（ユーザーの言葉）】
${input.currentProblems}

【導入予定のITツール】
${input.itTool}

【期待している効果（ユーザーの言葉）】
${input.expectedEffects}

---

以下の3セクションをそれぞれ400字程度で作成してください。
各セクションは「===SECTION1===」「===SECTION2===」「===SECTION3===」で区切ってください。

===SECTION1===
【自社の現状と課題】
現在の業務上の問題点を具体的な数値で記述してください。
・月○時間の手作業、月○件のミス発生など数値を含める
・業務効率の低さが経営に与えている具体的な影響を記述

===SECTION2===
【導入するITツールと期待される効果】
ITツールの機能と自社課題への適合性を説明し、具体的な数値目標を示してください。
・作業時間○%削減、生産性○%向上など
・ツール選定の理由と課題解決の論理的な説明

===SECTION3===
【中長期的な事業計画・生産性向上目標】
3年間の労働生産性向上計画を記述してください。
・年次ごとの具体的な目標値
・DX推進・働き方改革・人手不足解消との関連性を強調`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  const section1Match = text.match(/===SECTION1===([\s\S]*?)===SECTION2===/);
  const section2Match = text.match(/===SECTION2===([\s\S]*?)===SECTION3===/);
  const section3Match = text.match(/===SECTION3===([\s\S]*?)$/);

  return {
    section1: section1Match?.[1]?.trim() ?? "",
    section2: section2Match?.[1]?.trim() ?? "",
    section3: section3Match?.[1]?.trim() ?? "",
  };
}
