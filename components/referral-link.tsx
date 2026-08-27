'use client';

import { Check, Copy } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';

/**
 * One definition of what an affiliate's link looks like.
 *
 * It is shown in two places now — the affiliate dashboard and the Watchtower
 * panel — and the two drifting apart would mean a partner copying a link that
 * attributes to nobody, which nothing in the product would ever surface.
 */
export function referralUrlFor(code: string): string {
  return `https://meeme.xyz/?ref=${code}`;
}

export function ReferralLink({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = React.useState(false);
  const link = referralUrlFor(code);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access denied — the link is still selectable and visible.
    }
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        {/* break-all, not truncate: at 390px a truncated link reads
            "https://meeme.xyz/?ref…" — the code, which is the whole point,
            is the part that gets cut. Copy still works, but a partner who
            wants to read or retype his own link could not. */}
        <code className="min-w-0 flex-1 break-all font-mono text-sm text-foreground">{link}</code>
        <Button size="sm" onClick={() => void copyLink()}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>
    </div>
  );
}
