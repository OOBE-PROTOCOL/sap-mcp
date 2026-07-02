import { describe, expect, it } from 'vitest';
import type { SapMcpConfig, SapMcpMonetizationConfig } from '../config/env.js';
import { McpMonetizationGate, normalizePaymentNetwork, resolvePaymentNetwork } from './monetization-gate.js';

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
});
