import { post as graduation } from './pump-fun-graduation-danger';
import { post as arbitrary } from './exit-ladder-arbitrary';
import { post as insiders } from './spot-insiders-before-they-dump';
import { post as whenToSell } from './when-to-sell-a-memecoin';
import { post as coiled } from './coiled-and-trapped-supply';
import { post as thesis } from './entry-is-a-race-you-cannot-win';
import { post as published } from './why-we-publish-every-call';
import type { Post } from './types';

export type { Post } from './types';

/**
 * The registry. Newest first — the index renders in this order, and freshness
 * is a real citation signal, so the most recent work leads.
 */
export const POSTS: Post[] = [graduation, whenToSell, insiders, thesis, arbitrary, coiled, published];

export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}

export function allSlugs(): string[] {
  return POSTS.map((p) => p.slug);
}
