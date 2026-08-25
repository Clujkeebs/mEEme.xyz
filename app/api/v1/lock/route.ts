import { API_DAILY_LIMIT, authenticateApiRequest } from '@/lib/apikey';
import { jsonError } from '@/lib/api';
import { readCachedSnapshot, writeCachedSnapshot } from '@/lib/cache';
import { runAlphaEngine } from '@/lib/engine';
import { buildSnapshot, isPlausibleSolanaAddress } from '@/lib/providers';
import { recordSignal } from '@/lib/signal-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public API — GET /api/v1/lock?address=<mint>
 *
 *   curl -H "Authorization: Bearer meeme_live_..." \
 *        "https://meeme.xyz/api/v1/lock?address=<mint>"
 *
 * Deliberately a flat, stable JSON shape rather than the browser payload: this
 * is what someone points a trading bot at, and reshaping it later would break
 * their bot silently.
 */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const url = new URL(request.url);
  const address = (url.searchParams.get('address') ?? '').trim();
  if (!isPlausibleSolanaAddress(address)) {
    return jsonError('Pass ?address=<solana mint>.', 400);
  }

  const entryParam = url.searchParams.get('entry');
  const sizeParam = url.searchParams.get('size');
  const entry = entryParam ? Number.parseFloat(entryParam) : Number.NaN;
  const size = sizeParam ? Number.parseFloat(sizeParam) : Number.NaN;
  const position =
    Number.isFinite(entry) && entry > 0 && Number.isFinite(size) && size > 0
      ? { size, entryPriceUsd: entry }
      : null;

  let snapshot = await readCachedSnapshot(address);
  let mode: 'live' | 'demo' = 'live';
  if (!snapshot) {
    const result = await buildSnapshot(address);
    snapshot = result.snapshot;
    mode = result.mode;
    if (mode === 'live') await writeCachedSnapshot(snapshot);
  } else {
    mode = snapshot.dataQuality.synthetic ? 'demo' : 'live';
  }

  const signal = runAlphaEngine(snapshot, position);
  const stored = await recordSignal(signal, auth.key.userId);

  return Response.json(
    {
      ok: true,
      mode,
      token: {
        address: snapshot.address,
        symbol: snapshot.symbol,
        priceUsd: snapshot.priceUsd,
        liquidityUsd: snapshot.liquidityUsd,
        fdvUsd: snapshot.fdvUsd,
        ageMinutes: snapshot.ageMinutes,
      },
      verdict: signal.verdict,
      conviction: signal.conviction,
      headline: signal.headline,
      reasoning: signal.reasoning,
      halfLifeMinutes: signal.halfLifeMinutes,
      coil: {
        score: signal.coil.coilScore,
        confidence: signal.coil.confidence,
        method: signal.coil.method,
        supplyCovered: signal.coil.supplyCovered,
        coiledSupply: signal.coil.coiledSupply,
        trappedSupply: signal.coil.trappedSupply,
        insiderCoil: signal.coil.insiderCoil,
        insiderRealized: signal.coil.insiderRealized,
        velocityOfRealization: signal.coil.velocityOfRealization,
        trapdoorUsd: signal.coil.trapdoorUsd,
        ceilingUsd: signal.coil.ceilingUsd,
        shelves: signal.coil.shelves,
      },
      ladder: signal.ladder,
      signalId: stored?.id ?? null,
      shareUrl: stored ? `/signal/${stored.shareSlug}` : null,
    },
    {
      headers: {
        'x-ratelimit-limit': String(API_DAILY_LIMIT),
        'x-ratelimit-remaining': String(Math.max(0, API_DAILY_LIMIT - auth.key.callsToday)),
      },
    },
  );
}
