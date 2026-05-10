import { NextRequest, NextResponse } from "next/server";
import { createCheckoutSession } from "@/lib/stripe";
import { getOrCreateUser } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const user = await getOrCreateUser(email);
  const session = await createCheckoutSession(email, user.id);
  return NextResponse.json({ url: session.url });
}
