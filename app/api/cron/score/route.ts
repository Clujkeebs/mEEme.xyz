import { cronAuthorized, jsonError, jsonOk } from '@/lib/api';
import { runScore } from '@/lib/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * HTTP entry point for the score job. The work itself lives in lib/jobs.ts so the
 * in-process scheduler runs exactly the same code path.
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return jsonError('Unauthorized.', 401);
  return jsonOk(await runScore());
}
