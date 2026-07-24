import { describe, expect, it } from 'vitest';
import { isApprovalRequired } from './approval-required.js';
import type { SapMcpConfig } from '../core/types.js';

function baseConfig(overrides: Partial<SapMcpConfig> = {}): SapMcpConfig {
  return {
    mode: 'local-dev-keypair',
    rpcUrl: 'https://api.devnet.solana.com',
    commitment: 'confirmed',
    programId: 'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ',
    maxRetries: 3,
    retryDelayMs: 1000,
    walletEncrypted: false,
    externalSignerTimeoutMs: 30000,
    enableHttp: false,
    httpPort: 8787,
    httpHost: '127.0.0.1',
    maxTxValueSol: 10,
    requireApprovalAboveSol: 1,
    dailyLimitSol: 100,
    allowedTools: 'all',
    logLevel: 'info',
    logFormat: 'pretty',
    enableMetrics: false,
    metricsPort: 9090,
    enableCache: true,
    cacheTtlSeconds: 300,
    enableRateLimit: true,
    rateLimitPerMinute: 60,
    monetization: {
      enabled: false,
      provider: 'x402',
      payTo: '11111111111111111111111111111111',
      facilitatorUrl: '',
      maxTimeoutSeconds: 120,
      strictTools: false,
      prices: {
        readPremiumUsd: 0.001,
        builderUsd: 0.008,
        valueFixedUsd: 0.09,
        heavyValueUsd: 0.15,
        valueBps: 0,
        minUsd: 0.001,
        maxUsd: 100,
      },
    },
    ...overrides,
  };
}

function buildContext(config: Partial<SapMcpConfig> = {}): Parameters<typeof isApprovalRequired>[0] {
  return {
    config: baseConfig(config),
  } as unknown as Parameters<typeof isApprovalRequired>[0];
}

describe('isApprovalRequired', () => {
  // ── Below threshold — no approval ─────────────────────────────────

  it('returns false for amount below threshold', () => {
    expect(isApprovalRequired(buildContext({ requireApprovalAboveSol: 1 }), 0.5)).toBe(false);
  });

  it('returns false for zero amount', () => {
    expect(isApprovalRequired(buildContext({ requireApprovalAboveSol: 1 }), 0)).toBe(false);
  });

  it('returns false for very small amounts', () => {
    expect(isApprovalRequired(buildContext({ requireApprovalAboveSol: 1 }), 0.001)).toBe(false);
  });

  // ── At threshold boundary ─────────────────────────────────────────

  it('returns false at exactly the threshold (strict greater-than)', () => {
    // amount > requireApprovalAboveSol is false when equal
    expect(isApprovalRequired(buildContext({ requireApprovalAboveSol: 1 }), 1)).toBe(false);
  });

  // ── Above threshold — approval required ───────────────────────────

  it('returns true for amount above threshold', () => {
    expect(isApprovalRequired(buildContext({ requireApprovalAboveSol: 1 }), 2)).toBe(true);
  });

  it('returns true for amount well above threshold', () => {
    expect(isApprovalRequired(buildContext({ requireApprovalAboveSol: 1 }), 100)).toBe(true);
  });

  it('returns true for amount just above threshold', () => {
    expect(isApprovalRequired(buildContext({ requireApprovalAboveSol: 1 }), 1.001)).toBe(true);
  });

  // ── Custom thresholds ─────────────────────────────────────────────

  it('respects custom threshold of 0.5 SOL', () => {
    const ctx = buildContext({ requireApprovalAboveSol: 0.5 });
    expect(isApprovalRequired(ctx, 0.4)).toBe(false);
    expect(isApprovalRequired(ctx, 0.5)).toBe(false);
    expect(isApprovalRequired(ctx, 0.6)).toBe(true);
  });

  it('respects custom threshold of 10 SOL', () => {
    const ctx = buildContext({ requireApprovalAboveSol: 10 });
    expect(isApprovalRequired(ctx, 9)).toBe(false);
    expect(isApprovalRequired(ctx, 10)).toBe(false);
    expect(isApprovalRequired(ctx, 11)).toBe(true);
  });

  it('respects custom threshold of 0 SOL', () => {
    // Any positive amount > 0 requires approval
    const ctx = buildContext({ requireApprovalAboveSol: 0 });
    expect(isApprovalRequired(ctx, 0)).toBe(false);
    expect(isApprovalRequired(ctx, 0.001)).toBe(true);
  });

  // ── Edge cases ────────────────────────────────────────────────────

  it('returns false for negative amounts', () => {
    // -1 is not > 1
    expect(isApprovalRequired(buildContext({ requireApprovalAboveSol: 1 }), -1)).toBe(false);
  });

  it('returns true for negative amount when threshold is very negative', () => {
    const ctx = buildContext({ requireApprovalAboveSol: -10 });
    expect(isApprovalRequired(ctx, -5)).toBe(true);
    expect(isApprovalRequired(ctx, -10)).toBe(false);
  });
});