import { z } from 'zod';
import { prisma } from '@/lib/db';
import { escapeHtml, sendTelegram, telegramConfigured } from '@/lib/notify';
import { appUrl } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Telegram webhook.
 *
 * The only thing this needs to do is bind a chat to an account. The user opens
 * a deep link carrying a single-use code, taps Start, and Telegram posts
 * `/start <code>` here.
 *
 * Verified by the secret token header rather than a signature — that is the
 * mechanism Telegram provides. Without it this endpoint would let anyone bind
 * their own chat to someone else's account by guessing a code.
 */

const updateSchema = z.object({
  message: z
    .object({
      chat: z.object({ id: z.union([z.number(), z.string()]) }),
      from: z.object({ username: z.string().nullish() }).nullish(),
      text: z.string().nullish(),
    })
    .nullish(),
});

export async function POST(request: Request) {
  if (!telegramConfigured()) return new Response('Telegram is not configured.', { status: 503 });

  const expected = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
  if (!expected.trim()) return new Response('TELEGRAM_WEBHOOK_SECRET is not set.', { status: 503 });
  if (request.headers.get('x-telegram-bot-api-secret-token') !== expected) {
    return new Response('Unauthorized.', { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ ok: true });
  }

  const parsed = updateSchema.safeParse(raw);
  // Always 200 to Telegram: a non-2xx makes it retry the same update forever.
  if (!parsed.success || !parsed.data.message) return Response.json({ ok: true });

  const { chat, from, text } = parsed.data.message;
  const chatId = String(chat.id);
  const body = (text ?? '').trim();

  if (body === '/stop') {
    await prisma.user.updateMany({ where: { telegramChatId: chatId }, data: { notifyTelegram: false } });
    await sendTelegram(chatId, 'Alerts paused. Send /start to turn them back on.');
    return Response.json({ ok: true });
  }

  const match = /^\/start(?:\s+(\S+))?$/.exec(body);
  if (!match) {
    await sendTelegram(
      chatId,
      `Open your <a href="${escapeHtml(appUrl())}/dashboard">watchtower</a> and tap Connect Telegram to link this chat.`,
    );
    return Response.json({ ok: true });
  }

  const code = match[1];
  if (!code) {
    // Started without a code — either already linked, or arrived the long way.
    const existing = await prisma.user.findFirst({ where: { telegramChatId: chatId }, select: { id: true } });
    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data: { notifyTelegram: true } });
      await sendTelegram(chatId, 'This chat is already linked. Alerts are on.');
    } else {
      await sendTelegram(
        chatId,
        `Open your <a href="${escapeHtml(appUrl())}/dashboard">watchtower</a> and tap Connect Telegram to link this chat.`,
      );
    }
    return Response.json({ ok: true });
  }

  const user = await prisma.user.findUnique({ where: { telegramLinkCode: code }, select: { id: true } });
  if (!user) {
    await sendTelegram(chatId, 'That link has expired. Generate a fresh one from your watchtower.');
    return Response.json({ ok: true });
  }

  // Another account may already hold this chat — release it before rebinding,
  // since telegramChatId is unique.
  await prisma.user.updateMany({
    where: { telegramChatId: chatId, NOT: { id: user.id } },
    data: { telegramChatId: null, notifyTelegram: false },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      telegramChatId: chatId,
      telegramUsername: from?.username ?? null,
      // Codes are single use.
      telegramLinkCode: null,
      notifyTelegram: true,
    },
  });

  await sendTelegram(
    chatId,
    [
      '<b>Linked.</b>',
      '',
      'You will get a message when a rung fills, a stop breaks, or the insider cluster starts selling.',
      '',
      'Send /stop any time to pause.',
    ].join('\n'),
  );

  return Response.json({ ok: true });
}
