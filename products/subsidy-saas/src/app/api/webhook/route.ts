import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { activateSubscription, deactivateSubscription } from "@/lib/supabase";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const sig = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const email = session.metadata?.email ?? session.customer_email ?? "";
    const customerId = session.customer as string;
    if (email) await activateSubscription(email, customerId);
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    await deactivateSubscription(sub.customer as string);
  }

  return NextResponse.json({ received: true });
}
