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
    };

    expect(MCP_SERVER_VERSION).toBe(packageJson.version);
    expect(packageJson.bin['sap-mcp-server']).toBe('dist/bin/sap-mcp-server.js');
    expect(packageJson.bin['sap-mcp-config']).toBe('dist/config-cli.js');
    expect(packageJson.bin['sap-mcp-wizard']).toBe('dist/tui/config-wizard.js');
    expect(packageJson.bin['sap-mcp-remote']).toBe('dist/bin/sap-mcp-remote.js');
    expect(packageJson.bin['sap-mcp-facilitator']).toBe('dist/payments/oobe-facilitator-server.js');
    expect(packageJson.bin['sap-mcp-pay-sh-spec']).toBe('dist/payments/pay-sh-spec.js');
    expect(packageJson.files).toEqual(expect.arrayContaining([
      'dist',
      'assets',
      'docs',
      'skills',
      'README.md',
      'CHANGELOG.md',
      'ecosystem.config.example.cjs',
    ]));
    expect(packageJson.scripts['verify:release']).toContain('npm pack --dry-run');
  });

  it('keeps the docs explicit about hosted users, agent owners, x402, and external signing', () => {
    const overview = readText('docs/01_PRODUCT_OVERVIEW.md');
    const remote = readText('docs/05_REMOTE_VPS_DEPLOYMENT.md');
    const payments = readText('docs/06_PAYMENTS_X402_AND_PAYSH.md');
    const security = readText('docs/08_SECURITY_POLICY_AND_SIGNING.md');

    expect(overview).toContain('Hosted users who sign x402/pay.sh payments or tool transactions must run `sap-mcp-config wizard`');
    expect(overview).not.toContain('auth credential');
    expect(readText('README.md')).toContain('SAP_MCP_AUTH_TYPE=none');
    expect(readText('README.md')).toContain('/.well-known/sap-mcp-wizard.json');
    expect(readText('ecosystem.config.example.cjs')).toContain("SAP_MCP_AUTH_TYPE: 'none'");
    expect(overview).toContain('Agent owners need the wizard');
    expect(remote).toContain('Hosted user signing/payment onboarding');
    expect(remote).toContain('Paid x402/pay.sh flows and value-moving tools sign with the user-controlled signer');
    expect(remote).toContain('https://mcp.sap.oobeprotocol.ai/.well-known/sap-mcp-wizard.json');
    expect(payments).toContain('Paid tool with valid payment');
    expect(payments).toContain('signed by the user\'s wizard-created SAP profile wallet or external signer');
    expect(security).toContain('GET /sign/<profile>');
    expect(security).toContain('POST /sign/<profile>');
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
      readText('USER_DOCS/00_START_HERE.md'),
      readText('docs/06_PAYMENTS_X402_AND_PAYSH.md'),
      readText('src/prompts/context/sap-agent-start.prompt.ts'),
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
});
