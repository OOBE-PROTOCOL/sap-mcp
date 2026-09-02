import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { MCP_SERVER_VERSION } from './core/constants.js';

const repoRoot = process.cwd();

function readText(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf-8');
}

describe('release readiness documentation and package surface', () => {
  it('ships the wizard, remote server, facilitator, docs, and PM2 example in the npm package surface', () => {
    const packageJson = JSON.parse(readText('package.json')) as {
      version: string;
      bin: Record<string, string>;
      files: string[];
      scripts: Record<string, string>;
      exports: Record<string, { types: string; import: string; require: string }>;
    };

    expect(MCP_SERVER_VERSION).toBe(packageJson.version);
    expect(packageJson.bin['sap-mcp-server']).toBe('dist/src/bin/sap-mcp-server.js');
    expect(packageJson.bin['sap-mcp-config']).toBe('dist/src/config-cli.js');
    expect(packageJson.bin['sap-mcp-wizard']).toBe('dist/tui/config-wizard.js');
    expect(packageJson.bin['sap-mcp-remote']).toBe('dist/src/bin/sap-mcp-remote.js');
    expect(packageJson.bin['sap-mcp-facilitator']).toBe('dist/src/payments/oobe-facilitator-server.js');
    expect(packageJson.bin['sap-mcp-pay-sh-spec']).toBe('dist/src/payments/pay-sh-spec.js');
    expect(packageJson.files).toEqual(expect.arrayContaining([
      'dist',
      'assets',
      'docs',
      'USER_DOCS',
      'config',
      'skills',
      'README.md',
      'CHANGELOG.md',
      'ecosystem.config.example.cjs',
    ]));
    expect(packageJson.scripts['verify:release']).toContain('verify:release:offline');
    expect(packageJson.scripts['verify:release:offline']).toContain('npm pack --dry-run');
    expect(packageJson.scripts['verify:release:offline']).toContain('verify:workspace-packages');
    expect(packageJson.scripts['verify:release:offline']).toContain('verify:readiness-report');
    expect(packageJson.scripts['verify:release:offline']).toContain('verify:tool-execution-pipeline');
    expect(packageJson.scripts['verify:release:offline']).toContain('verify:exports');
    expect(packageJson.scripts['verify:release:offline']).toContain('npm pack --dry-run');
    expect(packageJson.scripts['verify:release:offline']).toContain('verify:exports');
    expect(packageJson.exports['./core']).toEqual({
      types: './dist/packages/core/src/index.d.ts',
      import: './dist/packages/core/src/index.js',
      require: './dist/packages/core/src/index.js',
    });
    expect(packageJson.exports['./schemas']).toEqual({
      types: './dist/packages/schemas/src/index.d.ts',
      import: './dist/packages/schemas/src/index.js',
      require: './dist/packages/schemas/src/index.js',
    });
    expect(packageJson.exports['./mcp-adapter']).toEqual({
      types: './dist/packages/mcp-adapter/src/index.d.ts',
      import: './dist/packages/mcp-adapter/src/index.js',
      require: './dist/packages/mcp-adapter/src/index.js',
    });
    expect(packageJson.exports['./ui-cards']).toEqual({
      types: './dist/packages/ui-cards/src/index.d.ts',
      import: './dist/packages/ui-cards/src/index.js',
      require: './dist/packages/ui-cards/src/index.js',
    });
    expect(packageJson.exports['./tools']).toEqual({
      types: './dist/packages/tools/src/index.d.ts',
      import: './dist/packages/tools/src/index.js',
      require: './dist/packages/tools/src/index.js',
    });
  });

  it('does not depend on npm packages known to be unavailable from the public registry', () => {
    const packageJson = JSON.parse(readText('package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    const dependencyNames = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
      ...Object.keys(packageJson.optionalDependencies ?? {}),
    ];
    const unavailablePublicPackages = [
      '@bonfida/spl-name-service',
    ];

    for (const packageName of unavailablePublicPackages) {
      expect(dependencyNames).not.toContain(packageName);
    }
  });

  it('keeps the docs explicit about hosted users, agent owners, x402, and external signing', () => {
    const overview = readText('docs/01_PRODUCT_SCOPE_DEPLOYMENT_MODEL.md');
    const remote = readText('docs/05_HOSTED_STREAMABLE_HTTP_DEPLOYMENT.md');
    const payments = readText('docs/06_X402_PAYSH_MONETIZATION_SETTLEMENT.md');
    const security = readText('docs/08_SECURITY_POLICY_SIGNING_RUNBOOK.md');

    expect(overview).toContain('Hosted users who sign x402/pay.sh payments or tool transactions must run `sap-mcp-config wizard`');
    expect(overview).not.toContain('auth credential');
    expect(readText('README.md')).toContain('SAP_MCP_AUTH_TYPE=none');
    expect(readText('README.md')).toContain('npx sap-mcp-config doctor');
    expect(readText('README.md')).toContain('/.well-known/sap-mcp-wizard.json');
    expect(readText('README.md')).toContain('/.well-known/sap-mcp-tool-catalog.json');
    expect(readText('ecosystem.config.example.cjs')).toContain("SAP_MCP_AUTH_TYPE: 'none'");
    expect(overview).toContain('Agent owners need the wizard');
    expect(remote).toContain('Hosted user signing/payment onboarding');
    expect(remote).toContain('Paid x402/pay.sh flows and value-moving tools sign with the user-controlled signer');
    expect(remote).toContain('https://mcp.sap.oobeprotocol.ai/.well-known/sap-mcp-wizard.json');
    expect(remote).toContain('https://mcp.sap.oobeprotocol.ai/.well-known/sap-mcp-tool-catalog.json');
    expect(payments).toContain('Paid tool with valid payment');
    expect(payments).toContain('signed by the user\'s wizard-created SAP profile wallet or external signer');
    expect(security).toContain('GET /sign/<profile>');
    expect(security).toContain('POST /sign/<profile>');
  });

  it('documents company-grade branch boundaries, service contracts, and release personas', () => {
    const branchDoc = readText('docs/BRANCHING_CI_RELEASE_WORKFLOW.md');
    const operatingModel = readText('docs/20_ENGINEERING_OPERATING_MODEL_BOUNDARIES.md');
    const docsIndex = readText('docs/00_ENGINEERING_DOCUMENTATION_INDEX.md');
    const docsSidebar = readText('docs/_sidebar.md');
    const packageExportContracts = readText('config/package-export-contracts.json');
    const workspacePackageContracts = readText('config/workspace-package-contracts.json');
    const workspace = readText('pnpm-workspace.yaml');
    const architectureBoundaries = readText('config/architecture-boundaries.json');
    const packageJson = JSON.parse(readText('package.json')) as {
      scripts: Record<string, string>;
      exports: Record<string, unknown>;
      version: string;
    };

    const requiredBranchPrefixes = [
      'feature/hosted-mcp/',
      'feature/local-bridge/',
      'feature/wizard/',
      'feature/mcp-apps-ui/',
      'feature/payments-x402/',
      'feature/protocol-tools/',
      'feature/integrations/',
      'feature/release-ops/',
    ];

    for (const branchPrefix of requiredBranchPrefixes) {
      expect(branchDoc).toContain(branchPrefix);
      expect(operatingModel).toContain(branchPrefix);
    }

    for (const contractName of [
      'Hosted MCP gateway',
      'Local bridge',
      'Wizard',
      'MCP Apps UI',
      'Payments',
      'Protocol tools',
      'Release ops',
    ]) {
      expect(operatingModel).toContain(contractName);
    }

    expect(operatingModel).toContain('Non-technical user');
    expect(operatingModel).toContain('Developer');
    expect(operatingModel).toContain('Agent operator');
    expect(operatingModel).toContain('Hosted operator');
    expect(operatingModel).toContain('Integration maintainer');
    expect(operatingModel).toContain('hosted `sap`');
    expect(operatingModel).toContain('local `sap_payments`');
    expect(operatingModel).toContain('structuredContent');
    expect(operatingModel).toContain('ui://');
    expect(operatingModel).toContain('/.well-known/sap-mcp-tool-catalog.json');
    expect(operatingModel).toContain('pnpm run check:architecture');
    expect(workspace).toContain('packages/*');
    expect(workspace).toContain('apps/*');
    expect(architectureBoundaries).toContain('"core"');
    expect(architectureBoundaries).toContain('"ui-cards"');
    expect(packageExportContracts).toContain('"./core"');
    expect(packageExportContracts).toContain('"./schemas"');
    expect(packageExportContracts).toContain('"./mcp-adapter"');
    expect(packageExportContracts).toContain('"./ui-cards"');
    expect(packageExportContracts).toContain('"./tools"');
    expect(packageExportContracts).toContain('"./config-runtime"');
    expect(packageExportContracts).toContain('"./server-runtime"');
    expect(packageExportContracts).toContain('"./hosted-gateway"');
    expect(packageExportContracts).toContain('"./local-bridge"');
    expect(packageExportContracts).toContain('"./wizard-core"');
    expect(packageJson.exports).toHaveProperty('./config-runtime');
    expect(packageJson.exports).toHaveProperty('./server-runtime');
    expect(packageJson.exports).toHaveProperty('./hosted-gateway');
    expect(packageJson.exports).toHaveProperty('./local-bridge');
    expect(packageJson.exports).toHaveProperty('./wizard-core');
    expect(packageExportContracts).toContain('"createUiCardResponse"');
    expect(packageExportContracts).toContain('"buildToolCardCoverageReport"');
    expect(packageExportContracts).toContain('"classifyToolCardCoverage"');
    expect(packageExportContracts).toContain('"registerTool"');
    expect(packageExportContracts).toContain('"createToolModule"');
    expect(packageExportContracts).toContain('"createPluginToolModule"');
    expect(packageExportContracts).toContain('"createToolModuleRegistrationPlan"');
    expect(packageExportContracts).toContain('"registerPipelineTool"');
    expect(packageExportContracts).toContain('"createToolExecutionEnvelope"');
    expect(packageExportContracts).toContain('"createToolExecutionResult"');
    expect(packageExportContracts).toContain('"ToolFamilyPipelineResult"');
    expect(packageExportContracts).toContain('"registerToolFamilyPipelineTool"');
    expect(packageExportContracts).toContain('"createStringToolPipelineResult"');
    expect(packageExportContracts).toContain('"parseStringToolPayload"');
    expect(packageExportContracts).toContain('"resolveRequestedToolModuleMode"');
    expect(packageExportContracts).toContain('"ToolModuleManifestSchema"');
    expect(packageExportContracts).toContain('"assertToolModuleCatalogValid"');
    expect(packageExportContracts).toContain('"validateToolModuleCatalog"');
    expect(packageExportContracts).toContain('"buildToolCatalog"');
    expect(packageExportContracts).toContain('"buildToolCatalogForRuntimeProfiles"');
    expect(packageExportContracts).toContain('"summarizeToolCatalog"');
    expect(packageExportContracts).toContain('"buildToolModulePolicyCatalog"');
    expect(packageExportContracts).toContain('"getToolExecutionMetadata"');
    expect(packageExportContracts).toContain('"buildActiveDoctorReport"');
    expect(packageExportContracts).toContain('"planMcpClientInjection"');
    expect(packageExportContracts).toContain('"createSapMcpServer"');
    expect(packageExportContracts).toContain('"RemoteMCPServer"');
    expect(packageExportContracts).toContain('"buildPublicToolCatalogDocument"');
    expect(packageExportContracts).toContain('"startStdioTransport"');
    expect(packageExportContracts).toContain('"getPaymentBridgeProcessStatus"');
    expect(packageExportContracts).toContain('"getDesktopHostedDiscovery"');
    expect(packageExportContracts).toContain('"saveDesktopWizardDraft"');
    expect(packageExportContracts).toContain('"WalletSchema"');
    expect(workspacePackageContracts).toContain('"packageNamePrefix"');
    expect(workspacePackageContracts).toContain('"@oobe-protocol-labs/sap-mcp-core"');
    expect(workspacePackageContracts).toContain('"@oobe-protocol-labs/sap-mcp-schemas"');
    expect(workspacePackageContracts).toContain('"@oobe-protocol-labs/sap-mcp-mcp-adapter"');
    expect(workspacePackageContracts).toContain('"@oobe-protocol-labs/sap-mcp-ui-cards"');
    expect(workspacePackageContracts).toContain('"@oobe-protocol-labs/sap-mcp-tools"');
    expect(workspacePackageContracts).toContain('"@oobe-protocol-labs/sap-mcp-config-runtime"');
    expect(workspacePackageContracts).toContain('"@oobe-protocol-labs/sap-mcp-server-runtime"');
    expect(workspacePackageContracts).toContain('"@oobe-protocol-labs/sap-mcp-hosted-gateway"');
    expect(workspacePackageContracts).toContain('"@oobe-protocol-labs/sap-mcp-local-bridge"');
    expect(workspacePackageContracts).toContain('"@oobe-protocol-labs/sap-mcp-wizard-core"');
    expect(workspacePackageContracts).toContain('"@oobe-protocol-labs/sap-mcp-tool-plugin-template"');
    expect(workspacePackageContracts).toContain('"rootExport": "./tools"');
    expect(workspacePackageContracts).toContain('"rootExport": "./config-runtime"');
    expect(workspacePackageContracts).toContain('"rootExport": "./server-runtime"');
    expect(workspacePackageContracts).toContain('"rootExport": "./hosted-gateway"');
    expect(workspacePackageContracts).toContain('"rootExport": "./local-bridge"');
    expect(workspacePackageContracts).toContain('"rootExport": "./wizard-core"');
    expect(workspacePackageContracts).toContain('"architectureDomain": "tools"');
    expect(workspacePackageContracts).toContain('"architectureDomain": "config"');
    expect(workspacePackageContracts).toContain('"architectureDomain": "server"');
    expect(workspacePackageContracts).toContain('"architectureDomain": "remote-server"');
    expect(workspacePackageContracts).toContain('"architectureDomain": "local-bridge"');
    expect(workspacePackageContracts).toContain('"architectureDomain": "wizard"');
    expect(workspacePackageContracts).toContain('"additionalSources"');
    expect(readText('scripts/verify-workspace-packages.mjs')).toContain('architectureDomainCoversSource');
    expect(readText('scripts/verify-workspace-packages.mjs')).toContain('sapMcp.architectureDomain');
    expect(readText('scripts/verify-workspace-packages.mjs')).toContain('sapMcp.additionalSources');
    expect(readText('scripts/build-readiness-report.ts')).toContain('architectureDomain');
    expect(readText('scripts/build-readiness-report.ts')).toContain('additionalSources');
    expect(readText('scripts/build-readiness-report.ts')).toContain("'./config-runtime'");
    expect(readText('scripts/build-readiness-report.ts')).toContain("'./server-runtime'");
    expect(readText('scripts/build-readiness-report.ts')).toContain("'./hosted-gateway'");
    expect(readText('scripts/build-readiness-report.ts')).toContain("'./local-bridge'");
    expect(readText('scripts/build-readiness-report.ts')).toContain("'./wizard-core'");
    expect(readText('packages/core/src/types.ts')).toContain('toolCatalog?: SapMcpToolCatalogContext');
    expect(readText('packages/tools/src/register-tools.ts')).toContain('context.toolCatalog = summarizeToolCatalog');
    expect(readText('packages/tools/src/tool-execution-pipeline.ts')).toContain('registerPipelineTool');
    expect(readText('packages/tools/src/tool-family-pipeline.ts')).toContain('registerToolFamilyPipelineTool');
    expect(readText('packages/tools/src/tool-family-pipeline.ts')).toContain('ToolFamilyPipelineResult');
    expect(readText('packages/tools/src/tool-family-pipeline.ts')).toContain('parseStringToolPayload');
    expect(readText('packages/tools/src/sap-network-stats.tool.ts')).toContain('registerPipelineTool');
    expect(readText('packages/tools/src/agent-start-tool.ts')).toContain('toolCatalog: context.toolCatalog ?? null');
    expect(readText('packages/tools/src/quick-context-tool.ts')).toContain('toolCatalog: context.toolCatalog ?? null');
    expect(readText('packages/core/package.json')).toContain('@oobe-protocol-labs/sap-mcp-core');
    expect(readText('packages/core/package.json')).toContain('"boundaryId": "core"');
    expect(readText('packages/schemas/package.json')).toContain('@oobe-protocol-labs/sap-mcp-schemas');
    expect(readText('packages/schemas/package.json')).toContain('"boundaryId": "schemas"');
    expect(readText('packages/mcp-adapter/package.json')).toContain('@oobe-protocol-labs/sap-mcp-mcp-adapter');
    expect(readText('packages/mcp-adapter/package.json')).toContain('"boundaryId": "mcp-adapter"');
    expect(readText('packages/ui-cards/package.json')).toContain('@oobe-protocol-labs/sap-mcp-ui-cards');
    expect(readText('packages/ui-cards/package.json')).toContain('"boundaryId": "ui-cards"');
    expect(readText('packages/tools/package.json')).toContain('@oobe-protocol-labs/sap-mcp-tools');
    expect(readText('packages/tools/package.json')).toContain('"boundaryId": "tools"');
    expect(readText('packages/tools/package.json')).toContain('"architectureDomain": "tools"');
    expect(readText('packages/config-runtime/package.json')).toContain('@oobe-protocol-labs/sap-mcp-config-runtime');
    expect(readText('packages/config-runtime/package.json')).toContain('"boundaryId": "config-runtime"');
    expect(readText('packages/config-runtime/package.json')).toContain('"architectureDomain": "config"');
    expect(readText('packages/config-runtime/package.json')).toContain('"rootExport": "./config-runtime"');
    expect(readText('packages/server-runtime/package.json')).toContain('@oobe-protocol-labs/sap-mcp-server-runtime');
    expect(readText('packages/server-runtime/package.json')).toContain('"boundaryId": "server-runtime"');
    expect(readText('packages/server-runtime/package.json')).toContain('"architectureDomain": "server"');
    expect(readText('packages/server-runtime/package.json')).toContain('"rootExport": "./server-runtime"');
    expect(readText('packages/hosted-gateway/package.json')).toContain('@oobe-protocol-labs/sap-mcp-hosted-gateway');
    expect(readText('packages/hosted-gateway/package.json')).toContain('"boundaryId": "hosted-gateway"');
    expect(readText('packages/hosted-gateway/package.json')).toContain('"architectureDomain": "remote-server"');
    expect(readText('packages/hosted-gateway/package.json')).toContain('"rootExport": "./hosted-gateway"');
    expect(readText('packages/local-bridge/package.json')).toContain('@oobe-protocol-labs/sap-mcp-local-bridge');
    expect(readText('packages/local-bridge/package.json')).toContain('"boundaryId": "local-bridge"');
    expect(readText('packages/local-bridge/package.json')).toContain('"architectureDomain": "local-bridge"');
    expect(readText('packages/local-bridge/package.json')).toContain('"rootExport": "./local-bridge"');
    expect(readText('packages/local-bridge/package.json')).toContain('"additionalSources"');
    expect(readText('packages/hosted-gateway/src/index.ts')).toContain('RemoteMCPServer');
    expect(readText('packages/hosted-gateway/src/index.ts')).toContain('buildPublicToolCatalogDocument');
    expect(readText('packages/local-bridge/src/index.ts')).toContain('startStdioTransport');
    expect(readText('packages/local-bridge/src/index.ts')).toContain('getPaymentBridgeProcessStatus');
    expect(readText('packages/wizard-core/package.json')).toContain('@oobe-protocol-labs/sap-mcp-wizard-core');
    expect(readText('packages/wizard-core/package.json')).toContain('"boundaryId": "wizard-core"');
    expect(readText('packages/wizard-core/package.json')).toContain('"architectureDomain": "wizard"');
    expect(readText('packages/wizard-core/package.json')).toContain('"rootExport": "./wizard-core"');
    expect(readText('packages/tool-plugin-template/package.json')).toContain('@oobe-protocol-labs/sap-mcp-tool-plugin-template');
    expect(readText('packages/tool-plugin-template/package.json')).toContain('"boundaryId": "tool-plugin-template"');
    expect(readText('packages/tool-plugin-template/src/index.ts')).toContain('createPluginToolModule');
    expect(readText('packages/tool-plugin-template/src/index.ts')).toContain('registerToolFamilyPipelineTool');
    expect(readText('packages/tool-plugin-template/src/index.ts')).toContain('lifecycle');
    expect(readText('packages/tool-plugin-template/src/index.ts')).toContain('expectedTools');
    expect(readText('packages/tools/src/module-registry.ts')).toContain('must declare packageName provenance');
    expect(readText('packages/tools/src/module-registry.ts')).toContain('must declare version provenance');
    expect(readText('packages/tools/src/module-registry.ts')).toContain('must declare expectedTools sentinels');
    expect(readText('packages/tools/src/module-registry.ts')).toContain('must use namespace prefix');
    expect(readText('packages/tool-plugin-template/README.md')).toContain('createToolModuleRegistrationPlan');
    expect(readText('packages/tool-plugin-template/README.md')).toContain('Pass `packageName` and `version`');
    expect(readText('packages/tool-plugin-template/README.md')).toContain('using `registerToolFamilyPipelineTool` or a typed family adapter');
    expect(readText('packages/wizard-core/src/desktop-flow.ts')).toContain('getDesktopHostedDiscovery');
    expect(readText('src/wizard-core/desktop-flow.test.ts')).toContain('wizardReadinessContracts');
    expect(readText('src/config/mcp-client-injection.test.ts')).toContain('runtimeClientInjectionContracts');
    expect(readText('src/config-cli.ts')).toContain("case 'doctor'");
    expect(readText('src/config-cli.ts')).toContain("case 'readiness'");
    expect(readText('src/config-cli.ts')).toContain('buildActiveDoctorReport');
    expect(readText('packages/config-runtime/src/runtime-doctor.ts')).toContain('buildDoctorReport');
    expect(readText('packages/config-runtime/src/runtime-doctor.ts')).toContain('buildActiveDoctorReport');
    expect(readText('src/config/runtime-doctor.test.ts')).toContain('external-signer');
    expect(readText('packages/config-runtime/src/index.ts')).toContain("runtime-doctor.js");
    expect(readText('src/config-cli.ts')).toContain('Machine-readable readiness report');
    expect(readText('packages/wizard-core/src/desktop-flow.ts')).toContain('/.well-known/sap-mcp-tool-catalog.json');
    expect(readText('apps/desktop/main.mjs')).toContain('hostedDiscovery: core.getDesktopHostedDiscovery()');
    expect(readText('apps/desktop/main.mjs')).toContain('wizard:get-hosted-tool-catalog');
    expect(readText('apps/desktop/preload.cjs')).toContain('getHostedToolCatalog');
    expect(readText('apps/desktop/src/main.tsx')).toContain('hostedDiscovery.toolCatalogUrl');
    expect(readText('apps/desktop/src/main.tsx')).toContain('HostedToolCatalogPanel');
    expect(readText('apps/desktop/src/main.tsx')).toContain('catalog.policy.hostedAccountlessBlockedTools');
    expect(docsIndex).toContain('20_ENGINEERING_OPERATING_MODEL_BOUNDARIES.md');
    expect(docsSidebar).toContain('20_ENGINEERING_OPERATING_MODEL_BOUNDARIES.md');
    expect(packageJson.scripts['check:architecture']).toContain('check-architecture-boundaries.mjs');
    expect(readText('scripts/check-architecture-boundaries.mjs')).toContain('not assigned to any architecture domain');
    expect(readText('scripts/check-architecture-boundaries.mjs')).toContain('references unknown target domain');
    expect(readText('config/architecture-boundaries.json')).toContain('"transports"');
    expect(readText('config/architecture-boundaries.json')).toContain('"observability"');
    expect(readText('config/architecture-boundaries.json')).toContain('"types"');
    expect(packageJson.scripts['verify:release']).toContain('pnpm audit --audit-level moderate --prod');
    expect(packageJson.scripts['verify:release:offline']).toContain('npm pack --dry-run');
    expect(packageJson.scripts['verify:release:offline']).toContain('check:architecture');
    expect(packageJson.scripts['verify:release:offline']).toContain('verify:tool-modules');
    expect(packageJson.scripts['verify:release:offline']).toContain('verify:workspace-packages');
    expect(packageJson.scripts['verify:release:offline']).toContain('verify:package-boundaries');
    expect(packageJson.scripts['verify:release:offline']).toContain('verify:tool-plugin-template');
    expect(packageJson.scripts['verify:release:offline']).toContain('verify:tool-execution-pipeline');
    expect(packageJson.scripts['verify:release:offline']).toContain('verify:skill-workflows');
    expect(packageJson.scripts['verify:release:offline']).toContain('verify:company-readiness');
    expect(packageJson.scripts['verify:release:offline']).toContain('verify:readiness-report');
    expect(packageJson.scripts['verify:tool-modules']).toContain('verify-tool-modules.ts');
    expect(packageJson.scripts['verify:workspace-packages']).toContain('verify-workspace-packages.mjs');
    expect(packageJson.scripts['verify:package-boundaries']).toContain('verify-package-boundaries.mjs');
    expect(packageJson.scripts['verify:tool-plugin-template']).toContain('@oobe-protocol-labs/sap-mcp-tool-plugin-template');
    expect(packageJson.scripts['verify:tool-execution-pipeline']).toContain('verify-tool-execution-pipeline.mjs');
    expect(packageJson.scripts['verify:skill-workflows']).toContain('verify-skill-workflows.mjs');
    expect(packageJson.scripts['verify:company-readiness']).toContain('verify-company-readiness.mjs');
    expect(packageJson.scripts['verify:readiness-report']).toContain('build-readiness-report.ts --check');
    expect(readText('.github/workflows/ci.yml')).toContain('pnpm run verify:workspace-packages');
    expect(readText('.github/workflows/ci.yml')).toContain('pnpm run verify:package-boundaries');
    expect(readText('.github/workflows/ci.yml')).toContain('pnpm run verify:tool-plugin-template');
    expect(readText('.github/workflows/ci.yml')).toContain('pnpm run verify:tool-execution-pipeline');
    expect(readText('.github/workflows/ci.yml')).toContain('pnpm run verify:skill-workflows');
    expect(readText('.github/workflows/ci.yml')).toContain('pnpm run verify:company-readiness');
    expect(readText('.github/workflows/ci.yml')).toContain('pnpm run verify:readiness-report');
    expect(readText('.github/workflows/ci.yml')).toContain('pnpm run verify:exports');
    expect(readText('.github/workflows/ci.yml')).toContain('npm pack --dry-run');
    expect(readText('.github/pull_request_template.md')).toContain('Service Boundary');
    expect(readText('.github/pull_request_template.md')).toContain('Hosted sap');
    expect(readText('.github/pull_request_template.md')).toContain('local sap_payments');
    expect(readText('.github/pull_request_template.md')).toContain('No keypair bytes');
    expect(readText('.github/workflows/desktop-release.yml')).toContain('pnpm run verify:workspace-packages');
    expect(readText('.github/workflows/desktop-release.yml')).toContain('pnpm run verify:package-boundaries');
    expect(readText('.github/workflows/desktop-release.yml')).toContain('pnpm run verify:tool-plugin-template');
    expect(readText('.github/workflows/desktop-release.yml')).toContain('pnpm run verify:tool-execution-pipeline');
    expect(readText('.github/workflows/desktop-release.yml')).toContain('pnpm run verify:skill-workflows');
    expect(readText('.github/workflows/desktop-release.yml')).toContain('pnpm run verify:company-readiness');
    expect(readText('.github/workflows/desktop-release.yml')).toContain('pnpm run verify:readiness-report');
    expect(readText('.github/workflows/desktop-release.yml')).toContain('pnpm run verify:exports');
    expect(readText('.github/workflows/desktop-release.yml')).toContain('npm pack --dry-run');
    expect(readText('scripts/verify-workspace-packages.mjs')).toContain('workspace-package-contracts.json');
    expect(readText('scripts/verify-tool-execution-pipeline.mjs')).toContain('tool-execution-pipeline-contracts.json');
    expect(readText('scripts/verify-tool-execution-pipeline.mjs')).toContain('pipelineToolFiles');
    expect(readText('scripts/verify-tool-execution-pipeline.mjs')).toContain('builtinToolModulesText');
    expect(readText('scripts/verify-tool-execution-pipeline.mjs')).toContain("split(path.sep).join('/')");
    expect(readText('scripts/verify-tool-execution-pipeline.mjs')).toContain('registerPipelineTool(?:\\s*<[^(');
    expect(readText('scripts/verify-tool-execution-pipeline.mjs')).toContain('registerPipelineAdapterPattern');
    expect(readText('scripts/verify-tool-execution-pipeline.mjs')).toContain('[A-Za-z0-9]+PipelineTool');
    expect(readText('scripts/verify-tool-execution-pipeline.mjs')).toContain('PipelineTool(?:\\s*<');
    expect(readText('scripts/verify-tool-execution-pipeline.mjs')).toContain('typed pipeline adapter');
    expect(readText('scripts/verify-tool-execution-pipeline.mjs')).toContain('additionalLegacyRegisterToolAuditFiles');
    expect(readText('scripts/verify-tool-execution-pipeline.mjs')).toContain('allowedDirectRegisterPipelineToolFiles');
    expect(readText('scripts/verify-workspace-packages.mjs')).toContain('sapMcp.boundaryId');
    expect(readText('scripts/verify-package-boundaries.mjs')).toContain('Package boundaries OK');
    expect(readText('scripts/verify-package-boundaries.mjs')).toContain('legacyCompatibilitySource');
    expect(readText('scripts/verify-workspace-packages.mjs')).toContain('sapMcp.apiContract');
    expect(readText('scripts/verify-workspace-packages.mjs')).toContain('requiredScripts');
    expect(readText('scripts/build-readiness-report.ts')).toContain('buildToolCardCoverageReport');
    expect(readText('scripts/build-readiness-report.ts')).toContain('mcpAppsCardContracts');
    expect(readText('scripts/build-readiness-report.ts')).toContain('wizardReadinessContracts');
    expect(readText('scripts/build-readiness-report.ts')).toContain('wizardReadiness');
    expect(readText('scripts/build-readiness-report.ts')).toContain('runtimeClientInjectionContracts');
    expect(readText('scripts/build-readiness-report.ts')).toContain('runtimeClientInjection');
    expect(readText('scripts/build-readiness-report.ts')).toContain('classifyToolCardCoverage');
    expect(readText('scripts/build-readiness-report.ts')).toContain('ignoredDomains');
    expect(readText('scripts/build-readiness-report.ts')).toContain('domainCount');
    expect(readText('scripts/build-readiness-report.ts')).toContain('workspacePackageContracts');
    expect(readText('scripts/build-readiness-report.ts')).toContain('publicSymbols');
    expect(readText('scripts/build-readiness-report.ts')).toContain('toolPluginTemplateContract');
    expect(readText('scripts/build-readiness-report.ts')).toContain('toolExecutionPipelineContracts');
    expect(readText('scripts/build-readiness-report.ts')).toContain('toolExecutionPipeline');
    expect(readText('scripts/build-readiness-report.ts')).toContain('pipelineToolFileCount');
    expect(readText('scripts/build-readiness-report.ts')).toContain('pipelineToolRegistrationCount');
    expect(readText('scripts/build-readiness-report.ts')).toContain('registerPipelineAdapterPattern');
    expect(readText('scripts/build-readiness-report.ts')).toContain('[A-Za-z0-9]+PipelineTool');
    expect(readText('scripts/build-readiness-report.ts')).toContain('PipelineTool(?:\\s*<');
    expect(readText('scripts/build-readiness-report.ts')).toContain('hasPipelineToolRegistration(text)');
    expect(readText('scripts/build-readiness-report.ts')).toContain('maximumLegacyRegisterToolFiles');
    expect(readText('scripts/build-readiness-report.ts')).toContain('additionalLegacyRegisterToolAuditFiles');
    expect(readText('scripts/build-readiness-report.ts')).toContain('directRegisterPipelineToolFileCount');
    expect(readText('scripts/build-readiness-report.ts')).toContain('legacyRegisterToolAuditFileCount');
    expect(readText('scripts/build-readiness-report.ts')).toContain('legacyRegisterToolFileCount');
    expect(readText('scripts/build-readiness-report.ts')).toContain('Tool execution pipeline legacy registerTool usage');
    expect(readText('scripts/build-readiness-report.ts')).toContain('Tool execution pipeline adoption');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_quick_context"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_estimate_tool_cost"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_register_agent"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_sns_check_domain"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_sns_build_set_primary_domain_transaction"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sol_get_balance"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"magicblock_health"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_adrena_get_positions"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_adrena_get_markets"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_market_snapshot"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_adrena_build_add_liquidity"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_adrena_build_cancel_limit_order"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_adrena_build_open_commodity_long"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_adrena_build_claim_stakes"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_adrena_trade_intent"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_adrena_build_modify_position"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_preview_transaction"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_build_spl_transfer"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_chat_start_room"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_chat_seal_room"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_agent_start"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_prepare_mandate"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_profile_current"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_profile_switch"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_premium_plugin_catalog"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_premium_stream_poll"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_memory_record"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_trade_journal_query"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_skills_bundle"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_skills_self_update"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_payments_call_paid_tool"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_payments_finalize_transaction"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_payments_fund_prepaid"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_payments_prepare_challenge"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"minimumPipelineToolRegistrations"');
    expect(readText('packages/tools/src/quick-context-tool.ts')).toContain('registerToolFamilyPipelineTool');
    expect(readText('packages/tools/src/estimate-tool-cost.ts')).toContain('registerToolFamilyPipelineTool');
    expect(readText('packages/tools/src/sap-sdk-tools.ts')).toContain('registerSapPipelineTool');
    expect(readText('packages/tools/src/sap-sdk-tools.ts')).toContain('registerToolFamilyPipelineTool');
    expect(readText('packages/tools/src/sap-sns-tools.ts')).toContain('registerSnsPipelineTool');
    expect(readText('packages/tools/src/sap-sns-tools.ts')).toContain('registerToolFamilyPipelineTool');
    expect(readText('packages/tools/src/client-sdk-tools.ts')).toContain('registerClientSdkPipelineTool');
    expect(readText('packages/tools/src/client-sdk-tools.ts')).toContain('registerToolFamilyPipelineTool');
    expect(readText('packages/tools/src/magicblock-tools.ts')).toContain('magicBlockUiCardFromMetadata');
    expect(readText('packages/tools/src/magicblock-tools.ts')).toContain('registerToolFamilyPipelineTool');
    expect(readText('packages/tools/src/adrena/adrena-pipeline.ts')).toContain('registerAdrenaPipelineTool');
    expect(readText('packages/tools/src/adrena/adrena-pipeline.ts')).toContain('adrenaPipelineException');
    expect(readText('packages/tools/src/adrena/adrena-data-tools.ts')).toContain('registerAdrenaPipelineTool');
    expect(readText('packages/tools/src/adrena/adrena-snapshot-tools.ts')).toContain('registerAdrenaPipelineTool');
    expect(readText('packages/tools/src/adrena/adrena-liquidity-tools.ts')).toContain('registerAdrenaPipelineTool');
    expect(readText('packages/tools/src/adrena/adrena-limit-order-tools.ts')).toContain('registerAdrenaPipelineTool');
    expect(readText('packages/tools/src/adrena/adrena-commodity-tools.ts')).toContain('registerAdrenaPipelineTool');
    expect(readText('packages/tools/src/adrena/adrena-staking-tools.ts')).toContain('registerAdrenaPipelineTool');
    expect(readText('packages/tools/src/adrena/adrena-trading-tools.ts')).toContain('registerAdrenaPipelineTool');
    expect(readText('packages/tools/src/transaction-tools.ts')).toContain('registerTransactionPipelineTool');
    expect(readText('packages/tools/src/transaction-tools.ts')).toContain('registerToolFamilyPipelineTool');
    expect(readText('packages/tools/src/chat-tools.ts')).toContain('registerChatPipelineTool');
    expect(readText('packages/tools/src/chat-tools.ts')).toContain('registerToolFamilyPipelineTool');
    expect(readText('packages/tools/src/agent-start-tool.ts')).toContain('registerAgentStartPipelineTool');
    expect(readText('packages/tools/src/agent-start-tool.ts')).toContain('registerToolFamilyPipelineTool');
    expect(readText('packages/tools/src/profile-tools.ts')).toContain('registerProfilePipelineTool');
    expect(readText('packages/tools/src/profile-tools.ts')).toContain('registerToolFamilyPipelineTool');
    expect(readText('packages/tools/src/premium-tools.ts')).toContain('registerPremiumPipelineTool');
    expect(readText('packages/tools/src/premium-tools.ts')).toContain('registerToolFamilyPipelineTool');
    expect(readText('packages/tools/src/memory-tools.ts')).toContain('registerMemoryPipelineTool');
    expect(readText('packages/tools/src/memory-tools.ts')).toContain('createStringToolPipelineResult');
    expect(readText('packages/tools/src/skills-tools.ts')).toContain('registerSkillsPipelineTool');
    expect(readText('packages/tools/src/skills-tools.ts')).toContain('registerToolFamilyPipelineTool');
    expect(readText('packages/tools/src/x402-paid-call-tool.ts')).toContain('registerX402PipelineTool');
    expect(readText('packages/tools/src/x402-paid-call-tool.ts')).toContain('createStringToolPipelineResult');
    expect(readText('packages/tools/src/builtin-tool-modules.ts')).toContain("'sap_payments_fund_prepaid'");
    expect(readText('packages/tools/src/builtin-tool-modules.ts')).toContain("'sap_update_agent'");
    expect(readText('packages/tools/src/builtin-tool-modules.ts')).toContain("'magicblock_swap_quote'");
    expect(readText('packages/tools/src/skills-tools.ts')).toContain("writeFileSync(destination, file.content");
    expect(readText('packages/tools/src/skills-tools.ts')).toContain('Refusing to install skill file outside targetDir');
    expect(readText('packages/tools/src/tool-execution-pipeline.ts')).toContain('createUiCardResponse');
    expect(readText('packages/tools/src/tool-execution-pipeline.ts')).toContain('createToolExecutionResult');
    expect(readText('packages/tools/src/sap-network-stats.tool.ts')).toContain('createToolExecutionResult');
    expect(readText('docs/09_TOOL_SKILL_ROUTING_AGENT_OPERATIONS.md')).toContain("responseMode: 'data'");
    expect(readText('scripts/build-readiness-report.ts')).toContain('requiredPluginModulePolicyEvidence');
    expect(readText('scripts/build-readiness-report.ts')).toContain('intakePolicy');
    expect(readText('scripts/build-readiness-report.ts')).toContain('skillWorkflowContracts');
    expect(readText('scripts/build-readiness-report.ts')).toContain('companyReadinessContracts');
    expect(readText('scripts/build-readiness-report.ts')).toContain('requiredBranchPrefixes');
    expect(readText('scripts/verify-company-readiness.mjs')).toContain('company-readiness-contracts.json');
    expect(readText('config/company-readiness-contracts.json')).toContain('"modular-monorepo-boundaries"');
    expect(readText('config/company-readiness-contracts.json')).toContain('"hosted-local-bridge-trust-boundary"');
    expect(readText('config/company-readiness-contracts.json')).toContain('"mcp-apps-card-coverage"');
    expect(readText('config/mcp-apps-card-contracts.json')).toContain('"requiredSpecializedTools"');
    expect(readText('config/mcp-apps-card-contracts.json')).toContain('"minimumSpecializedToolsAcrossRuntimeProfiles"');
    expect(readText('config/mcp-apps-card-contracts.json')).toContain('"sap_adrena_build_swap"');
    expect(readText('config/wizard-readiness-contracts.json')).toContain('"requiredHostedDiscoveryUrls"');
    expect(readText('config/wizard-readiness-contracts.json')).toContain('"sap_payments_process_status"');
    expect(readText('config/wizard-readiness-contracts.json')).toContain('"sap_payments_update_agent"');
    expect(readText('config/wizard-readiness-contracts.json')).toContain('"sap_payments_fund_prepaid"');
    expect(readText('config/runtime-client-injection-contracts.json')).toContain('"requiredRuntimeProfiles"');
    expect(readText('config/runtime-client-injection-contracts.json')).toContain('"openclaw"');
    expect(readText('config/runtime-client-injection-contracts.json')).toContain('"clawpump"');
    expect(readText('config/runtime-client-injection-contracts.json')).toContain('"mcp-remote"');
    expect(readText('USER_DOCS/04_MCP_CLIENT_CONFIGURATION_MATRIX.md')).toContain('sap_payments_profile_current');
    expect(readText('USER_DOCS/04_MCP_CLIENT_CONFIGURATION_MATRIX.md')).toContain('sap_payments_process_status');
    expect(readText('USER_DOCS/04_MCP_CLIENT_CONFIGURATION_MATRIX.md')).toContain('sap_payments_fund_prepaid');
    expect(readText('USER_DOCS/03_X402_PAYSH_PAID_TOOL_RUNBOOK.md')).toContain('sap_payments_prepaid_balance');
    expect(readText('src/ui/tool-card-registry.test.ts')).toContain('config/mcp-apps-card-contracts.json');
    expect(readText('config/company-readiness-contracts.json')).toContain('"registerToolFamilyPipelineTool"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"sap_network_stats"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"registerPipelineTool"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"registerToolFamilyPipelineTool"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"allowedDirectRegisterPipelineToolFiles"');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"minimumPipelineToolRegistrations": 190');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"maximumLegacyRegisterToolFiles": 0');
    expect(readText('config/tool-execution-pipeline-contracts.json')).toContain('"packages/tool-plugin-template/src/index.ts"');
    expect(readText('scripts/verify-tool-execution-pipeline.mjs')).toContain('maximumLegacyRegisterToolFiles');
    expect(readText('scripts/verify-tool-execution-pipeline.mjs')).toContain('legacy registerTool source files');
    expect(readText('scripts/verify-skill-workflows.mjs')).toContain('skill-workflow-contracts.json');
    expect(readText('config/skill-workflow-contracts.json')).toContain('"sap-mcp"');
    expect(readText('config/skill-workflow-contracts.json')).toContain('"sap-clawpump-bridge"');
    expect(readText('config/branch-review-contracts.json')).toContain('"requiredPullRequestSections"');
    expect(readText('config/branch-review-contracts.json')).toContain('"runtime-client-injection-contracts.json"');
    expect(readText('skills/README.md')).toContain('`sap-clawpump-bridge`');
    expect(readText('docs/10_RELEASE_OPERATIONS_PM2_RUNBOOK.md')).toContain(`Version \`${packageJson.version}\` includes`);
    expect(readText('docs/10_RELEASE_OPERATIONS_PM2_RUNBOOK.md')).toContain('pnpm run verify:readiness-report');
    expect(readText('docs/10_RELEASE_OPERATIONS_PM2_RUNBOOK.md')).toContain('pnpm run verify:workspace-packages');
    expect(readText('docs/10_RELEASE_OPERATIONS_PM2_RUNBOOK.md')).toContain('pnpm run verify:package-boundaries');
    expect(readText('docs/10_RELEASE_OPERATIONS_PM2_RUNBOOK.md')).toContain('pnpm run verify:tool-plugin-template');
    expect(readText('docs/10_RELEASE_OPERATIONS_PM2_RUNBOOK.md')).toContain('pnpm run verify:tool-execution-pipeline');
    expect(readText('docs/10_RELEASE_OPERATIONS_PM2_RUNBOOK.md')).toContain('pnpm run verify:skill-workflows');
    expect(readText('docs/10_RELEASE_OPERATIONS_PM2_RUNBOOK.md')).toContain('pnpm run verify:company-readiness');
    expect(readText('docs/BRANCHING_CI_RELEASE_WORKFLOW.md')).toContain('pnpm run verify:skill-workflows');
    expect(readText('docs/BRANCHING_CI_RELEASE_WORKFLOW.md')).toContain('pnpm run verify:tool-plugin-template');
    expect(readText('docs/BRANCHING_CI_RELEASE_WORKFLOW.md')).toContain('pnpm run verify:package-boundaries');
    expect(readText('docs/BRANCHING_CI_RELEASE_WORKFLOW.md')).toContain('pnpm run verify:tool-execution-pipeline');
    expect(readText('docs/BRANCHING_CI_RELEASE_WORKFLOW.md')).toContain('pnpm run verify:company-readiness');
    expect(readText('docs/BRANCHING_CI_RELEASE_WORKFLOW.md')).toContain('readiness report');
    expect(readText('docs/BRANCHING_CI_RELEASE_WORKFLOW.md')).toContain('workspace package contracts');
    expect(readText('docs/20_ENGINEERING_OPERATING_MODEL_BOUNDARIES.md')).toContain('pnpm run verify:skill-workflows');
    expect(readText('docs/20_ENGINEERING_OPERATING_MODEL_BOUNDARIES.md')).toContain('pnpm run verify:tool-plugin-template');
    expect(readText('docs/20_ENGINEERING_OPERATING_MODEL_BOUNDARIES.md')).toContain('pnpm run verify:package-boundaries');
    expect(readText('docs/20_ENGINEERING_OPERATING_MODEL_BOUNDARIES.md')).toContain('pnpm run verify:tool-execution-pipeline');
    expect(readText('docs/20_ENGINEERING_OPERATING_MODEL_BOUNDARIES.md')).toContain('pnpm run verify:company-readiness');
    expect(readText('docs/20_ENGINEERING_OPERATING_MODEL_BOUNDARIES.md')).toContain('Unified release readiness');
    expect(readText('docs/20_ENGINEERING_OPERATING_MODEL_BOUNDARIES.md')).toContain('Workspace package contracts');
    expect(readText('docs/20_ENGINEERING_OPERATING_MODEL_BOUNDARIES.md')).toContain('Wizard readiness contracts');
    expect(readText('docs/20_ENGINEERING_OPERATING_MODEL_BOUNDARIES.md')).toContain('runtime client injection contracts');
    expect(readText('docs/20_ENGINEERING_OPERATING_MODEL_BOUNDARIES.md')).toContain('skill workflow contracts');
    expect(readText('docs/09_TOOL_SKILL_ROUTING_AGENT_OPERATIONS.md')).toContain('ToolModuleManifestSchema');
    expect(readText('docs/09_TOOL_SKILL_ROUTING_AGENT_OPERATIONS.md')).toContain('createPluginToolModule');
    expect(readText('docs/09_TOOL_SKILL_ROUTING_AGENT_OPERATIONS.md')).toContain('registerPipelineTool');
    expect(readText('docs/09_TOOL_SKILL_ROUTING_AGENT_OPERATIONS.md')).toContain('registerToolFamilyPipelineTool');
    expect(readText('docs/03_PROFILE_CONFIG_WIZARD_INJECTION.md')).toContain('npx sap-mcp-config doctor --json');
    expect(readText('USER_DOCS/00_USER_ONBOARDING_INDEX.md')).toContain('sap-mcp-config doctor');
    expect(readText('skills/sap-mcp/SKILL.md')).toContain('npx sap-mcp-config doctor --json');
    expect(readText('packages/README.md')).toContain('registerToolsWithSummary(server, context, { additionalModules })');
    expect(readText('packages/README.md')).toContain('verify:workspace-packages');
    expect(readText('packages/README.md')).toContain('verify:package-boundaries');
    expect(readText('packages/README.md')).toContain('verify:tool-plugin-template');
    expect(readText('packages/README.md')).toContain('verify:tool-execution-pipeline');
    expect(readText('packages/README.md')).toContain('verify:readiness-report');
    expect(readText('packages/README.md')).toContain('buildToolCardCoverageReport');
    expect(readText('packages/README.md')).toContain('registerPipelineTool');
    expect(readText('packages/README.md')).toContain('registerToolFamilyPipelineTool');
  });

  it('uses technical documentation names for fast incident resolution', () => {
    const professionalDocs = [
      'docs/00_ENGINEERING_DOCUMENTATION_INDEX.md',
      'docs/01_PRODUCT_SCOPE_DEPLOYMENT_MODEL.md',
      'docs/02_RUNTIME_ARCHITECTURE_TRUST_BOUNDARIES.md',
      'docs/03_PROFILE_CONFIG_WIZARD_INJECTION.md',
      'docs/04_LOCAL_STDIO_MCP_RUNBOOK.md',
      'docs/05_HOSTED_STREAMABLE_HTTP_DEPLOYMENT.md',
      'docs/06_X402_PAYSH_MONETIZATION_SETTLEMENT.md',
      'docs/07_HTTP_ENDPOINTS_MCP_CLIENTS_SMOKE_TESTS.md',
      'docs/08_SECURITY_POLICY_SIGNING_RUNBOOK.md',
      'docs/09_TOOL_SKILL_ROUTING_AGENT_OPERATIONS.md',
      'docs/10_RELEASE_OPERATIONS_PM2_RUNBOOK.md',
      'docs/11_ENGINEERING_QUALITY_AUDIT_REPORT.md',
      'docs/12_SIGNED_AGENT_CHAT_PROTOCOL.md',
      'docs/13_BOUNTY_PROGRAM_TECHNICAL_SPEC.md',
      'docs/14_DESKTOP_WIZARD_RELEASE_ARTIFACTS.md',
      'docs/15_DEMO_DASHBOARD_SCREENSHARE_RUNBOOK.md',
      'docs/16_AGENT_IDENTITY_REGISTRY_PIPELINE.md',
      'docs/18_PREMIUM_PLUGIN_RUNTIME_CONTRACTS.md',
      'docs/19_AGENTIC_STANDARDS_INTEROPERABILITY.md',
      'docs/20_ENGINEERING_OPERATING_MODEL_BOUNDARIES.md',
      'docs/BRANCHING_CI_RELEASE_WORKFLOW.md',
      'docs/MAGICBLOCK_TOOLING_REFERENCE.md',
      'docs/X402_PAYSH_PROTOCOL_SPECIFICATION.md',
      'USER_DOCS/00_USER_ONBOARDING_INDEX.md',
      'USER_DOCS/01_HOSTED_MCP_LOCAL_BRIDGE_SETUP.md',
      'USER_DOCS/02_LOCAL_STDIO_PROFILE_SIGNER_SETUP.md',
      'USER_DOCS/03_X402_PAYSH_PAID_TOOL_RUNBOOK.md',
      'USER_DOCS/04_MCP_CLIENT_CONFIGURATION_MATRIX.md',
      'USER_DOCS/05_AGENT_SKILLS_TOOL_ROUTING.md',
      'USER_DOCS/06_DESKTOP_WIZARD_INSTALL_RUNBOOK.md',
      'USER_DOCS/07_SMITHERY_MARKETPLACE_INTEGRATION.md',
    ];

    const legacyRenamedDocs = [
      'docs/00_README.md',
      'docs/01_PRODUCT_OVERVIEW.md',
      'docs/02_ARCHITECTURE_AND_REQUEST_FLOW.md',
      'docs/03_CONFIGURATION_AND_WIZARD.md',
      'docs/04_LOCAL_STDIO_USAGE.md',
      'docs/05_REMOTE_VPS_DEPLOYMENT.md',
      'docs/06_PAYMENTS_X402_AND_PAYSH.md',
      'docs/07_ENDPOINTS_AND_CLIENTS.md',
      'docs/08_SECURITY_POLICY_AND_SIGNING.md',
      'docs/09_TOOLS_SKILLS_AND_AGENT_GUIDE.md',
      'docs/10_OPERATIONS_RELEASE_AND_PM2.md',
      'docs/11_CODE_QUALITY_AUDIT.md',
      'docs/12_ONCHAIN_AGENT_CHAT.md',
      'docs/13_BOUNTY_PROGRAM_PROPOSAL.md',
      'docs/14_DESKTOP_WIZARD_RELEASE.md',
      'docs/15_DASHBOARD_SCREENSHARE_SCRIPT.md',
      'docs/16_SAP_AGENT_IDENTITY_PIPELINE.md',
      'docs/18_PREMIUM_PLUGIN_RUNTIME.md',
      'docs/19_AGENTIC_STANDARDS_ALIGNMENT.md',
      'docs/20_COMPANY_ENGINEERING_OPERATING_MODEL.md',
      'docs/BRANCH_AND_CI.md',
      'docs/magicblock-tools.md',
      'docs/x402-protocol-spec.md',
      'USER_DOCS/00_START_HERE.md',
      'USER_DOCS/01_HOSTED_REMOTE_MCP.md',
      'USER_DOCS/02_LOCAL_STDIO_MCP.md',
      'USER_DOCS/03_PAYMENTS_X402_PAYSH.md',
      'USER_DOCS/04_CLIENT_CONFIGS.md',
      'USER_DOCS/05_SKILLS_AND_TOOLS.md',
      'USER_DOCS/06_DESKTOP_GUI_WIZARD.md',
      'USER_DOCS/07_SMITHERY_AND_MARKETPLACES.md',
    ];

    for (const docPath of professionalDocs) {
      expect(existsSync(join(repoRoot, docPath)), docPath).toBe(true);
    }

    for (const docPath of legacyRenamedDocs) {
      expect(existsSync(join(repoRoot, docPath)), docPath).toBe(false);
    }

    const docsIndex = readText('docs/00_ENGINEERING_DOCUMENTATION_INDEX.md');
    expect(docsIndex).toContain('NN_DOMAIN_PURPOSE_ARTIFACT.md');
    expect(docsIndex).toContain('RUNBOOK');
    expect(docsIndex).toContain('CONTRACTS');
  });

  it('does not leave links to deleted legacy docs in README or numbered docs', () => {
    const oldDocNames = [
      'LOCAL_MCP_SERVER.md',
      'REMOTE_MCP_SERVER.md',
      'MONETIZATION.md',
      'CONFIGURATION_PIPELINE.md',
      'CONFIGURATION_WIZARD.md',
      'SECURE_CONFIG.md',
      'COMPLETE_TOOLS_REFERENCE.md',
      'SAP_MCP_MAP.md',
      'SAP_SDK_SKILLS.md',
    ];

    const docs = readdirSync(join(repoRoot, 'docs'))
      .filter(file => file.endsWith('.md'))
      .map(file => readText(join('docs', file)))
      .join('\n');
    const text = `${readText('README.md')}\n${docs}`;

    for (const oldDocName of oldDocNames) {
      expect(text).not.toContain(oldDocName);
    }
  });

  it('keeps legacy root-level docs out of the public repository surface', () => {
    const legacyRootDocs = [
      'AGENT-CONTEXT.md',
      'BENTO_INTEGRATION.md',
      'CONFIGURATION_GUIDE.md',
      'HERMES-SAP-INTEGRATION.md',
      'MULTI-AGENT-PROFILES.md',
    ];

    for (const legacyRootDoc of legacyRootDocs) {
      expect(existsSync(join(repoRoot, legacyRootDoc))).toBe(false);
    }
  });

  it('builds the desktop renderer with relative assets for packaged Electron apps', () => {
    const viteConfig = readText('apps/desktop/vite.config.ts');

    expect(viteConfig).toContain("base: './'");
  });

  it('keeps active SAP skills aligned with SDK 1.0.x Escrow V2 and hosted x402 flows', () => {
    const activeSkillText = [
      readText('skills/README.md'),
      readText('skills/sap-escrow-settlement/SKILL.md'),
      readText('skills/sap-mcp/TOOL_REFERENCE.md'),
      readText('skills/sap-mcp/SKILL.md'),
      readText('skills/sap-operations/SKILL.md'),
      readText('skills/sap-payments-x402/SKILL.md'),
      readText('USER_DOCS/00_USER_ONBOARDING_INDEX.md'),
      readText('docs/06_X402_PAYSH_MONETIZATION_SETTLEMENT.md'),
      readText('src/prompts/context/sap-agent-start.prompt.ts'),
      readText('src/prompts/context/sap-agent-intent-router.prompt.ts'),
      readText('src/prompts/payments/explain-x402-settlement.prompt.ts'),
    ].join('\n');

    const removedV1WriteTools = [
      'sap_create_escrow',
      'sap_deposit_escrow',
      'sap_settle_escrow',
      'sap_settle_escrow_batch',
      'sap_withdraw_escrow',
      'sap_close_escrow',
    ];

    for (const removedTool of removedV1WriteTools) {
      expect(activeSkillText).not.toContain(`- \`${removedTool}\``);
      expect(activeSkillText).not.toContain(`\`${removedTool}\`,`);
    }

    expect(activeSkillText).toContain('sap_create_escrow_v2');
    expect(activeSkillText).toContain('settlementSecurity');
    expect(activeSkillText).toContain('DisputeWindow');
    expect(activeSkillText).toContain('micro-USDC');
    expect(activeSkillText).toContain('sap_payments_call_paid_tool');
    expect(activeSkillText).toContain('sap_agent_runtime_status');
    expect(activeSkillText).toContain('sap_pricing_catalog');
    expect(activeSkillText).toContain('/pricing.json');
    expect(activeSkillText).toContain('sap_payments_finalize_transaction');
    expect(activeSkillText).toContain('sap_payments_register_agent');
    expect(activeSkillText).toContain('sap_payments_update_agent');
    expect(activeSkillText).toContain('sap_payments_call_external_x402');
    expect(activeSkillText).toContain('sap-agent-intent-router');
    expect(activeSkillText).toContain('402 challenge');
    expect(activeSkillText).toContain('retry');
    expect(activeSkillText).toContain('do not create');
    expect(activeSkillText).toContain('temporary');
    expect(activeSkillText).not.toContain('v0.21.0');
    expect(activeSkillText).not.toContain('SDK v0.20');
    expect(activeSkillText).not.toContain('248 tools');
    expect(activeSkillText).not.toContain('280 tools');
    expect(activeSkillText).not.toContain('createEscrow(');
    expect(activeSkillText).not.toContain('settleEscrow(');
  });

  it('keeps the disabled perps protocol out of public docs and skills', () => {
    const disabledProtocolNeedle = ['dri', 'ft'].join('');
    const publicSurface = [
      readText('README.md'),
      readText('skills/README.md'),
      readText('skills/sap-defi/SKILL.md'),
      readText('skills/sap-agentkit/SKILL.md'),
      readText('skills/sap-mcp/TOOL_REFERENCE.md'),
      readText('docs/README.md'),
      readText('docs/13_BOUNTY_PROGRAM_TECHNICAL_SPEC.md'),
      readText('docs/15_DEMO_DASHBOARD_SCREENSHARE_RUNBOOK.md'),
      readText('packages/hosted-gateway/src/public-home/sections.ts'),
    ].join('\n').toLowerCase();

    expect(publicSurface).not.toContain(disabledProtocolNeedle);
  });
});
