import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { describe, expect, it } from 'vitest';
import type { SapMcpContext, SapMcpConfig } from '../core/types.js';
import { registerTool } from '../adapters/mcp/sdk-compat.js';
import { BUILTIN_TOOL_MODULES, resolveBuiltinToolModulesForContext } from './builtin-tool-modules.js';
import {
  createToolModuleRegistrationPlan,
  createPluginToolModule,
  createToolModule,
  registerToolModules,
  selectToolModulesForContext,
  validateToolModules,
  type ToolModuleDefinition,
} from './module-registry.js';
import { parseToolModuleManifest } from './tool-module-manifest.js';
import { assertToolModuleCatalogValid, validateToolModuleCatalog, type ToolModuleRuntimeProfile } from './tool-module-validation.js';

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

function runtimeProfiles(): readonly ToolModuleRuntimeProfile[] {
  return [
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
}

function mockToolModule(overrides: Partial<ToolModuleDefinition> = {}): ToolModuleDefinition {
  return createToolModule({
    id: 'mock-module',
    title: 'Mock Module',
    description: 'Registers a mock tool for module registry tests.',
    category: 'integration',
    order: 10,
    expectedTools: ['sap_mock_tool'],
    register: (server) => {
      registerTool(
        server,
        'sap_mock_tool',
        {
          title: 'Mock Tool',
          description: 'Mock tool registered through a tool module.',
          inputSchema: {},
        },
        async () => ({ content: [{ type: 'text', text: 'ok' }] }),
      );
    },
    ...overrides,
  });
}

describe('tool module registry', () => {
  it('validates duplicate module ids and duplicate order values', () => {
    expect(() => validateToolModules([
      mockToolModule({ id: 'duplicate', order: 10 }),
      mockToolModule({ id: 'duplicate', order: 20 }),
    ])).toThrow('Duplicate tool module id');

    expect(() => validateToolModules([
      mockToolModule({ id: 'first', order: 10 }),
      mockToolModule({ id: 'second', order: 10 }),
    ])).toThrow('Duplicate tool module order');
  });

  it('validates module manifests before registration', () => {
    expect(() => parseToolModuleManifest({
      id: 'bad module',
      title: 'Bad',
      description: 'This manifest has an invalid module id.',
      category: 'integration',
      order: 1,
    })).toThrow();

    expect(() => createToolModule({
      ...mockToolModule(),
      expectedTools: ['BadToolName'],
    })).toThrow();
  });

  it('creates namespace-scoped plugin modules', () => {
    const pluginModule = createPluginToolModule(
      mockToolModule({
        id: 'acme-price-feed',
        title: 'ACME Price Feed',
        description: 'Registers ACME market data tools through a namespace-scoped plugin module.',
        order: 5_000,
        expectedTools: ['acme_price_feed'],
        register: (server) => {
          registerTool(
            server,
            'acme_price_feed',
            {
              title: 'ACME Price Feed',
              description: 'Mock ACME plugin tool.',
              inputSchema: {},
            },
            async () => ({ content: [{ type: 'text', text: 'ok' }] }),
          );
        },
      }),
      { namespace: 'acme', packageName: '@acme/sap-mcp-tools', version: '1.0.0' },
    );

    expect(pluginModule.namespace).toBe('acme');
    expect(pluginModule.packageName).toBe('@acme/sap-mcp-tools');
    expect(pluginModule.version).toBe('1.0.0');
    expect(() => createPluginToolModule(mockToolModule({ id: 'price-feed' }), { namespace: 'acme' }))
      .toThrow('must use namespace prefix');
    expect(() => createPluginToolModule(mockToolModule({ id: 'acme-low-order', order: 4999 }), { namespace: 'acme' }))
      .toThrow('must use order 5000-8999');
    expect(() => createPluginToolModule(mockToolModule({ id: 'acme-high-order', order: 9000 }), { namespace: 'acme' }))
      .toThrow('must use order 5000-8999');
    expect(() => createPluginToolModule(mockToolModule({ id: 'acme-price-feed', order: 5_000 }), { namespace: 'Bad_Namespace' }))
      .toThrow('must use lowercase kebab-case');
    expect(() => createPluginToolModule(mockToolModule({ id: 'acme-price-feed', order: 5_000 }), { namespace: 'acme', version: '1.0.0' }))
      .toThrow('must declare packageName provenance');
    expect(() => createPluginToolModule(mockToolModule({ id: 'acme-price-feed', order: 5_000 }), { namespace: 'acme', packageName: '@acme/sap-mcp-tools' }))
      .toThrow('must declare version provenance');
    expect(() => createPluginToolModule(
      mockToolModule({ id: 'acme-price-feed', order: 5_000, expectedTools: [] }),
      { namespace: 'acme', packageName: '@acme/sap-mcp-tools', version: '1.0.0' },
    )).toThrow('must declare expectedTools sentinels');
    expect(() => createPluginToolModule(
      mockToolModule({ id: 'acme-price-feed', order: 5_000, expectedTools: ['sap_mock_tool'] }),
      { namespace: 'acme', packageName: '@acme/sap-mcp-tools', version: '1.0.0' },
    )).toThrow('must use namespace prefix acme_');
  });

  it('keeps every built-in module covered by an expected tool sentinel', () => {
    for (const module of BUILTIN_TOOL_MODULES) {
      expect(module.expectedTools?.length, module.id).toBeGreaterThan(0);
    }
  });

  it('validates the built-in module catalog across runtime profiles', () => {
    const report = assertToolModuleCatalogValid(BUILTIN_TOOL_MODULES, runtimeProfiles());

    expect(report.moduleCount).toBe(BUILTIN_TOOL_MODULES.length);
    expect(report.profileSelections.map((selection) => selection.profileId)).toEqual([
      'local-stdio-wallet',
      'hosted-accountless',
      'payments-bridge-only',
    ]);
    expect(report.issues).toEqual([]);
  });

  it('creates a deterministic registration plan without executing tools', () => {
    const modules = [
      mockToolModule({ id: 'default-module', order: 20 }),
      mockToolModule({
        id: 'hosted-only',
        order: 30,
        when: (runtimeContext) => runtimeContext.config.mode === 'hosted-api',
      }),
      mockToolModule({
        id: 'bridge-module',
        order: 40,
        mode: 'payments-bridge-only',
      }),
    ];
    const plan = createToolModuleRegistrationPlan(modules, context({ mode: 'readonly' }));

    expect(plan.requestedMode).toBe('default');
    expect(plan.selectedModuleIds).toEqual(['default-module']);
    expect(plan.skippedModuleIds).toEqual(['hosted-only', 'bridge-module']);
    expect(plan.expectedTools).toEqual(['sap_mock_tool']);
    expect(plan.entries).toContainEqual(expect.objectContaining({
      id: 'hosted-only',
      selected: false,
      skipReason: 'runtime-predicate',
    }));
    expect(plan.entries).toContainEqual(expect.objectContaining({
      id: 'bridge-module',
      selected: false,
      skipReason: 'mode-mismatch',
    }));
  });

  it('reports missing sentinels and empty runtime selections', () => {
    const report = validateToolModuleCatalog([
      mockToolModule({ expectedTools: [] }),
    ], [{
      id: 'empty',
      description: 'Runtime profile with no selected modules.',
      context: context(),
      paymentsBridgeOnly: true,
    }]);

    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing-expected-tool-sentinel', moduleId: 'mock-module' }),
      expect.objectContaining({ code: 'empty-runtime-selection', profileId: 'empty' }),
    ]));
  });

  it('registers modules and verifies expected tools', async () => {
    const server = new Server({ name: 'test', version: '0.0.0' }, { capabilities: { tools: {} } });
    const summary = await registerToolModules(server, context(), [mockToolModule()]);

    expect(summary.totalTools).toBe(1);
    expect(summary.modules).toEqual([
      expect.objectContaining({
        id: 'mock-module',
        addedCount: 1,
      }),
    ]);
  });

  it('emits lifecycle hooks around successful plugin registration', async () => {
    const server = new Server({ name: 'test', version: '0.0.0' }, { capabilities: { tools: {} } });
    const events: string[] = [];
    const module = mockToolModule({
      lifecycle: {
        beforeRegister: ({ module: manifest, beforeCount }) => {
          events.push(`before:${manifest.id}:${beforeCount}`);
        },
        afterRegister: ({ module: manifest, addedCount }) => {
          events.push(`after:${manifest.id}:${addedCount}`);
        },
      },
    });

    await registerToolModules(server, context(), [module]);

    expect(events).toEqual([
      'before:mock-module:0',
      'after:mock-module:1',
    ]);
  });

  it('emits plugin lifecycle failures before rethrowing registration errors', async () => {
    const server = new Server({ name: 'test', version: '0.0.0' }, { capabilities: { tools: {} } });
    const events: string[] = [];
    const module = mockToolModule({
      expectedTools: ['sap_missing_tool'],
      register: () => undefined,
      lifecycle: {
        onRegisterError: ({ module: manifest, error }) => {
          events.push(`${manifest.id}:${error instanceof Error ? error.message : 'unknown error'}`);
        },
      },
    });

    await expect(registerToolModules(server, context(), [module]))
      .rejects.toThrow('did not register expected tool sap_missing_tool');
    expect(events).toEqual([
      'mock-module:Tool module mock-module did not register expected tool sap_missing_tool',
    ]);
  });

  it('selects hosted prepaid or local x402 helper based on runtime trust boundary', () => {
    const hostedModules = resolveBuiltinToolModulesForContext(context({ mode: 'hosted-api' }));
    const localModules = resolveBuiltinToolModulesForContext(context({ mode: 'readonly', walletPath: '/tmp/sap.json' }));

    expect(hostedModules.map((module) => module.id)).toContain('hosted-prepaid');
    expect(hostedModules.map((module) => module.id)).not.toContain('x402-local-helper');
    expect(localModules.map((module) => module.id)).toContain('x402-local-helper');
    expect(localModules.map((module) => module.id)).not.toContain('hosted-prepaid');
  });

  it('selects only the bridge module in payments bridge mode', () => {
    const previousValue = process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY;
    process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY = 'true';
    try {
      const selectedModules = selectToolModulesForContext(BUILTIN_TOOL_MODULES, context());

      expect(selectedModules.map((module) => module.id)).toEqual(['payments-bridge-only']);
    } finally {
      if (previousValue === undefined) {
        delete process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY;
      } else {
        process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY = previousValue;
      }
    }
  });
});
