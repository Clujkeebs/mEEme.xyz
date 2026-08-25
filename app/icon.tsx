import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/**
 * At 32px only a mark survives, not a wordmark — so the icon is the "EE" that
 * the logotype already highlights in green, on the app's own background. The
 * tab then matches the header instead of showing a default globe.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#080b0e',
          color: '#00e08a',
          fontSize: 21,
          fontWeight: 800,
          letterSpacing: -1,
          borderRadius: 6,
        }}
      >
        EE
      </div>
    ),
    size,
  );
}
