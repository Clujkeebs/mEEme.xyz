import { prisma } from './db';
import { TIERS, type Tier } from './tiers';

/**
 * Daily quota.
 *
 * Counted per UTC day in a ledger table rather than derived from the Signal
 * table, so a user's history stays intact when the free allowance resets — and
 * so deleting a signal cannot buy you another lock.
 */

export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export interface QuotaState {
  tier: Tier;
  used: number;
  limit: number;
  remaining: number;
  unlimited: boolean;
  resetsAtIso: string;
}

function nextUtcMidnight(now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

export async function getQuota(userId: string, tier: Tier, now: Date = new Date()): Promise<QuotaState> {
  const limit = TIERS[tier].dailyLocks;
  const unlimited = !Number.isFinite(limit);

  const row = await prisma.usageDay.findUnique({
    where: { userId_day: { userId, day: utcDay(now) } },
    select: { locks: true },
  });
  const used = row?.locks ?? 0;

  return {
    tier,
    used,
    limit,
    remaining: unlimited ? Number.POSITIVE_INFINITY : Math.max(0, limit - used),
    unlimited,
    resetsAtIso: nextUtcMidnight(now),
  };
}

export interface ConsumeResult {
  allowed: boolean;
  quota: QuotaState;
}

/**
 * Atomically claim one lock.
 *
 * The increment and the check happen in the same statement so two concurrent
 * requests cannot both see "2 used" and both proceed. If the claim pushes the
 * user past their limit we roll it back rather than leave a phantom count.
 */
export async function consumeLock(userId: string, tier: Tier, now: Date = new Date()): Promise<ConsumeResult> {
  const limit = TIERS[tier].dailyLocks;
  const day = utcDay(now);

  if (!Number.isFinite(limit)) {
    const row = await prisma.usageDay.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, locks: 1 },
      update: { locks: { increment: 1 } },
      select: { locks: true },
    });
    return {
      allowed: true,
      quota: {
        tier, used: row.locks, limit, remaining: Number.POSITIVE_INFINITY,
        unlimited: true, resetsAtIso: nextUtcMidnight(now),
      },
    };
  }

  const row = await prisma.usageDay.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, locks: 1 },
    update: { locks: { increment: 1 } },
    select: { locks: true },
  });

  if (row.locks > limit) {
    // Over the line — give the count back so the number the user sees is true.
    await prisma.usageDay.update({
      where: { userId_day: { userId, day } },
      data: { locks: { decrement: 1 } },
    });
    return {
      allowed: false,
      quota: {
        tier, used: limit, limit, remaining: 0, unlimited: false,
        resetsAtIso: nextUtcMidnight(now),
      },
    };
  }

  return {
    allowed: true,
    quota: {
      tier, used: row.locks, limit, remaining: Math.max(0, limit - row.locks),
      unlimited: false, resetsAtIso: nextUtcMidnight(now),
    },
  };
}
