import type { Candle, HolderPosition, HolderTag, TokenSnapshot } from '@/lib/engine/types';

/**
 * Deterministic synthetic market data.
 *
 * This is not a stub that returns zeros. It generates a coherent token — a
 * price history, a holder book whose cost bases are consistent with that
 * history, and order flow that matches the story — so the engine is doing real
 * work on it and the UI shows what the product actually looks like.
 *
 * Same address in, same token out, forever. That makes demo mode screenshot-
 * stable, testable, and safe to link to.
 *
 * Everything produced here is flagged `synthetic: true`, which bars it from the
 * public track record. We are not padding a win rate with numbers we invented.
 */

/** mulberry32 — small, fast, good enough, and identical across runtimes. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

type Scenario = 'rug' | 'distribution' | 'chop' | 'runner';

const SCENARIOS: Scenario[] = ['rug', 'distribution', 'chop', 'runner'];

/** Curated addresses so the landing page and docs always show the same stories. */
const PINNED: Record<string, Scenario> = {
  mEEmeRUG11111111111111111111111111111111111: 'rug',
  mEEmeDUMP1111111111111111111111111111111111: 'distribution',
  mEEmeCHPP1111111111111111111111111111111111: 'chop',
  mEEmeAPEX1111111111111111111111111111111111: 'runner',
};

export function demoScenarioFor(address: string): Scenario {
  const pinned = PINNED[address];
  if (pinned) return pinned;
  const idx = hashString(address) % SCENARIOS.length;
  return SCENARIOS[idx] ?? 'chop';
}

const SYMBOL_PARTS = ['GIGA', 'MOON', 'FLOKI', 'WOJAK', 'PEPE', 'BONK', 'CHAD', 'DOGE', 'MEME', 'SIGMA'];
const SYMBOL_SUFFIX = ['INU', 'CAT', 'AI', '2', 'X', 'COIN', 'FI'];

function symbolFor(address: string, rng: () => number): string {
  const a = SYMBOL_PARTS[Math.floor(rng() * SYMBOL_PARTS.length)] ?? 'MEME';
  const b = SYMBOL_SUFFIX[Math.floor(rng() * SYMBOL_SUFFIX.length)] ?? 'X';
  return `${a}${b}`;
}

interface ScenarioShape {
  ageMinutes: number;
  /** Multiple from launch price to the peak of the run. */
  peakMultiple: number;
  /** How far price has retraced off that peak, 0..1. This is what creates
   *  trapped supply: the people who bought the top. Without it every synthetic
   *  token looks like everyone is in profit, which is not how tokens trade. */
  drawdownFromPeak: number;
  insiderSupply: number;
  insiderRealized: number;
  /** Positive = sells dominate. */
  flowBias: number;
  mintAuthorityActive: boolean;
  lpBurnedPct: number;
  liquidityUsd: number;
  fdvUsd: number;
  holderCount: number;
}

function shapeFor(scenario: Scenario, rng: () => number): ScenarioShape {
  switch (scenario) {
    case 'rug':
      return {
        ageMinutes: 25 + rng() * 60,
        peakMultiple: 8 + rng() * 25,
        drawdownFromPeak: 0.1 + rng() * 0.3,
        insiderSupply: 0.28 + rng() * 0.22,
        insiderRealized: 0.15 + rng() * 0.25,
        flowBias: 0.35 + rng() * 0.3,
        mintAuthorityActive: true,
        lpBurnedPct: rng() * 0.3,
        liquidityUsd: 6_000 + rng() * 18_000,
        fdvUsd: 900_000 + rng() * 4_000_000,
        holderCount: 90 + Math.floor(rng() * 200),
      };
    case 'distribution':
      return {
        ageMinutes: 180 + rng() * 600,
        peakMultiple: 12 + rng() * 40,
        drawdownFromPeak: 0.2 + rng() * 0.35,
        insiderSupply: 0.12 + rng() * 0.12,
        insiderRealized: 0.4 + rng() * 0.35,
        flowBias: 0.25 + rng() * 0.35,
        mintAuthorityActive: false,
        lpBurnedPct: 0.85 + rng() * 0.15,
        liquidityUsd: 60_000 + rng() * 200_000,
        fdvUsd: 2_000_000 + rng() * 20_000_000,
        holderCount: 1_500 + Math.floor(rng() * 6_000),
      };
    case 'runner':
      return {
        ageMinutes: 60 + rng() * 240,
        peakMultiple: 2.5 + rng() * 3,
        drawdownFromPeak: 0.45 + rng() * 0.3,
        insiderSupply: rng() * 0.04,
        insiderRealized: rng() * 0.08,
        flowBias: -0.35 - rng() * 0.3,
        mintAuthorityActive: false,
        lpBurnedPct: 0.95 + rng() * 0.05,
        liquidityUsd: 90_000 + rng() * 400_000,
        fdvUsd: 1_500_000 + rng() * 9_000_000,
        holderCount: 800 + Math.floor(rng() * 4_000),
      };
    case 'chop':
    default:
      return {
        ageMinutes: 300 + rng() * 2_000,
        peakMultiple: 3 + rng() * 8,
        drawdownFromPeak: 0.25 + rng() * 0.4,
        insiderSupply: 0.04 + rng() * 0.08,
        insiderRealized: 0.1 + rng() * 0.25,
        flowBias: -0.08 + rng() * 0.2,
        mintAuthorityActive: false,
        lpBurnedPct: 0.7 + rng() * 0.3,
        liquidityUsd: 40_000 + rng() * 150_000,
        fdvUsd: 800_000 + rng() * 6_000_000,
        holderCount: 600 + Math.floor(rng() * 3_000),
      };
  }
}

/**
 * A random walk from launch up to a peak and back down to spot. Real tokens do
 * not travel in one direction, and the retrace is what puts holders underwater
 * — which is the whole point of measuring trapped supply.
 */
function buildCandles(
  rng: () => number,
  startPrice: number,
  peakPrice: number,
  endPrice: number,
  count: number,
  nowMs: number,
  volatility: number,
): Candle[] {
  // Peak lands in the back half of the history, where it usually does.
  const peakIndex = Math.max(2, Math.min(count - 2, Math.floor(count * (0.5 + rng() * 0.35))));
  const upDrift = Math.log(peakPrice / startPrice) / peakIndex;
  const downDrift = Math.log(endPrice / peakPrice) / Math.max(1, count - peakIndex);

  const out: Candle[] = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const drift = i < peakIndex ? upDrift : downDrift;
    const shock = (rng() - 0.5) * 2 * volatility;
    const open = price;

    // Anchor the tail so the final close is exactly spot — the chart and the
    // quoted price must agree or the overlays lie.
    const target = i < peakIndex ? peakPrice : endPrice;
    const remaining = i < peakIndex ? peakIndex - i : count - i;
    const pull = remaining <= 3 ? Math.log(target / price) / Math.max(1, remaining) : 0;

    price = price * Math.exp(drift + shock + pull);
    const close = i === count - 1 ? endPrice : price;
    const high = Math.max(open, close) * (1 + rng() * volatility);
    const low = Math.min(open, close) * (1 - rng() * volatility);

    out.push({
      timeSec: Math.floor(nowMs / 1000) - (count - i) * 60,
      open,
      high,
      low,
      close,
      volumeUsd: 500 + rng() * 40_000,
    });
    price = close;
  }
  return out;
}

function buildHolders(
  rng: () => number,
  shape: ScenarioShape,
  launchPrice: number,
  circulating: number,
  nowMs: number,
  lpTokens: number,
  candles: Candle[],
): HolderPosition[] {
  const holders: HolderPosition[] = [];
  const ageMs = shape.ageMinutes * 60_000;
  const addr = (p: string, i: number): string => `${p}${i.toString().padStart(3, '0')}${'x'.repeat(28)}`;

  // The pool itself.
  holders.push({
    address: addr('POOL', 0),
    balance: lpTokens,
    costBasisUsd: null,
    firstSeenMs: nowMs - ageMs,
    lastActivityMs: nowMs,
    realizedFraction: 0,
    tags: ['lp'],
  });

  // The insider cluster: bought at or near launch, cheap, and already trimming.
  const insiderCount = Math.max(1, Math.round(6 + rng() * 18));
  const insiderTotal = circulating * shape.insiderSupply;
  for (let i = 0; i < insiderCount; i++) {
    const share = (1 / insiderCount) * (0.6 + rng() * 0.8);
    const tags: HolderTag[] = i === 0 ? ['deployer', 'sniper'] : rng() > 0.4 ? ['sniper', 'insider-cluster'] : ['insider-cluster', 'bundler'];
    holders.push({
      address: addr('INSD', i),
      balance: (insiderTotal * share) / 1.4,
      costBasisUsd: launchPrice * (0.9 + rng() * 0.4),
      firstSeenMs: nowMs - ageMs + rng() * 30_000,
      lastActivityMs: nowMs - rng() * 10 * 60_000,
      realizedFraction: Math.min(0.95, shape.insiderRealized * (0.5 + rng())),
      tags,
    });
  }

  // Organic holders buy off the actual price path, weighted by the volume that
  // traded at each point. That is why most of a token's float ends up bought
  // near the highs: that is where the volume was.
  const organicCount = 45 + Math.floor(rng() * 55);
  const organicSupply = circulating * (1 - shape.insiderSupply) * 0.55;
  const totalVolume = candles.reduce((sum, c) => sum + c.volumeUsd, 0);

  for (let i = 0; i < organicCount; i++) {
    // Sample a candle proportional to the volume that traded in it.
    let ticket = rng() * totalVolume;
    let idx = candles.length - 1;
    for (let c = 0; c < candles.length; c++) {
      ticket -= candles[c]?.volumeUsd ?? 0;
      if (ticket <= 0) { idx = c; break; }
    }
    const candle = candles[idx];
    // Fill somewhere inside that candle's range.
    const costBasis = candle
      ? candle.low + rng() * Math.max(candle.high - candle.low, candle.close * 1e-6)
      : launchPrice;

    const entryFraction = idx / Math.max(1, candles.length - 1);
    const weight = Math.pow(rng(), 2.2); // power-law sizes
    holders.push({
      address: addr('HODL', i),
      balance: (organicSupply * weight) / (organicCount * 0.18),
      costBasisUsd: costBasis,
      firstSeenMs: nowMs - ageMs * (1 - entryFraction),
      lastActivityMs: nowMs - rng() * ageMs * 0.5,
      realizedFraction: rng() > 0.7 ? rng() * 0.4 : 0,
      tags: rng() > 0.9 ? ['whale'] : rng() > 0.85 ? ['fresh'] : [],
    });
  }

  // A slice we could not price — real data always has some, and the engine
  // must be seen handling it.
  const unresolvedCount = 8 + Math.floor(rng() * 12);
  for (let i = 0; i < unresolvedCount; i++) {
    holders.push({
      address: addr('UNKN', i),
      balance: (circulating * 0.02 * rng()) / unresolvedCount,
      costBasisUsd: null,
      firstSeenMs: nowMs - ageMs * rng(),
      lastActivityMs: nowMs - rng() * ageMs,
      realizedFraction: 0,
      tags: rng() > 0.8 ? ['exchange'] : [],
    });
  }

  return holders.sort((a, b) => b.balance - a.balance);
}

/** Build a full synthetic snapshot for an address. Deterministic. */
export function buildDemoSnapshot(address: string, nowMs: number = Date.now()): TokenSnapshot {
  const rng = makeRng(hashString(address));
  const scenario = demoScenarioFor(address);
  const shape = shapeFor(scenario, rng);

  const symbol = symbolFor(address, rng);
  const circulating = 1_000_000_000;
  const currentPrice = shape.fdvUsd / circulating;
  const peakPrice = currentPrice / Math.max(0.05, 1 - shape.drawdownFromPeak);
  const launchPrice = peakPrice / shape.peakMultiple;

  const candleCount = Math.min(240, Math.max(30, Math.round(shape.ageMinutes)));
  const volatility = scenario === 'rug' ? 0.09 : scenario === 'runner' ? 0.035 : 0.055;
  const candles = buildCandles(rng, launchPrice, peakPrice, currentPrice, candleCount, nowMs, volatility);

  // LP holds roughly the value of the pool at spot.
  const lpTokens = Math.min(circulating * 0.25, shape.liquidityUsd / 2 / currentPrice);
  const holders = buildHolders(rng, shape, launchPrice, circulating, nowMs, lpTokens, candles);

  // Order flow consistent with the scenario's bias.
  const flow = (total: number, bias: number): { buys: number; sells: number } => {
    const sellShare = Math.min(0.92, Math.max(0.08, 0.5 + bias / 2));
    const sells = Math.round(total * sellShare);
    return { buys: Math.max(0, total - sells), sells };
  };
  const bias = shape.flowBias;

  const h24Volume = shape.liquidityUsd * (1.5 + rng() * 6);

  const resolved = holders.filter((h) => h.costBasisUsd !== null && !h.tags.includes('lp'));
  const resolvedSupply = resolved.reduce((s, h) => s + h.balance, 0);

  const priceAgo = (minutes: number): number => {
    const idx = Math.max(0, candles.length - 1 - minutes);
    return candles[idx]?.close ?? launchPrice;
  };
  const changePct = (minutes: number): number => {
    const past = priceAgo(minutes);
    return past > 0 ? ((currentPrice - past) / past) * 100 : 0;
  };

  return {
    address,
    chain: 'solana',
    symbol,
    name: `${symbol} (demo)`,
    priceUsd: currentPrice,
    liquidityUsd: shape.liquidityUsd,
    fdvUsd: shape.fdvUsd,
    circulatingSupply: circulating,
    ageMinutes: shape.ageMinutes,
    volumeUsd: {
      m5: (h24Volume / 288) * (0.4 + rng() * 3),
      h1: (h24Volume / 24) * (0.6 + rng() * 2),
      h6: (h24Volume / 4) * (0.7 + rng() * 1.4),
      h24: h24Volume,
    },
    priceChangePct: {
      m5: changePct(5),
      h1: changePct(60),
      h6: changePct(360),
      h24: changePct(1440),
    },
    txns: {
      m5: flow(30 + Math.floor(rng() * 120), bias),
      h1: flow(300 + Math.floor(rng() * 900), bias * 0.9),
      h6: flow(1_200 + Math.floor(rng() * 4_000), bias * 0.7),
      h24: flow(4_000 + Math.floor(rng() * 12_000), bias * 0.5),
    },
    holders,
    holderCount: shape.holderCount,
    lpBurnedPct: shape.lpBurnedPct,
    mintAuthorityActive: shape.mintAuthorityActive,
    freezeAuthorityActive: scenario === 'rug' && rng() > 0.6,
    candles,
    dataQuality: {
      holdersResolved: resolved.length,
      holdersUnresolved: holders.length - resolved.length - 1,
      supplyCovered: Math.min(1, resolvedSupply / circulating),
      clusterAnalysisRan: true,
      sources: ['demo'],
      synthetic: true,
    },
    fetchedAtMs: nowMs,
  };
}
