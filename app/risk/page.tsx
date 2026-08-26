import type { Metadata } from 'next';
import Link from 'next/link';
import { Bullets, Callout, LegalShell, Section } from '@/components/legal';
import { canonicalMetadata } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Risk Disclosure',
  description: 'What can go wrong when you trade memecoins, and the specific ways this tool can be wrong.',
  ...canonicalMetadata('/risk'),
};

export const revalidate = 86400;

export default function RiskPage() {
  return (
    <LegalShell
      title="Risk Disclosure"
      summary="Read this before you act on anything mEEme tells you. It is not a formality — the second half describes the specific, concrete ways this tool can be wrong, which is information you need in order to use it properly."
    >
      <Callout>
        <strong className="font-semibold">
          You should be prepared to lose everything you put into a memecoin.
        </strong>{' '}
        Not as a figure of speech. The realistic outcome for most of these assets is that they go to
        approximately zero, and a large share of them are engineered from the start to transfer money
        from buyers to their creators. Never trade with money you need — for rent, for debt, for
        anything with a deadline.
      </Callout>

      <Section id="not-advice" heading="This is not financial advice">
        <p>
          mEEme is a software tool. It is not a financial adviser, broker, dealer, or investment
          manager, it is not registered with any financial regulator, and it does not know anything
          about you — your income, your obligations, your tax position, or how much loss you could
          absorb. Nothing it produces is a recommendation to buy, sell, or hold, and nothing on this
          site should be read as a personalised suitability judgement, because none is being made.
        </p>
        <p>
          The verdicts are a published algorithm&rsquo;s reading of public data, stated in strong
          language because a hedged reading is useless in a market that moves this fast. Strong
          language is not confidence, and it is not a promise.
        </p>
      </Section>

      <Section id="market" heading="What can go wrong in the market">
        <Bullets
          items={[
            <><strong className="text-foreground/90">Total loss is the base case.</strong> Most memecoins lose essentially all their value. Being early does not protect you.</>,
            <><strong className="text-foreground/90">Rug pulls and honeypots.</strong> A deployer can remove liquidity, mint unlimited new supply, or write a contract that lets you buy but never sell. mEEme surfaces some of these structural risks, but it cannot catch every one, and a contract can be written specifically to defeat automated checks.</>,
            <><strong className="text-foreground/90">You may not be able to exit at all.</strong> An exit plan assumes there is someone on the other side. In a collapse there frequently is not, at any price. A ladder that says to sell at a level does not mean that level will be reachable.</>,
            <><strong className="text-foreground/90">Slippage, fees and failed transactions.</strong> Volatile markets and network congestion mean you may fill far from the price you saw, or not fill while paying for the attempt anyway.</>,
            <><strong className="text-foreground/90">MEV and front-running.</strong> Your transaction is visible before it settles and can be exploited by bots.</>,
            <><strong className="text-foreground/90">Insiders know more than you.</strong> The people who created a token, and those they gave supply to, will always be better informed than any external analysis, including this one.</>,
            <><strong className="text-foreground/90">Tax.</strong> Trading may create taxable events in your jurisdiction. That is your responsibility, and mEEme does not track, calculate, or report it.</>,
            <><strong className="text-foreground/90">Legality.</strong> Trading these assets is restricted or prohibited in some places. Knowing your local rules is your responsibility.</>,
          ]}
        />
      </Section>

      <Section id="tool-limits" heading="How this specific tool can be wrong">
        <p>
          Every analytics product lists generic risks. These are ours, stated precisely, because you
          cannot calibrate how much to trust a reading without them:
        </p>
        <Bullets
          items={[
            <><strong className="text-foreground/90">Cost basis is usually inferred, not observed.</strong> Unless per-wallet reconstruction is available, mEEme estimates where holders bought by modelling turnover against the traded volume profile. That is a statistical model of a crowd, not a ledger of real people. It can be materially wrong, especially on young tokens with thin history.</>,
            <><strong className="text-foreground/90">Coverage is often partial.</strong> The interface reports what fraction of the float it could actually price, and lowers its confidence accordingly. A reading covering a small share of supply is a hint, not a conclusion — and the confidence figure is itself an estimate.</>,
            <><strong className="text-foreground/90">Upstream data can be wrong or missing.</strong> We depend on third-party market and chain data. Those sources can be stale, rate-limited, incomplete, or simply incorrect, and a confident-looking reading can be built on bad inputs.</>,
            <><strong className="text-foreground/90">Wallet clustering is heuristic.</strong> Identifying &ldquo;insiders&rdquo; from funding patterns produces both false positives and false negatives. Sophisticated actors deliberately break these patterns.</>,
            <><strong className="text-foreground/90">The model can be gamed.</strong> The methodology is public. Anyone who understands it can manufacture on-chain activity designed to produce a favourable reading. Assume some do.</>,
            <><strong className="text-foreground/90">Alerts are best-effort.</strong> They can be delayed, throttled by Telegram or your email provider, or lost entirely. Never build a plan whose safety depends on an alert arriving in time. If you need a hard stop, place it where it executes without us.</>,
            <><strong className="text-foreground/90">Past performance means nothing.</strong> The public track record is a record, not a forecast. We publish it — losses included — so you can judge the tool honestly, not as a claim about future results.</>,
          ]}
        />
      </Section>

      <Section id="security" heading="Custody and security">
        <p>
          mEEme never takes custody of your assets and never needs your private key or seed phrase.{' '}
          <strong className="text-foreground/90">
            Anyone claiming to be mEEme who asks for a seed phrase, a private key, or a wallet
            connection that can move funds is trying to rob you.
          </strong>{' '}
          The wallet scanner only ever needs a public address, and it is read-only.
        </p>
      </Section>

      <Section id="responsibility" heading="Your decisions are yours">
        <p>
          You alone decide what to buy, what to sell, and when. mEEme cannot execute a trade for you,
          and using it does not transfer any part of that responsibility to us. If you are unsure
          whether an asset is appropriate for your situation, speak to a qualified financial
          professional in your jurisdiction — not to a tool, and not to a group chat.
        </p>
        <p>
          The limits of our liability are set out in the{' '}
          <Link href="/terms" className="text-primary underline underline-offset-4">
            terms of service
          </Link>
          .
        </p>
      </Section>

      <Section id="help" heading="If trading has stopped being a choice">
        <p>
          Markets that run 24 hours a day on a phone are built to be compulsive, and losses drive
          chasing. If you are trading money you cannot lose, hiding it from people close to you, or
          unable to stop, that is a recognised harm with real help available — the same services that
          support gambling addiction cover this, and they are free and confidential. In the US:{' '}
          <a
            href="https://www.ncpgambling.org/help-treatment/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-4"
          >
            1-800-GAMBLER
          </a>
          . In the UK:{' '}
          <a
            href="https://www.gamcare.org.uk/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-4"
          >
            GamCare
          </a>
          . Elsewhere, your national health service can point you to the local equivalent. We would
          rather lose a customer than take money from someone in that position.
        </p>
      </Section>
    </LegalShell>
  );
}
