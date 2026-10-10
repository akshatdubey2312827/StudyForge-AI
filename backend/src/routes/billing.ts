import { Router, Request, Response } from "express";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { BuyCreditsSchema } from "../schemas/zod";
import { getBalance, addPurchaseCredits } from "../services/credits";
import { stripe, createCheckoutSession, CREDIT_PACKAGES } from "../services/stripe";
import { Transaction } from "../models/Transaction";
import { User } from "../models/User";
import { CreditLedger } from "../models/CreditLedger";
import type { CreditPackageKey } from "../services/stripe";
import mongoose from "mongoose";
import Stripe from "stripe";

const router = Router();

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";

// ─── GET /api/billing/balance ─────────────────────────────────────────────────
router.get("/balance", authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const userId = req.userId!;
  const balance = await getBalance(new mongoose.Types.ObjectId(userId));

  // Lifetime used = sum of all finalized spend entries (never active reserves or refunds)
  const result = await CreditLedger.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        delta: { $lt: 0 },
        reason: "spend",
      },
    },
    { $group: { _id: null, total: { $sum: "$delta" } } },
  ]);

  const lifetimeUsed = Math.abs(result[0]?.total ?? 0);

  res.json({ balance, lifetime_used: lifetimeUsed });
});

// ─── GET /api/billing/transactions ───────────────────────────────────────────
router.get(
  "/transactions",
  authenticate,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const userId = req.userId!;
    const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
    const perPage = Math.min(100, parseInt((req.query.per_page as string) ?? "20", 10));

    const [transactions, total] = await Promise.all([
      Transaction.find({ userId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage),
      Transaction.countDocuments({ userId }),
    ]);

    res.json({
      transactions: transactions.map((tx) => ({
        id: tx._id.toString(),
        amount: tx.credits, // show as credits delta
        paid_amount: tx.amount, // amount in smallest unit (paise/cents)
        currency: tx.currency || "inr",
        description: `${tx.package ? tx.package.charAt(0).toUpperCase() + tx.package.slice(1) : "Credit"} pack — ${tx.credits} credits`,
        created_at: tx.createdAt,
      })),
      total,
    });
  },
);

// ─── POST /api/billing/checkout ───────────────────────────────────────────────
router.post(
  "/checkout",
  authenticate,
  validate(BuyCreditsSchema),
  async (req: AuthenticatedRequest, res: Response, next): Promise<void> => {
    try {
      const { package: pkg } = req.body as { package: CreditPackageKey };
      const userId = req.userId!;

      const successUrl = `${FRONTEND_URL}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${FRONTEND_URL}/billing?cancelled=true`;

      // If Stripe keys are placeholder in development mode, provide seamless dev checkout simulation
      if (
        process.env.NODE_ENV !== "production" &&
        (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.startsWith("sk_test_your_"))
      ) {
        console.log(`[Billing] Development mode: Simulating Stripe checkout for package "${pkg}"...`);
        const credits = pkg === "starter" ? 50 : pkg === "pro" ? 150 : 500;
        const paise = pkg === "starter" ? 39900 : pkg === "pro" ? 99900 : 249900;
        const fakeIntentId = `pi_dev_checkout_${Date.now()}`;

        await Transaction.create({
          stripePaymentIntentId: fakeIntentId,
          userId,
          amount: paise,
          currency: "inr",
          credits,
          status: "completed",
          package: pkg,
        });
        await addPurchaseCredits(new mongoose.Types.ObjectId(userId), credits, fakeIntentId);

        res.json({
          checkout_url: `${FRONTEND_URL}/billing?success=true&credits_added=${credits}`,
          session_id: `cs_dev_${Date.now()}`,
        });
        return;
      }

      const session = await createCheckoutSession(userId, pkg, successUrl, cancelUrl);

      res.json({
        checkout_url: session.url,
        session_id: session.id,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/billing/webhook ────────────────────────────────────────────────
// This route MUST use raw body — registered before JSON middleware in app.ts
// This is the ONLY place credits are added from a purchase — never from client redirect
router.post(
  "/webhook",
  async (req: Request, res: Response): Promise<void> => {
    const sig = req.headers["stripe-signature"] as string | undefined;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

    if (!sig) {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }

    let event: Stripe.Event;

    try {
      // req.body is raw Buffer here (set by rawBody middleware in app.ts)
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
    } catch (err) {
      console.error("[Webhook] Signature verification failed:", err);
      res.status(400).json({ error: "Webhook signature verification failed" });
      return;
    }

    // Only handle payment_intent.succeeded
    if (event.type !== "payment_intent.succeeded") {
      res.json({ received: true });
      return;
    }

    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const paymentIntentId = paymentIntent.id;
    const metadata = paymentIntent.metadata;

    const userId = metadata?.userId;
    const pkg = metadata?.package as CreditPackageKey | undefined;
    const creditsRaw = metadata?.credits;

    if (!userId || !pkg || !creditsRaw) {
      console.error("[Webhook] Missing metadata on PaymentIntent:", paymentIntentId);
      res.status(422).json({ error: "Missing metadata" });
      return;
    }

    const credits = parseInt(creditsRaw, 10);

    if (isNaN(credits) || credits <= 0) {
      res.status(422).json({ error: "Invalid credits value in metadata" });
      return;
    }

    // Idempotency check — skip if this PaymentIntent was already processed
    const existing = await Transaction.findOne({ stripePaymentIntentId: paymentIntentId });
    if (existing) {
      console.log("[Webhook] Duplicate PaymentIntent, skipping:", paymentIntentId);
      res.json({ received: true, duplicate: true });
      return;
    }

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      console.error("[Webhook] User not found:", userId);
      res.status(422).json({ error: "User not found" });
      return;
    }

    // Atomic: create Transaction record + add ledger entry
    // Use a MongoDB session for consistency
    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        await Transaction.create(
          [
            {
              stripePaymentIntentId: paymentIntentId,
              userId,
              amount: paymentIntent.amount,
              currency: paymentIntent.currency,
              credits,
              status: "completed",
              package: pkg,
            },
          ],
          { session: dbSession },
        );

        await addPurchaseCredits(
          new mongoose.Types.ObjectId(userId),
          credits,
          paymentIntentId,
        );
      });
    } catch (err) {
      console.error("[Webhook] Transaction failed:", err);
      // Return 500 so Stripe retries the webhook
      res.status(500).json({ error: "Failed to process payment" });
      return;
    } finally {
      await dbSession.endSession();
    }

    console.log(`[Webhook] Processed payment ${paymentIntentId}: +${credits} credits for user ${userId}`);
    res.json({ received: true });
  },
);

export default router;
