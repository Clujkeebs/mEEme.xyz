import type { Viewer } from './auth';
import { prisma } from './db';

/**
 * Admin gating.
 *
 * An env-var allowlist rather than a database flag: it can be set on Railway
 * without a migration or a manual row edit, which matters for the one admin
 * this app actually has right now — someone bootstrapping the very first
 * promo code needs this to work before there is any other way in.
 */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(viewer: Pick<Viewer, 'email'> | null): boolean {
  if (!viewer?.email) return false;
  const allowed = adminEmails();
  if (allowed.length === 0) return false;
  return allowed.includes(viewer.email.toLowerCase());
}

export interface AdminUserRow {
  id: string;
  email: string | null;
  name: string | null;
  tier: string;
  hasStripeSubscription: boolean;
  stripeStatus: string | null;
  trialTier: string | null;
  trialEndsAt: string | null;
  referralCode: string;
  referredByCode: string | null;
  /** Signups that used this user's own referral code — the only affiliate
   * mechanism the app has today, so this doubles as an affiliate count. */
  referredCount: number;
  createdAt: string;
}

const MAX_ADMIN_USER_ROWS = 500;

/** Shared by the admin page (SSR) and its API route, so the two shapes cannot drift. */
export async function listUsersForAdmin(): Promise<AdminUserRow[]> {
  const [users, referredCounts] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: MAX_ADMIN_USER_ROWS,
      select: {
        id: true,
        email: true,
        name: true,
        tier: true,
        stripeCustomerId: true,
        stripeStatus: true,
        trialTier: true,
        trialEndsAt: true,
        referralCode: true,
        referredByCode: true,
        createdAt: true,
      },
    }),
    prisma.user.groupBy({
      by: ['referredByCode'],
      where: { referredByCode: { not: null } },
      _count: { referredByCode: true },
    }),
  ]);

  const referredCountByCode = new Map(referredCounts.map((r) => [r.referredByCode, r._count.referredByCode]));

  return users.map((u) => {
    const activeTrial = Boolean(u.trialTier && u.trialEndsAt && u.trialEndsAt.getTime() > Date.now());
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      tier: u.tier,
      hasStripeSubscription: Boolean(u.stripeCustomerId),
      stripeStatus: u.stripeStatus,
      trialTier: activeTrial ? u.trialTier : null,
      trialEndsAt: activeTrial ? u.trialEndsAt!.toISOString() : null,
      referralCode: u.referralCode,
      referredByCode: u.referredByCode,
      referredCount: referredCountByCode.get(u.referralCode) ?? 0,
      createdAt: u.createdAt.toISOString(),
    };
  });
}
