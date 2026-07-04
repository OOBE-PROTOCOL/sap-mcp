import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyMcpClientInjection,
  buildCodexHostedPaymentBridgeContent,
  createManualMcpJsonSnippets,
  createNpxCodexServerConfig,
  createX402PaidCallAddonSnippets,
  discoverMcpClientTargets,
  installCodexHostedPaymentBridgeConfig,
  installX402PaidCallAddon,
  planMcpClientInjection,
  type McpServerInjectionConfig,
  type McpClientTarget,
} from './mcp-client-injection.js';

let tempDirs: string[] = [];

function makeTempDir(): string {
  const tempDir = mkdtempSync(join(tmpdir(), 'sap-mcp-inject-'));
  tempDirs.push(tempDir);
  return tempDir;
}

function target(path: string, format: McpClientTarget['format']): McpClientTarget {
  return {
    id: format === 'toml' ? 'codex' : 'hermes',
    label: 'Test Client',
    path,
    format,
    exists: true,
  };
}

function canonicalConfig(): McpServerInjectionConfig {
  return {
    command: 'node',
    args: ['/repo/sap-mcp-server/dist/cli.js'],
    cwd: '/repo/sap-mcp-server',
    env: {
      SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE: 'false',
      SAP_LOG_LEVEL: 'info',
    },
  };
}

describe('MCP client injection', () => {
  afterEach(() => {
    for (const tempDir of tempDirs) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    tempDirs = [];
  });

  it('merges JSON config while removing stale SAP env overrides', () => {
    const tempDir = makeTempDir();
    const configPath = join(tempDir, 'mcp.json');
    writeFileSync(configPath, JSON.stringify({
      mcpServers: {
        sap: {
          command: 'node',
          args: ['/old/dist/cli.js'],
          env: {
            KEEP_ME: 'yes',
            SAP_MCP_RPC_URL: 'https://api.devnet.solana.com',
            SAP_WALLET_PATH: '/legacy/sap-mcp/keypair.json',
          },
        },
      },
    }, null, 2));

    const canonical = canonicalConfig();
    const plan = planMcpClientInjection(target(configPath, 'json'), canonical, 'merge');
    const parsed = JSON.parse(plan.nextContent);

    expect(plan.hadSapConfig).toBe(true);
    expect(plan.legacyFindings).toContain('hardcoded env override "SAP_MCP_RPC_URL"');
    expect(parsed.mcpServers.sap.args).toEqual(['/repo/sap-mcp-server/dist/cli.js']);
    expect(parsed.mcpServers.sap.env.KEEP_ME).toBe('yes');
    expect(parsed.mcpServers.sap.env.SAP_MCP_RPC_URL).toBeUndefined();
    expect(parsed.mcpServers.sap.env.SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE).toBe('false');
  });

  it('replaces an existing Hermes YAML sap block with canonical active-profile config', () => {
    const tempDir = makeTempDir();
    const configPath = join(tempDir, 'config.yaml');
    writeFileSync(configPath, [
      'theme: dark',
      'mcp_servers:',
      '  sap:',
      '    command: node',
      '    args:',
      '    - /old/dist/cli.js',
      '    env:',
      '      SAP_RPC_URL: https://api.devnet.solana.com',
      '  other:',
      '    command: other',
      '',
    ].join('\n'));

    const canonical = canonicalConfig();
    const plan = planMcpClientInjection(target(configPath, 'yaml'), canonical, 'override');

    expect(plan.hadSapConfig).toBe(true);
    expect(plan.nextContent).toContain('mcp_servers:\n  sap:\n    command: node');
    expect(plan.nextContent).toContain('    - /repo/sap-mcp-server/dist/cli.js');
    expect(plan.nextContent).toContain('      SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE: "false"');
    expect(plan.nextContent).toContain('  other:\n    command: other');
    expect(plan.nextContent).not.toContain('SAP_RPC_URL');
  });

  it('updates Codex TOML by replacing stale SAP MCP sections', () => {
    const tempDir = makeTempDir();
    const configPath = join(tempDir, 'config.toml');
    writeFileSync(configPath, [
      'model = "gpt-5"',
      '',
      '[mcp_servers.sap]',
      'command = "node"',
      'args = ["/old/dist/cli.js"]',
      '',
      '[mcp_servers.sap.env]',
      'SAP_MCP_CONFIG_PATH = "/legacy/config.json"',
      '',
      '[mcp_servers.node_repl]',
      'command = "node_repl"',
      '',
    ].join('\n'));

    const canonical = canonicalConfig();
    const plan = planMcpClientInjection(target(configPath, 'toml'), canonical, 'override');
    const result = applyMcpClientInjection(plan);
    const written = readFileSync(configPath, 'utf-8');

    expect(result.backupPath).toBeDefined();
    expect(written).toContain('[mcp_servers.node_repl]');
    expect(written).toContain('[mcp_servers.sap]');
    expect(written).toContain('args = ["/repo/sap-mcp-server/dist/cli.js"]');
    expect(written).toContain('SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE = "false"');
    expect(written).not.toContain('SAP_MCP_CONFIG_PATH');
  });

  it('prints manual JSON snippets for hosted and local MCP setup', () => {
    const snippets = createManualMcpJsonSnippets(canonicalConfig());
    const hosted = snippets.find((snippet) => snippet.title === 'Hosted SAP MCP JSON (Claude, OpenClaw, generic MCP clients)');
    const codexHosted = snippets.find((snippet) => snippet.title === 'Hosted SAP MCP TOML (Codex config.toml)');
    const hermesGlobal = snippets.find((snippet) => snippet.title === 'Hosted SAP MCP JSON (Hermes global mcp.json)');
    const hermesProfile = snippets.find((snippet) => snippet.title === 'Hosted SAP MCP YAML (Hermes profile config.yaml)');
    const local = snippets.find((snippet) => snippet.title === 'Local SAP MCP JSON');
    const codexLocal = snippets.find((snippet) => snippet.title === 'Local SAP MCP TOML (Codex config.toml)');

    expect(hosted).toBeDefined();
    expect(codexHosted).toBeDefined();
    expect(hermesGlobal).toBeDefined();
    expect(hermesProfile).toBeDefined();
    expect(local).toBeDefined();
    expect(codexLocal).toBeDefined();
    expect(hosted?.description).toContain('root mcpServers map');
    expect(hosted?.description).toContain('Do not paste this into Codex');
    expect(JSON.parse(hosted?.content ?? '{}')).toEqual({
      mcpServers: {
        sap: {
          url: 'https://mcp.sap.oobeprotocol.ai/mcp',
          transport: 'streamable-http',
        },
      },
    });
    expect(JSON.parse(hermesGlobal?.content ?? '{}')).toEqual({
      sap: {
        url: 'https://mcp.sap.oobeprotocol.ai/mcp',
        transport: 'streamable-http',
      },
    });
    expect(codexHosted?.content).toContain('[mcp_servers.sap]');
    expect(codexHosted?.content).toContain('url = "https://mcp.sap.oobeprotocol.ai/mcp"');
    expect(codexHosted?.content).not.toContain('transport = "streamable-http"');
    expect(hermesProfile?.content).toContain('mcp_servers:\n  sap:\n    url: https://mcp.sap.oobeprotocol.ai/mcp\n    transport: streamable-http');
    expect(JSON.parse(local?.content ?? '{}').mcpServers.sap.env).toEqual({
      SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE: 'false',
      SAP_LOG_LEVEL: 'info',
    });
    expect(codexLocal?.content).toContain('[mcp_servers.sap]');
    expect(codexLocal?.content).toContain('--package');
    expect(codexLocal?.content).toContain('@oobe-protocol-labs/sap-mcp-server');
  });

  it('discovers Codex config as a create-capable target', () => {
    const tempDir = makeTempDir();
    const targets = discoverMcpClientTargets(tempDir);

    expect(targets.some(item => item.id === 'codex' && item.path.endsWith(join('.codex', 'config.toml')))).toBe(true);
  });

  it('builds portable Codex npx stdio config without wallet or RPC overrides', () => {
    const config = createNpxCodexServerConfig();

    expect(config.args).toContain('@oobe-protocol-labs/sap-mcp-server');
    expect(config.args).toContain('sap-mcp-server');
    expect(config.env).toEqual({
      SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE: 'false',
      SAP_LOG_LEVEL: 'info',
    });
  });

  it('provides x402 paid-call addon snippets and installs the addon bundle', () => {
    const tempDir = makeTempDir();
    const snippets = createX402PaidCallAddonSnippets();
    const install = installX402PaidCallAddon(join(tempDir, 'x402-paid-call'));

    expect(snippets.map(snippet => snippet.title)).toContain('Codex Payment Bridge TOML');
    expect(snippets.map(snippet => snippet.title)).toContain('Claude Code Payment Bridge Commands');
    expect(snippets.map(snippet => snippet.title)).toContain('Hermes Addon: x402_paid_call');
    expect(snippets.map(snippet => snippet.title)).toContain('Local MCP Tool Alternative');
    expect(snippets.find(snippet => snippet.title === 'Codex Payment Bridge TOML')?.content).toContain('[mcp_servers.sap_payments]');
    expect(snippets.find(snippet => snippet.title === 'Codex Payment Bridge TOML')?.content).toContain('enabled_tools = ["sap_x402_paid_call", "sap_profile_current", "sap_x402_estimate_cost"]');
    expect(snippets.find(snippet => snippet.title === 'Claude Code Payment Bridge Commands')?.content).toContain('claude mcp add --transport http sap https://mcp.sap.oobeprotocol.ai/mcp');
    expect(install.addonId).toBe('x402-paid-call');
    expect(readFileSync(join(tempDir, 'x402-paid-call', 'manifest.json'), 'utf-8')).toContain('sap-mcp-x402-paid-call');
    expect(readFileSync(join(tempDir, 'x402-paid-call', 'README.md'), 'utf-8')).toContain('sap_x402_paid_call');
    expect(readFileSync(join(tempDir, 'x402-paid-call', 'client-snippets.json'), 'utf-8')).toContain('x402_paid_call');
  });

  it('builds Codex hosted MCP plus local payment bridge config', () => {
    const built = buildCodexHostedPaymentBridgeContent('[mcp_servers.node_repl]\ncommand = "node"\n');

    expect(built.nextContent).toContain('[mcp_servers.node_repl]');
    expect(built.nextContent).toContain('[mcp_servers.sap]');
    expect(built.nextContent).toContain('url = "https://mcp.sap.oobeprotocol.ai/mcp"');
    expect(built.nextContent).toContain('[mcp_servers.sap_payments]');
    expect(built.nextContent).toContain('SAP_ALLOWED_TOOLS = "sap_x402_paid_call,sap_profile_current,sap_x402_estimate_cost"');
    expect(built.nextContent).not.toContain('SAP_MCP_RPC_URL');
    expect(built.nextContent).not.toContain('SAP_WALLET_PATH');
  });

  it('installs Codex hosted MCP plus local payment bridge config with backup', () => {
    const tempDir = makeTempDir();
    const codexDir = join(tempDir, '.codex');
    const codexPath = join(codexDir, 'config.toml');
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(codexPath, '[mcp_servers.sap]\ncommand = "old"\n', 'utf-8');

    const result = installCodexHostedPaymentBridgeConfig(tempDir);
    const written = readFileSync(codexPath, 'utf-8');

    expect(result.written).toBe(true);
    expect(result.backupPath).toBeDefined();
    expect(written).toContain('[mcp_servers.sap]');
    expect(written).toContain('[mcp_servers.sap_payments]');
    expect(written).toContain('enabled_tools = ["sap_x402_paid_call", "sap_profile_current", "sap_x402_estimate_cost"]');
    expect(written).not.toContain('command = "old"');
  });
});
