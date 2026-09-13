/**
 * mEEme's own token, $MEEME — a pump.fun launch the operator holds and is
 * promoting on this site.
 *
 * This file exists to keep that fact contained to exactly the places that
 * choose to reference it. It is never imported by anything under lib/engine,
 * lib/providers, or lib/jobs.ts: if this mint is ever scanned or looked up
 * like any other token, it goes through the exact same thresholds, the exact
 * same confidence floor, and the exact same public track record as everything
 * else. Nothing here special-cases it, and nothing should ever be added that
 * does — that boundary is the difference between "we also launched a coin"
 * and "the analysis tool is rigged for the house token," and this app's whole
 * argument for existing is the second one never being true.
 */

export const BRAND_TOKEN_MINT = '9k4CUUtLU8BFCjb8YYcYBqbWozFna317PXa7t26Jpump';
export const BRAND_TOKEN_SYMBOL = '$MEEME';
export const BRAND_TOKEN_CHAIN = 'solana';

export const BRAND_TOKEN_LINKS = {
  pumpFun: `https://pump.fun/coin/${BRAND_TOKEN_MINT}`,
  dexscreener: `https://dexscreener.com/solana/${BRAND_TOKEN_MINT}`,
  solscan: `https://solscan.io/token/${BRAND_TOKEN_MINT}`,
} as const;
