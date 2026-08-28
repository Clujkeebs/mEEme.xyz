import type { AlphaSignal } from '@/lib/engine/types';
import { prisma } from './db';
import { captureError } from './observability';

/**
 * Persisting a signal is what makes the track record possible. Two rules:
 *
 *  1. Synthetic reads are never stored as signals. A demo token's outcome is
 *     whatever the generator decided, and grading it would be inventing a win
 *     rate. Demo mode is for showing the product, not for padding the ledger.
 *  2. Low-confidence reads are stored but flagged, so the public page can show
 *     accuracy at a stated confidence floor rather than mixing guesses in.
 */

/** Reads below this confidence are not published to the track record. */
export const TRACK_RECORD_CONFIDENCE_FLOOR = 0.45;

export async function recordSignal(
  signal: AlphaSignal,
  userId: string | null,
): Promise<{ id: string; shareSlug: string } | null> {
  if (signal.snapshot.dataQuality.synthetic) return null;

  try {
    const row = await prisma.signal.create({
      data: {
        userId,
        tokenAddress: signal.snapshot.address,
        chain: signal.snapshot.chain,
        symbol: signal.snapshot.symbol,
        verdict: signal.verdict,
        conviction: signal.conviction,
        coilScore: signal.coil.coilScore,
        confidence: signal.coil.confidence,
        headline: signal.headline,
        coiledSupply: signal.coil.coiledSupply,
        trappedSupply: signal.coil.trappedSupply,
        insiderCoil: signal.coil.insiderCoil,
        insiderRealized: signal.coil.insiderRealized,
        velocityOfRealization: signal.coil.velocityOfRealization,
        priceAtSignal: signal.snapshot.priceUsd,
        trapdoorUsd: signal.coil.trapdoorUsd,
        ceilingUsd: signal.coil.ceilingUsd,
        halfLifeMin: signal.halfLifeMinutes,
        reasoningJson: JSON.stringify(signal.reasoning),
        ladderJson: signal.ladder ? JSON.stringify(signal.ladder) : null,
        synthetic: false,
      },
      select: { id: true, shareSlug: true },
    });
    return row;
  } catch (err) {
    // Never fail a trader's read because we could not write history.
    console.warn('[signal-store] failed to record signal:', err instanceof Error ? err.message : err);
    captureError('signal-store:record', err);
    return null;
  }
}
