'use client';

import { Bell, Check, CircleDollarSign, Crosshair, Eye, Loader2, Plus, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { colorForCoil } from '@/components/cockpit/coil-gauge';
import { AlertSettings, type AlertPrefs } from '@/components/alert-settings';
import { FirstRun } from '@/components/first-run';
import { WalletImport } from '@/components/wallet-import';
import { ApiKeys } from '@/components/api-keys';
import { ManageBilling } from '@/components/manage-billing';
import { PromoRedeemForm } from '@/components/promo-redeem-form';
import { PortfolioSummaryPanel, markAge } from '@/components/portfolio-summary';
import { ReferralLink } from '@/components/referral-link';
import { valuePosition, type PortfolioSummary } from '@/lib/positions';
import type { Tier } from '@/lib/tiers';
import { cn, formatPrice, shortAddress } from '@/lib/utils';

interface PositionRow {
  id: string;
  tokenAddress: string;
  symbol: string;
  size: number;
  entryPriceUsd: number;
  openedAt: string;
  markPriceUsd: number | null;
  markedAt: string | null;
  markVerdict: string | null;
  markCoilScore: number | null;
  markStopUsd: number | null;
  markNextRungUsd: number | null;
  markNextRungFraction: number | null;
}

interface ClosedPositionRow {
  id: string;
  symbol: string;
  entryPriceUsd: number;
  size: number;
  realizedPnlUsd: number | null;
  closedAt: string;
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
  deliveredVia: string | null;
}

export interface WatchtowerProps {
  tier: Tier;
  tierName: string;
  /** ISO timestamp, set only while a promo trial is what is granting `tier`. */
  trialEndsAt: string | null;
  /** Whether the user has a real Stripe subscription — distinct from `tier`,
   * which a promo trial can also raise. Only a real subscriber has billing to manage. */
  hasStripeSubscription: boolean;
  /** The partner's own code and rate, or null. Drives the affiliate panel. */
  affiliate: { code: string; commissionPct: number } | null;
  quota: { used: number; limit: number | null; remaining: number | null };
  limits: { positions: number; watches: number };
  positions: PositionRow[];
  portfolio: PortfolioSummary;
  /** Server render time. Marks are dated against this so SSR and hydration agree. */
  nowMs: number;
  closedPositions: ClosedPositionRow[];
  watches: WatchRow[];
  alerts: AlertRow[];
  prefill: { address: string; symbol: string } | null;
  alertPrefs: AlertPrefs;
  telegramAvailable: boolean;
  emailAvailable: boolean;
  walletScanAvailable: boolean;
  apiAccess: boolean;
  apiDailyLimit: number;
}

export function Watchtower({
  tier,
  tierName,
  trialEndsAt,
  hasStripeSubscription,
  affiliate,
  quota,
  limits,
  positions,
  portfolio,
  nowMs,
  closedPositions,
  watches,
  alerts,
  prefill,
  alertPrefs,
  telegramAvailable,
  emailAvailable,
  walletScanAvailable,
  apiAccess,
  apiDailyLimit,
}: WatchtowerProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  /** Nothing tracked yet — show the setup checklist instead of empty boxes. */
  const firstRun = positions.length === 0 && watches.length === 0;

  const [form, setForm] = React.useState({
    tokenAddress: prefill?.address ?? '',
    symbol: prefill?.symbol ?? '',
    size: '',
    entryPriceUsd: '',
  });

  const [watchForm, setWatchForm] = React.useState({ tokenAddress: '', symbol: '' });
  const [closingId, setClosingId] = React.useState<string | null>(null);
  const [exitPrice, setExitPrice] = React.useState('');

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

  const addWatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/watch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tokenAddress: watchForm.tokenAddress.trim(),
          symbol: watchForm.symbol.trim() || 'UNKNOWN',
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string; upgrade?: boolean };
      if (!json.ok) {
        toast.error(json.error ?? 'Could not add that to surveillance.', {
          action: json.upgrade ? { label: 'Upgrade', onClick: () => router.push('/pricing') } : undefined,
        });
        return;
      }
      toast.success('Under surveillance. The sweep will alert you on a coil crossing.');
      setWatchForm({ tokenAddress: '', symbol: '' });
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
        toast.success('Position removed — no exit price recorded.');
        router.refresh();
      } else toast.error('Could not remove that.');
    } finally {
      setBusy(false);
    }
  };

  // The backend has carried close + realized-PnL support since day one
  // (PATCH /api/positions), but nothing in the UI ever called it — the only
  // way to end a position was the delete button, which throws the exit away
  // with no record. This is the actual "I sold" action; delete stays for
  // correcting a mistake, not for closing a real trade.
  const closePosition = async (id: string, entryPriceUsd: number) => {
    const exit = Number.parseFloat(exitPrice);
    if (!(exit > 0)) {
      toast.error('Enter the price you exited at.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/positions', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, close: true, exitPriceUsd: exit }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        position?: { realizedPnlUsd: number | null };
      };
      if (!json.ok) {
        toast.error(json.error ?? 'Could not close that position.');
        return;
      }
      const pnl = json.position?.realizedPnlUsd ?? (exit - entryPriceUsd);
      const sign = pnl >= 0 ? '+' : '';
      toast.success(`Closed. Realized ${sign}$${pnl.toFixed(2)}.`);
      setClosingId(null);
      setExitPrice('');
      router.refresh();
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
          {trialEndsAt && (
            <Badge variant="warn">trial · {hoursRemaining(trialEndsAt)}</Badge>
          )}
          <span className="font-mono text-xs text-muted-foreground">
            {quota.limit === null ? `${quota.used} locks today` : `${quota.used}/${quota.limit} locks today`}
          </span>
          {hasStripeSubscription && <ManageBilling />}
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
                  {a.deliveredVia ? `sent via ${a.deliveredVia} · ` : ''}
                  {new Date(a.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-8">
          {/* First thing in the main column, above even the setup checklist.
              A revenue-share partner should never have to guess a URL to find
              what they are owed, and the sidebar was not a fix on a phone: it
              renders below the positions, closed and surveillance sections, so
              the one thing this person came for sat several screens past
              everything they did not. Below the first-run checklist was no
              better — measured at 1255px on a 390x844 screen, still off. The
              first partner onboarded reported twice that he could not find his
              dashboard or his code, so for an affiliate this outranks
              onboarding: they already know what the product is. The header
              link stays, but it is behind a hamburger on mobile. */}
          {affiliate && (
            <section className="hud-panel corner-bracket p-5">
              <h2 className="hud-label flex items-center gap-2">
                <CircleDollarSign className="h-3 w-3" /> affiliate partner
              </h2>

              {/* The code and the link are here, not one click away. Pointing a
                  partner at a dashboard is still asking them to go and find
                  their own code — and the one partner onboarded so far
                  reported twice that he could not. What he needs to do his
                  half of the deal is two strings; they belong on the first
                  screen he sees, and the dashboard is for the numbers. */}
              <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-mono text-xl font-bold tracking-wide text-primary">
                  {affiliate.code}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  your code · {affiliate.commissionPct}% for 12 months from a referral&rsquo;s first payment
                </span>
              </div>

              <ReferralLink
                code={affiliate.code}
                className="mt-3 rounded-md border border-border/60 bg-secondary/30 p-3"
              />

              <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                Anyone who signs up after following that link is credited to you. Signups alone earn
                nothing — you earn when one of them starts paying.
              </p>

              <Button asChild size="sm" variant="outline" className="mt-3">
                <Link href="/affiliate">See signups and what you are owed</Link>
              </Button>
            </section>
          )}

          {/* A dashboard that only announces its own emptiness is the worst
              moment in the product. While nothing is tracked, the left column
              carries a checklist of what actually has to happen instead. */}
          {firstRun && (
            <FirstRun
              hasPositions={positions.length > 0}
              hasWatches={watches.length > 0}
              alertsReady={alertPrefs.telegramLinked || alertPrefs.notifyEmail}
            />
          )}

          <WalletImport available={walletScanAvailable} />

          <PortfolioSummaryPanel summary={portfolio} />

          <section>
            <h2 className="hud-label mb-3 flex items-center gap-2">
              <Crosshair className="h-3 w-3" /> positions · {positions.length}/{limits.positions}
            </h2>
            {positions.length === 0 ? (
              // The first-run checklist above already says this, at length —
              // repeating it in a dashed box is noise, not guidance.
              firstRun ? null : (
                <EmptyState
                  text="No positions tracked. Add one and the engine will watch its ladder and stop for you."
                />
              )
            ) : (
              <ul className="space-y-2">
                {positions.map((p) => {
                  const v = valuePosition(p, nowMs);
                  return (
                  <li key={p.id} className="hud-panel px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                    {/* basis-full below sm: identity gets the whole line and the
                        controls drop underneath, instead of three blocks
                        fighting over 390px and wrapping one word per line. */}
                    <div className="min-w-0 flex-1 basis-full sm:basis-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="font-semibold">${p.symbol}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {shortAddress(p.tokenAddress)}
                        </span>
                        {v.stopBroken && (
                          <Badge variant="danger" className="text-[10px]">stop broken</Badge>
                        )}
                      </div>
                      <div className="tnum mt-0.5 font-mono text-xs text-muted-foreground">
                        {p.size.toLocaleString('en-US')} @ {formatPrice(p.entryPriceUsd)}
                        {v.marked && (
                          <>
                            {' → '}
                            <span className="text-foreground">{formatPrice(p.markPriceUsd as number)}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {v.marked && (
                      <div className="shrink-0 text-right">
                        <div
                          className={cn(
                            'tnum font-mono text-base font-semibold',
                            (v.unrealizedPnlUsd ?? 0) >= 0 ? 'text-primary' : 'text-destructive',
                          )}
                        >
                          {(v.unrealizedPnlUsd ?? 0) >= 0 ? '+' : '−'}$
                          {Math.abs(v.unrealizedPnlUsd ?? 0).toFixed(2)}
                        </div>
                        <div className="tnum font-mono text-[11px] text-muted-foreground">
                          {(v.unrealizedPnlPct ?? 0) >= 0 ? '+' : '−'}
                          {Math.abs((v.unrealizedPnlPct ?? 0) * 100).toFixed(1)}%
                        </div>
                      </div>
                    )}
                    {closingId === p.id ? (
                      <>
                        <Input
                          value={exitPrice}
                          onChange={(e) => setExitPrice(e.target.value)}
                          placeholder="Exit price USD"
                          inputMode="decimal"
                          autoFocus
                          className="h-8 w-32 font-mono text-xs"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={busy}
                          aria-label="Confirm close"
                          onClick={() => void closePosition(p.id, p.entryPriceUsd)}
                        >
                          <Check className="h-4 w-4 text-primary" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={busy}
                          aria-label="Cancel"
                          onClick={() => {
                            setClosingId(null);
                            setExitPrice('');
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button asChild size="sm" variant="outline" className="ml-auto sm:ml-0">
                          <Link href={`/lock?address=${p.tokenAddress}`}>Re-read</Link>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setClosingId(p.id);
                            // Pre-fill with the last mark. Nine times out of ten
                            // that is the price they just sold at, and making
                            // them go find it again is how an exit goes
                            // unrecorded — which is what breaks the track record.
                            setExitPrice(p.markPriceUsd ? String(p.markPriceUsd) : '');
                          }}
                        >
                          <CircleDollarSign className="h-4 w-4" aria-hidden="true" />
                          Close
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={busy}
                          aria-label="Remove without recording an exit price"
                          onClick={() => void removePosition(p.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    </div>

                    <PositionMark position={p} valuation={v} />
                  </li>
                  );
                })}
              </ul>
            )}
          </section>

          {closedPositions.length > 0 && (
            <section>
              <h2 className="hud-label mb-3 flex items-center gap-2">
                <CircleDollarSign className="h-3 w-3" /> closed · realized{' '}
                {(() => {
                  const total = closedPositions.reduce((sum, p) => sum + (p.realizedPnlUsd ?? 0), 0);
                  return (
                    <span className={cn('tnum', total >= 0 ? 'text-primary' : 'text-destructive')}>
                      {total >= 0 ? '+' : '−'}${Math.abs(total).toFixed(2)}
                    </span>
                  );
                })()}
              </h2>
              <ul className="space-y-1.5">
                {closedPositions.map((p) => {
                  const pnl = p.realizedPnlUsd ?? 0;
                  const exitPriceUsd = p.size > 0 ? p.entryPriceUsd + pnl / p.size : p.entryPriceUsd;
                  return (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border/50 px-4 py-2 text-sm"
                    >
                      <span className="min-w-[4rem] font-semibold">${p.symbol}</span>
                      <span className="tnum font-mono text-xs text-muted-foreground">
                        {formatPrice(p.entryPriceUsd)} → {formatPrice(exitPriceUsd)}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {new Date(p.closedAt).toLocaleDateString()}
                      </span>
                      <span
                        className={cn(
                          'tnum ml-auto font-mono text-xs font-semibold',
                          pnl >= 0 ? 'text-primary' : 'text-destructive',
                        )}
                      >
                        {pnl >= 0 ? '+' : '−'}${Math.abs(pnl).toFixed(2)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section>
            <h2 className="hud-label mb-3 flex items-center gap-2">
              <Eye className="h-3 w-3" /> surveillance · {watches.length}/{limits.watches}
            </h2>
            {watches.length === 0 ? (
              firstRun ? null : (
                <EmptyState text="Nothing under surveillance. Watched tokens alert you when their coil crosses your threshold." />
              )
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

        <aside className="space-y-6">
          <AlertSettings
            initial={alertPrefs}
            telegramAvailable={telegramAvailable}
            emailAvailable={emailAvailable}
          />

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

          <form onSubmit={addWatch} className="hud-panel corner-bracket space-y-3 p-5">
            <h2 className="hud-label flex items-center gap-2">
              <Eye className="h-3 w-3" /> watch a token
            </h2>
            <Input
              value={watchForm.tokenAddress}
              onChange={(e) => setWatchForm({ ...watchForm, tokenAddress: e.target.value })}
              placeholder="Contract address"
              className="font-mono text-xs"
              required
            />
            <Input
              value={watchForm.symbol}
              onChange={(e) => setWatchForm({ ...watchForm, symbol: e.target.value })}
              placeholder="Symbol (e.g. WIF)"
              required
            />
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Add to surveillance
            </Button>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              No position needed — the sweep re-reads this token every few minutes and alerts you
              when its coil score crosses your threshold.
            </p>
          </form>

          <ApiKeys available={apiAccess} dailyLimit={apiDailyLimit} />


          <div className="flex justify-center">
            <PromoRedeemForm />
          </div>
        </aside>
      </div>
    </div>
  );
}

/** "2d left" / "6h left" / "ending soon" — coarse on purpose, this badge is
 * not re-rendered continuously so a precise countdown would just go stale. */
function hoursRemaining(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'ending soon';
  const hours = Math.ceil(ms / 3_600_000);
  if (hours >= 24) return `${Math.ceil(hours / 24)}d left`;
  return `${hours}h left`;
}

/**
 * The engine's read on one open position, from the sweep's last mark.
 *
 * Ordered by what forces a decision: a broken stop first, then how much room
 * is left before the stop, then the next rung up. A trader scanning this list
 * should be able to find the position that needs them without reading it all.
 */
function PositionMark({
  position,
  valuation,
}: {
  position: PositionRow;
  valuation: ReturnType<typeof valuePosition>;
}) {
  if (!valuation.marked) {
    return (
      <p className="mt-2 border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
        Not marked yet — the sweep picks it up within 5 minutes.
      </p>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/40 pt-2 text-[11px] text-muted-foreground [&>span]:whitespace-nowrap">
      {valuation.stopBroken ? (
        <span className="!whitespace-normal font-medium text-destructive">
          Below the structural stop{position.markStopUsd ? ` (${formatPrice(position.markStopUsd)})` : ''}
        </span>
      ) : (
        valuation.stopDistancePct !== null && (
          <span>
            stop{' '}
            <span
              className={cn(
                'tnum font-mono',
                valuation.stopDistancePct < 0.15 ? 'text-destructive' : 'text-foreground',
              )}
            >
              −{(valuation.stopDistancePct * 100).toFixed(0)}%
            </span>
            {position.markStopUsd ? ` @ ${formatPrice(position.markStopUsd)}` : ''}
          </span>
        )
      )}

      {valuation.nextRungDistancePct !== null && position.markNextRungUsd !== null && (
        <span>
          next rung{' '}
          <span className="tnum font-mono text-foreground">
            +{(valuation.nextRungDistancePct * 100).toFixed(0)}%
          </span>
          {position.markNextRungFraction !== null &&
            ` · sell ${(position.markNextRungFraction * 100).toFixed(0)}%`}
        </span>
      )}

      {position.markCoilScore !== null && (
        <span>
          coil{' '}
          <span className="tnum font-mono" style={{ color: colorForCoil(position.markCoilScore) }}>
            {position.markCoilScore.toFixed(2)}
          </span>
        </span>
      )}

      {valuation.markAgeMs !== null && (
        <span className={cn(valuation.stale && 'text-destructive')}>
          {valuation.stale ? 'stale · ' : ''}
          {markAge(valuation.markAgeMs)}
        </span>
      )}
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
