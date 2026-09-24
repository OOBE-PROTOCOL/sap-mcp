import { describe, expect, it } from 'vitest';
import {
  approvedDammV2Config,
  dammV2ConfigForFeeOption,
  formatRawAmount,
  parseUiAmount,
} from './meteora-trading-tool.js';

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

describe('Meteora migration config selection', () => {
  it('resolves the DAMM config independently of the gateway allowlist', () => {
    expect(dammV2ConfigForFeeOption(0).toBase58()).toBe('7F6dnUcRuyM2TwR8myT1dYypFXpPSxqwKNSFNkxyNESd');
    expect(() => dammV2ConfigForFeeOption(999)).toThrow(/unsupported/);
  });

  it('derives the official config from the on-chain fee option', () => {
    const previous = process.env.METEORA_DAMM_V2_CONFIGS;
    process.env.METEORA_DAMM_V2_CONFIGS = '7F6dnUcRuyM2TwR8myT1dYypFXpPSxqwKNSFNkxyNESd';
    try {
      expect(approvedDammV2Config(0).toBase58()).toBe('7F6dnUcRuyM2TwR8myT1dYypFXpPSxqwKNSFNkxyNESd');
      expect(() => approvedDammV2Config(0, '2nHK1kju6XjphBLbNxpM5XRGFj7p9U8vvNzyZiha1z6k')).toThrow(/does not match/);
    } finally {
      if (previous === undefined) delete process.env.METEORA_DAMM_V2_CONFIGS;
      else process.env.METEORA_DAMM_V2_CONFIGS = previous;
    }
  });
});
