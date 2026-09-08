import { z } from 'zod';
import { getViewer } from '@/lib/auth';
import { ANON_DAILY_LOCKS, consumeAnonLock, hashIp, jsonError, jsonOk, refundAnonLock } from '@/lib/api';
import { readCachedSnapshot, writeCachedSnapshot } from '@/lib/cache';
import { runAlphaEngine } from '@/lib/engine';
import type { UserPosition } from '@/lib/engine/types';
import { buildSnapshot, isPlausibleSolanaAddress } from '@/lib/providers';
import { consumeLock, refundLock } from '@/lib/quota';
import { rateLimit } from '@/lib/ratelimit';
import { recordSignal } from '@/lib/signal-store';
import { TIERS } from '@/lib/tiers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Target Lock — the whole product in one request.
 *
 * Paste a contract, get the verdict, the coil, the reasoning and (if you are
 * paid, or the token is yours) the ladder.
 *
 * Anonymous callers get real reads, capped per IP per day, without a ladder.
 * That is deliberate: the tool has to prove itself on a stranger's own bag
 * before anyone will pay for it.
 */

const bodySchema = z.object({
  address: z.string().min(32).max(64),
  /** The caller's own position, when they have one. */
  position: z
    .object({
      size: z.number().positive().finite(),
      entryPriceUsd: z.number().positive().finite(),
    })
    .nullish(),
  /** Skip the snapshot cache. Paid tiers only. */
  force: z.boolean().nullish(),
});

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('Malformed request body.', 400);
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('Provide a contract address.', 400, { issues: parsed.error.issues });
  }

  const address = parsed.data.address.trim();
  if (!isPlausibleSolanaAddress(address)) {
    return jsonError('That does not look like a Solana mint address.', 400);
  }

  const viewer = await getViewer();
  const spec = viewer ? TIERS[viewer.tier] : null;

  /*
   * A hard per-caller ceiling, outside the quota entirely.
   *
   * The daily quota used to be the only limit, and that was sound while every
   * request cost the caller one of their locks. It stopped being sound the
   * moment this route learned to refund a lock for a token no provider could
   * price: a caller can POST a plausible-but-nonexistent mint, burn two
   * upstream fetches (DexScreener and Rugcheck), get a 404, get the lock back,
   * and repeat forever. Their quota never moves, so nothing ever stops them —
   * an unmetered pipe through this server into someone else's rate limit, and
   * the fastest way to get the app's provider access revoked.
   *
   * Sixty an hour is far more than a person clicking, leaves room for a shared
   * NAT, and turns "unbounded" into a number.
   */
  if (!rateLimit(`lock:${hashIp(request)}`, 60, 60 * 60 * 1000)) {
    return jsonError('Too many reads from this connection. Give it a minute.', 429);
  }

  // ── Quota ────────────────────────────────────────────────────────────────
  let quotaPayload: Record<string, unknown>;
  // Held so a read that turns out to be unproducible can be refunded to
  // whichever meter was charged for it.
  let refund: (() => Promise<void>) | null = null;

  if (viewer) {
    const { allowed, quota } = await consumeLock(viewer.id, viewer.tier);
    if (!allowed) {
      return jsonError(
        `You have used all ${quota.limit} Target Locks for today. Upgrade for unlimited.`,
        429,
        { quota: { ...quota, remaining: 0 }, upgrade: true },
      );
    }
    refund = () => refundLock(viewer.id);
    quotaPayload = {
      used: quota.used,
      limit: quota.unlimited ? null : quota.limit,
      remaining: quota.unlimited ? null : quota.remaining,
      resetsAt: quota.resetsAtIso,
    };
  } else {
    const anon = await consumeAnonLock(hashIp(request));
    if (!anon.allowed) {
      return jsonError(
        `That is ${ANON_DAILY_LOCKS} free locks today. Sign in to keep going — it is still free.`,
        429,
        { quota: anon, signIn: true },
      );
    }
    const ipHash = hashIp(request);
    refund = () => refundAnonLock(ipHash);
    quotaPayload = { used: anon.used, limit: anon.limit, remaining: anon.remaining, anonymous: true };
  }

  // ── Snapshot ─────────────────────────────────────────────────────────────
  const canForce = Boolean(spec && spec.dailyLocks === Number.POSITIVE_INFINITY);
  const wantsFresh = Boolean(parsed.data.force) && canForce;

  let snapshot = wantsFresh ? null : await readCachedSnapshot(address);
  let mode: 'live' | 'demo' = 'live';
  let sources: string[] = ['cache'];
  let missing: string[] = [];

  if (!snapshot) {
    const result = await buildSnapshot(address);

    /*
     * No provider could price this address. Almost always a mistyped or
     * wrong-chain contract — by far the most likely mistake a first-time
     * visitor makes — and the honest answer is to say so.
     *
     * This used to come back as a synthetic snapshot: a complete, confident,
     * entirely invented read of a token that does not exist, captioned with a
     * toast claiming the deployment had no market feed. The read is refused
     * now, and the lock it cost is given back, because a visitor's first
     * interaction should not be a typo silently costing them a third of their
     * free allowance.
     */
    if (result.mode === 'unknown' || !result.snapshot) {
      if (refund) await refund();
      return jsonError(
        'No market data for that address. Check the contract — it may be mistyped, on another chain, or not trading yet.',
        404,
        { missing: result.missing },
      );
    }

    snapshot = result.snapshot;
    mode = result.mode;
    sources = result.sources;
    missing = result.missing;
    if (mode === 'live') await writeCachedSnapshot(snapshot);
  } else {
    mode = snapshot.dataQuality.synthetic ? 'demo' : 'live';
    sources = snapshot.dataQuality.sources;
  }

  // ── Engine ───────────────────────────────────────────────────────────────
  const position: UserPosition | null = parsed.data.position
    ? { size: parsed.data.position.size, entryPriceUsd: parsed.data.position.entryPriceUsd }
    : null;

  const signal = runAlphaEngine(snapshot, position);

  // ── Gating ───────────────────────────────────────────────────────────────
  // The ladder ships to everyone, signed in or not. Paywalling it would mean a
  // stranger never sees the one artifact that makes the case for the product,
  // and the free tier is already bounded by three locks a day. What you pay for
  // is the engine running on your positions while you are asleep — that is the
  // recurring value, and it is genuinely expensive to provide.
  //
  // Insider forensics stays gated: the full wallet-by-wallet table with
  // reconstructed cost bases is the most expensive thing we compute.
  const insidersUnlocked = Boolean(spec?.insiderForensics);
  const insiderWallets = insidersUnlocked
    ? snapshot.holders
        .filter((h) => h.tags.some((t) => t === 'deployer' || t === 'sniper' || t === 'bundler' || t === 'insider-cluster'))
        .slice(0, 60)
        .map((h) => ({
          address: h.address,
          balance: h.balance,
          costBasisUsd: h.costBasisUsd,
          realizedFraction: h.realizedFraction,
          tags: h.tags,
        }))
    : null;

  const stored = await recordSignal(signal, viewer?.id ?? null);

  return jsonOk({
    mode,
    sources,
    missing,
    signalId: stored?.id ?? null,
    shareSlug: stored?.shareSlug ?? null,
    quota: quotaPayload,
    locks: {
      insiderForensics: insidersUnlocked,
    },
    signal: {
      verdict: signal.verdict,
      conviction: signal.conviction,
      headline: signal.headline,
      reasoning: signal.reasoning,
      halfLifeMinutes: signal.halfLifeMinutes,
      coil: signal.coil,
      ladder: signal.ladder,
      insiderWallets,
    },
    token: {
      address: snapshot.address,
      symbol: snapshot.symbol,
      name: snapshot.name,
      priceUsd: snapshot.priceUsd,
      liquidityUsd: snapshot.liquidityUsd,
      fdvUsd: snapshot.fdvUsd,
      ageMinutes: snapshot.ageMinutes,
      holderCount: snapshot.holderCount,
      priceChangePct: snapshot.priceChangePct,
      volumeUsd: snapshot.volumeUsd,
      lpBurnedPct: snapshot.lpBurnedPct,
      mintAuthorityActive: snapshot.mintAuthorityActive,
      freezeAuthorityActive: snapshot.freezeAuthorityActive,
      candles: snapshot.candles,
      dataQuality: snapshot.dataQuality,
    },
  });
}
