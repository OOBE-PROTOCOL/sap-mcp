import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyMcpClientInjection,
  buildCodexHostedPaymentBridgeContent,
  buildHostedPaymentBridgeContent,
  createManualMcpJsonSnippets,
  createNpxCodexServerConfig,
  createX402PaidCallAddonSnippets,
  discoverMcpClientTargets,
  getKnownClientTargets,
  installCodexHostedPaymentBridgeConfig,
  installHostedPaymentBridgeConfigs,
  installX402PaidCallAddon,
  planMcpClientInjection,
  resolveHostedPaymentBridgeContent,
  validateHostedPaymentBridgeContent,
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
    expect(plan.nextContent).toContain('mcp_servers:\n  sap:\n    command: "node"');
    expect(plan.nextContent).toContain('      - "/repo/sap-mcp-server/dist/cli.js"');
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
    const hosted = snippets.find((snippet) => snippet.title === 'Hosted SAP MCP JSON (Claude and generic MCP clients)');
    const codexHosted = snippets.find((snippet) => snippet.title === 'Hosted SAP MCP TOML (Codex config.toml)');
    const hermesGlobal = snippets.find((snippet) => snippet.title === 'Hosted SAP MCP JSON (Hermes global mcp.json)');
    const hermesProfile = snippets.find((snippet) => snippet.title === 'Hosted SAP MCP YAML (Hermes profile config.yaml)');
    const openClawProfile = snippets.find((snippet) => snippet.title === 'Hosted SAP MCP YAML (OpenClaw gateway config)');
    const local = snippets.find((snippet) => snippet.title === 'Local SAP MCP JSON');
    const codexLocal = snippets.find((snippet) => snippet.title === 'Local SAP MCP TOML (Codex config.toml)');

    expect(hosted).toBeDefined();
    expect(codexHosted).toBeDefined();
    expect(hermesGlobal).toBeDefined();
    expect(hermesProfile).toBeDefined();
    expect(openClawProfile).toBeDefined();
    expect(local).toBeDefined();
    expect(codexLocal).toBeDefined();
    expect(hosted?.description).toContain('root mcpServers map');
    expect(hosted?.description).toContain('Do not paste this into Codex');
    expect(hosted?.description).toContain('OpenClaw gateway config');
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
    expect(hermesProfile?.content).toContain('mcp_servers:\n  sap:\n    url: "https://mcp.sap.oobeprotocol.ai/mcp"\n    transport: "streamable-http"');
    expect(openClawProfile?.content).toContain('mcp:\n  servers:\n    sap:\n      url: "https://mcp.sap.oobeprotocol.ai/mcp"\n      transport: "streamable-http"');
    expect(JSON.parse(local?.content ?? '{}').mcpServers.sap.env).toEqual({
      SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE: 'false',
      SAP_LOG_LEVEL: 'info',
    });
    expect(codexLocal?.content).toContain('[mcp_servers.sap]');
    expect(codexLocal?.content).toContain('--package');
    expect(codexLocal?.content).toContain('@oobe-protocol-labs/sap-mcp-server@0.9.13');
  });

  it('discovers Codex config as a create-capable target', () => {
    const tempDir = makeTempDir();
    const targets = discoverMcpClientTargets(tempDir);

    expect(targets.some(item => item.id === 'codex' && item.path.endsWith(join('.codex', 'config.toml')))).toBe(true);
  });

  it('builds portable Codex npx stdio config without wallet or RPC overrides', () => {
    const config = createNpxCodexServerConfig();

    expect(config.args).toContain('@oobe-protocol-labs/sap-mcp-server@0.9.13');
    expect(config.args).toContain('sap-mcp-server');
    expect(config.env).toEqual({
      SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE: 'false',
      SAP_LOG_LEVEL: 'info',
    });
  });

  it('provides local payment bridge snippets and installs the reference bundle', () => {
    const tempDir = makeTempDir();
    const snippets = createX402PaidCallAddonSnippets();
    const install = installX402PaidCallAddon(join(tempDir, 'x402-paid-call'));

    expect(snippets.map(snippet => snippet.title)).toContain('Codex Payment Bridge TOML');
    expect(snippets.map(snippet => snippet.title)).toContain('Claude Code Payment Bridge Commands');
    expect(snippets.map(snippet => snippet.title)).toContain('OpenClaw Payment Bridge JSON');
    expect(snippets.map(snippet => snippet.title)).toContain('Generic Payment Bridge JSON');
    expect(snippets.map(snippet => snippet.title)).toContain('Hermes Command Wrapper: x402_paid_call');
    expect(snippets.map(snippet => snippet.title)).toContain('Local MCP Tool Alternative');
    expect(snippets.find(snippet => snippet.title === 'Codex Payment Bridge TOML')?.content).toContain('[mcp_servers.sap_payments]');
    expect(snippets.find(snippet => snippet.title === 'Codex Payment Bridge TOML')?.content).toContain('SAP_MCP_PAYMENTS_BRIDGE_ONLY = "true"');
    expect(snippets.find(snippet => snippet.title === 'Codex Payment Bridge TOML')?.content).toContain('SAP_ALLOWED_TOOLS = "all"');
    expect(snippets.find(snippet => snippet.title === 'Claude Code Payment Bridge Commands')?.content).toContain('claude mcp add --transport http sap https://mcp.sap.oobeprotocol.ai/mcp');
    expect(snippets.find(snippet => snippet.title === 'OpenClaw Payment Bridge JSON')?.content).toContain('"mcp"');
    expect(snippets.find(snippet => snippet.title === 'OpenClaw Payment Bridge JSON')?.content).toContain('"servers"');
    expect(install.addonId).toBe('x402-paid-call');
    expect(readFileSync(join(tempDir, 'x402-paid-call', 'manifest.json'), 'utf-8')).toContain('sap-mcp-x402-paid-call');
    expect(readFileSync(join(tempDir, 'x402-paid-call', 'README.md'), 'utf-8')).toContain('sap_payments_call_paid_tool');
    expect(readFileSync(join(tempDir, 'x402-paid-call', 'client-snippets.json'), 'utf-8')).toContain('x402_paid_call');
  });

  it('builds Codex hosted MCP plus local payment bridge config', () => {
    const built = buildCodexHostedPaymentBridgeContent('[mcp_servers.node_repl]\ncommand = "node"\n');

    expect(built.nextContent).toContain('[mcp_servers.node_repl]');
    expect(built.nextContent).toContain('[mcp_servers.sap]');
    expect(built.nextContent).toContain('url = "https://mcp.sap.oobeprotocol.ai/mcp"');
    expect(built.nextContent).toContain('[mcp_servers.sap_payments]');
    expect(built.nextContent).toContain('SAP_ALLOWED_TOOLS = "all"');
    expect(built.nextContent).not.toContain('SAP_MCP_RPC_URL');
    expect(built.nextContent).not.toContain('SAP_WALLET_PATH');
  });

  it('validates Codex hosted MCP plus local payment bridge config', () => {
    const targetConfig: McpClientTarget = {
      id: 'codex',
      label: 'Codex',
      path: '/tmp/config.toml',
      format: 'toml',
      exists: true,
    };
    const built = buildCodexHostedPaymentBridgeContent('', undefined, 'win32');

    expect(validateHostedPaymentBridgeContent(targetConfig, built.nextContent, 'win32')).toEqual([]);
    expect(validateHostedPaymentBridgeContent(targetConfig, '[mcp_servers.sap]\ncommand = "npx.cmd"\nargs = ["-y", "mcp-remote@latest"]\n', 'win32'))
      .toContain('Missing local sap_payments MCP bridge.');
  });

  it('auto-resolves legacy Codex mcp-remote config into native hosted plus sap_payments', () => {
    const targetConfig: McpClientTarget = {
      id: 'codex',
      label: 'Codex',
      path: '/tmp/config.toml',
      format: 'toml',
      exists: true,
    };
    const resolved = resolveHostedPaymentBridgeContent(targetConfig, [
      '[mcp_servers.sap]',
      'command = "npx.cmd"',
      'args = ["-y", "mcp-remote@latest", "https://mcp.sap.oobeprotocol.ai/mcp"]',
      'startup_timeout_sec = 300',
      '',
    ].join('\n'), 'win32');

    expect(resolved.resolvedIssues).toContain('Missing local sap_payments MCP bridge.');
    expect(resolved.nextContent).toContain('[mcp_servers.sap]');
    expect(resolved.nextContent).toContain('url = "https://mcp.sap.oobeprotocol.ai/mcp"');
    expect(resolved.nextContent).toContain('[mcp_servers.sap_payments]');
    expect(resolved.nextContent).toContain('command = "npx.cmd"');
    expect(resolved.nextContent).toContain('SAP_MCP_PAYMENTS_BRIDGE_ONLY = "true"');
    expect(resolved.nextContent).toContain('SAP_ALLOWED_TOOLS = "all"');
    expect(resolved.nextContent).not.toContain('mcp-remote');
    expect(validateHostedPaymentBridgeContent(targetConfig, resolved.nextContent, 'win32')).toEqual([]);
  });

  it('builds Claude JSON hosted MCP plus local payment bridge config', () => {
    const targetConfig: McpClientTarget = {
      id: 'claude',
      label: 'Claude Desktop',
      path: '/tmp/claude_desktop_config.json',
      format: 'json',
      exists: true,
    };
    const built = buildHostedPaymentBridgeContent(targetConfig, JSON.stringify({
      mcpServers: {
        sap: { command: 'old' },
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        },
      },
    }));
    const parsed = JSON.parse(built.nextContent);

    expect(built.hadSapConfig).toBe(true);
    expect(parsed.mcpServers.sap).toEqual({
      type: 'http',
      url: 'https://mcp.sap.oobeprotocol.ai/mcp',
    });
    expect(parsed.mcpServers.sap_payments.command).toMatch(/^npx/);
    expect(parsed.mcpServers.sap_payments.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY).toBe('true');
    expect(parsed.mcpServers.sap_payments.env.SAP_ALLOWED_TOOLS).toBe('all');
    expect(parsed.mcpServers.filesystem).toEqual({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    });
    expect(JSON.stringify(parsed)).not.toContain('SAP_WALLET_PATH');
  });

  it('builds Hermes global JSON hosted MCP plus local payment bridge config', () => {
    const targetConfig: McpClientTarget = {
      id: 'hermes',
      label: 'Hermes Global MCP',
      path: '/tmp/mcp.json',
      format: 'json',
      exists: true,
    };
    const built = buildHostedPaymentBridgeContent(targetConfig, '{}');
    const parsed = JSON.parse(built.nextContent);

    expect(parsed.sap).toEqual({
      url: 'https://mcp.sap.oobeprotocol.ai/mcp',
      transport: 'streamable-http',
    });
    expect(parsed.sap_payments.command).toMatch(/^npx/);
  });

  it('builds Windows hosted payment bridge commands for JSON, YAML, and TOML runtimes', () => {
    const hermesJsonTarget: McpClientTarget = {
      id: 'hermes',
      label: 'Hermes Global MCP',
      path: 'C:\\Users\\PC\\.hermes\\mcp.json',
      format: 'json',
      exists: true,
    };
    const hermesYamlTarget: McpClientTarget = {
      id: 'hermes',
      label: 'Hermes Profile: trader',
      path: 'C:\\Users\\PC\\.hermes\\profiles\\trader\\config.yaml',
      format: 'yaml',
      exists: true,
    };
    const codexTarget: McpClientTarget = {
      id: 'codex',
      label: 'Codex',
      path: 'C:\\Users\\PC\\.codex\\config.toml',
      format: 'toml',
      exists: true,
    };

    const hermesJson = JSON.parse(buildHostedPaymentBridgeContent(hermesJsonTarget, '{}', 'win32').nextContent);
    const hermesYaml = buildHostedPaymentBridgeContent(hermesYamlTarget, 'mcp_servers:\n', 'win32').nextContent;
    const codexToml = buildHostedPaymentBridgeContent(codexTarget, '', 'win32').nextContent;

    expect(hermesJson.sap_payments.command).toBe('npx.cmd');
    expect(hermesYaml).toContain('  sap_payments:\n    command: "npx.cmd"');
    expect(hermesYaml).toContain('      - "@oobe-protocol-labs/sap-mcp-server@0.9.13"');
    expect(codexToml).toContain('[mcp_servers.sap_payments]');
    expect(codexToml).toContain('command = "npx.cmd"');
    expect(codexToml).toContain('startup_timeout_sec = 300');
    expect(codexToml).toContain('tool_timeout_sec = 300');
  });

  it('builds Hermes YAML hosted MCP plus local payment bridge config', () => {
    const targetConfig: McpClientTarget = {
      id: 'hermes',
      label: 'Hermes Profile: trader',
      path: '/tmp/config.yaml',
      format: 'yaml',
      exists: true,
    };
    const built = buildHostedPaymentBridgeContent(targetConfig, [
      'name: trader',
      'mcp_servers:',
      '  sap:',
      '    command: old',
      '  keep:',
      '    command: keep',
      '',
    ].join('\n'));

    expect(built.hadSapConfig).toBe(true);
    expect(built.nextContent).toContain('mcp_servers:\n  sap:\n    url: "https://mcp.sap.oobeprotocol.ai/mcp"\n    transport: "streamable-http"');
    expect(built.nextContent).toContain('  sap_payments:\n    command:');
    expect(built.nextContent).toContain('      - "@oobe-protocol-labs/sap-mcp-server@0.9.13"');
    expect(built.nextContent).toContain('      SAP_ALLOWED_TOOLS: "all"');
    expect(built.nextContent).toContain('  keep:\n    command: keep');
    expect(built.nextContent).not.toContain('command: old');
  });

  it('builds OpenClaw YAML hosted MCP plus local payment bridge config under mcp.servers', () => {
    const targetConfig: McpClientTarget = {
      id: 'openclaw',
      label: 'OpenClaw',
      path: '/tmp/config.yaml',
      format: 'yaml',
      exists: true,
    };
    const built = buildHostedPaymentBridgeContent(targetConfig, [
      'theme: dark',
      'mcp:',
      '  servers:',
      '    sap:',
      '      command: old',
      '    keep:',
      '      command: keep',
      '',
    ].join('\n'));

    expect(built.hadSapConfig).toBe(true);
    expect(built.nextContent).toContain('mcp:\n  servers:\n    sap:\n      url: "https://mcp.sap.oobeprotocol.ai/mcp"\n      transport: "streamable-http"');
    expect(built.nextContent).toContain('    sap_payments:\n      command:');
    expect(built.nextContent).toContain('        - "@oobe-protocol-labs/sap-mcp-server@0.9.13"');
    expect(built.nextContent).toContain('        SAP_ALLOWED_TOOLS: "all"');
    expect(built.nextContent).toContain('    keep:\n      command: keep');
    expect(built.nextContent).not.toContain('command: old');
  });

  it('builds OpenClaw JSON hosted MCP plus local payment bridge config under mcp.servers', () => {
    const targetConfig: McpClientTarget = {
      id: 'openclaw',
      label: 'OpenClaw MCP',
      path: '/tmp/mcp.json',
      format: 'json',
      exists: true,
    };
    const built = buildHostedPaymentBridgeContent(targetConfig, JSON.stringify({
      mcpServers: {
        sap: { command: 'legacy' },
        keep: { command: 'keep' },
      },
    }));
    const parsed = JSON.parse(built.nextContent);

    expect(built.hadSapConfig).toBe(true);
    expect(parsed.mcp.servers.sap).toEqual({
      url: 'https://mcp.sap.oobeprotocol.ai/mcp',
      transport: 'streamable-http',
    });
    expect(parsed.mcp.servers.sap_payments.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY).toBe('true');
    expect(parsed.mcp.servers.sap_payments.env.SAP_ALLOWED_TOOLS).toBe('all');
    expect(parsed.mcpServers.keep.command).toBe('keep');
    expect(parsed.mcpServers.sap).toBeUndefined();
  });

  it('installs hosted payment bridge configs for selected runtimes', () => {
    const tempDir = makeTempDir();
    mkdirSync(join(tempDir, '.hermes'), { recursive: true });
    writeFileSync(join(tempDir, '.hermes', 'mcp.json'), '{}');

    const results = installHostedPaymentBridgeConfigs(['codex', 'hermes'], tempDir);
    const codex = readFileSync(join(tempDir, '.codex', 'config.toml'), 'utf-8');
    const hermes = JSON.parse(readFileSync(join(tempDir, '.hermes', 'mcp.json'), 'utf-8'));

    expect(results.map((result) => result.target.id)).toEqual(expect.arrayContaining(['codex', 'hermes']));
    expect(codex).toContain('[mcp_servers.sap_payments]');
    expect(hermes.sap_payments.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY).toBe('true');
    expect(hermes.sap_payments.env.SAP_ALLOWED_TOOLS).toBe('all');
  });

  it('discovers platform-specific Claude config paths', () => {
    const tempDir = makeTempDir();
    const macTargets = getKnownClientTargets(tempDir, 'darwin');
    const windowsTargets = getKnownClientTargets(tempDir, 'win32');
    const linuxTargets = getKnownClientTargets(tempDir, 'linux');

    expect(macTargets.find((item) => item.label === 'Claude Desktop')?.path)
      .toBe(join(tempDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'));
    expect(windowsTargets.find((item) => item.label === 'Claude Desktop')?.path)
      .toBe(join(tempDir, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json'));
    expect(linuxTargets.find((item) => item.label === 'Claude Desktop')?.path)
      .toBe(join(tempDir, '.config', 'Claude', 'claude_desktop_config.json'));
  });

  it('installs Windows Claude hosted payment bridge config in the native roaming profile path', () => {
    const tempDir = makeTempDir();
    const results = installHostedPaymentBridgeConfigs(['claude'], tempDir, 'win32');
    const targetPath = join(tempDir, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
    const parsed = JSON.parse(readFileSync(targetPath, 'utf-8'));

    expect(results).toHaveLength(1);
    expect(results[0]?.target.path).toBe(targetPath);
    expect(parsed.mcpServers.sap).toEqual({
      type: 'http',
      url: 'https://mcp.sap.oobeprotocol.ai/mcp',
    });
    expect(parsed.mcpServers.sap_payments.command).toBe('npx.cmd');
    expect(parsed.mcpServers.sap_payments.args).toEqual([
      '--yes',
      '--package',
      '@oobe-protocol-labs/sap-mcp-server@0.9.13',
      'sap-mcp-server',
    ]);
    expect(parsed.mcpServers.sap_payments.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY).toBe('true');
    expect(parsed.mcpServers.sap_payments.env.SAP_ALLOWED_TOOLS).toBe('all');
  });

  it('installs Windows Codex hosted payment bridge config with npx.cmd', () => {
    const tempDir = makeTempDir();
    const results = installHostedPaymentBridgeConfigs(['codex'], tempDir, 'win32');
    const codexPath = join(tempDir, '.codex', 'config.toml');
    const written = readFileSync(codexPath, 'utf-8');

    expect(results).toHaveLength(1);
    expect(results[0]?.target.path).toBe(codexPath);
    expect(written).toContain('[mcp_servers.sap]');
    expect(written).toContain('url = "https://mcp.sap.oobeprotocol.ai/mcp"');
    expect(written).toContain('[mcp_servers.sap_payments]');
    expect(written).toContain('command = "npx.cmd"');
    expect(written).toContain('startup_timeout_sec = 300');
    expect(written).toContain('tool_timeout_sec = 300');
    expect(written).toContain('SAP_MCP_PAYMENTS_BRIDGE_ONLY = "true"');
    expect(written).toContain('SAP_ALLOWED_TOOLS = "all"');
    expect(written).not.toContain('SAP_WALLET_PATH');
    expect(written).not.toContain('SAP_MCP_RPC_URL');
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
    expect(written).toContain('SAP_MCP_PAYMENTS_BRIDGE_ONLY = "true"');
    expect(written).toContain('SAP_ALLOWED_TOOLS = "all"');
    expect(written).not.toContain('command = "old"');
  });
});
