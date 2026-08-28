import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/**
 * Home-screen icon: the same four-element reduction as the favicon, scaled up
 * over the app's own glow. See components/brand.tsx for what the axis, the
 * bars and the spot line mean, and app/icon.tsx for why the tab mark drops to
 * four elements rather than carrying all five bars from the full lockup.
 */
export default function AppleIcon() {
  const bar = (top: number, width: number, opacity: number) => ({
    position: 'absolute' as const,
    top,
    left: 55,
    width,
    height: 23,
    borderRadius: 11.5,
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
          backgroundImage:
            'radial-gradient(ellipse at 30% 20%, rgba(0,224,138,0.28), transparent 62%)',
        }}
      >
        {/* Same four-element reduction as the favicon, scaled to 180 — the
            home-screen icon is often rendered small too, and two drawings of
            one mark drifting apart is how a brand stops being recognisable. */}
        <div
          style={{
            position: 'absolute',
            top: 31,
            left: 37,
            width: 12,
            height: 117,
            borderRadius: 6,
            background: '#e6f1ee',
            opacity: 0.42,
          }}
        />
        <div style={bar(42, 87, 0.9)} />
        <div
          style={{
            position: 'absolute',
            top: 78,
            left: 13,
            width: 149,
            height: 24,
            borderRadius: 12,
            background: '#00f0a0',
          }}
        />
        <div style={bar(115, 46, 0.5)} />
      </div>
    ),
    size,
  );
}
