import { jsonError, jsonOk } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { appUrl, getStripe, isPortalNotConfigured, stripeConfigured } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  if (!stripeConfigured()) return jsonError('Payments are not configured.', 503);
  const stripe = getStripe();
  if (!stripe) return jsonError('Payments are not configured.', 503);

  const viewer = await getViewer();
  if (!viewer) return jsonError('Sign in first.', 401);

  const record = await prisma.user.findUnique({
    where: { id: viewer.id },
    select: { stripeCustomerId: true },
  });
  if (!record?.stripeCustomerId) return jsonError('No subscription to manage.', 404);

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: record.stripeCustomerId,
      return_url: `${appUrl()}/dashboard`,
    });
    return jsonOk({ url: session.url });
  } catch (err) {
    // Never let a billing failure become an unhandled 500. Someone hitting this
    // is trying to cancel or fix a card, and a blank error page is the single
    // worst response a subscription product can give them.
    if (isPortalNotConfigured(err)) {
      console.error('[stripe:portal] portal configuration missing — activate it in the dashboard', err);
      return jsonError(
        'The self-service billing portal is not available right now.',
        503,
        { portalUnavailable: true },
      );
    }
    console.error('[stripe:portal] session creation failed', err);
    return jsonError('Could not open the billing portal. Try again in a moment.', 502);
  }
}
