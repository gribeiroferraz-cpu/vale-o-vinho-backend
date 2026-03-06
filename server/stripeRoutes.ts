import { Express, Request, Response } from "express";
import { ENV } from "./_core/env";
import {
  stripe,
  getOrCreateStripeCustomer,
  createCheckoutSession,
  createBillingPortalSession,
  constructWebhookEvent,
} from "./stripe";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";

export function registerStripeRoutes(app: Express) {
  // ─── Create Checkout Session ─────────────────────────────────────────────
  app.post("/api/stripe/checkout", async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({ error: "Não autenticado" });
      }

      const { priceId, billingPeriod } = req.body as {
        priceId?: string;
        billingPeriod?: "monthly" | "yearly";
      };

      // Determine which price to use
      let selectedPriceId = priceId;
      if (!selectedPriceId) {
        selectedPriceId =
          billingPeriod === "yearly"
            ? ENV.stripeYearlyPriceId
            : ENV.stripeMonthlyPriceId;
      }

      if (!selectedPriceId) {
        return res.status(400).json({ error: "Price ID não fornecido" });
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Banco de dados indisponível" });
      }

      // Get or create Stripe customer
      const dbUser = await db
        .select()
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      const currentUser = dbUser[0];
      if (!currentUser) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      const customerId = await getOrCreateStripeCustomer({
        id: currentUser.id,
        email: currentUser.email,
        name: currentUser.name,
        stripeCustomerId: (currentUser as any).stripeCustomerId,
      });

      // Save customer ID if new
      if (!(currentUser as any).stripeCustomerId) {
        await db
          .update(users)
          .set({ stripeCustomerId: customerId } as any)
          .where(eq(users.id, currentUser.id));
      }

      const frontendUrl = ENV.frontendUrl;
      const session = await createCheckoutSession({
        customerId,
        priceId: selectedPriceId,
        successUrl: `${frontendUrl}/perfil?subscription=success`,
        cancelUrl: `${frontendUrl}/perfil?subscription=canceled`,
        userId: currentUser.id,
      });

      return res.json({ url: session.url, sessionId: session.id });
    } catch (error: any) {
      console.error("[Stripe] Checkout error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // ─── Billing Portal ───────────────────────────────────────────────────────
  app.post("/api/stripe/portal", async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({ error: "Não autenticado" });
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Banco de dados indisponível" });
      }

      const dbUser = await db
        .select()
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      const currentUser = dbUser[0];
      const customerId = (currentUser as any)?.stripeCustomerId;

      if (!customerId) {
        return res.status(400).json({ error: "Nenhuma assinatura encontrada" });
      }

      const session = await createBillingPortalSession({
        customerId,
        returnUrl: `${ENV.frontendUrl}/perfil`,
      });

      return res.json({ url: session.url });
    } catch (error: any) {
      console.error("[Stripe] Portal error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // ─── Subscription Status ──────────────────────────────────────────────────
  app.get("/api/stripe/subscription", async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user) {
        return res.json({ status: "none", plan: null });
      }

      const db = await getDb();
      if (!db) {
        return res.json({ status: "none", plan: null });
      }

      // Query subscription from DB
      const result = await db.execute(
        sql`SELECT s.*, sp.name as plan_name, sp.price_monthly, sp.price_yearly
            FROM subscriptions s
            JOIN subscription_plans sp ON s.plan_id = sp.id
            WHERE s.user_id = ${String(user.id)}
            AND s.status = 'active'
            ORDER BY s.created_at DESC
            LIMIT 1`
      );

      const rows = (result as any)[0] as any[];
      if (!rows || rows.length === 0) {
        return res.json({ status: "none", plan: null });
      }

      const sub = rows[0];
      return res.json({
        status: sub.status,
        plan: sub.plan_name,
        currentPeriodEnd: sub.current_period_end,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        stripeSubscriptionId: sub.stripe_subscription_id,
      });
    } catch (error: any) {
      console.error("[Stripe] Subscription status error:", error);
      return res.json({ status: "none", plan: null });
    }
  });

  // ─── Webhook ──────────────────────────────────────────────────────────────
  app.post(
    "/api/stripe/webhook",
    // Raw body needed for Stripe signature verification
    (req: Request, res: Response, next: any) => {
      if (req.headers["content-type"] === "application/json") {
        let data = "";
        req.setEncoding("utf8");
        req.on("data", (chunk) => (data += chunk));
        req.on("end", () => {
          (req as any).rawBody = Buffer.from(data);
          next();
        });
      } else {
        next();
      }
    },
    async (req: Request, res: Response) => {
      const sig = req.headers["stripe-signature"] as string;
      const webhookSecret = ENV.stripeWebhookSecret;

      if (!webhookSecret) {
        console.warn("[Stripe] Webhook secret not configured");
        return res.status(400).json({ error: "Webhook secret not configured" });
      }

      let event;
      try {
        const rawBody = (req as any).rawBody ?? req.body;
        event = constructWebhookEvent(rawBody, sig, webhookSecret);
      } catch (err: any) {
        console.error("[Stripe] Webhook signature error:", err.message);
        return res.status(400).json({ error: `Webhook Error: ${err.message}` });
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database unavailable" });
      }

      try {
        switch (event.type) {
          case "checkout.session.completed": {
            const session = event.data.object as any;
            const userId = session.metadata?.userId;
            const customerId = session.customer;
            const subscriptionId = session.subscription;

            if (userId && subscriptionId) {
              // Get subscription details
              const subscription = await stripe.subscriptions.retrieve(subscriptionId) as any;
              const priceId = subscription.items.data[0]?.price.id;

              // Determine plan ID from price
              const planResult = await db.execute(
                sql`SELECT id FROM subscription_plans WHERE stripe_price_id_monthly = ${priceId} OR stripe_price_id_yearly = ${priceId} LIMIT 1`
              );
              const planRows = (planResult as any)[0] as any[];
              const planId = planRows?.[0]?.id ?? 1;

              // Upsert subscription
              await db.execute(
                sql`INSERT INTO subscriptions (user_id, plan_id, stripe_customer_id, stripe_subscription_id, status, current_period_start, current_period_end, cancel_at_period_end)
                    VALUES (${userId}, ${planId}, ${customerId}, ${subscriptionId}, 'active',
                            FROM_UNIXTIME(${subscription.current_period_start}),
                            FROM_UNIXTIME(${subscription.current_period_end}),
                            ${subscription.cancel_at_period_end ? 1 : 0})
                    ON DUPLICATE KEY UPDATE
                      status = 'active',
                      stripe_customer_id = ${customerId},
                      current_period_start = FROM_UNIXTIME(${subscription.current_period_start}),
                      current_period_end = FROM_UNIXTIME(${subscription.current_period_end}),
                      cancel_at_period_end = ${subscription.cancel_at_period_end ? 1 : 0},
                      updated_at = NOW()`
              );

              // Save stripeCustomerId on user
              await db.execute(
                sql`UPDATE users SET stripeCustomerId = ${customerId} WHERE id = ${userId}`
              );

              console.log(`[Stripe] Subscription activated for user ${userId}`);
            }
            break;
          }

          case "customer.subscription.updated": {
            const subscription = event.data.object as any;
            await db.execute(
              sql`UPDATE subscriptions SET
                    status = ${subscription.status},
                    current_period_start = FROM_UNIXTIME(${subscription.current_period_start}),
                    current_period_end = FROM_UNIXTIME(${subscription.current_period_end}),
                    cancel_at_period_end = ${subscription.cancel_at_period_end ? 1 : 0},
                    updated_at = NOW()
                  WHERE stripe_subscription_id = ${subscription.id}`
            );
            console.log(`[Stripe] Subscription updated: ${subscription.id}`);
            break;
          }

          case "customer.subscription.deleted": {
            const subscription = event.data.object as any;
            await db.execute(
              sql`UPDATE subscriptions SET status = 'canceled', updated_at = NOW()
                  WHERE stripe_subscription_id = ${subscription.id}`
            );
            console.log(`[Stripe] Subscription canceled: ${subscription.id}`);
            break;
          }

          case "invoice.payment_failed": {
            const invoice = event.data.object as any;
            if (invoice.subscription) {
              await db.execute(
                sql`UPDATE subscriptions SET status = 'past_due', updated_at = NOW()
                    WHERE stripe_subscription_id = ${invoice.subscription}`
              );
            }
            break;
          }

          default:
            console.log(`[Stripe] Unhandled event: ${event.type}`);
        }
      } catch (err: any) {
        console.error("[Stripe] Webhook processing error:", err);
        return res.status(500).json({ error: "Webhook processing failed" });
      }

      return res.json({ received: true });
    }
  );
}
