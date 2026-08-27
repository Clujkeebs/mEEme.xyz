import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/**
 * The mark, reduced for tab size — see components/brand.tsx for what it means.
 *
 * The previous version carried all five bars from the full lockup at 2.6px
 * thick with opacities down to 0.35. Rendered at an actual 16px that is grey
 * mush: it reads as a tiny paragraph of text, not a mark. A favicon is not a
 * shrunken logo, it is a separate drawing of the same idea that has to survive
 * 16 pixels.
 *
 * So: three elements, not six. Thicker strokes, no ghost opacities, and a
 * descending stack — wide bar, spot line, narrow bar — which keeps the
 * distribution reading while making the silhouette impossible to confuse with
 * a hamburger menu, the failure the full logo already had to be rescued from
 * once. The spot line overhangs both bars on either side, as it does in the
 * lockup, and stays the only branded colour.
 *
 * Built from absolutely-positioned divs rather than the SVG component because
 * Satori (behind ImageResponse) supports only a subset of SVG/CSS.
 */

const INK = '#e6f1ee';
const SPOT = '#00f0a0';

export default function Icon() {
  const bar = (top: number, left: number, width: number, opacity: number) => ({
    position: 'absolute' as const,
    top,
    left,
    width,
    height: 4,
    borderRadius: 2,
    background: INK,
    opacity,
  });

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: '#080b0e',
          borderRadius: 7.5,
        }}
      >
        {/* Supply above the spot line. */}
        <div style={bar(6.4, 7, 19, 0.85)} />
        {/* The spot line — overhanging, and the only colour in the mark. */}
        <div
          style={{
            position: 'absolute',
            top: 13.9,
            left: 2,
            width: 28,
            height: 4.2,
            borderRadius: 2.1,
            background: SPOT,
          }}
        />
        {/* Supply below it. */}
        <div style={bar(21.6, 7, 11, 0.5)} />
      </div>
    ),
    size,
  );
}
