import type { TokenSnapshot } from '@/lib/engine/types';
import { prisma } from './db';

/**
 * Snapshot cache.
 *
 * Upstream APIs are rate-limited and slow; the engine is neither. TTL scales
 * with how fast the token is actually moving — a token minted twenty minutes
 * ago invalidates in seconds, a settled one holds for minutes.
 */

export function ttlFor(snapshot: TokenSnapshot): number {
  if (snapshot.ageMinutes < 60) return 20;
  if (snapshot.ageMinutes < 360) return 45;
  return 90;
}

export async function readCachedSnapshot(tokenAddress: string): Promise<TokenSnapshot | null> {
  try {
    const row = await prisma.tokenCache.findUnique({ where: { tokenAddress } });
    if (!row) return null;

    const ageSeconds = (Date.now() - row.fetchedAt.getTime()) / 1000;
    if (ageSeconds > row.ttlSeconds) return null;

    const parsed: unknown = JSON.parse(row.snapshotJson);
    // Trust but verify: a schema change between deploys must not poison reads.
    if (!parsed || typeof parsed !== 'object' || !('priceUsd' in parsed)) return null;
    return parsed as TokenSnapshot;
  } catch {
    return null;
  }
}

export async function writeCachedSnapshot(snapshot: TokenSnapshot): Promise<void> {
  try {
    const payload = {
      chain: snapshot.chain,
      symbol: snapshot.symbol,
      snapshotJson: JSON.stringify(snapshot),
      priceUsd: snapshot.priceUsd,
      fetchedAt: new Date(snapshot.fetchedAtMs),
      ttlSeconds: ttlFor(snapshot),
    };
    await prisma.tokenCache.upsert({
      where: { tokenAddress: snapshot.address },
      create: { tokenAddress: snapshot.address, ...payload },
      update: payload,
    });
  } catch (err) {
    // A cache write must never fail a user's request.
    console.warn('[cache] write failed:', err instanceof Error ? err.message : err);
  }
}
