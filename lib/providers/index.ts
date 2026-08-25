import { reconstructHolders, summarizeCoverage } from '@/lib/engine/cluster';
import type { HolderPosition, TokenSnapshot } from '@/lib/engine/types';
import { birdeyeConfigured, fetchCandles, fetchSolPriceUsd } from './birdeye';
import { buildDemoSnapshot } from './demo';
import { fetchDexScreenerMarket } from './dexscreener';
import { fetchAsset, fetchHolderBalances, fetchWalletHistories, heliusConfigured } from './helius';
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
    // Resolution is chosen from the token's age — see intervalForAge.
    fetchCandles(tokenAddress, market.ageMinutes, nowMs),
    fetchSolPriceUsd(),
    heliusConfigured() ? fetchAsset(tokenAddress) : Promise.resolve(null),
  ]);

  if (candles) sources.push('birdeye:ohlcv');
  else {
    missing.push(
      birdeyeConfigured()
        ? 'birdeye:ohlcv'
        : 'birdeye (no key — no price history, so no cost-basis distribution)',
    );
  }
  if (asset) sources.push('helius:asset');

  const circulatingSupply =
    asset?.supply ??
    rugcheck?.totalSupply ??
    (market.fdvUsd > 0 && market.priceUsd > 0 ? market.fdvUsd / market.priceUsd : 0);

  // Holder book. Balances tell us concentration and give the cluster analysis
  // something to work on; the float's cost basis comes from the volume profile.
  let holders: HolderPosition[] = [];
  let clusterAnalysisRan = false;
  let historyTruncated = false;

  const launchTimeMs = nowMs - market.ageMinutes * 60_000;
  const balanceResult = heliusConfigured()
    ? await fetchHolderBalances(tokenAddress, asset?.decimals ?? decimals)
    : null;

  if (balanceResult) sources.push('helius:holders');
  else if (heliusConfigured()) missing.push('helius:holders');

  // Prefer Helius balances, fall back to RugCheck's top-holder list.
  const balances: Map<string, number> =
    balanceResult?.balances ?? rugcheck?.balances ?? new Map<string, number>();
  historyTruncated = balanceResult?.truncated ?? false;

  if (balances.size > 0) {
    // First pass with no trade history: establishes who the suspects are from
    // balances, RugCheck's flags and the deployer relationship.
    holders = reconstructHolders({
      trades: [],
      fundingEdges: [],
      deployer: rugcheck?.creator ?? null,
      launchSlot: null,
      launchTimeMs,
      currentBalances: balances,
      lpAccounts: rugcheck?.lpAccounts ?? new Set<string>(),
      exchangeAccounts: new Set<string>(),
    });

    if (rugcheck?.flaggedInsiders.size) {
      for (const h of holders) {
        if (rugcheck.flaggedInsiders.has(h.address) && !h.tags.includes('insider-cluster')) {
          h.tags = [...h.tags, 'insider-cluster'];
        }
      }
    }

    // Second pass, and the reason this is affordable: fetch history only for
    // the wallets whose exact cost basis actually changes the call — the
    // deployer, the snipers, and the biggest holders. That is a few dozen
    // addresses, not the token's entire trade log.
    if (heliusConfigured()) {
      const suspects = selectWalletsToPrice(holders, rugcheck?.creator ?? null);
      const history = await fetchWalletHistories(
        suspects,
        tokenAddress,
        solPrice ?? FALLBACK_SOL_PRICE_USD,
      );

      if (history) {
        sources.push('helius:wallet-history');
        holders = reconstructHolders({
          trades: history.trades,
          fundingEdges: history.fundingEdges,
          deployer: rugcheck?.creator ?? null,
          launchSlot: null,
          launchTimeMs,
          currentBalances: balances,
          lpAccounts: rugcheck?.lpAccounts ?? new Set<string>(),
          exchangeAccounts: new Set<string>(),
        });
        if (rugcheck?.flaggedInsiders.size) {
          for (const h of holders) {
            if (rugcheck.flaggedInsiders.has(h.address) && !h.tags.includes('insider-cluster')) {
              h.tags = [...h.tags, 'insider-cluster'];
            }
          }
        }
        clusterAnalysisRan = true;
      } else {
        missing.push('helius:wallet-history');
      }
    }
  }

  if (!heliusConfigured()) {
    missing.push('helius (no key — insider cost basis unavailable)');
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

/**
 * Choose which wallets are worth spending a history request on.
 *
 * Ranked by how much their exact cost basis moves the call: the deployer and
 * anything already flagged as coordinated first, then the largest holders,
 * because a wallet holding 0.01% of the float cannot change a verdict no matter
 * what it paid.
 */
export function selectWalletsToPrice(
  holders: HolderPosition[],
  deployer: string | null,
  limit = 30,
): string[] {
  const priority = (h: HolderPosition): number => {
    if (h.address === deployer) return 0;
    if (h.tags.includes('deployer')) return 0;
    if (h.tags.includes('sniper') || h.tags.includes('bundler')) return 1;
    if (h.tags.includes('insider-cluster')) return 2;
    return 3;
  };

  return holders
    .filter((h) => !h.tags.includes('lp') && !h.tags.includes('exchange') && h.balance > 0)
    .sort((a, b) => priority(a) - priority(b) || b.balance - a.balance)
    .slice(0, limit)
    .map((h) => h.address);
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
