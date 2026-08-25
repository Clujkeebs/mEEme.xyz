import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const alt =
  'mEEme.xyz — the Exit Engine. Entry is a race you cannot win. mEEme reads who still has to sell, and tells you when to get out.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * The card that represents the whole product when the domain is pasted into a
 * timeline. It is the first thing most people will ever see of mEEme, and it
 * gets roughly one second of attention, so it carries the contrarian hook
 * rather than a feature list.
 *
 * No remote fonts. Satori would have to fetch them at render time, and a card
 * that fails to generate because a font CDN was slow is worse than one set in
 * the bundled default — the failure mode is a blank card on every share.
 */

const BG = '#080b0e';
const ACCENT = '#00e08a';
const TEXT = '#e6f2f0';
const MUTED = '#8fa3a8';
const DIM = '#5c7178';

/**
 * The distribution shape drawn on the right. Hand-tuned rather than random so
 * every render is identical — a social card that reshuffles between crawls
 * looks broken to anyone who sees it twice. Read top to bottom: a thin tail of
 * holders trapped well above spot, thickening toward it, then the heavier
 * coiled band sitting just underneath.
 */
const BANDS: { w: number; above: boolean }[] = [
  { w: 54, above: true },
  { w: 88, above: true },
  { w: 132, above: true },
  { w: 176, above: true },
  { w: 228, above: true },
  { w: 196, above: true },
  { w: 150, above: true },
  { w: 232, above: false },
  { w: 310, above: false },
  { w: 374, above: false },
  { w: 286, above: false },
  { w: 208, above: false },
  { w: 140, above: false },
  { w: 82, above: false },
];

export default function Image() {
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
          // Two soft pools of light: one green behind the headline, one cool
          // in the corner, so the flat black reads as a lit room instead of an
          // empty PNG.
          // Satori's gradient parser rejects the explicit-size form
          // (`radial-gradient(900px 500px at ...)`) with "missing comma before
          // color stops". The shape-and-position form is what it accepts.
          backgroundImage:
            'radial-gradient(ellipse at 12% 18%, rgba(0,224,138,0.15), transparent 60%), radial-gradient(ellipse at 92% 96%, rgba(0,140,255,0.12), transparent 62%)',
          padding: '56px 64px',
          position: 'relative',
        }}
      >
        {/* Corner brackets — the cockpit motif from the app itself. */}
        <div
          style={{
            position: 'absolute',
            top: 26,
            left: 26,
            width: 44,
            height: 44,
            borderTop: `2px solid ${ACCENT}`,
            borderLeft: `2px solid ${ACCENT}`,
            opacity: 0.5,
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 26,
            right: 26,
            width: 44,
            height: 44,
            borderBottom: `2px solid ${ACCENT}`,
            borderRight: `2px solid ${ACCENT}`,
            opacity: 0.5,
          }}
        />

        {/* Supply profile motif.
            The card was text-only with a dead right third, and in a timeline
            that reads as a quote card rather than a tool. This is the app's own
            signature chart: trapped supply stacked above spot in red, coiled
            supply below it in green. Kept at low opacity and behind nothing —
            it sits in space the type never reaches, so it adds recognition
            without competing with the headline. */}
        <div
          style={{
            position: 'absolute',
            right: 74,
            top: 176,
            width: 400,
            height: 300,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          {BANDS.map((b, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                width: b.w,
                height: 11,
                marginBottom: 6,
                borderRadius: 2,
                background: b.above ? 'rgba(255,59,48,0.46)' : 'rgba(0,224,138,0.62)',
              }}
            />
          ))}
        </div>
        {/* Spot price line — the axis the whole read is relative to. */}
        <div
          style={{
            position: 'absolute',
            right: 74,
            top: 326,
            width: 400,
            height: 2,
            display: 'flex',
            background: 'rgba(230,242,240,0.55)',
          }}
        />
        {/* Sits to the left of the axis, in the gap between the headline and
            the chart. Over the bars it was unreadable. */}
        <div
          style={{
            position: 'absolute',
            right: 484,
            top: 317,
            display: 'flex',
            fontFamily: 'monospace',
            fontSize: 13,
            letterSpacing: 3,
            color: 'rgba(230,242,240,0.55)',
          }}
        >
          SPOT
        </div>

        {/* ── Header ── */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <span style={{ fontSize: 38, fontWeight: 800, color: TEXT, letterSpacing: -1 }}>m</span>
              <span style={{ fontSize: 38, fontWeight: 800, color: ACCENT, letterSpacing: -1 }}>EE</span>
              <span style={{ fontSize: 38, fontWeight: 800, color: TEXT, letterSpacing: -1 }}>me</span>
              <span style={{ fontSize: 38, fontWeight: 800, color: DIM, letterSpacing: -1 }}>.xyz</span>
            </div>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 16,
                color: ACCENT,
                letterSpacing: 6,
                opacity: 0.9,
              }}
            >
              THE EXIT ENGINE
            </span>
          </div>
          {/* In flow, so it can never land on top of the line below it. */}
          <div
            style={{
              display: 'flex',
              height: 1,
              marginTop: 22,
              backgroundImage: `linear-gradient(90deg, ${ACCENT}, rgba(0,224,138,0.04))`,
            }}
          />
        </div>

        {/* ── Hook ── */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontFamily: 'monospace',
              fontSize: 18,
              color: MUTED,
              letterSpacing: 4,
            }}
          >
            EVERY MEMECOIN TOOL IS BUILT FOR THE ENTRY
          </div>
          {/* Two tones: the setup in white, the payoff in green. An all-green
              headline at this size has no internal hierarchy and just shouts. */}
          <div
            style={{
              display: 'flex',
              fontSize: 82,
              fontWeight: 800,
              color: TEXT,
              letterSpacing: -3,
              lineHeight: 1.06,
              marginTop: 18,
            }}
          >
            Entry is a race
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 82,
              fontWeight: 800,
              color: ACCENT,
              letterSpacing: -3,
              lineHeight: 1.06,
            }}
          >
            you cannot win.
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 30,
              color: MUTED,
              marginTop: 22,
              lineHeight: 1.35,
            }}
          >
            mEEme reads who still has to sell, and tells you when to get out.
          </div>
        </div>

        {/* ── Proof bar ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Chip label="COIL SCORE" />
            <Chip label="EXIT LADDER" />
            <Chip label="LIVE ALERTS" />
          </div>
          <div
            style={{
              display: 'flex',
              fontFamily: 'monospace',
              fontSize: 18,
              color: DIM,
              letterSpacing: 1,
              marginRight: 34,
            }}
          >
            every call published — win or lose
          </div>
        </div>
      </div>
    ),
    size,
  );
}

function Chip({ label }: { label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        fontFamily: 'monospace',
        fontSize: 17,
        color: TEXT,
        letterSpacing: 3,
        border: '1px solid rgba(0,224,138,0.35)',
        background: 'rgba(0,224,138,0.07)',
        borderRadius: 6,
        padding: '9px 16px',
        marginRight: 12,
      }}
    >
      {label}
    </div>
  );
}
