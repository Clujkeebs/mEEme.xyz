import { describe, expect, it } from 'vitest';
import { rateLimit } from '../ratelimit';

/**
 * The ceiling that makes the /api/lock refund safe.
 *
 * That route refunds a lock when no provider can price the address, which is
 * the right answer for a mistyped contract and a hole without this: a caller
 * can post a plausible-but-nonexistent mint, burn two upstream fetches, take a
 * 404, get the lock back, and repeat forever. Their quota never moves, so the
 * quota cannot stop them. Only a limit that counts requests rather than
 * successful reads can.
 */

const HOUR = 60 * 60 * 1000;

describe('the per-connection ceiling on reads', () => {
  it('lets an ordinary session through', () => {
    // Twenty reads in an hour is a person working, not an attack.
    let allowed = 0;
    for (let i = 0; i < 20; i++) if (rateLimit('lock:ordinary', 60, HOUR)) allowed++;
    expect(allowed).toBe(20);
  });

  it('stops an unbounded loop dead at the ceiling', () => {
    let allowed = 0;
    for (let i = 0; i < 5_000; i++) if (rateLimit('lock:flood', 60, HOUR)) allowed++;
    // Without this the same loop would have made ten thousand upstream calls.
    expect(allowed).toBe(60);
  });

  it('counts each connection separately, so one flood cannot lock out everyone', () => {
    for (let i = 0; i < 5_000; i++) rateLimit('lock:noisy', 60, HOUR);
    expect(rateLimit('lock:quiet', 60, HOUR)).toBe(true);
  });

  it('opens again once the window rolls over', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 60; i++) rateLimit('lock:window', 60, HOUR, t0);
    expect(rateLimit('lock:window', 60, HOUR, t0 + 1)).toBe(false);
    expect(rateLimit('lock:window', 60, HOUR, t0 + HOUR + 1)).toBe(true);
  });
});
