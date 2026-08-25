import type {
  CoilReport,
  HolderPosition,
  SupplyShelf,
  TokenSnapshot,
} from './types';

/* ------------------------------------------------------------------ *
 * Tunable constants. Every one of these is a claim about trader
 * psychology, so each carries the claim it encodes.
 * ------------------------------------------------------------------ */

/**
 * Saturation constant for the coil weight. Controls how fast profit converts
 * into willingness to sell. K=2.2 puts a 2x holder at ~0.31, a 10x at ~0.78
 * and a 100x at ~0.97: past roughly 20x, more profit barely moves the needle
 * because the holder is already maximally inclined to take it.
 */
const COIL_SATURATION_K = 2.2;

/**
 * Underwater holders get stickier the deeper they are: someone down 5% sells
 * the instant they are whole, someone down 90% has emotionally written the
 * position off and will sit through anything. Exponent < 1 makes the curve
 * rise fast then flatten.
 */
const TRAP_CURVE_EXPONENT = 0.6;

/** Profit-weighted coiled supply at which selling pressure is considered maxed. */
const COIL_NORMALIZER = 0.45;
/** Insider-held profitable supply at which insider risk is considered maxed. */
const INSIDER_NORMALIZER = 0.2;
/** Trapped supply at which structural support is considered maxed. */
const TRAP_NORMALIZER = 0.35;

/** Shelves smaller than this share of tradable supply are noise. */
const SHELF_MIN_FRACTION = 0.015;
/** Log-price bin ratio used to group cost bases into shelves. */
const SHELF_BIN_RATIO = 1.15;

const INSIDER_TAGS = new Set(['deployer', 'sniper', 'bundler', 'insider-cluster']);

export const clamp = (v: number, lo: number, hi: number): number =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;

const safeDiv = (a: number, b: number, fallback = 0): number =>
  b === 0 || !Number.isFinite(b) ? fallback : a / b;

export const isInsider = (h: HolderPosition): boolean =>
  h.tags.some((t) => INSIDER_TAGS.has(t));

/** LP vaults are the counterparty to a trade, never a seller. */
const isStructural = (h: HolderPosition): boolean => h.tags.includes('lp');

/**
 * How much a profitable holder wants out, as a function of how far up they are.
 * Zero at or below breakeven, saturating toward 1.
 */
export function coilWeight(multiple: number): number {
  if (!Number.isFinite(multiple) || multiple <= 1) return 0;
  return Math.tanh(Math.log(multiple) / COIL_SATURATION_K);
}

/**
 * How immovable an underwater holder is. Zero at or above breakeven,
 * approaching 1 as the position approaches a total loss.
 */
export function trapWeight(multiple: number): number {
  if (!Number.isFinite(multiple) || multiple >= 1) return 0;
  const drawdown = clamp(1 - multiple, 0, 1);
  return Math.pow(drawdown, TRAP_CURVE_EXPONENT);
}

/**
 * Behavioural multiplier on a holder's coil. Two wallets sitting on the same
 * 10x are not the same threat: one has already started selling, the other has
 * not touched the position in six hours.
 */
export function urgency(holder: HolderPosition, snapshot: TokenSnapshot): number {
  let u = 0.7;

  // A wallet that has already sold part of its bag is a proven seller.
  u += 0.85 * clamp(holder.realizedFraction, 0, 1);

  // Dormancy relative to the token's own lifetime. A wallet quiet for most of
  // the token's life is not the one about to hit you.
  const tokenAgeMs = Math.max(snapshot.ageMinutes, 1) * 60_000;
  const sinceActivityMs = Math.max(0, snapshot.fetchedAtMs - holder.lastActivityMs);
  u -= 0.4 * clamp(safeDiv(sinceActivityMs, tokenAgeMs), 0, 1);

  // Wallets that exist to flip act faster than wallets that exist to hold.
  if (isInsider(holder)) u += 0.35;
  if (holder.tags.includes('fresh')) u += 0.15;

  return clamp(u, 0.25, 1.75);
}

/**
 * Supply that can actually be sold by an identifiable actor. LP holdings are
 * excluded because the pool is the buyer of last resort, not a participant.
 */
export function tradableSupply(snapshot: TokenSnapshot): number {
  const lp = snapshot.holders
    .filter(isStructural)
    .reduce((sum, h) => sum + h.balance, 0);
  const tradable = snapshot.circulatingSupply - lp;
  return tradable > 0 ? tradable : snapshot.circulatingSupply;
}

/**
 * Group holder cost bases into logarithmic price shelves. Memecoin cost bases
 * span orders of magnitude, so linear bucketing would collapse the whole early
 * cohort into one bar and hide exactly the cluster that matters.
 */
export function computeShelves(
  snapshot: TokenSnapshot,
  referencePriceUsd: number,
): SupplyShelf[] {
  const float = tradableSupply(snapshot);
  if (float <= 0 || referencePriceUsd <= 0) return [];

  const priced = snapshot.holders.filter(
    (h) =>
      !isStructural(h) &&
      h.costBasisUsd !== null &&
      h.costBasisUsd > 0 &&
      h.balance > 0,
  );
  if (priced.length === 0) return [];

  const logRatio = Math.log(SHELF_BIN_RATIO);
  const bins = new Map<number, { supply: number; insiderSupply: number; weighted: number }>();

  for (const h of priced) {
    const cost = h.costBasisUsd as number;
    const binIndex = Math.round(Math.log(cost) / logRatio);
    const entry = bins.get(binIndex) ?? { supply: 0, insiderSupply: 0, weighted: 0 };
    entry.supply += h.balance;
    entry.weighted += h.balance * cost;
    if (isInsider(h)) entry.insiderSupply += h.balance;
    bins.set(binIndex, entry);
  }

  const shelves: SupplyShelf[] = [];
  for (const [binIndex, entry] of bins) {
    const supplyFraction = entry.supply / float;
    if (supplyFraction < SHELF_MIN_FRACTION) continue;
    // Represent the shelf at its supply-weighted average cost, not the bin edge.
    const priceUsd = entry.supply > 0 ? entry.weighted / entry.supply : Math.exp(binIndex * logRatio);
    shelves.push({
      priceUsd,
      supplyFraction,
      kind: priceUsd < referencePriceUsd ? 'coiled' : 'trapped',
      insiderShare: clamp(safeDiv(entry.insiderSupply, entry.supply), 0, 1),
    });
  }

  return shelves.sort((a, b) => a.priceUsd - b.priceUsd);
}

/**
 * Pick the shelf that actually matters in a direction: big shelves matter more,
 * near shelves matter more, and the trade-off between the two is explicit.
 */
function selectShelf(
  shelves: SupplyShelf[],
  referencePriceUsd: number,
  kind: 'coiled' | 'trapped',
): SupplyShelf | null {
  let best: SupplyShelf | null = null;
  let bestScore = 0;

  for (const shelf of shelves) {
    if (shelf.kind !== kind) continue;
    const relativeDistance = Math.abs(shelf.priceUsd - referencePriceUsd) / referencePriceUsd;
    // Size, discounted by how far away it is. A 10% shelf at arm's length beats
    // a 15% shelf three doublings away.
    const score = shelf.supplyFraction / (1 + 2 * relativeDistance);
    if (score > bestScore) {
      bestScore = score;
      best = shelf;
    }
  }
  return best;
}

/**
 * Velocity of Realization: is profitable supply converting to cash right now?
 * Negative means accumulation, positive means distribution.
 */
export function velocityOfRealization(snapshot: TokenSnapshot): number {
  const netFlow = (w: { buys: number; sells: number }): number => {
    const total = w.buys + w.sells;
    return total === 0 ? 0 : (w.sells - w.buys) / total;
  };

  // Recent windows dominate; older windows provide the baseline.
  const base =
    0.5 * netFlow(snapshot.txns.m5) +
    0.3 * netFlow(snapshot.txns.h1) +
    0.2 * netFlow(snapshot.txns.h6);

  // Volume acceleration amplifies whichever direction flow is already going.
  // The 5m window annualized to an hour, over the actual trailing hour.
  const projectedHourly = snapshot.volumeUsd.m5 * 12;
  const accelRatio = safeDiv(projectedHourly, Math.max(snapshot.volumeUsd.h1, 1), 1);
  const accelSignal = clamp(safeDiv(Math.log(Math.max(accelRatio, 0.01)), Math.log(3)), 0, 1);

  const amplified = base * (1 + 0.6 * accelSignal);
  return clamp(amplified, -1, 1);
}

/** Structural red flags that exist independently of who holds what. */
export function structuralRisk(snapshot: TokenSnapshot): {
  risk: number;
  flags: string[];
} {
  const flags: string[] = [];
  let risk = 0;

  if (snapshot.mintAuthorityActive) {
    risk += 0.35;
    flags.push('Mint authority is still live — supply can be printed at will.');
  }
  if (snapshot.freezeAuthorityActive) {
    risk += 0.3;
    flags.push('Freeze authority is still live — your tokens can be frozen in place.');
  }
  if (snapshot.lpBurnedPct < 0.5) {
    const unburned = 1 - clamp(snapshot.lpBurnedPct, 0, 1);
    risk += 0.25 * unburned;
    flags.push(
      `Only ${(snapshot.lpBurnedPct * 100).toFixed(0)}% of LP is burned or locked — liquidity can be pulled.`,
    );
  }

  // Thin liquidity relative to nominal valuation: the price is a quote, not a bid.
  const liquidityRatio = safeDiv(snapshot.liquidityUsd, Math.max(snapshot.fdvUsd, 1));
  if (liquidityRatio < 0.03) {
    risk += 0.25 * clamp((0.03 - liquidityRatio) / 0.03, 0, 1);
    flags.push(
      `Liquidity is ${(liquidityRatio * 100).toFixed(1)}% of FDV — the marked price will not survive contact with a real sell.`,
    );
  }

  if (snapshot.holderCount < 150 && snapshot.ageMinutes > 30) {
    risk += 0.1;
    flags.push(`${snapshot.holderCount} holders after ${Math.round(snapshot.ageMinutes)}m — no organic distribution.`);
  }

  return { risk: clamp(risk, 0, 1), flags };
}

/** Confidence in the read, driven entirely by how much of the float we could price. */
export function computeConfidence(snapshot: TokenSnapshot): number {
  const q = snapshot.dataQuality;
  let c = 0.15 + 0.6 * clamp(q.supplyCovered, 0, 1);
  if (q.clusterAnalysisRan) c += 0.15;
  if (snapshot.candles.length >= 30) c += 0.1;
  if (q.holdersResolved < 20) c -= 0.2;
  return clamp(c, 0.05, 1);
}

/**
 * The main event. Partition the float around spot and measure both sides.
 *
 * Deliberately takes no reference price. Profit and loss that drive selling are
 * measured against the price a holder can actually sell at right now, so the
 * whole report is objective market structure. Where the *trader* stands is a
 * separate question, answered in the reasoning and the ladder.
 */
export function analyzeCoil(snapshot: TokenSnapshot): CoilReport {
  const float = tradableSupply(snapshot);
  const spot = snapshot.priceUsd;

  let coiled = 0;
  let trapped = 0;
  let insiderCoiledRaw = 0;
  let insiderSupplyTotal = 0;
  let insiderRealizedWeighted = 0;

  for (const h of snapshot.holders) {
    if (isStructural(h) || h.balance <= 0) continue;
    const share = safeDiv(h.balance, float);

    if (isInsider(h)) {
      insiderSupplyTotal += share;
      insiderRealizedWeighted += share * clamp(h.realizedFraction, 0, 1);
    }

    if (h.costBasisUsd === null || h.costBasisUsd <= 0) continue;

    // Profit is measured against spot — that is the price they can actually sell at.
    const multiple = spot / h.costBasisUsd;

    if (multiple > 1) {
      coiled += share * coilWeight(multiple) * urgency(h, snapshot);
      if (isInsider(h)) insiderCoiledRaw += share;
    } else {
      trapped += share * trapWeight(multiple);
    }
  }

  const shelves = computeShelves(snapshot, spot);
  const trapdoor = selectShelf(shelves, spot, 'coiled');
  const ceiling = selectShelf(shelves, spot, 'trapped');

  const vor = velocityOfRealization(snapshot);
  const { risk, flags } = structuralRisk(snapshot);
  const confidence = computeConfidence(snapshot);

  const csNorm = clamp(safeDiv(coiled, COIL_NORMALIZER), 0, 1);
  const icNorm = clamp(safeDiv(insiderCoiledRaw, INSIDER_NORMALIZER), 0, 1);
  const vorPositive = clamp(vor, 0, 1);
  const supportNorm = clamp(safeDiv(trapped, TRAP_NORMALIZER), 0, 1);

  const coilScore = clamp(
    0.3 * csNorm + 0.28 * icNorm + 0.22 * vorPositive + 0.2 * risk - 0.14 * supportNorm,
    0,
    1,
  );

  return {
    coiledSupply: coiled,
    trappedSupply: trapped,
    insiderCoil: insiderCoiledRaw,
    insiderRealized: clamp(safeDiv(insiderRealizedWeighted, insiderSupplyTotal), 0, 1),
    velocityOfRealization: vor,
    coilScore,
    confidence,
    shelves,
    trapdoorUsd: trapdoor?.priceUsd ?? null,
    ceilingUsd: ceiling?.priceUsd ?? null,
    structuralFlags: flags,
  };
}
