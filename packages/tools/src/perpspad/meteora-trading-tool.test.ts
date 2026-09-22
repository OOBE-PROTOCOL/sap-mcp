import { describe, expect, it } from 'vitest';
import { formatRawAmount, parseUiAmount } from './meteora-trading-tool.js';

describe('Meteora launchpad amount precision', () => {
  it('parses decimal strings without floating-point rounding', () => {
    expect(parseUiAmount('0.1', 9).toString()).toBe('100000000');
    expect(parseUiAmount('123456789.123456', 6).toString()).toBe('123456789123456');
  });

  it('rejects zero, exponent notation, and excess precision', () => {
    expect(() => parseUiAmount('0', 9)).toThrow(/greater than zero/);
    expect(() => parseUiAmount('1e-9', 9)).toThrow(/decimal string/);
    expect(() => parseUiAmount('0.0000001', 6)).toThrow(/at most 6/);
  });

  it('formats raw amounts deterministically', () => {
    expect(formatRawAmount(parseUiAmount('12.340000', 6), 6)).toBe('12.34');
    expect(formatRawAmount(parseUiAmount('0.000001', 6), 6)).toBe('0.000001');
  });
});
