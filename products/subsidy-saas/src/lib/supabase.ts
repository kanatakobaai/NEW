import { createClient, SupabaseClient } from "@supabase/supabase-js";

// SQL to run in Supabase dashboard once:
// CREATE TABLE users (
//   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//   email TEXT UNIQUE NOT NULL,
//   stripe_customer_id TEXT,
//   subscription_status TEXT DEFAULT 'free',
//   free_uses INTEGER DEFAULT 0,
//   created_at TIMESTAMPTZ DEFAULT NOW()
// );

let _admin: SupabaseClient | null = null;

function admin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _admin;
}

export async function getOrCreateUser(email: string) {
  const { data: existing } = await admin()
    .from("users")
    .select("*")
    .eq("email", email)
    .single();

  if (existing) return existing;

  const { data: created } = await admin()
    .from("users")
    .insert({ email })
    .select()
    .single();

  return created;
}

export async function canGenerate(email: string): Promise<boolean> {
  const user = await getOrCreateUser(email);
  if (!user) return false;
  if (user.subscription_status === "active") return true;
  return user.free_uses < 3;
}

export async function incrementUsage(email: string) {
  const user = await getOrCreateUser(email);
  if (!user || user.subscription_status === "active") return;
  await admin()
    .from("users")
    .update({ free_uses: user.free_uses + 1 })
    .eq("email", email);
}

export async function activateSubscription(email: string, stripeCustomerId: string) {
  await admin()
    .from("users")
    .update({ subscription_status: "active", stripe_customer_id: stripeCustomerId })
    .eq("email", email);
}

export async function deactivateSubscription(stripeCustomerId: string) {
  await admin()
    .from("users")
    .update({ subscription_status: "free" })
    .eq("stripe_customer_id", stripeCustomerId);
}
