import { jsonOk } from '@/lib/api';
import { googleConfigured } from '@/lib/auth';
import { databaseConfigured, prisma } from '@/lib/db';
import { birdeyeConfigured } from '@/lib/providers/birdeye';
import { heliusConfigured } from '@/lib/providers/helius';
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

  // Live provider probes. Each one makes a real call — a status that says "ok"
  // because a key is present, without ever having asked the provider anything,
  // is exactly the kind of reassuring lie this route exists to prevent.
  const probes = await Promise.all([
    probe('dexscreener', true, async () => {
      const { fetchDexScreenerMarket } = await import('@/lib/providers/dexscreener');
      const market = await fetchDexScreenerMarket(PROBE_MINT);
      return market
        ? { ok: true, detail: `Answered. ${market.symbol} at $${market.priceUsd.toPrecision(4)}.` }
        : { ok: false, detail: 'No usable response. Live reads will fall back to demo data.' };
    }),
    probe('rugcheck', true, async () => {
      const { fetchRugcheckReport } = await import('@/lib/providers/rugcheck');
      const report = await fetchRugcheckReport(PROBE_MINT);
      return report
        ? { ok: true, detail: `Answered. ${report.balances.size} top holders parsed.` }
        : { ok: false, detail: 'No usable response. Structural flags and insider priors unavailable.' };
    }),
    probe('helius', heliusConfigured(), async () => {
      const { fetchAsset } = await import('@/lib/providers/helius');
      const asset = await fetchAsset(PROBE_MINT);
      return asset
        ? { ok: true, detail: `Answered. Decimals ${asset.decimals ?? '?'}.` }
        : { ok: false, detail: 'Key is set but the call failed or did not parse. No cost basis without this.' };
    }),
    probe('birdeye', birdeyeConfigured(), async () => {
      const { fetchSolPriceUsd } = await import('@/lib/providers/birdeye');
      const price = await fetchSolPriceUsd();
      return price
        ? { ok: true, detail: `Answered. SOL at $${price.toFixed(2)}.` }
        : { ok: false, detail: 'Key is set but the call failed or did not parse. No chart.' };
    }),
  ]);

  return jsonOk({
    demoModeForced: demoModeForced(),
    cronSecretSet: Boolean((process.env.CRON_SECRET ?? '').trim()),
    checks: [...checks, ...probes],
  });
}

/** Run one provider probe, reporting an unconfigured provider as such rather than failing it. */
async function probe(
  name: string,
  configured: boolean,
  run: () => Promise<{ ok: boolean; detail: string }>,
): Promise<{ name: string; ok: boolean; detail: string }> {
  const spec = providerStatus().find((p) => p.name === name);

  if (!configured) {
    return { name: `provider:${name}`, ok: false, detail: `Not configured. ${spec?.note ?? ''}`.trim() };
  }
  try {
    const result = await run();
    return { name: `provider:${name}`, ...result };
  } catch (err) {
    return {
      name: `provider:${name}`,
      ok: false,
      detail: err instanceof Error ? err.message : 'Probe threw.',
    };
  }
}
