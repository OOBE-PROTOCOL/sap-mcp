import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compactBackpackResponse } from './backpack-pipeline.js';
import {
  registerBackpackDataTools,
  toEpochSeconds,
  validateKlineInterval,
  BACKPACK_PATHS,
} from './backpack-data-tools.js';
import { registerBackpackPipelineTool } from './backpack-pipeline.js';
import type { SapMcpContext } from '../../../core/src/types.js';

/**
 * Unit tests for the 15 free Backpack read tools + response compaction.
 *
 * global.fetch is stubbed with realistic fixtures (shapes from
 * docs/plans/2026-09-14-shared-tool-context.md). Each test registers tools
 * against a mock Server, captures the registered definitions via the
 * pipeline spy, and drives handlers directly.
 */

type Handler = (args: Record<string, unknown>) => Promise<{ data: Record<string, unknown>; isError?: boolean }>;
const registered = new Map<string, { description: string; inputSchema: unknown; handler: Handler }>();

vi.mock('./backpack-pipeline.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./backpack-pipeline.js')>();
  return {
    ...actual,
    registerBackpackPipelineTool: (
      _server: unknown,
      _context: unknown,
      name: string,
      definition: { description: string; inputSchema: unknown },
      handler: Handler,
    ) => {
      registered.set(name, { ...definition, handler });
    },
  };
});

function makeContext(): SapMcpContext {
  return {
    connection: {},
    wallet: {},
    config: {},
  } as unknown as SapMcpContext;
}

const mockServer = {} as never;

function jsonOk(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function jsonError(status: number, body: unknown): Response {
  return {
    ok: false,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/* Realistic fixture shapes (shared context doc). */
const FIXTURE_MARKET = {
  symbol: 'SOL_USDC',
  baseSymbol: 'SOL',
  quoteSymbol: 'USDC',
  marketType: 'SPOT',
  tickSize: '0.01',
  stepSize: '0.01',
  filters: { price: { minPrice: '0.01', maxPrice: '100000', tickSize: '0.01' } },
};

const FIXTURE_MARKETS = [
  FIXTURE_MARKET,
  { ...FIXTURE_MARKET, symbol: 'SOL_USDC_PERP', marketType: 'PERP' },
  { ...FIXTURE_MARKET, symbol: 'BTC_USDC', baseSymbol: 'BTC' },
];

const FIXTURE_TICKER = {
  symbol: 'SOL_USDC',
  firstPrice: '200.12',
  lastPrice: '210.34',
  priceChange24h: '10.22',
  priceChangePercent24h: '0.0510',
  bidPrice: '210.30',
  askPrice: '210.36',
  high24h: '212.00',
  low24h: '199.50',
  volume24h: '9210.44',
  quoteVolume24h: '1929111.02',
  trades24h: 4311,
};

const FIXTURE_DEPTH = {
  asks: [['210.36', '1.5'], ['210.40', '3.2']],
  bids: [['210.30', '2.0'], ['210.25', '4.1']],
};

const FIXTURE_TRADE = {
  id: '7100001',
  isBuyerMaker: true,
  price: '210.34',
  quantity: '1.25',
  quoteQuantity: '262.925',
  timestamp: 1757837200000,
};

const FIXTURE_KLINE = {
  open: '200.10',
  high: '212.00',
  low: '199.90',
  close: '210.34',
  volume: '1250.4',
  quoteVolume: '261233.11',
  trades: 331,
  start: '2026-09-14 10:00:00',
  end: '2026-09-14 10:59:59',
};

const FIXTURE_MARK_PRICE = {
  symbol: 'SOL_USDC_PERP',
  markPrice: '210.31',
  indexPrice: '210.29',
  fundingRate: '0.0000125',
  nextFundingTimestamp: 1757846400000,
  openInterest: '120000',
};

const FIXTURE_FUNDING = {
  symbol: 'SOL_USDC_PERP',
  fundingRate: '0.0000125',
  timestamp: 1757842800000,
};

const FIXTURE_OPEN_INTEREST = {
  symbol: 'SOL_USDC_PERP',
  openInterest: '120000',
  timestamp: 1757842800000,
};

const FIXTURE_COLLATERAL_ROW = {
  symbol: 'SOL',
  haircutFunction: { kind: { HaircutPercent: { percent: 0.05 } }, weight: 1 },
  imfFunction: { base: 0.1, factor: 0.2, type: 'sqrt' },
  mmfFunction: { base: 0.05, factor: 0.1, type: 'sqrt' },
};

const FIXTURE_ASSET = {
  symbol: 'SOL',
  name: 'Solana',
  coingeckoId: 'solana',
  tokens: [
    {
      blockchain: 'Solana',
      address: 'So11111111111111111111111111111111111111112',
      depositEnabled: true,
      withdrawEnabled: true,
      minimumDeposit: '0.001',
      minimumWithdrawal: '0.01',
      nativeDecimals: 9,
      withdrawalFee: '0.000005',
    },
  ],
};

const FIXTURE_SECURITY = {
  asset: 'AAPL.US',
  cusip: '037833100',
  name: 'Apple Inc.',
  sessions: [{ name: 'US_EQUITIES_REGULAR', maxQuantity: '10000', minQuantity: '0.000001', stepSize: '0.000001' }],
};

const FIXTURE_BORROW_LEND = {
  symbol: 'SOL',
  assetMarkPrice: '210.34',
  borrowInterestRate: '0.0312',
  lendInterestRate: '0.0112',
  utilization: '0.4',
  optimalUtilization: 0.7,
  fee: 0.15,
  state: 'Active',
  openBorrowLendLimit: '5000',
};

async function callTool(name: string, args: Record<string, unknown> = {}): Promise<{ data: Record<string, unknown>; isError?: boolean }> {
  const tool = registered.get(name);
  if (!tool) throw new Error(`tool ${name} not registered`);
  return tool.handler(args);
}

beforeEach(() => {
  registered.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Backpack data tools registration', () => {
  const EXPECTED_TOOLS = [
    'sap_backpack_get_markets',
    'sap_backpack_get_market',
    'sap_backpack_get_ticker',
    'sap_backpack_get_tickers',
    'sap_backpack_get_depth',
    'sap_backpack_get_trades',
    'sap_backpack_get_klines',
    'sap_backpack_get_mark_price',
    'sap_backpack_get_funding_rates',
    'sap_backpack_get_open_interest',
    'sap_backpack_get_collateral',
    'sap_backpack_get_assets',
    'sap_backpack_get_securities',
    'sap_backpack_get_market_sessions',
    'sap_backpack_get_borrow_lend_markets',
  ];

  it('registers all 15 free read tools with sap_backpack_ prefix', () => {
    registerBackpackDataTools(mockServer, makeContext());
    for (const name of EXPECTED_TOOLS) {
      const tool = registered.get(name);
      expect(tool, name).toBeDefined();
      expect(tool?.description).toContain('Free read.');
      expect(tool?.description).toContain('Backpack symbols');
    }
    expect(registered.size).toBe(15);
  });

  it('every description mentions Backpack symbol conventions', () => {
    registerBackpackDataTools(mockServer, makeContext());
    for (const [name, tool] of registered) {
      expect(
        tool.description.includes('spot') || tool.description.includes('SOL_USDC'),
        `${name} should reference symbol conventions`,
      ).toBe(true);
    }
  });
});

describe('Backpack data tools happy paths', () => {
  it('get_markets returns markets array and count (no filter by default)', async () => {
    const fetchMock = vi.fn(async () => jsonOk(FIXTURE_MARKETS));
    vi.stubGlobal('fetch', fetchMock);
    registerBackpackDataTools(mockServer, makeContext());
    const res = await callTool('sap_backpack_get_markets');
    expect(res.isError).toBeFalsy();
    const called = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(called).toContain(BACKPACK_PATHS.markets);
    expect(res.data.count).toBe(3);
    const markets = res.data.markets as unknown[];
    expect(markets).toHaveLength(3);
  });

  it('get_markets passes marketType=SPOT upstream', async () => {
    const fetchMock = vi.fn(async () => jsonOk([FIXTURE_MARKET]));
    vi.stubGlobal('fetch', fetchMock);
    registerBackpackDataTools(mockServer, makeContext());
    const res = await callTool('sap_backpack_get_markets', { marketType: 'PERP' });
    const called = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(called).toContain('marketType=PERP');
    expect(res.data.count).toBe(1);
  });

  it('get_market filters the markets list client-side (never calls /markets/{symbol})', async () => {
    const fetchMock = vi.fn(async () => jsonOk(FIXTURE_MARKETS));
    vi.stubGlobal('fetch', fetchMock);
    registerBackpackDataTools(mockServer, makeContext());
    const res = await callTool('sap_backpack_get_market', { symbol: 'SOL_USDC_PERP' });
    const called = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(called.endsWith('/api/v1/markets')).toBe(true);
    expect(called.includes('SOL_USDC_PERP')).toBe(false);
    const market = res.data.market as Record<string, unknown>;
    expect(market.symbol).toBe('SOL_USDC_PERP');
    expect(market.marketType).toBe('PERP');
  });

  it('get_ticker returns ticker snapshot for symbol', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonOk(FIXTURE_TICKER)));
    registerBackpackDataTools(mockServer, makeContext());
    const res = await callTool('sap_backpack_get_ticker', { symbol: 'SOL_USDC' });
    expect(res.isError).toBeFalsy();
    const ticker = res.data.ticker as Record<string, unknown>;
    expect(ticker.symbol).toBe('SOL_USDC');
    expect(ticker.lastPrice).toBe('210.34');
  });

  it('get_tickers returns all tickers with no args', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonOk([FIXTURE_TICKER])));
    registerBackpackDataTools(mockServer, makeContext());
    const res = await callTool('sap_backpack_get_tickers');
    expect(res.isError).toBeFalsy();
    expect(res.data.tickers).toHaveLength(1);
  });

  it('get_depth defaults to top 20 levels per side and clamps limit', async () => {
    const fetchMock = vi.fn(async () => jsonOk(FIXTURE_DEPTH));
    vi.stubGlobal('fetch', fetchMock);
    registerBackpackDataTools(mockServer, makeContext());
    const res = await callTool('sap_backpack_get_depth', { symbol: 'SOL_USDC', limit: 999_999 });
    const called = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(called).toContain('symbol=SOL_USDC');
    expect(called).toContain('limit=5000');
    expect(res.data.levelsPerSide).toBe(5000);
    const depth = res.data.depth as { bids: string[][] };
    expect(depth.bids[0]).toEqual(['210.30', '2.0']);
  });

  it('get_trades returns recent trades with limit', async () => {
    const fetchMock = vi.fn(async () => jsonOk([FIXTURE_TRADE, { ...FIXTURE_TRADE, id: '7100002' }]));
    vi.stubGlobal('fetch', fetchMock);
    registerBackpackDataTools(mockServer, makeContext());
    const res = await callTool('sap_backpack_get_trades', { symbol: 'SOL_USDC', limit: 2 });
    const called = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(called).toContain('symbol=SOL_USDC');
    expect(called).toContain('limit=2');
    expect(res.data.count).toBe(2);
  });

  it('get_klines converts ISO and epoch-MS inputs to epoch SECONDS upstream', async () => {
    const fetchMock = vi.fn(async () => jsonOk([FIXTURE_KLINE]));
    vi.stubGlobal('fetch', fetchMock);
    registerBackpackDataTools(mockServer, makeContext());
    const res = await callTool('sap_backpack_get_klines', {
      symbol: 'SOL_USDC',
      interval: '1h',
      startTime: '2026-09-14T00:00:00Z',
      endTime: 1_757_836_800_000, // epoch ms
    });
    const called = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    const url = new URL(called);
    expect(url.pathname).toBe(BACKPACK_PATHS.klines);
    expect(url.searchParams.get('interval')).toBe('1h');
    expect(url.searchParams.get('startTime')).toBe(String(Math.floor(Date.parse('2026-09-14T00:00:00Z') / 1000)));
    expect(url.searchParams.get('endTime')).toBe('1757836800');
    expect(res.data.count).toBe(1);
  });

  it('get_klines rejects invalid intervals', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonOk([FIXTURE_KLINE])));
    registerBackpackDataTools(mockServer, makeContext());
    const res = await callTool('sap_backpack_get_klines', { symbol: 'SOL_USDC', interval: '2m' });
    expect(res.isError).toBe(true);
    expect(String(res.data.message)).toContain('Invalid interval');
    expect(String(res.data.message)).toContain('1M');
  });

  it('get_mark_price returns mark/index/funding for perp symbol', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonOk([FIXTURE_MARK_PRICE])));
    registerBackpackDataTools(mockServer, makeContext());
    const res = await callTool('sap_backpack_get_mark_price', { symbol: 'SOL_USDC_PERP' });
    expect(res.isError).toBeFalsy();
    const row = (res.data.markPrices as unknown[])[0] as Record<string, unknown>;
    expect(row.symbol).toBe('SOL_USDC_PERP');
    expect(row.fundingRate).toBe('0.0000125');
  });

  it('get_funding_rates returns funding history rows', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonOk([FIXTURE_FUNDING])));
    registerBackpackDataTools(mockServer, makeContext());
    const res = await callTool('sap_backpack_get_funding_rates', { symbol: 'SOL_USDC_PERP' });
    expect(res.isError).toBeFalsy();
    expect(res.data.fundingRates).toHaveLength(1);
  });

  it('get_open_interest returns perp open interest', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonOk([FIXTURE_OPEN_INTEREST])));
    registerBackpackDataTools(mockServer, makeContext());
    const res = await callTool('sap_backpack_get_open_interest', { symbol: 'SOL_USDC_PERP' });
    expect(res.isError).toBeFalsy();
    const oi = res.data.openInterest as unknown[];
    expect((oi[0] as Record<string, unknown>).symbol).toBe('SOL_USDC_PERP');
  });

  it('get_collateral returns collateral requirement rows', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonOk([FIXTURE_COLLATERAL_ROW])));
    registerBackpackDataTools(mockServer, makeContext());
    const res = await callTool('sap_backpack_get_collateral');
    expect(res.isError).toBeFalsy();
    expect(res.data.collateral).toHaveLength(1);
  });

  it('get_assets compacts to symbol + tokens fields and supports filter', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonOk([FIXTURE_ASSET, { ...FIXTURE_ASSET, symbol: 'USDC' }])));
    registerBackpackDataTools(mockServer, makeContext());
    const res = await callTool('sap_backpack_get_assets', { symbol: 'SOL' });
    const assets = res.data.assets as Array<Record<string, unknown>>;
    expect(assets).toHaveLength(1);
    expect(assets[0].symbol).toBe('SOL');
    expect(assets[0].name).toBeUndefined();
    const tokens = assets[0].tokens as Array<Record<string, unknown>>;
    expect(tokens[0].depositEnabled).toBe(true);
    expect(tokens[0].withdrawalFee).toBe('0.000005');
  });

  it('get_securities compacts rows and applies asset prefix filter', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonOk([FIXTURE_SECURITY, { ...FIXTURE_SECURITY, asset: 'MU.US' }])));
    registerBackpackDataTools(mockServer, makeContext());
    const res = await callTool('sap_backpack_get_securities', { asset: 'AAPL.' });
    const securities = res.data.securities as Array<Record<string, unknown>>;
    expect(securities).toHaveLength(1);
    expect(securities[0].asset).toBe('AAPL.US');
    expect(securities[0].name).toBe('Apple Inc.');
  });

  it('get_market_sessions returns session list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonOk([
      { name: 'US_EQUITIES_REGULAR' },
      { name: 'US_EQUITIES_OVERNIGHT' },
    ])));
    registerBackpackDataTools(mockServer, makeContext());
    const res = await callTool('sap_backpack_get_market_sessions');
    expect(res.isError).toBeFalsy();
    expect(res.data.marketSessions).toHaveLength(2);
  });

  it('get_borrow_lend_markets returns rows and supports symbol filter', async () => {
    const fetchMock = vi.fn(async () => jsonOk([FIXTURE_BORROW_LEND, { ...FIXTURE_BORROW_LEND, symbol: 'BTC' }]));
    vi.stubGlobal('fetch', fetchMock);
    registerBackpackDataTools(mockServer, makeContext());
    const res = await callTool('sap_backpack_get_borrow_lend_markets', { symbol: 'SOL' });
    expect(res.isError).toBeFalsy();
    expect(res.data.count).toBe(1);
    expect(((res.data.borrowLendMarkets as unknown[])[0] as Record<string, unknown>).symbol).toBe('SOL');
  });
});

describe('Backpack data tools upstream errors', () => {
  it('get_market unknown symbol → structured backpack_market_not_found (404-trap guidance)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonOk(FIXTURE_MARKETS)));
    registerBackpackDataTools(mockServer, makeContext());
    const res = await callTool('sap_backpack_get_market', { symbol: 'NOPE_XYZ' });
    expect(res.isError).toBe(true);
    expect(res.data.error).toBe('backpack_market_not_found');
    expect(String(res.data.message)).toContain('404 trap');
  });

  it('upstream 404 JSON error → structured pipeline error with code+message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonError(404, { code: 'INVALID_REQUEST', message: 'Unknown market NOPE' })));
    registerBackpackDataTools(mockServer, makeContext());
    const res = await callTool('sap_backpack_get_ticker', { symbol: 'NOPE_XYZ' });
    expect(res.isError).toBe(true);
    expect(res.data.error).toBe('Failed to get Backpack ticker');
    expect(String(res.data.message)).toContain('404');
    expect(String(res.data.message)).toContain('INVALID_REQUEST');
  });

  it('upstream 429 rate limit → structured pipeline error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonError(429, { code: 'RATE_LIMITED', message: 'Too many requests' })));
    registerBackpackDataTools(mockServer, makeContext());
    const res = await callTool('sap_backpack_get_tickers');
    expect(res.isError).toBe(true);
    expect(String(res.data.message)).toContain('429');
  });
});

describe('toEpochSeconds + validateKlineInterval helpers', () => {
  it('converts ISO strings, epoch ms and epoch seconds', () => {
    expect(toEpochSeconds('2026-09-14T00:00:00Z', 'startTime')).toBe(Math.floor(Date.parse('2026-09-14T00:00:00Z') / 1000));
    expect(toEpochSeconds(1_757_836_800_000, 'endTime')).toBe(1_757_836_800);
    expect(toEpochSeconds(1_757_836_800, 'startTime')).toBe(1_757_836_800);
    expect(toEpochSeconds('1757836800000', 'startTime')).toBe(1_757_836_800);
    expect(toEpochSeconds(undefined, 'x')).toBeUndefined();
  });

  it('rejects garbage time inputs', () => {
    expect(() => toEpochSeconds('not-a-date', 'startTime')).toThrow(/startTime/);
  });

  it('validates the full interval enum', () => {
    for (const interval of ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M']) {
      expect(validateKlineInterval(interval)).toBe(interval);
    }
    // Whitespace is trimmed; case is significant ('1M' vs '1m').
    expect(validateKlineInterval(' 1h ')).toBe('1h');
    expect(() => validateKlineInterval('1H')).toThrow(/Invalid interval/);
  });
});

describe('compactBackpackResponse', () => {
  it('truncates arrays beyond 50 entries with a marker', () => {
    const markets = Array.from({ length: 60 }, (_, i) => ({ symbol: `MKT_${i}` }));
    const res = compactBackpackResponse({ markets });
    const arr = res.markets as unknown[];
    expect(arr).toHaveLength(51);
    expect(arr[50]).toBe('[+10 more entries]');
    expect(res._truncated).toBeUndefined();
  });

  it('truncates strings beyond 500 chars (except real Solana transactions)', () => {
    const longString = 'a'.repeat(1200);
    const res = compactBackpackResponse({ longString, short: 'ok' });
    expect(String(res.longString)).toContain('… (+700 chars)');
    expect(res.short).toBe('ok');
  });

  it('sets _truncated + _originalSize when serialized output exceeds 30k chars', () => {
    const big = {
      rows: Array.from({ length: 50 }, (_, i) => ({
        symbol: `S${i}`,
        pad: 'x'.repeat(700),
      })),
    };
    const res = compactBackpackResponse(big);
    expect(res._truncated).toBe(true);
    expect(typeof res._originalSize).toBe('number');
    expect(String(res._note)).toContain('30,000');
  });

  it('converts BigInt to string', () => {
    const res = compactBackpackResponse({ ts: 123n });
    expect(res.ts).toBe('123');
  });
});

describe('registerBackpackPipelineTool', () => {
  it('registers through the shared pipeline wrapper', () => {
    registerBackpackPipelineTool(mockServer, makeContext(), 'sap_backpack_probe', {
      description: 'probe. Free read.',
      inputSchema: { type: 'object', properties: {} },
    }, async () => ({ data: { ok: true } }));
    expect(registered.get('sap_backpack_probe')).toBeDefined();
  });
});