import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdrenaDataApiClient } from './adrena-data-api.js';

describe('Adrena data API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes nested last-trading-prices provider responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          autonom: {
            prices: [
              {
                symbol: 'WBTCUSD',
                price: '794600000000000',
                exponent: -10,
                feed_id: 33,
                timestamp: 1_789_000_000,
              },
            ],
          },
          switchboard: {
            prices: [
              {
                symbol: 'USDCUSD',
                price: '10000000000',
                exponent: -10,
                feedId: 147,
                timestamp: 1_789_000_001,
              },
            ],
          },
        },
      }),
    })));

    const prices = await new AdrenaDataApiClient('https://example.test').getLastTradingPrices();

    expect(prices).toEqual([
      {
        symbol: 'WBTCUSD',
        priceUsd: 79_460,
        custodyAddress: '',
        provider: 'autonom',
        feedId: 33,
        timestamp: 1_789_000_000,
      },
      {
        symbol: 'USDCUSD',
        priceUsd: 1,
        custodyAddress: '',
        provider: 'switchboard',
        feedId: 147,
        timestamp: 1_789_000_001,
      },
    ]);
  });
});
