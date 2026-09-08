import { createHash, randomBytes } from 'node:crypto';

/**
 * Password reset.
 *
 * Accounts on this app are email and password, with no email-link sign-in and
 * no social provider configured. That made a forgotten password a permanently
 * lost account: nothing in the product could get you back in, and the only
 * recovery was to ask the operator to edit the database by hand. For a stranger
 * who signs up, forgets, and leaves, that is not a support burden — it is a
 * user you never hear from again.
 *
 * The rules here are the boring ones, which is the point:
 *
 *   - The token is 32 random bytes, generated server-side, never derived from
 *     anything about the user. Guessing one is not a thing you can do.
 *   - Only its SHA-256 is stored. A database read hands the reader a list of
 *     hashes, not a set of working links into other people's accounts.
 *   - It expires, it is single-use, and requesting a new one invalidates the
 *     old ones — so a link forwarded, logged, or left in an inbox stops
 *     working rather than remaining a spare key.
 */

/** Long enough that a link left in an inbox overnight is not a standing key. */
export const RESET_TTL_MS = 60 * 60 * 1000;

/** 32 bytes of CSPRNG output, url-safe. */
export function generateResetToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * What goes in the database. SHA-256 rather than bcrypt deliberately: this is a
 * 256-bit random string, not a human-chosen password, so there is no dictionary
 * to slow an attacker down against and nothing for a work factor to buy. What
 * it does need is a constant-time lookup, which a fixed-length digest gives.
 */
export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/*
 * There is deliberately no compare function here. Redemption looks the row up
 * by tokenHash through a unique index rather than fetching candidates and
 * comparing them, so nothing in this flow ever compares two secrets. An unused
 * constant-time helper sat here for a while and was removed for exactly that
 * reason: the next person to read this would have assumed it was the
 * comparison path and reasoned about a code path that does not exist.
 */

export interface ResetTokenRow {
  expiresAt: Date;
  usedAt: Date | null;
}

export type ResetTokenState = 'valid' | 'expired' | 'used' | 'unknown';

/**
 * Whether a stored token may still be redeemed.
 *
 * Split out from the route so the three ways a link can be dead are decided in
 * one tested place. They are deliberately distinguishable to the *user* — "this
 * link has expired, request another" is actionable and "invalid token" is not —
 * while all three stay indistinguishable to anyone probing for which emails
 * have an account, because the request step never reveals that either.
 */
export function resetTokenState(row: ResetTokenRow | null, now: Date = new Date()): ResetTokenState {
  if (!row) return 'unknown';
  if (row.usedAt !== null) return 'used';
  if (row.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'valid';
}

export const RESET_STATE_MESSAGE: Record<Exclude<ResetTokenState, 'valid'>, string> = {
  expired: 'That reset link has expired. Request a new one — they last an hour.',
  used: 'That reset link has already been used. Request a new one if you still need it.',
  unknown: 'That reset link is not valid. Request a new one.',
};
