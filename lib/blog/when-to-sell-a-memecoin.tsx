import { A, Aside, CTA, H2, H3, Key, OL, P, UL } from '@/components/prose';
import type { Post } from './types';

export const post: Post = {
  slug: 'when-to-sell-a-memecoin',
  title: 'When to sell a memecoin: a decision framework, not a feeling',
  description:
    'Most memecoin losses are exit failures, not entry failures. A structured way to decide where to sell, how much, and where to stop, before you are in the trade.',
  published: '2026-08-27',
  minutes: 13,
  tag: 'Exit strategy',
  body: () => (
    <>
      <P>
        The uncomfortable arithmetic of this market is that picking well is not the hard part.
        Plenty of people bought the token that ran 40x. Very few of them still had it at 40x, and a
        good number sold at 2x and then watched the rest happen without them.
      </P>
      <P>
        Entry gets all the tooling because entry is legible. There is a moment, a button, a
        feeling of having done something. The exit is a series of small decisions made while your
        position is moving and your judgement is worst. That asymmetry, not bad picking, is where
        most of the money goes.
      </P>

      <Key>
        You cannot make a good exit decision while the position is open. You can only execute one
        you already made.
      </Key>

      <H2 id="the-three-failures">The three ways exits fail</H2>
      <OL
        items={[
          <>
            <strong>Selling the runner too early.</strong> You take 2x, feel disciplined, and watch
            it go 30x. This is the expensive one, because in a market where a small number of
            outcomes carry the whole return, cutting the tail is cutting the strategy.
          </>,
          <>
            <strong>Holding the loser to zero.</strong> The position is down 40% and selling would
            make it real, so you wait for &ldquo;breakeven,&rdquo; a price that has no meaning to
            anyone but you.
          </>,
          <>
            <strong>Freezing.</strong> The move happens in ninety seconds and you are still
            deciding. Doing nothing is a decision, and it is usually the wrong one.
          </>,
        ]}
      />
      <P>
        All three have the same root cause: no pre-commitment. The fix is not more willpower. It is
        deciding in advance, in writing, when you are calm and have nothing at stake.
      </P>

      <H2 id="wrong-unit">Start by fixing the unit</H2>
      <P>
        The default ladder (25% at 2x, 25% at 3x, let the rest ride) is better than nothing and
        worse than it looks. Its problem is the unit. Your entry price is a fact about you. The
        market has never heard of it and has no reason to pause at twice it.
      </P>
      <P>
        What the market does respond to is where <em>other people</em> bought, because those are
        the prices with pending decisions attached to them. A level where a large block of supply
        goes from underwater to breakeven is a level where a lot of people who have been waiting
        get their chance. That is a real thing about the token. &ldquo;2x your entry&rdquo; is a
        real thing about your wallet.
      </P>
      <P>
        The longer argument is in{' '}
        <A href="/blog/sell-25-percent-at-2x-is-arbitrary">
          why &ldquo;sell 25% at 2x&rdquo; is arbitrary
        </A>
        . The short version: put your rungs where the supply is, not where the round numbers are.
      </P>

      <H2 id="framework">The framework</H2>

      <H3 id="step-1">1. Before you buy, write down the stop</H3>
      <P>
        Not a percentage. A price, and a reason. The useful kind of stop is structural: a level
        below which your reason for being in the trade is no longer true. If you bought because a
        large block of supply above you was trapped and would not sell into weakness, then your
        stop is the price at which that block stops being trapped.
      </P>
      <P>
        A structural stop has a property that a percentage stop does not: when it breaks, you have
        learned something. A 20% stop breaking tells you the price fell 20%.
      </P>

      <H3 id="step-2">2. Place rungs at supply shelves, not at multiples</H3>
      <P>
        Find the price levels where meaningful blocks of holders change psychological state, where
        a cluster goes from down to even, or from small green to life-changing green. Those are
        where selling pressure appears. Sell into it rather than under it.
      </P>
      <P>
        Sizing rule of thumb: take enough at the first shelf to remove the risk of a round trip to
        zero, and deliberately less than feels comfortable after that. The point of a ladder is to
        stay in the trade, not to exit it in instalments.
      </P>

      <H3 id="step-3">3. Decide the runner rule in advance</H3>
      <P>
        Pick, before you are in it, what would make you sell the last tranche. Good answers are
        structural: the insider cluster starts distributing, liquidity thins past a threshold, the
        supply above you flips from trapped to in-profit. Bad answers are emotional: it feels
        toppy, it has gone up a lot, someone posted a chart.
      </P>

      <H3 id="step-4">4. Automate the watching, not the deciding</H3>
      <P>
        The decision should be yours and it should already be made. What should not be yours is the
        vigil: no one watches a chart for eleven hours and makes a good decision at hour eleven.
        Something should be checking whether your levels have been hit and telling you, so the only
        thing you have to do in the moment is execute a decision you made when you were calm.
      </P>
      <Aside>
        This is the actual argument for an exit tool over an entry tool. Entry is a latency race
        against co-located bots and you will lose it. Exit plays out over minutes and hours, which
        is a timescale a human with good information can genuinely compete on. That argument in
        full:{' '}
        <A href="/blog/entry-is-a-race-you-cannot-win">entry is a race you cannot win</A>.
      </Aside>

      <H2 id="win-rate">What a good exit strategy looks like in the numbers</H2>
      <P>
        A well-run memecoin book does not look like a good win rate. It looks like a bad one
        attached to an enormous average winner. Being right 20–25% of the time is normal and fine
        if the winners are multiples and the losers are cut early; being right 60% of the time with
        winners the same size as losers is a slow bleed after fees.
      </P>
      <P>
        This is why a win rate quoted with no payoff attached is a meaningless number, and why you
        should be suspicious of anyone who quotes one. Ask what the average winner and the average
        loser were. We publish ours, including the parts that do not flatter us. The reasoning is
        in{' '}
        <A href="/blog/why-we-publish-every-call">why we publish every call</A>, and the ledger
        itself is on the <A href="/track-record">track record</A>.
      </P>

      <H2 id="mistakes">Five mistakes worth naming</H2>
      <UL
        items={[
          <>
            <strong>Moving the stop down.</strong> If you would not enter here, you are not holding,
            you are hoping. Moving a stop to avoid being stopped out converts a small planned
            loss into an unplanned large one.
          </>,
          <>
            <strong>Averaging down on a thesis that broke.</strong> Adding to a loser is only
            defensible if the reason you bought is still true. Usually it is not, and the position
            is being sized by regret.
          </>,
          <>
            <strong>Taking the whole position off at the first rung.</strong> It feels like
            discipline. It is the single most reliable way to never have a large winner.
          </>,
          <>
            <strong>Using breakeven as a target.</strong> Breakeven is a fact about your entry.
            Nobody else is trading toward it, which is exactly why price so often does not reach it.
          </>,
          <>
            <strong>Confusing liquidity with market cap.</strong> A $4M token with $60k of
            liquidity cannot be exited at anything like the quoted price. Size the position to the
            exit you can actually get, not the one the ticker implies.
          </>,
        ]}
      />

      <H2 id="how-meeme-helps">Where a tool fits</H2>
      <P>
        mEEme exists for exactly the step most people skip: it reconstructs what every holder paid,
        works out which blocks of supply can profitably sell into your exit and which are trapped
        above you, and turns that into a ladder placed at supply shelves and a structural stop with
        a stated reason. Then it watches those levels and tells you when one is hit.
      </P>
      <P>
        It does not know the future, it cannot execute, and it has no idea what you can afford to
        lose. What it can do is make sure the decision is already made before the ninety seconds
        that matter.
      </P>

      <CTA href="/lock" label="Get a ladder and a stop, free">
        Paste a contract address. You get the verdict, the exit ladder, the structural stop and the
        reasoning behind all three.
      </CTA>
    </>
  ),
};
