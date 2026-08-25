import { z } from 'zod';
import { fetchJson, providerConfigured } from './http';
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
    const data = await fetchJson({
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

  const data = await fetchJson({
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

const MAX_TX_PAGES = 5;
const TX_PER_PAGE = 100;

/**
 * Read swap history for a mint and derive both trades and funding edges.
 *
 * A "buy" is a transfer of the mint *to* a wallet inside a swap; the USD value
 * is derived from the SOL that moved in the same transaction, priced at the
 * supplied SOL/USD rate. This is an approximation — it attributes the whole
 * native leg to the token leg — and it is why `reconstructHolders` refuses to
 * publish a cost basis when the reconstructed balance drifts from the real one.
 */
export async function fetchTokenHistory(
  mint: string,
  solPriceUsd: number,
): Promise<HeliusHistory | null> {
  if (!heliusConfigured()) return null;

  const trades: TradeEvent[] = [];
  const fundingEdges: HeliusHistory['fundingEdges'] = [];
  let before: string | null = null;
  let truncated = false;

  for (let page = 0; page < MAX_TX_PAGES; page++) {
    const url: string =
      `https://api.helius.xyz/v0/addresses/${encodeURIComponent(mint)}/transactions` +
      `?api-key=${KEY}&limit=${TX_PER_PAGE}` +
      (before ? `&before=${encodeURIComponent(before)}` : '');

    const batch: z.infer<typeof enhancedTxSchema> | null = await fetchJson({
      provider: 'helius:transactions',
      url,
      schema: enhancedTxSchema,
      timeoutMs: 15_000,
    });
    if (!batch || batch.length === 0) break;

    for (const tx of batch) {
      const timestampMs = (tx.timestamp ?? 0) * 1000;
      if (timestampMs === 0) continue;
      const slot = tx.slot ?? undefined;

      // Native leg: total SOL that moved, used both to price the swap and to
      // build the funding graph.
      let nativeUsd = 0;
      for (const nt of tx.nativeTransfers ?? []) {
        const lamports = num(nt.amount);
        if (lamports === null || lamports <= 0) continue;
        const sol = lamports / LAMPORTS_PER_SOL;
        nativeUsd += sol * solPriceUsd;

        // Plain SOL transfers (no token leg) are funding, not trading.
        if (!tx.tokenTransfers?.length && nt.fromUserAccount && nt.toUserAccount && sol > 0.001) {
          fundingEdges.push({
            from: nt.fromUserAccount,
            to: nt.toUserAccount,
            timestampMs,
            amountNative: sol,
          });
        }
      }

      for (const tt of tx.tokenTransfers ?? []) {
        if (tt.mint !== mint) continue;
        const amount = num(tt.tokenAmount);
        if (amount === null || amount <= 0) continue;

        // Whoever paid the fee is the actor; the pool is the counterparty.
        const buyer = tt.toUserAccount;
        const seller = tt.fromUserAccount;

        if (buyer && buyer === tx.feePayer) {
          trades.push({ wallet: buyer, side: 'buy', tokenAmount: amount, usdValue: nativeUsd, timestampMs, slot });
        } else if (seller && seller === tx.feePayer) {
          trades.push({ wallet: seller, side: 'sell', tokenAmount: amount, usdValue: nativeUsd, timestampMs, slot });
        }
      }
    }

    const last: (typeof batch)[number] | undefined = batch.at(-1);
    if (!last?.signature) break;
    before = last.signature;
    if (batch.length < TX_PER_PAGE) break;
    if (page === MAX_TX_PAGES - 1) truncated = true;
  }

  if (trades.length === 0 && fundingEdges.length === 0) return null;
  return { trades, fundingEdges, truncated };
}
