import { sanitizeEnvironment } from '@/lib/env-guard';

/**
 * Runs once per runtime, before any route module is loaded.
 */
export async function register(): Promise<void> {
  sanitizeEnvironment();

  // Only the Node runtime can hold a timer; the edge runtime would start a
  // second scheduler that never fires and logs as if it had.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('@/lib/scheduler');
    startScheduler();
  }
}
