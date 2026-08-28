import { randomUUID } from 'node:crypto';
import { prisma } from './db';

/**
 * Leader election for scheduled work.
 *
 * The scheduler already refuses to start twice inside one process. That is not
 * the interesting case: the interesting case is a second *replica*, which is
 * exactly what you add when traffic arrives. Without a shared lease every
 * replica runs every sweep — the same tokens fetched N times against a Helius
 * quota that already returns 429 at N=1, the same rows written concurrently,
 * and N times the load on a 60-connection database.
 *
 * A lease is a row, claimed atomically, that expires on its own. Nothing has to
 * release it for correctness, so a replica killed mid-job cannot wedge the
 * schedule — the worst case is that the job is skipped until the lease lapses.
 */

/** Identifies this process. Regenerated on restart, which is the point. */
export const INSTANCE_ID = randomUUID();

/**
 * Claim `name` for `ttlMs`, atomically.
 *
 * The insert-or-update is one statement so two replicas racing cannot both
 * win: the conflicting writer's UPDATE is gated on the existing lease having
 * expired, and Postgres serialises the two through the primary key.
 */
export async function acquireLease(name: string, ttlMs: number): Promise<boolean> {
  const expiresAt = new Date(Date.now() + ttlMs);
  try {
    const rows = await prisma.$queryRaw<{ holder: string }[]>`
      INSERT INTO "JobLease" ("name", "holder", "acquiredAt", "expiresAt")
      VALUES (${name}, ${INSTANCE_ID}, NOW(), ${expiresAt})
      ON CONFLICT ("name") DO UPDATE
        SET "holder" = EXCLUDED."holder",
            "acquiredAt" = NOW(),
            "expiresAt" = EXCLUDED."expiresAt"
        WHERE "JobLease"."expiresAt" < NOW()
      RETURNING "holder"
    `;
    return rows.length > 0;
  } catch (err) {
    // A database that cannot be reached must not be treated as "lease is free".
    // Skipping a tick is recoverable; two replicas both deciding they are the
    // leader is the failure this exists to prevent.
    console.warn('[lease] could not claim', name, err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Release `name`, but only if this process still holds it.
 *
 * The holder check matters: if a job overran its lease and another replica
 * took over, this one must not delete the new holder's claim on its way out.
 */
export async function releaseLease(name: string): Promise<void> {
  try {
    await prisma.$executeRaw`
      UPDATE "JobLease" SET "expiresAt" = NOW()
      WHERE "name" = ${name} AND "holder" = ${INSTANCE_ID}
    `;
  } catch {
    // Nothing to do. The lease expires on its own.
  }
}

/**
 * Run `fn` only if this process wins the lease for `name`.
 *
 * Returns the job's result, or `null` when another replica holds it. `ttlMs`
 * should comfortably exceed the job's normal runtime — a lease that lapses
 * mid-run lets a second replica start the same work.
 */
export async function withLease<T>(
  name: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T | null> {
  if (!(await acquireLease(name, ttlMs))) return null;
  try {
    return await fn();
  } finally {
    await releaseLease(name);
  }
}
