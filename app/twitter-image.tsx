/**
 * X reads og:image when twitter:image is absent, so this is belt and braces —
 * but some link unfurlers (Slack, Discord, iMessage) are less forgiving, and a
 * re-export costs nothing. Same generator, same bytes, one source of truth.
 */
export { default, runtime, alt, size, contentType } from './opengraph-image';
