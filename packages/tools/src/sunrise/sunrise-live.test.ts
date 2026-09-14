/**
 * Live smoke test for the Sunrise client (SAP_LIVE_TESTS=1 only).
 * Asserts the verified upstream shape: ~76 tokens, USDC absent from the list.
 */
import { describe, expect, it } from 'vitest';
import { SunriseApiClient, SUNRISE_CORE_MINTS } from './sunrise-client.js';

const LIVE_ENABLED = process.env.SAP_LIVE_TESTS !== undefined && process.env.SAP_LIVE_TESTS !== '';

describe.skipIf(!LIVE_ENABLED)('Sunrise live API (SAP_LIVE_TESTS=1)', () => {
  const client = new SunriseApiClient({ baseUrl: 'https://api.sunrise.xyz' });

  it('live listTokens returns the full canonical list without core assets', async () => {
    const page = await client.listTokens({ limit: 200 });
    expect(page.count).toBeGreaterThan(60);
    expect(page.count).toBeLessThan(120);
    expect(page.nextCursor).toBeNull();
    const symbols = page.tokens.map((t) => t.symbol);
    expect(symbols).toContain('MON');
    expect(symbols).not.toContain('USDC');
    const mon = page.tokens.find((t) => t.symbol === 'MON');
    expect(mon?.address).toBe('CrAr4RRJMBVwRsZtT62pEhfA9H5utymC2mVx8e7FreP2');
  }, 20_000);

  it('live getQuote prices a 1 USDC -> MON swap without wallets', async () => {
    const quotes = await client.getQuote({
      fromToken: SUNRISE_CORE_MINTS.USDC.address,
      toToken: 'CrAr4RRJMBVwRsZtT62pEhfA9H5utymC2mVx8e7FreP2',
      fromAmount: '1000000',
    });
    expect(quotes.length).toBeGreaterThan(0);
    expect(quotes[0].quoteId).toBeTypeOf('string');
    expect(quotes[0].routeName).toBeTypeOf('string');
    expect(Number(quotes[0].toAmount)).toBeGreaterThan(0);
    expect(quotes[0].unsignedTransaction).toBeUndefined();
  }, 20_000);
});