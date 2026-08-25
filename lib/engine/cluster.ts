import type { HolderPosition, HolderTag } from './types';

/**
 * Cost-basis reconstruction and insider-cluster detection.
 *
 * Every screener will tell you a token has "insiders". None of them tell you
 * the number that actually decides your trade: what those insiders paid, and
 * how much of it they still hold. That is what this file computes.
 */

export interface TradeEvent {
  wallet: string;
  side: 'buy' | 'sell';
  /** Token units moved. */
  tokenAmount: number;
  /** Absolute USD value of the fill. */
  usdValue: number;
  timestampMs: number;
  /** Solana slot / EVM block. Same-slot buys at launch are snipes, not trades. */
  slot?: number;
}

/** A native-token (SOL/ETH) transfer that funded a wallet. Follow the gas. */
export interface FundingEdge {
  from: string;
  to: string;
  timestampMs: number;
  amountNative: number;
}

export interface ClusterInput {
  trades: TradeEvent[];
  fundingEdges: FundingEdge[];
  deployer: string | null;
  launchSlot: number | null;
  launchTimeMs: number | null;
  /** Authoritative on-chain balances, keyed by wallet. */
  currentBalances: Map<string, number>;
  lpAccounts: Set<string>;
  exchangeAccounts: Set<string>;
  /** Wallets whose first funding arrived just before their first buy. */
  walletCreationMs?: Map<string, number>;
}

/** Buys within this many slots of the deploy are same-block snipes. */
const SNIPE_SLOT_WINDOW = 2;
/** Buys within this window of launch are snipes even when slots are unavailable. */
const SNIPE_TIME_WINDOW_MS = 30_000;
/** A wallet first funded within this window of its first buy was made for this trade. */
const FRESH_WALLET_WINDOW_MS = 10 * 60_000;
/** Co-funded wallets must land within this window to count as coordinated. */
const COFUNDING_TIME_WINDOW_MS = 10 * 60_000;
/** Funding amounts within this relative tolerance count as "identical". */
const COFUNDING_AMOUNT_TOLERANCE = 0.05;
/** Minimum wallets sharing a funder before we call it a ring. */
const COFUNDING_MIN_GROUP = 3;
/**
 * Reconstructed balance may drift from the authoritative balance when trade
 * history is truncated. Beyond this drift we refuse to claim a cost basis.
 */
const BALANCE_DRIFT_TOLERANCE = 0.25;

/* ------------------------------- union-find ------------------------------ */

class DisjointSet {
  private parent = new Map<string, string>();

  find(x: string): string {
    const p = this.parent.get(x);
    if (p === undefined) {
      this.parent.set(x, x);
      return x;
    }
    if (p === x) return x;
    const root = this.find(p);
    this.parent.set(x, root);
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/* --------------------------- cost basis rebuild -------------------------- */

interface WalletLedger {
  boughtTokens: number;
  boughtCostUsd: number;
  soldTokens: number;
  peakBalance: number;
  runningBalance: number;
  firstBuyMs: number;
  firstBuySlot: number | null;
  lastActivityMs: number;
  tradeCount: number;
}

function emptyLedger(): WalletLedger {
  return {
    boughtTokens: 0,
    boughtCostUsd: 0,
    soldTokens: 0,
    peakBalance: 0,
    runningBalance: 0,
    firstBuyMs: Number.POSITIVE_INFINITY,
    firstBuySlot: null,
    lastActivityMs: 0,
    tradeCount: 0,
  };
}

function buildLedgers(trades: TradeEvent[]): Map<string, WalletLedger> {
  const ledgers = new Map<string, WalletLedger>();
  // Chronological order matters for peak-balance tracking.
  const ordered = [...trades].sort((a, b) => a.timestampMs - b.timestampMs);

  for (const t of ordered) {
    if (!Number.isFinite(t.tokenAmount) || t.tokenAmount <= 0) continue;
    const ledger = ledgers.get(t.wallet) ?? emptyLedger();

    if (t.side === 'buy') {
      ledger.boughtTokens += t.tokenAmount;
      ledger.boughtCostUsd += Math.max(0, t.usdValue);
      ledger.runningBalance += t.tokenAmount;
      if (t.timestampMs < ledger.firstBuyMs) {
        ledger.firstBuyMs = t.timestampMs;
        ledger.firstBuySlot = t.slot ?? null;
      }
    } else {
      ledger.soldTokens += t.tokenAmount;
      ledger.runningBalance -= t.tokenAmount;
    }

    if (ledger.runningBalance > ledger.peakBalance) ledger.peakBalance = ledger.runningBalance;
    ledger.lastActivityMs = Math.max(ledger.lastActivityMs, t.timestampMs);
    ledger.tradeCount += 1;
    ledgers.set(t.wallet, ledger);
  }

  return ledgers;
}

/* ---------------------------- cluster detection --------------------------- */

/**
 * Wallets funded by the same source, in near-identical amounts, inside a tight
 * window. That is not a coincidence — it is one actor wearing many hats.
 */
function findCoFundedRings(edges: FundingEdge[]): Set<string> {
  const byFunder = new Map<string, FundingEdge[]>();
  for (const e of edges) {
    const list = byFunder.get(e.from);
    if (list) list.push(e);
    else byFunder.set(e.from, [e]);
  }

  const flagged = new Set<string>();

  for (const [, group] of byFunder) {
    if (group.length < COFUNDING_MIN_GROUP) continue;
    const sorted = [...group].sort((a, b) => a.timestampMs - b.timestampMs);

    // Sliding window over time; inside it, bucket by near-identical amount.
    let start = 0;
    for (let end = 0; end < sorted.length; end++) {
      const endEdge = sorted[end];
      if (!endEdge) continue;
      while (start < end) {
        const startEdge = sorted[start];
        if (!startEdge) break;
        if (endEdge.timestampMs - startEdge.timestampMs <= COFUNDING_TIME_WINDOW_MS) break;
        start++;
      }

      const window = sorted.slice(start, end + 1);
      if (window.length < COFUNDING_MIN_GROUP) continue;

      const matches = window.filter((e) => {
        const denom = Math.max(endEdge.amountNative, 1e-9);
        return Math.abs(e.amountNative - endEdge.amountNative) / denom <= COFUNDING_AMOUNT_TOLERANCE;
      });

      if (matches.length >= COFUNDING_MIN_GROUP) {
        for (const m of matches) flagged.add(m.to);
      }
    }
  }

  return flagged;
}

/**
 * Turn raw chain history into priced, tagged holder positions.
 *
 * Returns only wallets that currently hold a balance — the ones who can still
 * sell into you.
 */
export function reconstructHolders(input: ClusterInput): HolderPosition[] {
  const ledgers = buildLedgers(input.trades);

  // Follow the gas: wallets linked by native-token transfers are one entity.
  const dsu = new DisjointSet();
  for (const e of input.fundingEdges) {
    if (input.exchangeAccounts.has(e.from)) continue; // CEX hot wallets link everyone to everyone
    dsu.union(e.from, e.to);
  }

  const deployerRoot = input.deployer ? dsu.find(input.deployer) : null;
  const coFundedRing = findCoFundedRings(
    input.fundingEdges.filter((e) => !input.exchangeAccounts.has(e.from)),
  );

  // First pass: identify snipers, so co-funded sniper rings can be promoted.
  const snipers = new Set<string>();
  for (const [wallet, ledger] of ledgers) {
    if (!Number.isFinite(ledger.firstBuyMs)) continue;
    const bySlot =
      input.launchSlot !== null &&
      ledger.firstBuySlot !== null &&
      ledger.firstBuySlot - input.launchSlot <= SNIPE_SLOT_WINDOW;
    const byTime =
      input.launchTimeMs !== null &&
      ledger.firstBuyMs - input.launchTimeMs <= SNIPE_TIME_WINDOW_MS;
    if (bySlot || byTime) snipers.add(wallet);
  }

  // A funding component holding several snipers is an operation, not a crowd.
  const snipersPerRoot = new Map<string, number>();
  for (const w of snipers) {
    const root = dsu.find(w);
    snipersPerRoot.set(root, (snipersPerRoot.get(root) ?? 0) + 1);
  }
  const insiderRoots = new Set<string>();
  if (deployerRoot) insiderRoots.add(deployerRoot);
  for (const [root, count] of snipersPerRoot) {
    if (count >= 2) insiderRoots.add(root);
  }

  const holders: HolderPosition[] = [];

  for (const [wallet, balance] of input.currentBalances) {
    if (balance <= 0) continue;

    const tags: HolderTag[] = [];
    if (input.lpAccounts.has(wallet)) tags.push('lp');
    if (input.exchangeAccounts.has(wallet)) tags.push('exchange');
    if (input.deployer && wallet === input.deployer) tags.push('deployer');
    if (snipers.has(wallet)) tags.push('sniper');
    if (coFundedRing.has(wallet)) tags.push('bundler');
    if (
      !tags.includes('exchange') &&
      !tags.includes('lp') &&
      insiderRoots.has(dsu.find(wallet)) &&
      !tags.includes('deployer')
    ) {
      tags.push('insider-cluster');
    }

    const ledger = ledgers.get(wallet);
    const creationMs = input.walletCreationMs?.get(wallet);

    let costBasisUsd: number | null = null;
    let realizedFraction = 0;
    let firstSeenMs = input.launchTimeMs ?? 0;
    let lastActivityMs = input.launchTimeMs ?? 0;

    if (ledger && ledger.boughtTokens > 0) {
      // Only claim a cost basis when reconstructed history explains the balance
      // we actually observe on chain. Truncated history must not masquerade as
      // a confident read.
      const drift = Math.abs(ledger.runningBalance - balance) / Math.max(balance, 1e-9);
      if (drift <= BALANCE_DRIFT_TOLERANCE && ledger.boughtCostUsd > 0) {
        costBasisUsd = ledger.boughtCostUsd / ledger.boughtTokens;
      }
      const denominator = Math.max(ledger.peakBalance, ledger.boughtTokens, 1e-9);
      realizedFraction = Math.min(1, Math.max(0, ledger.soldTokens / denominator));
      firstSeenMs = Number.isFinite(ledger.firstBuyMs) ? ledger.firstBuyMs : firstSeenMs;
      lastActivityMs = ledger.lastActivityMs;

      if (
        creationMs !== undefined &&
        Number.isFinite(ledger.firstBuyMs) &&
        ledger.firstBuyMs - creationMs <= FRESH_WALLET_WINDOW_MS
      ) {
        tags.push('fresh');
      }
    }

    holders.push({
      address: wallet,
      balance,
      costBasisUsd,
      firstSeenMs,
      lastActivityMs,
      realizedFraction,
      tags,
    });
  }

  return holders.sort((a, b) => b.balance - a.balance);
}

/** Coverage stats for the honesty layer in the UI. */
export function summarizeCoverage(
  holders: HolderPosition[],
  circulatingSupply: number,
): { holdersResolved: number; holdersUnresolved: number; supplyCovered: number } {
  let resolvedSupply = 0;
  let holdersResolved = 0;
  let holdersUnresolved = 0;

  for (const h of holders) {
    if (h.tags.includes('lp')) continue;
    if (h.costBasisUsd !== null) {
      holdersResolved += 1;
      resolvedSupply += h.balance;
    } else {
      holdersUnresolved += 1;
    }
  }

  return {
    holdersResolved,
    holdersUnresolved,
    supplyCovered:
      circulatingSupply > 0 ? Math.min(1, resolvedSupply / circulatingSupply) : 0,
  };
}
