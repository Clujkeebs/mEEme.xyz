import { prisma } from '@/lib/db';
import { appUrl } from '@/lib/stripe';
import { emailConfigured, sendEmail } from './email';
import { escapeHtml, sendTelegram, telegramConfigured } from './telegram';

export { telegramConfigured, telegramBotUsername, escapeHtml, sendTelegram, setTelegramWebhook } from './telegram';
export { emailConfigured } from './email';

/**
 * Alert delivery.
 *
 * The paid tiers sell one thing: the engine reading your positions while you
 * are not, and waking you when something changes. That promise is only as real
 * as this file — an alert that stops at a database row is a lie told to a
 * paying customer.
 */

/** Give up after this many failed attempts so one bad address cannot loop forever. */
export const MAX_DELIVERY_ATTEMPTS = 4;

export interface DeliverableAlert {
  id: string;
  userId: string;
  symbol: string;
  tokenAddress: string;
  kind: string;
  message: string;
  priceUsd: number;
}

const KIND_HEADLINE: Record<string, string> = {
  STOP_HIT: '🔴 STOP HIT',
  INSIDER_DUMP: '🟠 INSIDERS DISTRIBUTING',
  RUNG_HIT: '🟢 RUNG FILLED',
  COIL_CROSS: '🟡 COIL CROSSED',
};

/**
 * Alerts are useless if they fire at 4am for something that can wait. When a
 * user sets quiet hours, non-critical alerts are held; a stop being hit is not
 * something we hold.
 */
export function isQuietNow(
  fromHourUtc: number | null,
  toHourUtc: number | null,
  now: Date = new Date(),
): boolean {
  if (fromHourUtc === null || toHourUtc === null) return false;
  if (fromHourUtc === toHourUtc) return false;
  const hour = now.getUTCHours();
  // A window that wraps past midnight is the common case for sleep.
  return fromHourUtc < toHourUtc
    ? hour >= fromHourUtc && hour < toHourUtc
    : hour >= fromHourUtc || hour < toHourUtc;
}

/** These wake you regardless of quiet hours — they are why you subscribed. */
const ALWAYS_URGENT = new Set(['STOP_HIT', 'INSIDER_DUMP']);

function renderTelegram(alert: DeliverableAlert): string {
  const headline = KIND_HEADLINE[alert.kind] ?? '⚪ ALERT';
  const link = `${appUrl()}/lock?address=${encodeURIComponent(alert.tokenAddress)}`;
  return [
    `<b>${escapeHtml(headline)} · $${escapeHtml(alert.symbol)}</b>`,
    '',
    escapeHtml(alert.message),
    '',
    `<a href="${escapeHtml(link)}">Re-read it now →</a>`,
  ].join('\n');
}

function renderEmail(alert: DeliverableAlert): { subject: string; html: string } {
  const headline = KIND_HEADLINE[alert.kind] ?? 'Alert';
  const link = `${appUrl()}/lock?address=${encodeURIComponent(alert.tokenAddress)}`;
  return {
    subject: `${headline} · $${alert.symbol}`,
    html: `
      <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#080b0e;color:#e6f2f0">
        <div style="font-size:13px;letter-spacing:3px;color:#00e08a;margin-bottom:18px">mEEme · EXIT ENGINE</div>
        <h1 style="font-size:22px;margin:0 0 6px">${escapeHtml(headline)} · $${escapeHtml(alert.symbol)}</h1>
        <p style="font-size:15px;line-height:1.55;color:#9fb3b8;margin:0 0 20px">${escapeHtml(alert.message)}</p>
        <a href="${escapeHtml(link)}" style="display:inline-block;background:#00e08a;color:#06231a;padding:11px 20px;border-radius:6px;text-decoration:none;font-weight:600">Re-read it now</a>
        <p style="font-size:11px;color:#5d6f75;margin-top:28px;line-height:1.5">
          Not financial advice. Manage alerts in your <a href="${escapeHtml(appUrl())}/dashboard" style="color:#00e08a">watchtower</a>.
        </p>
      </div>`,
  };
}

export interface DeliveryOutcome {
  delivered: boolean;
  channels: string[];
  error?: string;
  /** True when the alert was intentionally held, not failed. */
  held?: boolean;
}

/** Send one alert through every channel the user has enabled. */
export async function deliverAlert(alert: DeliverableAlert): Promise<DeliveryOutcome> {
  const user = await prisma.user.findUnique({
    where: { id: alert.userId },
    select: {
      email: true,
      telegramChatId: true,
      notifyTelegram: true,
      notifyEmail: true,
      quietFromHourUtc: true,
      quietToHourUtc: true,
    },
  });
  if (!user) return { delivered: false, channels: [], error: 'user not found' };

  if (
    !ALWAYS_URGENT.has(alert.kind) &&
    isQuietNow(user.quietFromHourUtc, user.quietToHourUtc)
  ) {
    return { delivered: false, channels: [], held: true };
  }

  const channels: string[] = [];
  const errors: string[] = [];

  if (user.notifyTelegram && user.telegramChatId && telegramConfigured()) {
    const res = await sendTelegram(user.telegramChatId, renderTelegram(alert));
    if (res.ok) channels.push('telegram');
    else errors.push(`telegram: ${res.error}`);
  }

  if (user.notifyEmail && user.email && emailConfigured()) {
    const { subject, html } = renderEmail(alert);
    const res = await sendEmail(user.email, subject, html);
    if (res.ok) channels.push('email');
    else errors.push(`email: ${res.error}`);
  }

  if (channels.length > 0) return { delivered: true, channels };

  return {
    delivered: false,
    channels: [],
    error: errors.length > 0 ? errors.join('; ') : 'no delivery channel is configured or connected',
  };
}

/**
 * Drain undelivered alerts. Called by the sweep so a send failure is retried on
 * the next pass rather than dropped.
 */
export async function flushPendingAlerts(limit = 50): Promise<{ sent: number; failed: number; held: number }> {
  const pending = await prisma.alert.findMany({
    where: { deliveredAt: null, attempts: { lt: MAX_DELIVERY_ATTEMPTS } },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  let sent = 0;
  let failed = 0;
  let held = 0;

  for (const alert of pending) {
    const outcome = await deliverAlert(alert);

    if (outcome.held) {
      held++;
      // Held alerts must not burn retry budget — they were never attempted.
      continue;
    }

    if (outcome.delivered) {
      sent++;
      await prisma.alert.update({
        where: { id: alert.id },
        data: {
          deliveredAt: new Date(),
          deliveredVia: outcome.channels.join(','),
          deliveryError: null,
          attempts: { increment: 1 },
        },
      });
    } else {
      failed++;
      await prisma.alert.update({
        where: { id: alert.id },
        data: { attempts: { increment: 1 }, deliveryError: outcome.error?.slice(0, 300) ?? 'unknown' },
      });
    }
  }

  return { sent, failed, held };
}
