import { reconstructHolders, summarizeCoverage } from '@/lib/engine/cluster';
import type { HolderPosition, TokenSnapshot } from '@/lib/engine/types';
import { birdeyeConfigured, fetchCandles, fetchSolPriceUsd } from './birdeye';
import { buildDemoSnapshot } from './demo';
import { fetchDexScreenerMarket } from './dexscreener';
import { fetchAsset, fetchHolderBalances, fetchTokenHistory, heliusConfigured } from './helius';
import { fetchRugcheckReport } from './rugcheck';

export { buildDemoSnapshot, demoScenarioFor } from './demo';

/**
 * Snapshot assembly.
 *
 * Providers are independent and every one of them is allowed to fail. What
 * comes back is the best snapshot the available data supports, with
 * `dataQuality` describing honestly what we actually had. The engine then
 * degrades its own confidence from that — the UI never has to guess.
 */

export type DataMode = 'live' | 'demo';

export interface SnapshotResult {
  snapshot: TokenSnapshot;
  mode: DataMode;
  /** Providers that answered. */
  sources: string[];
  /** Providers that were asked and failed or were unconfigured. */
  missing: string[];
}

/** Solana mints are base58, 32–44 chars. Cheap guard before we spend a request. */
export function isPlausibleSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address.trim());
}

const FALLBACK_SOL_PRICE_USD = 150;

export function demoModeForced(): boolean {
  return (process.env.MEEME_FORCE_DEMO ?? '').toLowerCase() === 'true';
}

/**
 * True when we have no way to reach live market data at all. DexScreener needs
 * no key, so this is really "is the network reachable from this deployment".
 */
export function anyProviderConfigured(): boolean {
  return !demoModeForced();
}

export async function buildSnapshot(
  tokenAddress: string,
  nowMs: number = Date.now(),
): Promise<SnapshotResult> {
  if (demoModeForced()) {
    return {
      snapshot: buildDemoSnapshot(tokenAddress, nowMs),
      mode: 'demo',
      sources: ['demo'],
      missing: [],
    };
  }

  const sources: string[] = [];
  const missing: string[] = [];

  // Market data and structural data are independent — fetch together.
  const [market, rugcheck] = await Promise.all([
    fetchDexScreenerMarket(tokenAddress, nowMs),
    fetchRugcheckReport(tokenAddress),
  ]);

  if (market) sources.push('dexscreener');
  else missing.push('dexscreener');
  if (rugcheck) sources.push('rugcheck');
  else missing.push('rugcheck');

  // Without a price there is no snapshot worth building. Fall back to demo so
  // the product still demonstrates itself rather than showing an error page.
  if (!market) {
    return {
      snapshot: buildDemoSnapshot(tokenAddress, nowMs),
      mode: 'demo',
      sources: ['demo'],
      missing,
    };
  }

  const decimals = rugcheck?.decimals ?? 6;

  const [candles, solPrice, asset] = await Promise.all([
    fetchCandles(tokenAddress, 240, nowMs),
    fetchSolPriceUsd(),
    heliusConfigured() ? fetchAsset(tokenAddress) : Promise.resolve(null),
  ]);

  if (candles) sources.push('birdeye:ohlcv');
  else missing.push(birdeyeConfigured() ? 'birdeye:ohlcv' : 'birdeye (no key)');
  if (asset) sources.push('helius:asset');

  const circulatingSupply =
    asset?.supply ??
    rugcheck?.totalSupply ??
    (market.fdvUsd > 0 && market.priceUsd > 0 ? market.fdvUsd / market.priceUsd : 0);

  // The expensive part: per-wallet cost basis. Only Helius can give us this.
  let holders: HolderPosition[] = [];
  let clusterAnalysisRan = false;
  let historyTruncated = false;

  if (heliusConfigured()) {
    const [balanceResult, history] = await Promise.all([
      fetchHolderBalances(tokenAddress, asset?.decimals ?? decimals),
      fetchTokenHistory(tokenAddress, solPrice ?? FALLBACK_SOL_PRICE_USD),
    ]);

    if (balanceResult) sources.push('helius:holders');
    else missing.push('helius:holders');
    if (history) sources.push('helius:history');
    else missing.push('helius:history');

    if (balanceResult) {
      historyTruncated = balanceResult.truncated || (history?.truncated ?? false);
      const launchTimeMs = nowMs - market.ageMinutes * 60_000;

      holders = reconstructHolders({
        trades: history?.trades ?? [],
        fundingEdges: history?.fundingEdges ?? [],
        deployer: rugcheck?.creator ?? null,
        launchSlot: null,
        launchTimeMs,
        currentBalances: balanceResult.balances,
        lpAccounts: rugcheck?.lpAccounts ?? new Set<string>(),
        exchangeAccounts: new Set<string>(),
      });

      // RugCheck's own insider flags are a useful prior. Merge them in rather
      // than discarding either source.
      if (rugcheck?.flaggedInsiders.size) {
        for (const h of holders) {
          if (rugcheck.flaggedInsiders.has(h.address) && !h.tags.includes('insider-cluster')) {
            h.tags = [...h.tags, 'insider-cluster'];
          }
        }
      }
      clusterAnalysisRan = Boolean(history);
    }
  } else {
    missing.push('helius (no key — no cost basis, structural analysis only)');
    // Fall back to RugCheck's top-holder list. Balances without cost basis
    // still tell us about concentration, and the engine handles null bases.
    if (rugcheck?.balances.size) {
      for (const [wallet, balance] of rugcheck.balances) {
        holders.push({
          address: wallet,
          balance,
          costBasisUsd: null,
          firstSeenMs: nowMs - market.ageMinutes * 60_000,
          lastActivityMs: nowMs,
          realizedFraction: 0,
          tags: rugcheck.lpAccounts.has(wallet)
            ? ['lp']
            : rugcheck.flaggedInsiders.has(wallet)
              ? ['insider-cluster']
              : [],
        });
      }
    }
  }

  const coverage = summarizeCoverage(holders, circulatingSupply);

  const snapshot: TokenSnapshot = {
    address: tokenAddress,
    chain: 'solana',
    symbol: asset?.symbol || market.symbol,
    name: asset?.name || market.name,
    priceUsd: market.priceUsd,
    liquidityUsd: market.liquidityUsd,
    fdvUsd: market.fdvUsd,
    circulatingSupply,
    ageMinutes: market.ageMinutes,
    volumeUsd: market.volumeUsd,
    priceChangePct: market.priceChangePct,
    txns: market.txns,
    holders,
    holderCount: rugcheck?.holderCount ?? holders.length,
    lpBurnedPct: rugcheck?.lpBurnedPct ?? 0,
    mintAuthorityActive: rugcheck?.mintAuthorityActive ?? false,
    freezeAuthorityActive: rugcheck?.freezeAuthorityActive ?? false,
    candles: candles ?? [],
    dataQuality: {
      ...coverage,
      clusterAnalysisRan,
      sources,
      synthetic: false,
    },
    fetchedAtMs: nowMs,
  };

  if (historyTruncated) {
    // Truncated history means some wallets look like they never bought. Say so
    // by discounting coverage rather than silently over-claiming.
    snapshot.dataQuality.supplyCovered *= 0.8;
  }

  return { snapshot, mode: 'live', sources, missing };
}

/** Which providers are configured. Powers /api/diagnostics and the UI banner. */
export function providerStatus(): { name: string; configured: boolean; required: boolean; note: string }[] {
  return [
    {
      name: 'dexscreener',
      configured: true,
      required: true,
      note: 'No key needed. Price, liquidity, volume and order-flow counts.',
    },
    {
      name: 'rugcheck',
      configured: true,
      required: false,
      note: 'No key needed. Mint/freeze authority, LP lock, top holders, insider flags.',
    },
    {
      name: 'helius',
      configured: heliusConfigured(),
      required: false,
      note: 'Holder balances and swap history. Without it there is no cost basis, so no coil — structural analysis only.',
    },
    {
      name: 'birdeye',
      configured: birdeyeConfigured(),
      required: false,
      note: 'OHLCV candles and SOL price. Without it the chart is empty and the stop uses a default range.',
    },
  ];
}
