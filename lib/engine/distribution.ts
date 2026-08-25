import type { Candle, HolderPosition, TokenSnapshot } from './types';

/**
 * Cost-basis distribution.
 *
 * The engine needs one thing to work: what the float paid. The obvious way to
 * get it — replay every swap and rebuild each wallet's ledger — does not
 * survive contact with a real memecoin. A token with any volume has tens of
 * thousands of swaps, no free API will page through them inside a request, and
 * a truncated replay produces wallets whose reconstructed balance does not
 * match the chain. Refusing to guess then leaves you with no distribution at
 * all, which is worse than useless: it is a confident-looking zero.
 *
 * So the primary source is not per-wallet at all. It is the price history.
 *
 * Every candle is a record of supply changing hands: `volume / price` tokens
 * acquired a cost basis at that price. Tokens then turn over — a token bought
 * an hour ago may have been resold twice since. Under a random-reselection
 * model, the share of tokens bought at time t that are still held is
 * `exp(-turnover_since_t / float)`. Walking backwards from now and applying
 * that decay yields the distribution of what current holders paid, using
 * nothing but OHLCV.
 *
 * Per-wallet reconstruction is still used where it is both cheap and decisive:
 * the insider cluster is a few dozen addresses, and their individual histories
 * are short enough to fetch directly.
 */

/** A block of float sharing a cost basis. */
export interface SupplyBand {
  priceUsd: number;
  /** Share of tradable float at this cost basis, 0..1. */
  share: number;
  /** Share of *this band* held by insider-tagged wallets, 0..1. */
  insiderShare: number;
  /** Share of this band already sold. Only knowable from wallet data. */
  realizedShare: number;
  /**
   * Behavioural multiplier for this band, ~0.25..1.75. Wallet data gives a real
   * one; volume profile has no behaviour to observe, so it uses a recency
   * proxy — supply acquired recently is held by more active hands.
   */
  urgency: number;
}

export interface Distribution {
  bands: SupplyBand[];
  /** Fraction of float we could assign a cost basis to, 0..1. */
  covered: number;
  /** Which method produced this. Surfaced in the UI — it changes what to trust. */
  method: 'wallet' | 'volume-profile' | 'hybrid' | 'none';
}

/** Beyond this much cumulative turnover, survival is under 0.3% — stop walking. */
const MAX_TURNOVER_MULTIPLES = 6;
/** Bands smaller than this share of float are noise. */
const BAND_MIN_SHARE = 0.004;
/** Log-price bin ratio. Cost bases span orders of magnitude; linear bins hide the early cohort. */
const BIN_RATIO = 1.08;

const INSIDER_TAGS = new Set(['deployer', 'sniper', 'bundler', 'insider-cluster']);
const isInsiderHolder = (h: HolderPosition): boolean => h.tags.some((t) => INSIDER_TAGS.has(t));

/** Typical price — the level most of a candle's volume actually transacted at. */
const typicalPrice = (c: Candle): number => (c.high + c.low + c.close) / 3;

/**
 * Group raw (price, tokens) contributions into logarithmic bands, carrying the
 * weighted attributes along.
 */
function bin(
  contributions: { priceUsd: number; tokens: number; insiderTokens: number; realized: number; urgency: number }[],
  float: number,
): SupplyBand[] {
  if (float <= 0) return [];
  const logRatio = Math.log(BIN_RATIO);
  const bins = new Map<
    number,
    { tokens: number; weightedPrice: number; insiderTokens: number; realizedTokens: number; urgencyTokens: number }
  >();

  for (const c of contributions) {
    if (!(c.priceUsd > 0) || !(c.tokens > 0)) continue;
    const key = Math.round(Math.log(c.priceUsd) / logRatio);
    const entry = bins.get(key) ?? {
      tokens: 0,
      weightedPrice: 0,
      insiderTokens: 0,
      realizedTokens: 0,
      urgencyTokens: 0,
    };
    entry.tokens += c.tokens;
    entry.weightedPrice += c.tokens * c.priceUsd;
    entry.insiderTokens += c.insiderTokens;
    entry.realizedTokens += c.tokens * c.realized;
    entry.urgencyTokens += c.tokens * c.urgency;
    bins.set(key, entry);
  }

  const bands: SupplyBand[] = [];
  for (const [, entry] of bins) {
    const share = entry.tokens / float;
    if (share < BAND_MIN_SHARE) continue;
    bands.push({
      priceUsd: entry.weightedPrice / entry.tokens,
      share,
      insiderShare: Math.min(1, entry.insiderTokens / entry.tokens),
      realizedShare: Math.min(1, entry.realizedTokens / entry.tokens),
      urgency: entry.urgencyTokens / entry.tokens,
    });
  }

  return mergeAdjacent(bands.sort((a, b) => a.priceUsd - b.priceUsd));
}

/**
 * Bin boundaries fall where they fall, so one cluster of cost bases can land
 * either side of an edge and read as two shelves. Merge neighbours that are
 * closer together than the bin width — the split was an artefact, not a
 * feature of the book.
 */
function mergeAdjacent(bands: SupplyBand[]): SupplyBand[] {
  if (bands.length < 2) return bands;
  const out: SupplyBand[] = [];

  for (const band of bands) {
    const previous = out[out.length - 1];
    if (previous && band.priceUsd / previous.priceUsd < BIN_RATIO) {
      const total = previous.share + band.share;
      if (total <= 0) continue;
      out[out.length - 1] = {
        priceUsd: (previous.priceUsd * previous.share + band.priceUsd * band.share) / total,
        share: total,
        insiderShare:
          (previous.insiderShare * previous.share + band.insiderShare * band.share) / total,
        realizedShare:
          (previous.realizedShare * previous.share + band.realizedShare * band.share) / total,
        urgency: (previous.urgency * previous.share + band.urgency * band.share) / total,
      };
    } else {
      out.push({ ...band });
    }
  }

  return out;
}

/**
 * Derive the distribution from price history alone.
 *
 * @param float  Tradable supply, in token units.
 */
export function fromVolumeProfile(candles: Candle[], float: number): Distribution {
  if (candles.length < 3 || float <= 0) return { bands: [], covered: 0, method: 'none' };

  const ordered = [...candles].sort((a, b) => a.timeSec - b.timeSec);
  const newestSec = ordered[ordered.length - 1]?.timeSec ?? 0;
  const oldestSec = ordered[0]?.timeSec ?? newestSec;
  const windowSec = Math.max(1, newestSec - oldestSec);

  const contributions: Parameters<typeof bin>[0] = [];
  let turnover = 0;
  let accounted = 0;

  // Newest first: recent volume decides who holds now.
  for (let i = ordered.length - 1; i >= 0; i--) {
    const candle = ordered[i];
    if (!candle) continue;

    const price = typicalPrice(candle);
    if (!(price > 0) || !(candle.volumeUsd > 0)) continue;

    const tokensTraded = candle.volumeUsd / price;
    // Share of tokens bought here that have not since been resold.
    const survival = Math.exp(-turnover / float);
    // A high-volume candle can churn more tokens than exist. Those are the same
    // coins changing hands repeatedly, not new supply, so the contribution is
    // capped by what is left of the float — otherwise a single minute of a hot
    // token would claim to hold several times its own supply.
    const stillHeld = Math.min(tokensTraded * survival, Math.max(0, float - accounted));

    if (stillHeld > 0) {
      // Recency proxy for urgency: supply acquired in the last stretch of the
      // window is in more active hands than supply that has sat untouched.
      const recency = (candle.timeSec - oldestSec) / windowSec;
      contributions.push({
        priceUsd: price,
        tokens: stillHeld,
        insiderTokens: 0,
        realized: 0,
        urgency: 0.7 + 0.5 * recency,
      });
      accounted += stillHeld;
    }

    turnover += tokensTraded;
    if (turnover > float * MAX_TURNOVER_MULTIPLES) break;
  }

  if (accounted <= 0) return { bands: [], covered: 0, method: 'none' };

  return {
    bands: bin(contributions, float),
    // What is left over is float acquired before our price window — genuinely
    // unknown, and reported as such rather than smeared over the known bands.
    covered: Math.min(1, accounted / float),
    method: 'volume-profile',
  };
}

/**
 * Derive the distribution from reconstructed wallet positions. Strictly better
 * when the data is there, because it carries real behaviour: who has already
 * started selling, who has been dormant, who is an insider.
 */
export function fromWallets(
  holders: HolderPosition[],
  float: number,
  nowMs: number,
  tokenAgeMinutes: number,
): Distribution {
  if (float <= 0) return { bands: [], covered: 0, method: 'none' };

  const contributions: Parameters<typeof bin>[0] = [];
  let accounted = 0;
  const tokenAgeMs = Math.max(tokenAgeMinutes, 1) * 60_000;

  for (const h of holders) {
    if (h.tags.includes('lp')) continue;
    if (h.costBasisUsd === null || !(h.costBasisUsd > 0) || !(h.balance > 0)) continue;

    let urgency = 0.7 + 0.85 * Math.min(1, Math.max(0, h.realizedFraction));
    const dormancy = Math.min(1, Math.max(0, (nowMs - h.lastActivityMs) / tokenAgeMs));
    urgency -= 0.4 * dormancy;
    if (isInsiderHolder(h)) urgency += 0.35;
    if (h.tags.includes('fresh')) urgency += 0.15;
    urgency = Math.min(1.75, Math.max(0.25, urgency));

    contributions.push({
      priceUsd: h.costBasisUsd,
      tokens: h.balance,
      insiderTokens: isInsiderHolder(h) ? h.balance : 0,
      realized: Math.min(1, Math.max(0, h.realizedFraction)),
      urgency,
    });
    accounted += h.balance;
  }

  if (accounted <= 0) return { bands: [], covered: 0, method: 'none' };

  return {
    bands: bin(contributions, float),
    covered: Math.min(1, accounted / float),
    method: 'wallet',
  };
}

/** Wallet coverage below this is too thin to describe the float on its own. */
const WALLET_COVERAGE_FLOOR = 0.35;

/**
 * Choose the distribution to reason over.
 *
 * Wallet data wins when it actually covers the float. Otherwise the volume
 * profile carries the shape, and whatever wallet data we do have is overlaid so
 * the insider share of each band survives — that overlay is the difference
 * between "12% of supply is coiled here" and "12% of supply is coiled here and
 * two thirds of it is one actor".
 */
export function resolveDistribution(
  snapshot: TokenSnapshot,
  float: number,
): Distribution {
  const wallet = fromWallets(snapshot.holders, float, snapshot.fetchedAtMs, snapshot.ageMinutes);
  if (wallet.covered >= WALLET_COVERAGE_FLOOR) return wallet;

  const profile = fromVolumeProfile(snapshot.candles, float);
  if (profile.bands.length === 0) return wallet.bands.length > 0 ? wallet : { bands: [], covered: 0, method: 'none' };
  if (wallet.bands.length === 0) return profile;

  return {
    bands: overlayInsiders(profile.bands, wallet.bands),
    // The profile describes the float; the wallet data only sharpens it.
    covered: Math.max(profile.covered, wallet.covered),
    method: 'hybrid',
  };
}

/**
 * Project known insider positions onto the volume-profile bands, matching each
 * to the nearest band by price.
 */
function overlayInsiders(profileBands: SupplyBand[], walletBands: SupplyBand[]): SupplyBand[] {
  if (profileBands.length === 0) return profileBands;
  const merged = profileBands.map((b) => ({ ...b }));

  for (const w of walletBands) {
    if (w.insiderShare <= 0 && w.realizedShare <= 0) continue;

    let nearest = merged[0];
    if (!nearest) continue;
    let bestDistance = Math.abs(Math.log(w.priceUsd / nearest.priceUsd));
    for (const band of merged) {
      const distance = Math.abs(Math.log(w.priceUsd / band.priceUsd));
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = band;
      }
    }

    // Only claim a match when the prices genuinely agree — within one doubling.
    if (bestDistance > Math.log(2)) continue;

    const insiderTokensInBand = Math.min(nearest.share, w.share * w.insiderShare);
    nearest.insiderShare = Math.min(1, nearest.insiderShare + insiderTokensInBand / Math.max(nearest.share, 1e-9));
    nearest.realizedShare = Math.max(nearest.realizedShare, w.realizedShare);
    nearest.urgency = Math.max(nearest.urgency, w.urgency);
  }

  return merged;
}
