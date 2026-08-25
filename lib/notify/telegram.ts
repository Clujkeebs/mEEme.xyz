import { z } from 'zod';
import { fetchJson, providerConfigured } from '@/lib/providers/http';

/**
 * Telegram delivery.
 *
 * Chosen over push or SMS because it is where this audience already lives, it
 * costs nothing, it needs no app install for most users, and it delivers in
 * seconds. An exit alert that arrives in ten minutes is not an exit alert.
 */

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
export const telegramConfigured = (): boolean => providerConfigured(TOKEN);

/** The bot's @name, used to build the deep link the user clicks. */
export const telegramBotUsername = (): string | null =>
  process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, '') || null;

const API = (method: string): string => `https://api.telegram.org/bot${TOKEN}/${method}`;

const sendSchema = z.object({
  ok: z.boolean(),
  description: z.string().nullish(),
  result: z.object({ message_id: z.number().nullish() }).nullish(),
});

/**
 * Telegram's HTML subset is narrow and unescaped user content breaks the whole
 * message, so everything interpolated goes through here.
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function sendTelegram(
  chatId: string,
  html: string,
  options?: { disablePreview?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  if (!telegramConfigured()) return { ok: false, error: 'TELEGRAM_BOT_TOKEN is not set' };

  const res = await fetchJson({
    provider: 'telegram:sendMessage',
    url: API('sendMessage'),
    schema: sendSchema,
    timeoutMs: 10_000,
    retries: 1,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
        disable_web_page_preview: options?.disablePreview ?? true,
      }),
    },
  });

  if (!res) return { ok: false, error: 'no response from Telegram' };
  if (!res.ok) return { ok: false, error: res.description ?? 'Telegram rejected the message' };
  return { ok: true };
}

/** Point the bot at our webhook. Idempotent; safe to call on every deploy. */
export async function setTelegramWebhook(url: string, secretToken: string): Promise<boolean> {
  if (!telegramConfigured()) return false;
  const res = await fetchJson({
    provider: 'telegram:setWebhook',
    url: API('setWebhook'),
    schema: z.object({ ok: z.boolean(), description: z.string().nullish() }),
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url,
        secret_token: secretToken,
        allowed_updates: ['message'],
      }),
    },
  });
  return Boolean(res?.ok);
}
