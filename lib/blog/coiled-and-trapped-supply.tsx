import { A, Aside, CTA, H2, H3, Key, P, UL } from '@/components/prose';
import type { Post } from './types';

export const post: Post = {
  slug: 'coiled-and-trapped-supply',
  title: 'Coiled and trapped supply: reading who still has to sell',
  description:
    'Every holder of a memecoin has a cost basis and a pending decision. Mapping those two things explains most of what price does next.',
  published: '2026-08-26',
  minutes: 9,
  tag: 'Methodology',
  body: () => (
    <>
      <P>
        A memecoin chart tells you where price has been. It does not tell you the thing that
        actually decides where price goes next: how many people are sitting on positions they intend
        to exit, and what price they are waiting for.
      </P>
      <P>
        That information exists. Every unit of float was bought by someone at some price, and that
        price is a strong predictor of what they do next. Reconstructing the distribution of those
        cost bases is the entire idea behind how mEEme reads a token.
      </P>

      <H2 id="two-kinds">Two kinds of overhang</H2>
      <P>
        Split the float at the current price and you get two populations that behave in opposite
        ways.
      </P>

      <H3 id="coiled">Coiled supply — below spot, in profit</H3>
      <P>
        Holders who bought lower than the current price. They are up, they can leave whenever they
        like, and nothing is stopping them. This is the overhang you are racing: the more of the
        float that sits in profit beneath you, the more supply can hit the market on any green
        candle without anyone needing a reason.
      </P>
      <P>
        Coiled supply is not automatically bearish. Early holders who have held through several
        drawdowns have demonstrated they are not quick sellers. But it is potential energy, and
        when it releases it releases fast — which is where the name comes from.
      </P>

      <H3 id="trapped">Trapped supply — above spot, underwater</H3>
      <P>
        Holders who bought higher and are down. They are not choosing to hold; they are waiting to
        get out. Each cluster of them forms a ceiling, because as price climbs back toward their
        entry, a wave of &ldquo;just let me exit flat&rdquo; selling appears.
      </P>
      <P>
        This is why recoveries stall at oddly specific prices. It is not resistance in the technical
        analysis sense. It is a crowd of people who bought there, have been waiting months or hours
        to be made whole, and take the first chance they get.
      </P>

      <Key>
        Coiled supply is what can leave. Trapped supply is what you have to eat through. A token
        with heavy coiled supply and a thin ceiling behaves nothing like one with the reverse, even
        if the charts look identical.
      </Key>

      <H2 id="reconstructing">How you get the distribution without wallet data</H2>
      <P>
        The obvious approach is to walk every holder&rsquo;s transaction history on-chain and compute
        their actual cost basis. It is accurate, and it is expensive — thousands of wallets, each
        needing full history, through a paid RPC provider. For a token that launched four hours ago
        with 9,000 holders, that is not a request you can make on demand.
      </P>
      <P>
        The alternative is to infer it from the traded volume profile. Every candle in a
        token&rsquo;s history has a price range and a volume, so it tells you how much was bought
        near that price. Weight each price bucket by the volume that traded there, apply a decay for
        turnover — supply bought early gets partly resold as the token trades, so old buckets should
        not be counted at full weight forever — and you get an estimated distribution of where the
        float currently sits.
      </P>
      <P>
        This is a statistical model of a crowd, not a ledger of individuals, and it should be
        treated that way. It is wrong most reliably on very young tokens with thin history, where
        there is not enough traded volume to infer much of anything.
      </P>

      <Aside>
        Which is why every read states its method and its coverage — what fraction of the float it
        could actually price. A read covering 80% of supply and a read covering 12% are different
        objects, and collapsing them into one confident-looking score is the main way tools like
        this mislead people. See the <A href="/blog/why-we-publish-every-call">grading policy</A>{' '}
        for how that plays out in the public record.
      </Aside>

      <H2 id="what-it-predicts">What the distribution actually tells you</H2>
      <UL
        items={[
          <>
            <strong className="text-foreground/90">Where a rally stalls.</strong> The first
            meaningful trapped shelf above spot is the most likely place a move runs out of buyers.
          </>,
          <>
            <strong className="text-foreground/90">Where support is real.</strong> A dense band of
            coiled supply just below spot is a level people defended by buying. Losing it means the
            people who bought there are now underwater — the band flips from support to ceiling.
          </>,
          <>
            <strong className="text-foreground/90">Whether a &ldquo;dip&rdquo; is a dip.</strong> If
            price falls through the largest coiled band, everyone in it just became trapped supply.
            The structure above you got heavier, not cheaper.
          </>,
          <>
            <strong className="text-foreground/90">How much room a recovery has.</strong> Thin
            ceiling and price can move quickly. Stacked shelves and every one is a place it can die.
          </>,
        ]}
      />

      <H2 id="insiders">Why insider supply is counted separately</H2>
      <P>
        Not all coiled supply is equal. Float held by wallets that were funded by the same source
        shortly before launch behaves as one decision, not many — it does not trickle out, it leaves
        together. Treating a cluster like that as ordinary retail float understates the risk badly,
        so it is scored on its own rather than averaged into the crowd.
      </P>
      <P>
        Identifying those clusters is heuristic and produces both false positives and false
        negatives. Anyone sophisticated enough to matter can break the funding pattern deliberately,
        and some do.
      </P>

      <CTA href="/lock" label="See the distribution">
        Paste a contract address and mEEme will show you the supply profile — coiled below spot,
        trapped above, with the coverage it was built from.
      </CTA>
    </>
  ),
};
