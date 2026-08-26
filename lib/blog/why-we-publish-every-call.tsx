import { A, Aside, CTA, H2, Key, P, UL } from '@/components/prose';
import { SCORING_VERSION } from '@/lib/scoring';
import type { Post } from './types';

export const post: Post = {
  slug: 'why-we-publish-every-call',
  title: 'Why every call is published, including the bad ones',
  description:
    'Any tool can look accurate if it picks which results to show. Here is the grading rule, why it is fixed in code before a call is made, and what it cannot tell you.',
  published: '2026-08-26',
  minutes: 6,
  tag: 'Trust',
  body: () => (
    <>
      <P>
        Every trading tool claims accuracy. Almost none of them let you check, and the reason is
        structural: if you control which results get shown, you control the accuracy number. Screenshot
        the wins, quietly drop the losses, and any tool can look like an edge.
      </P>
      <P>
        So mEEme publishes the whole ledger. Every non-demo call the engine has ever made appears on
        the <A href="/track-record">track record</A>, in order, with what happened next — wins,
        losses and the ones that went nowhere.
      </P>

      <Key>
        The grading rule lives in the codebase and is versioned in git. It was written before the
        calls it grades, and it runs automatically four hours after each one, so it cannot be
        retuned once the results are in.
      </Key>

      <H2 id="the-rule">The rule</H2>
      <P>
        A call is graded against what price actually did in the following four hours. What counts as
        right depends on what was claimed:
      </P>
      <UL
        items={[
          <>
            <strong className="text-foreground/90">Exit calls</strong> (EXIT IMMEDIATELY, SCALE OUT,
            NO TOUCH) are correct when price fell 10% or more by the horizon, and wrong when it ran
            15% or more without you. Telling someone to leave before a run is a real cost, and it is
            counted as one.
          </>,
          <>
            <strong className="text-foreground/90">Entry calls</strong> (APEX ENTRY, SCALE IN) are
            correct when price rose 10% or more, wrong when it fell 10% or more.
          </>,
          <>
            <strong className="text-foreground/90">ARM EXIT</strong> is vindicated by the drawdown it
            warned about, even if price later recovered. A warning that was right about the risk was
            right, and that is what a warning is for.
          </>,
          <>
            <strong className="text-foreground/90">Anything smaller</strong> is neutral and excluded
            from accuracy entirely. Neutral calls are <em>not</em> counted as wins — the easiest way
            to inflate an accuracy figure is to quietly bank the noise.
          </>,
        ]}
      />

      <Aside>
        The current rule is version {SCORING_VERSION}. If it ever changes, the version changes with
        it, and the change is visible in the repository history rather than applied silently to past
        results.
      </Aside>

      <H2 id="asymmetry">Why exit calls are graded asymmetrically</H2>
      <P>
        A 10% fall makes an exit call right, but it takes a 15% run to make it wrong. That gap is
        deliberate and it is not flattering — it reflects that the two errors do not cost the same
        thing.
      </P>
      <P>
        Being told to exit and watching a modest continuation costs you upside you never had.
        Holding through a collapse costs you capital you did. In a market where the median outcome
        is approximately zero, those are not symmetric, and grading them symmetrically would
        misrepresent what the tool is for.
      </P>
      <P>
        It does mean the accuracy figure is measuring &ldquo;did this protect capital&rdquo; more
        than &ldquo;did this maximise return&rdquo;. That is the honest description of it.
      </P>

      <H2 id="limits">What the track record cannot tell you</H2>
      <UL
        items={[
          <>
            <strong className="text-foreground/90">It is not a forecast.</strong> It is a record of
            what already happened, published so the tool can be judged. Past performance says
            nothing about the next call.
          </>,
          <>
            <strong className="text-foreground/90">Four hours is one horizon.</strong> It suits how
            these positions actually behave, but a call that was right at four hours and wrong at
            twenty-four is recorded as right.
          </>,
          <>
            <strong className="text-foreground/90">It does not model slippage or fees.</strong> It
            grades price movement, not the fill you would have got. Real execution is worse than the
            chart.
          </>,
          <>
            <strong className="text-foreground/90">Early samples mean little.</strong> An accuracy
            figure over a few dozen graded calls is noise wearing a percentage sign. It gets
            meaningful with volume, and it is published from the start anyway.
          </>,
        ]}
      />

      <P>
        None of that makes the ledger worthless — it makes it a measurement with stated limits,
        which is the only kind worth trusting. The alternative on offer everywhere else is a
        screenshot.
      </P>

      <CTA href="/track-record" label="Open the ledger">
        Read the record before you trust anything the engine says. It is public, it is graded
        automatically, and the losses are in there.
      </CTA>
    </>
  ),
};
