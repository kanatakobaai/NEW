import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return _stripe;
}

export async function createCheckoutSession(email: string, userId: string) {
  const session = await getStripe().checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    mode: "subscription",
    customer_email: email,
    success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard?success=1`,
    cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard`,
    metadata: { email, userId },
    allow_promotion_codes: true,
  });
  return session;
}
