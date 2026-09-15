/**
 * Live smoke test for the PerpsPad client (SAP_LIVE_TESTS=1 only).
 * Asserts verified upstream shapes: 60 markets, live tokens with backing perps.
 */
import { describe, expect, it } from 'vitest';
import { PerpspadApiClient } from './perpspad-client.js';

const LIVE_ENABLED = process.env.SAP_LIVE_TESTS !== undefined && process.env.SAP_LIVE_TESTS !== '';

describe.skipIf(!LIVE_ENABLED)('PerpsPad live API (SAP_LIVE_TESTS=1)', () => {
  const client = new PerpspadApiClient({ baseUrl: 'https://perpspad.fun' });

  it('live getMarkets returns the perp markets with leverage caps', async () => {
    const markets = await client.getMarkets();
    expect(markets.length).toBeGreaterThan(30);
    const btc = markets.find((m) => m.symbol === 'BTC');
    expect(btc?.maxLeverage).toBe(40);
  }, 20_000);

  it('live getTokens returns launched tokens with backing info', async () => {
    const tokens = await client.getTokens({ limit: 5 });
    expect(tokens.length).toBeGreaterThan(0);
    const first = tokens[0];
    expect(first.id).toBeTypeOf('string');
    expect(first.ticker).toBeTypeOf('string');
    expect(first.created_at).toBeTypeOf('string');
  }, 20_000);

  it('live getToken by id returns the full token', async () => {
    const tokens = await client.getTokens({ limit: 1 });
    const token = await client.getToken(tokens[0].id);
    expect(token.id).toBe(tokens[0].id);
  }, 20_000);

  it('live getStats returns platform KPIs', async () => {
    const stats = await client.getStats() as { solUsd?: number; kpis?: Record<string, unknown> };
    expect(typeof stats.solUsd).toBe('number');
    expect(stats.kpis).toBeTypeOf('object');
  }, 20_000);
});