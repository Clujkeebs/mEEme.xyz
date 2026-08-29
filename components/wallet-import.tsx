'use client';

import { Loader2, Search, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, formatPrice, formatUsd } from '@/lib/utils';

interface Holding {
  mint: string;
  symbol: string;
  name: string;
  balance: number;
  priceUsd: number | null;
  valueUsd: number | null;
  entryPriceUsd: number | null;
  multiple: number | null;
}

export function WalletImport({ available }: { available: boolean }) {
  const router = useRouter();
  const [address, setAddress] = React.useState('');
  const [scanning, setScanning] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [holdings, setHoldings] = React.useState<Holding[] | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [entriesUnavailable, setEntriesUnavailable] = React.useState(false);

  const scan = async (e: React.FormEvent) => {
    e.preventDefault();
    setScanning(true);
    try {
      const res = await fetch('/api/wallet/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: address.trim() }),
      });
      const json = (await res.json()) as
        | { ok: true; holdings: Holding[]; entriesUnavailable: boolean }
        | { ok: false; error: string };

      if (!json.ok) {
        toast.error(json.error);
        return;
      }

      setHoldings(json.holdings);
      setEntriesUnavailable(json.entriesUnavailable);
      // Pre-select everything we could price — that is the whole point of the scan.
      setSelected(new Set(json.holdings.filter((h) => h.entryPriceUsd !== null).map((h) => h.mint)));

      if (json.holdings.length === 0) toast.info('No positions above $5 in that wallet.');
    } catch {
      toast.error('Could not reach the scanner.');
    } finally {
      setScanning(false);
    }
  };

  const importSelected = async () => {
    if (!holdings) return;
    const chosen = holdings.filter((h) => selected.has(h.mint) && h.entryPriceUsd !== null);
    if (chosen.length === 0) {
      toast.error('Nothing selected with a known entry price.');
      return;
    }

    setImporting(true);
    try {
      const res = await fetch('/api/positions/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          positions: chosen.map((h) => ({
            tokenAddress: h.mint,
            symbol: h.symbol,
            size: h.balance,
            entryPriceUsd: h.entryPriceUsd,
          })),
        }),
      });
      const json = (await res.json()) as
        | { ok: true; created: number; skippedAlreadyTracked: number; skippedNoRoom: number; limit: number }
        | { ok: false; error: string };

      if (!json.ok) {
        toast.error(json.error);
        return;
      }

      const notes: string[] = [];
      if (json.skippedAlreadyTracked > 0) notes.push(`${json.skippedAlreadyTracked} already tracked`);
      if (json.skippedNoRoom > 0) notes.push(`${json.skippedNoRoom} over your ${json.limit}-position limit`);

      toast.success(
        `Tracking ${json.created} position${json.created === 1 ? '' : 's'}.` +
          (notes.length ? ` (${notes.join(', ')})` : ''),
      );
      setHoldings(null);
      setAddress('');
      router.refresh();
    } finally {
      setImporting(false);
    }
  };

  const toggle = (mint: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(mint)) next.delete(mint);
      else next.add(mint);
      return next;
    });
  };

  return (
    <section className="hud-panel corner-bracket p-5">
      <h2 className="hud-label mb-1 flex items-center gap-2">
        <Search className="h-3 w-3" /> import from a wallet
      </h2>
      <p className="mb-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
        <span>
          Paste a <strong className="text-foreground/80">public</strong> address. No wallet connection,
          no signature, no approval. Just the same data any block explorer shows. mEEme cannot move
          your funds because it is never given the ability to.
        </span>
      </p>

      {!available ? (
        <p className="rounded border border-warn/40 bg-warn/[0.06] px-3 py-2 text-xs text-warn">
          Wallet scanning needs a Helius key on this deployment. You can still add positions by hand
          below.
        </p>
      ) : (
        <form onSubmit={scan} className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Your Solana wallet address"
            spellCheck={false}
            autoComplete="off"
            className="flex-1 font-mono text-xs"
            required
          />
          <Button type="submit" disabled={scanning}>
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {scanning ? 'Scanning…' : 'Scan'}
          </Button>
        </form>
      )}

      {holdings && holdings.length > 0 && (
        <div className="mt-4">
          {entriesUnavailable && (
            <p className="mb-2 rounded border border-warn/30 bg-warn/[0.05] px-3 py-2 text-[11px] text-warn">
              Could not reconstruct entry prices. Your buys are older than the history window, so rows
              without an entry cannot be tracked automatically; add those by hand.
            </p>
          )}

          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {holdings.map((h) => {
              const importable = h.entryPriceUsd !== null;
              const isSelected = selected.has(h.mint);
              return (
                <li key={h.mint}>
                  <button
                    type="button"
                    disabled={!importable}
                    onClick={() => toggle(h.mint)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded border px-3 py-2 text-left transition-colors',
                      importable
                        ? isSelected
                          ? 'border-primary/50 bg-primary/[0.07]'
                          : 'border-border hover:border-primary/30'
                        : 'cursor-not-allowed border-border/50 opacity-50',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
                        isSelected && importable ? 'border-primary bg-primary' : 'border-border',
                      )}
                    >
                      {isSelected && importable && (
                        <svg viewBox="0 0 12 12" className="h-3 w-3 fill-none stroke-background stroke-2">
                          <path d="M2.5 6.5l2.5 2.5 4.5-5" />
                        </svg>
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">${h.symbol}</span>
                      <span className="tnum block font-mono text-[10px] text-muted-foreground">
                        {h.balance.toLocaleString('en-US', { maximumFractionDigits: 2 })} @{' '}
                        {h.entryPriceUsd ? formatPrice(h.entryPriceUsd) : 'entry unknown'}
                      </span>
                    </span>

                    <span className="text-right">
                      <span className="tnum block font-mono text-sm">{formatUsd(h.valueUsd)}</span>
                      {h.multiple !== null && (
                        <Badge variant={h.multiple >= 1 ? 'default' : 'danger'}>
                          {h.multiple.toFixed(2)}×
                        </Badge>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <Button className="mt-3 w-full" disabled={importing || selected.size === 0} onClick={() => void importSelected()}>
            {importing && <Loader2 className="h-4 w-4 animate-spin" />}
            Track {selected.size} position{selected.size === 1 ? '' : 's'}
          </Button>
        </div>
      )}
    </section>
  );
}
