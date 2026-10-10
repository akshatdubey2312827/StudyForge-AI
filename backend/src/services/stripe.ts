import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!;

export const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
  typescript: true,
});

export const CREDIT_PACKAGES = {
  starter: {
    credits: parseInt(process.env.CREDITS_STARTER_PACK ?? "50", 10),
    priceId: process.env.STRIPE_PRICE_STARTER!,
    name: "Starter Pack",
  },
  pro: {
    credits: parseInt(process.env.CREDITS_PRO_PACK ?? "150", 10),
    priceId: process.env.STRIPE_PRICE_PRO!,
    name: "Pro Pack",
  },
  unlimited: {
    credits: parseInt(process.env.CREDITS_UNLIMITED_PACK ?? "500", 10),
    priceId: process.env.STRIPE_PRICE_UNLIMITED!,
    name: "Unlimited Pack",
  },
} as const;

export type CreditPackageKey = keyof typeof CREDIT_PACKAGES;

export async function createCheckoutSession(
  userId: string,
  packageKey: CreditPackageKey,
  successUrl: string,
  cancelUrl: string,
): Promise<Stripe.Checkout.Session> {
  const pkg = CREDIT_PACKAGES[packageKey];

  return stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price: pkg.priceId,
        quantity: 1,
      },
    ],
    metadata: {
      userId,
      package: packageKey,
      credits: pkg.credits.toString(),
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
    // Attach customer metadata so we can reconcile in webhook
    payment_intent_data: {
      metadata: {
        userId,
        package: packageKey,
        credits: pkg.credits.toString(),
      },
    },
  });
}
