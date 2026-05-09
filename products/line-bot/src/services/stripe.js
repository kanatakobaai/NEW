const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_ID = process.env.STRIPE_PRICE_ID;
const BASE_URL = process.env.BASE_URL;

async function createCheckoutSession(lineUserId, displayName) {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{ price: PRICE_ID, quantity: 1 }],
    mode: 'subscription',
    success_url: `${BASE_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}&uid=${lineUserId}`,
    cancel_url: `${BASE_URL}/payment/cancel`,
    metadata: { line_user_id: lineUserId },
    customer_email: undefined,
    allow_promotion_codes: true,
  });
  return session;
}

async function cancelSubscription(subscriptionId) {
  return stripe.subscriptions.cancel(subscriptionId);
}

async function constructWebhookEvent(payload, sig) {
  return stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET);
}

module.exports = { createCheckoutSession, cancelSubscription, constructWebhookEvent };
