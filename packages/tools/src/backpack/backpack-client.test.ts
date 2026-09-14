/**
 * @name tests/backpack-client
 * @description Unit tests for the Backpack REST client: signing-string
 *   builder contract, Ed25519 sign/verify round-trip, URL building, upstream
 *   error parsing and response compaction. All network access is mocked —
 *   no live calls.
 *
 * @module tests/backpack/backpack-client
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync, verify as cryptoVerify, type KeyPairKeyObjectResult } from 'node:crypto';
import { Keypair, SystemProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import {
  BACKPACK_PATHS,
  BackpackApiClient,
  BackpackApiError,
  buildSigningString,
  compactBackpackResponse,
  deriveBackpackPublicKeyB64,
  signBackpackMessage,
  type BackpackOrderBody,
} from './backpack-client.js';

/** Generates a throwaway Ed25519 keypair and returns seed/pubkey as base64. */
function makeThrowawayKey(): { publicKeyB64: string; secretSeedB64: string; raw: KeyPairKeyObjectResult } {
  const raw = generateKeyPairSync('ed25519');
  const der = raw.privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer;
  const seedB64 = der.subarray(der.length - 32).toString('base64');
  const pubDer = raw.publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  const pubB64 = pubDer.subarray(pubDer.length - 32).toString('base64');
  return { publicKeyB64: pubB64, secretSeedB64: seedB64, raw };
}

type FetchMock = ReturnType<typeof vi.fn>;

/** Installs a global fetch mock returning a JSON response. */
function stubFetch(status: number, body: string | unknown): FetchMock {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const fetchMock = vi.fn(async () =>
    new Response(text, { status, headers: { 'Content-Type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Builds a real unsigned Solana v0 transaction (base64) for compaction tests. */
function makeRealVersionedTransactionBase64(): string {
  const payer = Keypair.generate();
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
    instructions: [
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: Keypair.generate().publicKey,
        lamports: 1_000,
      }),
    ],
  }).compileToV0Message();
  return Buffer.from(new VersionedTransaction(message).serialize()).toString('base64');
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildSigningString', () => {
  it('sorts params alphabetically and appends timestamp and window', () => {
    const s = buildSigningString(
      'orderCancel',
      { symbol: 'BTC_USDT', orderId: 28 },
      1614550000000,
      5000,
    );
    // Exact example from the Backpack docs.
    expect(s).toBe('instruction=orderCancel&orderId=28&symbol=BTC_USDT&timestamp=1614550000000&window=5000');
  });

  it('handles unsorted input by sorting keys alphabetically', () => {
    const s = buildSigningString(
      'orderExecute',
      { side: 'Bid', symbol: 'SOL_USDC_PERP', orderType: 'Limit', price: '141', quantity: '12' },
      1750793021519,
      5000,
    );
    expect(s).toBe(
      'instruction=orderExecute&orderType=Limit&price=141&quantity=12&side=Bid&symbol=SOL_USDC_PERP' +
        '&timestamp=1750793021519&window=5000',
    );
  });

  it('omits null/undefined params', () => {
    const s = buildSigningString(
      'orderQueryAll',
      { symbol: 'SOL_USDC', marketType: undefined, filler: null },
      1000,
      2000,
    );
    expect(s).toBe('instruction=orderQueryAll&symbol=SOL_USDC&timestamp=1000&window=2000');
  });

  it('emits only instruction, timestamp and window when there are no params', () => {
    expect(buildSigningString('balanceQuery', {}, 1699999999999, 5000)).toBe(
      'instruction=balanceQuery&timestamp=1699999999999&window=5000',
    );
    expect(buildSigningString('balanceQuery', {}, 1699999999999, 30000)).toBe(
      'instruction=balanceQuery&timestamp=1699999999999&window=30000',
    );
  });
});

describe('Ed25519 signing', () => {
  it('round-trips sign and verify with a generated throwaway keypair', () => {
    const { raw, secretSeedB64 } = makeThrowawayKey();
    const message = 'instruction=balanceQuery&timestamp=1614550000000&window=5000';
    const sigB64 = signBackpackMessage(message, secretSeedB64);
    const sig = Buffer.from(sigB64, 'base64');
    expect(sig.length).toBe(64);
    expect(cryptoVerify(null, Buffer.from(message), raw.publicKey, sig)).toBe(true);
  });

  it('produces a signature that fails verification when a single character is corrupted', () => {
    const { raw, secretSeedB64 } = makeThrowawayKey();
    const message = 'instruction=balanceQuery&timestamp=1614550000000&window=5000';
    const sigB64 = signBackpackMessage(message, secretSeedB64);
    // Flip one character of the base64 payload.
    const firstChar = sigB64[0];
    const corrupted = (firstChar === 'A' ? 'B' : 'A') + sigB64.slice(1);
    expect(corrupted).not.toBe(sigB64);
    const stillValid = cryptoVerify(null, Buffer.from(message), raw.publicKey, Buffer.from(sigB64, 'base64'));
    const corruptedValid = cryptoVerify(null, Buffer.from(message), raw.publicKey, Buffer.from(corrupted, 'base64'));
    expect(stillValid).toBe(true);
    expect(corruptedValid).toBe(false);
  });

  it('derives the same base64 public key from the seed as the throwaway keypair', () => {
    const { publicKeyB64, secretSeedB64 } = makeThrowawayKey();
    expect(deriveBackpackPublicKeyB64(secretSeedB64)).toBe(publicKeyB64);
  });
});

describe('public (unauthenticated) endpoints', () => {
  it('builds depth URLs with symbol and limit query params', async () => {
    const fetchMock = stubFetch(200, { bids: [], asks: [] });
    const client = new BackpackApiClient({ baseUrl: 'https://api.backpack.exchange' });
    await client.getDepth('SOL_USDC', 500);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://api.backpack.exchange/api/v1/depth?symbol=SOL_USDC&limit=500');
  });

  it('builds markets URLs with marketType filter', async () => {
    const fetchMock = stubFetch(200, []);
    const client = new BackpackApiClient();
    await client.getMarkets('PERP');
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://api.backpack.exchange/api/v1/markets?marketType=PERP');
  });

  it('sends klines intervals and epoch-SECOND start/end times', async () => {
    const fetchMock = stubFetch(200, []);
    const client = new BackpackApiClient();
    await client.getKlines('SOL_USDC', '1h', 1700000000, 1700003600);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(
      'https://api.backpack.exchange/api/v1/klines?symbol=SOL_USDC&interval=1h&startTime=1700000000&endTime=1700003600',
    );
  });

  it('hits the documented public paths', async () => {
    const fetchMock = stubFetch(200, { status: 'Ok', message: null });
    const client = new BackpackApiClient();
    expect(BACKPACK_PATHS.status).toBe('/api/v1/status');
    expect(BACKPACK_PATHS.time).toBe('/api/v1/time');
    expect(BACKPACK_PATHS.order).toBe('/api/v1/order');
    expect(BACKPACK_PATHS.orders).toBe('/api/v1/orders');
    expect(BACKPACK_PATHS.capital).toBe('/api/v1/capital');
    await client.getStatus();
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://api.backpack.exchange/api/v1/status');
  });

  it('returns non-JSON bodies verbatim (ping)', async () => {
    const fetchMock = vi.fn(async () => new Response('pong', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new BackpackApiClient();
    const result = await client.getPing();
    expect(result).toBe('pong');
  });
});

describe('error parsing', () => {
  it('parses a 404 plain-text "not found" body into a typed BackpackApiError', async () => {
    stubFetch(404, 'not found');
    const client = new BackpackApiClient();
    const err = await client.getTicker('NOPE_USDC').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BackpackApiError);
    const apiErr = err as BackpackApiError;
    expect(apiErr.status).toBe(404);
    expect(apiErr.message).toContain('not found');
    expect(typeof apiErr.code).toBe('string');
  });

  it('parses a JSON error envelope and surfaces code + message', async () => {
    stubFetch(400, { code: 'INVALID_CLIENT_REQUEST', message: 'Invalid X-Signature header' });
    const key = makeThrowawayKey();
    const client = new BackpackApiClient({ apiKey: { publicKeyB64: key.publicKeyB64, secretSeedB64: key.secretSeedB64 } });
    const err = await client.getBalances().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BackpackApiError);
    const apiErr = err as BackpackApiError;
    expect(apiErr.status).toBe(400);
    expect(apiErr.code).toBe('INVALID_CLIENT_REQUEST');
    expect(apiErr.message).toContain('Invalid X-Signature header');
  });
});

describe('signed endpoints', () => {
  it('throws backpack_credentials_required when no apiKey is configured', async () => {
    const fetchMock = stubFetch(200, {});
    const client = new BackpackApiClient();
    await expect(client.getBalances()).rejects.toMatchObject({ code: 'backpack_credentials_required' });
    await expect(client.executeOrder({ symbol: 'SOL_USDC', side: 'Bid', orderType: 'Market' } as BackpackOrderBody))
      .rejects.toMatchObject({ code: 'backpack_credentials_required' });
    await expect(client.requestWithdrawal({ address: 'x', blockchain: 'Solana', symbol: 'SOL', quantity: '1' }))
      .rejects.toMatchObject({ code: 'backpack_credentials_required' });
    // No network call was attempted.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the documented auth headers with a verifiable Ed25519 signature', async () => {
    const fetchMock = stubFetch(200, {});
    const key = makeThrowawayKey();
    const client = new BackpackApiClient({ apiKey: { publicKeyB64: key.publicKeyB64, secretSeedB64: key.secretSeedB64 }, windowMs: 7000 });
    await client.getBalances();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.backpack.exchange/api/v1/capital');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-API-Key']).toBe(key.publicKeyB64);
    expect(headers['X-Window']).toBe('7000');
    expect(headers['X-Timestamp']).toMatch(/^\d{13}$/);
    const sig = Buffer.from(headers['X-Signature'], 'base64');
    expect(sig.length).toBe(64);
    // The signature must verify over the exact signing string the builder emits.
    const timestamp = headers['X-Timestamp'];
    const signingString = `instruction=balanceQuery&timestamp=${timestamp}&window=7000`;
    expect(cryptoVerify(null, Buffer.from(signingString), key.raw.publicKey, sig)).toBe(true);
  });

  it('signs order execution over the body params and POSTs JSON', async () => {
    const fetchMock = stubFetch(200, { id: 'order-1' });
    const key = makeThrowawayKey();
    const client = new BackpackApiClient({ apiKey: { publicKeyB64: key.publicKeyB64, secretSeedB64: key.secretSeedB64 } });
    await client.executeOrder({
      symbol: 'SOL_USDC_PERP', side: 'Bid', orderType: 'Limit', price: '141', quantity: '12',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.backpack.exchange/api/v1/order');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({ symbol: 'SOL_USDC_PERP', side: 'Bid', orderType: 'Limit', price: '141', quantity: '12' });
    const timestamp = headers['X-Timestamp'];
    const signingString = buildSigningString(
      'orderExecute',
      { side: 'Bid', symbol: 'SOL_USDC_PERP', orderType: 'Limit', price: '141', quantity: '12' },
      Number(timestamp),
      5000,
    );
    expect(cryptoVerify(null, Buffer.from(signingString), key.raw.publicKey, Buffer.from(headers['X-Signature'], 'base64'))).toBe(true);
  });

  it('cancels an order via DELETE with a signed body', async () => {
    const fetchMock = stubFetch(200, {});
    const key = makeThrowawayKey();
    const client = new BackpackApiClient({ apiKey: { publicKeyB64: key.publicKeyB64, secretSeedB64: key.secretSeedB64 } });
    await client.cancelOrder('BTC_USDT', '28');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.backpack.exchange/api/v1/order');
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(init.body as string)).toEqual({ orderId: '28', symbol: 'BTC_USDT' });
    const headers = init.headers as Record<string, string>;
    expect(headers['X-API-Key']).toBe(key.publicKeyB64);
  });
});

describe('compactBackpackResponse', () => {
  it('caps arrays at 50 entries with a remainder marker', () => {
    const input = { tokens: Array.from({ length: 60 }, (_, i) => ({ i })) };
    const out = compactBackpackResponse(input) as { tokens: unknown[] };
    expect(out.tokens.length).toBe(51);
    expect(out.tokens[50]).toBe('[+10 more entries]');
  });

  it('truncates long strings but preserves real Solana transaction base64', () => {
    const tx = makeRealVersionedTransactionBase64();
    const input = { long: 'x'.repeat(600), tx, short: 'ok' };
    const out = compactBackpackResponse(input) as Record<string, string>;
    expect(out.long.length).toBeLessThan(600);
    expect(out.long).toContain('+');
    expect(out.tx).toBe(tx);
    expect(out.short).toBe('ok');
  });

  it('converts BigInt values to strings', () => {
    const out = compactBackpackResponse({ big: 9007199254740993n }) as { big: string };
    expect(out.big).toBe('9007199254740993');
  });

  it('marks the payload when the 30k total cap is exceeded', () => {
    const input = { rows: Array.from({ length: 100 }, (_, i) => ({ text: `row-${i}-` + 'y'.repeat(900) })) };
    const out = compactBackpackResponse(input) as Record<string, unknown>;
    expect(out['_truncated']).toBe(true);
    expect(typeof out['_originalSize']).toBe('number');
    expect((out['_originalSize'] as number)).toBeGreaterThan(30_000);
    expect(typeof out['_note']).toBe('string');
  });
});