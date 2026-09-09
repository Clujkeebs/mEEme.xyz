import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Pricing the boost list before the bounds check.
 *
 * Production showed every scan pass logging qualified == unpriced == boosted:
 * not one search result survived qualification, so the scanner ran entirely on
 * bare boost addresses. Those carried no liquidity or volume, so the bounds
 * could not be applied to them at all — and roughly half came back under the
 * floor at snapshot time, after the expensive per-holder work had been spent.
 */

const responses = new Map<string, unknown>();
const requested: string[] = [];

vi.mock('../http', () => ({
  fetchJson: vi.fn(async ({ url }: { url: string }) => {
    requested.push(url);
    for (const [fragment, body] of responses) if (url.includes(fragment)) return body;
    return null;
  }),
}));

const { discoverCandidates, SCAN_MIN_LIQUIDITY_USD } = await import('../discover');

const MINT = (n: number) => `M${String(n).padStart(43, '0')}`;

function pair(address: string, liquidityUsd: number, volumeH24Usd: number, symbol = 'TKN') {
  return {
    chainId: 'solana',
    baseToken: { address, symbol },
    liquidity: { usd: liquidityUsd },
    volume: { h24: volumeH24Usd },
    pairCreatedAt: Date.now() - 86_400_000,
  };
}

beforeEach(() => {
  responses.clear();
  requested.length = 0;
});

describe('boost sources', () => {
  it('asks both boost lists, because they are different populations', async () => {
    responses.set('/token-boosts/latest/v1', [{ chainId: 'solana', tokenAddress: MINT(1) }]);
    responses.set('/token-boosts/top/v1', [{ chainId: 'solana', tokenAddress: MINT(2) }]);
    responses.set('/tokens/v1/solana/', [pair(MINT(1), 200_000, 900_000), pair(MINT(2), 200_000, 900_000)]);

    const out = await discoverCandidates(60);
    const addrs = out.map((c) => c.address);
    expect(addrs).toContain(MINT(1));
    expect(addrs).toContain(MINT(2));
  });

  it('counts a token in both lists once', async () => {
    const both = MINT(3);
    responses.set('/token-boosts/latest/v1', [{ chainId: 'solana', tokenAddress: both }]);
    responses.set('/token-boosts/top/v1', [{ chainId: 'solana', tokenAddress: both }]);
    responses.set('/tokens/v1/solana/', [pair(both, 200_000, 900_000)]);

    const out = await discoverCandidates(60);
    expect(out.filter((c) => c.address === both)).toHaveLength(1);
  });

  it('still returns a pool when one boost endpoint is down', async () => {
    // Independent sources: a failure in one must not empty the scanner.
    responses.set('/token-boosts/top/v1', [{ chainId: 'solana', tokenAddress: MINT(4) }]);
    responses.set('/tokens/v1/solana/', [pair(MINT(4), 200_000, 900_000)]);
    // No response registered for /token-boosts/latest/v1 — resolves null.

    const out = await discoverCandidates(60);
    expect(out.map((c) => c.address)).toContain(MINT(4));
  });
});

describe('boost-list pricing', () => {
  it('prices boosted mints in one batch rather than one request each', async () => {
    const mints = Array.from({ length: 25 }, (_, i) => MINT(i));
    responses.set('/token-boosts/latest/v1', mints.map((m) => ({ chainId: 'solana', tokenAddress: m })));
    responses.set('/tokens/v1/solana/', mints.map((m) => pair(m, 200_000, 900_000)));

    await discoverCandidates(60);

    const batchCalls = requested.filter((u) => u.includes('/tokens/v1/solana/'));
    expect(batchCalls).toHaveLength(1);
    // All twenty-five addresses in the one URL.
    for (const m of mints) expect(batchCalls[0]).toContain(m);
  });

  it('splits past thirty, because that is the endpoint ceiling', async () => {
    const mints = Array.from({ length: 61 }, (_, i) => MINT(i));
    responses.set('/token-boosts/latest/v1', mints.map((m) => ({ chainId: 'solana', tokenAddress: m })));
    responses.set('/tokens/v1/solana/', mints.map((m) => pair(m, 200_000, 900_000)));

    await discoverCandidates(60);
    expect(requested.filter((u) => u.includes('/tokens/v1/solana/'))).toHaveLength(3);
  });

  it('now rejects a boosted token that is too thin, which it could not before', async () => {
    // The whole point: this mint used to pass through unpriced, consume a batch
    // slot, and be discarded only after buildSnapshot had priced it.
    const thin = MINT(1);
    responses.set('/token-boosts/latest/v1', [{ chainId: 'solana', tokenAddress: thin }]);
    responses.set('/tokens/v1/solana/', [pair(thin, SCAN_MIN_LIQUIDITY_USD - 1, 900_000)]);

    const out = await discoverCandidates(60);
    expect(out.map((c) => c.address)).not.toContain(thin);
  });

  it('keeps a boosted token that prices up fine', async () => {
    const good = MINT(2);
    responses.set('/token-boosts/latest/v1', [{ chainId: 'solana', tokenAddress: good }]);
    responses.set('/tokens/v1/solana/', [pair(good, 200_000, 900_000)]);

    const out = await discoverCandidates(60);
    expect(out.map((c) => c.address)).toContain(good);
    expect(out[0]?.liquidityUsd).toBe(200_000);
  });

  it('ranks a priced boost entry on real churn instead of pinning it last', async () => {
    const churny = MINT(3);
    const dull = MINT(4);
    responses.set('/token-boosts/latest/v1', [
      { chainId: 'solana', tokenAddress: dull },
      { chainId: 'solana', tokenAddress: churny },
    ]);
    responses.set('/tokens/v1/solana/', [
      pair(dull, 1_000_000, 200_000),
      pair(churny, 100_000, 2_000_000),
    ]);

    const out = await discoverCandidates(60);
    expect(out[0]?.address).toBe(churny);
  });

  it('falls back to passthrough when the batch lookup cannot answer', async () => {
    // A failed lookup must not shrink the pool — buildSnapshot can still price
    // it, which is exactly the behaviour this replaced.
    const unknown = MINT(5);
    responses.set('/token-boosts/latest/v1', [{ chainId: 'solana', tokenAddress: unknown }]);
    // No /tokens/v1 response registered, so the fetch resolves null.

    const out = await discoverCandidates(60);
    expect(out.map((c) => c.address)).toContain(unknown);
  });

  it('never searches, because searching a quote currency returns that currency', async () => {
    /*
     * The path this replaced queried DexScreener for "SOL" and "USDC" to widen
     * the pool. DexScreener matches a token's own name, symbol and address, so
     * those queries returned SOL's and USDC's own pools: the rejection counters
     * showed twenty-one of twenty-three results thrown out as majors, every
     * pass, for two HTTP requests each time. Yield was exactly zero.
     */
    responses.set('/token-boosts/latest/v1', [{ chainId: 'solana', tokenAddress: MINT(6) }]);
    responses.set('/tokens/v1/solana/', [pair(MINT(6), 200_000, 900_000)]);

    await discoverCandidates(60);
    expect(requested.filter((u) => u.includes('/dex/search'))).toHaveLength(0);
  });

  it('takes candidates from the token-profile list too', async () => {
    const profiled = MINT(7);
    responses.set('/token-profiles/latest/v1', [{ chainId: 'solana', tokenAddress: profiled }]);
    responses.set('/tokens/v1/solana/', [pair(profiled, 200_000, 900_000)]);

    const out = await discoverCandidates(60);
    expect(out.map((c) => c.address)).toContain(profiled);
  });

  it('prices all three lists in one shared batch', async () => {
    responses.set('/token-boosts/latest/v1', [{ chainId: 'solana', tokenAddress: MINT(8) }]);
    responses.set('/token-boosts/top/v1', [{ chainId: 'solana', tokenAddress: MINT(9) }]);
    responses.set('/token-profiles/latest/v1', [{ chainId: 'solana', tokenAddress: MINT(10) }]);
    responses.set('/tokens/v1/solana/', [
      pair(MINT(8), 200_000, 900_000),
      pair(MINT(9), 200_000, 900_000),
      pair(MINT(10), 200_000, 900_000),
    ]);

    const out = await discoverCandidates(60);
    expect(requested.filter((u) => u.includes('/tokens/v1/solana/'))).toHaveLength(1);
    expect(out).toHaveLength(3);
  });

  it('makes no batch request when nothing is boosted', async () => {
    responses.set('/token-boosts/latest/v1', []);
    await discoverCandidates(60);
    expect(requested.filter((u) => u.includes('/tokens/v1/solana/'))).toHaveLength(0);
  });
});

describe('volume-ranked pools in discovery', () => {
  it('takes them, and does not spend a batch lookup on them', async () => {
    // They arrive with reserve and volume already, which is the point.
    const hot = MINT(11);
    responses.set('/networks/solana/pools?page=1', {
      data: [
        {
          attributes: { reserve_in_usd: '400000', volume_usd: { h24: '3000000' } },
          relationships: { base_token: { data: { id: `solana_${hot}` } } },
        },
      ],
    });

    const out = await discoverCandidates(60);
    expect(out.map((c) => c.address)).toContain(hot);
    expect(requested.filter((u) => u.includes('/tokens/v1/solana/'))).toHaveLength(0);
  });

  it('outranks a promoted token on churn, which is the whole reason to add them', async () => {
    const promoted = MINT(12);
    const hot = MINT(13);
    responses.set('/token-boosts/latest/v1', [{ chainId: 'solana', tokenAddress: promoted }]);
    responses.set('/tokens/v1/solana/', [pair(promoted, 500_000, 600_000)]);
    responses.set('/networks/solana/pools?page=1', {
      data: [
        {
          attributes: { reserve_in_usd: '120000', volume_usd: { h24: '4000000' } },
          relationships: { base_token: { data: { id: `solana_${hot}` } } },
        },
      ],
    });

    const out = await discoverCandidates(60);
    expect(out[0]?.address).toBe(hot);
  });

  it('still discovers from the promotion lists when the pools endpoint is down', async () => {
    const promoted = MINT(14);
    responses.set('/token-boosts/latest/v1', [{ chainId: 'solana', tokenAddress: promoted }]);
    responses.set('/tokens/v1/solana/', [pair(promoted, 200_000, 900_000)]);
    // No /pools response registered — resolves null.

    const out = await discoverCandidates(60);
    expect(out.map((c) => c.address)).toContain(promoted);
  });
});
