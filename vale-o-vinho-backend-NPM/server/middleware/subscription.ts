/**
 * Subscription Middleware
 * 
 * Provides authentication and subscription verification for protected endpoints.
 */

import { TRPCError } from '@trpc/server';

/**
 * Check if user has an active subscription
 * 
 * @param db - Database instance
 * @param userId - User ID to check
 * @returns true if user has active subscription, false otherwise
 */
export async function hasActiveSubscription(db: any, userId: string): Promise<boolean> {
  try {
    const subscription = await db.query(`
      SELECT 
        s.status,
        s.current_period_end,
        s.cancel_at_period_end
      FROM subscriptions s
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
      LIMIT 1
    `, [userId]);

    if (!subscription || subscription.length === 0) {
      return false;
    }

    const sub = subscription[0];
    
    // Check if subscription is active or in trial
    const isActiveStatus = ['active', 'trialing'].includes(sub.status);
    
    // Check if subscription hasn't expired
    const isNotExpired = sub.current_period_end && new Date(sub.current_period_end) > new Date();
    
    return isActiveStatus && isNotExpired;
  } catch (error) {
    console.error('Error checking subscription:', error);
    return false;
  }
}

/**
 * Middleware to require authentication
 * Throws UNAUTHORIZED error if user is not logged in
 */
export function requireAuth(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Você precisa estar logado para acessar este conteúdo',
    });
  }
  return userId;
}

/**
 * Middleware to require active subscription
 * Throws FORBIDDEN error if user doesn't have active subscription
 */
export async function requirePremium(db: any, userId: string | null | undefined): Promise<string> {
  // First check if user is authenticated
  const validUserId = requireAuth(userId);
  
  // Then check if user has active subscription
  const hasAccess = await hasActiveSubscription(db, validUserId);
  
  if (!hasAccess) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Você precisa de uma assinatura ativa para acessar este conteúdo',
      cause: 'SUBSCRIPTION_REQUIRED',
    });
  }
  
  return validUserId;
}

/**
 * Get subscription status for a user
 */
export async function getSubscriptionStatus(db: any, userId: string) {
  try {
    const subscription = await db.query(`
      SELECT 
        s.id,
        s.status,
        s.current_period_start,
        s.current_period_end,
        s.cancel_at_period_end,
        s.trial_end,
        s.stripe_customer_id,
        s.stripe_subscription_id,
        p.name as plan_name,
        p.description as plan_description,
        p.price_monthly,
        p.price_yearly
      FROM subscriptions s
      LEFT JOIN subscription_plans p ON s.plan_id = p.id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
      LIMIT 1
    `, [userId]);

    if (!subscription || subscription.length === 0) {
      return {
        status: 'none',
        hasAccess: false,
      };
    }

    const sub = subscription[0];
    const hasAccess = await hasActiveSubscription(db, userId);

    return {
      status: sub.status,
      hasAccess,
      plan: {
        name: sub.plan_name,
        description: sub.plan_description,
        priceMonthly: sub.price_monthly,
        priceYearly: sub.price_yearly,
      },
      currentPeriodStart: sub.current_period_start,
      currentPeriodEnd: sub.current_period_end,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      trialEnd: sub.trial_end,
      stripeCustomerId: sub.stripe_customer_id,
      stripeSubscriptionId: sub.stripe_subscription_id,
    };
  } catch (error) {
    console.error('Error getting subscription status:', error);
    return {
      status: 'error',
      hasAccess: false,
    };
  }
}
