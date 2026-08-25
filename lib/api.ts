import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { prisma } from './db';
import { utcDay } from './quota';

/** Shared helpers for route handlers. */

export function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

export function jsonOk<T extends object>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, ...data }, init);
}

/**
 * A stable, non-reversible identifier for an anonymous caller.
 *
 * Salted with NEXTAUTH_SECRET so the stored value is useless outside this
 * deployment, and truncated because we only need it to count to three.
 */
export function hashIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const ip = forwarded.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  const salt = process.env.NEXTAUTH_SECRET ?? 'meeme-dev-salt';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

/** Target Locks an anonymous visitor gets per day before signing in. */
export const ANON_DAILY_LOCKS = 3;

export interface AnonQuota {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
}

/** Same atomic claim-then-roll-back shape as the signed-in quota. */
export async function consumeAnonLock(ipHash: string, now: Date = new Date()): Promise<AnonQuota> {
  const day = utcDay(now);
  const row = await prisma.anonUsage.upsert({
    where: { ipHash_day: { ipHash, day } },
    create: { ipHash, day, locks: 1 },
    update: { locks: { increment: 1 } },
    select: { locks: true },
  });

  if (row.locks > ANON_DAILY_LOCKS) {
    await prisma.anonUsage.update({
      where: { ipHash_day: { ipHash, day } },
      data: { locks: { decrement: 1 } },
    });
    return { allowed: false, used: ANON_DAILY_LOCKS, limit: ANON_DAILY_LOCKS, remaining: 0 };
  }

  return {
    allowed: true,
    used: row.locks,
    limit: ANON_DAILY_LOCKS,
    remaining: Math.max(0, ANON_DAILY_LOCKS - row.locks),
  };
}

/** Guards the cron routes. Vercel Cron sends `Authorization: Bearer <secret>`. */
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET ?? '';
  // Refuse rather than run open: an unauthenticated sweep endpoint is a free
  // way for anyone to burn your API quota.
  if (!secret.trim()) return false;
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}
