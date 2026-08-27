import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/**
 * The mark, at tab size — see components/brand.tsx for what it means.
 *
 * Hand-built from divs rather than importing the SVG component: Satori (which
 * backs ImageResponse) supports only a subset of SVG/CSS, and a stack of
 * absolutely-positioned rounded divs renders identically here while being
 * guaranteed to survive that subset. The geometry is kept in step with the
 * component deliberately — this is the same logo, not a lookalike.
 */
export default function Icon() {
  const bar = (top: number, left: number, width: number, opacity: number) => ({
    position: 'absolute' as const,
    top,
    left,
    width,
    height: 2.6,
    borderRadius: 1.3,
    background: '#e6f1ee',
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
          borderRadius: 6,
        }}
      >
        <div style={bar(4, 4, 9, 0.45)} />
        <div style={bar(9, 4, 15, 0.62)} />
        <div style={bar(14, 4, 21, 0.8)} />
        {/* Spot line — the branded element. */}
        <div
          style={{
            position: 'absolute',
            top: 19.2,
            left: 2,
            width: 28,
            height: 1.8,
            borderRadius: 0.9,
            background: '#00f0a0',
          }}
        />
        <div style={bar(23.4, 4, 13, 0.62)} />
        <div style={bar(28, 4, 7, 0.35)} />
      </div>
    ),
    size,
  );
}
