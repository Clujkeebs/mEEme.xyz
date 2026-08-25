import { sanitizeEnvironment } from '@/lib/env-guard';

/** Runs once per runtime before any route module is loaded. */
export function register(): void {
  sanitizeEnvironment();
}
