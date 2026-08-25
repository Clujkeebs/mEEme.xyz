import { randomBytes } from 'node:crypto';
import { jsonError, jsonOk } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { telegramBotUsername, telegramConfigured } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Issue a single-use code and the deep link that carries it into the bot. */
export async function POST() {
  const viewer = await getViewer();
  if (!viewer) return jsonError('Sign in first.', 401);

  const bot = telegramBotUsername();
  if (!telegramConfigured() || !bot) {
    return jsonError('Telegram alerts are not configured on this deployment.', 503);
  }

  // Long enough that guessing one is not a way into someone else's account.
  const code = randomBytes(16).toString('base64url');
  await prisma.user.update({ where: { id: viewer.id }, data: { telegramLinkCode: code } });

  return jsonOk({ url: `https://t.me/${bot}?start=${code}`, bot });
}

/** Unlink. */
export async function DELETE() {
  const viewer = await getViewer();
  if (!viewer) return jsonError('Sign in first.', 401);

  await prisma.user.update({
    where: { id: viewer.id },
    data: { telegramChatId: null, telegramUsername: null, telegramLinkCode: null, notifyTelegram: false },
  });
  return jsonOk({ unlinked: true });
}
