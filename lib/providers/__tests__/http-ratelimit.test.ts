import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { fetchJson } from '../http';
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
