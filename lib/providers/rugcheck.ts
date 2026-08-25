import { z } from 'zod';
import { fetchJson } from './http';

/**
 * RugCheck — contract authorities, LP lock state, holder concentration and
 * their own insider flags. No API key required.
 *
 * RugCheck answers "is this contract built to rob me". It does not answer
 * "what did the insiders pay", which is the question mEEme exists for — but
 * its holder list and insider flags are a strong prior to seed our own
 * cluster analysis with.
 */

const BASE = process.env.RUGCHECK_BASE_URL || 'https://api.rugcheck.xyz';

const numeric = z.union([z.number(), z.string()]).nullish().transform((v) => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
});

const reportSchema = z.object({
  mint: z.string().nullish(),
  creator: z.string().nullish(),
  token: z
    .object({
      supply: numeric,
      decimals: z.number().nullish(),
      mintAuthority: z.string().nullish(),
      freezeAuthority: z.string().nullish(),
    })
    .nullish(),
  topHolders: z
    .array(
      z.object({
        address: z.string().nullish(),
        owner: z.string().nullish(),
        amount: numeric,
        uiAmount: numeric,
        pct: numeric,
        insider: z.boolean().nullish(),
      }),
    )
    .nullish(),
  markets: z
    .array(
      z.object({
        pubkey: z.string().nullish(),
        marketType: z.string().nullish(),
        liquidityA: z.string().nullish(),
        liquidityB: z.string().nullish(),
        lp: z
          .object({
            lpLocked: numeric,
            lpLockedPct: numeric,
            lpTotalSupply: numeric,
          })
          .nullish(),
      }),
    )
    .nullish(),
  risks: z
    .array(
      z.object({
        name: z.string().nullish(),
        description: z.string().nullish(),
        level: z.string().nullish(),
        score: z.number().nullish(),
      }),
    )
    .nullish(),
  totalHolders: z.number().nullish(),
  totalMarketLiquidity: numeric,
  score_normalised: z.number().nullish(),
  graphInsidersDetected: z.number().nullish(),
});

export interface RugcheckReport {
  creator: string | null;
  totalSupply: number | null;
  decimals: number | null;
  mintAuthorityActive: boolean;
  freezeAuthorityActive: boolean;
  /** 0..1 */
  lpBurnedPct: number;
  holderCount: number | null;
  /** Wallets RugCheck itself flagged as insiders. Used as a prior, not gospel. */
  flaggedInsiders: Set<string>;
  /** Owner -> raw token balance, from the top-holder list. */
  balances: Map<string, number>;
  lpAccounts: Set<string>;
  riskNames: string[];
  insiderGraphCount: number;
}

export async function fetchRugcheckReport(tokenAddress: string): Promise<RugcheckReport | null> {
  const data = await fetchJson({
    provider: 'rugcheck',
    url: `${BASE}/v1/tokens/${encodeURIComponent(tokenAddress)}/report`,
    schema: reportSchema,
    revalidateSeconds: 120,
  });
  if (!data) return null;

  const decimals = data.token?.decimals ?? null;
  const scale = decimals !== null ? 10 ** decimals : 1;

  const balances = new Map<string, number>();
  const flaggedInsiders = new Set<string>();

  for (const h of data.topHolders ?? []) {
    // `owner` is the wallet; `address` is the associated token account.
    const wallet = h.owner ?? h.address;
    if (!wallet) continue;
    // Prefer uiAmount when present, otherwise scale the raw amount ourselves.
    const balance = h.uiAmount ?? (h.amount !== null ? h.amount / scale : null);
    if (balance !== null && balance > 0) {
      balances.set(wallet, (balances.get(wallet) ?? 0) + balance);
    }
    if (h.insider) flaggedInsiders.add(wallet);
  }

  // LP lock is reported per market; take the deepest market's figure.
  let lpBurnedPct = 0;
  const lpAccounts = new Set<string>();
  for (const m of data.markets ?? []) {
    if (m.pubkey) lpAccounts.add(m.pubkey);
    const pct = m.lp?.lpLockedPct;
    if (pct !== null && pct !== undefined) {
      // Upstream reports this as a percentage in some responses, a fraction in others.
      const normalized = pct > 1 ? pct / 100 : pct;
      lpBurnedPct = Math.max(lpBurnedPct, Math.min(1, Math.max(0, normalized)));
    }
  }

  const rawSupply = data.token?.supply ?? null;
  const totalSupply = rawSupply !== null ? rawSupply / scale : null;

  return {
    creator: data.creator ?? null,
    totalSupply,
    decimals,
    // An empty string or a null both mean revoked.
    mintAuthorityActive: Boolean(data.token?.mintAuthority),
    freezeAuthorityActive: Boolean(data.token?.freezeAuthority),
    lpBurnedPct,
    holderCount: data.totalHolders ?? null,
    flaggedInsiders,
    balances,
    lpAccounts,
    riskNames: (data.risks ?? []).map((r) => r.name).filter((x): x is string => Boolean(x)),
    insiderGraphCount: data.graphInsidersDetected ?? 0,
  };
}
