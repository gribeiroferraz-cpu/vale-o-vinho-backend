/**
 * Subscription Router
 * 
 * Handles all subscription-related operations including:
 * - Creating checkout sessions
 * - Managing subscriptions
 * - Handling Stripe webhooks
 * - Checking subscription status
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import Stripe from 'stripe';
import { requireAuth, getSubscriptionStatus } from '../middleware/subscription';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia',
});

/**
 * Create Stripe checkout session
 */
export async function createCheckoutSession(
  userId: string,
  userEmail: string,
  priceId: string,
  interval: 'monthly' | 'yearly'
) {
  try {
    const session = await stripe.checkout.sessions.create({
      customer_email: userEmail,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/subscription/plans`,
      metadata: {
        userId: userId,
        interval: interval,
      },
      subscription_data: {
        trial_period_days: 7, // 7 days free trial
        metadata: {
          userId: userId,
        },
      },
    });

    return session.url;
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Erro ao criar sessão de checkout',
      cause: error,
    });
  }
}

/**
 * Create Stripe billing portal session
 */
export async function createPortalSession(stripeCustomerId: string) {
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL}/profile`,
    });

    return session.url;
  } catch (error: any) {
    console.error('Error creating portal session:', error);
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Erro ao criar portal de gerenciamento',
      cause: error,
    });
  }
}

/**
 * Cancel subscription at period end
 */
export async function cancelSubscription(stripeSubscriptionId: string, db: any) {
  try {
    // Update subscription in Stripe
    await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    // Update subscription in database
    await db.query(`
      UPDATE subscriptions
      SET cancel_at_period_end = TRUE,
          updated_at = NOW()
      WHERE stripe_subscription_id = ?
    `, [stripeSubscriptionId]);

    return { success: true };
  } catch (error: any) {
    console.error('Error canceling subscription:', error);
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Erro ao cancelar assinatura',
      cause: error,
    });
  }
}

/**
 * Reactivate canceled subscription
 */
export async function reactivateSubscription(stripeSubscriptionId: string, db: any) {
  try {
    // Update subscription in Stripe
    await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    // Update subscription in database
    await db.query(`
      UPDATE subscriptions
      SET cancel_at_period_end = FALSE,
          updated_at = NOW()
      WHERE stripe_subscription_id = ?
    `, [stripeSubscriptionId]);

    return { success: true };
  } catch (error: any) {
    console.error('Error reactivating subscription:', error);
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Erro ao reativar assinatura',
      cause: error,
    });
  }
}

/**
 * Handle Stripe webhook events
 */
export async function handleStripeWebhook(body: any, signature: string, db: any) {
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    );
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    throw new Error(`Webhook Error: ${err.message}`);
  }

  console.log('Received Stripe event:', event.type);

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, db);
      break;
    
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription, db);
      break;
    
    case 'customer.subscription.deleted':
      await handleSubscriptionCanceled(event.data.object as Stripe.Subscription, db);
      break;
    
    case 'invoice.payment_succeeded':
      await handlePaymentSucceeded(event.data.object as Stripe.Invoice, db);
      break;
    
    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object as Stripe.Invoice, db);
      break;
    
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return { received: true };
}

/**
 * Handle checkout.session.completed event
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session, db: any) {
  const userId = session.metadata?.userId;
  const subscriptionId = session.subscription as string;
  
  if (!userId || !subscriptionId) {
    console.error('Missing userId or subscriptionId in checkout session');
    return;
  }

  try {
    // Fetch subscription details from Stripe
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    
    // Get plan ID (assuming Premium plan with ID 1)
    const planId = 1;
    
    // Insert subscription into database
    await db.query(`
      INSERT INTO subscriptions (
        user_id,
        plan_id,
        stripe_customer_id,
        stripe_subscription_id,
        status,
        current_period_start,
        current_period_end,
        trial_end
      ) VALUES (?, ?, ?, ?, ?, FROM_UNIXTIME(?), FROM_UNIXTIME(?), ?)
    `, [
      userId,
      planId,
      session.customer as string,
      subscriptionId,
      subscription.status,
      subscription.current_period_start,
      subscription.current_period_end,
      subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    ]);

    console.log(`Subscription created for user ${userId}`);
  } catch (error) {
    console.error('Error handling checkout completed:', error);
  }
}

/**
 * Handle customer.subscription.updated event
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription, db: any) {
  try {
    await db.query(`
      UPDATE subscriptions
      SET status = ?,
          current_period_start = FROM_UNIXTIME(?),
          current_period_end = FROM_UNIXTIME(?),
          cancel_at_period_end = ?,
          updated_at = NOW()
      WHERE stripe_subscription_id = ?
    `, [
      subscription.status,
      subscription.current_period_start,
      subscription.current_period_end,
      subscription.cancel_at_period_end,
      subscription.id,
    ]);

    console.log(`Subscription updated: ${subscription.id}`);
  } catch (error) {
    console.error('Error handling subscription updated:', error);
  }
}

/**
 * Handle customer.subscription.deleted event
 */
async function handleSubscriptionCanceled(subscription: Stripe.Subscription, db: any) {
  try {
    await db.query(`
      UPDATE subscriptions
      SET status = 'canceled',
          updated_at = NOW()
      WHERE stripe_subscription_id = ?
    `, [subscription.id]);

    console.log(`Subscription canceled: ${subscription.id}`);
  } catch (error) {
    console.error('Error handling subscription canceled:', error);
  }
}

/**
 * Handle invoice.payment_succeeded event
 */
async function handlePaymentSucceeded(invoice: Stripe.Invoice, db: any) {
  try {
    // Get subscription ID from database
    const result = await db.query(`
      SELECT id FROM subscriptions
      WHERE stripe_subscription_id = ?
      LIMIT 1
    `, [invoice.subscription]);

    if (!result || result.length === 0) {
      console.error('Subscription not found for invoice:', invoice.id);
      return;
    }

    const subscriptionId = result[0].id;

    // Insert payment record
    await db.query(`
      INSERT INTO payment_history (
        subscription_id,
        stripe_payment_intent_id,
        amount,
        currency,
        status,
        payment_method,
        paid_at
      ) VALUES (?, ?, ?, ?, 'succeeded', ?, FROM_UNIXTIME(?))
    `, [
      subscriptionId,
      invoice.payment_intent,
      (invoice.amount_paid || 0) / 100, // Convert from cents
      invoice.currency?.toUpperCase() || 'BRL',
      invoice.payment_method_types?.[0] || 'card',
      invoice.status_transitions?.paid_at || Math.floor(Date.now() / 1000),
    ]);

    console.log(`Payment succeeded for invoice: ${invoice.id}`);
  } catch (error) {
    console.error('Error handling payment succeeded:', error);
  }
}

/**
 * Handle invoice.payment_failed event
 */
async function handlePaymentFailed(invoice: Stripe.Invoice, db: any) {
  try {
    // Update subscription status to past_due
    await db.query(`
      UPDATE subscriptions
      SET status = 'past_due',
          updated_at = NOW()
      WHERE stripe_subscription_id = ?
    `, [invoice.subscription]);

    // TODO: Send email notification to user about payment failure

    console.log(`Payment failed for invoice: ${invoice.id}`);
  } catch (error) {
    console.error('Error handling payment failed:', error);
  }
}

/**
 * Export router functions for use in tRPC router
 */
export const subscriptionRouter = {
  // Get subscription status
  getStatus: async (userId: string, db: any) => {
    requireAuth(userId);
    return await getSubscriptionStatus(db, userId);
  },

  // Create checkout session
  createCheckout: async (
    userId: string,
    userEmail: string,
    priceId: string,
    interval: 'monthly' | 'yearly'
  ) => {
    requireAuth(userId);
    const url = await createCheckoutSession(userId, userEmail, priceId, interval);
    return { url };
  },

  // Create portal session
  createPortal: async (userId: string, db: any) => {
    requireAuth(userId);
    const status = await getSubscriptionStatus(db, userId);
    
    if (!status.stripeCustomerId) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Assinatura não encontrada',
      });
    }

    const url = await createPortalSession(status.stripeCustomerId);
    return { url };
  },

  // Cancel subscription
  cancel: async (userId: string, db: any) => {
    requireAuth(userId);
    const status = await getSubscriptionStatus(db, userId);
    
    if (!status.stripeSubscriptionId) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Assinatura não encontrada',
      });
    }

    return await cancelSubscription(status.stripeSubscriptionId, db);
  },

  // Reactivate subscription
  reactivate: async (userId: string, db: any) => {
    requireAuth(userId);
    const status = await getSubscriptionStatus(db, userId);
    
    if (!status.stripeSubscriptionId) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Assinatura não encontrada',
      });
    }

    return await reactivateSubscription(status.stripeSubscriptionId, db);
  },
};
