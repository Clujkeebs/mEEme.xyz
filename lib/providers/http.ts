import type { z } from 'zod';

/**
 * Every byte that enters this app from a third party goes through here.
 *
 * External APIs change shape without warning, rate-limit without warning, and
 * hang without warning. A trading tool that throws a 500 because DexScreener
 * renamed a field is worse than useless, so this layer treats every upstream
 * as hostile: hard timeout, bounded retries, and a schema check on the way in.
 */

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface FetchJsonOptions<S extends z.ZodTypeAny> {
  provider: string;
  url: string;
  /**
   * Generic over the schema rather than over the parsed type, so schemas that
   * use `.transform()` (coercing upstream's stringly-typed numbers) infer their
   * *output* type at the call site instead of their input type.
   */
  schema: S;
  init?: RequestInit;
  timeoutMs?: number;
  retries?: number;
  /** Next.js fetch cache revalidation, in seconds. */
  revalidateSeconds?: number;
}

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_RETRIES = 2;

/**
 * A rate limit is not a failure, it is an instruction to wait — and the old
 * backoff (250ms, then 500ms, then give up) was far too impatient to be one.
 * Against Helius's free tier that meant every wallet call died on 429 and the
 * cost-basis half of the engine silently got nothing. 429 gets its own, much
 * longer schedule, and the upstream's own Retry-After always wins over ours.
 */
const RATE_LIMIT_BACKOFF_MS = [1_000, 3_000, 7_000];
const MAX_RETRY_AFTER_MS = 15_000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Parse Retry-After, which is either delta-seconds or an HTTP date. */
function retryAfterMs(res: Response): number | null {
  const raw = res.headers.get('retry-after');
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  const at = Date.parse(raw);
  if (Number.isNaN(at)) return null;
  return Math.min(Math.max(0, at - Date.now()), MAX_RETRY_AFTER_MS);
}

/**
 * Fetch and validate. Returns null on any failure — callers degrade, they do
 * not crash. The reason is always logged so /api/diagnostics can show it.
 */
export async function fetchJson<S extends z.ZodTypeAny>(
  opts: FetchJsonOptions<S>,
): Promise<z.infer<S> | null> {
  const {
    provider,
    url,
    schema,
    init,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    revalidateSeconds,
  } = opts;

  let lastReason = 'unknown';
  // 429s get their own, more patient retry budget than ordinary failures.
  let rateLimitAttempt = 0;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: { accept: 'application/json', ...(init?.headers ?? {}) },
        ...(revalidateSeconds !== undefined ? { next: { revalidate: revalidateSeconds } } : {}),
      });

      if (!res.ok) {
        lastReason = `HTTP ${res.status}`;

        if (res.status === 429) {
          // Bounded by the attempt count, not by whether a Retry-After header
          // happened to be present — an upstream that always sends one would
          // otherwise keep this loop going forever.
          if (rateLimitAttempt >= RATE_LIMIT_BACKOFF_MS.length) {
            console.warn(`[provider:${provider}] rate limited, out of patience for ${redact(url)}`);
            return null;
          }
          const wait = retryAfterMs(res) ?? RATE_LIMIT_BACKOFF_MS[rateLimitAttempt]!;
          rateLimitAttempt++;
          clearTimeout(timer);
          await sleep(wait);
          // Does not consume an ordinary retry: waiting out a rate limit and
          // failing for a real reason are different budgets.
          attempt--;
          continue;
        }

        // 4xx other than 429 will not become 2xx by asking again.
        if (res.status < 500) {
          console.warn(`[provider:${provider}] ${lastReason} for ${redact(url)} — not retrying`);
          return null;
        }
        throw new ProviderError(lastReason, provider, res.status);
      }

      const json: unknown = await res.json();
      const parsed = schema.safeParse(json);

      if (!parsed.success) {
        // A shape change is a real bug we need to see, not a transient error.
        console.error(
          `[provider:${provider}] response did not match schema for ${redact(url)}:`,
          parsed.error.issues.slice(0, 3),
        );
        return null;
      }

      return parsed.data;
    } catch (err) {
      lastReason = err instanceof Error ? err.message : String(err);
      if (attempt === retries) break;
      // Exponential backoff with jitter, so a rate limit does not become a stampede.
      await sleep(2 ** attempt * 250 + Math.random() * 200);
    } finally {
      clearTimeout(timer);
    }
  }

  console.warn(`[provider:${provider}] gave up on ${redact(url)}: ${lastReason}`);
  return null;
}

/** Never log an API key, even into our own console. */
export function redact(url: string): string {
  return url.replace(/([?&](api[-_]?key|key|token)=)[^&]+/gi, '$1***');
}

/** Small helper so providers can report themselves to /api/diagnostics. */
export function providerConfigured(key: string | undefined): boolean {
  return typeof key === 'string' && key.trim().length > 0;
}
