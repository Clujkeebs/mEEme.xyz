'use client';

import { Copy, KeyRound, Loader2, Trash2 } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  callsToday: number;
}

export function ApiKeys({ available, dailyLimit }: { available: boolean; dailyLimit: number }) {
  const [keys, setKeys] = React.useState<KeyRow[] | null>(null);
  const [name, setName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [justIssued, setJustIssued] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch('/api/keys');
      const json = (await res.json()) as { ok: boolean; keys?: KeyRow[] };
      if (json.ok && json.keys) setKeys(json.keys);
    } catch {
      /* the panel is not worth a toast if it fails to load */
    }
  }, []);

  React.useEffect(() => {
    if (available) void load();
  }, [available, load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || 'default' }),
      });
      const json = (await res.json()) as
        | { ok: true; key: { secret: string } }
        | { ok: false; error: string };
      if (!json.ok) {
        toast.error(json.error);
        return;
      }
      setJustIssued(json.key.secret);
      setName('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    try {
      await fetch(`/api/keys?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      toast.success('Key revoked.');
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!available) {
    return (
      <div className="hud-panel p-5">
        <h2 className="hud-label mb-2 flex items-center gap-2">
          <KeyRound className="h-3 w-3" /> api access
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Point your own bot at the engine.{' '}
          <Link href="/pricing" className="text-primary underline-offset-4 hover:underline">
            Apex
          </Link>{' '}
          includes {dailyLimit.toLocaleString('en-US')} calls a day.
        </p>
      </div>
    );
  }

  return (
    <div className="hud-panel space-y-3 p-5">
      <h2 className="hud-label flex items-center gap-2">
        <KeyRound className="h-3 w-3" /> api keys
      </h2>

      {justIssued && (
        <div className="rounded border border-primary/45 bg-primary/[0.07] p-3">
          <p className="mb-2 text-[11px] font-medium text-primary">
            Copy this now. It is stored only as a hash and cannot be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-background/60 px-2 py-1.5 font-mono text-[11px]">
              {justIssued}
            </code>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                void navigator.clipboard.writeText(justIssued);
                toast.success('Copied.');
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <button
            type="button"
            onClick={() => setJustIssued(null)}
            className="mt-2 text-[11px] text-muted-foreground underline-offset-4 hover:underline"
          >
            I have saved it
          </button>
        </div>
      )}

      {keys && keys.length > 0 && (
        <ul className="space-y-1.5">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center gap-3 rounded border border-border/70 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{k.name}</div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {k.prefix}… · {k.callsToday}/{dailyLimit.toLocaleString('en-US')} today
                  {k.lastUsedAt ? ` · last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : ' · never used'}
                </div>
              </div>
              <Button size="icon" variant="ghost" disabled={busy} onClick={() => void revoke(k.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={create} className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Key name (e.g. sniper-bot)"
          className="flex-1 text-xs"
          maxLength={60}
        />
        <Button type="submit" size="sm" disabled={busy}>
          {busy && <Loader2 className="h-3 w-3 animate-spin" />} Create
        </Button>
      </form>

      <details className="text-[11px] text-muted-foreground">
        <summary className="cursor-pointer hover:text-foreground">How to call it</summary>
        <pre className="mt-2 overflow-x-auto rounded bg-background/60 p-2 font-mono text-[10px] leading-relaxed">
{`curl -H "Authorization: Bearer meeme_live_..." \\
  "${typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/lock?address=<mint>"

# with your position, for a ladder read from your entry
  ...&entry=0.0000042&size=1200000`}
        </pre>
      </details>
    </div>
  );
}

