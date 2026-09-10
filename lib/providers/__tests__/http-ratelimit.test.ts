import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { __resetRateLimitBreakers, fetchJson, rateLimitBreakers } from '../http';
import { createPacer, TtlCache } from '../ratelimit';

const schema = z.object({ ok: z.boolean() });

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function rateLimited(retryAfter?: string): Response {
  return new Response('slow down', {
    status: 429,
    headers: retryAfter ? { 'retry-after': retryAfter } : {},
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  // The breaker is process-global, so one test's 429s must not reach the next.
  __resetRateLimitBreakers();
});

describe('fetchJson rate-limit handling', () => {
  it('retries a 429 and succeeds, rather than giving up like it used to', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(rateLimited('0'))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchJson({ provider: 'test', url: 'https://example.test/x', schema });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('survives more consecutive 429s than the ordinary retry budget allows', async () => {
    // DEFAULT_RETRIES is 2. Three 429s in a row would have exhausted it before;
    // rate limits now get their own budget.
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(rateLimited('0'))
      .mockResolvedValueOnce(rateLimited('0'))
      .mockResolvedValueOnce(rateLimited('0'))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchJson({ provider: 'test', url: 'https://example.test/x', schema });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('gives up on a permanently rate-limited endpoint instead of looping forever', async () => {
    // Always sends Retry-After, which is exactly the case that could spin
    // forever if the loop were bounded by the header rather than the attempts.
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(rateLimited('0'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchJson({ provider: 'test', url: 'https://example.test/x', schema });

    expect(result).toBeNull();
    // 3 waits, then the 4th 429 exhausts patience.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('still does not retry an ordinary 4xx', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('nope', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchJson({ provider: 'test', url: 'https://example.test/x', schema });

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('honors a Retry-After longer than the default backoff', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(rateLimited('2'))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const started = Date.now();
    const result = await fetchJson({ provider: 'test', url: 'https://example.test/x', schema });

    expect(result).toEqual({ ok: true });
    // Waited roughly the advertised 2s rather than the 1s default first step.
    expect(Date.now() - started).toBeGreaterThanOrEqual(1_800);
  }, 10_000);
});

describe('createPacer', () => {
  it('spaces concurrent callers instead of letting them stampede', async () => {
    const pacer = createPacer(50);
    const started = Date.now();
    await Promise.all([pacer.take(), pacer.take(), pacer.take(), pacer.take()]);
    // 4 slots at 50ms apart — the last one waits ~150ms.
    expect(Date.now() - started).toBeGreaterThanOrEqual(140);
  });
});

describe('TtlCache', () => {
  it('returns a stored value and then expires it', async () => {
    const cache = new TtlCache<string>(60);
    cache.set('k', 'v');
    expect(cache.get('k')).toBe('v');
    await new Promise((r) => setTimeout(r, 90));
    expect(cache.get('k')).toBeUndefined();
  });

  it('evicts the oldest entry past its cap', () => {
    const cache = new TtlCache<number>(10_000, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });
});

/**
 * The breaker exists because the patient 429 schedule is the wrong behaviour
 * against an exhausted quota: every call waits eleven seconds to learn what the
 * previous one already established. Production burned most of a six-minute scan
 * pass that way, on 360 wallet-history calls that all returned nothing.
 */
describe('rate-limit breaker', () => {
  const url = 'https://example.test/x';

  /** Exhaust the 429 budget `times` times against one provider family. */
  async function saturate(provider: string, times: number, fetchMock: ReturnType<typeof vi.fn>) {
    for (let i = 0; i < times; i++) {
      await fetchJson({ provider, url, schema });
    }
    return fetchMock;
  }

  it('stops calling a family that has said no three times in a row', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(rateLimited('0'));
    vi.stubGlobal('fetch', fetchMock);

    await saturate('helius:wallet-transactions', 3, fetchMock);
    const callsWhenTripped = fetchMock.mock.calls.length;
    expect(callsWhenTripped).toBeGreaterThan(0);

    // Tripped. Further calls must not reach the network at all.
    const result = await fetchJson({ provider: 'helius:wallet-transactions', url, schema });
    expect(result).toBeNull();
    expect(fetchMock.mock.calls.length).toBe(callsWhenTripped);
  });

  it('treats a quota as belonging to the account, not the endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(rateLimited('0'));
    vi.stubGlobal('fetch', fetchMock);

    await saturate('helius:wallet-transactions', 3, fetchMock);
    const callsWhenTripped = fetchMock.mock.calls.length;

    // A different Helius endpoint shares the same key, so it is throttled too.
    expect(await fetchJson({ provider: 'helius:getAsset', url, schema })).toBeNull();
    expect(fetchMock.mock.calls.length).toBe(callsWhenTripped);
  });

  it('leaves other providers alone', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) =>
        String(input).includes('gecko') ? jsonResponse({ ok: true }) : rateLimited('0'),
      );
    vi.stubGlobal('fetch', fetchMock);

    await saturate('helius:wallet-transactions', 3, fetchMock);

    const other = await fetchJson({ provider: 'geckoterminal:ohlcv', url: 'https://gecko.test/x', schema });
    expect(other).toEqual({ ok: true });
  });

  it('recovers after the cooldown', async () => {
    // shouldAdvanceTime keeps the retry sleeps firing while Date.now stays ours.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let limited = true;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => (limited ? rateLimited('0') : jsonResponse({ ok: true })));
    vi.stubGlobal('fetch', fetchMock);

    await saturate('helius:getAsset', 3, fetchMock);
    expect(await fetchJson({ provider: 'helius:getAsset', url, schema })).toBeNull();

    limited = false;
    vi.setSystemTime(Date.now() + 61_000);

    expect(await fetchJson({ provider: 'helius:getAsset', url, schema })).toEqual({ ok: true });
  });

  it('does not trip on failures that are not about the quota', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('nope', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    for (let i = 0; i < 5; i++) {
      await fetchJson({ provider: 'helius:getAsset', url, schema });
    }
    // A 404 is about one URL. Five of them must not pause the whole family.
    expect(rateLimitBreakers().some((b) => b.openForMs > 0)).toBe(false);
    expect(fetchMock.mock.calls.length).toBe(5);
  });

  it('a success clears the streak, so intermittent limits never trip it', async () => {
    let call = 0;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      // Alternate: exhaust, succeed, exhaust, succeed...
      call++;
      return call % 5 === 0 ? jsonResponse({ ok: true }) : rateLimited('0');
    });
    vi.stubGlobal('fetch', fetchMock);

    for (let i = 0; i < 4; i++) {
      await fetchJson({ provider: 'helius:getAsset', url, schema });
    }
    expect(rateLimitBreakers().some((b) => b.openForMs > 0)).toBe(false);
  });

  it('reports itself so a throttled provider is visible in diagnostics', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(rateLimited('0'));
    vi.stubGlobal('fetch', fetchMock);

    await saturate('helius:wallet-transactions', 3, fetchMock);

    const reported = rateLimitBreakers().find((b) => b.family === 'helius');
    expect(reported).toBeDefined();
    expect(reported!.trips).toBeGreaterThan(0);
    expect(reported!.openForMs).toBeGreaterThan(0);
  });
});
