import { ImageResponse } from 'next/og';
import { prisma } from '@/lib/db';
import type { Verdict } from '@/lib/engine/types';
import { VERDICT_META } from '@/lib/engine/verdict';

export const runtime = 'nodejs';
export const alt = 'mEEme Exit Card';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * The Exit Card.
 *
 * The growth loop: a trader posts a call, the card carries the verdict and the
 * reasoning into the timeline, and anyone who clicks lands on a page that shows
 * whether the call actually worked. That only functions as marketing because
 * the outcome is published either way.
 */

const TONE_COLORS: Record<string, string> = {
  apex: '#00e08a',
  good: '#00e08a',
  neutral: '#7cf7d4',
  warn: '#ffb020',
  danger: '#ff3b30',
};

export default async function Image({ params }: { params: { slug: string } }) {
  let signal: {
    symbol: string;
    verdict: string;
    headline: string;
    coilScore: number;
    insiderCoil: number;
    coiledSupply: number;
  } | null = null;

  try {
    signal = await prisma.signal.findUnique({
      where: { shareSlug: params.slug },
      select: {
        symbol: true,
        verdict: true,
        headline: true,
        coilScore: true,
        insiderCoil: true,
        coiledSupply: true,
      },
    });
  } catch {
    signal = null;
  }

  const meta = signal ? VERDICT_META[signal.verdict as Verdict] : null;
  const accent = meta ? (TONE_COLORS[meta.tone] ?? '#00e08a') : '#00e08a';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#080b0e',
          padding: 64,
          fontFamily: 'monospace',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
            <span style={{ fontSize: 34, color: '#e6f2f0', fontWeight: 700 }}>m</span>
            <span style={{ fontSize: 34, color: '#00e08a', fontWeight: 700 }}>EE</span>
            <span style={{ fontSize: 34, color: '#e6f2f0', fontWeight: 700 }}>me</span>
            <span style={{ fontSize: 16, color: '#6b7f85', letterSpacing: 4, marginLeft: 12 }}>
              EXIT ENGINE
            </span>
          </div>
          <span style={{ fontSize: 44, color: '#e6f2f0', fontWeight: 700 }}>
            ${signal?.symbol ?? '???'}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 88,
              fontWeight: 800,
              color: accent,
              lineHeight: 1,
              letterSpacing: -2,
            }}
          >
            {meta?.label ?? 'SIGNAL'}
          </div>
          <div style={{ display: 'flex', fontSize: 28, color: '#9fb3b8', lineHeight: 1.35, maxWidth: 1000 }}>
            {signal?.headline ?? 'This signal is no longer available.'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 56, alignItems: 'flex-end' }}>
          <Stat label="COIL" value={signal ? signal.coilScore.toFixed(2) : '—'} color={accent} />
          <Stat
            label="COILED SUPPLY"
            value={signal ? `${(signal.coiledSupply * 100).toFixed(1)}%` : '—'}
            color="#ff3b30"
          />
          <Stat
            label="INSIDER COIL"
            value={signal ? `${(signal.insiderCoil * 100).toFixed(1)}%` : '—'}
            color="#ffb020"
          />
          <div style={{ display: 'flex', flex: 1, justifyContent: 'flex-end', fontSize: 20, color: '#6b7f85' }}>
            mEEme.xyz — every call published, win or lose
          </div>
        </div>
      </div>
    ),
    size,
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 15, color: '#6b7f85', letterSpacing: 3 }}>{label}</span>
      <span style={{ fontSize: 46, color, fontWeight: 700 }}>{value}</span>
    </div>
  );
}
