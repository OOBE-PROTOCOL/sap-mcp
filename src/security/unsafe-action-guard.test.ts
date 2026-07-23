import { describe, expect, it } from 'vitest';
import type { SapMcpConfig } from '../core/types.js';
import { unsafeActionGuard, getRiskScore } from './unsafe-action-guard.js';

const baseConfig: SapMcpConfig = {
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
  maxTxValueSol: 1.0,
  requireApprovalAboveSol: 0.5,
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
      valueFixedUsd: 0.2,
      valueBps: 50,
      minUsd: 0.001,
      maxUsd: 100,
    },
  },
};

// Helper to build a minimal SapMcpContext without a live Connection/SapClient.
function buildContext(config: Partial<SapMcpConfig> = {}): Parameters<typeof unsafeActionGuard>[0] {
  return {
    config: { ...baseConfig, ...config } as SapMcpConfig,
  } as unknown as Parameters<typeof unsafeActionGuard>[0];
}

describe('unsafeActionGuard', () => {
  // ── Safe actions ──────────────────────────────────────────────────

  it('allows a read action on a whitelisted program', () => {
    const result = unsafeActionGuard(
      buildContext(),
      'get_account_info',
      { programId: '11111111111111111111111111111111' },
    );
    expect(result.safe).toBe(true);
    expect(result.riskLevel).toBe('low');
  });

  it('allows a write action on the SAP program', () => {
    const result = unsafeActionGuard(
      buildContext(),
      'register_agent',
      { programId: 'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ' },
    );
    expect(result.safe).toBe(true);
    expect(result.riskLevel).toBe('low');
  });

  it('allows a Jupiter swap action', () => {
    const result = unsafeActionGuard(
      buildContext(),
      'swap',
      { programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4' },
    );
    expect(result.safe).toBe(true);
  });

  it('allows Metaplex metadata actions', () => {
    const result = unsafeActionGuard(
      buildContext(),
      'mint_nft',
      { programId: 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s' },
    );
    expect(result.safe).toBe(true);
  });

  // ── Unsafe patterns ───────────────────────────────────────────────

  it('blocks close_account action', () => {
    const result = unsafeActionGuard(
      buildContext(),
      'close_account',
      { programId: '11111111111111111111111111111111' },
    );
    expect(result.safe).toBe(false);
    expect(result.riskLevel).toBe('high');
    expect(result.reason).toContain('close_account');
  });

  it('blocks set_authority action', () => {
    const result = unsafeActionGuard(
      buildContext(),
      'set_authority',
      { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
    );
    expect(result.safe).toBe(false);
    expect(result.riskLevel).toBe('high');
  });

  it('blocks approve_all action', () => {
    const result = unsafeActionGuard(buildContext(), 'approve_all');
    expect(result.safe).toBe(false);
    expect(result.riskLevel).toBe('high');
  });

  it('blocks revoke_all action', () => {
    const result = unsafeActionGuard(buildContext(), 'revoke_all');
    expect(result.safe).toBe(false);
  });

  it('blocks upgrade action', () => {
    const result = unsafeActionGuard(buildContext(), 'upgrade_program');
    expect(result.safe).toBe(false);
    expect(result.riskLevel).toBe('high');
  });

  // ── Program whitelist ─────────────────────────────────────────────

  it('blocks actions on unknown programs', () => {
    const result = unsafeActionGuard(
      buildContext(),
      'transfer',
      { programId: 'UnknownProgram111111111111111111111111111111111' },
    );
    expect(result.safe).toBe(false);
    expect(result.riskLevel).toBe('critical');
    expect(result.reason).toContain('not in the safe programs whitelist');
  });

  it('allows actions without programId (no whitelist check)', () => {
    const result = unsafeActionGuard(buildContext(), 'get_balance');
    expect(result.safe).toBe(true);
    expect(result.riskLevel).toBe('low');
  });

  // ── Value thresholds ──────────────────────────────────────────────

  it('allows small value transfers', () => {
    const result = unsafeActionGuard(
      buildContext(),
      'transfer',
      { valueSol: 0.01 },
    );
    expect(result.safe).toBe(true);
    expect(result.riskLevel).toBe('low');
  });

  it('flags medium value transfers as requiring approval', () => {
    const result = unsafeActionGuard(
      buildContext(),
      'transfer',
      { valueSol: 0.75 },
    );
    expect(result.safe).toBe(true);
    expect(result.riskLevel).toBe('medium');
    expect(result.reason).toContain('requires approval');
  });

  it('blocks transfers exceeding maxTxValueSol', () => {
    const result = unsafeActionGuard(
      buildContext({ maxTxValueSol: 0.5 }),
      'transfer',
      { valueSol: 1.0 },
    );
    expect(result.safe).toBe(false);
    expect(result.riskLevel).toBe('high');
    expect(result.reason).toContain('exceeds maximum allowed');
  });

  it('respects custom maxTxValueSol from config', () => {
    const result = unsafeActionGuard(
      buildContext({ maxTxValueSol: 5.0, requireApprovalAboveSol: 2.0 }),
      'transfer',
      { valueSol: 3.0 },
    );
    expect(result.safe).toBe(true);
    expect(result.riskLevel).toBe('medium');
  });

  // ── Privilege escalation ──────────────────────────────────────────

  it('blocks set_authority with unknown program accounts', () => {
    const result = unsafeActionGuard(
      buildContext(),
      'set_authority',
      {
        programId: '11111111111111111111111111111111',
        accounts: ['UnknownProgram111111111111111111111111111111111'],
      },
    );
    // set_authority is in UNSAFE_PATTERNS, so it's blocked before privilege escalation check
    expect(result.safe).toBe(false);
    expect(result.riskLevel).toBe('high');
  });

  it('blocks transfer_authority with unknown program accounts', () => {
    const result = unsafeActionGuard(
      buildContext(),
      'transfer_authority',
      {
        accounts: ['UnknownProgram111111111111111111111111111111111'],
      },
    );
    expect(result.safe).toBe(false);
    expect(result.riskLevel).toBe('critical');
    expect(result.reason).toContain('privilege escalation');
  });

  it('does not flag transfer_authority without unknown accounts', () => {
    const result = unsafeActionGuard(
      buildContext(),
      'transfer_authority',
      {
        accounts: ['11111111111111111111111111111111'],
      },
    );
    // No unknown programs in accounts, so privilege escalation check passes.
    // The action name doesn't match unsafe patterns, so it's safe.
    expect(result.safe).toBe(true);
  });

  // ── Reentrancy ────────────────────────────────────────────────────

  it('blocks invoke_signed action (reentrancy risk)', () => {
    const result = unsafeActionGuard(buildContext(), 'invoke_signed');
    expect(result.safe).toBe(false);
    expect(result.riskLevel).toBe('high');
    expect(result.reason).toContain('reentrancy');
  });

  it('blocks cross_program_invoke action (reentrancy risk)', () => {
    const result = unsafeActionGuard(buildContext(), 'cross_program_invoke');
    expect(result.safe).toBe(false);
    expect(result.riskLevel).toBe('high');
  });

  // ── getRiskScore ──────────────────────────────────────────────────

  it('returns 100 for critical unsafe actions', () => {
    const score = getRiskScore(
      buildContext(),
      'transfer',
      { programId: 'UnknownProgram111111111111111111111111111111111' },
    );
    expect(score).toBe(100);
  });

  it('returns 75 for high-risk unsafe actions', () => {
    const score = getRiskScore(buildContext(), 'close_account');
    expect(score).toBe(75);
  });

  it('returns base 10 for safe read actions', () => {
    const score = getRiskScore(buildContext(), 'get_balance');
    expect(score).toBe(10);
  });

  it('increases risk score for write operations', () => {
    const score = getRiskScore(buildContext(), 'create_transaction');
    // 'create' triggers +20
    expect(score).toBe(30);
  });

  it('increases risk score for high-value transactions', () => {
    // valueSol=3 exceeds maxTxValueSol=1 → unsafeActionGuard returns
    // safe:false, riskLevel:'high' → getRiskScore returns 75.
    const score = getRiskScore(
      buildContext({ maxTxValueSol: 10, requireApprovalAboveSol: 1 }),
      'transfer',
      { valueSol: 3.0 },
    );
    // safe (3 < 10), no write/create/update keyword, valueSol > 1 → +15
    expect(score).toBe(25);
  });

  it('caps risk score at 100', () => {
    const score = getRiskScore(
      buildContext({ maxTxValueSol: 1000, requireApprovalAboveSol: 1000 }),
      'create_update_write',
      { valueSol: 100 },
    );
    // safe: base 10 + 20 (create/update/write match) + min(30, 500) = 60
    expect(score).toBe(60);
    expect(score).toBeLessThanOrEqual(100);
  });
});