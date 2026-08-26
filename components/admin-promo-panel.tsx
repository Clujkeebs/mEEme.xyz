'use client';

import { Loader2, Plus } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface PromoCodeRow {
  id: string;
  code: string;
  trialTier: string;
  trialDays: number;
  maxRedemptions: number | null;
  active: boolean;
  expiresAt: string | null;
  note: string | null;
  createdByEmail: string | null;
  createdAt: string;
  redemptionCount: number;
}

const EMPTY_FORM = { code: '', trialTier: 'DEGEN', trialDays: '3', maxRedemptions: '', note: '' };

export function AdminPromoPanel({ initialCodes }: { initialCodes: PromoCodeRow[] }) {
  const [codes, setCodes] = React.useState(initialCodes);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [creating, setCreating] = React.useState(false);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/admin/promo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: form.code,
          trialTier: form.trialTier,
          trialDays: Number.parseInt(form.trialDays, 10),
          maxRedemptions: form.maxRedemptions ? Number.parseInt(form.maxRedemptions, 10) : null,
          note: form.note || null,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string; id?: string; code?: string };
      if (!json.ok) {
        toast.error(json.error ?? 'Could not create that code.');
        return;
      }
      toast.success(`${json.code} created.`);
      setForm(EMPTY_FORM);
      // Re-fetch rather than optimistically splice: the server-computed
      // fields (createdAt, redemptionCount) are what the table displays.
      const refreshed = await fetch('/api/admin/promo').then((r) => r.json() as Promise<{ codes: PromoCodeRow[] }>);
      setCodes(refreshed.codes);
    } finally {
      setCreating(false);
    }
  };

  const toggle = async (row: PromoCodeRow) => {
    setTogglingId(row.id);
    try {
      const res = await fetch('/api/admin/promo', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: row.id, active: !row.active }),
      });
      if (!res.ok) {
        toast.error('Could not update that code.');
        return;
      }
      setCodes((cur) => cur.map((c) => (c.id === row.id ? { ...c, active: !c.active } : c)));
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
      <form onSubmit={create} className="hud-panel h-fit space-y-3 p-5">
        <h2 className="hud-label flex items-center gap-2">
          <Plus className="h-3 w-3" /> new code
        </h2>
        <Input
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          placeholder="CODE (e.g. PRELAUNCH)"
          className="font-mono text-xs uppercase"
          required
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={form.trialTier}
            onChange={(e) => setForm({ ...form, trialTier: e.target.value })}
            className="flex h-10 w-full rounded-md border border-input bg-background/60 px-3 text-sm"
          >
            <option value="DEGEN">Degen</option>
            <option value="APEX">Apex</option>
          </select>
          <Input
            value={form.trialDays}
            onChange={(e) => setForm({ ...form, trialDays: e.target.value })}
            placeholder="Days"
            inputMode="numeric"
            required
          />
        </div>
        <Input
          value={form.maxRedemptions}
          onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })}
          placeholder="Max redemptions (blank = unlimited)"
          inputMode="numeric"
        />
        <Input
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          placeholder="Note (internal only)"
        />
        <Button type="submit" className="w-full" disabled={creating}>
          {creating && <Loader2 className="h-4 w-4 animate-spin" />} Create code
        </Button>
      </form>

      <div className="hud-panel overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border/70">
              <th className="px-4 py-2.5 hud-label font-normal">code</th>
              <th className="px-3 py-2.5 hud-label font-normal">grants</th>
              <th className="px-3 py-2.5 hud-label font-normal">redeemed</th>
              <th className="px-3 py-2.5 hud-label font-normal">note</th>
              <th className="px-3 py-2.5 hud-label font-normal">status</th>
              <th className="px-4 py-2.5 hud-label font-normal" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {codes.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No codes yet.
                </td>
              </tr>
            ) : (
              codes.map((c) => (
                <tr key={c.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs font-semibold">{c.code}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted-foreground">
                    {c.trialDays}d {c.trialTier}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted-foreground">
                    {c.redemptionCount}
                    {c.maxRedemptions ? ` / ${c.maxRedemptions}` : ''}
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2.5 text-xs text-muted-foreground">
                    {c.note ?? '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={c.active ? 'default' : 'muted'}>{c.active ? 'active' : 'disabled'}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={togglingId === c.id}
                      onClick={() => void toggle(c)}
                    >
                      {c.active ? 'Disable' : 'Enable'}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
