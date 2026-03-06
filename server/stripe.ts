import Stripe from "stripe";
import { ENV } from "./_core/env";

// Inicializa o cliente Stripe
export const stripe = new Stripe(ENV.stripeSecretKey, {
  apiVersion: "2026-02-25.clover",
});

/**
 * Cria ou recupera um Customer do Stripe para o usuário
 */
export async function getOrCreateStripeCustomer(user: {
  id: number;
  email: string | null;
  name: string | null;
  stripeCustomerId?: string | null;
}): Promise<string> {
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    name: user.name ?? undefined,
    metadata: {
      userId: String(user.id),
    },
  });

  return customer.id;
}

/**
 * Cria uma sessão de checkout do Stripe
 */
export async function createCheckoutSession(params: {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  userId: number;
}): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.create({
    customer: params.customerId,
    payment_method_types: ["card"],
    line_items: [
      {
        price: params.priceId,
        quantity: 1,
      },
    ],
    mode: "subscription",
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: {
      userId: String(params.userId),
    },
    subscription_data: {
      metadata: {
        userId: String(params.userId),
      },
    },
    locale: "pt-BR",
    allow_promotion_codes: true,
  });
}

/**
 * Cria uma sessão do portal de faturamento do Stripe
 */
export async function createBillingPortalSession(params: {
  customerId: string;
  returnUrl: string;
}): Promise<Stripe.BillingPortal.Session> {
  return stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  });
}

/**
 * Verifica a assinatura ativa de um customer
 */
export async function getActiveSubscription(customerId: string): Promise<Stripe.Subscription | null> {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "active",
    limit: 1,
  });

  return subscriptions.data[0] ?? null;
}

/**
 * Constrói e verifica o evento do webhook do Stripe
 */
export function constructWebhookEvent(
  payload: Buffer,
  signature: string,
  secret: string
): Stripe.Event {
  return stripe.webhooks.constructEvent(payload, signature, secret);
}
