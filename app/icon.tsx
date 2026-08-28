import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/**
 * The mark, reduced for tab size — see components/brand.tsx for what it means.
 *
 * A favicon is not a shrunken logo, it is a separate drawing of the same idea
 * that has to survive 16 pixels. An earlier version carried all five bars from
 * the full lockup at 2.6px thick with opacities down to 0.35; rendered at an
 * actual 16px that is grey mush, and it reads as a tiny paragraph of text.
 *
 * So: four elements, not six. A vertical price axis with two unequal supply
 * bars hanging off it and the spot line crossing. Two bars rather than three
 * is the point — three horizontal bars is a hamburger icon at any size, and
 * the axis is what turns the remaining strokes into a chart. Thicker strokes,
 * no ghost opacities, and the spot line stays the only branded colour.
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
        {/* The price axis the supply hangs off — the element that makes the
            remaining strokes read as a chart rather than as a menu. */}
        <div
          style={{
            position: 'absolute',
            top: 5.6,
            left: 6.6,
            // Thicker and brighter than the axis in the full lockup: at a
            // real 16px, 2.2 units is barely one pixel and the axis — the
            // element doing the work of saying "chart" — disappears entirely.
            width: 3,
            height: 20.8,
            borderRadius: 1.5,
            background: INK,
            opacity: 0.55,
          }}
        />
        {/* Supply above the spot line. */}
        <div style={bar(7.4, 10.4, 15.4, 0.9)} />
        {/* The spot line — crossing the axis, and the only colour in the mark. */}
        <div
          style={{
            position: 'absolute',
            top: 13.9,
            left: 2.4,
            width: 26.4,
            height: 4.2,
            borderRadius: 2.1,
            background: SPOT,
          }}
        />
        {/* Supply below it. */}
        <div style={bar(20.4, 10.4, 8.2, 0.62)} />
      </div>
    ),
    size,
  );
}
