'use client';

import { Loader2, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Counts {
  total: number;
  graded: number;
  correct: number;
}

const CONFIRMATION_PHRASE = 'DELETE ALL TRACK RECORD';

export function AdminTrackRecordPanel({ initialCounts }: { initialCounts: Counts }) {
  const [counts, setCounts] = React.useState<Counts | null>(initialCounts);
  const [typed, setTyped] = React.useState('');
  const [purging, setPurging] = React.useState(false);
  const [done, setDone] = React.useState<number | null>(null);

  const matches = typed === CONFIRMATION_PHRASE;

  const purge = async () => {
    if (!matches) return;
    setPurging(true);
    try {
      const res = await fetch('/api/admin/track-record', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: typed }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string; deleted?: number };
      if (!json.ok) {
        toast.error(json.error ?? 'Could not purge the track record.');
        return;
      }
      setDone(json.deleted ?? 0);
      setCounts(null);
      toast.success(`Deleted ${json.deleted ?? 0} calls. This cannot be undone.`);
    } catch {
      toast.error('Could not reach the server.');
    } finally {
      setPurging(false);
    }
  };

  if (done !== null) {
    return (
      <div className="hud-panel border-l-2 border-l-destructive p-6">
        <h3 className="section-title !text-destructive">Track record cleared</h3>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {done} calls were permanently deleted. /track-record, the homepage headline, and the
          public API will show an empty ledger until new calls are made and graded.
        </p>
      </div>
    );
  }

  return (
    <div className="hud-panel border-l-2 border-l-destructive p-6">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 className="section-title !text-destructive">Erase the entire public track record</h3>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {counts ? (
              <>
                Permanently deletes all <strong className="text-foreground">{counts.total}</strong>{' '}
                published calls — <strong className="text-foreground">{counts.graded}</strong> of them
                already graded, <strong className="text-foreground">{counts.correct}</strong> of those
                correct. This is every call this deployment has ever made, wins and losses both, on
                <code className="mx-1 rounded bg-black/20 px-1">/track-record</code>
                and the homepage. There is no undo, no soft delete, no backup taken here.
              </>
            ) : (
              'Counts unavailable.'
            )}
          </p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Type <strong className="font-mono text-foreground">{CONFIRMATION_PHRASE}</strong> below to
            enable the button.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={CONFIRMATION_PHRASE}
              className="max-w-sm font-mono text-sm"
              disabled={purging || !counts}
            />
            <Button
              variant="destructive"
              disabled={!matches || purging || !counts}
              onClick={() => void purge()}
            >
              {purging && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete everything, permanently
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
