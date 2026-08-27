import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/**
 * Home-screen icon: the same supply-profile mark as the favicon, scaled up
 * with room to breathe, over the app's own glow. See components/brand.tsx for
 * what the bars and the spot line mean.
 */
export default function AppleIcon() {
  const bar = (top: number, width: number, opacity: number) => ({
    position: 'absolute' as const,
    top,
    left: 26,
    width,
    height: 15,
    borderRadius: 7.5,
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
        <div style={bar(24, 52, 0.45)} />
        <div style={bar(52, 86, 0.62)} />
        <div style={bar(80, 121, 0.8)} />
        <div
          style={{
            position: 'absolute',
            top: 110,
            left: 13,
            width: 154,
            height: 10,
            borderRadius: 5,
            background: '#00f0a0',
          }}
        />
        <div style={bar(134, 75, 0.62)} />
        <div style={bar(158, 40, 0.35)} />
      </div>
    ),
    size,
  );
}
