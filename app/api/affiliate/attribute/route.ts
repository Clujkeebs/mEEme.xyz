import { z } from 'zod';
import { attributeReferral } from '@/lib/affiliate';
import { jsonError, jsonOk } from '@/lib/api';
import { getViewer } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ code: z.string().min(1).max(40) });

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return jsonError('Sign in first.', 401);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('Malformed request body.', 400);
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return jsonError('Enter a code.', 400);

  const result = await attributeReferral(viewer.id, parsed.data.code);
  if (!result.ok) {
    return jsonError(result.error ?? 'Could not attribute that referral.', 400, { failure: result.failure });
  }

  return jsonOk({});
}
