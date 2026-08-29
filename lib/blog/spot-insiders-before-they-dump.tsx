import { A, Aside, CTA, H2, H3, Key, OL, P, UL } from '@/components/prose';
import type { Post } from './types';

export const post: Post = {
  slug: 'how-to-tell-if-insiders-are-about-to-dump',
  title: 'How to tell if insiders are about to dump, before they do',
  description:
    'Bundle checkers tell you insiders exist. That is the wrong question. Here is how to read whether they have started selling, and how much room is left.',
  published: '2026-08-27',
  minutes: 11,
  tag: 'Insider forensics',
  body: () => (
    <>
      <P>
        Every rug post-mortem reads the same. A cluster of wallets funded from the same source
        bought in the first block, held quietly through the pump while retail congratulated itself
        on the diamond hands in the chart, and then sold inside a five-minute window. By the time
        the Telegram noticed, the exit was gone.
      </P>
      <P>
        So the standard advice is: check for bundles before you buy. Run the contract through a
        rug scanner, look at the top ten holders, see whether the supply is concentrated. That
        advice is fine and you should do it. It is also, on its own, close to useless, because it
        answers a question that has almost no predictive power.
      </P>

      <Key>
        Knowing insiders <em>exist</em> tells you nothing. Almost every memecoin has them. Knowing
        whether they have <em>started selling</em>, and how much they still hold, is the whole
        signal.
      </Key>

      <H2 id="why-bundle-checks-underperform">Why a bundle check alone underperforms</H2>
      <P>
        Run any hundred Solana launches through a bundle checker and a large majority will flag.
        Coordinated early buying is the normal condition of the market, not the exception. A
        detector that fires on the normal condition has no discriminating power: if it warns on
        four out of five tokens, following it means sitting out four out of five tokens, including
        the ones that ran.
      </P>
      <P>
        The check is also a snapshot of the past. It tells you what happened in the first few
        blocks. It says nothing about the thing that actually determines whether you get out
        cleanly, which is what those wallets do in the next hour.
      </P>
      <P>
        There is a sharper version of the question, and it has three parts.
      </P>

      <H2 id="three-questions">The three things worth measuring</H2>

      <H3 id="q1-cost-basis">1. What did they pay?</H3>
      <P>
        A wallet that bought at a $30k market cap and is looking at a $2M market cap is holding a
        66x. That wallet does not need the token to go higher. It does not need <em>anything</em>.
        Every further tick up is a rounding error against a gain it has already made, which means
        its decision to sell is governed by convenience, not by price.
      </P>
      <P>
        A wallet that bought at $1.8M is in a different world. It is up 11%, it has a thesis, and
        it will hold through a dip because selling now is barely worth the fee.
      </P>
      <P>
        Both wallets show up identically in a top-holder list. They are not remotely the same risk.
        The number that separates them is reconstructed cost basis, what each holder actually
        paid, and it is the single most informative thing you can know about a holder.
      </P>

      <H3 id="q2-realized">2. Have they already started?</H3>
      <P>
        This is the one almost nobody checks, and it is the closest thing to a leading indicator
        that exists here.
      </P>
      <P>
        A cluster that still holds 100% of what it bought is a risk. A cluster that has sold 40% of
        what it bought is not a risk: it is an event already in progress. Distribution is not a
        moment, it is a process, and it is visible in the balance history before it is visible in
        the candles. The wallets that sell first sell into strength, precisely because selling into
        strength is what does not move the price.
      </P>
      <Aside>
        This is why &ldquo;the chart looks fine&rdquo; is not a counter-argument. The chart looking
        fine is the condition under which early distribution happens. If it were visible in the
        price, they would have missed their own exit.
      </Aside>

      <H3 id="q3-remaining">3. How much is left, and how fast is it moving?</H3>
      <P>
        A cluster that has sold 90% of its bag has already done its damage; the remaining 10% is
        not what takes you to zero. A cluster that has sold 30% and is accelerating is the
        dangerous one, because the majority of the supply overhang is still in front of you.
      </P>
      <P>
        The rate matters as much as the level. Two tokens can both show 30% realized. If one got
        there over three days and the other over forty minutes, they are not the same token.
      </P>

      <H2 id="what-to-do">Turning that into a decision</H2>
      <P>
        The three measurements combine into something you can act on rather than worry about:
      </P>
      <OL
        items={[
          <>
            <strong>Cost basis spread.</strong> If the cluster&rsquo;s average entry is far below
            the current price, treat every level above you as supply that can be sold profitably
            into your exit. That is not a prediction that they will. It is an accounting of who
            can.
          </>,
          <>
            <strong>Realized fraction.</strong> Below ~10%, the cluster is dormant. Between 10% and
            35%, it has begun. Above 35% with the price still holding, you are inside the
            distribution, not ahead of it.
          </>,
          <>
            <strong>Velocity.</strong> Compare the realized fraction now against an hour ago. A
            rising rate while price is flat or up is the specific pattern that precedes the
            five-minute window everyone writes post-mortems about.
          </>,
        ]}
      />
      <P>
        None of this requires predicting anyone&rsquo;s intentions. It is bookkeeping on public
        data: who holds, what they paid, and how much of it they have already turned into cash.
      </P>

      <H2 id="limits">What this cannot tell you</H2>
      <P>
        Being straight about the limits, because a tool that only tells you its strengths is
        marketing:
      </P>
      <UL
        items={[
          <>
            <strong>Wallet clustering is inference, not proof.</strong> Shared funding sources are
            strong evidence of coordination and weak evidence of intent. Some clusters are one
            person; some are a launchpad&rsquo;s plumbing; some are unrelated people who both
            withdrew from the same exchange.
          </>,
          <>
            <strong>Cost basis reconstruction degrades.</strong> On a token with thin history or
            heavy wallet-hopping, some holders cannot be priced at all. Any honest read has to say
            what fraction of supply it actually resolved rather than quietly extrapolating from the
            part it could see.
          </>,
          <>
            <strong>It does not stop a contract-level rug.</strong> If mint authority is live or
            the LP is unlocked, holder analysis is irrelevant. The answer is no before you get
            this far. Check the contract first; this is the layer after that one.
          </>,
          <>
            <strong>A cluster can simply hold.</strong> Sometimes the overhang never sells and the
            token runs anyway. Structure is a distribution of outcomes, not a script.
          </>,
        ]}
      />

      <H2 id="how-meeme-does-it">How mEEme measures it</H2>
      <P>
        This is the analysis the Target Lock runs. It reconstructs a cost basis for every holder it
        can price, flags wallets that share a funding source with the deployer or the first buyers,
        and reports two numbers for that cluster: how far in profit it is, and what fraction of its
        peak balance it has already sold. Those feed the verdict, and on a tracked position they
        feed an alert that fires when the realized fraction crosses a threshold while you are
        asleep.
      </P>
      <P>
        It also reports how much of the supply it could actually resolve, so you can tell a
        confident read from a thin one. A tool that returns the same certainty on a token it
        understands and a token it does not is lying to you about one of them.
      </P>

      <CTA href="/lock" label="Run a contract through it, free">
        Paste a mint address and see the cluster, its cost basis, and how much of its bag it has
        already sold.
      </CTA>

      <H2 id="checklist">The short version</H2>
      <UL
        items={[
          <>Check the contract first: mint authority, freeze authority, LP lock. That gate is binary.</>,
          <>Do not ask whether insiders exist. They do. Ask what they paid.</>,
          <>The leading indicator is realized fraction, not concentration.</>,
          <>Rising realized fraction while price holds is the pattern that precedes the dump.</>,
          <>
            Weigh any read by how much supply it actually resolved. See{' '}
            <A href="/blog/coiled-and-trapped-supply">coiled and trapped supply</A> for what the
            distribution means once you have it.
          </>,
        ]}
      />
    </>
  ),
};
