import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { prisma } from './db';
import { utcDay } from './quota';
import { tierFromString, type Tier } from './tiers';

/**
 * API keys.
 *
 * The Apex tier advertised "API access for your own bots" before any such thing
 * existed, which meant charging $19.99 for a feature that was not there. This
 * is that feature.
 *
 * Keys are stored as SHA-256 hashes. A database dump hands an attacker nothing
 * usable, and there is no code path — including for us — that can reproduce a
 * key after it is issued. That is why the UI shows it exactly once.
 */

const PREFIX = 'meeme_live_';
/** Requests per UTC day on the Apex tier. Generous, but not a free firehose. */
export const API_DAILY_LIMIT = 5_000;

export interface IssuedKey {
  id: string;
  name: string;
  /** The only time the full key exists outside the caller's hands. */
  secret: string;
  prefix: string;
}

const hash = (key: string): string => createHash('sha256').update(key).digest('hex');

export async function issueApiKey(userId: string, name: string): Promise<IssuedKey> {
  const secret = `${PREFIX}${randomBytes(24).toString('base64url')}`;
  const record = await prisma.apiKey.create({
    data: {
      userId,
      name: name.trim().slice(0, 60) || 'default',
      keyHash: hash(secret),
      prefix: secret.slice(0, 12),
    },
    select: { id: true, name: true, prefix: true },
  });
  return { ...record, secret };
}

export interface AuthedKey {
  keyId: string;
  userId: string;
  tier: Tier;
  callsToday: number;
}

export type ApiAuthResult =
  | { ok: true; key: AuthedKey }
  | { ok: false; status: number; error: string };

/** Constant-time compare, so a wrong key cannot be narrowed down by timing. */
function hashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Authenticate a request and claim one call against the daily allowance.
 *
 * The lookup is by hash, so it is a single indexed read; the constant-time
 * compare is belt-and-braces for the value we just fetched.
 */
export async function authenticateApiRequest(request: Request): Promise<ApiAuthResult> {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match?.[1]) {
    return { ok: false, status: 401, error: 'Missing Authorization: Bearer <key> header.' };
  }

  const presented = match[1];
  if (!presented.startsWith(PREFIX)) {
    return { ok: false, status: 401, error: 'Malformed API key.' };
  }

  const digest = hash(presented);
  const record = await prisma.apiKey.findUnique({
    where: { keyHash: digest },
    select: {
      id: true,
      keyHash: true,
      revokedAt: true,
      callsToday: true,
      callsDay: true,
      user: { select: { id: true, tier: true } },
    },
  });

  if (!record || !hashesMatch(record.keyHash, digest)) {
    return { ok: false, status: 401, error: 'Unknown API key.' };
  }
  if (record.revokedAt) {
    return { ok: false, status: 401, error: 'This key has been revoked.' };
  }

  const tier = tierFromString(record.user.tier);
  if (tier !== 'APEX') {
    // A downgrade should stop working immediately, not at the next renewal.
    return { ok: false, status: 403, error: 'API access requires the Apex tier.' };
  }

  const today = utcDay();
  const used = record.callsDay === today ? record.callsToday : 0;
  if (used >= API_DAILY_LIMIT) {
    return { ok: false, status: 429, error: `Daily limit of ${API_DAILY_LIMIT} requests reached.` };
  }

  await prisma.apiKey.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date(), callsDay: today, callsToday: used + 1 },
  });

  return {
    ok: true,
    key: { keyId: record.id, userId: record.user.id, tier, callsToday: used + 1 },
  };
}
