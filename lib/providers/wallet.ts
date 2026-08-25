import { z } from 'zod';
import { fetchJson } from './http';
import { heliusConfigured } from './helius';

/**
 * Wallet discovery.
 *
 * The original flow asked a trader to hand-type a contract address, a symbol, a
 * token quantity and an entry price — per position. Nobody does that, which
 * meant the watchtower stayed empty and the sweep had nothing to sweep. The
 * paid tier was unreachable through pure friction.
 *
 * This reads a *public* address. No wallet connection, no signature, no
 * approval — the same data any block explorer shows. mEEme never gains the
 * ability to move funds because it is never granted it.
 */

const KEY = process.env.HELIUS_API_KEY ?? '';
const RPC = (): string => `https://mainnet.helius-rpc.com/?api-key=${KEY}`;

export interface WalletHolding {
  mint: string;
  symbol: string;
  name: string;
  /** Token units held. */
  balance: number;
  priceUsd: number | null;
  valueUsd: number | null;
  /** Reconstructed average cost, null when this wallet's buys are out of window. */
  entryPriceUsd: number | null;
  /** Multiple on entry when both are known. */
  multiple: number | null;
}

const assetsByOwnerSchema = z.object({
  result: z
    .object({
      total: z.number().nullish(),
      items: z
        .array(
          z.object({
            id: z.string().nullish(),
            interface: z.string().nullish(),
            content: z
              .object({
                metadata: z.object({ symbol: z.string().nullish(), name: z.string().nullish() }).nullish(),
              })
              .nullish(),
            token_info: z
              .object({
                balance: z.union([z.number(), z.string()]).nullish(),
                decimals: z.number().nullish(),
                symbol: z.string().nullish(),
                price_info: z.object({ price_per_token: z.number().nullish() }).nullish(),
              })
              .nullish(),
          }),
        )
        .nullish(),
    })
    .nullish(),
});

const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
};

/** Dust: below this USD value a position is not worth a row in the UI. */
const MIN_POSITION_USD = 5;
/** Cap how many holdings we price and reconstruct, to stay inside a request. */
const MAX_HOLDINGS = 25;

const WRAPPED_SOL = 'So11111111111111111111111111111111111111112';
const STABLES = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
]);

/** Solana addresses are base58, 32–44 chars — same shape as a mint. */
export function isPlausibleWalletAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address.trim());
}

/** Fungible holdings for an owner, largest first. */
async function fetchHoldings(owner: string): Promise<{ mint: string; balance: number; symbol: string; name: string }[]> {
  const out: { mint: string; balance: number; symbol: string; name: string }[] = [];

  const data = await fetchJson({
    provider: 'helius:getAssetsByOwner',
    url: RPC(),
    schema: assetsByOwnerSchema,
    timeoutMs: 15_000,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'meeme-wallet',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: owner,
          page: 1,
          limit: 200,
          displayOptions: { showFungible: true, showZeroBalance: false },
        },
      }),
    },
  });

  for (const item of data?.result?.items ?? []) {
    const mint = item.id;
    if (!mint) continue;
    if (mint === WRAPPED_SOL || STABLES.has(mint)) continue;

    const rawBalance = num(item.token_info?.balance);
    const decimals = item.token_info?.decimals;
    if (rawBalance === null || rawBalance <= 0 || decimals === null || decimals === undefined) continue;

    out.push({
      mint,
      balance: rawBalance / 10 ** decimals,
      symbol: item.token_info?.symbol || item.content?.metadata?.symbol || 'UNKNOWN',
      name: item.content?.metadata?.name || 'Unknown token',
    });
  }

  return out;
}

const dexBatchSchema = z.object({
  pairs: z
    .array(
      z.object({
        baseToken: z.object({ address: z.string().nullish(), symbol: z.string().nullish(), name: z.string().nullish() }).nullish(),
        priceUsd: z.union([z.number(), z.string()]).nullish(),
        liquidity: z.object({ usd: z.union([z.number(), z.string()]).nullish() }).nullish(),
      }),
    )
    .nullish(),
});

/** Price many mints in one call — DexScreener takes up to 30 comma-separated. */
async function priceMints(mints: string[]): Promise<Map<string, { priceUsd: number; symbol: string; name: string }>> {
  const prices = new Map<string, { priceUsd: number; symbol: string; name: string }>();
  if (mints.length === 0) return prices;

  const base = process.env.DEXSCREENER_BASE_URL || 'https://api.dexscreener.com';

  for (let i = 0; i < mints.length; i += 30) {
    const chunk = mints.slice(i, i + 30);
    const data = await fetchJson({
      provider: 'dexscreener:batch',
      url: `${base}/latest/dex/tokens/${chunk.join(',')}`,
      schema: dexBatchSchema,
      revalidateSeconds: 30,
    });

    for (const pair of data?.pairs ?? []) {
      const mint = pair.baseToken?.address;
      const price = num(pair.priceUsd);
      if (!mint || price === null || price <= 0) continue;

      // A token trades in many pools; keep the deepest one's quote.
      const liquidity = num(pair.liquidity?.usd) ?? 0;
      const existing = prices.get(mint);
      if (existing && liquidity <= 0) continue;

      prices.set(mint, {
        priceUsd: price,
        symbol: pair.baseToken?.symbol || existing?.symbol || 'UNKNOWN',
        name: pair.baseToken?.name || existing?.name || 'Unknown token',
      });
    }
  }

  return prices;
}

const walletTxSchema = z.array(
  z.object({
    timestamp: z.number().nullish(),
    signature: z.string().nullish(),
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

const LAMPORTS_PER_SOL = 1_000_000_000;

/** Per-mint average buy price, from this wallet's own recent history. */
async function reconstructEntries(
  owner: string,
  solPriceUsd: number,
  pages = 3,
): Promise<Map<string, number>> {
  const totals = new Map<string, { tokens: number; usd: number }>();
  let before: string | null = null;

  for (let page = 0; page < pages; page++) {
    const url: string =
      `https://api.helius.xyz/v0/addresses/${encodeURIComponent(owner)}/transactions` +
      `?api-key=${KEY}&limit=100` +
      (before ? `&before=${encodeURIComponent(before)}` : '');

    const batch: z.infer<typeof walletTxSchema> | null = await fetchJson({
      provider: 'helius:wallet-entries',
      url,
      schema: walletTxSchema,
      timeoutMs: 15_000,
      retries: 1,
    });
    if (!batch || batch.length === 0) break;

    for (const tx of batch) {
      let solOut = 0;
      for (const nt of tx.nativeTransfers ?? []) {
        const lamports = num(nt.amount);
        if (lamports === null || lamports <= 0) continue;
        // Only SOL leaving this wallet is money spent.
        if (nt.fromUserAccount === owner) solOut += lamports / LAMPORTS_PER_SOL;
      }
      if (solOut <= 0) continue;

      for (const tt of tx.tokenTransfers ?? []) {
        if (tt.toUserAccount !== owner || !tt.mint) continue;
        const amount = num(tt.tokenAmount);
        if (amount === null || amount <= 0) continue;
        const entry = totals.get(tt.mint) ?? { tokens: 0, usd: 0 };
        entry.tokens += amount;
        entry.usd += solOut * solPriceUsd;
        totals.set(tt.mint, entry);
      }
    }

    const last: (typeof batch)[number] | undefined = batch.at(-1);
    if (!last?.signature || batch.length < 100) break;
    before = last.signature;
  }

  const out = new Map<string, number>();
  for (const [mint, { tokens, usd }] of totals) {
    if (tokens > 0 && usd > 0) out.set(mint, usd / tokens);
  }
  return out;
}

export interface WalletScan {
  holdings: WalletHolding[];
  /** True when we could not reconstruct entries — holdings are still usable. */
  entriesUnavailable: boolean;
  scannedAtMs: number;
}

export async function scanWallet(owner: string, solPriceUsd: number): Promise<WalletScan | null> {
  if (!heliusConfigured()) return null;

  const raw = await fetchHoldings(owner);
  if (raw.length === 0) return { holdings: [], entriesUnavailable: false, scannedAtMs: Date.now() };

  const prices = await priceMints(raw.slice(0, 60).map((h) => h.mint));

  const priced: WalletHolding[] = raw.map((h) => {
    const quote = prices.get(h.mint);
    const priceUsd = quote?.priceUsd ?? null;
    return {
      mint: h.mint,
      symbol: quote?.symbol || h.symbol,
      name: quote?.name || h.name,
      balance: h.balance,
      priceUsd,
      valueUsd: priceUsd !== null ? priceUsd * h.balance : null,
      entryPriceUsd: null,
      multiple: null,
    };
  });

  const worthShowing = priced
    .filter((h) => (h.valueUsd ?? 0) >= MIN_POSITION_USD)
    .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))
    .slice(0, MAX_HOLDINGS);

  // Entry reconstruction is best-effort: a trader whose buys predate our window
  // still gets their positions, just without a cost basis to compare against.
  let entriesUnavailable = false;
  try {
    const entries = await reconstructEntries(owner, solPriceUsd);
    if (entries.size === 0) entriesUnavailable = true;
    for (const h of worthShowing) {
      const entry = entries.get(h.mint);
      if (entry && entry > 0) {
        h.entryPriceUsd = entry;
        h.multiple = h.priceUsd !== null ? h.priceUsd / entry : null;
      }
    }
  } catch {
    entriesUnavailable = true;
  }

  return { holdings: worthShowing, entriesUnavailable, scannedAtMs: Date.now() };
}
