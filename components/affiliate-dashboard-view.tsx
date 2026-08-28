'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { ReferralLink } from '@/components/referral-link';
import { cn } from '@/lib/utils';
import type { AffiliateDashboard } from '@/lib/affiliate';

export function AffiliateDashboardView({ dashboard }: { dashboard: AffiliateDashboard }) {
  return (
    <div className="py-8">
      <p className="eyebrow text-primary/70">affiliate</p>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">Your referrals</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        You earn {dashboard.commissionPct}% of what a referred subscriber pays, for 12 months from their
        first payment. Signing up alone earns nothing — only a paying subscriber does.
      </p>

      <ReferralLink code={dashboard.code} className="hud-panel mt-6 p-4" />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Referred" value={String(dashboard.referredCount)} />
        <Stat label="Converted" value={String(dashboard.convertedCount)} />
        <Stat label="Total earned" value={`$${dashboard.totalEarnedUsd.toFixed(2)}`} accent />
        <Stat
          label="Unpaid"
          value={`$${dashboard.unpaidUsd.toFixed(2)}`}
          accent={dashboard.unpaidUsd > 0}
        />
      </div>

      <h2 className="hud-label mb-3 mt-8">referrals</h2>
      <div className="hud-panel overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border/70">
              <th className="px-4 py-2.5 hud-label font-normal">who</th>
              <th className="px-3 py-2.5 hud-label font-normal">joined</th>
              <th className="px-3 py-2.5 hud-label font-normal">status</th>
              <th className="px-3 py-2.5 hud-label font-normal">window ends</th>
              <th className="px-4 py-2.5 hud-label font-normal text-right">earned</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {dashboard.referrals.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No signups yet. Share your link above.
                </td>
              </tr>
            ) : (
              dashboard.referrals.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{r.maskedEmail}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={r.converted ? 'default' : 'muted'}>
                      {r.converted ? 'paying' : 'signed up'}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted-foreground">
                    {r.windowEndsAt ? new Date(r.windowEndsAt).toLocaleDateString() : '—'}
                  </td>
                  <td
                    className={cn(
                      'whitespace-nowrap px-4 py-2.5 text-right font-mono text-xs',
                      r.totalEarnedUsd > 0 ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    ${r.totalEarnedUsd.toFixed(2)}
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

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="hud-panel p-4">
      <p className="hud-label">{label}</p>
      <p className={cn('mt-1 font-mono text-2xl font-semibold', accent ? 'text-primary' : 'text-foreground')}>
        {value}
      </p>
    </div>
  );
}
