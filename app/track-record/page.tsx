import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { prisma } from '@/lib/db';
import type { Verdict } from '@/lib/engine/types';
import { VERDICT_META } from '@/lib/engine/verdict';
import { summarize, SCORING_VERSION } from '@/lib/scoring';
import { formatPrice, shortAddress } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Track Record',
  description: 'Every call mEEme has made, graded by a rule fixed in code before the call was made.',
};

// Public, session-independent data that only changes via the cron jobs
// (sweep every 5 min, score hourly, scan every 30 min), so there is no
// reason for every page view to run its own 200-row query against Postgres.
export const revalidate = 60;

export default async function TrackRecordPage() {
  let rows: {
    id: string;
    symbol: string;
    tokenAddress: string;
    verdict: string;
    coilScore: number;
    confidence: number;
    priceAtSignal: number;
    createdAt: Date;
    shareSlug: string;
    outcome: { grade: string; edgePct: number | null; price4h: number | null } | null;
  }[] = [];

  let dbAvailable = true;
  try {
    rows = await prisma.signal.findMany({
      where: { synthetic: false },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        symbol: true,
        tokenAddress: true,
        verdict: true,
        coilScore: true,
        confidence: true,
        priceAtSignal: true,
        createdAt: true,
        shareSlug: true,
        outcome: { select: { grade: true, edgePct: true, price4h: true } },
      },
    });
  } catch {
    dbAvailable = false;
  }

  const stats = summarize(
    rows.map((r) => ({ grade: r.outcome?.grade ?? 'pending', edgePct: r.outcome?.edgePct ?? null })),
  );

  return (
    <div className="space-y-8 py-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Track record</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Every non-demo call mEEme has made, in order, with what happened next. The grading rule
          lives in <code className="rounded bg-secondary px-1">lib/scoring.ts</code> (v{SCORING_VERSION}),
          is versioned in git, and runs automatically four hours after each call — so it cannot be
          retuned once the results are in.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="accuracy"
          value={stats.accuracy === null ? '—' : `${(stats.accuracy * 100).toFixed(0)}%`}
          sub={`${stats.correct} right · ${stats.incorrect} wrong`}
        />
        <StatCard
          label="average edge"
          value={stats.averageEdgePct === null ? '—' : `${(stats.averageEdgePct * 100).toFixed(1)}%`}
          sub="mean signed return per graded call"
        />
        <StatCard label="graded" value={String(stats.correct + stats.incorrect)} sub={`${stats.neutral} landed in the noise`} />
        <StatCard label="pending" value={String(stats.pending)} sub="inside the 4h horizon" />
      </section>

      <section className="rounded-lg border border-border/70 bg-card/40 p-5">
        <h2 className="hud-label mb-2">how a call is graded</h2>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li>
            <span className="text-foreground/85">Exit calls</span> (EXIT IMMEDIATELY, SCALE OUT, NO
            TOUCH) are right when price fell 10%+ by the horizon, and wrong when it ran 15%+ without
            you.
          </li>
          <li>
            <span className="text-foreground/85">Entry calls</span> (APEX ENTRY, SCALE IN) are right
            when price rose 10%+, wrong when it fell 10%+.
          </li>
          <li>
            <span className="text-foreground/85">ARM EXIT</span> is vindicated by the drawdown it
            warned about, even if price later recovered — that is what a warning is for.
          </li>
          <li>
            Anything that moved less than that is <span className="text-foreground/85">neutral</span>{' '}
            and excluded from accuracy. It is not counted as a win.
          </li>
        </ul>
      </section>

      {!dbAvailable ? (
        <p className="rounded-lg border border-warn/40 bg-warn/[0.06] px-4 py-3 text-sm text-warn">
          The database is not reachable, so no ledger can be shown. Check{' '}
          <code className="rounded bg-black/30 px-1">/api/diagnostics</code>.
        </p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No calls recorded yet. Run a Target Lock against a real contract and it will appear here —
            graded, win or lose.
          </p>
          <Link href="/lock" className="mt-3 inline-block text-sm text-primary underline-offset-4 hover:underline">
            Open the cockpit →
          </Link>
        </div>
      ) : (
        <section className="hud-panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left">
                <th className="px-4 py-2.5 hud-label font-normal">when</th>
                <th className="px-3 py-2.5 hud-label font-normal">token</th>
                <th className="px-3 py-2.5 hud-label font-normal">call</th>
                <th className="px-3 py-2.5 hud-label font-normal">coil</th>
                <th className="px-3 py-2.5 hud-label font-normal">price then</th>
                <th className="px-3 py-2.5 hud-label font-normal">price after</th>
                <th className="px-4 py-2.5 hud-label font-normal">result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rows.map((r) => {
                const grade = r.outcome?.grade ?? 'pending';
                return (
                  <tr key={r.id} className="hover:bg-secondary/25">
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-[11px] text-muted-foreground">
                      {r.createdAt.toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/lock?address=${r.tokenAddress}`}
                        className="font-semibold hover:text-primary"
                      >
                        ${r.symbol}
                      </Link>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {shortAddress(r.tokenAddress)}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-[11px]">
                        {VERDICT_META[r.verdict as Verdict]?.label ?? r.verdict}
                      </span>
                    </td>
                    <td className="tnum px-3 py-2 font-mono text-xs">{r.coilScore.toFixed(2)}</td>
                    <td className="tnum px-3 py-2 font-mono text-xs">{formatPrice(r.priceAtSignal)}</td>
                    <td className="tnum px-3 py-2 font-mono text-xs">
                      {r.outcome?.price4h ? formatPrice(r.outcome.price4h) : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <GradeBadge grade={grade} edge={r.outcome?.edgePct ?? null} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="hud-panel p-4">
      <div className="hud-label">{label}</div>
      <div className="tnum mt-1 text-3xl font-bold">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function GradeBadge({ grade, edge }: { grade: string; edge: number | null }) {
  const variant =
    grade === 'correct' ? 'default' : grade === 'incorrect' ? 'danger' : grade === 'neutral' ? 'muted' : 'muted';
  return (
    <span className="flex items-center gap-2">
      <Badge variant={variant}>{grade}</Badge>
      {edge !== null && grade !== 'pending' && (
        <span className={`tnum font-mono text-xs ${edge >= 0 ? 'text-primary' : 'text-destructive'}`}>
          {edge >= 0 ? '+' : ''}
          {(edge * 100).toFixed(1)}%
        </span>
      )}
    </span>
  );
}
