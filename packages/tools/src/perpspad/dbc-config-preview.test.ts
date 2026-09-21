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
import { simulateDevBuy } from './dbc-config-preview.js';

describe('sap_perpspad_dbc_config_preview — simulateDevBuy', () => {
  it('WSOL (9-dec): 1 SOL buys ≈28.6M tokens (SDK-exact swap math)', () => {
    const config = buildConfigArgsForQuote(9);
    const buy = simulateDevBuy(config, 1_000_000_000n); // 1 SOL in raw lamports
    // SDK live cross-check: 28,621,980.985852 tokens.
    expect(Number(buy.outputAmountRaw)).toBeGreaterThan(28_000_000 * 1e6);
    expect(Number(buy.outputAmountRaw)).toBeLessThan(29_000_000 * 1e6);
    expect(buy.supplyExhausted).toBe(false);
  });

  it('USDC (6-dec): 1000 USDC requests more than the supply (SDK live: 1.065e15 raw, supplyExhausted true)', () => {
    const config = buildConfigArgsForQuote(6);
    const buy = simulateDevBuy(config, 1000n * 10n ** 6n);
    // SDK live cross-check: 1,065,852,837.19 tokens = 1,065,852,837,192,906
    // base-raw — over the 1B supply. The preview reports the raw curve ask
    // (supplyExhausted=true); the program itself would cap at 1B tokens.
    expect(buy.outputAmountRaw).toBe(1_065_852_837_192_906n);
    expect(buy.supplyExhausted).toBe(true);
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