import { z } from 'zod';
import { jsonError, jsonOk } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  notifyTelegram: z.boolean().nullish(),
  notifyEmail: z.boolean().nullish(),
  quietFromHourUtc: z.number().int().min(0).max(23).nullable().optional(),
  quietToHourUtc: z.number().int().min(0).max(23).nullable().optional(),
});

export async function PATCH(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return jsonError('Sign in first.', 401);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('Malformed request body.', 400);
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return jsonError('Invalid preferences.', 400, { issues: parsed.error.issues });

  const user = await prisma.user.update({
    where: { id: viewer.id },
    data: {
      ...(parsed.data.notifyTelegram !== null && parsed.data.notifyTelegram !== undefined
        ? { notifyTelegram: parsed.data.notifyTelegram }
        : {}),
      ...(parsed.data.notifyEmail !== null && parsed.data.notifyEmail !== undefined
        ? { notifyEmail: parsed.data.notifyEmail }
        : {}),
      ...('quietFromHourUtc' in parsed.data ? { quietFromHourUtc: parsed.data.quietFromHourUtc ?? null } : {}),
      ...('quietToHourUtc' in parsed.data ? { quietToHourUtc: parsed.data.quietToHourUtc ?? null } : {}),
    },
    select: {
      notifyTelegram: true,
      notifyEmail: true,
      quietFromHourUtc: true,
      quietToHourUtc: true,
      telegramChatId: true,
    },
  });

  return jsonOk({ prefs: { ...user, telegramLinked: Boolean(user.telegramChatId), telegramChatId: undefined } });
}
