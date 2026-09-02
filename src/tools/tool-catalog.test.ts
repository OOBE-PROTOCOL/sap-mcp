import { describe, expect, it } from 'vitest';
import { CATALOG_READONLY_TOOL_ALLOWLIST } from '../core/constants.js';
import type { SapMcpConfig, SapMcpContext } from '../core/types.js';
import { BUILTIN_TOOL_MODULES } from './builtin-tool-modules.js';
import {
  buildToolCatalog,
  buildToolCatalogForRuntimeProfiles,
  buildToolCatalogFromRuntimeTools,
  summarizeToolCatalog,
  type ToolCatalogRuntimeProfile,
} from './tool-catalog.js';

function config(overrides: Partial<SapMcpConfig> = {}): SapMcpConfig {
  return {
    mode: 'readonly',
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
    maxTxValueSol: 1,
    requireApprovalAboveSol: 1,
    dailyLimitSol: 10,
    allowedTools: 'all',
    logLevel: 'error',
    logFormat: 'pretty',
    enableMetrics: false,
    metricsPort: 9090,
    enableCache: true,
    cacheTtlSeconds: 300,
    enableRateLimit: true,
    rateLimitPerMinute: 60,
    jupiter: {
      apiBaseUrl: 'https://quote-api.jup.ag/v6',
      apiKeyConfigured: false,
      timeoutMs: 10000,
    },
    perps: {
      adrenaProgramId: '11111111111111111111111111111111',
      apiKeyConfigured: false,
      timeoutMs: 10000,
    },
    priorityFeeMicroLamports: 0,
    monetization: {
      enabled: false,
      provider: 'x402',
      maxTimeoutSeconds: 120,
      strictTools: false,
      prices: {
        microReadUsd: 0.001,
        readPremiumUsd: 0.002,
        builderUsd: 0.006,
        valueFixedUsd: 0.06,
        heavyValueUsd: 0.035,
        valueBps: 0,
        minUsd: 0.001,
        maxUsd: 100,
      },
    },
    ...overrides,
  };
}

function context(overrides: Partial<SapMcpConfig> = {}): SapMcpContext {
  return { config: config(overrides) } as SapMcpContext;
}

describe('tool catalog', () => {
  it('builds a wizard-ready local runtime catalog with module and policy summaries', () => {
    const catalog = buildToolCatalog(
      BUILTIN_TOOL_MODULES,
      context({ mode: 'readonly', walletPath: '/tmp/sap-wallet.json' }),
      { profileId: 'local-stdio-wallet' },
    );

    expect(catalog.profileId).toBe('local-stdio-wallet');
    expect(catalog.runtimeMode).toBe('readonly');
    expect(catalog.moduleCount).toBe(21);
    expect(catalog.toolCount).toBe(177);
    expect(catalog.modules.map((module) => module.id)).toContain('x402-local-helper');
    expect(catalog.modules.map((module) => module.id)).not.toContain('hosted-prepaid');
    expect(catalog.categories).toContainEqual(expect.objectContaining({
      category: 'payments',
      modules: 2,
      tools: 16,
    }));
    expect(catalog.policy.localSignerTools).toContain('sap_payments_call_paid_tool');
    expect(catalog.tools.find((tool) => tool.toolName === 'sap_register_agent')?.metadata.intent)
      .toBe('local-signer-write');
  });

  it('builds a hosted accountless runtime catalog without the local x402 helper', () => {
    const catalog = buildToolCatalog(
      BUILTIN_TOOL_MODULES,
      context({ mode: 'hosted-api', walletPath: undefined }),
      { profileId: 'hosted-accountless' },
    );

    expect(catalog.modules.map((module) => module.id)).toContain('hosted-prepaid');
    expect(catalog.modules.map((module) => module.id)).not.toContain('x402-local-helper');
    expect(catalog.tools.map((tool) => tool.toolName)).toContain('sap_payments_prepaid_balance');
    expect(catalog.policy.hostedAccountlessBlockedTools).toContain('sap_register_agent');
  });

  it('builds a runtime-registered catalog that keeps tools outside static sentinels', () => {
    const catalog = buildToolCatalogFromRuntimeTools(
      BUILTIN_TOOL_MODULES,
      context({ mode: 'hosted-api', walletPath: undefined }),
      [
        { name: 'sap_agent_start', description: 'Start SAP agent runtime.' },
        { name: 'sap_register_agent', description: 'Register an agent.' },
        { name: 'spl-token_getBalance', description: 'Read an SPL token balance.' },
        { name: 'jupiter_getHoldings', description: 'Read Jupiter holdings.' },
      ],
      { profileId: 'hosted-accountless-runtime' },
    );
    const toolNames = catalog.tools.map((tool) => tool.toolName);

    expect(catalog.toolCount).toBe(4);
    expect(toolNames).toEqual(expect.arrayContaining([
      'sap_agent_start',
      'sap_register_agent',
      'spl-token_getBalance',
      'jupiter_getHoldings',
    ]));
    expect(catalog.modules.map((module) => module.id)).toContain('solana-runtime');
    expect(catalog.modules.map((module) => module.id)).toContain('solana-integration-runtime');
    expect(catalog.tools.every((tool) => tool.registered)).toBe(true);
    expect(catalog.policy.hostedAccountlessBlockedTools).toContain('sap_register_agent');
  });

  it('builds a catalog read-only hosted summary without value-moving tools', () => {
    const catalog = buildToolCatalog(
      BUILTIN_TOOL_MODULES,
      context({
        mode: 'hosted-api',
        walletPath: undefined,
        allowedTools: [...CATALOG_READONLY_TOOL_ALLOWLIST],
      }),
      { profileId: 'hosted-catalog-readonly' },
    );
    const toolNames = catalog.tools.map((tool) => tool.toolName);

    expect(catalog.profileId).toBe('hosted-catalog-readonly');
    expect(toolNames).toContain('sap_agent_start');
    expect(toolNames).toContain('sap_get_agent');
    expect(toolNames).toContain('sap_network_stats');
    expect(toolNames).toContain('sap_skills_bundle');
    expect(toolNames).not.toContain('sap_register_agent');
    expect(toolNames).not.toContain('sap_update_agent');
    expect(toolNames).not.toContain('sap_submit_signed_transaction');
    expect(toolNames).not.toContain('sap_payments_call_paid_tool');
    expect(catalog.policy.hostedAccountlessBlockedTools).toEqual([]);
  });

  it('summarizes catalogs into a secret-free context shape for bootstrap tools', () => {
    const summary = summarizeToolCatalog(buildToolCatalog(
      BUILTIN_TOOL_MODULES,
      context({ mode: 'hosted-api', walletPath: undefined }),
      { profileId: 'hosted-accountless' },
    ));

    expect(summary).toMatchObject({
      profileId: 'hosted-accountless',
      runtimeMode: 'hosted-api',
      moduleCount: 21,
      toolCount: 164,
    });
    expect(summary.modules.map((module) => module.id)).toContain('hosted-prepaid');
    expect(summary.modules[0]).not.toHaveProperty('register');
    expect(summary.policy.hostedAccountlessBlockedTools).toContain('sap_register_agent');
    expect(JSON.stringify(summary)).not.toContain('walletPath');
    expect(JSON.stringify(summary)).not.toContain('api_key=');
  });

  it('builds an isolated payments bridge catalog without leaking default modules', () => {
    const catalog = buildToolCatalog(
      BUILTIN_TOOL_MODULES,
      context({ mode: 'readonly', walletPath: '/tmp/sap-wallet.json' }),
      { profileId: 'payments-bridge-only', paymentsBridgeOnly: true },
    );

    expect(catalog.paymentsBridgeOnly).toBe(true);
    expect(catalog.modules.map((module) => module.id)).toEqual(['payments-bridge-only']);
    expect(catalog.tools.map((tool) => tool.toolName)).toEqual([
      'sap_payments_profile_current',
      'sap_payments_wallet_guard',
      'sap_payments_readiness',
      'sap_payments_process_status',
      'sap_payments_call_paid_tool',
      'sap_x402_paid_call',
      'sap_payments_call_external_x402',
      'sap_payments_register_agent',
      'sap_payments_update_agent',
      'sap_payments_finalize_transaction',
      'sap_payments_prepare_challenge',
      'sap_payments_sign_challenge',
      'sap_payments_verify_receipt',
      'sap_payments_prepaid_balance',
      'sap_payments_start_prepaid',
    ]);
    expect(catalog.tools.map((tool) => tool.toolName)).not.toContain('sap_payments_fund_prepaid');
    expect(catalog.policy.localSignerTools).toEqual([
      'sap_payments_call_external_x402',
      'sap_payments_call_paid_tool',
      'sap_payments_finalize_transaction',
      'sap_payments_prepaid_balance',
      'sap_payments_prepare_challenge',
      'sap_payments_process_status',
      'sap_payments_profile_current',
      'sap_payments_readiness',
      'sap_payments_register_agent',
      'sap_payments_sign_challenge',
      'sap_payments_start_prepaid',
      'sap_payments_update_agent',
      'sap_payments_verify_receipt',
      'sap_payments_wallet_guard',
    ]);
  });

  it('builds catalogs for multiple release runtime profiles', () => {
    const profiles: readonly ToolCatalogRuntimeProfile[] = [
      {
        id: 'local-stdio-wallet',
        description: 'Local stdio MCP with a user-controlled signer profile.',
        context: context({ mode: 'readonly', walletPath: '/tmp/sap-wallet.json' }),
      },
      {
        id: 'hosted-accountless',
        description: 'Hosted Streamable HTTP deployment with no local signer path.',
        context: context({ mode: 'hosted-api', walletPath: undefined }),
      },
      {
        id: 'payments-bridge-only',
        description: 'Isolated local sap_payments bridge surface.',
        context: context({ mode: 'readonly', walletPath: '/tmp/sap-wallet.json' }),
        paymentsBridgeOnly: true,
      },
    ];

    const catalogs = buildToolCatalogForRuntimeProfiles(BUILTIN_TOOL_MODULES, profiles);

    expect(catalogs.map((catalog) => catalog.profileId)).toEqual([
      'local-stdio-wallet',
      'hosted-accountless',
      'payments-bridge-only',
    ]);
    expect(catalogs.map((catalog) => catalog.moduleCount)).toEqual([21, 21, 1]);
    expect(catalogs.every((catalog) => catalog.toolCount > 0)).toBe(true);
  });
});
