/**
 * Live integration tests for the Backpack free read tools.
 *
 * Opt-in only: runs against the real https://api.backpack.exchange REST API
 * when SAP_LIVE_TESTS is set (e.g. `SAP_LIVE_TESTS=1 pnpm vitest run -t 'live'`).
 * Skipped by default so CI never depends on upstream availability.
 */
import { describe, expect, it } from 'vitest';
import { BackpackApiClient } from './backpack-client.js';

const LIVE_ENABLED = process.env.SAP_LIVE_TESTS !== undefined && process.env.SAP_LIVE_TESTS !== '';

describe.skipIf(!LIVE_ENABLED)('Backpack live API (SAP_LIVE_TESTS=1)', () => {
  const client = new BackpackApiClient({ baseUrl: 'https://api.backpack.exchange' });

  it('live getTicker SOL_USDC returns a realistic ticker snapshot', async () => {
    const ticker = await client.getTicker('SOL_USDC') as Record<string, unknown>;
    expect(ticker).toBeTypeOf('object');
    expect(ticker.symbol).toBe('SOL_USDC');
    expect(ticker.lastPrice).toBeTypeOf('string');
    expect(ticker.firstPrice).toBeTypeOf('string');
    expect(ticker.high).toBeTypeOf('string');
    expect(ticker.low).toBeTypeOf('string');
    expect(ticker.volume).toBeTypeOf('string');
    expect(Number(ticker.lastPrice)).toBeGreaterThan(0);
  }, 20_000);

  it('live getMarketSessions returns the US equities sessions', async () => {
    const sessions = await client.getMarketSessions() as unknown[];
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBeGreaterThan(0);
    const names = sessions.map((s) => (s as Record<string, unknown>).name);
    expect(names).toContain('US_EQUITIES_REGULAR');
  }, 20_000);
});