import { jsonError, jsonOk } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { appUrl, getStripe, stripeConfigured } from '@/lib/stripe';

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

  const session = await stripe.billingPortal.sessions.create({
    customer: record.stripeCustomerId,
    return_url: `${appUrl()}/dashboard`,
  });
  return jsonOk({ url: session.url });
}
