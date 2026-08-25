import { describe, expect, it } from 'vitest';
import { isQuietNow } from '../index';
import { escapeHtml } from '../telegram';

const at = (hourUtc: number): Date => new Date(Date.UTC(2026, 0, 1, hourUtc, 30));

describe('isQuietNow', () => {
  it('is never quiet when no window is set', () => {
    expect(isQuietNow(null, null, at(3))).toBe(false);
    expect(isQuietNow(22, null, at(3))).toBe(false);
    expect(isQuietNow(null, 7, at(3))).toBe(false);
  });

  it('handles a window inside one day', () => {
    expect(isQuietNow(9, 17, at(12))).toBe(true);
    expect(isQuietNow(9, 17, at(8))).toBe(false);
    expect(isQuietNow(9, 17, at(17))).toBe(false);
  });

  it('handles a window that wraps past midnight, which is the usual case', () => {
    // Asleep 22:00 -> 07:00.
    expect(isQuietNow(22, 7, at(23))).toBe(true);
    expect(isQuietNow(22, 7, at(2))).toBe(true);
    expect(isQuietNow(22, 7, at(6))).toBe(true);
    expect(isQuietNow(22, 7, at(7))).toBe(false);
    expect(isQuietNow(22, 7, at(15))).toBe(false);
  });

  it('treats an empty window as never quiet rather than always quiet', () => {
    // Getting this backwards would silently swallow every alert a user gets.
    expect(isQuietNow(5, 5, at(5))).toBe(false);
    expect(isQuietNow(5, 5, at(18))).toBe(false);
  });

  it('is inclusive at the start and exclusive at the end', () => {
    expect(isQuietNow(1, 4, at(1))).toBe(true);
    expect(isQuietNow(1, 4, at(4))).toBe(false);
  });
});

describe('escapeHtml', () => {
  it('neutralises markup that would otherwise break the message', () => {
    // Token names are attacker-controlled; an unescaped one makes Telegram
    // reject the whole send, which would silently drop a stop-hit alert.
    expect(escapeHtml('<b>PUMP</b>')).toBe('&lt;b&gt;PUMP&lt;/b&gt;');
    expect(escapeHtml('A & B')).toBe('A &amp; B');
  });

  it('escapes ampersands before angle brackets so entities are not doubled', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('leaves ordinary text alone', () => {
    expect(escapeHtml('WIF coil crossed 0.68')).toBe('WIF coil crossed 0.68');
  });
});
