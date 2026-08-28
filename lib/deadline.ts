/**
 * A bound on how long a page will wait for something it does not control.
 *
 * This exists because of a specific outage: the landing page renders a real
 * engine read, that read reaches a third-party API, the API rate-limited, and
 * because the page is statically generated the slow fetch was not a slow page
 * — it was three failed deploys in a row. Anything on a render path that
 * crosses the network needs a deadline it cannot exceed, and a sensible thing
 * to show when it does.
 */

/**
 * Resolves to `work`'s value, or to `null` if it has not settled within `ms`.
 *
 * The abandoned promise keeps running; this bounds how long the *caller*
 * waits, not the work itself. That is the right shape here — the callers are
 * renders that need something on the screen now, and a fetch that finishes
 * later is harmless. It also means `work` must not be allowed to reject
 * unhandled once abandoned, which is why the rejection is absorbed rather
 * than left to become an unhandled rejection that crashes the process.
 */
export async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined;

  // Once we may stop waiting for `work`, nothing else is attached to it — an
  // unhandled rejection from an abandoned fetch would take the process down.
  const guarded = work.catch(() => null);

  try {
    return await Promise.race([
      guarded,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
        // Never hold the process open purely to give up on something.
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
