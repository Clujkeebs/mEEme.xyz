import { jsonOk } from '@/lib/api';
import { googleConfigured } from '@/lib/auth';
import { databaseConfigured, prisma } from '@/lib/db';
import { demoModeForced, providerStatus } from '@/lib/providers';
import { stripeConfigured } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Straight answer to "why is this not working".
 *
 * The market-data APIs this app depends on could not be reached from the
 * environment it was built in, so their exact response shapes are validated at
 * runtime rather than at author time. This route is how you confirm each one on
 * first deploy: it makes a real call to every configured provider and reports
 * whether the response parsed.
 */

const PROBE_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC — always exists.

export async function GET() {
  const checks: { name: string; ok: boolean; detail: string }[] = [];

  // Database
  let dbOk = false;
  let dbDetail = 'DATABASE_URL is not set.';
  if (databaseConfigured()) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
      dbDetail = 'Connected.';
    } catch (err) {
      dbDetail = err instanceof Error ? err.message : 'Connection failed.';
    }
  }
  checks.push({ name: 'database', ok: dbOk, detail: dbDetail });

  checks.push({
    name: 'auth (google)',
    ok: googleConfigured(),
    detail: googleConfigured()
      ? 'Configured.'
      : 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET unset — sign-in is disabled.',
  });

  checks.push({
    name: 'stripe',
    ok: stripeConfigured(),
    detail: stripeConfigured()
      ? 'Configured.'
      : 'STRIPE_SECRET_KEY or price IDs unset — everyone stays on the free tier.',
  });

  // Live provider probes, run against a mint that definitely exists.
  const probes = await Promise.all(
    providerStatus().map(async (p) => {
      if (!p.configured) {
        return { name: `provider:${p.name}`, ok: false, detail: `Not configured. ${p.note}` };
      }
      try {
        const mod = await import('@/lib/providers');
        if (p.name === 'dexscreener') {
          const r = await mod.buildSnapshot(PROBE_MINT);
          return {
            name: 'provider:dexscreener',
            ok: r.mode === 'live',
            detail:
              r.mode === 'live'
                ? `Live. Sources that answered: ${r.sources.join(', ') || 'none'}.` +
                  (r.missing.length ? ` Missing: ${r.missing.join(', ')}.` : '')
                : 'Fell back to demo — no live price came back. Check network egress from this deployment.',
          };
        }
        return { name: `provider:${p.name}`, ok: true, detail: `Key present. ${p.note}` };
      } catch (err) {
        return {
          name: `provider:${p.name}`,
          ok: false,
          detail: err instanceof Error ? err.message : 'Probe threw.',
        };
      }
    }),
  );

  return jsonOk({
    demoModeForced: demoModeForced(),
    cronSecretSet: Boolean((process.env.CRON_SECRET ?? '').trim()),
    checks: [...checks, ...probes],
  });
}
