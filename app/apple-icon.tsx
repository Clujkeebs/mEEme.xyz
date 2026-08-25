import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** Home-screen icon. Same mark as the favicon, with room for the full wordmark cue. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#080b0e',
          backgroundImage:
            'radial-gradient(ellipse at 30% 20%, rgba(0,224,138,0.28), transparent 62%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span style={{ fontSize: 62, fontWeight: 800, color: '#e6f2f0', letterSpacing: -2 }}>m</span>
          <span style={{ fontSize: 62, fontWeight: 800, color: '#00e08a', letterSpacing: -2 }}>EE</span>
        </div>
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 13,
            letterSpacing: 4,
            color: 'rgba(230,242,240,0.55)',
            marginTop: 6,
          }}
        >
          EXIT
        </span>
      </div>
    ),
    size,
  );
}
