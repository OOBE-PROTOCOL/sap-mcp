/**
 * @name tests/sunrise-tools
 * @description Unit tests for the Sunrise tool family: client behavior
 *   (amount validation, body stripping, poll state machine, error envelope)
 *   and tool registration. All network access is mocked — no live calls.
 *
 * @module tests/sunrise/sunrise-tools
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertBaseUnitAmount,
  stripUnknownKeys,
  SunriseApiClient,
  SunriseApiError,
  SUNRISE_CORE_MINTS,
} from './sunrise-client.js';
import { registerSunriseDataTools } from './sunrise-data-tools.js';
import { compactSunriseResponse } from './sunrise-pipeline.js';

const SUNRISE_TOOL_NAMES = [
  'sap_sunrise_list_tokens',
  'sap_sunrise_resolve_token',
  'sap_sunrise_get_quote',
  'sap_sunrise_execute_quote',
  'sap_sunrise_swap_intent',
];

type Handler = (args: Record<string, unknown>) => Promise<{ data: Record<string, unknown>; isError?: boolean }>;
const registered = new Map<string, { description: string; inputSchema: unknown; handler: Handler }>();

vi.mock('./sunrise-pipeline.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./sunrise-pipeline.js')>();
  return {
    ...actual,
    registerSunrisePipelineTool: (
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

function makeContext(): never {
  return { config: {} } as never;
}

const mockServer = {} as never;

describe('Sunrise tool registration', () => {
  it('registers all 5 sap_sunrise_ tools with pipeline descriptions', () => {
    registerSunriseDataTools(mockServer, makeContext());
    for (const name of SUNRISE_TOOL_NAMES) {
      const tool = registered.get(name);
      expect(tool, name).toBeDefined();
      expect(tool?.description.length ?? 0).toBeGreaterThan(40);
    }
    expect(registered.size).toBe(5);
  });

  it('list_tokens description carries the canonical-mint spoof warning', () => {
    registerSunriseDataTools(mockServer, makeContext());
    expect(registered.get('sap_sunrise_list_tokens')?.description).toContain('never trust mints from social media');
  });
});

type FetchMock = ReturnType<typeof vi.fn>;

function stubFetchSequence(responses: Array<{ status: number; body: unknown }>): FetchMock {
  let call = 0;
  const fetchMock = vi.fn(async () => {
    const next = responses[Math.min(call, responses.length - 1)];
    call++;
    return new Response(typeof next.body === 'string' ? next.body : JSON.stringify(next.body), {
      status: next.status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const MON_MINT = 'CrAr4RRJMBVwRsZtT62pEhfA9H5utymC2mVx8e7FreP2';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

function tokenPageResponse(): unknown {
  return {
    success: true,
    data: {
      count: 2,
      tokens: [
        {
          chain: 'solana', address: MON_MINT, symbol: 'MON', name: 'Monad', decimals: 8,
          platform: 'svm', assetClass: 'crypto', issuer: null, icon: null, tokenProgram: 'spl-token', stock: null,
        },
        {
          chain: 'solana', address: 'SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb', symbol: 'SPCX',
          name: 'SpaceX - Backpack Securities', decimals: 6, platform: 'svm', assetClass: 'stock',
          issuer: 'backpack_securities', icon: null, tokenProgram: 'token-2022', stock: null,
        },
      ],
      pagination: { nextCursor: null },
    },
    timestamp: '2026-09-14T00:00:00.000Z',
  };
}

function quoteResponse(withTx: boolean): unknown {
  return {
    success: true,
    data: {
      quotes: [
        {
          quoteId: 'q-123', routeName: 'titan', fromToken: USDC_MINT, toToken: MON_MINT,
          fromAmount: '1000000', toAmount: '4294862936', fromAmountUSD: 0.999, toAmountUSD: 0.996,
          ...(withTx ? { unsignedTransaction: 'u'.repeat(700), providerRequestId: 'pr-9', slippageBps: 50 } : {}),
        },
      ],
    },
    timestamp: '2026-09-14T00:00:00.000Z',
  };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('stripUnknownKeys + amount validation', () => {
  it('strips keys outside the allow-list (upstream additionalProperties:false)', () => {
    const result = stripUnknownKeys(
      { fromToken: 'a', toToken: 'b', fromAmount: '1', slippage: 50 } as never,
      ['fromToken', 'toToken', 'fromAmount'],
    );
    expect(result).toEqual({ fromToken: 'a', toToken: 'b', fromAmount: '1' });
  });

  it('rejects numeric amounts', () => {
    expect(() => assertBaseUnitAmount(1000000, 'fromAmount')).toThrow(/string in token base units/);
    expect(() => assertBaseUnitAmount('-5', 'fromAmount')).toThrow();
    expect(assertBaseUnitAmount('1000000', 'fromAmount')).toBe('1000000');
    expect(assertBaseUnitAmount('1.5', 'fromAmount')).toBe('1.5');
  });
});

describe('SunriseApiClient', () => {
  it('lists tokens with query params and parses pagination', async () => {
    const fetchMock = stubFetchSequence([{ status: 200, body: tokenPageResponse() }]);
    const client = new SunriseApiClient();
    const page = await client.listTokens({ limit: 50 });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://api.sunrise.xyz/v1/tokens?limit=50');
    expect(page.count).toBe(2);
    expect(page.tokens[0].symbol).toBe('MON');
    expect(page.nextCursor).toBeNull();
  });

  it('sends quote bodies with only allowed keys', async () => {
    const fetchMock = stubFetchSequence([{ status: 200, body: quoteResponse(false) }]);
    const client = new SunriseApiClient();
    const quotes = await client.getQuote({
      fromToken: USDC_MINT,
      toToken: MON_MINT,
      fromAmount: '1000000',
      slippage: 50,
    } as never);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['fromAmount', 'fromToken', 'toToken']);
    expect(quotes[0].routeName).toBe('titan');
  });

  it('executes and stops at CONFIRMED', async () => {
    stubFetchSequence([{ status: 200, body: { success: true, data: { txHash: 'sig1', status: 'CONFIRMED' } } }]);
    const client = new SunriseApiClient();
    const result = await client.executeQuoteAndWait(
      { signedTransaction: 's', quoteId: 'q', routeName: 'titan' },
      { maxAttempts: 3, intervalMs: 1 },
    );
    expect(result.status).toBe('CONFIRMED');
    expect(result.txHash).toBe('sig1');
  });

  it('polls SUBMITTED with the identical body until CONFIRMED', async () => {
    const fetchMock = stubFetchSequence([
      { status: 200, body: { success: true, data: { txHash: 'sig1', status: 'SUBMITTED' } } },
      { status: 200, body: { success: true, data: { txHash: 'sig1', status: 'SUBMITTED' } } },
      { status: 200, body: { success: true, data: { txHash: 'sig1', status: 'CONFIRMED' } } },
    ]);
    const client = new SunriseApiClient();
    const body = { signedTransaction: 's', quoteId: 'q', routeName: 'titan' };
    const result = await client.executeQuoteAndWait(body, { maxAttempts: 5, intervalMs: 1 });
    expect(result.status).toBe('CONFIRMED');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Every poll re-posts the IDENTICAL body.
    for (const call of fetchMock.mock.calls) {
      expect(JSON.parse((call[1] as RequestInit).body as string)).toEqual(body);
    }
  });

  it('throws sunrise_poll_timeout with duplicate-swap warning after max attempts', async () => {
    stubFetchSequence([{ status: 200, body: { success: true, data: { txHash: 'sig1', status: 'SUBMITTED' } } }]);
    const client = new SunriseApiClient();
    await expect(
      client.executeQuoteAndWait({ signedTransaction: 's', quoteId: 'q', routeName: 'titan' }, { maxAttempts: 3, intervalMs: 1 }),
    ).rejects.toThrow(/sunrise_poll_timeout.*duplicate-swap/);
  });

  it('parses the upstream error envelope into SunriseApiError', async () => {
    stubFetchSequence([
      { status: 400, body: { success: false, error: { code: 'invalid_quote_request', message: 'bad pair', requestId: 'req-1' } } },
    ]);
    const client = new SunriseApiClient();
    const err = await client.getQuote({ fromToken: 'x', toToken: 'y', fromAmount: '1' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SunriseApiError);
    const apiErr = err as SunriseApiError;
    expect(apiErr.status).toBe(400);
    expect(apiErr.code).toBe('invalid_quote_request');
    expect(apiErr.message).toContain('bad pair');
    expect(apiErr.requestId).toBe('req-1');
  });

  it('exposes the verified core mints', () => {
    expect(SUNRISE_CORE_MINTS.USDC.address).toBe(USDC_MINT);
    expect(SUNRISE_CORE_MINTS.USDC.decimals).toBe(6);
    expect(SUNRISE_CORE_MINTS.WBTC.decimals).toBe(8);
  });
});

describe('compactSunriseResponse', () => {
  it('preserves transaction base64 and truncates other long strings', () => {
    const tx = 'v'.repeat(700); // not a real tx — will be truncated
    const res = compactSunriseResponse({ tx, other: 'x'.repeat(600) }) as Record<string, string>;
    expect(res.tx).toContain('… (+');
    expect(res.other).toContain('… (+');
  });

  it('marks payloads whose upstream size exceeds the 30k cap', () => {
    const big = { rows: Array.from({ length: 60 }, (_, i) => ({ pad: 'y'.repeat(800), i })) };
    const res = compactSunriseResponse(big) as Record<string, unknown>;
    expect(res['_truncated']).toBe(true);
    expect(typeof res['_originalSize']).toBe('number');
  });
});