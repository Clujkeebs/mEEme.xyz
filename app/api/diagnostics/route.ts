import { jsonOk } from '@/lib/api';
import { googleConfigured } from '@/lib/auth';
import { databaseConfigured, prisma } from '@/lib/db';
import { emailConfigured, telegramConfigured } from '@/lib/notify';
import { birdeyeConfigured } from '@/lib/providers/birdeye';
import { heliusConfigured } from '@/lib/providers/helius';
import { demoModeForced, providerStatus } from '@/lib/providers';
import { discoverCandidates } from '@/lib/providers/discover';
import { getStripe, stripeConfigured } from '@/lib/stripe';

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

/**
 * Fallback probe target. USDC always exists, which makes it a safe liveness
 * check — but it is not a memecoin, so RugCheck has little to say about it and
 * the probe reported "0 top holders parsed" on a working integration. That
 * reads as a broken parser when nothing is broken.
 *
 * So the probe prefers a token the app would actually be asked about, and only
 * falls back to USDC when discovery itself is down.
 */
const FALLBACK_PROBE_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

async function resolveProbeMint(): Promise<{ mint: string; representative: boolean }> {
  try {
    const candidates = await discoverCandidates(1);
    const first = candidates[0];
    if (first) return { mint: first.address, representative: true };
  } catch {
    // Discovery being down is itself worth knowing, and the checks below will
    // show it — do not let it stop the rest of the probe.
  }
  return { mint: FALLBACK_PROBE_MINT, representative: false };
}

/**
 * Live-mode and price verification. Separate from the probe helper below
 * because it reports several independent facts and a boolean would flatten them
 * into "something about billing is wrong".
 */
async function stripeCheck(): Promise<{ name: string; ok: boolean; detail: string }> {
  const name = 'stripe (billing)';
  if (!stripeConfigured()) {
    return {
      name,
      ok: false,
      detail: 'STRIPE_SECRET_KEY or price IDs unset — upgrade buttons are inert and everyone stays free.',
    };
  }

  const stripe = getStripe();
  if (!stripe) return { name, ok: false, detail: 'Stripe client could not be constructed.' };

  const key = process.env.STRIPE_SECRET_KEY ?? '';
  const live = key.startsWith('sk_live_');
  const mode = live ? 'LIVE' : key.startsWith('sk_test_') ? 'TEST' : 'UNRECOGNISED';

  const notes: string[] = [];
  let ok = live;
  if (!live) {
    notes.push(
      mode === 'TEST'
        ? 'Key is TEST mode: real cards will be declined. Do not run ads against this.'
        : 'Key is neither sk_live_ nor sk_test_ — cannot tell what this is.',
    );
  }

  for (const [tier, priceId] of [
    ['DEGEN', process.env.STRIPE_PRICE_DEGEN],
    ['APEX', process.env.STRIPE_PRICE_APEX],
  ] as const) {
    if (!priceId) {
      notes.push(`${tier}: no price id set, that tier cannot be bought.`);
      ok = false;
      continue;
    }
    try {
      const price = await stripe.prices.retrieve(priceId);
      const problems: string[] = [];
      if (!price.active) problems.push('archived');
      if (price.type !== 'recurring') problems.push(`type=${price.type}, expected recurring`);
      if (price.livemode !== live) problems.push(`livemode=${price.livemode} but key is ${mode}`);

      if (problems.length > 0) {
        notes.push(`${tier}: ${problems.join(', ')}.`);
        ok = false;
      } else {
        const amount = price.unit_amount === null ? '?' : (price.unit_amount / 100).toFixed(2);
        notes.push(`${tier}: ${amount} ${price.currency.toUpperCase()}/${price.recurring?.interval ?? '?'} ok.`);
      }
    } catch (err) {
      // The common cause is an id from the other mode or another account.
      notes.push(`${tier}: could not retrieve ${priceId} — ${err instanceof Error ? err.message : 'unknown error'}`);
      ok = false;
    }
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET?.trim()) {
    notes.push('STRIPE_WEBHOOK_SECRET unset — payments would succeed and never grant a tier.');
    ok = false;
  }

  return { name, ok, detail: `Key mode ${mode}. ${notes.join(' ')}` };
}

export async function GET() {
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  const probeTarget = await resolveProbeMint();
  const PROBE_MINT = probeTarget.mint;

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

  // Email/password sign-in always works once a database exists — Google is an
  // optional extra sign-in method on top of it, not a requirement.
  checks.push({
    name: 'auth (google, optional)',
    ok: googleConfigured(),
    detail: googleConfigured()
      ? 'Configured.'
      : 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET unset — the Google button is hidden, email/password sign-in is unaffected.',
  });

  /*
   * Billing, actually asked rather than assumed.
   *
   * stripeConfigured() only says a key and a price id are present as strings,
   * which is exactly the reassuring lie this route exists to prevent. A
   * deployment holding test-mode keys, or price ids from a different Stripe
   * account, or ids for a price that has since been archived, passes that check
   * and then declines every real customer at the till. Nobody finds out until
   * an ad campaign is running and the conversion rate is zero.
   *
   * So this makes a real call: it reports which mode the key is in and
   * retrieves each configured price to confirm it exists, is active, and is a
   * recurring price in that same mode.
   */
  checks.push(await stripeCheck());

  // Alerts are the entire reason a paid tier exists — a deployment can run for
  // weeks with both of these unset and nothing errors, because a Watch simply
  // never gets a channel to fire through. This is the one place that says so.
  checks.push({
    name: 'alerts (telegram)',
    ok: telegramConfigured(),
    detail: telegramConfigured() ? 'Configured.' : 'TELEGRAM_BOT_TOKEN unset — no Telegram alerts.',
  });
  checks.push({
    name: 'alerts (email)',
    ok: emailConfigured(),
    detail: emailConfigured() ? 'Configured.' : 'RESEND_API_KEY unset — no email alerts.',
  });
  if (!telegramConfigured() && !emailConfigured()) {
    checks.push({
      name: 'alerts (delivery)',
      ok: false,
      detail: 'No channel configured at all. Watches and positions will alert nowhere.',
    });
  }

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
      if (!report) {
        return { ok: false, detail: 'No usable response. Structural flags and insider priors unavailable.' };
      }
      // An empty holder list on a token RugCheck simply does not track is not a
      // parser failure, and saying so avoids a false alarm.
      const holders = report.balances.size;
      const caveat =
        holders === 0 && !probeTarget.representative
          ? ' (probe token is not a memecoin, so an empty holder list here is expected)'
          : '';
      return { ok: true, detail: `Answered. ${holders} top holders parsed${caveat}.` };
    }),
    probe('geckoterminal', true, async () => {
      const { fetchDexScreenerMarket } = await import('@/lib/providers/dexscreener');
      const market = await fetchDexScreenerMarket(PROBE_MINT);
      if (!market?.pairAddress) {
        return { ok: false, detail: 'Could not resolve a pool address to ask about.' };
      }
      const { fetchGeckoCandles } = await import('@/lib/providers/geckoterminal');
      const candles = await fetchGeckoCandles(market.pairAddress, market.ageMinutes);
      return candles
        ? { ok: true, detail: `Answered. ${candles.length} candles — the cost-basis distribution has data.` }
        : { ok: false, detail: 'No candles. Without price history there is no coil, only structural analysis.' };
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
    probeToken: { mint: PROBE_MINT, representative: probeTarget.representative },
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
