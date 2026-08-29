import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminNav } from '@/components/admin-nav';
import { isAdmin } from '@/lib/admin';
import { loadAdminAnalytics } from '@/lib/analytics-admin';
import { getViewer } from '@/lib/auth';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Analytics', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const pct = (n: number | null) => (n === null ? '—' : `${(n * 100).toFixed(0)}%`);

/**
 * Verdict tone -> the app's own status palette (VERDICT_META), not a new one.
 * Reusing it here is what keeps a verdict the same colour on this page as it
 * is on the cockpit and the track record — the whole reason a status palette
 * gets reserved in the first place.
 *
 * Checked against a categorical-palette validator: primary ("apex"/"good")
 * and hud ("neutral") sit closer than the normal-vision floor (ΔE 9.6 of a
 * 15 target) — color alone cannot reliably separate those two rows. That is
 * an app-wide choice already shipped everywhere this tone set is used, not
 * something to re-pick from this one page, so every row here also carries a
 * full text label and count rather than depending on the bar colour at all.
 */
const TONE_BAR: Record<string, string> = {
  apex: 'bg-primary',
  good: 'bg-primary',
  neutral: 'bg-hud',
  warn: 'bg-warn',
  danger: 'bg-destructive',
};
const TONE_TEXT: Record<string, string> = {
  apex: 'text-primary',
  good: 'text-primary',
  neutral: 'text-hud',
  warn: 'text-warn',
  danger: 'text-destructive',
};

export default async function AdminAnalyticsPage() {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) redirect('/');

  const a = await loadAdminAnalytics();
  const maxVerdictCount = Math.max(1, ...a.engine.byVerdict.map((v) => v.count));
  const maxTrend = Math.max(1, ...a.signupTrend.map((d) => d.count));
  const decidedTotal = a.trackRecord.correct + a.trackRecord.incorrect + a.trackRecord.neutral;
  const maxLocks = Math.max(1, ...a.locksTrend.map((d) => d.signedIn + d.anon));
  const totalReferred = a.referralSources.filter((r) => r.code !== null).reduce((sum, r) => sum + r.count, 0);
  const totalDirect = a.referralSources.find((r) => r.code === null)?.count ?? 0;

  return (
    <div className="py-8">
      <p className="eyebrow text-primary/70">admin</p>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">Analytics</h1>
      <AdminNav active="analytics" />
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Computed fresh on every load, not pre-aggregated — this page is opened a handful of times a
        day, so an honest number beats a cached one.
      </p>

      {/* ── Headline ─────────────────────────────────────────────────────── */}
      <section className="mt-6 grid gap-3 sm:grid-cols-4">
        <Stat label="users" value={a.users.total.toLocaleString('en-US')} sub={`+${a.users.newLast7d} last 7d`} />
        <Stat
          label="mrr"
          value={usd(a.revenue.mrrUsd)}
          sub={`${a.revenue.activeSubscriptions} active subscription${a.revenue.activeSubscriptions === 1 ? '' : 's'}`}
          tone="good"
        />
        <Stat label="signals, 7d" value={a.engine.last7d.toLocaleString('en-US')} sub={`${a.engine.last24h} in the last 24h`} />
        <Stat
          label="track record"
          value={pct(a.trackRecord.accuracy)}
          sub={`${a.trackRecord.correct + a.trackRecord.incorrect} graded, ${a.trackRecord.pending} pending`}
          tone={a.trackRecord.accuracy !== null && a.trackRecord.accuracy < 0.4 ? 'bad' : undefined}
        />
      </section>

      {/* ── Growth ───────────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="eyebrow">growth</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="hud-panel p-5">
            <div className="flex items-baseline justify-between">
              <span className="hud-label">signups, last 14 days</span>
              <span className="tnum font-mono text-[11px] text-muted-foreground">
                {a.users.newLast30d} in 30d · {a.users.referredTotal} ever referred
              </span>
            </div>
            {/*
              `items-stretch` (the flex default) is load-bearing here: each
              bar's height is a percentage, and a percentage height only
              resolves against a *definite* parent height. `items-end` looks
              like the right call for a baseline-aligned bar chart, but it
              leaves each flex-item's own height at auto — so the percentage
              inside has nothing to resolve against and collapses to 0,
              silently, with the right data still sitting in the DOM. The
              bottom alignment comes from `justify-end` on each bar's own
              flex-column wrapper instead.
            */}
            <div className="mt-4 flex h-28 items-stretch gap-1.5" role="img" aria-label="Daily signups over the last 14 days">
              {a.signupTrend.map((d) => (
                <div
                  key={d.day}
                  className="group relative flex flex-1 flex-col justify-end"
                  title={`${d.day}: ${d.count} signup${d.count === 1 ? '' : 's'}`}
                >
                  <div
                    className={cn(
                      'grow-bar w-full origin-bottom rounded-t-sm bg-primary/70 transition-colors group-hover:bg-primary',
                      d.count === 0 && 'bg-border',
                    )}
                    style={{ height: `${Math.max(3, (d.count / maxTrend) * 100)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground/70">
              <span>{a.signupTrend[0]?.day}</span>
              <span>{a.signupTrend[a.signupTrend.length - 1]?.day}</span>
            </div>
          </div>

          <div className="hud-panel p-5">
            <span className="hud-label">by tier</span>
            <ul className="mt-3 space-y-3">
              <TierRow label="Free" count={a.users.byTier.FREE} total={a.users.total} opacity={0.25} />
              <TierRow label="Degen" count={a.users.byTier.DEGEN} total={a.users.total} opacity={0.6} />
              <TierRow label="Apex" count={a.users.byTier.APEX} total={a.users.total} opacity={1} />
            </ul>
            <p className="mt-4 border-t border-border/60 pt-3 text-[12px] text-muted-foreground">
              {a.users.activeTrials} on an active promo trial right now.
            </p>
          </div>
        </div>
      </section>

      {/* ── Engine ───────────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="eyebrow">engine, last 7 days</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="hud-panel p-5">
            <span className="hud-label">calls by verdict</span>
            {a.engine.byVerdict.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No signals in the last 7 days.</p>
            ) : (
              <ul className="mt-4 space-y-2.5">
                {a.engine.byVerdict.map((v) => (
                  <li key={v.verdict} className="flex items-center gap-3">
                    <span className={cn('w-40 shrink-0 truncate font-mono text-[12px]', TONE_TEXT[v.tone])}>
                      {v.label}
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-secondary/60">
                      <span
                        className={cn('grow-bar block h-full origin-left rounded-full', TONE_BAR[v.tone])}
                        style={{ width: `${Math.max(4, (v.count / maxVerdictCount) * 100)}%` }}
                      />
                    </span>
                    <span className="tnum w-10 shrink-0 text-right font-mono text-[12px] text-muted-foreground">
                      {v.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="hud-panel p-5">
            <span className="hud-label">track record, all time</span>
            <ul className="mt-3 space-y-2 text-[13px]">
              <GradeRow label="Correct" count={a.trackRecord.correct} total={decidedTotal} className="text-primary" />
              <GradeRow label="Incorrect" count={a.trackRecord.incorrect} total={decidedTotal} className="text-destructive" />
              <GradeRow label="Neutral" count={a.trackRecord.neutral} total={decidedTotal} className="text-hud" />
            </ul>
            <p className="mt-3 border-t border-border/60 pt-3 text-[12px] text-muted-foreground">
              {a.trackRecord.pending.toLocaleString('en-US')} calls still awaiting the 4-hour grading window.
            </p>
          </div>
        </div>
      </section>

      {/* ── Traffic ──────────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="eyebrow">traffic, last 14 days</h2>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          Every other number on this page counts someone only after they make an account. A visitor
          who pastes a contract and leaves is invisible to all of it — this is the one signal that
          catches them. It uses the free-tier rate limiter, already keyed to an hourly-salted IP hash
          rather than a cookie, so it costs nothing extra and adds no tracking beyond what the site&rsquo;s
          own cookie policy already discloses.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="hud-panel p-5">
            <div className="flex items-baseline justify-between">
              <span className="hud-label">locks per day</span>
              <span className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary" /> signed in
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary/30" /> anonymous
                </span>
              </span>
            </div>
            <div className="mt-4 flex h-28 items-stretch gap-1.5" role="img" aria-label="Locks per day, signed-in versus anonymous, over the last 14 days">
              {a.locksTrend.map((d) => {
                const total = d.signedIn + d.anon;
                return (
                  <div
                    key={d.day}
                    className="group relative flex flex-1 flex-col-reverse"
                    title={`${d.day}: ${d.signedIn} signed in, ${d.anon} anonymous (${d.uniqueAnonVisitors} unique visitor${d.uniqueAnonVisitors === 1 ? '' : 's'})`}
                  >
                    <div
                      className={cn('grow-bar w-full origin-bottom bg-primary/30', total === 0 && 'bg-border')}
                      style={{ height: `${Math.max(total === 0 ? 3 : 0, (d.anon / maxLocks) * 100)}%` }}
                    />
                    <div
                      className="grow-bar w-full origin-bottom rounded-t-sm bg-primary transition-colors group-hover:bg-primary/80"
                      style={{ height: `${(d.signedIn / maxLocks) * 100}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground/70">
              <span>{a.locksTrend[0]?.day}</span>
              <span>{a.locksTrend[a.locksTrend.length - 1]?.day}</span>
            </div>
          </div>

          <div className="hud-panel p-5">
            <span className="hud-label">signups by source</span>
            {a.referralSources.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No users yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {a.referralSources.slice(0, 6).map((r) => (
                  <li key={r.code ?? 'direct'} className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-mono text-[12px]">
                      {r.code ?? <span className="text-muted-foreground">direct / no code</span>}
                    </span>
                    <span className="tnum shrink-0 font-mono text-[12px] text-muted-foreground">{r.count}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 border-t border-border/60 pt-3 text-[12px] text-muted-foreground">
              {totalReferred} via a referral code, {totalDirect} direct — this is how you tell whether a
              specific post or affiliate link actually converted, not just whether the app got a visit.
            </p>
          </div>
        </div>
      </section>

      {/* ── Usage today ──────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="eyebrow">usage, today (utc)</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="locks, signed in" value={a.usage.locksToday.toLocaleString('en-US')} />
          <Stat label="locks, anonymous" value={a.usage.anonLocksToday.toLocaleString('en-US')} />
          <Stat label="open positions" value={a.usage.openPositions.toLocaleString('en-US')} />
          <Stat label="active watches" value={a.usage.activeWatches.toLocaleString('en-US')} />
        </div>
        <p className="mt-3 text-[12px] text-muted-foreground">
          {a.usage.alertsToday.toLocaleString('en-US')} alerts fired in the last 24h
          {a.usage.alertsFailedToday > 0 && (
            <>
              , <span className="text-destructive">{a.usage.alertsFailedToday} still undelivered</span>
            </>
          )}
          .
        </p>
      </section>

      {/* ── Elsewhere in admin ───────────────────────────────────────────── */}
      <section className="mt-10 grid gap-3 sm:grid-cols-3">
        <LinkStat
          href="/admin/errors"
          label="open faults"
          value={a.links.openErrors.toLocaleString('en-US')}
          tone={a.links.openErrors > 0 ? 'bad' : 'good'}
        />
        <LinkStat href="/admin/affiliates" label="active affiliates" value={a.links.activeAffiliates.toLocaleString('en-US')} />
        <LinkStat href="/admin/affiliates" label="commission owed" value={usd(a.links.unpaidCommissionUsd)} />
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-card/40 p-4">
      <div className="hud-label">{label}</div>
      <div
        className={cn(
          'tnum mt-1 font-mono text-2xl font-semibold',
          tone === 'bad' && 'text-destructive',
          tone === 'good' && 'text-primary',
        )}
      >
        {value}
      </div>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function LinkStat({
  href,
  label,
  value,
  tone,
}: {
  href: string;
  label: string;
  value: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <Link href={href} className="lift group block rounded-lg border border-border/70 bg-card/40 p-4">
      <div className="hud-label">{label}</div>
      <div
        className={cn(
          'tnum mt-1 font-mono text-2xl font-semibold',
          tone === 'bad' && 'text-destructive',
          tone === 'good' && 'text-primary',
        )}
      >
        {value}
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground underline-offset-2 group-hover:underline">view &rarr;</p>
    </Link>
  );
}

function TierRow({
  label,
  count,
  total,
  opacity,
}: {
  label: string;
  count: number;
  total: number;
  opacity: number;
}) {
  const share = total > 0 ? count / total : 0;
  return (
    <li>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[12px]">{label}</span>
        <span className="tnum font-mono text-[12px] text-muted-foreground">
          {count.toLocaleString('en-US')} · {(share * 100).toFixed(0)}%
        </span>
      </div>
      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-secondary/60">
        <span
          className="grow-bar block h-full origin-left rounded-full bg-primary"
          style={{ width: `${Math.max(2, share * 100)}%`, opacity }}
        />
      </span>
    </li>
  );
}

function GradeRow({
  label,
  count,
  total,
  className,
}: {
  label: string;
  count: number;
  total: number;
  className: string;
}) {
  const share = total > 0 ? count / total : 0;
  return (
    <li className="flex items-center justify-between">
      <span className={className}>{label}</span>
      <span className="tnum font-mono text-muted-foreground">
        {count.toLocaleString('en-US')} ({(share * 100).toFixed(0)}%)
      </span>
    </li>
  );
}
