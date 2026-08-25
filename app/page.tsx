import { ArrowRight, Crosshair, Radar, ShieldCheck, TrendingDown } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WorkedExample } from '@/components/worked-example';
import { prisma } from '@/lib/db';
import { runAlphaEngine } from '@/lib/engine';
import { buildDemoSnapshot, buildSnapshot } from '@/lib/providers';
import { summarize } from '@/lib/scoring';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function headlineStats() {
  try {
    const rows = await prisma.signalOutcome.findMany({
      where: { grade: { not: 'pending' } },
      select: { grade: true, edgePct: true },
      take: 5000,
      orderBy: { updatedAt: 'desc' },
    });
    return summarize(rows);
  } catch {
    return null;
  }
}

/**
 * The example is a real engine run, not a mockup. It prefers the most recent
 * high-conviction live call so the landing page shows the product working on an
 * actual token; with no live data it falls back to the pinned demo scenario and
 * labels it, rather than quietly passing synthetic output off as real.
 */
async function exampleSignal(): Promise<{ signal: Awaited<ReturnType<typeof runAlphaEngine>>; demo: boolean }> {
  const DEMO_ADDRESS = 'mEEmeDUMP1111111111111111111111111111111111';
  try {
    const recent = await prisma.signal.findFirst({
      where: { synthetic: false, conviction: { gte: 0.4 } },
      orderBy: { createdAt: 'desc' },
      select: { tokenAddress: true },
    });
    if (recent) {
      const result = await buildSnapshot(recent.tokenAddress);
      if (result.mode === 'live') {
        return { signal: runAlphaEngine(result.snapshot), demo: false };
      }
    }
  } catch {
    // Fall through to the demo scenario.
  }
  return { signal: runAlphaEngine(buildDemoSnapshot(DEMO_ADDRESS)), demo: true };
}

export default async function HomePage() {
  const [stats, example] = await Promise.all([headlineStats(), exampleSignal()]);

  return (
    <div className="space-y-24 py-10">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative">
        <Badge className="mb-5">the EE is Exit Engine</Badge>

        <h1 className="max-w-4xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
          Every tool is built for the entry.
          <br />
          <span className="text-primary text-glow">Entry is a race you cannot win.</span>
        </h1>

        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          Median hold time on a Solana memecoin is about 100 seconds. Co-located bots are ahead of you
          by 400 milliseconds, and roughly 87% of same-block snipes are already green before you have
          seen the ticker. You are not going to out-enter them.
        </p>

        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-foreground/90">
          But the exit is not a race. It is a decision — and it is where retail actually bleeds out.
          Around half of pump.fun wallets finish a month down, and 96% end flat or worse. Not because
          they picked wrong. Because they sold the 40× at 2× and held the rug to zero.
        </p>

        <p className="mt-6 max-w-2xl text-xl font-medium">
          mEEme is the only tool built entirely for the second half of the trade.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/lock">
              <Crosshair className="h-4 w-4" /> Lock a contract — free
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/track-record">
              See every call we have made <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {stats && stats.accuracy !== null && (
          <p className="mt-5 font-mono text-xs text-muted-foreground">
            {(stats.accuracy * 100).toFixed(0)}% accurate across {stats.correct + stats.incorrect}{' '}
            graded calls · every one of them public, wins and losses.
          </p>
        )}
      </section>

      {/* ── Evidence, before any more claims ──────────────────────────────── */}
      <section>
        <h2 className="font-mono text-sm uppercase tracking-[0.2em] text-primary">what you actually get</h2>
        <p className="mb-6 mt-2 max-w-2xl text-muted-foreground">
          Not a score out of ten. A call, the evidence behind it, and the exact prices to act on.
          This is a live run of the same engine that serves the app.
        </p>
        <WorkedExample signal={example.signal} demo={example.demo} />
      </section>

      {/* ── The mechanic ──────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-mono uppercase tracking-[0.2em] text-primary">the mechanic</h2>
        <h3 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight">
          A memecoin&rsquo;s next move is not in the candles. It is in the unrealized PnL of the people
          already holding it.
        </h3>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <Pillar
            icon={TrendingDown}
            tone="coil"
            title="Coiled supply"
            body="Every holder cheaper than you is a coiled spring pointed at your exit — weighted by how far up they are and whether they have already started selling. A wallet up 50× is a nuclear seller. A wallet up 1.1× is inert."
          />
          <Pillar
            icon={ShieldCheck}
            tone="trap"
            title="Trapped supply"
            body="Every holder more expensive than you is a bag that will not sell into weakness. That is structure, not risk — and it is why a token 'can't break' a level. That level is where 8% of supply gets whole."
          />
          <Pillar
            icon={Radar}
            tone="warn"
            title="Insider coil"
            body="The same math, restricted to wallets linked to the deployer by funding. Everyone can tell you insiders exist. We tell you what they paid and how much they have already dumped."
          />
        </div>

        <div className="mt-8 rounded-lg border border-border/70 bg-card/50 p-6">
          <h4 className="hud-label mb-3">what comes out</h4>
          <p className="text-lg leading-relaxed">
            Not a score. A <span className="font-semibold text-primary">ladder</span> and a{' '}
            <span className="font-semibold text-coil">trapdoor</span> — the exact price at which the
            largest block of in-profit supply goes to breakeven and paper gains become a stampede.
            That is your stop, derived from the order book&rsquo;s own structure instead of a
            round-number rule.
          </p>
        </div>
      </section>

      {/* ── Why it is unfair ──────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-mono uppercase tracking-[0.2em] text-primary">why this is unfair</h2>
        <dl className="mt-6 grid gap-6 md:grid-cols-3">
          <Reason
            term="It is non-consensus data"
            def="RugCheck tells you a token is risky. DexScreener tells you the price. Neither will tell you the cost basis of the people who are about to dump on you. That number is derived, and nobody sells it."
          />
          <Reason
            term="Latency does not kill you"
            def="Exit decisions play out over minutes, not milliseconds. A web app genuinely competes here. On entry it never could — which is why every entry tool is a losing fight against a bot."
          />
          <Reason
            term="It beats your own hands"
            def="The edge in memecoins is asymmetry: win 15–25% of the time, make 3–10× on winners. The ladder is precommitted, so it holds runners longer and cuts losers before they become losers."
          />
        </dl>
      </section>

      {/* ── Honesty ───────────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-primary/25 bg-primary/[0.04] p-8">
        <h2 className="text-2xl font-bold tracking-tight">Every call is public. Including the bad ones.</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-muted-foreground">
          Every tool in this space claims a win rate and none of them will tell you how it was
          measured. Ours is fixed in code, versioned in git, and applied automatically four hours
          after each call. Calls that landed in the noise are graded neutral and excluded — not
          quietly counted as wins. Demo reads never enter the ledger at all.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/track-record">
            Read the ledger <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </section>

      <section className="text-center">
        <h2 className="text-3xl font-bold tracking-tight">Point it at a bag you already hold.</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Three free locks a day, no account needed, ladder included. If the read is wrong you will
          know within the hour — and so will everyone else.
        </p>
        <Button asChild size="lg" className="mt-6">
          <Link href="/lock">
            <Crosshair className="h-4 w-4" /> Open the cockpit
          </Link>
        </Button>
      </section>
    </div>
  );
}

function Pillar({
  icon: Icon,
  title,
  body,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  tone: 'coil' | 'trap' | 'warn';
}) {
  const toneClass = { coil: 'text-coil', trap: 'text-trap', warn: 'text-warn' }[tone];
  return (
    <div className="hud-panel p-5">
      <Icon className={`h-5 w-5 ${toneClass}`} />
      <h4 className="mt-3 font-semibold">{title}</h4>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function Reason({ term, def }: { term: string; def: string }) {
  return (
    <div>
      <dt className="font-semibold text-primary">{term}</dt>
      <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{def}</dd>
    </div>
  );
}
