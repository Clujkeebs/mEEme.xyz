import { ArrowRight, Crosshair } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HeroReadout } from '@/components/hero-readout';
import { CoiledGlyph, InsiderGlyph, TrappedGlyph } from '@/components/brand';
import { Reveal } from '@/components/motion';
import { WorkedExample } from '@/components/worked-example';
import { prisma } from '@/lib/db';
import { runAlphaEngine } from '@/lib/engine';
import { buildDemoSnapshot, buildSnapshot } from '@/lib/providers';
import { summarize } from '@/lib/scoring';
import { cn } from '@/lib/utils';

// This page calls buildSnapshot() below, which hits live price providers
// (DexScreener/GeckoTerminal/Birdeye) over the network. Rendering it
// force-dynamic meant every homepage visit — the highest-traffic page in the
// app — made its own live fetch, adding avoidable latency to every load and
// risking GeckoTerminal's keyless rate limit (~30 req/min) under nothing more
// than organic browsing. ISR caps that to at most one fetch per window,
// however many visitors land on it in between.
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
    <div className="space-y-28 py-12">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-14">
        {/*
          Ambient field. Two slow-drifting pools of the brand green sitting
          behind the headline, so the top of the page has depth instead of
          being type on a flat panel. Purely atmospheric, which is why it is
          aria-hidden and stops entirely under reduced motion.
        */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="aurora left-[-12%] top-[-28%] h-[420px] w-[520px]" />
          <div
            className="aurora right-[6%] top-[-14%] h-[300px] w-[360px]"
            style={{ animationDelay: '-9s', animationDuration: '28s' }}
          />
        </div>

        <div>
        <Badge className="enter mb-5">the EE is Exit Engine</Badge>

        <h1 className="enter text-[2.6rem] font-bold leading-[1.03] tracking-[-0.035em] sm:text-[3.5rem]" style={{ '--reveal-delay': '70ms' } as React.CSSProperties}>
          Every tool is built for the entry.
          <br />
          <span className="text-primary text-glow">Entry is a race you cannot win.</span>
        </h1>

        <p className="enter mt-7 max-w-2xl text-[17px] leading-relaxed text-muted-foreground" style={{ '--reveal-delay': '150ms' } as React.CSSProperties}>
          Median hold time on a Solana memecoin is about 100 seconds. Co-located bots are ahead of you
          by 400 milliseconds, and roughly 87% of same-block snipes are already green before you have
          seen the ticker. You are not going to out-enter them.
        </p>

        <p className="enter mt-4 max-w-2xl text-[17px] leading-relaxed text-foreground/90" style={{ '--reveal-delay': '210ms' } as React.CSSProperties}>
          But the exit is not a race. It is a decision — and it is where retail actually bleeds out.
          Around half of pump.fun wallets finish a month down, and 96% end flat or worse. Not because
          they picked wrong. Because they sold the 40× at 2× and held the rug to zero.
        </p>

        <p className="enter mt-7 max-w-2xl font-display text-[1.4rem] font-semibold leading-snug tracking-tight" style={{ '--reveal-delay': '270ms' } as React.CSSProperties}>
          mEEme.xyz is the only tool built entirely for the second half of the trade.
        </p>

        <div className="enter mt-9 flex flex-wrap gap-3" style={{ '--reveal-delay': '330ms' } as React.CSSProperties}>
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
          A memecoin&rsquo;s next move is not in the candles. It is in the unrealized PnL of the people
          already holding it.
        </h3>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <Pillar
            delay={0}
            glyph={<CoiledGlyph />}
            tone="coil"
            title="Coiled supply"
            body="Every holder cheaper than you is a coiled spring pointed at your exit — weighted by how far up they are and whether they have already started selling. A wallet up 50× is a nuclear seller. A wallet up 1.1× is inert."
          />
          <Pillar
            delay={80}
            glyph={<TrappedGlyph />}
            tone="trap"
            title="Trapped supply"
            body="Every holder more expensive than you is a bag that will not sell into weakness. That is structure, not risk — and it is why a token 'can't break' a level. That level is where 8% of supply gets whole."
          />
          <Pillar
            delay={160}
            glyph={<InsiderGlyph />}
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
      </Reveal>

      {/* ── Why it is unfair ──────────────────────────────────────────────── */}
      <Reveal as="section">
        <h2 className="eyebrow">
          why this is unfair
        </h2>
        <dl className="mt-7 grid gap-7 md:grid-cols-3">
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
      </Reveal>

      {/* ── Honesty ───────────────────────────────────────────────────────── */}
      <Reveal as="section" className="hud-panel lift glint border-primary/30 bg-primary/[0.05] p-8 sm:p-10">
        <h2 className="text-[1.85rem] font-bold leading-tight tracking-[-0.03em]">
          Every call is public. Including the bad ones.
        </h2>
        <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
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
      </Reveal>

      <Reveal as="section" className="relative text-center">
        {/* The mark as punctuation: the page closes on the shape it opened with. */}
        <div aria-hidden="true" className="supply-rule mx-auto mb-10 max-w-xs" />
        <h2 className="text-[2.1rem] font-bold leading-tight tracking-[-0.03em] sm:text-[2.5rem]">
          Point it at a bag you already hold.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          Three free locks a day, no account needed, ladder included. If the read is wrong you will
          know within the hour — and so will everyone else.
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
