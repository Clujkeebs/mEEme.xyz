import type Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { tierForPriceId, type Tier } from '@/lib/tiers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stripe webhook.
 *
 * Three things this handler takes seriously:
 *
 *  1. Signature verification against the raw body. Anything else is an open
 *     endpoint that hands out subscriptions to whoever posts JSON at it.
 *  2. Idempotency. Stripe delivers at least once, not exactly once, so every
 *     event id is recorded and replays are dropped.
 *  3. The subscription object — not the checkout session — is the source of
 *     truth for entitlement, because it is what survives renewals, upgrades,
 *     downgrades and cancellations.
 */

const RELEVANT = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
]);

/** Statuses that should actually grant access. */
const ENTITLING = new Set(['active', 'trialing']);

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? '';

  if (!stripe || !secret.trim()) {
    return new Response('Stripe webhook is not configured.', { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response('Missing stripe-signature header.', { status: 400 });

  // Must be the raw body — any parsing first would invalidate the signature.
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (err) {
    console.warn('[stripe] signature verification failed:', err instanceof Error ? err.message : err);
    return new Response('Invalid signature.', { status: 400 });
  }

  if (!RELEVANT.has(event.type)) {
    return Response.json({ received: true, ignored: event.type });
  }

  // Idempotency: claim the event id, and bail if someone already has it.
  try {
    await prisma.processedWebhook.create({ data: { id: event.id, type: event.type } });
  } catch {
    return Response.json({ received: true, duplicate: true });
  }

  try {
    await handleEvent(stripe, event);
  } catch (err) {
    console.error('[stripe] handler failed for', event.type, err);
    // Release the idempotency claim so Stripe's retry can actually do work.
    await prisma.processedWebhook.delete({ where: { id: event.id } }).catch(() => {});
    return new Response('Handler error.', { status: 500 });
  }

  return Response.json({ received: true });
}

async function handleEvent(stripe: Stripe, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
      if (!subscriptionId) return;
      // Re-fetch rather than trust the session: the subscription is canonical.
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await applySubscription(subscription, session.metadata?.userId ?? null);
      return;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      await applySubscription(subscription, subscription.metadata?.userId ?? null);
      return;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
      if (!customerId) return;
      // Flag it, but do not revoke here — Stripe's dunning may still recover the
      // payment, and subscription.updated will tell us when it truly lapses.
      await prisma.user.updateMany({
        where: { stripeCustomerId: customerId },
        data: { stripeStatus: 'past_due' },
      });
      return;
    }

    default:
      return;
  }
}

/** Resolve a subscription to a tier and write it to the user row. */
async function applySubscription(
  subscription: Stripe.Subscription,
  metadataUserId: string | null,
): Promise<void> {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  // Prefer the customer id — it survives even if metadata was dropped.
  const user =
    (await prisma.user.findFirst({ where: { stripeCustomerId: customerId } })) ??
    (metadataUserId ? await prisma.user.findUnique({ where: { id: metadataUserId } }) : null);

  if (!user) {
    console.warn('[stripe] no local user for customer', customerId);
    return;
  }

  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const paidTier: Tier | null = tierForPriceId(priceId);
  const entitled = ENTITLING.has(subscription.status);
  const tier: Tier = entitled && paidTier ? paidTier : 'FREE';

  const periodEnd = subscription.current_period_end ?? null;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      tier,
      stripeCustomerId: customerId,
      stripeSubId: subscription.id,
      stripeStatus: subscription.status,
      subscriptionEndsAt: periodEnd ? new Date(periodEnd * 1000) : null,
    },
  });
}
