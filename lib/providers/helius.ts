import { z } from 'zod';
import { mapWithConcurrency } from '@/lib/concurrency';
import { fetchJson, providerConfigured } from './http';
import { createPacer, TtlCache } from './ratelimit';
import type { TradeEvent } from '@/lib/engine/cluster';

/**
 * Helius — the holder book and the transaction history behind it.
 *
 * This is the highest-value key in the whole app. Without it there is no
 * per-wallet cost basis, and without cost basis there is no coil: mEEme falls
 * back to structural analysis only, and says so rather than guessing.
 */

const KEY = process.env.HELIUS_API_KEY ?? '';
export const heliusConfigured = (): boolean => providerConfigured(KEY);

/**
 * ~8 requests/second process-wide. Helius's free tier meters requests per
 * second, and nothing here was pacing them: a token analysis fires up to 60
 * wallet calls, and the sweep does that for every watched token on a timer.
 * Overridable because a paid Helius plan has a much higher ceiling and there
 * is no reason to keep throttling to a free-tier limit after upgrading.
 */
const HELIUS_MIN_INTERVAL_MS = Number(process.env.HELIUS_MIN_INTERVAL_MS ?? 125);
const heliusPacer = createPacer(
  Number.isFinite(HELIUS_MIN_INTERVAL_MS) && HELIUS_MIN_INTERVAL_MS >= 0 ? HELIUS_MIN_INTERVAL_MS : 125,
);

/** Every Helius request goes through the pacer, then the shared HTTP layer. */
const pacedFetchJson: typeof fetchJson = async (opts) => {
  await heliusPacer.take();
  return fetchJson(opts);
};

const RPC = (): string => `https://mainnet.helius-rpc.com/?api-key=${KEY}`;

/* ----------------------------- holder balances ---------------------------- */

const tokenAccountsSchema = z.object({
  result: z
    .object({
      total: z.number().nullish(),
      token_accounts: z
        .array(
          z.object({
            address: z.string().nullish(),
            owner: z.string().nullish(),
            amount: z.union([z.number(), z.string()]).nullish(),
          }),
        )
        .nullish(),
    })
    .nullish(),
});

const MAX_HOLDER_PAGES = 5;
const HOLDERS_PER_PAGE = 1000;

/**
 * Walk the token accounts for a mint and fold them into per-owner balances.
 *
 * Capped at MAX_HOLDER_PAGES: a token with 200k holders would take minutes to
 * page fully, and the top few thousand wallets hold everything that matters to
 * the coil anyway. Coverage is reported so the UI can be honest about it.
 */
export async function fetchHolderBalances(
  mint: string,
  decimals: number,
): Promise<{ balances: Map<string, number>; truncated: boolean } | null> {
  if (!heliusConfigured()) return null;

  const balances = new Map<string, number>();
  const scale = 10 ** decimals;
  let truncated = false;

  for (let page = 1; page <= MAX_HOLDER_PAGES; page++) {
    const data = await pacedFetchJson({
      provider: 'helius:getTokenAccounts',
      url: RPC(),
      schema: tokenAccountsSchema,
      timeoutMs: 12_000,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `meeme-holders-${page}`,
          method: 'getTokenAccounts',
          params: { mint, page, limit: HOLDERS_PER_PAGE, options: { showZeroBalance: false } },
        }),
      },
    });

    const accounts = data?.result?.token_accounts;
    if (!accounts || accounts.length === 0) break;

    for (const acc of accounts) {
      const owner = acc.owner;
      if (!owner) continue;
      const raw = typeof acc.amount === 'string' ? Number.parseFloat(acc.amount) : acc.amount;
      if (raw === null || raw === undefined || !Number.isFinite(raw) || raw <= 0) continue;
      balances.set(owner, (balances.get(owner) ?? 0) + raw / scale);
    }

    if (accounts.length < HOLDERS_PER_PAGE) break;
    if (page === MAX_HOLDER_PAGES) truncated = true;
  }

  return balances.size > 0 ? { balances, truncated } : null;
}

/* --------------------------- mint / authority state ------------------------ */

const assetSchema = z.object({
  result: z
    .object({
      id: z.string().nullish(),
      content: z.object({ metadata: z.object({ symbol: z.string().nullish(), name: z.string().nullish() }).nullish() }).nullish(),
      authorities: z.array(z.object({ address: z.string().nullish(), scopes: z.array(z.string()).nullish() })).nullish(),
      token_info: z
        .object({
          supply: z.union([z.number(), z.string()]).nullish(),
          decimals: z.number().nullish(),
        })
        .nullish(),
      mint_extensions: z.unknown().nullish(),
    })
    .nullish(),
});

export interface HeliusAsset {
  symbol: string | null;
  name: string | null;
  supply: number | null;
  decimals: number | null;
}

export async function fetchAsset(mint: string): Promise<HeliusAsset | null> {
  if (!heliusConfigured()) return null;

  const data = await pacedFetchJson({
    provider: 'helius:getAsset',
    url: RPC(),
    schema: assetSchema,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'meeme-asset', method: 'getAsset', params: { id: mint } }),
    },
  });
  if (!data?.result) return null;

  const decimals = data.result.token_info?.decimals ?? null;
  const rawSupply = data.result.token_info?.supply;
  const supplyNum =
    typeof rawSupply === 'string' ? Number.parseFloat(rawSupply) : (rawSupply ?? null);
  const supply =
    supplyNum !== null && Number.isFinite(supplyNum) && decimals !== null
      ? supplyNum / 10 ** decimals
      : null;

  return {
    symbol: data.result.content?.metadata?.symbol ?? null,
    name: data.result.content?.metadata?.name ?? null,
    supply,
    decimals,
  };
}

/* ---------------------------- transaction history -------------------------- */

const enhancedTxSchema = z.array(
  z.object({
    signature: z.string().nullish(),
    timestamp: z.number().nullish(),
    slot: z.number().nullish(),
    type: z.string().nullish(),
    feePayer: z.string().nullish(),
    tokenTransfers: z
      .array(
        z.object({
          fromUserAccount: z.string().nullish(),
          toUserAccount: z.string().nullish(),
          mint: z.string().nullish(),
          tokenAmount: z.union([z.number(), z.string()]).nullish(),
        }),
      )
      .nullish(),
    nativeTransfers: z
      .array(
        z.object({
          fromUserAccount: z.string().nullish(),
          toUserAccount: z.string().nullish(),
          amount: z.union([z.number(), z.string()]).nullish(),
        }),
      )
      .nullish(),
  }),
);

const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
};

const LAMPORTS_PER_SOL = 1_000_000_000;

export interface HeliusHistory {
  trades: TradeEvent[];
  fundingEdges: { from: string; to: string; timestampMs: number; amountNative: number }[];
  /** True when we hit the page cap and older history exists that we did not read. */
  truncated: boolean;
}

/** Per-wallet page cap. An insider wallet's history is short by construction. */
const WALLET_TX_PAGES = 2;
const TX_PER_PAGE = 100;
/** Never fetch history for more wallets than this in one request. */
const MAX_TRACKED_WALLETS = 30;

export interface WalletHistory {
  trades: TradeEvent[];
  fundingEdges: { from: string; to: string; timestampMs: number; amountNative: number }[];
}

/**
 * Read the swap history of *specific wallets*, not of the whole token.
 *
 * This is the correction to the original design. Replaying a token's entire
 * trade history is not possible for anything with real volume — tens of
 * thousands of swaps, none of which a free API will page through inside a
 * request — and a truncated replay yields wallets whose reconstructed balance
 * does not match the chain, which the engine then correctly refuses to price.
 * The result was a mechanic that worked only on synthetic data.
 *
 * The float's cost basis now comes from the volume profile instead. What still
 * needs per-wallet precision is the insider cluster, and that is a few dozen
 * addresses whose individual histories are genuinely short — so we ask about
 * exactly those.
 */
export async function fetchWalletHistories(
  wallets: string[],
  mint: string,
  solPriceUsd: number,
): Promise<WalletHistory | null> {
  if (!heliusConfigured() || wallets.length === 0) return null;

  const targets = wallets.slice(0, MAX_TRACKED_WALLETS);
  const trades: TradeEvent[] = [];
  const fundingEdges: WalletHistory['fundingEdges'] = [];

  // Concurrency 2 rather than 5, on top of the process-wide pacer below.
  // Concurrency bounds how many are in flight; the pacer bounds how fast they
  // are issued. Free-tier Helius meters the second one, and only the second
  // one was missing — which is why every wallet call was coming back 429.
  const results = await mapWithConcurrency(
    targets,
    2,
    (wallet) => fetchOneWalletCached(wallet, mint, solPriceUsd),
    () => null, // one wallet's history failing must not lose the rest
  );
  for (const r of results) {
    if (!r) continue;
    trades.push(...r.trades);
    fundingEdges.push(...r.fundingEdges);
  }

  if (trades.length === 0 && fundingEdges.length === 0) return null;
  return { trades, fundingEdges };
}

/**
 * The sweep re-analyses the same watched tokens every few minutes, which means
 * re-asking for the same wallets' histories every few minutes. A wallet's
 * trades against one mint barely move on that timescale, so the uncached
 * version spent the entire rate-limit budget re-deriving an answer we already
 * had — and left nothing for a user actually running a Target Lock.
 */
const walletHistoryCache = new TtlCache<WalletHistory | null>(10 * 60 * 1000, 2_000);

async function fetchOneWalletCached(
  wallet: string,
  mint: string,
  solPriceUsd: number,
): Promise<WalletHistory | null> {
  const key = `${mint}:${wallet}`;
  const cached = walletHistoryCache.get(key);
  if (cached !== undefined) return cached;

  const fresh = await fetchOneWallet(wallet, mint, solPriceUsd);
  // A null here is usually "rate limited" rather than "no history", and
  // caching that would turn a transient miss into ten minutes of blindness.
  if (fresh) walletHistoryCache.set(key, fresh);
  return fresh;
}

async function fetchOneWallet(
  wallet: string,
  mint: string,
  solPriceUsd: number,
): Promise<WalletHistory | null> {
  const trades: TradeEvent[] = [];
  const fundingEdges: WalletHistory['fundingEdges'] = [];
  let before: string | null = null;

  for (let page = 0; page < WALLET_TX_PAGES; page++) {
    const url: string =
      `https://api.helius.xyz/v0/addresses/${encodeURIComponent(wallet)}/transactions` +
      `?api-key=${KEY}&limit=${TX_PER_PAGE}` +
      (before ? `&before=${encodeURIComponent(before)}` : '');

    const batch: z.infer<typeof enhancedTxSchema> | null = await pacedFetchJson({
      provider: 'helius:wallet-transactions',
      url,
      schema: enhancedTxSchema,
      timeoutMs: 12_000,
      retries: 1,
    });
    if (!batch || batch.length === 0) break;

    for (const tx of batch) {
      const timestampMs = (tx.timestamp ?? 0) * 1000;
      if (timestampMs === 0) continue;
      const slot = tx.slot ?? undefined;

      let nativeUsd = 0;
      for (const nt of tx.nativeTransfers ?? []) {
        const lamports = num(nt.amount);
        if (lamports === null || lamports <= 0) continue;
        const sol = lamports / LAMPORTS_PER_SOL;
        nativeUsd += sol * solPriceUsd;

        // A plain SOL transfer with no token leg is funding, and funding is how
        // a cluster gets de-anonymised.
        if (!tx.tokenTransfers?.length && nt.fromUserAccount && nt.toUserAccount && sol > 0.001) {
          fundingEdges.push({ from: nt.fromUserAccount, to: nt.toUserAccount, timestampMs, amountNative: sol });
        }
      }

      for (const tt of tx.tokenTransfers ?? []) {
        if (tt.mint !== mint) continue;
        const amount = num(tt.tokenAmount);
        if (amount === null || amount <= 0) continue;

        if (tt.toUserAccount === wallet) {
          trades.push({ wallet, side: 'buy', tokenAmount: amount, usdValue: nativeUsd, timestampMs, slot });
        } else if (tt.fromUserAccount === wallet) {
          trades.push({ wallet, side: 'sell', tokenAmount: amount, usdValue: nativeUsd, timestampMs, slot });
        }
      }
    }

    const last: (typeof batch)[number] | undefined = batch.at(-1);
    if (!last?.signature || batch.length < TX_PER_PAGE) break;
    before = last.signature;
  }

  return trades.length > 0 || fundingEdges.length > 0 ? { trades, fundingEdges } : null;
}
