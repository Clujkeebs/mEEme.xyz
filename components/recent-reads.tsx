import Link from 'next/link';
import { VERDICT_META } from '@/lib/engine/verdict';
import type { Verdict } from '@/lib/engine/types';
import { cn } from '@/lib/utils';

/**
 * The last handful of public reads, under the lock form.
 *
 * The Target Lock page's resting state was a form and then a screen and a
 * half of empty background before the footer — which is the state a first-time
 * visitor lands in, and it reads as an app with nothing in it. This fills that
 * space with the product actually working: real verdicts on real tokens,
 * each one linking to the full read.
 *
 * Demo reads are excluded, as everywhere else. A wall of synthetic calls
 * dressed up as activity would be the exact dishonesty the track record page
 * exists to avoid.
 */

export interface RecentRead {
  slug: string;
  symbol: string;
  verdict: string;
  coilScore: number;
  createdAt: Date;
}

/*
 * Both halves are written out in full rather than derived from one another.
 * Tailwind resolves classes by scanning source text, so a name built at
 * runtime — `tone.replace('text-', 'bg-')` — is never emitted into the
 * stylesheet and silently renders as no colour at all.
 */
const TONE_TEXT = {
  apex: 'text-primary',
  good: 'text-primary',
  neutral: 'text-hud',
  warn: 'text-warn',
  danger: 'text-destructive',
} as const;

const TONE_FILL = {
  apex: 'bg-primary',
  good: 'bg-primary',
  neutral: 'bg-hud',
  warn: 'bg-warn',
  danger: 'bg-destructive',
} as const;

function ago(then: Date, now: number): string {
  const minutes = Math.max(0, Math.floor((now - then.getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function RecentReads({ reads }: { reads: RecentRead[] }) {
  if (reads.length === 0) return null;
  const now = Date.now();

  return (
    <section aria-labelledby="recent-reads-heading">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="recent-reads-heading" className="eyebrow">
          last reads
        </h2>
        <Link
          href="/track-record"
          className="font-mono text-[11px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          every call, graded &rarr;
        </Link>
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {reads.map((read, i) => {
          const meta = VERDICT_META[read.verdict as Verdict];
          const label = meta?.label ?? read.verdict;
          const tone = meta ? TONE_TEXT[meta.tone] : 'text-muted-foreground';
          const fill = meta ? TONE_FILL[meta.tone] : 'bg-muted-foreground';
          return (
            <li key={read.slug}>
              <Link
                href={`/signal/${read.slug}`}
                className="hud-panel lift glint enter flex items-center gap-3 px-4 py-3"
                style={{ '--reveal-delay': `${Math.min(i * 60, 360)}ms` } as React.CSSProperties}
              >
                {/* The coil, as a bar rather than a second number to read.
                    It fills from the bottom, the way a gauge does — a meter
                    that fills downward reads as draining, which is the
                    opposite of what a rising threat score means. */}
                <span
                  aria-hidden="true"
                  className="flex h-8 w-1 shrink-0 items-end overflow-hidden rounded-full bg-border"
                >
                  <span
                    className={cn('block w-full rounded-full', fill)}
                    style={{ height: `${Math.max(8, Math.min(100, read.coilScore * 100))}%` }}
                  />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[13px] font-medium">
                    ${read.symbol}
                  </span>
                  <span className={cn('block truncate text-[12px]', tone)}>{label}</span>
                </span>

                <span className="tnum shrink-0 font-mono text-[11px] text-muted-foreground">
                  {ago(read.createdAt, now)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
