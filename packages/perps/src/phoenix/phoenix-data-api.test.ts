import { describe, expect, it } from 'vitest';

import { PhoenixDataApiClient, requirePhoenixMarketSymbol } from './phoenix-data-api.js';

describe('Phoenix market symbol validation', () => {
  it('trims a valid symbol', () => {
    expect(requirePhoenixMarketSymbol(' SOL ')).toBe('SOL');
  });

  it.each([undefined, null, '', '   ', 'undefined', 'null'])('rejects missing symbol %s', (symbol) => {
    expect(() => requirePhoenixMarketSymbol(symbol)).toThrow('Phoenix market symbol is required');
  });

  it('rejects funding history before constructing an undefined upstream URL', async () => {
    const client = new PhoenixDataApiClient('https://example.invalid');

    await expect(client.getFundingRateHistory(undefined as unknown as string)).rejects.toThrow(
      'Phoenix market symbol is required',
    );
  });
});
