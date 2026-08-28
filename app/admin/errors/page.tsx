import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminNav } from '@/components/admin-nav';
import { Badge } from '@/components/ui/badge';
import { isAdmin } from '@/lib/admin';
import { getViewer } from '@/lib/auth';
import { listErrorsForAdmin } from '@/lib/errors-admin';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Errors', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** Anything seen in this window is treated as still happening. */
const ACTIVE_WINDOW_MS = 60 * 60_000;

function ago(iso: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default async function AdminErrorsPage() {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) redirect('/');

  const errors = await listErrorsForAdmin();
  const now = Date.now();
  const open = errors.filter((e) => !e.resolvedAt);
  const active = open.filter((e) => now - Date.parse(e.lastSeenAt) < ACTIVE_WINDOW_MS);
  const totalOccurrences = open.reduce((sum, e) => sum + e.count, 0);

  return (
    <div className="py-8">
      <p className="eyebrow text-primary/70">admin</p>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">Errors</h1>
      <AdminNav active="errors" />

      <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Faults the app caught, deduplicated by shape and counted rather than listed one per
        occurrence — so something failing in a loop is one row with a large number, not a table that
        grows until it becomes the outage. Ids, hashes and numbers are stripped before grouping, so
        the same failure against a thousand different tokens reads as one problem.
      </p>

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="active" value={String(active.length)} sub="seen in the last hour" tone={active.length ? 'bad' : 'good'} />
        <Stat label="open" value={String(open.length)} sub="distinct, unresolved" />
        <Stat label="occurrences" value={totalOccurrences.toLocaleString('en-US')} sub="across all open faults" />
      </section>

      {errors.length === 0 ? (
        <p className="mt-8 rounded-lg border border-dashed border-border/70 px-5 py-10 text-center text-sm text-muted-foreground">
          Nothing recorded. Either everything is fine, or nothing has run yet — the crons report
          here, so an empty list after a few sweeps is the good outcome.
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {errors.map((e) => {
            const isActive = !e.resolvedAt && now - Date.parse(e.lastSeenAt) < ACTIVE_WINDOW_MS;
            return (
              <li
                key={e.id}
                className={cn(
                  'rounded-lg border p-4',
                  isActive ? 'border-destructive/40 bg-destructive/[0.04]' : 'border-border/70 bg-card/40',
                )}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <code className="font-mono text-[11px] uppercase tracking-wider text-primary">
                    {e.scope}
                  </code>
                  {isActive && <Badge variant="danger" className="text-[10px]">active</Badge>}
                  {e.resolvedAt && <Badge variant="muted" className="text-[10px]">resolved</Badge>}
                  <span className="tnum ml-auto font-mono text-xs text-muted-foreground">
                    ×{e.count.toLocaleString('en-US')} · last {ago(e.lastSeenAt, now)} · first{' '}
                    {ago(e.firstSeenAt, now)}
                  </span>
                </div>

                <p className="mt-2 break-words font-mono text-[13px] leading-relaxed text-foreground">
                  {e.message}
                </p>

                {e.context && (
                  <p className="mt-1.5 break-all font-mono text-[11px] text-muted-foreground">
                    {e.context}
                  </p>
                )}

                {e.stack && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                      stack
                    </summary>
                    <pre className="mt-2 max-h-64 overflow-auto rounded border border-border/60 bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                      {e.stack}
                    </pre>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
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
  sub: string;
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
      <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}
