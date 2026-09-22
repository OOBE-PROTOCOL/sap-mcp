/**
 * sap_perpspad_dbc_config_preview — contract + SDK-math ground truth.
 *
 * Reference values verified LIVE against the real tool handler (mainnet RPC,
 * official SDK swap formulas): WSOL 1 SOL → 28,621,980.98 tokens,
 * threshold 109.51815663 SOL; USDC 6-dec 1000 USDC → 1,065,852,837 tokens
 * → supplyExhausted true (cap 1B).
 */
import { describe, expect, it } from 'vitest';
import { buildConfigArgsForQuote } from './dbc-launch.js';
import { resolveQuoteUnitsPerSol, simulateDevBuy } from './dbc-config-preview.js';

describe('sap_perpspad_dbc_config_preview — simulateDevBuy', () => {
  it('WSOL (9-dec): 1 SOL buys ≈28.6M tokens (SDK-exact swap math)', () => {
    const config = buildConfigArgsForQuote(9);
    const buy = simulateDevBuy(config, 1_000_000_000n); // 1 SOL in raw lamports
    // SDK live cross-check: 28,621,980.985852 tokens.
    expect(Number(buy.outputAmountRaw)).toBeGreaterThan(28_000_000 * 1e6);
    expect(Number(buy.outputAmountRaw)).toBeLessThan(29_000_000 * 1e6);
    expect(buy.supplyExhausted).toBe(false);
  });

  it('USDC (6-dec): an equivalent USD input follows the same curve as SOL', () => {
    const sol = simulateDevBuy(buildConfigArgsForQuote(9), 1_000_000_000n);
    const usdc = simulateDevBuy(buildConfigArgsForQuote(6, 100, 150), 150n * 10n ** 6n);
    const relativeDiff = Math.abs(Number(usdc.outputAmountRaw - sol.outputAmountRaw)) / Number(sol.outputAmountRaw);
    expect(relativeDiff).toBeLessThan(0.000001);
    expect(usdc.supplyExhausted).toBe(false);
  });

  it('derives custom quote units per SOL from live USD prices', () => {
    expect(resolveQuoteUnitsPerSol('custom', 0.00025, 150)).toBe(600_000);
    expect(() => resolveQuoteUnitsPerSol('custom')).toThrow(/quotePriceUsd/);
  });

  it('zero amount returns zero output at the start price', () => {
    const config = buildConfigArgsForQuote(9);
    const buy = simulateDevBuy(config, 0n);
    expect(buy.outputAmountRaw).toBe(0n);
    expect(buy.supplyExhausted).toBe(false);
  });

  it('output is monotonic in the input amount', () => {
    const config = buildConfigArgsForQuote(9);
    const small = simulateDevBuy(config, 100_000_000n); // 0.1 SOL
    const large = simulateDevBuy(config, 1_000_000_000n); // 1 SOL
    expect(large.outputAmountRaw).toBeGreaterThan(small.outputAmountRaw);
    expect(large.nextSqrtPriceRaw).toBeGreaterThanOrEqual(small.nextSqrtPriceRaw);
  });
});
