import { describe, expect, it } from 'vitest';
import { safeNextPath } from '@/lib/next-path';

describe('safeNextPath', () => {
  it('keeps a same-origin path', () => {
    expect(safeNextPath('/affiliate')).toBe('/affiliate');
    expect(safeNextPath('/dashboard?add=abc')).toBe('/dashboard?add=abc');
  });

  it('falls back when nothing was supplied', () => {
    expect(safeNextPath(undefined)).toBe('/dashboard');
    expect(safeNextPath('')).toBe('/dashboard');
    expect(safeNextPath(undefined, '/lock')).toBe('/lock');
  });

  it('refuses absolute URLs — the open-redirect case', () => {
    expect(safeNextPath('https://evil.example/steal')).toBe('/dashboard');
    expect(safeNextPath('http://evil.example')).toBe('/dashboard');
    expect(safeNextPath('javascript:alert(1)')).toBe('/dashboard');
  });

  it('refuses protocol-relative and backslash-smuggled origins', () => {
    // `//evil.example` is a valid URL that leaves this origin entirely.
    expect(safeNextPath('//evil.example')).toBe('/dashboard');
    // Some URL parsers normalise a backslash to a slash, so `/\evil.example`
    // can be read as `//evil.example` downstream.
    expect(safeNextPath('/\\evil.example')).toBe('/dashboard');
    expect(safeNextPath('/foo\\bar')).toBe('/dashboard');
  });

  it('takes the first value when a query param is repeated', () => {
    // `?next=/affiliate&next=https://evil.example` arrives as an array.
    expect(safeNextPath(['/affiliate', 'https://evil.example'])).toBe('/affiliate');
    expect(safeNextPath(['https://evil.example', '/affiliate'])).toBe('/dashboard');
  });
});
