import { ImageResponse } from 'next/og';
import { prisma } from '@/lib/db';
import { summarize } from '@/lib/scoring';

export const runtime = 'nodejs';
export const alt = 'mEEme public track record — every call graded, win or lose';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Regenerated on the same cadence as the page. A social card quoting numbers
// from last week is worse than one quoting none.
export const revalidate = 3600;

const BG = '#080b0e';
const ACCENT = '#00e08a';
const TEXT = '#e6f2f0';
const MUTED = '#8fa3a8';
const DIM = '#5c7178';

/**
 * The card for the page that is the whole trust argument: a public,
 * automatically graded ledger. Posting it should put the actual numbers in the
 * timeline, including bad ones — a track record you only share when it flatters
 * you is not a track record.
 */
export default async function Image() {
  let stats: ReturnType<typeof summarize> | null = null;
  try {
    const rows = await prisma.signalOutcome.findMany({
      where: { grade: { not: 'pending' } },
      select: { grade: true, edgePct: true, signal: { select: { verdict: true } } },
      take: 5000,
      orderBy: { updatedAt: 'desc' },
    });
    stats = summarize(rows.map((r) => ({ ...r, verdict: r.signal.verdict })));
  } catch {
    stats = null;
  }

  const graded = stats ? stats.correct + stats.incorrect : 0;
  const accuracy =
    stats && stats.accuracy !== null ? `${(stats.accuracy * 100).toFixed(0)}%` : '—';
  const edge =
    stats && stats.averageEdgePct !== null
      ? `${stats.averageEdgePct >= 0 ? '+' : ''}${(stats.averageEdgePct * 100).toFixed(1)}%`
      : '—';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: BG,
          backgroundImage:
            'radial-gradient(ellipse at 15% 15%, rgba(0,224,138,0.14), transparent 60%)',
          padding: '56px 64px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <span style={{ fontSize: 38, fontWeight: 800, color: TEXT, letterSpacing: -1 }}>m</span>
              <span style={{ fontSize: 38, fontWeight: 800, color: ACCENT, letterSpacing: -1 }}>EE</span>
              <span style={{ fontSize: 38, fontWeight: 800, color: TEXT, letterSpacing: -1 }}>me</span>
              <span style={{ fontSize: 38, fontWeight: 800, color: DIM, letterSpacing: -1 }}>.xyz</span>
            </div>
            <span
              style={{ fontFamily: 'monospace', fontSize: 16, color: ACCENT, letterSpacing: 6 }}
            >
              PUBLIC TRACK RECORD
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              height: 1,
              marginTop: 22,
              backgroundImage: `linear-gradient(90deg, ${ACCENT}, rgba(0,224,138,0.04))`,
            }}
          />
        </div>

        {graded > 0 ? (
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <Stat label="ACCURACY" value={accuracy} color={ACCENT} />
            <Stat label="CALLS GRADED" value={String(graded)} color={TEXT} />
            <Stat label="AVG EDGE" value={edge} color={TEXT} />
          </div>
        ) : (
          // Before the ledger has graded anything there is nothing to boast
          // about, and a row of zeroes and dashes is a worse advert than the
          // promise itself. Lead with the promise until the numbers exist.
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                fontSize: 74,
                fontWeight: 800,
                color: TEXT,
                letterSpacing: -3,
                lineHeight: 1.05,
              }}
            >
              Every call. Graded.
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 74,
                fontWeight: 800,
                color: ACCENT,
                letterSpacing: -3,
                lineHeight: 1.05,
              }}
            >
              Win or lose.
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 30, color: TEXT, lineHeight: 1.35, maxWidth: 1030 }}>
            Every call the engine makes is published here — win or lose — and graded four hours later
            by a rule that was fixed in code before the call was made.
          </div>
          <div
            style={{
              display: 'flex',
              fontFamily: 'monospace',
              fontSize: 18,
              color: DIM,
              letterSpacing: 1,
              marginTop: 18,
            }}
          >
            meeme.xyz/track-record — it cannot be retuned once the results are in
          </div>
        </div>
      </div>
    ),
    size,
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  // "—" at display size renders as a heavy bar that reads like a redaction, so
  // a placeholder is set down at label scale instead of headline scale.
  const placeholder = value === '—';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginRight: 92 }}>
      <span style={{ fontFamily: 'monospace', fontSize: 16, color: MUTED, letterSpacing: 4 }}>
        {label}
      </span>
      <span
        style={{
          fontSize: placeholder ? 44 : 104,
          fontWeight: 800,
          color: placeholder ? MUTED : color,
          letterSpacing: -4,
          lineHeight: 1,
          marginTop: placeholder ? 28 : 8,
        }}
      >
        {value}
      </span>
    </div>
  );
}
