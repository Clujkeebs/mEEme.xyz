import { A, Aside, CTA, H2, Key, OL, P, UL } from '@/components/prose';
import type { Post } from './types';

export const post: Post = {
  slug: 'sell-25-percent-at-2x-is-arbitrary',
  title: 'Why "sell 25% at 2x" is arbitrary — and what to use instead',
  description:
    'The standard memecoin exit ladder is a round number applied to a chart that has never heard of it. Here is what actually decides whether a level fills.',
  published: '2026-08-26',
  minutes: 8,
  tag: 'Exit strategy',
  body: () => (
    <>
      <P>
        Search for how to take profit on a Solana memecoin and you will get the same ladder every
        time: sell 25% at 2x, 25% at 3x, 25% at 5x, let the rest ride. Sometimes the multiples move.
        The structure never does.
      </P>
      <P>
        It is not bad advice. Any pre-committed exit beats deciding while your position is moving,
        and most people lose money precisely because they never picked a number. But it is worth
        being honest about what that ladder actually is: a set of round numbers that were chosen
        because humans like round numbers, applied to a market that has never heard of them.
      </P>

      <Key>
        A price level fills because someone is willing to buy there. Nothing about &ldquo;2x your
        entry&rdquo; says anyone is.
      </Key>

      <H2 id="why-multiples-fail">Why entry multiples are the wrong unit</H2>
      <P>
        Your entry price is a fact about <em>you</em>. It is the number you happened to pay, at the
        moment you happened to click. The market does not know it, does not care about it, and has
        no reason to pause at twice it.
      </P>
      <P>
        What the market does care about is where <em>other people</em> bought. Those are the prices
        with pending decisions attached. A trader who bought at $0.004 and watches price climb back
        to $0.004 after a drawdown is not neutral there — they are a seller waiting to happen, and
        they have been waiting the whole way up.
      </P>
      <P>
        This is why two tokens can both be &ldquo;up 2x&rdquo; and behave completely differently on
        the way down. If your 2x lands in an empty stretch of the price history, there is nothing
        there to stop you. If it lands on a shelf where 18% of the float bought, you are about to
        find out how much of that 18% has been waiting to get out flat.
      </P>

      <H2 id="cost-basis">What actually decides whether a level fills</H2>
      <P>Three things, none of which is your entry:</P>
      <OL
        items={[
          <>
            <strong className="text-foreground/90">How much supply bought near that price.</strong>{' '}
            Every holder has a cost basis, and clusters of them form shelves. Those shelves are
            where supply comes back to market.
          </>,
          <>
            <strong className="text-foreground/90">Whether that supply is above or below spot.</strong>{' '}
            Holders underwater are trapped — they sell into strength to get out flat. Holders in
            profit are coiled — they sell into strength to take the win. Both are supply, but they
            behave on different triggers.
          </>,
          <>
            <strong className="text-foreground/90">How fast that supply is already realizing.</strong>{' '}
            A shelf that is actively distributing is a different animal from one that has sat still
            for six hours. The rate matters as much as the size.
          </>,
        ]}
      />

      <Aside>
        The vocabulary matters here because it is doing real work. <strong>Coiled supply</strong> is
        float sitting below spot in profit — it can leave at any time and it is the overhang you are
        racing. <strong>Trapped supply</strong> is float above spot underwater — it is the ceiling
        you have to eat through on the way up. A full explanation is in{' '}
        <A href="/blog/coiled-and-trapped-supply">coiled and trapped supply</A>.
      </Aside>

      <H2 id="structural-ladder">A ladder built on structure instead of round numbers</H2>
      <P>
        The replacement is not more complicated to execute — it is the same laddered exit. What
        changes is where the rungs go. Instead of picking multiples of your entry, you place rungs
        relative to the supply structure above you:
      </P>
      <UL
        items={[
          <>
            <strong className="text-foreground/90">Under each shelf, not on it.</strong> If a
            meaningful block of trapped supply sits at a price, that is where selling pressure
            arrives. You want to be filled slightly before it, not queued behind it.
          </>,
          <>
            <strong className="text-foreground/90">Weighted by how much supply sits above.</strong>{' '}
            Thin ceiling means you can afford to hold more through it. Heavy ceiling means take more
            off earlier, because each shelf is a place the move can die.
          </>,
          <>
            <strong className="text-foreground/90">With a stop set where the thesis breaks</strong>,
            not at a fixed percentage. If the reason you are holding is a band of coiled supply
            below acting as support, then losing that band is the signal — not an arbitrary
            &minus;40%.
          </>,
        ]}
      />
      <P>
        The practical difference: a round-number ladder puts the same rungs on every token. A
        structural ladder puts different rungs on two tokens that are both up 2x, because the thing
        above them is different.
      </P>

      <H2 id="honest-limits">Where this is harder than it sounds</H2>
      <P>
        Reading the supply structure requires knowing where holders actually bought, and that is not
        published anywhere. It has to be reconstructed — either by walking wallets on-chain, or by
        inferring it from the traded volume profile. Both are estimates. We are explicit about which
        one produced a given read and how much of the float it covered, because a confident-looking
        number built on 12% coverage should not be treated like one built on 80%.
      </P>
      <P>
        It also does not save you from the base rate. Most memecoins go to approximately zero, and a
        better exit plan on a token that rugs is still a loss. This is about not giving back a win
        you already had — which, going by how most positions actually end, is where the money
        mostly goes.
      </P>

      <Key>
        The round-number ladder asks &ldquo;how much have I made?&rdquo; A structural ladder asks
        &ldquo;who still has to sell, and where?&rdquo; Only the second question has an answer the
        market respects.
      </Key>

      <CTA href="/lock" label="Read a token">
        mEEme builds the structural ladder for you — paste a contract address and it will show the
        shelves, the coiled and trapped supply, and where the rungs land.
      </CTA>
    </>
  ),
};
