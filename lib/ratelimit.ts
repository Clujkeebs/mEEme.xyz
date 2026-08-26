/**
 * In-memory sliding-window-ish rate limiter.
 *
 * meeme-web is a single persistent Node process (see LAUNCH.md), not a
 * serverless fleet, so a process-local Map is a real limiter here rather than
 * something that resets per request. Good enough for guarding auth endpoints
 * against brute force at the traffic this app sees; it is not durable across
 * restarts, which is fine for that purpose.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

/** Returns true if the call under `key` is allowed, false if the limit is hit. */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}
