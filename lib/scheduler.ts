/**
 * In-process scheduler.
 *
 * On a serverless host there is no process to hold a timer, so the cron
 * endpoints have to be poked from outside — which is why GitHub Actions drives
 * them on Vercel. On a persistent host (Railway, Render, Fly, a VPS) that
 * indirection buys nothing and costs reliability: an external pinger adds a
 * shared secret, a network hop, and a best-effort scheduler that silently skips
 * ticks under load.
 *
 * When ENABLE_INTERNAL_CRON is set, the same jobs run here instead.
 *
 * Deliberately setTimeout rather than a cron library: the schedules are fixed
 * intervals, and a dependency that parses cron expressions would be more code
 * than the thing it replaces.
 */

interface Job {
  name: string;
  intervalMs: number;
  /** Delay before the first run, so a cold boot does not fire everything at once. */
  initialDelayMs: number;
  run: () => Promise<unknown>;
}

let started = false;
const timers: NodeJS.Timeout[] = [];

export function internalCronEnabled(): boolean {
  return (process.env.ENABLE_INTERNAL_CRON ?? '').toLowerCase() === 'true';
}

/**
 * Start the schedule. Safe to call more than once — Next may evaluate
 * instrumentation in more than one runtime, and two schedulers would double
 * every alert.
 */
export function startScheduler(): void {
  if (started || !internalCronEnabled()) return;
  started = true;

  const jobs: Job[] = [
    {
      name: 'sweep',
      intervalMs: 5 * 60_000,
      initialDelayMs: 30_000,
      run: async () => (await import('@/lib/jobs')).runSweep(),
    },
    {
      name: 'score',
      intervalMs: 60 * 60_000,
      initialDelayMs: 90_000,
      run: async () => (await import('@/lib/jobs')).runScore(),
    },
    {
      name: 'scan',
      intervalMs: 30 * 60_000,
      initialDelayMs: 150_000,
      run: async () => (await import('@/lib/jobs')).runScan(),
    },
  ];

  for (const job of jobs) {
    const tick = async (): Promise<void> => {
      const started = Date.now();
      try {
        const result = await job.run();
        console.log(`[cron:${job.name}] ok in ${Date.now() - started}ms`, JSON.stringify(result));
      } catch (err) {
        // One failing job must never stop the schedule.
        console.error(`[cron:${job.name}] failed:`, err instanceof Error ? err.message : err);
      }
    };

    const timer = setTimeout(() => {
      void tick();
      const interval = setInterval(() => void tick(), job.intervalMs);
      // Do not hold the process open on shutdown purely for a timer.
      interval.unref?.();
      timers.push(interval);
    }, job.initialDelayMs);
    timer.unref?.();
    timers.push(timer);
  }

  console.log(`[cron] internal scheduler started (${jobs.map((j) => j.name).join(', ')})`);
}

/** For tests and graceful shutdown. */
export function stopScheduler(): void {
  for (const t of timers) clearTimeout(t);
  timers.length = 0;
  started = false;
}
