export * from './types';
export * from './coil';
export * from './cluster';
export * from './ladder';
export * from './verdict';

import { analyzeCoil } from './coil';
import { buildSignal } from './verdict';
import type { AlphaSignal, TokenSnapshot, UserPosition } from './types';

/**
 * One call, one answer. Given a normalized snapshot and (optionally) where the
 * trader actually stands, produce the full read.
 */
export function runAlphaEngine(
  snapshot: TokenSnapshot,
  position: UserPosition | null = null,
): AlphaSignal {
  const coil = analyzeCoil(snapshot);
  return buildSignal(snapshot, coil, position);
}
