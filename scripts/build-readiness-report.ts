#!/usr/bin/env tsx
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SapMcpConfig, SapMcpContext } from '../src/core/types.js';
import { MCP_SERVER_VERSION } from '../src/core/constants.js';
import { BUILTIN_TOOL_MODULES } from '../src/tools/builtin-tool-modules.js';
import { buildToolCatalogForRuntimeProfiles } from '../src/tools/tool-catalog.js';
import { buildToolModulePolicyCatalog } from '../src/tools/tool-execution-metadata.js';
import { assertToolModuleCatalogValid, type ToolModuleRuntimeProfile } from '../src/tools/tool-module-validation.js';
import { buildToolCardCoverageReport, classifyToolCardCoverage } from '../src/ui/tool-card-registry.js';
import { createDefaultDesktopWizardDraft, getDesktopHostedDiscovery } from '../src/wizard-core/desktop-flow.js';
import {
  buildHostedPaymentBridgeContent,
  HOSTED_SAP_MCP_URL,
  validateHostedPaymentBridgeContent,
  type McpClientTarget,
} from '../src/config/mcp-client-injection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const checkMode = process.argv.includes('--check');

function readText(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf-8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

function toRepoRelativePath(absolutePath: string): string {
  return path.relative(repoRoot, absolutePath).split(path.sep).join('/');
}

function walkSourceFiles(dir: string): string[] {
  return readdirSync(dir).sort().flatMap((entry): string[] => {
    const absolutePath = path.join(dir, entry);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      return walkSourceFiles(absolutePath);
    }
    if (!entry.endsWith('.ts') || entry.endsWith('.test.ts') || entry.endsWith('.d.ts')) {
      return [];
    }
    return [absolutePath];
  });
}

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

const requiredBranchPrefixes = [
  'feature/hosted-mcp/',
  'feature/local-bridge/',
  'feature/wizard/',
  'feature/mcp-apps-ui/',
  'feature/payments-x402/',
  'feature/protocol-tools/',
  'feature/integrations/',
  'feature/release-ops/',
] as const;

const requiredServiceContracts = [
  'Hosted MCP',
  'Local bridge',
  'Wizard',
  'MCP Apps UI',
  'Release artifacts',
] as const;

const requiredPersonas = [
  'Non-technical user',
  'Developer',
  'Agent operator',
  'Hosted operator',
  'Integration maintainer',
] as const;

const requiredPackageExports = [
  './core',
  './schemas',
  './mcp-adapter',
  './ui-cards',
  './tools',
  './config-runtime',
  './server-runtime',
  './hosted-gateway',
  './local-bridge',
  './wizard-core',
] as const;

const requiredReleaseScripts = [
  'typecheck',
  'lint',
  'check:architecture',
  'verify:tool-modules',
  'verify:workspace-packages',
  'verify:tool-plugin-template',
  'verify:tool-execution-pipeline',
  'verify:skill-workflows',
  'verify:company-readiness',
  'verify:readiness-report',
  'test:run',
  'build',
  'verify:exports',
] as const;

const requiredWorkflowCommands = [
  'pnpm run typecheck',
  'pnpm run lint',
  'pnpm run check:architecture',
  'pnpm run verify:tool-modules',
  'pnpm run verify:workspace-packages',
  'pnpm run verify:tool-plugin-template',
  'pnpm run verify:tool-execution-pipeline',
  'pnpm run verify:skill-workflows',
  'pnpm run verify:company-readiness',
  'pnpm run verify:readiness-report',
  'pnpm run test:run',
  'pnpm run build',
  'pnpm run verify:exports',
  'npm pack --dry-run',
] as const;

const requiredPluginModulePolicyEvidence = [
  {
    id: 'namespace-kebab-case',
    file: 'src/tools/module-registry.ts',
    contains: 'must use lowercase kebab-case',
  },
  {
    id: 'package-provenance',
    file: 'src/tools/module-registry.ts',
    contains: 'must declare packageName provenance',
  },
  {
    id: 'version-provenance',
    file: 'src/tools/module-registry.ts',
    contains: 'must declare version provenance',
  },
  {
    id: 'expected-tool-sentinels',
    file: 'src/tools/module-registry.ts',
    contains: 'must declare expectedTools sentinels',
  },
  {
    id: 'expected-tool-namespace-prefix',
    file: 'src/tools/module-registry.ts',
    contains: 'must use namespace prefix',
  },
  {
    id: 'plugin-template-docs',
    file: 'packages/tool-plugin-template/README.md',
    contains: 'Pass `packageName` and `version`',
  },
] as const;

const issues: string[] = [];
function addIssue(message: string): void {
  issues.push(message);
}

function listSourceFiles(relativePath: string): string[] {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    return [];
  }

  const stat = statSync(absolutePath);
  if (stat.isFile()) {
    return relativePath.endsWith('.ts') && !relativePath.endsWith('.test.ts') ? [relativePath] : [];
  }

  const files: string[] = [];
  for (const entry of readdirSync(absolutePath, { withFileTypes: true })) {
    const childPath = `${relativePath}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(childPath));
    } else if (entry.isFile() && childPath.endsWith('.ts') && !childPath.endsWith('.test.ts')) {
      files.push(childPath);
    }
  }
  return files;
}

function isPhysicalPackageSource(source: string, packagePath: string): boolean {
  return source === `${packagePath}/src` || source.startsWith(`${packagePath}/src/`);
}

const packageJson = readJson<{
  version: string;
  scripts: Record<string, string>;
  exports: Record<string, unknown>;
}>('package.json');
const exportContracts = readJson<Record<string, readonly string[]>>('config/package-export-contracts.json');
const workspacePackageContracts = readJson<{
  packages: readonly {
    id: string;
    packageName: string;
    path: string;
    source: string;
    additionalSources?: readonly string[];
    legacyCompatibilitySource?: string;
    physicalSource?: boolean;
    architectureDomain: string | null;
    rootExport: string | null;
    template?: boolean;
    requiredScripts?: Record<string, string>;
  }[];
}>('config/workspace-package-contracts.json');
const skillWorkflowContracts = readJson<{
  requiredSkills: readonly { id: string }[];
  workflowCommands: readonly string[];
}>('config/skill-workflow-contracts.json');
const branchReviewContracts = readJson<{
  requiredBranchPrefixes: readonly string[];
  requiredPullRequestSections: readonly string[];
  requiredPullRequestChecklistPhrases: readonly string[];
}>('config/branch-review-contracts.json');
const companyReadinessContracts = readJson<{
  requirements: readonly { id: string; description: string }[];
  requiredWorkflowCommands: readonly string[];
  minimumRequirementCount: number;
}>('config/company-readiness-contracts.json');
const mcpAppsCardContracts = readJson<{
  minimumSpecializedToolsAcrossRuntimeProfiles: number;
  requiredSpecializedTools: readonly string[];
}>('config/mcp-apps-card-contracts.json');
const wizardReadinessContracts = readJson<{
  requiredSourceOfTruth: string;
  requiredDefaultMode: string;
  requiredDefaultRuntime: string;
  requiredSetupModes: readonly string[];
  requiredReadinessStatuses: readonly string[];
  requiredRuntimeActionStatuses: readonly string[];
  requiredHostedDiscoveryUrls: readonly { field: keyof ReturnType<typeof getDesktopHostedDiscovery>; url: string }[];
  minimumRequiredLocalBridgeTools: number;
  requiredLocalBridgeTools: readonly string[];
  requiredHostedPrepaidTools: readonly string[];
}>('config/wizard-readiness-contracts.json');
const runtimeClientInjectionContracts = readJson<{
  hostedUrl: string;
  hostedServerName: string;
  paymentBridgeServerName: string;
  requiredBridgeEnv: Record<string, string>;
  requiredValidationFunctions: readonly string[];
  forbiddenRuntimeConfigContent: readonly string[];
  requiredRuntimeProfiles: readonly {
    id: McpClientTarget['id'];
    label: string;
    format: McpClientTarget['format'];
    pathSuffix: string;
    runtimeId: string;
    hostedServerName?: string;
    requiredMarkers: readonly string[];
  }[];
}>('config/runtime-client-injection-contracts.json');
const toolExecutionPipelineContracts = readJson<{
  requiredExportSymbols: readonly string[];
  requiredEvidence: readonly { file: string; contains: string }[];
  requiredPipelineTools: readonly { toolName: string; file: string; moduleId: string }[];
  minimumPipelineToolFiles: number;
  minimumPipelineToolRegistrations: number;
  allowedDirectRegisterPipelineToolFiles: readonly string[];
  maximumLegacyRegisterToolFiles: number;
  additionalLegacyRegisterToolAuditFiles: readonly string[];
}>('config/tool-execution-pipeline-contracts.json');
const architectureBoundaries = readJson<{
  root: string;
  domains: Record<string, readonly string[]>;
  allowed: Record<string, readonly string[]>;
  ignoreDomains: readonly string[];
}>('config/architecture-boundaries.json');
const branchDoc = readText('docs/BRANCHING_CI_RELEASE_WORKFLOW.md');
const operatingModel = readText('docs/20_ENGINEERING_OPERATING_MODEL_BOUNDARIES.md');
const userMcpClientMatrixDoc = readText('USER_DOCS/04_MCP_CLIENT_CONFIGURATION_MATRIX.md');
const pullRequestTemplate = readText('.github/pull_request_template.md');
const desktopWizardSource = readText('src/wizard-core/desktop-flow.ts');
const mcpClientInjectionSource = readText('src/config/mcp-client-injection.ts');
const ciWorkflow = readText('.github/workflows/ci.yml');
const desktopWorkflow = readText('.github/workflows/desktop-release.yml');

const validationReport = assertToolModuleCatalogValid(BUILTIN_TOOL_MODULES, runtimeProfiles);
const policyCatalog = buildToolModulePolicyCatalog(BUILTIN_TOOL_MODULES);
const runtimeCatalogs = buildToolCatalogForRuntimeProfiles(BUILTIN_TOOL_MODULES, runtimeProfiles);
const toolPluginTemplateContract = workspacePackageContracts.packages.find((contract) => contract.id === 'tool-plugin-template');
const nonToolExecutionAuditFiles = new Set([
  'src/tools/index.ts',
  'src/tools/tool-execution-pipeline.ts',
  'src/tools/tool-family-pipeline.ts',
  'src/tools/tool-execution-metadata.ts',
  'src/tools/tool-module-manifest.ts',
  'src/tools/tool-module-validation.ts',
  'src/tools/tool-catalog.ts',
  'src/tools/module-registry.ts',
  'src/tools/builtin-tool-modules.ts',
  'src/tools/tool-aliases.ts',
]);
const toolExecutionSourceFiles = walkSourceFiles(path.join(repoRoot, 'src/tools'))
  .map((absolutePath) => toRepoRelativePath(absolutePath))
  .filter((relativePath) => !nonToolExecutionAuditFiles.has(relativePath));
const registerPipelineToolPattern = /\bregisterPipelineTool(?:\s*<[^(\n]+>)?\s*\(/g;
const registerPipelineAdapterPattern = /^\s*register[A-Z][A-Za-z0-9]+PipelineTool(?:\s*<[^(\n]+>)?\s*\(/gm;
function hasPipelineToolRegistration(text: string): boolean {
  registerPipelineToolPattern.lastIndex = 0;
  registerPipelineAdapterPattern.lastIndex = 0;
  return registerPipelineToolPattern.test(text) || registerPipelineAdapterPattern.test(text);
}
function countPipelineToolRegistrations(text: string): number {
  registerPipelineToolPattern.lastIndex = 0;
  registerPipelineAdapterPattern.lastIndex = 0;
  return (text.match(registerPipelineToolPattern) ?? []).length
    + (text.match(registerPipelineAdapterPattern) ?? []).length;
}
const pipelineToolFiles = toolExecutionSourceFiles.filter((relativePath) => (
  hasPipelineToolRegistration(readText(relativePath))
));
const directRegisterPipelineToolFiles = toolExecutionSourceFiles.filter((relativePath) => {
  registerPipelineToolPattern.lastIndex = 0;
  return registerPipelineToolPattern.test(readText(relativePath));
});
const disallowedDirectRegisterPipelineToolFiles = directRegisterPipelineToolFiles.filter((relativePath) => (
  !toolExecutionPipelineContracts.allowedDirectRegisterPipelineToolFiles.includes(relativePath)
));
const legacyRegisterToolAuditFiles = [...new Set([
  ...toolExecutionSourceFiles,
  ...toolExecutionPipelineContracts.additionalLegacyRegisterToolAuditFiles,
])];
const legacyRegisterToolFiles = legacyRegisterToolAuditFiles.filter((relativePath) => (
  existsSync(path.join(repoRoot, relativePath)) && /\bregisterTool\s*\(/.test(readText(relativePath))
));
const missingLegacyRegisterToolAuditFiles = legacyRegisterToolAuditFiles.filter((relativePath) => (
  !existsSync(path.join(repoRoot, relativePath))
));
const pipelineToolRegistrationCount = pipelineToolFiles.reduce((count, relativePath) => (
  count + countPipelineToolRegistrations(readText(relativePath))
), 0);
const runtimeToolNames = [...new Set(runtimeCatalogs.flatMap((catalog) => (
  catalog.tools.map((tool) => tool.toolName)
)))].sort();
const paymentsBridgeToolNames = runtimeCatalogs
  .filter((catalog) => catalog.paymentsBridgeOnly)
  .flatMap((catalog) => catalog.tools.map((tool) => tool.toolName));
const paymentsBridgeToolNameSet = new Set(paymentsBridgeToolNames);
const runtimeCardCoverage = buildToolCardCoverageReport(runtimeToolNames);
const missingRequiredSpecializedCardTools = mcpAppsCardContracts.requiredSpecializedTools.filter((toolName) => (
  !runtimeToolNames.includes(toolName)
));
const genericRequiredSpecializedCardTools = mcpAppsCardContracts.requiredSpecializedTools.filter((toolName) => (
  runtimeToolNames.includes(toolName) && classifyToolCardCoverage(toolName) !== 'specialized'
));
const desktopHostedDiscovery = getDesktopHostedDiscovery();
const desktopWizardDraft = createDefaultDesktopWizardDraft();
const missingWizardDiscoveryUrls = wizardReadinessContracts.requiredHostedDiscoveryUrls.filter((entry) => (
  desktopHostedDiscovery[entry.field] !== entry.url
));
const missingWizardLocalBridgeTools = wizardReadinessContracts.requiredLocalBridgeTools.filter((toolName) => (
  !desktopHostedDiscovery.requiredLocalBridgeTools.includes(toolName)
));
const missingRuntimeLocalBridgeTools = wizardReadinessContracts.requiredLocalBridgeTools.filter((toolName) => (
  !paymentsBridgeToolNameSet.has(toolName)
));
const missingWizardHostedPrepaidTools = wizardReadinessContracts.requiredHostedPrepaidTools.filter((toolName) => (
  !desktopHostedDiscovery.requiredHostedPrepaidTools.includes(toolName)
));
const missingRuntimeHostedPrepaidTools = wizardReadinessContracts.requiredHostedPrepaidTools.filter((toolName) => (
  !runtimeCatalogs.some((catalog) => !catalog.paymentsBridgeOnly && catalog.tools.some((tool) => tool.toolName === toolName))
));
const missingWizardLocalBridgeToolsInUserDocs = wizardReadinessContracts.requiredLocalBridgeTools.filter((toolName) => (
  !userMcpClientMatrixDoc.includes(toolName)
));
const missingWizardHostedPrepaidToolsInUserDocs = wizardReadinessContracts.requiredHostedPrepaidTools.filter((toolName) => (
  !userMcpClientMatrixDoc.includes(toolName)
));
const missingWizardSetupModeSourceEvidence = wizardReadinessContracts.requiredSetupModes.filter((setupMode) => (
  !desktopWizardSource.includes(`'${setupMode}'`) && !desktopWizardSource.includes(`"${setupMode}"`)
));
const missingWizardReadinessStatusSourceEvidence = wizardReadinessContracts.requiredReadinessStatuses.filter((status) => (
  !desktopWizardSource.includes(`'${status}'`) && !desktopWizardSource.includes(`"${status}"`)
));
const missingWizardRuntimeActionStatusSourceEvidence = wizardReadinessContracts.requiredRuntimeActionStatuses.filter((status) => (
  !desktopWizardSource.includes(`'${status}'`) && !desktopWizardSource.includes(`"${status}"`)
));
const runtimeClientInjectionProfileReports = runtimeClientInjectionContracts.requiredRuntimeProfiles.map((profile) => {
  const target: McpClientTarget = {
    id: profile.id,
    label: profile.label,
    path: path.join('/tmp', profile.pathSuffix),
    format: profile.format,
    exists: true,
  };
  const built = buildHostedPaymentBridgeContent(target, profile.format === 'json' ? '{}' : '', 'darwin');
  const validationIssues = validateHostedPaymentBridgeContent(target, built.nextContent, 'darwin');
  const missingMarkers = profile.requiredMarkers.filter((marker) => !built.nextContent.includes(marker));
  const missingRequiredEnv = Object.entries(runtimeClientInjectionContracts.requiredBridgeEnv)
    .filter(([key, value]) => !built.nextContent.includes(key) || !built.nextContent.includes(value))
    .map(([key]) => key);
  const forbiddenContentFound = runtimeClientInjectionContracts.forbiddenRuntimeConfigContent.filter((forbidden) => (
    built.nextContent.includes(forbidden)
  ));
  return {
    id: profile.id,
    label: profile.label,
    format: profile.format,
    runtimeId: profile.runtimeId,
    hostedServerName: profile.hostedServerName ?? runtimeClientInjectionContracts.hostedServerName,
    validationIssues,
    missingMarkers,
    missingRequiredEnv,
    forbiddenContentFound,
  };
});
const missingRuntimeClientInjectionFunctions = runtimeClientInjectionContracts.requiredValidationFunctions.filter((functionName) => (
  !mcpClientInjectionSource.includes(`function ${functionName}`)
  && !mcpClientInjectionSource.includes(`export function ${functionName}`)
));
const runtimeClientInjectionProfilesWithIssues = runtimeClientInjectionProfileReports.filter((profile) => (
  profile.validationIssues.length > 0
  || profile.missingMarkers.length > 0
  || profile.missingRequiredEnv.length > 0
  || profile.forbiddenContentFound.length > 0
));
const missingBranchReviewPrefixes = branchReviewContracts.requiredBranchPrefixes.filter((branchPrefix) => (
  !branchDoc.includes(branchPrefix) || !operatingModel.includes(branchPrefix)
));
const missingPullRequestSections = branchReviewContracts.requiredPullRequestSections.filter((section) => (
  !pullRequestTemplate.includes(section)
));
const missingPullRequestChecklistPhrases = branchReviewContracts.requiredPullRequestChecklistPhrases.filter((phrase) => (
  !pullRequestTemplate.includes(phrase)
));

for (const profile of runtimeCatalogs) {
  if (profile.moduleCount === 0 || profile.toolCount === 0) {
    addIssue(`Runtime profile ${profile.profileId} produced an empty tool catalog.`);
  }
  const coverage = buildToolCardCoverageReport(profile.tools.map((tool) => tool.toolName));
  if (coverage.totalTools !== profile.toolCount) {
    addIssue(`Runtime profile ${profile.profileId} card coverage does not match catalog tool count.`);
  }
}

if (runtimeCardCoverage.specializedTools < mcpAppsCardContracts.minimumSpecializedToolsAcrossRuntimeProfiles) {
  addIssue(`MCP Apps Card specialized coverage has ${runtimeCardCoverage.specializedTools} tools, expected at least ${mcpAppsCardContracts.minimumSpecializedToolsAcrossRuntimeProfiles}.`);
}

if (missingRequiredSpecializedCardTools.length > 0) {
  addIssue(`MCP Apps Card required specialized tools are missing from runtime catalogs: ${missingRequiredSpecializedCardTools.join(', ')}.`);
}

if (genericRequiredSpecializedCardTools.length > 0) {
  addIssue(`MCP Apps Card required specialized tools resolved to generic cards: ${genericRequiredSpecializedCardTools.join(', ')}.`);
}

if (desktopWizardDraft.mode !== wizardReadinessContracts.requiredDefaultMode) {
  addIssue(`Desktop wizard default mode is ${desktopWizardDraft.mode}, expected ${wizardReadinessContracts.requiredDefaultMode}.`);
}

if (!desktopWizardDraft.configureRuntimes.includes(wizardReadinessContracts.requiredDefaultRuntime as typeof desktopWizardDraft.configureRuntimes[number])) {
  addIssue(`Desktop wizard default runtimes do not include ${wizardReadinessContracts.requiredDefaultRuntime}.`);
}

if (!wizardReadinessContracts.requiredSetupModes.includes(desktopWizardDraft.setupMode)) {
  addIssue(`Desktop wizard default setup mode ${desktopWizardDraft.setupMode} is not allowed by wizard readiness contracts.`);
}

if (desktopHostedDiscovery.sourceOfTruth !== wizardReadinessContracts.requiredSourceOfTruth) {
  addIssue(`Desktop hosted discovery source of truth is ${desktopHostedDiscovery.sourceOfTruth}, expected ${wizardReadinessContracts.requiredSourceOfTruth}.`);
}

if (missingWizardDiscoveryUrls.length > 0) {
  addIssue(`Desktop hosted discovery URL contract mismatch: ${missingWizardDiscoveryUrls.map((entry) => entry.field).join(', ')}.`);
}

if (desktopHostedDiscovery.requiredLocalBridgeTools.length < wizardReadinessContracts.minimumRequiredLocalBridgeTools) {
  addIssue(`Desktop hosted discovery exposes ${desktopHostedDiscovery.requiredLocalBridgeTools.length} local bridge tools, expected at least ${wizardReadinessContracts.minimumRequiredLocalBridgeTools}.`);
}

if (missingWizardLocalBridgeTools.length > 0) {
  addIssue(`Desktop hosted discovery is missing local bridge tools: ${missingWizardLocalBridgeTools.join(', ')}.`);
}

if (missingRuntimeLocalBridgeTools.length > 0) {
  addIssue(`Payments bridge runtime catalog is missing wizard-required local bridge tools: ${missingRuntimeLocalBridgeTools.join(', ')}.`);
}

if (missingWizardHostedPrepaidTools.length > 0) {
  addIssue(`Desktop hosted discovery is missing hosted prepaid tools: ${missingWizardHostedPrepaidTools.join(', ')}.`);
}

if (missingRuntimeHostedPrepaidTools.length > 0) {
  addIssue(`Hosted runtime catalog is missing prepaid tools: ${missingRuntimeHostedPrepaidTools.join(', ')}.`);
}

if (missingWizardLocalBridgeToolsInUserDocs.length > 0) {
  addIssue(`User MCP client matrix is missing wizard-required local bridge tools: ${missingWizardLocalBridgeToolsInUserDocs.join(', ')}.`);
}

if (missingWizardHostedPrepaidToolsInUserDocs.length > 0) {
  addIssue(`User MCP client matrix is missing hosted prepaid tools: ${missingWizardHostedPrepaidToolsInUserDocs.join(', ')}.`);
}

if (missingWizardSetupModeSourceEvidence.length > 0) {
  addIssue(`Desktop wizard source is missing setup modes required by contract: ${missingWizardSetupModeSourceEvidence.join(', ')}.`);
}

if (missingWizardReadinessStatusSourceEvidence.length > 0) {
  addIssue(`Desktop wizard source is missing readiness statuses required by contract: ${missingWizardReadinessStatusSourceEvidence.join(', ')}.`);
}

if (missingWizardRuntimeActionStatusSourceEvidence.length > 0) {
  addIssue(`Desktop wizard source is missing runtime action statuses required by contract: ${missingWizardRuntimeActionStatusSourceEvidence.join(', ')}.`);
}

if (runtimeClientInjectionContracts.hostedUrl !== HOSTED_SAP_MCP_URL) {
  addIssue(`Runtime client injection contract hostedUrl is ${runtimeClientInjectionContracts.hostedUrl}, expected ${HOSTED_SAP_MCP_URL}.`);
}

if (missingRuntimeClientInjectionFunctions.length > 0) {
  addIssue(`Runtime client injection source is missing contract-required functions: ${missingRuntimeClientInjectionFunctions.join(', ')}.`);
}

for (const profile of runtimeClientInjectionProfilesWithIssues) {
  addIssue(`Runtime client injection profile ${profile.label} (${profile.format}) violates contract: validation=${profile.validationIssues.join('; ') || 'ok'}, missingMarkers=${profile.missingMarkers.join(', ') || 'none'}, missingEnv=${profile.missingRequiredEnv.join(', ') || 'none'}, forbidden=${profile.forbiddenContentFound.join(', ') || 'none'}.`);
}

for (const entry of policyCatalog) {
  if (!entry.metadata.signerBoundary || !entry.metadata.routing || !entry.metadata.guidance.descriptionSuffix) {
    addIssue(`Tool policy metadata incomplete for ${entry.moduleId}/${entry.toolName}.`);
  }
}

for (const specifier of requiredPackageExports) {
  if (!(specifier in packageJson.exports)) {
    addIssue(`Package export ${specifier} is missing from package.json.`);
  }
  if (!(specifier in exportContracts)) {
    addIssue(`Package export ${specifier} is missing from config/package-export-contracts.json.`);
  }
}

for (const scriptName of requiredReleaseScripts) {
  const releaseScript = packageJson.scripts['verify:release:offline'] ?? '';
  if (!releaseScript.includes(`pnpm run ${scriptName}`) && scriptName !== 'verify:exports') {
    addIssue(`verify:release:offline does not run pnpm run ${scriptName}.`);
  }
}
if (!packageJson.scripts['verify:release:offline']?.includes('pnpm run verify:exports')) {
  addIssue('verify:release:offline does not run pnpm run verify:exports.');
}
if (!packageJson.scripts['verify:readiness-report']?.includes('build-readiness-report.ts --check')) {
  addIssue('verify:readiness-report script is missing or does not run the readiness report in check mode.');
}
if (!packageJson.scripts['verify:workspace-packages']?.includes('verify-workspace-packages.mjs')) {
  addIssue('verify:workspace-packages script is missing or does not run the workspace package verifier.');
}
if (!packageJson.scripts['verify:tool-plugin-template']?.includes('@oobe-protocol-labs/sap-mcp-tool-plugin-template')) {
  addIssue('verify:tool-plugin-template script is missing or does not target the tool plugin template package.');
}
if (!packageJson.scripts['verify:tool-execution-pipeline']?.includes('verify-tool-execution-pipeline.mjs')) {
  addIssue('verify:tool-execution-pipeline script is missing or does not run the tool execution pipeline verifier.');
}
if (!packageJson.scripts['verify:skill-workflows']?.includes('verify-skill-workflows.mjs')) {
  addIssue('verify:skill-workflows script is missing or does not run the skill workflow verifier.');
}
if (!packageJson.scripts['verify:company-readiness']?.includes('verify-company-readiness.mjs')) {
  addIssue('verify:company-readiness script is missing or does not run the company readiness verifier.');
}

for (const contract of workspacePackageContracts.packages) {
  if (contract.rootExport !== null && !requiredPackageExports.includes(contract.rootExport as typeof requiredPackageExports[number])) {
    addIssue(`Workspace package ${contract.id} root export ${contract.rootExport} is not part of the required package export set.`);
  }
  if (contract.physicalSource === true) {
    if (!isPhysicalPackageSource(contract.source, contract.path)) {
      addIssue(`Workspace package ${contract.id} physical source ${contract.source} must live under ${contract.path}/src.`);
    }
    if (listSourceFiles(contract.source).length === 0) {
      addIssue(`Workspace package ${contract.id} physical source ${contract.source} has no non-test TypeScript files.`);
    }
    if (typeof contract.legacyCompatibilitySource !== 'string' || !existsSync(path.join(repoRoot, contract.legacyCompatibilitySource))) {
      addIssue(`Workspace package ${contract.id} must declare an existing legacyCompatibilitySource while src compatibility remains active.`);
    }
  }
  const sourceRootPrefix = `${architectureBoundaries.root}/`;
  for (const source of [contract.source, ...(contract.additionalSources ?? [])]) {
    if (isPhysicalPackageSource(source, contract.path)) {
      continue;
    }
    if (!source.startsWith(sourceRootPrefix)) {
      if (contract.architectureDomain !== null) {
        addIssue(`Workspace package ${contract.id} source ${source} is outside ${architectureBoundaries.root}/ and must use architectureDomain null.`);
      }
      continue;
    }
    const relativeSource = source.slice(sourceRootPrefix.length);
    const architectureDomain = contract.architectureDomain;
    const patterns = architectureDomain === null ? [] : architectureBoundaries.domains[architectureDomain] ?? [];
    const coveredByArchitectureDomain = patterns.some((pattern) => {
      const normalized = pattern.replace(/\/$/, '');
      return relativeSource === normalized || relativeSource.startsWith(`${normalized}/`) || normalized.startsWith(`${relativeSource}/`);
    });
    if (architectureDomain === null) {
      addIssue(`Workspace package ${contract.id} source ${contract.source} must declare an architecture domain.`);
    } else if (!(architectureDomain in architectureBoundaries.domains)) {
      addIssue(`Workspace package ${contract.id} architecture domain ${architectureDomain} is missing.`);
    } else if (!coveredByArchitectureDomain) {
      addIssue(`Workspace package ${contract.id} architecture domain ${architectureDomain} does not cover ${source}.`);
    }
  }
}

if (!toolPluginTemplateContract?.template) {
  addIssue('Workspace package contracts must declare tool-plugin-template as a template package.');
}
if (!toolPluginTemplateContract?.requiredScripts?.typecheck || !toolPluginTemplateContract.requiredScripts.verify) {
  addIssue('Tool plugin template contract must require typecheck and verify scripts.');
}

for (const evidence of requiredPluginModulePolicyEvidence) {
  if (!readText(evidence.file).includes(evidence.contains)) {
    addIssue(`Plugin module policy evidence ${evidence.id} is missing from ${evidence.file}.`);
  }
}

for (const symbolName of toolExecutionPipelineContracts.requiredExportSymbols) {
  if (!exportContracts['./tools']?.includes(symbolName)) {
    addIssue(`Tool execution pipeline export ${symbolName} is missing from ./tools contract.`);
  }
}

for (const evidence of toolExecutionPipelineContracts.requiredEvidence) {
  if (!readText(evidence.file).includes(evidence.contains)) {
    addIssue(`Tool execution pipeline evidence ${evidence.file} is missing ${evidence.contains}.`);
  }
}

for (const tool of toolExecutionPipelineContracts.requiredPipelineTools) {
  const text = readText(tool.file);
  if (!hasPipelineToolRegistration(text) || !text.includes(tool.toolName)) {
    addIssue(`Tool execution pipeline migration ${tool.toolName} is missing from ${tool.file}.`);
  }
  const module = BUILTIN_TOOL_MODULES.find((candidate) => candidate.id === tool.moduleId);
  if (!module) {
    addIssue(`Tool execution pipeline module ${tool.moduleId} is missing from the built-in module catalog.`);
  } else if (!module.expectedTools?.includes(tool.toolName)) {
    addIssue(`Tool execution pipeline sentinel ${tool.toolName} is missing from module ${tool.moduleId}.`);
  }
}

if (pipelineToolFiles.length < toolExecutionPipelineContracts.minimumPipelineToolFiles) {
  addIssue(`Tool execution pipeline adoption has ${pipelineToolFiles.length} files, expected at least ${toolExecutionPipelineContracts.minimumPipelineToolFiles}.`);
}

if (pipelineToolRegistrationCount < toolExecutionPipelineContracts.minimumPipelineToolRegistrations) {
  addIssue(`Tool execution pipeline adoption has ${pipelineToolRegistrationCount} registrations, expected at least ${toolExecutionPipelineContracts.minimumPipelineToolRegistrations}.`);
}

if (legacyRegisterToolFiles.length > toolExecutionPipelineContracts.maximumLegacyRegisterToolFiles) {
  addIssue(`Tool execution pipeline legacy registerTool usage has ${legacyRegisterToolFiles.length} files, expected at most ${toolExecutionPipelineContracts.maximumLegacyRegisterToolFiles}: ${legacyRegisterToolFiles.join(', ')}.`);
}

if (disallowedDirectRegisterPipelineToolFiles.length > 0) {
  addIssue(`Tool execution pipeline direct registerPipelineTool usage is outside the allow-list: ${disallowedDirectRegisterPipelineToolFiles.join(', ')}.`);
}

for (const relativePath of missingLegacyRegisterToolAuditFiles) {
  addIssue(`Tool execution pipeline legacy registerTool audit file is missing: ${relativePath}.`);
}

for (const command of requiredWorkflowCommands) {
  if (!ciWorkflow.includes(command)) {
    addIssue(`CI workflow is missing ${command}.`);
  }
  if (!desktopWorkflow.includes(command)) {
    addIssue(`Desktop release workflow is missing ${command}.`);
  }
}

for (const command of skillWorkflowContracts.workflowCommands) {
  if (!ciWorkflow.includes(command)) {
    addIssue(`CI workflow is missing skill workflow command ${command}.`);
  }
  if (!desktopWorkflow.includes(command)) {
    addIssue(`Desktop release workflow is missing skill workflow command ${command}.`);
  }
}

if (skillWorkflowContracts.requiredSkills.length === 0) {
  addIssue('Skill workflow contracts do not declare any required skills.');
}

for (const command of companyReadinessContracts.requiredWorkflowCommands) {
  if (!ciWorkflow.includes(command)) {
    addIssue(`CI workflow is missing company readiness command ${command}.`);
  }
  if (!desktopWorkflow.includes(command)) {
    addIssue(`Desktop release workflow is missing company readiness command ${command}.`);
  }
}

if (companyReadinessContracts.requirements.length < companyReadinessContracts.minimumRequirementCount) {
  addIssue(`Company readiness contracts declare ${companyReadinessContracts.requirements.length} requirements, expected at least ${companyReadinessContracts.minimumRequirementCount}.`);
}

for (const branchPrefix of requiredBranchPrefixes) {
  if (!branchDoc.includes(branchPrefix) || !operatingModel.includes(branchPrefix)) {
    addIssue(`Branch prefix ${branchPrefix} is not documented in both branch and operating model docs.`);
  }
}

if (missingBranchReviewPrefixes.length > 0) {
  addIssue(`Branch review contract prefixes are missing from docs: ${missingBranchReviewPrefixes.join(', ')}.`);
}

if (missingPullRequestSections.length > 0) {
  addIssue(`Pull request template is missing required sections: ${missingPullRequestSections.join(', ')}.`);
}

if (missingPullRequestChecklistPhrases.length > 0) {
  addIssue(`Pull request template is missing required checklist phrases: ${missingPullRequestChecklistPhrases.join(', ')}.`);
}

for (const serviceContract of requiredServiceContracts) {
  if (!branchDoc.includes(serviceContract) && !operatingModel.includes(serviceContract)) {
    addIssue(`Service contract ${serviceContract} is not documented.`);
  }
}

for (const persona of requiredPersonas) {
  if (!operatingModel.includes(persona)) {
    addIssue(`Release persona ${persona} is not documented in the operating model.`);
  }
}

for (const [domain, allowedDomains] of Object.entries(architectureBoundaries.allowed)) {
  if (!(domain in architectureBoundaries.domains) && !architectureBoundaries.ignoreDomains.includes(domain)) {
    addIssue(`Architecture allowed policy references unknown domain ${domain}.`);
  }
  for (const allowedDomain of allowedDomains) {
    if (!(allowedDomain in architectureBoundaries.domains) && !architectureBoundaries.ignoreDomains.includes(allowedDomain)) {
      addIssue(`Architecture allowed policy for ${domain} references unknown target domain ${allowedDomain}.`);
    }
  }
}

for (const requiredDomain of ['core', 'adapters', 'ui-cards', 'tools', 'wizard', 'remote-server', 'local-bridge', 'transports', 'observability', 'types']) {
  if (!(requiredDomain in architectureBoundaries.domains)) {
    addIssue(`Architecture boundary domain ${requiredDomain} is missing.`);
  }
}

const report = {
  status: issues.length === 0 ? 'ok' : 'needs-attention',
  version: MCP_SERVER_VERSION,
  packageVersion: packageJson.version,
  generatedAt: new Date().toISOString(),
  moduleRegistry: {
    moduleCount: validationReport.moduleCount,
    policyEntries: policyCatalog.length,
    validationIssues: validationReport.issues,
  },
  runtimeProfiles: runtimeCatalogs.map((catalog) => {
    const cardCoverage = buildToolCardCoverageReport(catalog.tools.map((tool) => tool.toolName));
    return {
      id: catalog.profileId,
      runtimeMode: catalog.runtimeMode,
      paymentsBridgeOnly: catalog.paymentsBridgeOnly,
      modules: catalog.moduleCount,
      tools: catalog.toolCount,
      categories: catalog.categories,
      cardCoverage: {
        totalTools: cardCoverage.totalTools,
        specializedTools: cardCoverage.specializedTools,
        genericTools: cardCoverage.genericTools,
        byCoverage: cardCoverage.byCoverage,
      },
      policy: {
        paymentTiers: catalog.policy.paymentTiers,
        hostedAccountlessBlockedTools: catalog.policy.hostedAccountlessBlockedTools.length,
        localSignerTools: catalog.policy.localSignerTools.length,
      },
    };
  }),
  governance: {
    branchPrefixes: [...requiredBranchPrefixes],
    serviceContracts: [...requiredServiceContracts],
    releasePersonas: [...requiredPersonas],
    architecture: {
      root: architectureBoundaries.root,
      domainCount: Object.keys(architectureBoundaries.domains).length,
      ignoredDomains: [...architectureBoundaries.ignoreDomains],
    },
    packageExports: requiredPackageExports.map((specifier) => ({
      specifier,
      symbols: exportContracts[specifier]?.length ?? 0,
    })),
    workspacePackages: workspacePackageContracts.packages.map((contract) => ({
      id: contract.id,
      source: contract.source,
      additionalSources: contract.additionalSources ?? [],
      legacyCompatibilitySource: contract.legacyCompatibilitySource ?? null,
      physicalSource: contract.physicalSource ?? false,
      physicalSourceFiles: contract.physicalSource === true ? listSourceFiles(contract.source).length : 0,
      architectureDomain: contract.architectureDomain,
      rootExport: contract.rootExport,
      apiContract: contract.rootExport === null ? null : `config/package-export-contracts.json#${contract.rootExport}`,
      publicSymbols: contract.rootExport === null ? 0 : exportContracts[contract.rootExport]?.length ?? 0,
    })),
    skills: {
      contract: 'config/skill-workflow-contracts.json',
      requiredSkillCount: skillWorkflowContracts.requiredSkills.length,
      requiredSkills: skillWorkflowContracts.requiredSkills.map((skill) => skill.id),
    },
    branchReview: {
      contract: 'config/branch-review-contracts.json',
      pullRequestTemplate: '.github/pull_request_template.md',
      requiredBranchPrefixes: [...branchReviewContracts.requiredBranchPrefixes],
      requiredPullRequestSections: [...branchReviewContracts.requiredPullRequestSections],
      requiredPullRequestChecklistPhrases: [...branchReviewContracts.requiredPullRequestChecklistPhrases],
      missingBranchReviewPrefixes,
      missingPullRequestSections,
      missingPullRequestChecklistPhrases,
    },
    mcpAppsCards: {
      contract: 'config/mcp-apps-card-contracts.json',
      minimumSpecializedToolsAcrossRuntimeProfiles: mcpAppsCardContracts.minimumSpecializedToolsAcrossRuntimeProfiles,
      requiredSpecializedTools: [...mcpAppsCardContracts.requiredSpecializedTools],
      runtimeToolCount: runtimeCardCoverage.totalTools,
      specializedTools: runtimeCardCoverage.specializedTools,
      genericTools: runtimeCardCoverage.genericTools,
      byCoverage: runtimeCardCoverage.byCoverage,
      missingRequiredSpecializedCardTools,
      genericRequiredSpecializedCardTools,
    },
    wizardReadiness: {
      contract: 'config/wizard-readiness-contracts.json',
      requiredDefaultMode: wizardReadinessContracts.requiredDefaultMode,
      actualDefaultMode: desktopWizardDraft.mode,
      requiredDefaultRuntime: wizardReadinessContracts.requiredDefaultRuntime,
      actualDefaultRuntimes: [...desktopWizardDraft.configureRuntimes],
      requiredSetupModes: [...wizardReadinessContracts.requiredSetupModes],
      requiredReadinessStatuses: [...wizardReadinessContracts.requiredReadinessStatuses],
      requiredRuntimeActionStatuses: [...wizardReadinessContracts.requiredRuntimeActionStatuses],
      requiredSourceOfTruth: wizardReadinessContracts.requiredSourceOfTruth,
      actualSourceOfTruth: desktopHostedDiscovery.sourceOfTruth,
      requiredHostedDiscoveryUrls: [...wizardReadinessContracts.requiredHostedDiscoveryUrls],
      missingWizardDiscoveryUrls,
      minimumRequiredLocalBridgeTools: wizardReadinessContracts.minimumRequiredLocalBridgeTools,
      requiredLocalBridgeTools: [...wizardReadinessContracts.requiredLocalBridgeTools],
      actualLocalBridgeTools: [...desktopHostedDiscovery.requiredLocalBridgeTools],
      requiredHostedPrepaidTools: [...wizardReadinessContracts.requiredHostedPrepaidTools],
      actualHostedPrepaidTools: [...desktopHostedDiscovery.requiredHostedPrepaidTools],
      paymentsBridgeRuntimeToolCount: paymentsBridgeToolNameSet.size,
      missingWizardLocalBridgeTools,
      missingRuntimeLocalBridgeTools,
      missingWizardHostedPrepaidTools,
      missingRuntimeHostedPrepaidTools,
      missingWizardLocalBridgeToolsInUserDocs,
      missingWizardHostedPrepaidToolsInUserDocs,
      missingWizardSetupModeSourceEvidence,
      missingWizardReadinessStatusSourceEvidence,
      missingWizardRuntimeActionStatusSourceEvidence,
    },
    runtimeClientInjection: {
      contract: 'config/runtime-client-injection-contracts.json',
      hostedUrl: runtimeClientInjectionContracts.hostedUrl,
      hostedServerName: runtimeClientInjectionContracts.hostedServerName,
      paymentBridgeServerName: runtimeClientInjectionContracts.paymentBridgeServerName,
      requiredBridgeEnv: runtimeClientInjectionContracts.requiredBridgeEnv,
      forbiddenRuntimeConfigContent: [...runtimeClientInjectionContracts.forbiddenRuntimeConfigContent],
      requiredValidationFunctions: [...runtimeClientInjectionContracts.requiredValidationFunctions],
      missingRuntimeClientInjectionFunctions,
      profileCount: runtimeClientInjectionContracts.requiredRuntimeProfiles.length,
      profiles: runtimeClientInjectionProfileReports,
      profilesWithIssues: runtimeClientInjectionProfilesWithIssues.map((profile) => ({
        id: profile.id,
        label: profile.label,
        format: profile.format,
      })),
    },
    toolPluginTemplate: toolPluginTemplateContract ? {
      packageName: toolPluginTemplateContract.packageName,
      path: toolPluginTemplateContract.path,
      source: toolPluginTemplateContract.source,
      requiredScripts: toolPluginTemplateContract.requiredScripts ?? {},
      verifyCommand: 'pnpm run verify:tool-plugin-template',
      intakePolicy: requiredPluginModulePolicyEvidence.map((evidence) => ({
        id: evidence.id,
        file: evidence.file,
      })),
    } : null,
    toolExecutionPipeline: {
      contract: 'config/tool-execution-pipeline-contracts.json',
      requiredExportSymbols: [...toolExecutionPipelineContracts.requiredExportSymbols],
      requiredPipelineTools: toolExecutionPipelineContracts.requiredPipelineTools.map((tool) => ({
        toolName: tool.toolName,
        file: tool.file,
        moduleId: tool.moduleId,
      })),
      minimumPipelineToolFiles: toolExecutionPipelineContracts.minimumPipelineToolFiles,
      minimumPipelineToolRegistrations: toolExecutionPipelineContracts.minimumPipelineToolRegistrations,
      allowedDirectRegisterPipelineToolFiles: [...toolExecutionPipelineContracts.allowedDirectRegisterPipelineToolFiles],
      directRegisterPipelineToolFiles,
      directRegisterPipelineToolFileCount: directRegisterPipelineToolFiles.length,
      disallowedDirectRegisterPipelineToolFiles,
      maximumLegacyRegisterToolFiles: toolExecutionPipelineContracts.maximumLegacyRegisterToolFiles,
      additionalLegacyRegisterToolAuditFiles: [...toolExecutionPipelineContracts.additionalLegacyRegisterToolAuditFiles],
      sourceFiles: toolExecutionSourceFiles.length,
      pipelineToolFiles,
      legacyRegisterToolAuditFiles,
      legacyRegisterToolFiles,
      pipelineToolFileCount: pipelineToolFiles.length,
      pipelineToolRegistrationCount,
      legacyRegisterToolFileCount: legacyRegisterToolFiles.length,
      legacyRegisterToolAuditFileCount: legacyRegisterToolAuditFiles.length,
      verifyCommand: 'pnpm run verify:tool-execution-pipeline',
    },
    companyReadiness: {
      contract: 'config/company-readiness-contracts.json',
      requirementCount: companyReadinessContracts.requirements.length,
      requirements: companyReadinessContracts.requirements.map((requirement) => ({
        id: requirement.id,
        description: requirement.description,
      })),
    },
    workflows: {
      ci: '.github/workflows/ci.yml',
      desktopRelease: '.github/workflows/desktop-release.yml',
      requiredCommands: [...requiredWorkflowCommands],
    },
  },
  issues,
};

if (checkMode && issues.length > 0) {
  console.error('SAP MCP readiness report failed:');
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
