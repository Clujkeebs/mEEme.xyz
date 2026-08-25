'use client';

import { Crosshair, Loader2, Plus, Radar, Share2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CoilGauge } from './coil-gauge';
import { LadderCard } from './ladder-card';
import { SupplyProfile } from './supply-profile';
import { VerdictBanner } from './verdict-banner';
import type { CoilReport, Candle, ExitLadder, HolderTag, Verdict } from '@/lib/engine/types';
import {
  cn,
  formatAge,
  formatPct,
  formatPrice,
  formatSignedPct,
  formatUsd,
  shortAddress,
} from '@/lib/utils';

// The chart library touches the DOM on construction, so it never renders on the server.
const PriceChart = dynamic(() => import('./price-chart').then((m) => m.PriceChart), {
  ssr: false,
  loading: () => <div className="h-[300px] animate-pulse rounded-lg bg-secondary/40" />,
});

/* ------------------------------ response types ----------------------------- */

interface InsiderWallet {
  address: string;
  balance: number;
  costBasisUsd: number | null;
  realizedFraction: number;
  tags: HolderTag[];
}

interface LockResponse {
  ok: true;
  mode: 'live' | 'demo';
  sources: string[];
  missing: string[];
  signalId: string | null;
  shareSlug: string | null;
  quota: { used: number; limit: number | null; remaining: number | null; anonymous?: boolean };
  locks: { insiderForensics: boolean };
  signal: {
    verdict: Verdict;
    conviction: number;
    headline: string;
    reasoning: string[];
    halfLifeMinutes: number;
    coil: CoilReport;
    ladder: ExitLadder | null;
    insiderWallets: InsiderWallet[] | null;
  };
  token: {
    address: string;
    symbol: string;
    name: string;
    priceUsd: number;
    liquidityUsd: number;
    fdvUsd: number;
    ageMinutes: number;
    holderCount: number;
    priceChangePct: { m5: number; h1: number; h6: number; h24: number };
    volumeUsd: { m5: number; h1: number; h6: number; h24: number };
    lpBurnedPct: number;
    mintAuthorityActive: boolean;
    freezeAuthorityActive: boolean;
    candles: Candle[];
    dataQuality: {
      holdersResolved: number;
      holdersUnresolved: number;
      supplyCovered: number;
      clusterAnalysisRan: boolean;
      sources: string[];
      synthetic: boolean;
    };
  };
}

interface ErrorResponse {
  ok: false;
  error: string;
  upgrade?: boolean;
  signIn?: boolean;
}

const DEMO_ADDRESSES = [
  { label: 'Rigged launch', address: 'mEEmeRUG11111111111111111111111111111111111' },
  { label: 'Mid-distribution', address: 'mEEmeDUMP1111111111111111111111111111111111' },
  { label: 'Chop', address: 'mEEmeCHPP1111111111111111111111111111111111' },
  { label: 'Clean setup', address: 'mEEmeAPEX1111111111111111111111111111111111' },
];

export interface TargetLockProps {
  initialAddress?: string;
  signedIn: boolean;
}

export function TargetLock({ initialAddress = '', signedIn }: TargetLockProps) {
  const [address, setAddress] = React.useState(initialAddress);
  const [entryPrice, setEntryPrice] = React.useState('');
  const [size, setSize] = React.useState('');
  const [showPosition, setShowPosition] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<LockResponse | null>(null);

  const run = React.useCallback(
    async (target: string) => {
      const trimmed = target.trim();
      if (!trimmed) {
        toast.error('Paste a contract address first.');
        return;
      }

      setLoading(true);
      try {
        const entry = Number.parseFloat(entryPrice);
        const qty = Number.parseFloat(size);
        const hasPosition = Number.isFinite(entry) && entry > 0 && Number.isFinite(qty) && qty > 0;

        const res = await fetch('/api/lock', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            address: trimmed,
            position: hasPosition ? { size: qty, entryPriceUsd: entry } : null,
          }),
        });

        const json = (await res.json()) as LockResponse | ErrorResponse;

        if (!json.ok) {
          toast.error(json.error, {
            action: json.upgrade
              ? { label: 'Upgrade', onClick: () => { window.location.href = '/pricing'; } }
              : json.signIn
                ? { label: 'Sign in', onClick: () => { window.location.href = '/signin'; } }
                : undefined,
          });
          return;
        }

        setResult(json);
        if (json.mode === 'demo') {
          toast.info('Demo data — this deployment has no live market feed configured.');
        }
      } catch {
        toast.error('Could not reach the engine. Try again.');
      } finally {
        setLoading(false);
      }
    },
    [entryPrice, size],
  );

  React.useEffect(() => {
    if (initialAddress) void run(initialAddress);
    // Only on first mount with a preloaded address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entryNumber = Number.parseFloat(entryPrice);
  const hasEntry = Number.isFinite(entryNumber) && entryNumber > 0;

  return (
    <div className="space-y-6">
      {/* ── Input ─────────────────────────────────────────────────────────── */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(address);
        }}
        className="hud-panel corner-bracket relative overflow-hidden p-6"
      >
        <div className="mb-4 flex items-center gap-2">
          <Crosshair className="h-4 w-4 text-primary" />
          <span className="hud-label !text-[11px] !text-primary/90">target lock</span>
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row">
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Paste a Solana contract address"
            spellCheck={false}
            autoComplete="off"
            className="h-14 flex-1 rounded-lg font-mono text-[15px]"
            aria-label="Contract address"
          />
          <Button
            type="submit"
            size="lg"
            disabled={loading}
            aria-busy={loading}
            className="h-14 rounded-lg text-base sm:w-44"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Radar className="h-4 w-4" aria-hidden="true" />
            )}
            {loading ? 'Reading…' : 'Lock it'}
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setShowPosition((v) => !v)}
          aria-expanded={showPosition}
          aria-controls="position-fields"
          className="mt-3 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {showPosition ? '− Hide my position' : '+ I already hold this — read it from my entry'}
        </button>

        {showPosition && (
          <div id="position-fields" className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <label className="hud-label mb-1 block" htmlFor="entry">
                your entry price (usd)
              </label>
              <Input
                id="entry"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                placeholder="0.0000042"
                inputMode="decimal"
                className="font-mono"
              />
            </div>
            <div>
              <label className="hud-label mb-1 block" htmlFor="size">
                tokens held
              </label>
              <Input
                id="size"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="1200000"
                inputMode="decimal"
                className="font-mono"
              />
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
          <span className="hud-label">try one</span>
          {DEMO_ADDRESSES.map((d) => (
            <button
              key={d.address}
              type="button"
              onClick={() => {
                setAddress(d.address);
                void run(d.address);
              }}
              className="rounded-md border border-border px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/[0.06] hover:text-primary"
            >
              {d.label}
            </button>
          ))}
        </div>
      </form>

      {loading && !result && <LoadingSkeleton />}

      {result && <LockResult result={result} entryUsd={hasEntry ? entryNumber : null} signedIn={signedIn} />}
    </div>
  );
}

/* --------------------------------- result --------------------------------- */

function LockResult({
  result,
  entryUsd,
  signedIn,
}: {
  result: LockResponse;
  entryUsd: number | null;
  signedIn: boolean;
}) {
  const { signal, token, mode } = result;
  const coil = signal.coil;

  return (
    <div className="space-y-6">
      {mode === 'demo' && (
        <div className="rounded-lg border border-warn/40 bg-warn/[0.06] px-4 py-3 text-sm text-warn">
          <strong className="font-semibold">Demo data.</strong> The engine below is real and running
          on a synthetic token. This deployment has no live market feed — see{' '}
          <code className="rounded bg-black/30 px-1">/api/diagnostics</code>. Demo reads are never
          counted in the public track record.
        </div>
      )}

      <TokenHeader token={token} />

      <VerdictBanner
        verdict={signal.verdict}
        conviction={signal.conviction}
        headline={signal.headline}
        halfLifeMinutes={signal.halfLifeMinutes}
        coilScore={coil.coilScore}
        confidence={coil.confidence}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section className="hud-panel p-6">
            <h3 className="section-title">Price, with the engine&rsquo;s levels on it</h3>
            <p className="section-note mb-5">
              The plan and the price in one picture, instead of two tabs.
            </p>
            <PriceChart
              candles={token.candles}
              trapdoorUsd={coil.trapdoorUsd}
              ceilingUsd={coil.ceilingUsd}
              ladder={signal.ladder}
              entryUsd={entryUsd}
            />
          </section>

          <section className="hud-panel p-6">
            <h3 className="section-title">Who still has to sell</h3>
            <p className="section-note mb-5">
              Every holder&rsquo;s cost basis, and which side of your exit it puts them on.
            </p>
            <SupplyProfile
              shelves={coil.shelves}
              spotUsd={token.priceUsd}
              trapdoorUsd={coil.trapdoorUsd}
              ceilingUsd={coil.ceilingUsd}
              entryUsd={entryUsd}
            />
          </section>

          <ReasoningPanel reasoning={signal.reasoning} />

          {signal.insiderWallets && signal.insiderWallets.length > 0 && (
            <InsiderTable wallets={signal.insiderWallets} spotUsd={token.priceUsd} />
          )}
        </div>

        <aside className="space-y-6">
          <div className="hud-panel p-6">
            <h3 className="section-title">The book</h3>
            <p className="section-note mb-4">Where the float sits relative to spot.</p>
            <div className="grid grid-cols-2 gap-2.5">
              <Metric label="coiled" value={formatPct(coil.coiledSupply)} tone="coil"
                hint="in profit — can sell into you" />
              <Metric label="trapped" value={formatPct(coil.trappedSupply)} tone="trap"
                hint="underwater — structural support" />
              <Metric label="insider coil" value={formatPct(coil.insiderCoil)} tone="warn"
                hint="held by the linked cluster" />
              <Metric label="insider sold" value={formatPct(coil.insiderRealized)} tone="warn"
                hint="of their bag, already gone" />
              <Metric
                label="realization"
                value={coil.velocityOfRealization.toFixed(2)}
                tone={coil.velocityOfRealization > 0.15 ? 'coil' : coil.velocityOfRealization < -0.15 ? 'apex' : 'muted'}
                hint={
                  coil.velocityOfRealization > 0.15
                    ? 'profitable supply is converting to cash'
                    : coil.velocityOfRealization < -0.15
                      ? 'flow is accumulating, not distributing'
                      : 'no decisive flow either way'
                }
                className="col-span-2"
              />
            </div>
          </div>

          <LadderCard ladder={signal.ladder} spotUsd={token.priceUsd} />

          <DataQualityPanel result={result} />

          <div className="flex flex-col gap-2">
            {signedIn ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/dashboard?add=${token.address}&symbol=${token.symbol}`}>
                  <Plus className="h-3.5 w-3.5" /> Track this position
                </Link>
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href="/signin">Sign in to track this</Link>
              </Button>
            )}
            {result.shareSlug && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const url = `${window.location.origin}/signal/${result.shareSlug}`;
                  void navigator.clipboard.writeText(url);
                  toast.success('Exit Card link copied.');
                }}
              >
                <Share2 className="h-3.5 w-3.5" /> Copy Exit Card link
              </Button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

/* -------------------------------- fragments -------------------------------- */

function TokenHeader({ token }: { token: LockResponse['token'] }) {
  const flags: { label: string; bad: boolean }[] = [
    { label: token.mintAuthorityActive ? 'mint live' : 'mint revoked', bad: token.mintAuthorityActive },
    { label: token.freezeAuthorityActive ? 'freeze live' : 'freeze revoked', bad: token.freezeAuthorityActive },
    { label: `lp ${(token.lpBurnedPct * 100).toFixed(0)}% locked`, bad: token.lpBurnedPct < 0.5 },
  ];

  return (
    <div className="hud-panel flex flex-wrap items-center justify-between gap-x-8 gap-y-5 p-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
          <h1 className="font-display text-2xl font-bold tracking-tight">${token.symbol}</h1>
          <span className="font-mono text-[11px] text-muted-foreground">
            {shortAddress(token.address, 6)}
          </span>
        </div>
        <p className="mt-1 truncate text-sm text-muted-foreground">{token.name}</p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {flags.map((f) => (
            <Badge key={f.label} variant={f.bad ? 'danger' : 'muted'}>
              {f.label}
            </Badge>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-x-7 gap-y-3">
        <Stat label="price" value={formatPrice(token.priceUsd)} big />
        <Stat
          label="1h"
          value={formatSignedPct(token.priceChangePct.h1)}
          tone={token.priceChangePct.h1 >= 0 ? 'apex' : 'coil'}
        />
        <Stat label="liquidity" value={formatUsd(token.liquidityUsd)} />
        <Stat label="fdv" value={formatUsd(token.fdvUsd)} />
        <Stat label="age" value={formatAge(token.ageMinutes)} />
        <Stat label="holders" value={token.holderCount.toLocaleString('en-US')} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  big,
}: {
  label: string;
  value: string;
  tone?: 'apex' | 'coil';
  big?: boolean;
}) {
  return (
    <div>
      <div className="hud-label">{label}</div>
      <div
        className={cn(
          'tnum mt-1 font-semibold leading-none',
          big ? 'text-2xl text-foreground' : 'text-[15px] text-foreground/90',
          tone === 'apex' && '!text-primary',
          tone === 'coil' && '!text-destructive',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  hint,
  className,
}: {
  label: string;
  value: string;
  tone: 'coil' | 'trap' | 'warn' | 'apex' | 'muted';
  hint?: string;
  className?: string;
}) {
  const toneClass = {
    coil: 'text-coil',
    trap: 'text-trap',
    warn: 'text-warn',
    apex: 'text-primary',
    muted: 'text-hud',
  }[tone];

  return (
    <div
      className={cn(
        'rounded-lg border border-border/60 bg-background/50 px-3.5 py-3 transition-colors hover:border-border',
        className,
      )}
    >
      <div className="hud-label">{label}</div>
      <div className={cn('tnum mt-1 text-xl font-bold leading-none', toneClass)}>{value}</div>
      {hint && <div className="mt-1.5 text-[11px] leading-snug text-muted-foreground/85">{hint}</div>}
    </div>
  );
}

function ReasoningPanel({ reasoning }: { reasoning: string[] }) {
  return (
    <section className="hud-panel p-6">
      <h3 className="section-title">Why — the evidence</h3>
      <p className="section-note mb-5">
        A tool that says sell without saying why is a coin flip with a logo.
      </p>
      <ul className="space-y-3.5">
        {reasoning.map((line, i) => (
          <li key={i} className="flex gap-3.5">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/80" />
            <span className="text-[14px] leading-relaxed text-foreground/90">{line}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function InsiderTable({ wallets, spotUsd }: { wallets: InsiderWallet[]; spotUsd: number }) {
  return (
    <section className="hud-panel overflow-hidden">
      <div className="border-b border-border/70 px-5 py-3">
        <h3 className="hud-label">insider cluster · {wallets.length} linked wallets</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left">
              <th className="px-5 py-2 hud-label font-normal">wallet</th>
              <th className="px-3 py-2 hud-label font-normal">cost basis</th>
              <th className="px-3 py-2 hud-label font-normal">up</th>
              <th className="px-3 py-2 hud-label font-normal">sold</th>
              <th className="px-5 py-2 hud-label font-normal">tags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {wallets.map((w) => {
              const multiple = w.costBasisUsd && w.costBasisUsd > 0 ? spotUsd / w.costBasisUsd : null;
              return (
                <tr key={w.address}>
                  <td className="px-5 py-2 font-mono text-xs">{shortAddress(w.address, 5)}</td>
                  <td className="tnum px-3 py-2 font-mono text-xs">{formatPrice(w.costBasisUsd)}</td>
                  <td className="tnum px-3 py-2 font-mono text-xs text-coil">
                    {multiple ? `${multiple.toFixed(1)}×` : '—'}
                  </td>
                  <td className="tnum px-3 py-2 font-mono text-xs text-warn">
                    {formatPct(w.realizedFraction, 0)}
                  </td>
                  <td className="px-5 py-2">
                    <div className="flex flex-wrap gap-1">
                      {w.tags.map((t) => (
                        <Badge key={t} variant="warn">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const METHOD_COPY: Record<string, { label: string; note: string }> = {
  wallet: {
    label: 'per-wallet',
    note: 'Cost basis reconstructed wallet by wallet. The strongest read — it sees who has already begun selling.',
  },
  hybrid: {
    label: 'profile + insiders',
    note: 'The float\u2019s cost basis comes from where volume actually traded; the insider cluster is priced wallet by wallet.',
  },
  'volume-profile': {
    label: 'volume profile',
    note: 'Cost basis inferred from where volume traded, decayed by turnover. Describes the shape of the book but not each holder\u2019s behaviour.',
  },
  none: {
    label: 'unavailable',
    note: 'Neither price history nor holder data was available. There is no distribution behind this read.',
  },
};

function DataQualityPanel({ result }: { result: LockResponse }) {
  const q = result.token.dataQuality;
  const coil = result.signal.coil;
  const method = METHOD_COPY[coil.method] ?? METHOD_COPY.none!;

  return (
    <div className="hud-panel p-6">
      <h3 className="section-title">How this was derived</h3>
      <p className="section-note mb-4">What the numbers rest on.</p>
      <dl className="space-y-2 text-[13px]">
        <Row label="method" value={method.label} />
        <Row label="float priced" value={formatPct(coil.supplyCovered)} />
        <Row label="wallets resolved" value={`${q.holdersResolved} / ${q.holdersResolved + q.holdersUnresolved}`} />
        <Row label="cluster analysis" value={q.clusterAnalysisRan ? 'ran' : 'unavailable'} />
        <Row label="sources" value={result.sources.join(', ') || '—'} />
      </dl>
      <p className="mt-3 border-t border-border/60 pt-2 text-[11px] leading-relaxed text-muted-foreground">
        {method.note}
      </p>
      {result.missing.length > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Degraded: {result.missing.join('; ')}.
        </p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tnum truncate font-mono text-foreground/85">{value}</dd>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-20 animate-pulse rounded-lg bg-secondary/40" />
      <div className="h-32 animate-pulse rounded-lg bg-secondary/30" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="h-[340px] animate-pulse rounded-lg bg-secondary/25" />
        <div className="h-[340px] animate-pulse rounded-lg bg-secondary/25" />
      </div>
    </div>
  );
}
