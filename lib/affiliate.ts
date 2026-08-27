import type Stripe from 'stripe';
import { prisma } from './db';
import type { Viewer } from './auth';

/**
 * Affiliate revenue share.
 *
 * A referred signup earns the affiliate nothing by itself — only a real
 * payment does, and only for 12 months from that referral's first payment.
 * That window is deliberately anchored to the first paid invoice, not to
 * signup: a free-tier user who converts eight months later still gives their
 * affiliate a full 12 months from the moment money actually starts moving.
 */

const COMMISSION_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

export interface AffiliateRecord {
  id: string;
  code: string;
  email: string;
  name: string | null;
  commissionPct: number;
  active: boolean;
}

/** The affiliate the signed-in viewer is, or null if they aren't one. */
export async function getAffiliateForViewer(viewer: Pick<Viewer, 'email'> | null): Promise<AffiliateRecord | null> {
  if (!viewer?.email) return null;
  const affiliate = await prisma.affiliate.findUnique({ where: { email: viewer.email.toLowerCase() } });
  if (!affiliate || !affiliate.active) return null;
  return {
    id: affiliate.id,
    code: affiliate.code,
    email: affiliate.email,
    name: affiliate.name,
    commissionPct: affiliate.commissionPct,
    active: affiliate.active,
  };
}

export type AttributeFailure = 'invalid' | 'already_attributed' | 'self_referral';

export interface AttributeResult {
  ok: boolean;
  failure?: AttributeFailure;
  error?: string;
}

/**
 * Attribute a newly-created (or newly-seen) user to an affiliate's code.
 *
 * Unlike promo redemption this grants the *user* nothing — it only credits
 * the affiliate once that user eventually pays. Silent, one-shot, and never
 * worth blocking signup over: called fire-and-forget from the client.
 */
export async function attributeReferral(userId: string, rawCode: string): Promise<AttributeResult> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, failure: 'invalid', error: 'No code given.' };

  const affiliate = await prisma.affiliate.findUnique({ where: { code } });
  if (!affiliate || !affiliate.active) {
    return { ok: false, failure: 'invalid', error: 'That referral code is not valid.' };
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (user?.email && user.email.toLowerCase() === affiliate.email.toLowerCase()) {
    return { ok: false, failure: 'self_referral', error: 'You cannot refer yourself.' };
  }

  const existing = await prisma.affiliateReferral.findUnique({ where: { userId } });
  if (existing) {
    return { ok: false, failure: 'already_attributed', error: 'This account is already attributed to a referral.' };
  }

  try {
    await prisma.affiliateReferral.create({ data: { affiliateId: affiliate.id, userId } });
  } catch {
    return { ok: false, failure: 'already_attributed', error: 'This account is already attributed to a referral.' };
  }

  return { ok: true };
}

/**
 * Record a commission for a paid Stripe invoice, if the paying customer was
 * referred and the invoice falls inside their 12-month window. Safe to call
 * for every invoice.paid event — most will simply find no referral and
 * return immediately.
 */
export async function recordAffiliateCommission(invoice: Stripe.Invoice): Promise<void> {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  const amountUsd = (invoice.amount_paid ?? 0) / 100;
  // A $0 invoice (e.g. a fully-discounted period) is not a payment — it
  // should not start the commission clock or itself earn anything.
  if (amountUsd <= 0) return;

  const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId }, select: { id: true } });
  if (!user) return;

  const referral = await prisma.affiliateReferral.findUnique({ where: { userId: user.id } });
  if (!referral) return;

  const paidAtMs = invoice.status_transitions?.paid_at ? invoice.status_transitions.paid_at * 1000 : Date.now();
  const paidAt = new Date(paidAtMs);
  const windowStart = referral.firstPaidAt ?? paidAt;
  if (paidAt.getTime() > windowStart.getTime() + COMMISSION_WINDOW_MS) {
    // Outside the 12-month window this referral already started — no
    // commission, and do not touch firstPaidAt.
    return;
  }

  const affiliate = await prisma.affiliate.findUnique({ where: { id: referral.affiliateId } });
  if (!affiliate || !affiliate.active) return;

  const commissionUsd = Math.round(amountUsd * affiliate.commissionPct) / 100;

  try {
    await prisma.$transaction([
      prisma.affiliateCommission.create({
        data: {
          referralId: referral.id,
          affiliateId: affiliate.id,
          stripeInvoiceId: invoice.id,
          amountUsd,
          commissionUsd,
        },
      }),
      ...(referral.firstPaidAt
        ? []
        : [prisma.affiliateReferral.update({ where: { id: referral.id }, data: { firstPaidAt: paidAt } })]),
    ]);
  } catch {
    // Unique constraint on stripeInvoiceId — this invoice was already
    // recorded (a webhook retry). Nothing to do.
  }
}

/** first two chars of the local part + full domain — enough for an affiliate
 * to recognize their own referrals without handing them a stranger's full
 * email address. */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '•••';
  const visible = local.slice(0, 2);
  return `${visible}${'•'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}

export interface AffiliateReferralRow {
  id: string;
  maskedEmail: string;
  createdAt: string;
  converted: boolean;
  firstPaidAt: string | null;
  /** ISO timestamp the 12-month commission window closes, once conversion has happened. */
  windowEndsAt: string | null;
  totalEarnedUsd: number;
}

export interface AffiliateDashboard {
  code: string;
  commissionPct: number;
  referredCount: number;
  convertedCount: number;
  totalEarnedUsd: number;
  unpaidUsd: number;
  referrals: AffiliateReferralRow[];
}

/** Everything the affiliate's own /affiliate dashboard shows. */
export async function getAffiliateDashboard(affiliateId: string): Promise<AffiliateDashboard> {
  const affiliate = await prisma.affiliate.findUniqueOrThrow({ where: { id: affiliateId } });
  const referrals = await prisma.affiliateReferral.findMany({
    where: { affiliateId },
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { email: true } },
      commissions: { select: { commissionUsd: true, paidOut: true } },
    },
  });

  const rows: AffiliateReferralRow[] = referrals.map((r) => ({
    id: r.id,
    maskedEmail: r.user.email ? maskEmail(r.user.email) : 'unknown',
    createdAt: r.createdAt.toISOString(),
    converted: r.firstPaidAt !== null,
    firstPaidAt: r.firstPaidAt?.toISOString() ?? null,
    windowEndsAt: r.firstPaidAt ? new Date(r.firstPaidAt.getTime() + COMMISSION_WINDOW_MS).toISOString() : null,
    totalEarnedUsd: r.commissions.reduce((sum, c) => sum + c.commissionUsd, 0),
  }));

  const allCommissions = referrals.flatMap((r) => r.commissions);

  return {
    code: affiliate.code,
    commissionPct: affiliate.commissionPct,
    referredCount: rows.length,
    convertedCount: rows.filter((r) => r.converted).length,
    totalEarnedUsd: allCommissions.reduce((sum, c) => sum + c.commissionUsd, 0),
    unpaidUsd: allCommissions.filter((c) => !c.paidOut).reduce((sum, c) => sum + c.commissionUsd, 0),
    referrals: rows,
  };
}

export interface AdminAffiliateRow {
  id: string;
  code: string;
  email: string;
  name: string | null;
  commissionPct: number;
  active: boolean;
  note: string | null;
  createdAt: string;
  referredCount: number;
  convertedCount: number;
  totalEarnedUsd: number;
  unpaidUsd: number;
}

/** Shared by /admin/affiliates (SSR) and its API route, so the shapes can't drift. */
export async function listAffiliatesForAdmin(): Promise<AdminAffiliateRow[]> {
  const [affiliates, totals, unpaid] = await Promise.all([
    prisma.affiliate.findMany({
      orderBy: { createdAt: 'desc' },
      include: { referrals: { select: { firstPaidAt: true } } },
    }),
    prisma.affiliateCommission.groupBy({ by: ['affiliateId'], _sum: { commissionUsd: true } }),
    prisma.affiliateCommission.groupBy({
      by: ['affiliateId'],
      where: { paidOut: false },
      _sum: { commissionUsd: true },
    }),
  ]);

  const totalByAffiliate = new Map(totals.map((t) => [t.affiliateId, t._sum.commissionUsd ?? 0]));
  const unpaidByAffiliate = new Map(unpaid.map((u) => [u.affiliateId, u._sum.commissionUsd ?? 0]));

  return affiliates.map((a) => ({
    id: a.id,
    code: a.code,
    email: a.email,
    name: a.name,
    commissionPct: a.commissionPct,
    active: a.active,
    note: a.note,
    createdAt: a.createdAt.toISOString(),
    referredCount: a.referrals.length,
    convertedCount: a.referrals.filter((r) => r.firstPaidAt !== null).length,
    totalEarnedUsd: totalByAffiliate.get(a.id) ?? 0,
    unpaidUsd: unpaidByAffiliate.get(a.id) ?? 0,
  }));
}
