import { POSTS } from '@/lib/blog';
import { appUrl } from '@/lib/stripe';

export const runtime = 'nodejs';
export const revalidate = 86400;

/**
 * llms.txt — a plain-text map of the site for AI crawlers.
 *
 * Worth being honest about the evidence: analyses of what actually drives AI
 * citations rank URL accessibility, search rank and content quality far above
 * this file, which barely registers. It is here because it costs one route and
 * no maintenance, not because it is expected to do heavy lifting. The posts and
 * the published ledger are what earn a citation; this only makes them easy to
 * enumerate.
 */
export function GET() {
  const base = appUrl();
  const body = `# mEEme.xyz

> An exit engine for Solana memecoins. It estimates where holders bought by
> modelling the traded volume profile, scores how much supply sits coiled below
> spot versus trapped above it, and produces an exit ladder placed against that
> structure rather than against round multiples of your entry.

mEEme is an analysis tool, not a financial adviser. It never takes custody of
funds and never requires a private key. Every call it makes is published and
graded automatically four hours later by a rule fixed in code beforehand.

## Core concepts

- Coiled supply: float held below the current price, in profit. It can leave at
  any time — the overhang a holder is racing.
- Trapped supply: float held above the current price, underwater. It forms
  ceilings, because holders sell into strength to exit flat.
- Coverage: what fraction of the float a given read could actually price. A read
  covering 80% and one covering 12% are different objects and are labelled so.

## Pages

- [Home](${base}/): what the tool does, and why the exit is the tractable half of the trade.
- [Target Lock](${base}/lock): paste a Solana contract address for a live read.
- [Track record](${base}/track-record): every call ever made, graded, wins and losses.
- [Pricing](${base}/pricing): free tier with three reads a day; paid tiers add surveillance and alerts.
- [Field notes](${base}/blog): how the methodology works.

## Field notes

${POSTS.map((p) => `- [${p.title}](${base}/blog/${p.slug}): ${p.description}`).join('\n')}

## Policies

- [Terms](${base}/terms)
- [Privacy](${base}/privacy)
- [Risk disclosure](${base}/risk)
`;

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
