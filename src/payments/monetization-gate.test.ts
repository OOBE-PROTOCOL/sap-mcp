import type { IncomingMessage, ServerResponse } from 'http';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PassThrough } from 'stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SapMcpConfig, SapMcpMonetizationConfig } from '../config/env.js';
import { buildPaidVirtualPath, McpMonetizationGate, normalizePaymentNetwork, resolvePaymentNetwork } from './monetization-gate.js';
import { hashRequestBody } from './usage-ledger.js';

const baseMonetization: SapMcpMonetizationConfig = {
  enabled: true,
  provider: 'x402',
  payTo: '11111111111111111111111111111111',
  facilitatorUrl: 'http://127.0.0.1:8788/facilitator',
  maxTimeoutSeconds: 120,
  prices: {
    readPremiumUsd: 0.008,
    builderUsd: 0.05,
    valueFixedUsd: 0.2,
    valueBps: 50,
    minUsd: 0.001,
    maxUsd: 100,
  },
};

const baseConfig: SapMcpConfig = {
  mode: 'hosted-api',
  rpcUrl: 'https://api.devnet.solana.com',
  commitment: 'confirmed',
  programId: 'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ',
  maxRetries: 3,
  retryDelayMs: 1000,
  walletEncrypted: false,
  externalSignerTimeoutMs: 30000,
  enableHttp: true,
  httpPort: 8787,
  httpHost: '127.0.0.1',
  maxTxValueSol: 1,
  requireApprovalAboveSol: 1,
  dailyLimitSol: 10,
  allowedTools: 'all',
  logLevel: 'info',
  logFormat: 'pretty',
  enableMetrics: false,
  metricsPort: 9090,
  enableCache: true,
  cacheTtlSeconds: 300,
  enableRateLimit: true,
  rateLimitPerMinute: 60,
  monetization: baseMonetization,
};

interface CapturedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  response: ServerResponse;
}

function createRequest(body: Buffer, headers: IncomingMessage['headers']): IncomingMessage {
  const request = new PassThrough() as IncomingMessage;
  request.method = 'POST';
  request.url = '/mcp';
  request.headers = headers;
  Object.defineProperty(request, 'socket', {
    value: { remoteAddress: '127.0.0.1' },
  });
  request.end(body);
  return request;
}

function createResponse(): CapturedResponse {
  const capture: CapturedResponse = {
    statusCode: 200,
    headers: {},
    body: '',
    response: {} as ServerResponse,
  };
  const response = {
    statusCode: 200,
    setHeader(name: string, value: number | string | readonly string[]): ServerResponse {
      capture.headers[name.toLowerCase()] = Array.isArray(value) ? value.join(',') : String(value);
      return response as ServerResponse;
    },
    getHeaders(): Record<string, number | string | string[]> {
      return capture.headers;
    },
    writeHead(statusCode: number, headers?: Record<string, number | string | readonly string[]>): ServerResponse {
      response.statusCode = statusCode;
      capture.statusCode = statusCode;
      if (headers) {
        for (const [name, value] of Object.entries(headers)) {
          response.setHeader(name, value);
        }
      }
      return response as ServerResponse;
    },
    write(chunk: string | Uint8Array): boolean {
      capture.body += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8');
      return true;
    },
    end(chunk?: string | Uint8Array): ServerResponse {
      if (chunk) {
        response.write(chunk);
      }
      return response as ServerResponse;
    },
    flushHeaders(): void {
      return undefined;
    },
  };
  capture.response = response as ServerResponse;
  return capture;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MCP monetization gate readiness', () => {
  it('does not initialize when monetization is disabled', async () => {
    await expect(McpMonetizationGate.create({
      ...baseConfig,
      monetization: {
        ...baseMonetization,
        enabled: false,
      },
    })).resolves.toBeUndefined();
  });

  it('fails closed when payTo is missing', async () => {
    await expect(McpMonetizationGate.create({
      ...baseConfig,
      monetization: {
        ...baseMonetization,
        payTo: undefined,
      },
    })).rejects.toThrow('SAP_MCP_MONETIZATION_PAY_TO');
  });

  it('fails closed when facilitator URL is missing', async () => {
    await expect(McpMonetizationGate.create({
      ...baseConfig,
      monetization: {
        ...baseMonetization,
        facilitatorUrl: undefined,
      },
    })).rejects.toThrow('SAP_MCP_X402_FACILITATOR_URL');
  });

  it('derives Solana x402 networks from profile RPC when no explicit network is configured', () => {
    expect(resolvePaymentNetwork(baseConfig)).toBe('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1');
    expect(resolvePaymentNetwork({
      ...baseConfig,
      rpcUrl: 'https://api.mainnet-beta.solana.com',
    })).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
  });

  it('normalizes friendly Solana network aliases to x402 CAIP-2 identifiers', () => {
    expect(normalizePaymentNetwork('mainnet')).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
    expect(normalizePaymentNetwork('mainnet-beta')).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
    expect(normalizePaymentNetwork('devnet')).toBe('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1');
    expect(normalizePaymentNetwork('testnet')).toBe('solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z');
  });

  it('verifies signed retries with the client accepted requirements and facilitator auth', async () => {
    const previousXdgDataHome = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = mkdtempSync(join(tmpdir(), 'sap-mcp-payment-ledger-test-'));

    const body = Buffer.from(JSON.stringify({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'sap_list_all_agents',
        arguments: { limit: 5 },
      },
    }));
    const requestHash = hashRequestBody(body);
    const virtualPath = buildPaidVirtualPath({
      required: true,
      tier: 'read-premium',
      priceUsd: 0.008,
      price: '$0.008',
      description: 'test',
      toolPricings: [],
      toolNames: ['sap_list_all_agents'],
    }, requestHash);
    const accepted = {
      scheme: 'exact',
      network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
      asset: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
      amount: '8000',
      maxAmountRequired: '8000',
      payTo: baseMonetization.payTo,
      maxTimeoutSeconds: 120,
      extra: { feePayer: 'FeePayer111111111111111111111111111111111' },
    };
    const paymentPayload = {
      x402Version: 2,
      resource: {
        url: `https://mcp.sap.oobeprotocol.ai${virtualPath}`,
      },
      accepted,
      payload: {
        transaction: 'base64-transaction',
      },
    };
    const paymentHeader = Buffer.from(JSON.stringify(paymentPayload), 'utf-8').toString('base64');
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(input), init });
      if (String(input).endsWith('/supported')) {
        return new Response(JSON.stringify({
          kinds: [{
            x402Version: 2,
            scheme: 'exact',
            network: accepted.network,
            extra: accepted.extra,
          }],
          signers: {
            [accepted.network]: [accepted.extra.feePayer],
          },
          extensions: [],
        }), { status: 200 });
      }
      if (String(input).endsWith('/verify')) {
        return new Response(JSON.stringify({ isValid: true, payer: 'payer-address' }), { status: 200 });
      }
      return new Response(JSON.stringify({
        success: true,
        transaction: 'settlement-signature',
        network: accepted.network,
        amount: accepted.amount,
        payer: 'payer-address',
      }), { status: 200 });
    });

    try {
      const gate = await McpMonetizationGate.create({
        ...baseConfig,
        monetization: {
          ...baseMonetization,
          facilitatorAuthToken: 'facilitator-secret',
        },
      });
      if (!gate) {
        throw new Error('Expected monetization gate to initialize.');
      }

      const response = createResponse();
      await gate.handle(
        createRequest(body, {
          'content-type': 'application/json',
          'payment-signature': paymentHeader,
        }),
        response.response,
        async (_request, mcpResponse) => {
          mcpResponse.writeHead(200, { 'Content-Type': 'application/json' });
          mcpResponse.end(JSON.stringify({ jsonrpc: '2.0', id: 7, result: { ok: true } }));
        },
      );

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('"ok":true');
      expect(response.headers['payment-response']).toBeDefined();
      expect(fetchCalls).toHaveLength(3);
      expect(fetchCalls[1]?.url).toBe('http://127.0.0.1:8788/facilitator/verify');
      expect(fetchCalls[1]?.init?.headers).toMatchObject({
        Authorization: 'Bearer facilitator-secret',
      });
      const verifyBody = JSON.parse(String(fetchCalls[1]?.init?.body)) as {
        paymentRequirements: typeof accepted;
      };
      expect(verifyBody.paymentRequirements.extra.feePayer).toBe(accepted.extra.feePayer);
      expect(verifyBody.paymentRequirements.amount).toBe('8000');
    } finally {
      if (previousXdgDataHome === undefined) {
        delete process.env.XDG_DATA_HOME;
      } else {
        process.env.XDG_DATA_HOME = previousXdgDataHome;
      }
    }
  });
});
