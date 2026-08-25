'use client';

import { BellRing, Check, Loader2, Send } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface AlertPrefs {
  telegramLinked: boolean;
  telegramUsername: string | null;
  notifyTelegram: boolean;
  notifyEmail: boolean;
  quietFromHourUtc: number | null;
  quietToHourUtc: number | null;
  email: string | null;
}

export function AlertSettings({
  initial,
  telegramAvailable,
  emailAvailable,
}: {
  initial: AlertPrefs;
  telegramAvailable: boolean;
  emailAvailable: boolean;
}) {
  const [prefs, setPrefs] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);

  const patch = async (body: Partial<AlertPrefs>) => {
    setBusy(true);
    const previous = prefs;
    setPrefs({ ...prefs, ...body });
    try {
      const res = await fetch('/api/notify/prefs', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setPrefs(previous);
        toast.error('Could not save that.');
      }
    } catch {
      setPrefs(previous);
      toast.error('Could not save that.');
    } finally {
      setBusy(false);
    }
  };

  const connectTelegram = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/notify/link', { method: 'POST' });
      const json = (await res.json()) as { ok: boolean; url?: string; error?: string };
      if (json.ok && json.url) {
        window.open(json.url, '_blank', 'noopener,noreferrer');
        toast.info('Tap Start in Telegram, then refresh this page.');
      } else {
        toast.error(json.error ?? 'Could not create a link.');
      }
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    try {
      await fetch('/api/notify/link', { method: 'DELETE' });
      setPrefs({ ...prefs, telegramLinked: false, telegramUsername: null, notifyTelegram: false });
      toast.success('Telegram disconnected.');
    } finally {
      setBusy(false);
    }
  };

  const quietOn = prefs.quietFromHourUtc !== null && prefs.quietToHourUtc !== null;

  return (
    <div className="hud-panel corner-bracket space-y-4 p-5">
      <h2 className="hud-label flex items-center gap-2">
        <BellRing className="h-3 w-3" /> where alerts go
      </h2>

      {/* Telegram */}
      <div className="rounded border border-border/70 bg-background/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Telegram</span>
            {prefs.telegramLinked && (
              <Badge variant="default">
                <Check className="mr-1 h-2.5 w-2.5" />
                {prefs.telegramUsername ? `@${prefs.telegramUsername}` : 'linked'}
              </Badge>
            )}
          </div>

          {!telegramAvailable ? (
            <span className="text-[11px] text-muted-foreground">not configured</span>
          ) : prefs.telegramLinked ? (
            <div className="flex items-center gap-2">
              <Toggle
                on={prefs.notifyTelegram}
                disabled={busy}
                onClick={() => void patch({ notifyTelegram: !prefs.notifyTelegram })}
              />
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void unlink()}>
                Unlink
              </Button>
            </div>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => void connectTelegram()}>
              {busy && <Loader2 className="h-3 w-3 animate-spin" />} Connect
            </Button>
          )}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          The fast channel. A stop breaking is worth knowing about in seconds, not on your next visit.
        </p>
      </div>

      {/* Email */}
      <div className="rounded border border-border/70 bg-background/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-sm font-medium">Email</span>
            {prefs.email && (
              <span className="ml-2 font-mono text-[11px] text-muted-foreground">{prefs.email}</span>
            )}
          </div>
          {emailAvailable ? (
            <Toggle
              on={prefs.notifyEmail}
              disabled={busy || !prefs.email}
              onClick={() => void patch({ notifyEmail: !prefs.notifyEmail })}
            />
          ) : (
            <span className="text-[11px] text-muted-foreground">not configured</span>
          )}
        </div>
      </div>

      {/* Quiet hours */}
      <div className="rounded border border-border/70 bg-background/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">Quiet hours (UTC)</span>
          <Toggle
            on={quietOn}
            disabled={busy}
            onClick={() =>
              void patch(
                quietOn
                  ? { quietFromHourUtc: null, quietToHourUtc: null }
                  : { quietFromHourUtc: 22, quietToHourUtc: 7 },
              )
            }
          />
        </div>
        {quietOn && (
          <div className="mt-2 flex items-center gap-2">
            <HourSelect
              value={prefs.quietFromHourUtc ?? 22}
              disabled={busy}
              onChange={(v) => void patch({ quietFromHourUtc: v })}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <HourSelect
              value={prefs.quietToHourUtc ?? 7}
              disabled={busy}
              onChange={(v) => void patch({ quietToHourUtc: v })}
            />
          </div>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Coil crossings are held during quiet hours. A stop being hit or insiders distributing will
          still wake you — those are the reason you are here.
        </p>
      </div>
    </div>
  );
}

function Toggle({ on, disabled, onClick }: { on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40',
        on ? 'bg-primary' : 'bg-secondary',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-4 w-4 rounded-full bg-background transition-transform',
          on ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

function HourSelect({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-8 rounded border border-input bg-background px-2 font-mono text-xs"
    >
      {Array.from({ length: 24 }, (_, h) => (
        <option key={h} value={h}>
          {String(h).padStart(2, '0')}:00
        </option>
      ))}
    </select>
  );
}
