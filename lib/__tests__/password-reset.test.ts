import { describe, expect, it } from 'vitest';
import {
  generateResetToken,
  hashResetToken,
  RESET_STATE_MESSAGE,
  resetTokenState,
  RESET_TTL_MS,
} from '../password-reset';
import { passwordProblem } from '../password-rules';

describe('generateResetToken', () => {
  it('is long, url-safe and never repeats', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const t = generateResetToken();
      expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
      // 32 bytes base64url — long enough that guessing is not an attack.
      expect(t.length).toBeGreaterThanOrEqual(42);
      expect(seen.has(t)).toBe(false);
      seen.add(t);
    }
  });

  it('survives a round trip through a URL unchanged', () => {
    for (let i = 0; i < 100; i++) {
      const t = generateResetToken();
      expect(decodeURIComponent(encodeURIComponent(t))).toBe(t);
      expect(new URL(`https://x.test/r?token=${t}`).searchParams.get('token')).toBe(t);
    }
  });
});

describe('hashResetToken', () => {
  it('is a stable sha256 hex digest', () => {
    const t = generateResetToken();
    expect(hashResetToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashResetToken(t)).toBe(hashResetToken(t));
  });

  it('never stores anything the token can be read back out of', () => {
    const t = generateResetToken();
    const h = hashResetToken(t);
    expect(h).not.toContain(t);
    expect(h).not.toBe(t);
  });

  it('separates tokens that differ by one character', () => {
    const a = 'a'.repeat(43);
    const b = 'a'.repeat(42) + 'b';
    expect(hashResetToken(a)).not.toBe(hashResetToken(b));
  });
});

describe('resetTokenState', () => {
  const now = new Date('2026-09-08T12:00:00Z');
  const live = { expiresAt: new Date(now.getTime() + 60_000), usedAt: null };

  it('accepts a live, unused token', () => {
    expect(resetTokenState(live, now)).toBe('valid');
  });

  it('rejects one that has already been redeemed', () => {
    expect(resetTokenState({ ...live, usedAt: new Date(now.getTime() - 1) }, now)).toBe('used');
  });

  it('rejects an expired one, and treats the exact expiry instant as expired', () => {
    expect(resetTokenState({ expiresAt: new Date(now.getTime() - 1), usedAt: null }, now)).toBe('expired');
    expect(resetTokenState({ expiresAt: now, usedAt: null }, now)).toBe('expired');
  });

  it('prefers "used" over "expired" when a redeemed token also aged out', () => {
    // A link someone already used should say so, rather than inviting them to
    // wonder whether a fresh one would have worked.
    const row = { expiresAt: new Date(now.getTime() - 60_000), usedAt: new Date(now.getTime() - 120_000) };
    expect(resetTokenState(row, now)).toBe('used');
  });

  it('reports an unknown token without distinguishing it from a wrong one', () => {
    expect(resetTokenState(null, now)).toBe('unknown');
  });

  it('has an actionable message for every dead state', () => {
    for (const state of ['expired', 'used', 'unknown'] as const) {
      expect(RESET_STATE_MESSAGE[state]).toMatch(/new one/);
    }
  });

  it('lasts an hour', () => {
    expect(RESET_TTL_MS).toBe(60 * 60 * 1000);
    const issued = new Date(now.getTime() + RESET_TTL_MS);
    expect(resetTokenState({ expiresAt: issued, usedAt: null }, now)).toBe('valid');
    expect(
      resetTokenState({ expiresAt: issued, usedAt: null }, new Date(now.getTime() + RESET_TTL_MS + 1)),
    ).toBe('expired');
  });
});

describe('passwordProblem', () => {
  it('holds the same floor as sign-up', () => {
    expect(passwordProblem('1234567')).toMatch(/8 characters/);
    expect(passwordProblem('12345678')).toBeNull();
  });

  it('rejects one long enough to be a denial of service against bcrypt', () => {
    expect(passwordProblem('x'.repeat(201))).toMatch(/under 200/);
    expect(passwordProblem('x'.repeat(200))).toBeNull();
  });
});
