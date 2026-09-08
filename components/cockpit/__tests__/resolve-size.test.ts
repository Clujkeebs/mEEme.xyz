import { describe, expect, it } from 'vitest';
import { resolveSize } from '../target-lock';

const base = { sizeMode: 'usd' as const, size: '', usdIn: '', entry: 0.0000042 };

describe('resolveSize', () => {
  it('converts dollars spent into token units at the entry price', () => {
    expect(resolveSize({ ...base, usdIn: '2' })).toBeCloseTo(2 / 0.0000042, 6);
  });

  it('takes token units verbatim in token mode', () => {
    expect(resolveSize({ ...base, sizeMode: 'tokens', size: '1200000' })).toBe(1_200_000);
  });

  it('reads only the field the trader is actually looking at', () => {
    // Stale text left in the hidden input must not leak into the read.
    expect(resolveSize({ ...base, sizeMode: 'tokens', size: '', usdIn: '2' })).toBeNull();
    expect(resolveSize({ ...base, sizeMode: 'usd', size: '1200000', usdIn: '' })).toBeNull();
  });

  it('refuses to guess a size rather than returning a wrong one', () => {
    // Every execution number downstream is a function of size, so a silently
    // wrong one would be presented to the trader as fact.
    expect(resolveSize({ ...base, usdIn: '2', entry: 0 })).toBeNull();
    expect(resolveSize({ ...base, usdIn: '2', entry: Number.NaN })).toBeNull();
    expect(resolveSize({ ...base, usdIn: '0' })).toBeNull();
    expect(resolveSize({ ...base, usdIn: '-4' })).toBeNull();
    expect(resolveSize({ ...base, usdIn: 'abc' })).toBeNull();
    expect(resolveSize({ ...base, sizeMode: 'tokens', size: '-1' })).toBeNull();
  });

  it('handles the tiny entry prices these tokens actually trade at', () => {
    const qty = resolveSize({ ...base, usdIn: '2', entry: 3.1e-9 });
    expect(qty).toBeCloseTo(2 / 3.1e-9, 0);
    expect(Number.isFinite(qty!)).toBe(true);
  });
});
