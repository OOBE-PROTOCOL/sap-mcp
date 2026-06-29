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
