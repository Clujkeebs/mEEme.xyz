'use client';

import { Bell, Crosshair, Eye, Loader2, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { colorForCoil } from '@/components/cockpit/coil-gauge';
import type { Tier } from '@/lib/tiers';
import { cn, formatPrice, shortAddress } from '@/lib/utils';

interface PositionRow {
  id: string;
  tokenAddress: string;
  symbol: string;
  size: number;
  entryPriceUsd: number;
  openedAt: string;
}

interface WatchRow {
  id: string;
  tokenAddress: string;
  symbol: string;
  coilThreshold: number;
  lastCoilScore: number | null;
  lastSweptAt: string | null;
}

interface AlertRow {
  id: string;
  symbol: string;
  kind: string;
  message: string;
  priceUsd: number;
  createdAt: string;
}

export interface WatchtowerProps {
  tier: Tier;
  tierName: string;
  quota: { used: number; limit: number | null; remaining: number | null };
  limits: { positions: number; watches: number };
  positions: PositionRow[];
  watches: WatchRow[];
  alerts: AlertRow[];
  prefill: { address: string; symbol: string } | null;
}

export function Watchtower({
  tier,
  tierName,
  quota,
  limits,
  positions,
  watches,
  alerts,
  prefill,
}: WatchtowerProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  const [form, setForm] = React.useState({
    tokenAddress: prefill?.address ?? '',
    symbol: prefill?.symbol ?? '',
    size: '',
    entryPriceUsd: '',
  });

  const addPosition = async (e: React.FormEvent) => {
    e.preventDefault();
    const size = Number.parseFloat(form.size);
    const entry = Number.parseFloat(form.entryPriceUsd);
    if (!(size > 0) || !(entry > 0)) {
      toast.error('Size and entry price must both be positive numbers.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/positions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tokenAddress: form.tokenAddress.trim(),
          symbol: form.symbol.trim() || 'UNKNOWN',
          size,
          entryPriceUsd: entry,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string; upgrade?: boolean };
      if (!json.ok) {
        toast.error(json.error ?? 'Could not add position.', {
          action: json.upgrade ? { label: 'Upgrade', onClick: () => router.push('/pricing') } : undefined,
        });
        return;
      }
      toast.success('Position tracked. The sweep will watch it from here.');
      setForm({ tokenAddress: '', symbol: '', size: '', entryPriceUsd: '' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const removePosition = async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/positions?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Position removed.');
        router.refresh();
      } else toast.error('Could not remove that.');
    } finally {
      setBusy(false);
    }
  };

  const removeWatch = async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/watch?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Removed from surveillance.');
        router.refresh();
      } else toast.error('Could not remove that.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8 py-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Watchtower</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The half of mEEme that works while you are asleep. The sweep re-reads every position and
            watched token every few minutes and alerts you on crossings — not on levels.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={tier === 'FREE' ? 'muted' : 'default'}>{tierName}</Badge>
          <span className="font-mono text-xs text-muted-foreground">
            {quota.limit === null ? `${quota.used} locks today` : `${quota.used}/${quota.limit} locks today`}
          </span>
        </div>
      </header>

      {alerts.length > 0 && (
        <section>
          <h2 className="hud-label mb-3 flex items-center gap-2">
            <Bell className="h-3 w-3" /> alerts
          </h2>
          <ul className="space-y-2">
            {alerts.slice(0, 8).map((a) => (
              <li key={a.id} className="hud-panel flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
                <Badge variant={a.kind === 'STOP_HIT' || a.kind === 'INSIDER_DUMP' ? 'danger' : 'warn'}>
                  {a.kind.replace('_', ' ')}
                </Badge>
                <span className="font-semibold">${a.symbol}</span>
                <span className="flex-1 text-sm text-foreground/85">{a.message}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {new Date(a.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-8">
          <section>
            <h2 className="hud-label mb-3 flex items-center gap-2">
              <Crosshair className="h-3 w-3" /> positions · {positions.length}/{limits.positions}
            </h2>
            {positions.length === 0 ? (
              <EmptyState
                text="No positions tracked. Add one and the engine will watch its ladder and stop for you."
              />
            ) : (
              <ul className="space-y-2">
                {positions.map((p) => (
                  <li key={p.id} className="hud-panel flex flex-wrap items-center gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold">${p.symbol}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {shortAddress(p.tokenAddress)}
                        </span>
                      </div>
                      <div className="tnum mt-0.5 font-mono text-xs text-muted-foreground">
                        {p.size.toLocaleString('en-US')} @ {formatPrice(p.entryPriceUsd)}
                      </div>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/lock?address=${p.tokenAddress}`}>Re-read</Link>
                    </Button>
                    <Button size="icon" variant="ghost" disabled={busy} onClick={() => void removePosition(p.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="hud-label mb-3 flex items-center gap-2">
              <Eye className="h-3 w-3" /> surveillance · {watches.length}/{limits.watches}
            </h2>
            {watches.length === 0 ? (
              <EmptyState text="Nothing under surveillance. Watched tokens alert you when their coil crosses your threshold." />
            ) : (
              <ul className="space-y-2">
                {watches.map((w) => (
                  <li key={w.id} className="hud-panel flex flex-wrap items-center gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold">${w.symbol}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {shortAddress(w.tokenAddress)}
                        </span>
                      </div>
                      <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                        alerts above coil {w.coilThreshold.toFixed(2)}
                        {w.lastSweptAt && ` · swept ${new Date(w.lastSweptAt).toLocaleTimeString()}`}
                      </div>
                    </div>
                    {w.lastCoilScore !== null && (
                      <span
                        className="tnum font-mono text-lg font-bold"
                        style={{ color: colorForCoil(w.lastCoilScore) }}
                      >
                        {w.lastCoilScore.toFixed(2)}
                      </span>
                    )}
                    <Button size="icon" variant="ghost" disabled={busy} onClick={() => void removeWatch(w.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside>
          <form onSubmit={addPosition} className="hud-panel corner-bracket space-y-3 p-5">
            <h2 className="hud-label flex items-center gap-2">
              <Plus className="h-3 w-3" /> track a position
            </h2>
            <Input
              value={form.tokenAddress}
              onChange={(e) => setForm({ ...form, tokenAddress: e.target.value })}
              placeholder="Contract address"
              className="font-mono text-xs"
              required
            />
            <Input
              value={form.symbol}
              onChange={(e) => setForm({ ...form, symbol: e.target.value })}
              placeholder="Symbol (e.g. WIF)"
              required
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={form.size}
                onChange={(e) => setForm({ ...form, size: e.target.value })}
                placeholder="Tokens held"
                inputMode="decimal"
                className="font-mono text-xs"
                required
              />
              <Input
                value={form.entryPriceUsd}
                onChange={(e) => setForm({ ...form, entryPriceUsd: e.target.value })}
                placeholder="Entry USD"
                inputMode="decimal"
                className="font-mono text-xs"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Track it
            </Button>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              mEEme never connects to your wallet. You tell it what you hold; it reads public chain
              data. It cannot move your funds because it was never given the ability to.
            </p>
          </form>
        </aside>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className={cn('rounded-lg border border-dashed border-border/70 px-6 py-8 text-center')}>
      <p className="mx-auto max-w-sm text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
