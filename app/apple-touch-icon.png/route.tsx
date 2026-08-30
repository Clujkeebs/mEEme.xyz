import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
const size = { width: 180, height: 180 };

/**
 * Same reasoning as app/favicon.ico/route.ts: iOS looks for this literal path
 * before it reads <link rel="apple-touch-icon">, and app/apple-icon.tsx alone
 * only serves that link's target, not this path. Same drawing as
 * app/apple-icon.tsx, served where iOS actually asks for it.
 */
export async function GET() {
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
