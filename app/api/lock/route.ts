import { z } from 'zod';
import { getViewer } from '@/lib/auth';
import { ANON_DAILY_LOCKS, consumeAnonLock, hashIp, jsonError, jsonOk } from '@/lib/api';
import { readCachedSnapshot, writeCachedSnapshot } from '@/lib/cache';
import { runAlphaEngine } from '@/lib/engine';
import type { UserPosition } from '@/lib/engine/types';
import { buildSnapshot, isPlausibleSolanaAddress } from '@/lib/providers';
import { consumeLock } from '@/lib/quota';
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

  // ── Quota ────────────────────────────────────────────────────────────────
  let quotaPayload: Record<string, unknown>;

  if (viewer) {
    const { allowed, quota } = await consumeLock(viewer.id, viewer.tier);
    if (!allowed) {
      return jsonError(
        `You have used all ${quota.limit} Target Locks for today. Upgrade for unlimited.`,
        429,
        { quota: { ...quota, remaining: 0 }, upgrade: true },
      );
    }
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
