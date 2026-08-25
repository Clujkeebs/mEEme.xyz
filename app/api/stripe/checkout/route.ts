import { z } from 'zod';
import { jsonError, jsonOk } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { appUrl, getStripe, stripeConfigured } from '@/lib/stripe';
import { priceIdForTier } from '@/lib/tiers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ tier: z.enum(['DEGEN', 'APEX']) });

export async function POST(request: Request) {
  if (!stripeConfigured()) {
    return jsonError('Payments are not configured on this deployment.', 503);
  }
  const stripe = getStripe();
  if (!stripe) return jsonError('Payments are not configured on this deployment.', 503);

  const viewer = await getViewer();
  if (!viewer) return jsonError('Sign in first.', 401);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('Malformed request body.', 400);
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return jsonError('Pick a tier.', 400);

  const priceId = priceIdForTier(parsed.data.tier);
  if (!priceId) return jsonError(`No Stripe price is configured for ${parsed.data.tier}.`, 503);

  // Reuse the customer if we already made one, so a returning subscriber does
  // not end up with two customer records and two payment methods.
  const record = await prisma.user.findUnique({
    where: { id: viewer.id },
    select: { stripeCustomerId: true, email: true },
  });

  let customerId = record?.stripeCustomerId ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: record?.email ?? viewer.email ?? undefined,
      metadata: { userId: viewer.id },
    });
    customerId = customer.id;
    await prisma.user.update({ where: { id: viewer.id }, data: { stripeCustomerId: customerId } });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl()}/dashboard?upgraded=1`,
    cancel_url: `${appUrl()}/pricing?cancelled=1`,
    allow_promotion_codes: true,
    // The webhook is the source of truth for entitlement, and it needs to know
    // which user this belongs to without trusting the redirect.
    subscription_data: { metadata: { userId: viewer.id, tier: parsed.data.tier } },
    metadata: { userId: viewer.id, tier: parsed.data.tier },
  });

  if (!session.url) return jsonError('Stripe did not return a checkout URL.', 502);
  return jsonOk({ url: session.url });
}
