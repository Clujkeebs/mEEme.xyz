import { createHash } from 'node:crypto';
import { prisma } from './db';

/**
 * Error capture.
 *
 * The rule this module exists to obey: logging an error must never be able to
 * cause one. Everything here is best-effort, swallows its own failures, and is
 * bounded in how much work it can generate — because the moment you most need
 * error reporting is an incident, which is exactly when a naive implementation
 * writes a row per occurrence and finishes the database off.
 *
 * Three bounds, in order of importance:
 *
 *  1. Errors are deduplicated by fingerprint and counted, so a fault in a hot
 *     loop is one row with a big number, not a million rows.
 *  2. Writes for a given fingerprint are throttled; occurrences suppressed in
 *     between are still counted, so the number stays true without the writes.
 *  3. After repeated write failures the module stops trying for a while. If the
 *     database is the thing that is broken, retrying per error turns one
 *     outage into a stampede.
 */

/** Minimum gap between database writes for the same fingerprint. */
const WRITE_THROTTLE_MS = 10_000;
/** Consecutive write failures before the circuit opens. */
const FAILURE_LIMIT = 5;
/** How long the circuit stays open. */
const CIRCUIT_OPEN_MS = 60_000;
/** Cap on stack text, so one deep trace cannot store a novel. */
const MAX_STACK = 4_000;
/** Bound on the throttle map, so it cannot become the leak it prevents. */
const MAX_TRACKED = 500;

interface Pending {
  lastWriteAt: number;
  /** Occurrences seen since the last write. */
  suppressed: number;
  /**
   * Deferred write for those suppressed occurrences.
   *
   * Without this the count is only flushed by the *next* capture after the
   * window, so a burst that stops before then loses everything it suppressed —
   * 500 failures in a tight loop recorded as "1", which is worse than not
   * counting at all because it reads as precise. One timer per active
   * fingerprint keeps writes bounded while keeping the number true.
   */
  flush?: NodeJS.Timeout;
}

const pending = new Map<string, Pending>();
let consecutiveFailures = 0;
let circuitOpenUntil = 0;

/**
 * Numbers, hex blobs and long ids are stripped before fingerprinting, so
 * "failed for 0xAB..." and "failed for 0xCD..." are recognised as one fault
 * rather than thousands of separate ones.
 */
export function fingerprintOf(scope: string, message: string): string {
  const shape = message
    .replace(/0x[0-9a-f]+/gi, '<hex>')
    .replace(/[A-Za-z0-9]{32,}/g, '<id>')
    .replace(/\d+/g, '<n>')
    .slice(0, 300);
  return createHash('sha256').update(`${scope} ${shape}`).digest('hex').slice(0, 32);
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err)?.slice(0, 500) ?? String(err);
  } catch {
    return String(err);
  }
}

/**
 * Record an error. Never throws, and callers on a request path do not await it.
 *
 * `scope` groups related faults — "cron:sweep", "provider:helius", "client".
 * `context` must never carry request bodies, tokens or anything a user typed:
 * an error log that quietly becomes a place secrets accumulate is worse than
 * no error log at all.
 */
export function captureError(
  scope: string,
  err: unknown,
  context?: Record<string, unknown>,
): void {
  void captureErrorAsync(scope, err, context);
}

export async function captureErrorAsync(
  scope: string,
  err: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  try {
    const now = Date.now();
    if (now < circuitOpenUntil) return;

    const message = messageOf(err);
    const fingerprint = fingerprintOf(scope, message);

    const seen = pending.get(fingerprint);
    if (seen && now - seen.lastWriteAt < WRITE_THROTTLE_MS) {
      seen.suppressed += 1;
      // Make sure those suppressed occurrences reach the database even if this
      // is the last one that ever happens.
      if (!seen.flush) {
        const delay = Math.max(0, seen.lastWriteAt + WRITE_THROTTLE_MS - now);
        seen.flush = setTimeout(() => {
          seen.flush = undefined;
          const carried = seen.suppressed;
          seen.suppressed = 0;
          if (carried > 0) void writeEvent(fingerprint, scope, message, err, context, carried);
        }, delay);
        // Never hold the process open purely to record an error.
        seen.flush.unref?.();
      }
      return;
    }

    // Occurrences held back since the last write are added to this one, so the
    // count reflects reality even though the writes do not.
    const increment = 1 + (seen?.suppressed ?? 0);
    if (seen?.flush) {
      clearTimeout(seen.flush);
      seen.flush = undefined;
    }

    if (pending.size >= MAX_TRACKED && !seen) {
      for (const entry of pending.values()) if (entry.flush) clearTimeout(entry.flush);
      pending.clear();
    }
    pending.set(fingerprint, { lastWriteAt: now, suppressed: 0 });

    await writeEvent(fingerprint, scope, message, err, context, increment);
  } catch {
    noteFailure();
  }
}

/** The single place that touches the database. Both paths go through here. */
async function writeEvent(
  fingerprint: string,
  scope: string,
  message: string,
  err: unknown,
  context: Record<string, unknown> | undefined,
  increment: number,
): Promise<void> {
  try {
    const stack = err instanceof Error && err.stack ? err.stack.slice(0, MAX_STACK) : null;
    let contextJson: string | null = null;
    if (context) {
      try {
        contextJson = JSON.stringify(context).slice(0, 2_000);
      } catch {
        contextJson = null;
      }
    }

    await prisma.errorEvent.upsert({
      where: { fingerprint },
      create: {
        fingerprint,
        scope,
        message: message.slice(0, 1_000),
        stack,
        context: contextJson,
        count: increment,
      },
      update: {
        count: { increment },
        lastSeenAt: new Date(),
        message: message.slice(0, 1_000),
        stack,
        context: contextJson,
        // A fault that recurs after being marked handled is not handled.
        resolvedAt: null,
      },
    });
    consecutiveFailures = 0;
  } catch {
    noteFailure();
  }
}

function noteFailure(): void {
  consecutiveFailures += 1;
  if (consecutiveFailures >= FAILURE_LIMIT) {
    circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
    consecutiveFailures = 0;
  }
}

/** Test seam — resets throttle and circuit state between cases. */
export function __resetCaptureState(): void {
  for (const entry of pending.values()) if (entry.flush) clearTimeout(entry.flush);
  pending.clear();
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
}
