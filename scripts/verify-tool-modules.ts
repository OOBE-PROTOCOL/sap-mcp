#!/usr/bin/env tsx
import type { SapMcpConfig, SapMcpContext } from '../src/core/types.js';
import { BUILTIN_TOOL_MODULES } from '../packages/tools/src/builtin-tool-modules.js';
import { buildToolCatalogForRuntimeProfiles } from '../packages/tools/src/tool-catalog.js';
import { buildToolModulePolicyCatalog } from '../packages/tools/src/tool-execution-metadata.js';
import { assertToolModuleCatalogValid, type ToolModuleRuntimeProfile } from '../packages/tools/src/tool-module-validation.js';

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

const runtimeProfiles: readonly ToolModuleRuntimeProfile[] = [
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
    id: 'hosted-with-local-signer',
    description: 'Hosted-compatible runtime backed by an explicit local signer path.',
    context: context({ mode: 'hosted-api', walletPath: '/tmp/sap-wallet.json' }),
  },
  {
    id: 'payments-bridge-only',
    description: 'Isolated local sap_payments bridge surface.',
    context: context({ mode: 'readonly', walletPath: '/tmp/sap-wallet.json' }),
    paymentsBridgeOnly: true,
  },
];

const report = assertToolModuleCatalogValid(BUILTIN_TOOL_MODULES, runtimeProfiles);
const policyCatalog = buildToolModulePolicyCatalog(BUILTIN_TOOL_MODULES);
const runtimeCatalogs = buildToolCatalogForRuntimeProfiles(BUILTIN_TOOL_MODULES, runtimeProfiles);
const policyIssues = policyCatalog.filter((entry) => (
  !entry.metadata.guidance.descriptionSuffix
  || !entry.metadata.signerBoundary
  || !entry.metadata.routing
));
const runtimeCatalogIssues = runtimeCatalogs.filter((catalog) => (
  catalog.moduleCount === 0
  || catalog.toolCount === 0
  || catalog.categories.length === 0
));

if (policyIssues.length > 0) {
  console.error('Tool module policy catalog verification failed:');
  for (const entry of policyIssues) {
    console.error(`- ${entry.moduleId}/${entry.toolName} has incomplete execution metadata`);
  }
  process.exit(1);
}

if (runtimeCatalogIssues.length > 0) {
  console.error('Tool runtime catalog verification failed:');
  for (const catalog of runtimeCatalogIssues) {
    console.error(`- ${catalog.profileId} has incomplete runtime catalog output`);
  }
  process.exit(1);
}

console.log('Tool module catalog OK');
console.log(JSON.stringify({
  moduleCount: report.moduleCount,
  policyEntries: policyCatalog.length,
  profiles: report.profileSelections.map((selection) => ({
    id: selection.profileId,
    modules: selection.moduleIds.length,
    expectedTools: selection.expectedTools.length,
    catalogTools: runtimeCatalogs.find((catalog) => catalog.profileId === selection.profileId)?.toolCount ?? 0,
  })),
}, null, 2));
