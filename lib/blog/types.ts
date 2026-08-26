import type { ReactNode } from 'react';

/**
 * Blog posts are typed modules rather than MDX files.
 *
 * MDX would mean a new dependency, a build-pipeline change and a second way
 * for the build to fail, for a handful of posts whose bodies are already
 * written in JSX. This keeps every post type-checked, lets a post import live
 * values from the engine (tier prices, scoring constants) so the prose cannot
 * drift from the product, and adds nothing to the dependency tree.
 */
export interface Post {
  slug: string;
  title: string;
  /** Meta description and the card blurb. One sentence, under ~155 chars. */
  description: string;
  /** ISO date. Freshness is a ranking and citation signal, so it is explicit. */
  published: string;
  updated?: string;
  /** Read time in minutes, stated rather than estimated by a word counter. */
  minutes: number;
  /** Short label for the card. */
  tag: string;
  /** Rendered body. */
  body: () => ReactNode;
}
