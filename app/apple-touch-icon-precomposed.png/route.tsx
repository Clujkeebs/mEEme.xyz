/**
 * Pre-iOS-7 clients look for this "precomposed" variant instead of (or before
 * falling back to) /apple-touch-icon.png. Same image either way — the
 * "precomposed" convention only ever meant "don't add the gloss overlay",
 * which nothing here draws anyway.
 */
export { GET, runtime } from '../apple-touch-icon.png/route';
