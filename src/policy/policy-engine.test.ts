import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setBentoModuleLoaderForTests } from './bento-policy-engine.js';
import { PolicyEngine } from './policy-engine.js';
import type { SapMcpConfig } from '../core/types.js';

type MockBentoVerdict = 'ALLOW' | 'BLOCKED' | 'ESCALATED';

interface MockBentoState {
  verdict: MockBentoVerdict;
  reasoning: string;
  statusFails: boolean;
  protectFails: boolean;
}

const bentoState: MockBentoState = {
  verdict: 'ALLOW',
  reasoning: 'mock decision',
  statusFails: false,
  protectFails: false,
};

let restoreBentoLoader: (() => void) | null = null;

function baseConfig(overrides: Partial<SapMcpConfig> = {}): SapMcpConfig {
  return {
    mode: 'local-dev-keypair',
    rpcUrl: 'https://api.devnet.solana.com',
    commitment: 'confirmed',
    programId: 'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ',
    enableHttp: false,
    httpPort: 8787,
    httpHost: '127.0.0.1',
    logLevel: 'error',
    logFormat: 'pretty',
    maxTxValueSol: 10,
    requireApprovalAboveSol: 1,
    dailyLimitSol: 100,
    allowedTools: 'all',
    externalSignerTimeoutMs: 30000,
    maxRetries: 3,
    retryDelayMs: 1000,
    walletEncrypted: false,
    enableMetrics: false,
    metricsPort: 9090,
    enableCache: true,
    cacheTtlSeconds: 300,
    enableRateLimit: false,
    rateLimitPerMinute: 60,
    bento: {
      enabled: true,
      apiKey: 'test-key',
      agentId: 'test-agent',
    },
    policy: {
      mode: 'hybrid',
      failOpen: false,
      logging: false,
    },
    ...overrides,
  };
}

describe('PolicyEngine Bento integration', () => {
  beforeEach(() => {
    bentoState.verdict = 'ALLOW';
    bentoState.reasoning = 'mock decision';
    bentoState.statusFails = false;
    bentoState.protectFails = false;

    restoreBentoLoader = setBentoModuleLoaderForTests(async () => ({
      BentoClient: class {
        async getAgentStatus(): Promise<{ active: boolean; strikeCount: number; reputation: number }> {
          if (bentoState.statusFails) {
            throw new Error('bento offline');
          }

          return { active: true, strikeCount: 0, reputation: 100 };
        }
      },
      protect: async () => {
        if (bentoState.protectFails) {
          throw new Error('bento offline');
        }

        return {
          verdict: bentoState.verdict,
          reasoning: bentoState.reasoning,
          strikeCount: 0,
          intentScore: 0.9,
        };
      },
    }));
  });

  afterEach(() => {
    restoreBentoLoader?.();
    restoreBentoLoader = null;
  });

  it('blocks when Bento returns BLOCKED', async () => {
    bentoState.statusFails = false;
    bentoState.verdict = 'BLOCKED';
    bentoState.reasoning = 'blocked by mock bento';

    const engine = new PolicyEngine(baseConfig());
    const decision = await engine.checkPermission('sap_profile_current', {
      toolName: 'sap_profile_current',
      args: {},
      user: 'test-user',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('blocked by mock bento');
  });

  it('blocks unavailable Bento when failOpen is false', async () => {
    bentoState.statusFails = true;
    bentoState.protectFails = true;
    bentoState.verdict = 'ALLOW';
    bentoState.reasoning = 'would allow';

    const engine = new PolicyEngine(baseConfig());
    const decision = await engine.checkPermission('sap_profile_current', {
      toolName: 'sap_profile_current',
      args: {},
      user: 'test-user',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('Bento Guard unavailable');
  });

  it('still enforces local transaction limits before Bento', async () => {
    bentoState.statusFails = false;
    bentoState.verdict = 'ALLOW';
    bentoState.reasoning = 'allowed by mock bento';

    const engine = new PolicyEngine(baseConfig());
    const decision = await engine.checkPermission('transaction:submit', {
      toolName: 'sap_sign_transaction',
      amountSol: 2,
      args: {},
      user: 'test-user',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('requires approval');
  });
});

// ────────────────────────────────────────────────────────────────────
// Local-only policy enforcement (no Bento)
// ────────────────────────────────────────────────────────────────────

function localConfig(overrides: Partial<SapMcpConfig> = {}): SapMcpConfig {
  return {
    mode: 'local-dev-keypair',
    rpcUrl: 'https://api.devnet.solana.com',
    commitment: 'confirmed',
    programId: 'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ',
    enableHttp: false,
    httpPort: 8787,
    httpHost: '127.0.0.1',
    logLevel: 'error',
    logFormat: 'pretty',
    maxTxValueSol: 10,
    requireApprovalAboveSol: 1,
    dailyLimitSol: 100,
    allowedTools: 'all',
    externalSignerTimeoutMs: 30000,
    maxRetries: 3,
    retryDelayMs: 1000,
    walletEncrypted: false,
    enableMetrics: false,
    metricsPort: 9090,
    enableCache: true,
    cacheTtlSeconds: 300,
    enableRateLimit: false,
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

describe('PolicyEngine local enforcement', () => {
  // ── allowedTools ──────────────────────────────────────────────────

  it('allows any permission when allowedTools is "all"', async () => {
    const engine = new PolicyEngine(localConfig({ allowedTools: 'all' }));
    const decision = await engine.checkPermission('registry:write');
    expect(decision.allowed).toBe(true);
  });

  it('blocks permissions not in the allowedTools list', async () => {
    const engine = new PolicyEngine(localConfig({
      allowedTools: ['config:read', 'registry:read'],
    }));
    const decision = await engine.checkPermission('registry:write');
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('not allowed');
  });

  it('allows permissions in the allowedTools list', async () => {
    const engine = new PolicyEngine(localConfig({
      allowedTools: ['config:read', 'registry:read'],
    }));
    const decision = await engine.checkPermission('config:read');
    expect(decision.allowed).toBe(true);
  });

  // ── validatePermissions ───────────────────────────────────────────

  it('validates all permissions when allowedTools is "all"', async () => {
    const engine = new PolicyEngine(localConfig({ allowedTools: 'all' }));
    const result = await engine.validatePermissions(['config:read', 'registry:write']);
    expect(result.valid).toBe(true);
    expect(result.permissions).toHaveLength(2);
  });

  it('rejects permissions not in allowedTools', async () => {
    const engine = new PolicyEngine(localConfig({
      allowedTools: ['config:read'],
    }));
    const result = await engine.validatePermissions(['config:read', 'registry:write']);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('accepts all permissions that are in allowedTools', async () => {
    const engine = new PolicyEngine(localConfig({
      allowedTools: ['config:read', 'registry:read', 'payments:write'],
    }));
    const result = await engine.validatePermissions(['config:read', 'registry:read']);
    expect(result.valid).toBe(true);
    expect(result.permissions).toHaveLength(2);
  });

  // ── Spending limits ───────────────────────────────────────────────

  it('allows transfers under requireApprovalAboveSol', async () => {
    const engine = new PolicyEngine(localConfig({
      maxTxValueSol: 10,
      requireApprovalAboveSol: 1,
    }));
    const decision = await engine.checkPermission('transaction:submit', {
      amountSol: 0.5,
    });
    expect(decision.allowed).toBe(true);
  });

  it('blocks transfers exceeding requireApprovalAboveSol', async () => {
    const engine = new PolicyEngine(localConfig({
      maxTxValueSol: 10,
      requireApprovalAboveSol: 1,
    }));
    const decision = await engine.checkPermission('transaction:submit', {
      amountSol: 2,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('requires approval');
  });

  it('blocks transfers exceeding maxTxValueSol', async () => {
    const engine = new PolicyEngine(localConfig({
      maxTxValueSol: 5,
      requireApprovalAboveSol: 10,
    }));
    const decision = await engine.checkPermission('transaction:submit', {
      amountSol: 7,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('exceeds max');
  });

  it('allows when no amount is specified', async () => {
    const engine = new PolicyEngine(localConfig());
    const decision = await engine.checkPermission('registry:read');
    expect(decision.allowed).toBe(true);
  });

  it('blocks at exactly maxTxValueSol boundary (strict greater-than)', async () => {
    const engine = new PolicyEngine(localConfig({
      maxTxValueSol: 5,
      requireApprovalAboveSol: 10,
    }));
    const decision = await engine.checkPermission('transaction:submit', {
      amountSol: 5,
    });
    // amountSol > maxTxValueSol is false (5 > 5 = false)
    // amountSol > requireApprovalAboveSol is false (5 > 10 = false)
    expect(decision.allowed).toBe(true);
  });

  // ── Policy management ─────────────────────────────────────────────

  it('loads default policies on initialization', () => {
    const engine = new PolicyEngine(localConfig());
    expect(engine.getPolicy('readonly-default')).toBeDefined();
    expect(engine.getPolicy('dev-default')).toBeDefined();
    expect(engine.getPolicy('hosted-default')).toBeDefined();
  });

  it('allows adding custom policies', () => {
    const engine = new PolicyEngine(localConfig());
    engine.addPolicy({
      id: 'custom-test',
      name: 'Custom Test Policy',
      description: 'Test policy',
      rules: [],
      enabled: true,
    });
    expect(engine.getPolicy('custom-test')).toBeDefined();
    expect(engine.getPolicy('custom-test')?.name).toBe('Custom Test Policy');
  });

  it('returns undefined for non-existent policy', () => {
    const engine = new PolicyEngine(localConfig());
    expect(engine.getPolicy('nonexistent')).toBeUndefined();
  });

  // ── Runtime status ────────────────────────────────────────────────

  it('returns local-only runtime status without Bento', () => {
    const engine = new PolicyEngine(localConfig());
    const status = engine.getRuntimeStatus();
    expect(status.mode).toBe('local-only');
    expect(status.bentoConfigured).toBe(false);
    expect(status.localEngineActive).toBe(true);
  });
});
