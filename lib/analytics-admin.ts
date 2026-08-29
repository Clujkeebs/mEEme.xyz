import { prisma } from './db';
import { TIERS, type Tier } from './tiers';
import { VERDICT_META } from './engine/verdict';
import type { Verdict } from './engine/types';

/**
 * One admin snapshot, computed fresh on every load.
 *
 * Nothing here is cached or pre-aggregated — the admin analytics page is a
 * handful of loads a day, not a public route, so the honest number beats a
 * stale one. Every query is scoped and indexed (createdAt, closedAt, active,
 * grade — all already indexed by the models they query), so the whole page
 * is a bounded set of aggregate queries, not a table scan.
 */

const DAY_MS = 86_400_000;
const TREND_DAYS = 14;

export interface AdminAnalytics {
  users: {
    total: number;
    newLast7d: number;
    newLast30d: number;
    byTier: Record<Tier, number>;
    activeTrials: number;
    referredTotal: number;
  };
  /** MRR from confirmed-active Stripe subscriptions only — trialing pays nothing yet. */
  revenue: {
    mrrUsd: number;
    activeSubscriptions: number;
    byTier: Record<Exclude<Tier, 'FREE'>, { count: number; mrrUsd: number }>;
  };
  /** Daily signups, oldest first, for the trend strip. */
  signupTrend: { day: string; count: number }[];
  /**
   * Daily product usage, oldest first — the thing the user-count and signup
   * numbers can't show. A visitor who pastes a contract and never makes an
   * account is invisible to every other number on this page; this is the one
   * signal that captures them without adding any tracking beyond what the
   * rate limiter already records (an hourly-salted IP hash, never a cookie).
   */
  locksTrend: { day: string; signedIn: number; anon: number; uniqueAnonVisitors: number }[];
  /** Where signups actually came from. Null key means no referral code at all. */
  referralSources: { code: string | null; count: number }[];
  engine: {
    totalSignals: number;
    last24h: number;
    last7d: number;
    byVerdict: { verdict: Verdict; label: string; tone: string; count: number }[];
  };
  trackRecord: {
    graded: number;
    pending: number;
    correct: number;
    incorrect: number;
    neutral: number;
    /** correct / (correct + incorrect); null with too little graded history to mean anything. */
    accuracy: number | null;
  };
  usage: {
    locksToday: number;
    anonLocksToday: number;
    openPositions: number;
    activeWatches: number;
    alertsToday: number;
    alertsFailedToday: number;
  };
  /** Counts only — the full lists already have their own admin pages. */
  links: {
    openErrors: number;
    activeAffiliates: number;
    unpaidCommissionUsd: number;
  };
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function loadAdminAnalytics(): Promise<AdminAnalytics> {
  const now = new Date();
  const today = dayKey(now);
  const since7d = new Date(now.getTime() - 7 * DAY_MS);
  const since24h = new Date(now.getTime() - DAY_MS);
  const since30d = new Date(now.getTime() - 30 * DAY_MS);
  const sinceTrend = new Date(now.getTime() - TREND_DAYS * DAY_MS);
  const sinceTrendDayKey = dayKey(sinceTrend);

  const [
    totalUsers,
    newLast7d,
    newLast30d,
    tierCounts,
    activeTrials,
    referredTotal,
    activeSubs,
    trendUsers,
    referralGroups,
    trendUsageDays,
    trendAnonUsageDays,
    totalSignals,
    signalsLast24h,
    signalsLast7d,
    verdictCounts,
    outcomeCounts,
    usageToday,
    anonUsageToday,
    openPositions,
    activeWatches,
    alertsToday,
    alertsFailedToday,
    openErrors,
    activeAffiliates,
    unpaidCommissions,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: since7d } } }),
    prisma.user.count({ where: { createdAt: { gte: since30d } } }),
    prisma.user.groupBy({ by: ['tier'], _count: { tier: true } }),
    prisma.user.count({ where: { trialTier: { not: null }, trialEndsAt: { gt: now } } }),
    prisma.user.count({ where: { referredByCode: { not: null } } }),
    prisma.user.findMany({
      where: { stripeStatus: 'active' },
      select: { tier: true },
    }),
    prisma.user.findMany({
      where: { createdAt: { gte: sinceTrend } },
      select: { createdAt: true },
    }),
    // `_count: { referredByCode: true }` looks like "rows in this group", but
    // Prisma counts non-null occurrences of that specific field — inside the
    // null group every value *is* null, so that count comes back 0 for the
    // direct/organic bucket regardless of how many users are actually in it.
    // `_count: { _all: true }` counts rows, which is what a group size means.
    prisma.user.groupBy({ by: ['referredByCode'], _count: { _all: true } }),
    // UsageDay and AnonUsage key on a "YYYY-MM-DD" string, not a DateTime —
    // lexical comparison on an ISO date string sorts the same as the date
    // itself, so a plain string `gte` is exact here.
    prisma.usageDay.findMany({
      where: { day: { gte: sinceTrendDayKey } },
      select: { day: true, locks: true },
    }),
    prisma.anonUsage.findMany({
      where: { day: { gte: sinceTrendDayKey } },
      select: { day: true, locks: true },
    }),
    prisma.signal.count({ where: { synthetic: false } }),
    prisma.signal.count({ where: { synthetic: false, createdAt: { gte: since24h } } }),
    prisma.signal.count({ where: { synthetic: false, createdAt: { gte: since7d } } }),
    prisma.signal.groupBy({
      by: ['verdict'],
      where: { synthetic: false, createdAt: { gte: since7d } },
      _count: { verdict: true },
    }),
    prisma.signalOutcome.groupBy({ by: ['grade'], _count: { grade: true } }),
    prisma.usageDay.aggregate({ where: { day: today }, _sum: { locks: true } }),
    prisma.anonUsage.aggregate({ where: { day: today }, _sum: { locks: true } }),
    prisma.position.count({ where: { closedAt: null } }),
    prisma.watch.count({ where: { active: true } }),
    prisma.alert.count({ where: { createdAt: { gte: since24h } } }),
    prisma.alert.count({ where: { createdAt: { gte: since24h }, deliveredAt: null, attempts: { gt: 0 } } }),
    prisma.errorEvent.count({ where: { resolvedAt: null } }),
    prisma.affiliate.count({ where: { active: true } }),
    prisma.affiliateCommission.aggregate({ where: { paidOut: false }, _sum: { commissionUsd: true } }),
  ]);

  const byTier: Record<Tier, number> = { FREE: 0, DEGEN: 0, APEX: 0 };
  for (const row of tierCounts) {
    const tier = row.tier as Tier;
    if (tier in byTier) byTier[tier] = row._count.tier;
  }

  const revenueByTier: AdminAnalytics['revenue']['byTier'] = {
    DEGEN: { count: 0, mrrUsd: 0 },
    APEX: { count: 0, mrrUsd: 0 },
  };
  for (const row of activeSubs) {
    const tier = row.tier as Tier;
    if (tier === 'DEGEN' || tier === 'APEX') {
      revenueByTier[tier].count += 1;
      revenueByTier[tier].mrrUsd += TIERS[tier].priceUsd;
    }
  }
  const mrrUsd = revenueByTier.DEGEN.mrrUsd + revenueByTier.APEX.mrrUsd;
  const activeSubscriptions = revenueByTier.DEGEN.count + revenueByTier.APEX.count;

  // Bucket signups by day even though the query already scoped the range —
  // groupBy on a DateTime column groups by instant, not by calendar day.
  const trendMap = new Map<string, number>();
  for (let i = 0; i < TREND_DAYS; i++) {
    trendMap.set(dayKey(new Date(now.getTime() - i * DAY_MS)), 0);
  }
  for (const u of trendUsers) {
    const key = dayKey(u.createdAt);
    trendMap.set(key, (trendMap.get(key) ?? 0) + 1);
  }
  const signupTrend = [...trendMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, count]) => ({ day, count }));

  const locksTrendMap = new Map<string, { signedIn: number; anon: number; uniqueAnonVisitors: number }>();
  for (let i = 0; i < TREND_DAYS; i++) {
    locksTrendMap.set(dayKey(new Date(now.getTime() - i * DAY_MS)), { signedIn: 0, anon: 0, uniqueAnonVisitors: 0 });
  }
  for (const row of trendUsageDays) {
    const bucket = locksTrendMap.get(row.day);
    if (bucket) bucket.signedIn += row.locks;
  }
  for (const row of trendAnonUsageDays) {
    const bucket = locksTrendMap.get(row.day);
    if (!bucket) continue;
    bucket.anon += row.locks;
    // (ipHash, day) is unique on this table, so one row is one visitor for
    // that day regardless of how many locks they used.
    bucket.uniqueAnonVisitors += 1;
  }
  const locksTrend = [...locksTrendMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, v]) => ({ day, ...v }));

  const referralSources = referralGroups
    .map((r) => ({ code: r.referredByCode, count: r._count._all }))
    .sort((a, b) => b.count - a.count);

  const verdictCountMap = new Map(verdictCounts.map((v) => [v.verdict as Verdict, v._count.verdict]));
  const byVerdict = (Object.keys(VERDICT_META) as Verdict[])
    .map((verdict) => ({
      verdict,
      label: VERDICT_META[verdict].label,
      tone: VERDICT_META[verdict].tone,
      count: verdictCountMap.get(verdict) ?? 0,
    }))
    .filter((v) => v.count > 0)
    .sort((a, b) => b.count - a.count);

  const outcomeMap = new Map(outcomeCounts.map((o) => [o.grade, o._count.grade]));
  const correct = outcomeMap.get('correct') ?? 0;
  const incorrect = outcomeMap.get('incorrect') ?? 0;
  const neutral = outcomeMap.get('neutral') ?? 0;
  const pending = outcomeMap.get('pending') ?? 0;
  const graded = correct + incorrect;

  return {
    users: {
      total: totalUsers,
      newLast7d,
      newLast30d,
      byTier,
      activeTrials,
      referredTotal,
    },
    revenue: {
      mrrUsd,
      activeSubscriptions,
      byTier: revenueByTier,
    },
    signupTrend,
    locksTrend,
    referralSources,
    engine: {
      totalSignals,
      last24h: signalsLast24h,
      last7d: signalsLast7d,
      byVerdict,
    },
    trackRecord: {
      graded,
      pending,
      correct,
      incorrect,
      neutral,
      // Same rule as the public track record (lib/scoring.ts summarize()):
      // any decided call is enough to show a figure. An admin reading this
      // page already knows to weigh a 3-call accuracy differently from a
      // 300-call one — the `graded` count sits right next to it either way.
      accuracy: graded > 0 ? correct / graded : null,
    },
    usage: {
      locksToday: usageToday._sum.locks ?? 0,
      anonLocksToday: anonUsageToday._sum.locks ?? 0,
      openPositions,
      activeWatches,
      alertsToday,
      alertsFailedToday,
    },
    links: {
      openErrors,
      activeAffiliates,
      unpaidCommissionUsd: unpaidCommissions._sum.commissionUsd ?? 0,
    },
  };
}
