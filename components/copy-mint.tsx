'use client';

import { Check, Copy } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';

/**
 * A contract address is the one thing on /token that must never be mistyped
 * or mis-selected — the standard scam here is a look-alike address a search
 * result surfaces above the real one. Copy-to-clipboard removes the retyping
 * step; break-all keeps the full 44 characters visible rather than truncated,
 * because a reader who wants to verify it against another source needs to
 * read the whole thing, not just confirm it starts with the right letters.
 */
export function CopyMint({ mint }: { mint: string }) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(mint);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access denied — the address is still selectable and visible.
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card/50 px-3 py-2.5">
      <code className="min-w-0 flex-1 break-all font-mono text-sm text-foreground">{mint}</code>
      <Button size="sm" variant="secondary" onClick={() => void copy()}>
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}
