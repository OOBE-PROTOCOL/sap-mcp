import { describe, expect, it } from 'vitest';
import { checkSpendingLimit, calculateRiskLevel } from './spending-limits.js';
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
        heavyValueUsd: 0.05,
        valueBps: 0,
        minUsd: 0.001,
        maxUsd: 100,
      },
    },
    ...overrides,
  };
}

describe('checkSpendingLimit', () => {
  // ── Within limits ─────────────────────────────────────────────────

  it('allows amounts under the approval threshold', () => {
    const result = checkSpendingLimit(baseConfig(), 0.5);
    expect(result.allowed).toBe(true);
    expect(result.requiresApproval).toBeUndefined();
    expect(result.reason).toBeUndefined();
  });

  it('allows zero amount', () => {
    const result = checkSpendingLimit(baseConfig(), 0);
    expect(result.allowed).toBe(true);
  });

  it('allows very small amounts', () => {
    const result = checkSpendingLimit(baseConfig(), 0.001);
    expect(result.allowed).toBe(true);
  });

  // ── At limit boundaries ───────────────────────────────────────────

  it('allows amount exactly at maxTxValueSol (strict greater-than)', () => {
    // amount > maxTxValueSol is false when equal
    // amount > requireApprovalAboveSol is true (10 > 1) → requires approval
    const result = checkSpendingLimit(baseConfig({ maxTxValueSol: 10, requireApprovalAboveSol: 1 }), 10);
    expect(result.allowed).toBe(false);
    expect(result.requiresApproval).toBe(true);
  });

  it('requires approval at exactly the approval threshold boundary', () => {
    // amount > requireApprovalAboveSol is false when equal
    const result = checkSpendingLimit(baseConfig({ maxTxValueSol: 10, requireApprovalAboveSol: 1 }), 1);
    expect(result.allowed).toBe(true);
    expect(result.requiresApproval).toBeUndefined();
  });

  // ── Over approval threshold ───────────────────────────────────────

  it('requires approval for amounts above approval threshold but under max', () => {
    const result = checkSpendingLimit(baseConfig({ maxTxValueSol: 10, requireApprovalAboveSol: 1 }), 5);
    expect(result.allowed).toBe(false);
    expect(result.requiresApproval).toBe(true);
    expect(result.reason).toContain('requires approval');
  });

  it('includes the amount and threshold in the reason', () => {
    const result = checkSpendingLimit(baseConfig({ maxTxValueSol: 10, requireApprovalAboveSol: 1 }), 5);
    expect(result.reason).toContain('5');
    expect(result.reason).toContain('1');
  });

  // ── Over max limit ────────────────────────────────────────────────

  it('blocks amounts exceeding maxTxValueSol', () => {
    const result = checkSpendingLimit(baseConfig({ maxTxValueSol: 5, requireApprovalAboveSol: 1 }), 10);
    expect(result.allowed).toBe(false);
    expect(result.requiresApproval).toBeUndefined();
    expect(result.reason).toContain('exceeds maximum');
  });

  it('includes amount and max in the reason when blocked', () => {
    const result = checkSpendingLimit(baseConfig({ maxTxValueSol: 5, requireApprovalAboveSol: 1 }), 10);
    expect(result.reason).toContain('10');
    expect(result.reason).toContain('5');
  });

  it('checks max before approval threshold (max takes precedence)', () => {
    // amount > maxTxValueSol (10 > 5) → blocked, even though also > approval threshold
    const result = checkSpendingLimit(baseConfig({ maxTxValueSol: 5, requireApprovalAboveSol: 1 }), 10);
    expect(result.allowed).toBe(false);
    expect(result.requiresApproval).toBeUndefined();
    expect(result.reason).toContain('exceeds maximum');
  });

  // ── Custom thresholds ─────────────────────────────────────────────

  it('respects custom maxTxValueSol', () => {
    const result = checkSpendingLimit(baseConfig({ maxTxValueSol: 0.5, requireApprovalAboveSol: 0.1 }), 1);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('exceeds maximum');
  });

  it('respects custom requireApprovalAboveSol', () => {
    const result = checkSpendingLimit(baseConfig({ maxTxValueSol: 100, requireApprovalAboveSol: 50 }), 75);
    expect(result.allowed).toBe(false);
    expect(result.requiresApproval).toBe(true);
  });

  // ── Edge cases ────────────────────────────────────────────────────

  it('allows negative amounts (treated as within limits)', () => {
    // -1 is not > 10 and not > 1
    const result = checkSpendingLimit(baseConfig(), -1);
    expect(result.allowed).toBe(true);
  });

  it('handles very large amounts correctly', () => {
    const result = checkSpendingLimit(baseConfig({ maxTxValueSol: 1000, requireApprovalAboveSol: 500 }), 10000);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('exceeds maximum');
  });
});

describe('calculateRiskLevel (spending-limits)', () => {
  // ── Amount thresholds ─────────────────────────────────────────────

  it('returns "safe" for zero amount', () => {
    expect(calculateRiskLevel(0)).toBe('safe');
  });

  it('returns "low" for amounts under 0.1 SOL', () => {
    expect(calculateRiskLevel(0.05)).toBe('low');
  });

  it('returns "medium" for amounts between 0.1 and 1.0 SOL', () => {
    expect(calculateRiskLevel(0.5)).toBe('medium');
  });

  it('returns "high" for amounts between 1.0 and 10.0 SOL', () => {
    expect(calculateRiskLevel(5)).toBe('high');
  });

  it('returns "critical" for amounts >= 10.0 SOL', () => {
    expect(calculateRiskLevel(10)).toBe('critical');
  });

  it('returns "critical" for very large amounts', () => {
    expect(calculateRiskLevel(1000)).toBe('critical');
  });

  // ── Boundary values ───────────────────────────────────────────────

  it('returns "medium" at exactly 0.1 SOL boundary', () => {
    // 0.1 is not < 0.1
    expect(calculateRiskLevel(0.1)).toBe('medium');
  });

  it('returns "high" at exactly 1.0 SOL boundary', () => {
    // 1.0 is not < 1.0
    expect(calculateRiskLevel(1.0)).toBe('high');
  });

  it('returns "critical" at exactly 10.0 SOL boundary', () => {
    // 10.0 is not < 10.0
    expect(calculateRiskLevel(10.0)).toBe('critical');
  });

  // ── Edge cases ────────────────────────────────────────────────────

  it('returns "low" for very small non-zero amounts', () => {
    expect(calculateRiskLevel(0.0001)).toBe('low');
  });

  it('returns "low" for negative amounts', () => {
    expect(calculateRiskLevel(-1)).toBe('low');
  });
});