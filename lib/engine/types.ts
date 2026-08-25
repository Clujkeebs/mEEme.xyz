/**
 * mEEme Alpha Engine — Coiled Supply Analysis (CSA)
 *
 * Thesis: a memecoin's next move is not written in its candles. It is written in
 * the unrealized PnL of the wallets that already hold it.
 *
 *   - Every holder cheaper than you is a coiled spring pointed at your exit.
 *   - Every holder more expensive than you is a trapped bag that will not sell
 *     into weakness — it is structure, not risk.
 *
 * The engine partitions supply along that line, weights each side by how badly
 * the holder wants to act, and turns the result into a ladder and a stop.
 *
 * Everything in this module is a pure function. No network, no clock, no
 * randomness. That is what makes it testable — and what makes it real.
 */

export type Chain = 'solana' | 'ethereum' | 'base';

/** Why we believe a wallet is not an organic buyer. */
export type HolderTag =
  | 'deployer'        // created the mint
  | 'sniper'          // bought in the launch block / first seconds
  | 'bundler'         // bought in a bundled transaction with the deploy
  | 'insider-cluster' // shares a funding source with the deployer or snipers
  | 'lp'              // liquidity pool / AMM vault — not a seller
  | 'exchange'        // known CEX hot wallet — custodial, not a single actor
  | 'whale'           // large organic holder
  | 'fresh';          // wallet created immediately before its first buy

/** A holder with a reconstructed cost basis. */
export interface HolderPosition {
  address: string;
  /** Token units currently held. */
  balance: number;
  /** Volume-weighted average USD cost per token. null when unreconstructable. */
  costBasisUsd: number | null;
  /** First buy, epoch ms. */
  firstSeenMs: number;
  /** Most recent buy or sell, epoch ms. */
  lastActivityMs: number;
  /**
   * Fraction of this wallet's peak balance already sold, 0..1.
   * A wallet that has begun distributing is a proven seller, not a maybe.
   */
  realizedFraction: number;
  tags: HolderTag[];
}

export interface Candle {
  timeSec: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volumeUsd: number;
}

export interface WindowedTxns {
  buys: number;
  sells: number;
}

/**
 * How much of the picture we actually have. The engine degrades honestly:
 * it never pretends a thin snapshot is a thick one.
 */
export interface DataQuality {
  /** Holders whose cost basis we reconstructed. */
  holdersResolved: number;
  /** Holders we know exist but could not price. */
  holdersUnresolved: number;
  /** Fraction of circulating supply covered by resolved holders, 0..1. */
  supplyCovered: number;
  /** True when insider-cluster detection actually ran (vs. unavailable). */
  clusterAnalysisRan: boolean;
  /** Providers that answered, for display and debugging. */
  sources: string[];
  /** True when this snapshot is synthetic (demo mode). Never logged as a real signal. */
  synthetic: boolean;
}

/** Normalized token state. Every provider produces this shape; the engine only reads it. */
export interface TokenSnapshot {
  address: string;
  chain: Chain;
  symbol: string;
  name: string;
  priceUsd: number;
  liquidityUsd: number;
  fdvUsd: number;
  /** Supply actually in circulation, in token units. */
  circulatingSupply: number;
  /** Minutes since the pool was created. */
  ageMinutes: number;
  volumeUsd: { m5: number; h1: number; h6: number; h24: number };
  priceChangePct: { m5: number; h1: number; h6: number; h24: number };
  txns: { m5: WindowedTxns; h1: WindowedTxns; h6: WindowedTxns; h24: WindowedTxns };
  holders: HolderPosition[];
  holderCount: number;
  /** 0..1 — fraction of LP tokens burned or locked. */
  lpBurnedPct: number;
  mintAuthorityActive: boolean;
  freezeAuthorityActive: boolean;
  candles: Candle[];
  dataQuality: DataQuality;
  fetchedAtMs: number;
}

/** The trader's own position, when they have one. Drives the ladder. */
export interface UserPosition {
  /** Token units held. */
  size: number;
  /** USD cost per token. */
  entryPriceUsd: number;
}

/** A price level where a meaningful block of supply changes psychological state. */
export interface SupplyShelf {
  priceUsd: number;
  /** Fraction of circulating supply in this shelf, 0..1. */
  supplyFraction: number;
  /** 'coiled' shelves sit below price (trapdoors); 'trapped' shelves sit above (ceilings). */
  kind: 'coiled' | 'trapped';
  /** Share of the shelf that belongs to insider-tagged wallets, 0..1. */
  insiderShare: number;
}

export type Verdict =
  | 'APEX_ENTRY'
  | 'SCALE_IN'
  | 'HOLD_THROUGH_NOISE'
  | 'ARM_EXIT'
  | 'SCALE_OUT_NOW'
  | 'EXIT_IMMEDIATELY'
  | 'NO_TOUCH';

export interface LadderRung {
  /** Fraction of the position to sell here, 0..1. */
  fraction: number;
  priceUsd: number;
  /** Multiple on the trader's entry, when a position is known. */
  multipleOnEntry: number | null;
  rationale: string;
}

/**
 * Where the stop came from, and whether it is actually usable.
 *
 * 'inside-noise' is the interesting one: the trapdoor is real but sits closer
 * than the token's own average candle range, so any stop honouring it gets
 * wicked out on noise. That is not a stop problem, it is a position problem —
 * the trader is sitting directly on top of a cascade level with no room.
 */
export type StopQuality = 'structural' | 'volatility' | 'inside-noise';

export interface ExitLadder {
  rungs: LadderRung[];
  /** Fraction left to run after all rungs, 0..1. */
  runnerFraction: number;
  /** Structural stop — the price where profitable supply flips to breakeven and cascades. */
  hardStopUsd: number;
  stopQuality: StopQuality;
  /** Why the stop is where it is, in one sentence. */
  stopNote: string;
  /** Plain-language summary of the plan. */
  summary: string;
}

export interface CoilReport {
  /** Coiled Supply: profit-weighted, urgency-weighted selling pressure. 0..1+ */
  coiledSupply: number;
  /** Trapped Supply: underwater supply acting as structure. 0..1 */
  trappedSupply: number;
  /** Raw supply fraction held by insider-tagged wallets currently in profit. 0..1 */
  insiderCoil: number;
  /** Share of insider supply already sold, 0..1. Distribution in progress. */
  insiderRealized: number;
  /** Velocity of Realization: -1 (accumulation) .. +1 (distribution). */
  velocityOfRealization: number;
  /** Composite threat score, 0..1. Higher = more supply aimed at your exit. */
  coilScore: number;
  /** Confidence in the whole report, 0..1, from data coverage. */
  confidence: number;
  shelves: SupplyShelf[];
  /** Nearest heavy coiled shelf below price. Breaking it cascades. */
  trapdoorUsd: number | null;
  /** Nearest heavy trapped shelf above price. Expect supply there. */
  ceilingUsd: number | null;
  /** Structural red flags independent of supply math. */
  structuralFlags: string[];
}

export interface AlphaSignal {
  snapshot: TokenSnapshot;
  coil: CoilReport;
  verdict: Verdict;
  /** 0..1 — how strongly the evidence supports the verdict. */
  conviction: number;
  headline: string;
  /** Ordered, human-readable evidence. The "show your work" panel. */
  reasoning: string[];
  ladder: ExitLadder | null;
  /** Minutes until this read is stale enough to require a refresh. */
  halfLifeMinutes: number;
}
