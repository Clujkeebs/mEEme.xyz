import type { Metadata } from 'next';
import Link from 'next/link';
import { Callout, LegalShell, Section } from '@/components/legal';
import { BRAND_TOKEN_LINKS, BRAND_TOKEN_MINT, BRAND_TOKEN_SYMBOL } from '@/lib/brand-token';
import { canonicalMetadata } from '@/lib/seo';
import { CopyMint } from '@/components/copy-mint';

export const metadata: Metadata = {
  title: `${BRAND_TOKEN_SYMBOL} — our own token`,
  description:
    'mEEme launched a token and holds some of it. This page discloses that plainly and says exactly where the line is between promotion and analysis.',
  ...canonicalMetadata('/token'),
};

export const revalidate = 86400;

/**
 * This page exists because we hold a token and are promoting it, and a
 * memecoin analysis tool doing that without saying so in the one place a
 * reader would look is exactly the conflict of interest Terms §13 forbids
 * everyone else from hiding. The disclosure comes first, in the same weight
 * as the rest of the page — not a footnote underneath a buy button.
 */
export default function TokenPage() {
  return (
    <LegalShell
      title={`${BRAND_TOKEN_SYMBOL} — our own token`}
      summary="We built this tool, we also launched a token, and we hold some of it. This page is promotion, not analysis — read it as that."
    >
      <Callout>
        <strong className="font-semibold">This is a conflict of interest, stated plainly.</strong> mEEme
        analyses memecoins for a living and this is one of ours. Nothing below is a signal, a verdict,
        or a coil score — it is us telling you a token exists and that we would benefit if you bought
        it. Treat it exactly that skeptically.
      </Callout>

      <Section id="what" heading="What this is">
        <p>
          {BRAND_TOKEN_SYMBOL} is a token we launched on pump.fun. We hold a share of the supply, and
          this page — along with a small link in the footer — is us promoting it. That is the entire
          relationship between this page and the rest of the site: nowhere else does mEEme mention it,
          and this page does not pretend to be anything other than promotion.
        </p>
      </Section>

      <Section id="mint" heading="Contract address">
        <p>
          Solana. Verify this against the address in our own X bio or pinned post before you trust any
          copy of it you find elsewhere — a fake contract with the same name is the single most common
          scam run against a real token&rsquo;s own community.
        </p>
        <CopyMint mint={BRAND_TOKEN_MINT} />
        <p className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
          <a
            href={BRAND_TOKEN_LINKS.pumpFun}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-4"
          >
            View on pump.fun
          </a>
          <a
            href={BRAND_TOKEN_LINKS.dexscreener}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-4"
          >
            Chart on DexScreener
          </a>
          <a
            href={BRAND_TOKEN_LINKS.solscan}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-4"
          >
            View on Solscan
          </a>
        </p>
      </Section>

      <Section id="boundary" heading="What this does not change">
        <p>
          The Alpha Engine has no idea this page exists. If {BRAND_TOKEN_SYMBOL} ever prices high enough
          to enter the scanner&rsquo;s normal candidate pool, it is read by the same code, against the
          same liquidity and volume floors, the same confidence floor, and published to the same public{' '}
          <Link href="/track-record" className="text-primary underline underline-offset-4">
            track record
          </Link>{' '}
          as every other call — good or bad. No file in this codebase gives this mint different
          treatment, and none will be added; that boundary is the whole reason the rest of the site is
          worth trusting.
        </p>
      </Section>

      <Section id="risk" heading="The risk is the same, or worse">
        <p>
          Everything in the{' '}
          <Link href="/risk" className="text-primary underline underline-offset-4">
            Risk Disclosure
          </Link>{' '}
          applies here without exception. A token this young and this small can go to zero, and the
          fact that we made it does not make it safer — if anything, hold on to that scepticism harder,
          not less, because the people telling you about it have a direct financial interest in you
          buying. Never spend money you need.
        </p>
      </Section>
    </LegalShell>
  );
}
