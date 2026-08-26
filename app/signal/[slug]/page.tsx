import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CoilGauge } from '@/components/cockpit/coil-gauge';
import { VerdictBanner } from '@/components/cockpit/verdict-banner';
import { prisma } from '@/lib/db';
import type { ExitLadder, Verdict } from '@/lib/engine/types';
import { VERDICT_META } from '@/lib/engine/verdict';
import { ShareOnX } from '@/components/share-on-x';
import { canonical } from '@/lib/seo';
import { formatPct, formatPrice, shortAddress } from '@/lib/utils';

export const dynamic = 'force-dynamic';

async function loadSignal(slug: string) {
  try {
    return await prisma.signal.findUnique({
      where: { shareSlug: slug },
      include: { outcome: true },
    });
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const signal = await loadSignal(params.slug);
  if (!signal) return { title: 'Signal not found' };

  const label = VERDICT_META[signal.verdict as Verdict]?.label ?? signal.verdict;
  const title = `${label} · $${signal.symbol}`;
  return {
    title,
    description: signal.headline,
    alternates: { canonical: canonical(`/signal/${params.slug}`) },
    openGraph: {
      title,
      description: signal.headline,
      type: 'article',
      url: canonical(`/signal/${params.slug}`),
    },
    twitter: { card: 'summary_large_image', title, description: signal.headline },
  };
}

export default async function SignalPage({ params }: { params: { slug: string } }) {
  const signal = await loadSignal(params.slug);
  if (!signal) notFound();

  let reasoning: string[] = [];
  let ladder: ExitLadder | null = null;
  try {
    reasoning = JSON.parse(signal.reasoningJson) as string[];
    ladder = signal.ladderJson ? (JSON.parse(signal.ladderJson) as ExitLadder) : null;
  } catch {
    // A malformed archive should still render the call itself.
  }

  const outcome = signal.outcome;

  return (
    <div className="space-y-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">${signal.symbol}</h1>
          <p className="font-mono text-xs text-muted-foreground">
            {shortAddress(signal.tokenAddress, 8)} · called {signal.createdAt.toLocaleString()}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/lock?address=${signal.tokenAddress}`}>Re-read this now</Link>
        </Button>
      </header>

      <VerdictBanner
        verdict={signal.verdict as Verdict}
        conviction={signal.conviction}
        headline={signal.headline}
        halfLifeMinutes={signal.halfLifeMin}
      />

      {outcome && outcome.grade !== 'pending' && (
        <div className="hud-panel flex flex-wrap items-center gap-4 p-5">
          <span className="hud-label">what happened</span>
          <Badge variant={outcome.grade === 'correct' ? 'default' : outcome.grade === 'incorrect' ? 'danger' : 'muted'}>
            {outcome.grade}
          </Badge>
          <span className="tnum font-mono text-sm">
            {formatPrice(signal.priceAtSignal)} → {formatPrice(outcome.price4h)}
          </span>
          {outcome.edgePct !== null && (
            <span
              className={`tnum font-mono text-sm font-semibold ${outcome.edgePct >= 0 ? 'text-primary' : 'text-destructive'}`}
            >
              {outcome.edgePct >= 0 ? '+' : ''}
              {(outcome.edgePct * 100).toFixed(1)}% edge
            </span>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="hud-panel p-5">
          <h2 className="hud-label mb-3">the reasoning, as recorded at the time</h2>
          <ul className="space-y-2.5">
            {reasoning.map((line, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/70" />
                <span className="text-foreground/85">{line}</span>
              </li>
            ))}
          </ul>

          {ladder && (
            <div className="mt-5 border-t border-border/60 pt-4">
              <h3 className="hud-label mb-2">ladder given</h3>
              <p className="text-sm text-muted-foreground">{ladder.summary}</p>
            </div>
          )}
        </section>

        <aside className="hud-panel flex flex-col items-center p-5">
          <CoilGauge score={signal.coilScore} confidence={signal.confidence} size={150} />
          <dl className="mt-4 w-full space-y-1.5 text-xs">
            <Row label="coiled" value={formatPct(signal.coiledSupply)} />
            <Row label="trapped" value={formatPct(signal.trappedSupply)} />
            <Row label="insider coil" value={formatPct(signal.insiderCoil)} />
            <Row label="insider sold" value={formatPct(signal.insiderRealized)} />
            <Row label="realization" value={signal.velocityOfRealization.toFixed(2)} />
            <Row label="price at call" value={formatPrice(signal.priceAtSignal)} />
          </dl>
        </aside>
      </div>

      <div className="flex flex-col items-center gap-4">
        <ShareOnX
          text={`${VERDICT_META[signal.verdict as Verdict]?.label ?? signal.verdict} on $${signal.symbol} — read by mEEme.xyz`}
          url={canonical(`/signal/${params.slug}`)}
          label="Share this call"
        />
        <p className="text-center text-sm text-muted-foreground">
          This call is in the{' '}
          <Link href="/track-record" className="text-primary underline-offset-4 hover:underline">
            public ledger
          </Link>{' '}
          whether it aged well or not.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tnum font-mono text-foreground/85">{value}</dd>
    </div>
  );
}
