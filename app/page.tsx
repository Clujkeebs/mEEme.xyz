import { ArrowRight, Crosshair } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HeroReadout } from '@/components/hero-readout';
import { CoiledGlyph, InsiderGlyph, TrappedGlyph } from '@/components/brand';
import { Reveal } from '@/components/motion';
import { WorkedExample } from '@/components/worked-example';
import { prisma } from '@/lib/db';
import { withDeadline } from '@/lib/deadline';
import { runAlphaEngine } from '@/lib/engine';
import { buildDemoSnapshot, buildSnapshot } from '@/lib/providers';
import { summarize } from '@/lib/scoring';
import { cn } from '@/lib/utils';

// This page calls buildSnapshot() below, which hits live providers over the
// network. Rendering it force-dynamic meant every homepage visit — the
// highest-traffic page in the app — made its own live fetch, adding avoidable
// latency to every load and risking GeckoTerminal's keyless rate limit
// (~30 req/min) under nothing more than organic browsing. ISR caps that to at
// most one fetch per window, however many visitors land on it in between.
//
// The cost of that choice, learned the hard way: ISR also means this page is
// rendered once during `next build`, so a slow or throttled provider stops
// being a slow page and becomes a failed deploy. exampleSignal() below is what
// keeps that from happening — it skips the live read entirely at build time,
// and bounds it everywhere else.
export const revalidate = 120;

async function headlineStats() {
  try {
    const rows = await prisma.signalOutcome.findMany({
      where: { grade: { not: 'pending' } },
      select: { grade: true, edgePct: true, signal: { select: { verdict: true } } },
      take: 5000,
      orderBy: { updatedAt: 'desc' },
    });
    return summarize(rows.map((r) => ({ ...r, verdict: r.signal.verdict })));
  } catch {
    return null;
  }
}

/**
 * How long the live read gets before the page gives up and ships the demo.
 *
 * Next kills a static-generation worker at 60 seconds and retries three times
 * before failing the whole build. buildSnapshot() below reaches Helius for
 * asset data, token accounts and per-wallet transaction history, and Helius
 * rate-limits — so with no bound on it, a page that renders in a second
 * locally takes over a minute in CI and takes the deploy down with it. That is
 * not hypothetical: it is exactly how three builds failed.
 *
 * Twelve seconds is generous for the happy path and far inside the budget for
 * the unhappy one. The deadline protects the runtime too, where the same fetch
 * runs on every revalidation.
 */
const EXAMPLE_DEADLINE_MS = 12_000;

/**
 * The example is a real engine run, not a mockup. It prefers the most recent
 * high-conviction live call so the landing page shows the product works on an
 * actual token; with no live data it falls back to the pinned demo scenario and
 * labels it, rather than quietly passing synthetic output off as real.
 *
 * During `next build` it does not attempt the live read at all. The build has
 * no business depending on a third-party API being reachable and unthrottled
 * at that moment — the page is revalidating every two minutes anyway, so the
 * first request after deploy replaces the demo with a real read. Trading a
 * couple of minutes of demo-labelled hero for a deploy that cannot be blocked
 * by someone else's rate limiter is the right trade.
 */
async function exampleSignal(): Promise<{ signal: Awaited<ReturnType<typeof runAlphaEngine>>; demo: boolean }> {
  const DEMO_ADDRESS = 'mEEmeDUMP1111111111111111111111111111111111';
  const isBuild = process.env.NEXT_PHASE === 'phase-production-build';
  try {
    if (!isBuild) {
      const recent = await prisma.signal.findFirst({
        where: { synthetic: false, conviction: { gte: 0.4 } },
        orderBy: { createdAt: 'desc' },
        select: { tokenAddress: true },
      });
      if (recent) {
        const result = await withDeadline(buildSnapshot(recent.tokenAddress), EXAMPLE_DEADLINE_MS);
        if (result && result.mode === 'live') {
          return { signal: runAlphaEngine(result.snapshot), demo: false };
        }
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
    <div className="space-y-28 py-12">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-14">
        <div>
        <Badge className="enter mb-5">the EE is Exit Engine</Badge>

        <h1 className="enter text-[2.6rem] font-bold leading-[1.03] tracking-[-0.035em] sm:text-[3.5rem]" style={{ '--reveal-delay': '70ms' } as React.CSSProperties}>
          Every tool is built for the entry.
          <br />
          <span className="text-primary text-glow">Entry is a race you cannot win.</span>
        </h1>

        <p className="enter mt-7 max-w-2xl text-[17px] leading-relaxed text-muted-foreground" style={{ '--reveal-delay': '150ms' } as React.CSSProperties}>
          Median hold time on a Solana memecoin is about 100 seconds. Co-located bots beat you to the
          block by 400 milliseconds. Roughly 87% of same-block snipes are already green before you have
          even seen the ticker. You will not out-enter them, and no dashboard changes that.
        </p>

        <p className="enter mt-4 max-w-2xl text-[17px] leading-relaxed text-foreground/90" style={{ '--reveal-delay': '210ms' } as React.CSSProperties}>
          The exit is different. It plays out over minutes, sometimes hours, and that is a timescale a
          person can actually work in. It is also where most people lose the trade: around half of
          pump.fun wallets finish a month down, and 96% end flat or worse. Most of them did not pick a
          bad coin. They rode the 40&times; back to 2&times; and then rode it the rest of the way to zero.
        </p>

        <p className="enter mt-7 max-w-2xl font-display text-[1.4rem] font-semibold leading-snug tracking-tight" style={{ '--reveal-delay': '270ms' } as React.CSSProperties}>
          mEEme.xyz only does the second half of the trade.
        </p>

        <div className="enter mt-9 flex flex-wrap gap-3" style={{ '--reveal-delay': '330ms' } as React.CSSProperties}>
          <Button asChild size="lg">
            <Link href="/lock">
              <Crosshair className="h-4 w-4" /> Lock a contract, free
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/track-record">
              See every call we have made <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {/* A bare "25% accurate" invites the reader to judge this against a
            coin flip, which is the wrong yardstick for a strategy whose entire
            thesis is asymmetry — and it contradicts the "win 15-25% of the
            time, make 3-10x on winners" argument made further down this same
            page. The payoff belongs next to the win rate, not three sections
            below it. */}
        {stats && stats.accuracy !== null && (
          <p className="enter mt-5 font-mono text-xs leading-relaxed text-muted-foreground" style={{ '--reveal-delay': '390ms' } as React.CSSProperties}>
            {(stats.accuracy * 100).toFixed(0)}% of {stats.correct + stats.incorrect} graded calls
            landed
            {stats.averageWinPct !== null && stats.averageLossPct !== null && (
              <>
                {' · winners average '}
                <span className="text-primary">
                  +{(stats.averageWinPct * 100).toFixed(0)}%
                </span>
                {', losers '}
                <span className="text-destructive">
                  {(stats.averageLossPct * 100).toFixed(0)}%
                </span>
              </>
            )}
            {' · every one public, wins and losses.'}
          </p>
        )}
        </div>

        {/* The argument, demonstrated rather than asserted — and the reason the
            right half of the hero is no longer empty at desktop widths. */}
        <div className="enter lg:sticky lg:top-20" style={{ '--reveal-delay': '430ms' } as React.CSSProperties}>
          <HeroReadout signal={example.signal} demo={example.demo} />
        </div>
      </section>

      {/* ── Evidence, before any more claims ──────────────────────────────── */}
      <Reveal as="section">
        <h2 className="eyebrow">
          what you actually get
        </h2>
        <p className="mb-7 mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Not a score out of ten. A call, the evidence behind it, and the exact prices to act on.
          This is a live run of the same engine that serves the app.
        </p>
        <WorkedExample signal={example.signal} demo={example.demo} />
      </Reveal>

      {/* ── The mechanic ──────────────────────────────────────────────────── */}
      <Reveal as="section">
        <h2 className="eyebrow">
          the mechanic
        </h2>
        <h3 className="mt-4 max-w-3xl text-[2rem] font-bold leading-[1.12] tracking-[-0.03em] sm:text-[2.4rem]">
          The candles do not show where a memecoin goes next. The unrealized PnL of everyone already
          holding it does.
        </h3>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <Pillar
            delay={0}
            glyph={<CoiledGlyph />}
            tone="coil"
            title="Coiled supply"
            body="Every holder cheaper than you is a spring pointed at your exit, weighted by how far up they are and whether they have already started selling. Someone up 50× can dump on you any second. Someone up 1.1× has nothing to run from."
          />
          <Pillar
            delay={80}
            glyph={<TrappedGlyph />}
            tone="trap"
            title="Trapped supply"
            body="Every holder more expensive than you is a bag that will not sell into weakness, because there is nothing to take. That is why a level 'holds' right where 8% of supply finally gets back to breakeven."
          />
          <Pillar
            delay={160}
            glyph={<InsiderGlyph />}
            tone="warn"
            title="Insider coil"
            body="The same math, run only on wallets we can trace back to the deployer's own funding. Anyone can tell you insiders exist in a launch. We tell you what they paid, and exactly how much of it they have already sold."
          />
        </div>

        <div className="mt-8 rounded-lg border border-border/70 bg-card/50 p-6">
          <h4 className="hud-label mb-3">what comes out</h4>
          <p className="text-lg leading-relaxed">
            Not a score. A <span className="font-semibold text-primary">ladder</span> and a{' '}
            <span className="font-semibold text-coil">trapdoor</span>: the price where the largest
            block of in-profit supply goes to breakeven and paper gains turn into a stampede for the
            door. That price is your stop. It comes from the order book itself, not a round number
            someone picked because it looked clean.
          </p>
        </div>
      </Reveal>

      {/* ── Why it is unfair ──────────────────────────────────────────────── */}
      <Reveal as="section">
        <h2 className="eyebrow">
          why this is unfair
        </h2>
        <dl className="mt-7 grid gap-7 md:grid-cols-3">
          <Reason
            term="It is non-consensus data"
            def="RugCheck tells you a token is risky. DexScreener tells you the price. Neither one will tell you what the people about to dump on you actually paid. That number has to be derived, and nobody else is selling it."
          />
          <Reason
            term="Latency does not kill you here"
            def="An exit decision plays out over minutes, not milliseconds, which is a timescale a web app can actually compete in. Entry never had that luxury. Every entry tool is fighting a bot it cannot beat."
          />
          <Reason
            term="It beats your own hands"
            def="Memecoin edge is asymmetric: you win maybe 15 to 25% of the time, and make 3 to 10× on the ones that hit. A ladder set in advance holds a runner longer than you would and cuts a loser before you would."
          />
        </dl>
      </Reveal>

      {/* ── Honesty ───────────────────────────────────────────────────────── */}
      <Reveal as="section" className="hud-panel lift glint border-primary/30 bg-primary/[0.05] p-8 sm:p-10">
        <h2 className="text-[1.85rem] font-bold leading-tight tracking-[-0.03em]">
          Every call is public. Including the ones that were wrong.
        </h2>
        <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
          Every tool in this space claims a win rate. Almost none of them will show you the rule they
          used to measure it. Ours sits in the repo, in plain code, and grades every call four hours
          after it fires with no human touching the outcome. A call that lands in the noise gets marked
          neutral and dropped from the average instead of being quietly counted as a win, and demo reads
          never make it onto the ledger at all.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/track-record">
            Read the ledger <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </Reveal>

      <Reveal as="section" className="relative text-center">
        {/* The mark as punctuation: the page closes on the shape it opened with. */}
        <div aria-hidden="true" className="supply-rule mx-auto mb-10 max-w-xs" />
        <h2 className="text-[2.1rem] font-bold leading-tight tracking-[-0.03em] sm:text-[2.5rem]">
          Point it at a bag you already hold.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          Three free locks a day. No account, no wallet connect, ladder included in the first read.
          If it gets the call wrong, that shows up on the ledger within the hour, same as everything
          else.
        </p>
        <Button asChild size="lg" className="mt-6">
          <Link href="/lock">
            <Crosshair className="h-4 w-4" /> Open the cockpit
          </Link>
        </Button>
      </Reveal>
    </div>
  );
}

function Pillar({
  glyph,
  title,
  body,
  tone,
  delay,
}: {
  glyph: React.ReactNode;
  title: string;
  body: string;
  tone: 'coil' | 'trap' | 'warn';
  delay: number;
}) {
  // A hairline of the concept's own colour across the top edge, so the three
  // cards are distinguishable in peripheral vision before any of them is read.
  const edge = {
    coil: 'from-coil/70',
    trap: 'from-trap/70',
    warn: 'from-warn/70',
  }[tone];

  return (
    <Reveal className="hud-panel lift glint overflow-hidden p-6" delay={delay}>
      <span
        aria-hidden="true"
        className={cn('absolute inset-x-0 top-0 h-px bg-gradient-to-r to-transparent', edge)}
      />
      {glyph}
      <h4 className="mt-4 font-display text-[17px] font-semibold tracking-tight">{title}</h4>
      <p className="mt-2.5 text-[13.5px] leading-relaxed text-muted-foreground">{body}</p>
    </Reveal>
  );
}

function Reason({ term, def }: { term: string; def: string }) {
  return (
    <div>
      <dt className="font-display text-[16px] font-semibold tracking-tight text-primary">{term}</dt>
      <dd className="mt-2.5 text-[13.5px] leading-relaxed text-muted-foreground">{def}</dd>
    </div>
  );
}
