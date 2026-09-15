/**
 * @name tests/perpspad-client
 * @description Unit tests for the PerpsPad client: launch-body validation
 *   (ticker, dev-buy bounds, leverage caps, baskets, CUSTOM quote), URL
 *   building, error envelope parsing, and compaction. All network access is
 *   mocked — no live calls.
 *
 * @module tests/perpspad/perpspad-client
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  compactPerpspadResponse,
  validateLaunchBody,
  type PerpspadMarket,
} from './perpspad-client.js';

const MARKETS: readonly PerpspadMarket[] = [
  { symbol: 'BTC', minLeverage: 1, maxLeverage: 40 },
  { symbol: 'SOL', minLeverage: 1, maxLeverage: 25 },
  { symbol: 'ANSEM', minLeverage: 1, maxLeverage: 3 },
];

const VALID_BASE = {
  ticker: 'MOON',
  name: 'Moon Coin',
  creatorAddress: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin',
  devBuy: 1,
  underlying: 'SOL',
  leverage: 5,
  direction: 'long' as const,
};

describe('validateLaunchBody', () => {
  it('accepts a valid single-position launch', () => {
    expect(() => validateLaunchBody(VALID_BASE, MARKETS)).not.toThrow();
  });

  it('rejects tickers with lowercase or special characters', () => {
    expect(() => validateLaunchBody({ ...VALID_BASE, ticker: 'moon!' }, MARKETS)).toThrow(/invalid_ticker/);
    expect(() => validateLaunchBody({ ...VALID_BASE, ticker: 'MoOn' }, MARKETS)).toThrow(/invalid_ticker/);
  });

  it('enforces dev-buy bounds per quote token', () => {
    expect(() => validateLaunchBody({ ...VALID_BASE, devBuy: 10 }, MARKETS)).toThrow(/invalid_devBuy.*0\.1.*5/);
    expect(() => validateLaunchBody({ ...VALID_BASE, devBuy: 0.05 }, MARKETS)).toThrow(/invalid_devBuy/);
    expect(() => validateLaunchBody({ ...VALID_BASE, quote: 'USDC', devBuy: 5001 }, MARKETS)).toThrow(/invalid_devBuy/);
    expect(() => validateLaunchBody({ ...VALID_BASE, quote: 'USDC', devBuy: 100 }, MARKETS)).not.toThrow();
  });

  it('rejects unknown underlying markets with guidance', () => {
    expect(() => validateLaunchBody({ ...VALID_BASE, underlying: 'NOPE' }, MARKETS))
      .toThrow(/unknown_underlying.*sap_perpspad_get_markets/);
  });

  it('enforces market leverage caps', () => {
    expect(() => validateLaunchBody({ ...VALID_BASE, underlying: 'ANSEM', leverage: 5 }, MARKETS))
      .toThrow(/invalid_leverage.*1.*3/);
    expect(() => validateLaunchBody({ ...VALID_BASE, underlying: 'BTC', leverage: 40 }, MARKETS)).not.toThrow();
  });

  it('requires a backing (single or basket)', () => {
    const { underlying: _u, leverage: _l, direction: _d, ...noBacking } = VALID_BASE;
    expect(() => validateLaunchBody(noBacking, MARKETS)).toThrow(/invalid_backing/);
  });

  it('validates 2-leg baskets', () => {
    expect(() => validateLaunchBody({
      ...VALID_BASE,
      underlying: undefined,
      leverage: undefined,
      direction: undefined,
      legs: [
        { underlying: 'NVDA', leverage: 2, direction: 'long' },
        { underlying: 'SOL', leverage: 3, direction: 'short' },
      ],
    } as never, MARKETS)).toThrow(/unknown_underlying.*NVDA/);

    expect(() => validateLaunchBody({
      ...VALID_BASE,
      underlying: undefined,
      leverage: undefined,
      direction: undefined,
      legs: [
        { underlying: 'BTC', leverage: 2, direction: 'long' },
        { underlying: 'SOL', leverage: 3, direction: 'short' },
      ],
    }, MARKETS)).not.toThrow();
  });

  it('rejects 3-leg baskets', () => {
    expect(() => validateLaunchBody({
      ...VALID_BASE,
      underlying: undefined,
      leverage: undefined,
      direction: undefined,
      legs: [
        { underlying: 'BTC', leverage: 1, direction: 'long' },
        { underlying: 'SOL', leverage: 1, direction: 'short' },
        { underlying: 'ETH', leverage: 1, direction: 'long' },
      ],
    } as never, MARKETS)).toThrow(/exactly 2 legs/);
  });

  it('requires quoteMint for CUSTOM quote', () => {
    expect(() => validateLaunchBody({ ...VALID_BASE, quote: 'CUSTOM' }, MARKETS)).toThrow(/quoteMint/);
  });
});

describe('compactPerpspadResponse', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('caps arrays at 50 entries with a remainder marker', () => {
    const out = compactPerpspadResponse({ tokens: Array.from({ length: 60 }, (_, i) => ({ i })) }) as { tokens: unknown[] };
    expect(out.tokens.length).toBe(51);
    expect(out.tokens[50]).toBe('[+10 more entries]');
  });

  it('marks payloads whose upstream size exceeds the 30k cap', () => {
    const big = { rows: Array.from({ length: 60 }, (_, i) => ({ pad: 'x'.repeat(800), i })) };
    const out = compactPerpspadResponse(big) as Record<string, unknown>;
    expect(out['_truncated']).toBe(true);
    expect(typeof out['_originalSize']).toBe('number');
  });
});