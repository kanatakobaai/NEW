import { NextRequest, NextResponse } from "next/server";
import { generateApplication, ApplicationInput } from "@/lib/claude";
import { canGenerate, incrementUsage } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, ...input } = body as { email: string } & ApplicationInput;

    if (!email) {
      return NextResponse.json({ error: "メールアドレスが必要です" }, { status: 400 });
    }

    const allowed = await canGenerate(email);
    if (!allowed) {
      return NextResponse.json(
        { error: "FREE_LIMIT", message: "無料枠（3回）を使い切りました" },
        { status: 402 }
      );
    }

    const result = await generateApplication(input);
    await incrementUsage(email);

    return NextResponse.json(result);
  } catch (err) {
    console.error("Generate error:", err);
    return NextResponse.json({ error: "生成に失敗しました" }, { status: 500 });
  }
}
