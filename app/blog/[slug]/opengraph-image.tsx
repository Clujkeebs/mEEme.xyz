import { ImageResponse } from 'next/og';
import { allSlugs, getPost } from '@/lib/blog';

export const runtime = 'nodejs';
export const alt = 'mEEme.xyz field note';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export function generateStaticParams() {
  return allSlugs().map((slug) => ({ slug }));
}

const BG = '#080b0e';
const ACCENT = '#00e08a';
const TEXT = '#e6f2f0';
const MUTED = '#8fa3a8';
const DIM = '#5c7178';

/**
 * Per-post card. Without one, every post shared on X would carry the generic
 * site card and read as the same link four times over — the headline is the
 * whole reason someone clicks a post rather than a homepage.
 */
export default function Image({ params }: { params: { slug: string } }) {
  const post = getPost(params.slug);
  const title = post?.title ?? 'Field notes';
  // Long headlines need to step down or they overflow the safe area; measured
  // against the actual titles rather than guessed.
  const titleSize = title.length > 62 ? 62 : title.length > 44 ? 72 : 82;

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
            'radial-gradient(ellipse at 10% 12%, rgba(0,224,138,0.15), transparent 58%)',
          padding: '56px 64px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <span style={{ fontSize: 34, fontWeight: 800, color: TEXT, letterSpacing: -1 }}>m</span>
              <span style={{ fontSize: 34, fontWeight: 800, color: ACCENT, letterSpacing: -1 }}>EE</span>
              <span style={{ fontSize: 34, fontWeight: 800, color: TEXT, letterSpacing: -1 }}>me</span>
              <span style={{ fontSize: 34, fontWeight: 800, color: DIM, letterSpacing: -1 }}>.xyz</span>
            </div>
            <span style={{ fontFamily: 'monospace', fontSize: 15, color: ACCENT, letterSpacing: 5 }}>
              {(post?.tag ?? 'FIELD NOTES').toUpperCase()}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              height: 1,
              marginTop: 20,
              backgroundImage: `linear-gradient(90deg, ${ACCENT}, rgba(0,224,138,0.04))`,
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: titleSize,
            fontWeight: 800,
            color: TEXT,
            letterSpacing: -2.5,
            lineHeight: 1.1,
            maxWidth: 1030,
          }}
        >
          {title}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', fontSize: 25, color: MUTED, maxWidth: 820, lineHeight: 1.35 }}>
            {post?.description ?? 'How the exit actually works.'}
          </div>
          <div
            style={{
              display: 'flex',
              fontFamily: 'monospace',
              fontSize: 17,
              color: DIM,
              letterSpacing: 1,
            }}
          >
            {post ? `${post.minutes} min` : ''}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
