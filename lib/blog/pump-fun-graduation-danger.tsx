import { A, Aside, CTA, H2, H3, Key, P, UL } from '@/components/prose';
import type { Post } from './types';

export const post: Post = {
  slug: 'pump-fun-graduation-danger',
  title: 'Pump.fun graduation: why the safest-looking moment is the most dangerous one to hold',
  description:
    'Graduating to Raydium looks like validation. Structurally, it is the moment the one buyer keeping the price up disappears and the whole float becomes free to sell at once.',
  published: '2026-08-31',
  minutes: 8,
  tag: 'Mechanics',
  body: () => (
    <>
      <P>
        A pump.fun token &ldquo;graduating&rdquo; to Raydium is treated as a milestone worth
        celebrating. It gets called out in every Telegram alpha group as proof the coin is real
        money now, not a bonding-curve toy. That reading gets the mechanics backwards. Graduation
        is not the market approving of a token. It is the moment its price stops having a
        guaranteed floor.
      </P>

      <H2 id="bonding-curve">What the bonding curve was actually doing</H2>
      <P>
        Before graduation, every buy and sell on pump.fun routes through the bonding curve itself,
        not against other holders. The curve is the counterparty to every trade: it has a fixed
        formula, so at any given amount of SOL raised there is exactly one price, and that price
        can only move along the curve as more SOL comes in. There is no order book, no bid-ask
        spread, and critically, no way for the price to gap down on thin liquidity &mdash; the
        curve itself is the liquidity, and it is bottomless up to the amount of SOL it has
        collected.
      </P>
      <P>
        That is a strange kind of safety. It does not mean a curve token cannot go to zero &mdash;
        it can, as sellers walk the curve back down just as mechanically as buyers walked it up.
        But it means every seller is trading against a known, deterministic function instead of
        against whoever else happens to be online. The curve does not run out of bids the way a
        thin order book does.
      </P>

      <H3 id="graduation-trigger">What triggers graduation</H3>
      <P>
        Once the curve collects roughly 85 SOL (pump.fun periodically tunes the exact figure), it
        &ldquo;completes.&rdquo; The remaining bonding-curve liquidity, plus the SOL raised, gets
        deposited into a fresh Raydium pool, the LP tokens are burned, and trading moves
        permanently off the curve and onto that pool. This is the graduation everyone is
        celebrating.
      </P>

      <Key>
        The curve&rsquo;s deterministic pricing function is switched off at graduation and replaced
        with a constant-product AMM pool sized by whatever liquidity happened to migrate. That pool
        is very often thin relative to the float that can now sell into it &mdash; and thin
        liquidity is exactly the condition the curve had been protecting everyone from.
      </Key>

      <H2 id="why-dangerous">Why the switch itself is the danger</H2>
      <P>
        Three things change at the exact same moment, and each one independently increases sell
        pressure into a pool that is smaller than the curve it replaced:
      </P>
      <UL
        items={[
          <>
            <strong className="text-foreground/90">The floor disappears.</strong> The curve
            guaranteed a price for any sell size, however large, because it was the sole
            counterparty. A Raydium pool has finite depth. A sell that the curve would have
            absorbed with a predictable slippage now moves price by however much that specific
            pool can take &mdash; which after a typical migration is a fraction of what was
            trading on the curve minutes earlier.
          </>,
          <>
            <strong className="text-foreground/90">The insiders who rode the curve up cash out
            first.</strong> Wallets that bought early on the curve are sitting on the largest
            unrealized gains in the token&rsquo;s life at exactly the moment a fresh, thin pool
            opens. They do not need a reason to sell into it &mdash; they have been waiting for
            liquidity deep enough to matter, and graduation is the first time that liquidity
            exists off the curve.
          </>,
          <>
            <strong className="text-foreground/90">New buyers arrive believing the graduation
            itself is the signal.</strong> &ldquo;It graduated&rdquo; reads as a stamp of
            legitimacy to anyone watching from outside, which pulls in exactly the buyers whose
            capital absorbs the early holders&rsquo; exit. The graduation is not attracting smart
            money; it is providing an exit to the money that was already in.
          </>,
        ]}
      />
      <P>
        This is the coiled-supply mechanic described in{' '}
        <A href="/blog/coiled-and-trapped-supply">coiled and trapped supply</A> playing out at
        maximum intensity: the largest concentration of in-profit float in the token&rsquo;s
        history meets the thinnest liquidity it has ever traded against, at a moment the crowd has
        been trained to read as bullish.
      </P>

      <H2 id="what-to-check">What actually matters at graduation</H2>
      <P>
        &ldquo;Did it graduate&rdquo; is not the useful question. These are:
      </P>
      <UL
        items={[
          <>
            <strong className="text-foreground/90">How much of the float is still coiled below
            spot.</strong> A token where most early buyers already sold down through several
            drawdowns before graduating has less overhang left than one that went straight up. The
            price path getting there matters as much as the fact of arriving.
          </>,
          <>
            <strong className="text-foreground/90">How much of that coiled float is insider
            supply.</strong> See{' '}
            <A href="/blog/spot-insiders-before-they-dump">how to identify it</A>. Insider-heavy
            coil sells together, not gradually, which is the worst possible shape of pressure to
            meet a newly thin pool.
          </>,
          <>
            <strong className="text-foreground/90">The size of the migrated pool relative to the
            curve it replaced.</strong> A larger post-graduation pool absorbs the same sell size
            with less slippage. This is checkable on-chain within seconds of the migration
            transaction landing, and it is the single best predictor of how violent the first
            hour post-graduation will be.
          </>,
        ]}
      />

      <Aside>
        None of this means graduation is bearish by default, and plenty of tokens graduate and
        continue up. It means the graduation event itself carries no informational content about
        which outcome you are getting &mdash; the crowd narrative and the actual mechanics point in
        opposite directions, and only the supply distribution underneath tells you which one you
        are looking at.
      </Aside>

      <H2 id="in-practice">In practice</H2>
      <P>
        If you are holding into a graduation, the ladder and stop matter more in that hour than at
        any other point in the token&rsquo;s life, because the price impact of the same sell size
        just changed by an order of magnitude and most holders have no way to see that happen. A
        stop set for curve-era liquidity is not sized for post-graduation liquidity, and leaving it
        unchanged is the single most common way a graduation turns a good trade into a bad exit.
      </P>

      <CTA href="/lock" label="Check the supply behind a graduated token">
        Paste the contract address and mEEme reads the coiled and trapped supply on the current
        pool, insiders separated out, so you know what the migration actually changed.
      </CTA>
    </>
  ),
};
