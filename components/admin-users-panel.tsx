'use client';

import * as React from 'react';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import type { AdminUserRow } from '@/lib/admin';

type UserRow = AdminUserRow;

const TIERS = ['FREE', 'DEGEN', 'APEX'] as const;

export function AdminUsersPanel({ initialUsers }: { initialUsers: UserRow[] }) {
  const [users, setUsers] = React.useState(initialUsers);
  const [query, setQuery] = React.useState('');
  const [savingId, setSavingId] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => (u.email ?? '').toLowerCase().includes(q) || (u.name ?? '').toLowerCase().includes(q));
  }, [users, query]);

  const setTier = async (row: UserRow, tier: string) => {
    if (tier === row.tier) return;
    setSavingId(row.id);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: row.id, tier }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string; tierName?: string };
      if (!json.ok) {
        toast.error(json.error ?? 'Could not update that account.');
        return;
      }
      setUsers((cur) => cur.map((u) => (u.id === row.id ? { ...u, tier } : u)));
      toast.success(`${row.email ?? row.id} is now ${json.tierName}.`);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="mt-8">
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by email or name"
          className="pl-9"
        />
      </div>

      <div className="hud-panel overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border/70">
              <th className="px-4 py-2.5 hud-label font-normal">email</th>
              <th className="px-3 py-2.5 hud-label font-normal">tier</th>
              <th className="px-3 py-2.5 hud-label font-normal">subscription</th>
              <th className="px-3 py-2.5 hud-label font-normal">trial</th>
              <th className="px-3 py-2.5 hud-label font-normal">referred</th>
              <th className="px-3 py-2.5 hud-label font-normal">joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No users match.
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.id}>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <div className="text-xs font-medium">{u.email ?? '—'}</div>
                    {u.name && <div className="text-[10px] text-muted-foreground">{u.name}</div>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <select
                      value={u.tier}
                      disabled={savingId === u.id}
                      onChange={(e) => void setTier(u, e.target.value)}
                      className="h-8 rounded-md border border-input bg-background/60 px-2 font-mono text-xs disabled:opacity-50"
                    >
                      {TIERS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    {savingId === u.id && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {u.hasStripeSubscription ? (
                      <Badge variant="default">{u.stripeStatus ?? 'active'}</Badge>
                    ) : (
                      <Badge variant="muted">none</Badge>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted-foreground">
                    {u.trialTier ? `${u.trialTier} until ${new Date(u.trialEndsAt!).toLocaleDateString()}` : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted-foreground">
                    {u.referredCount > 0 ? `${u.referredCount} signups` : '—'}
                    {u.referredByCode && (
                      <div className="text-[10px] text-muted-foreground/70">via {u.referredByCode.slice(0, 10)}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString()}
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
