'use client';

import { Check, CircleDollarSign, Copy, Loader2, Plus } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { AdminAffiliateRow, AdminAffiliateSummary } from '@/lib/affiliate';

const EMPTY_FORM = { code: '', email: '', name: '', commissionPct: '30', note: '' };

export function AdminAffiliatesPanel({ initialSummary }: { initialSummary: AdminAffiliateSummary }) {
  const [summary, setSummary] = React.useState(initialSummary);
  const affiliates = summary.affiliates;
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [creating, setCreating] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const refresh = async () => {
    const res = await fetch('/api/admin/affiliates');
    const json = (await res.json()) as AdminAffiliateSummary;
    setSummary(json);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/admin/affiliates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: form.code,
          email: form.email,
          name: form.name || null,
          commissionPct: Number.parseFloat(form.commissionPct),
          note: form.note || null,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string; code?: string };
      if (!json.ok) {
        toast.error(json.error ?? 'Could not create that affiliate.');
        return;
      }
      toast.success(`${json.code} created.`);
      setForm(EMPTY_FORM);
      await refresh();
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (row: AdminAffiliateRow) => {
    setBusyId(row.id);
    try {
      const res = await fetch('/api/admin/affiliates', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: row.id, active: !row.active }),
      });
      if (!res.ok) {
        toast.error('Could not update that affiliate.');
        return;
      }
      setSummary((cur) => ({
        ...cur,
        affiliates: cur.affiliates.map((a) => (a.id === row.id ? { ...a, active: !a.active } : a)),
      }));
    } finally {
      setBusyId(null);
    }
  };

  const settle = async (row: AdminAffiliateRow) => {
    const note = window.prompt(
      `Record a payout of $${row.unpaidUsd.toFixed(2)} to ${row.code}?\n\n` +
        'Optionally note how you sent it (wire, PayPal tx id, ...). This records the payment — it does not send money.',
      '',
    );
    // prompt() returns null on cancel, '' on OK-with-no-note.
    if (note === null) return;

    setBusyId(row.id);
    try {
      const res = await fetch(`/api/admin/affiliates/${row.id}/settle`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        amountUsd?: number;
        commissionCount?: number;
        error?: string;
      };
      if (!json.ok) {
        toast.error(json.error ?? 'Could not settle that affiliate.');
        return;
      }
      toast.success(
        `Recorded $${json.amountUsd?.toFixed(2)} paid to ${row.code} (${json.commissionCount} commission${json.commissionCount === 1 ? '' : 's'}).`,
      );
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const expandedRow = affiliates.find((a) => a.id === expandedId) ?? null;

  const copyLink = async (row: AdminAffiliateRow) => {
    try {
      await navigator.clipboard.writeText(`https://meeme.xyz/?ref=${row.code}`);
      setCopiedId(row.id);
      setTimeout(() => setCopiedId((cur) => (cur === row.id ? null : cur)), 1500);
    } catch {
      toast.error('Could not copy — clipboard access denied.');
    }
  };

  return (
    <>
      {/* The headline number: what is owed right now, across everyone. */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="hud-panel p-4">
          <p className="hud-label">You owe right now</p>
          <p
            className={cn(
              'mt-1 font-mono text-2xl font-semibold',
              summary.totalOwedUsd > 0 ? 'text-warn' : 'text-muted-foreground',
            )}
          >
            ${summary.totalOwedUsd.toFixed(2)}
          </p>
        </div>
        <div className="hud-panel p-4">
          <p className="hud-label">Paid to date</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-foreground">
            ${summary.totalPaidUsd.toFixed(2)}
          </p>
        </div>
        <div className="hud-panel p-4">
          <p className="hud-label">Commission earned, all time</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-primary">
            ${summary.totalEarnedUsd.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
      <form onSubmit={create} className="hud-panel h-fit space-y-3 p-5">
        <h2 className="hud-label flex items-center gap-2">
          <Plus className="h-3 w-3" /> new affiliate
        </h2>
        <Input
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          placeholder="CODE (e.g. CRYPTOCHIEF)"
          className="font-mono text-xs uppercase"
          required
        />
        <Input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="their@email.com — how they log in"
          required
        />
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Name (optional)"
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={form.commissionPct}
            onChange={(e) => setForm({ ...form, commissionPct: e.target.value })}
            placeholder="Commission %"
            inputMode="decimal"
            required
          />
          <div className="flex items-center px-1 text-xs text-muted-foreground">of each invoice, 12mo</div>
        </div>
        <Input
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          placeholder="Note (internal only)"
        />
        <Button type="submit" className="w-full" disabled={creating}>
          {creating && <Loader2 className="h-4 w-4 animate-spin" />} Create affiliate
        </Button>
      </form>

      <div className="hud-panel overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border/70">
              <th className="px-4 py-2.5 hud-label font-normal">code</th>
              <th className="px-3 py-2.5 hud-label font-normal">email</th>
              <th className="px-3 py-2.5 hud-label font-normal">rate</th>
              <th className="px-3 py-2.5 hud-label font-normal">referred</th>
              <th className="px-3 py-2.5 hud-label font-normal">converted</th>
              <th className="px-3 py-2.5 hud-label font-normal">earned</th>
              <th className="px-3 py-2.5 hud-label font-normal">unpaid</th>
              <th className="px-3 py-2.5 hud-label font-normal">paid</th>
              <th className="px-3 py-2.5 hud-label font-normal">status</th>
              <th className="px-4 py-2.5 hud-label font-normal" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {affiliates.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                  No affiliates yet.
                </td>
              </tr>
            ) : (
              affiliates.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-semibold">{a.code}</span>
                      <button
                        type="button"
                        onClick={() => void copyLink(a)}
                        aria-label={`Copy referral link for ${a.code}`}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {copiedId === a.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                    {a.name && <div className="text-[10px] text-muted-foreground">{a.name}</div>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">{a.email}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted-foreground">
                    {a.commissionPct}%
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted-foreground">
                    {a.referredCount}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted-foreground">
                    {a.convertedCount}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-primary">
                    ${a.totalEarnedUsd.toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">
                    {a.unpaidUsd > 0 ? (
                      <span className="text-warn">${a.unpaidUsd.toFixed(2)}</span>
                    ) : (
                      <span className="text-muted-foreground">$0.00</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted-foreground">
                    ${a.paidUsd.toFixed(2)}
                    {a.payouts.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpandedId((cur) => (cur === a.id ? null : a.id))}
                        className="ml-1.5 underline underline-offset-2 hover:text-foreground"
                        aria-expanded={expandedId === a.id}
                      >
                        {a.payouts.length} payout{a.payouts.length === 1 ? '' : 's'}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={a.active ? 'default' : 'muted'}>{a.active ? 'active' : 'disabled'}</Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      {a.unpaidUsd > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === a.id}
                          onClick={() => void settle(a)}
                          title="Mark all unpaid commissions as paid out"
                        >
                          <CircleDollarSign className="h-3.5 w-3.5" /> Mark paid
                        </Button>
                      )}
                      <Button size="sm" variant="outline" disabled={busyId === a.id} onClick={() => void toggleActive(a)}>
                        {a.active ? 'Disable' : 'Enable'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </div>

      {/* Payout history for whichever affiliate is expanded — the answer to
          "what have I already sent them, and when". */}
      {expandedRow && (
        <div className="hud-panel mt-6 overflow-x-auto">
          <h2 className="hud-label px-4 pt-4">payout history · {expandedRow.code}</h2>
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border/70">
                <th className="px-4 py-2.5 hud-label font-normal">date</th>
                <th className="px-3 py-2.5 hud-label font-normal">amount</th>
                <th className="px-3 py-2.5 hud-label font-normal">commissions</th>
                <th className="px-3 py-2.5 hud-label font-normal">note</th>
                <th className="px-4 py-2.5 hud-label font-normal">recorded by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {expandedRow.payouts.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {new Date(p.createdAt).toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-semibold text-foreground">
                    ${p.amountUsd.toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted-foreground">
                    {p.commissionCount}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{p.note ?? '—'}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                    {p.createdByEmail ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
