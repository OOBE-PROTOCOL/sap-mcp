import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { MCP_SERVER_VERSION } from '../core/constants.js';
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

const NPM_PACKAGE = `@oobe-protocol-labs/sap-mcp-server@${MCP_SERVER_VERSION}`;
const runtimeClientInjectionContracts = JSON.parse(readFileSync(
  join(process.cwd(), 'config/runtime-client-injection-contracts.json'),
  'utf-8',
)) as {
  hostedUrl: string;
  hostedServerName: string;
  paymentBridgeServerName: string;
  requiredBridgeEnv: Record<string, string>;
  requiredValidationFunctions: string[];
  forbiddenRuntimeConfigContent: string[];
  requiredRuntimeProfiles: Array<{
    id: McpClientTarget['id'];
    label: string;
    format: McpClientTarget['format'];
    pathSuffix: string;
    runtimeId: string;
    hostedServerName?: string;
    requiredMarkers: string[];
  }>;
};

// Bridge commands always use npx --package (reverted from absolute-path in 0.9.70
// due to Hermes stdio tool registration regression #51587).
const EXPECTED_BRIDGE_COMMAND = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const EXPECTED_BRIDGE_ARGS = ['--yes', '--package', NPM_PACKAGE, 'sap-mcp-server'];

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
      },
    });
    expect(codexHosted?.content).toContain('[mcp_servers.sap]');
    expect(codexHosted?.content).toContain('url = "https://mcp.sap.oobeprotocol.ai/mcp"');
    expect(codexHosted?.content).not.toContain('transport = "streamable-http"');
    expect(hermesProfile?.content).toContain('mcp_servers:\n  sap:\n    url: "https://mcp.sap.oobeprotocol.ai/mcp"');
    expect(openClawProfile?.content).toContain('mcp:\n  servers:\n    sap:\n      url: "https://mcp.sap.oobeprotocol.ai/mcp"');
    expect(hermesProfile?.content).not.toContain('transport: "streamable-http"');
    expect(openClawProfile?.content).not.toContain('transport: "streamable-http"');
    expect(snippets.find((snippet) => snippet.title === 'Hosted SAP MCP YAML (ClawPump Agent config)')?.content)
      .toContain('mcp_servers:\n  sap-mcp:\n    url: "https://mcp.sap.oobeprotocol.ai/mcp"');
    expect(JSON.parse(local?.content ?? '{}').mcpServers.sap.env).toEqual({
      SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE: 'false',
      SAP_LOG_LEVEL: 'info',
    });
    expect(codexLocal?.content).toContain('[mcp_servers.sap]');
    expect(codexLocal?.content).toContain('--package');
    expect(codexLocal?.content).toContain(NPM_PACKAGE);
  });

  it('discovers Codex config as a create-capable target', () => {
    const tempDir = makeTempDir();
    const targets = discoverMcpClientTargets(tempDir);

    expect(targets.some(item => item.id === 'codex' && item.path.endsWith(join('.codex', 'config.toml')))).toBe(true);
  });

  it('builds portable Codex npx stdio config without wallet or RPC overrides', () => {
    const config = createNpxCodexServerConfig();

    expect(config.command).toBe(EXPECTED_BRIDGE_COMMAND);
    expect(config.args).toEqual(EXPECTED_BRIDGE_ARGS);
    expect(config.env).toEqual({
      SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE: 'false',
      SAP_LOG_LEVEL: 'info',
    });
  });

  it('keeps hosted sap plus local sap_payments injection aligned with the runtime contract matrix', () => {
    const source = readFileSync(join(process.cwd(), 'packages/config-runtime/src/mcp-client-injection.ts'), 'utf-8');
    for (const functionName of runtimeClientInjectionContracts.requiredValidationFunctions) {
      expect(source).toContain(functionName);
    }

    for (const profile of runtimeClientInjectionContracts.requiredRuntimeProfiles) {
      const targetConfig: McpClientTarget = {
        id: profile.id,
        label: profile.label,
        path: join('/tmp', profile.pathSuffix),
        format: profile.format,
        exists: true,
      };
      const built = buildHostedPaymentBridgeContent(targetConfig, profile.format === 'json' ? '{}' : '', 'darwin');
      const issues = validateHostedPaymentBridgeContent(targetConfig, built.nextContent, 'darwin');

      expect(issues, `${profile.label} ${profile.format}`).toEqual([]);
      expect(built.nextContent).toContain(runtimeClientInjectionContracts.hostedUrl);
      expect(built.nextContent).toContain(profile.hostedServerName ?? runtimeClientInjectionContracts.hostedServerName);
      expect(built.nextContent).toContain(runtimeClientInjectionContracts.paymentBridgeServerName);
      for (const marker of profile.requiredMarkers) {
        expect(built.nextContent, `${profile.label} ${marker}`).toContain(marker);
      }
      for (const [key, value] of Object.entries(runtimeClientInjectionContracts.requiredBridgeEnv)) {
        expect(built.nextContent).toContain(key);
        expect(built.nextContent).toContain(value);
      }
      for (const forbidden of runtimeClientInjectionContracts.forbiddenRuntimeConfigContent) {
        expect(built.nextContent).not.toContain(forbidden);
      }
    }
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

  it('repairs only SAP Codex namespaces while preserving third-party MCP servers', () => {
    const content = [
      '[mcp_servers.github]',
      'command = "npx"',
      'args = ["-y", "@modelcontextprotocol/server-github"]',
      '',
      '[mcp_servers.sap]',
      'command = "npx.cmd"',
      'args = ["-y", "mcp-remote@latest", "https://mcp.sap.oobeprotocol.ai/mcp"]',
      '',
      '[mcp_servers.sap_payments]',
      'command = "npx.cmd"',
      'args = ["--yes", "--package", "@oobe-protocol-labs/sap-mcp-server@0.9.1", "sap-mcp-server"]',
      '',
      '[mcp_servers.sap_payments.env]',
      'SAP_ALLOWED_TOOLS = "sap_payments_call_paid_tool"',
      'SAP_MCP_PAYMENTS_BRIDGE_ONLY = "true"',
    ].join('\n');

    const resolved = resolveHostedPaymentBridgeContent({
      id: 'codex',
      label: 'Codex',
      path: '/tmp/config.toml',
      format: 'toml',
      exists: true,
    }, content, 'win32');

    expect(resolved.nextContent).toContain('[mcp_servers.github]');
    expect(resolved.nextContent).toContain('@modelcontextprotocol/server-github');
    expect(resolved.nextContent).toContain('[mcp_servers.sap]');
    expect(resolved.nextContent).toContain('url = "https://mcp.sap.oobeprotocol.ai/mcp"');
    expect(resolved.nextContent).toContain('[mcp_servers.sap_payments]');
    expect(resolved.nextContent).toContain(`@oobe-protocol-labs/sap-mcp-server@${MCP_SERVER_VERSION}`);
    expect(resolved.nextContent).toContain('SAP_ALLOWED_TOOLS = "all"');
    expect(resolved.nextContent).toContain('SAP_MCP_RUNTIME_ID = "codex"');
    expect(resolved.nextContent).not.toContain('mcp-remote');
    expect(resolved.nextContent).not.toContain('@oobe-protocol-labs/sap-mcp-server@0.9.1');
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

  it('does not accept hosted endpoint lookalikes during bridge validation', () => {
    const targetConfig: McpClientTarget = {
      id: 'codex',
      label: 'Codex',
      path: '/tmp/config.toml',
      format: 'toml',
      exists: true,
    };
    const built = buildCodexHostedPaymentBridgeContent('', undefined, 'win32');
    const lookalike = built.nextContent.replace(
      'url = "https://mcp.sap.oobeprotocol.ai/mcp"',
      'url = "https://mcp.sap.oobeprotocol.ai/mcp.evil.example"',
    );

    expect(validateHostedPaymentBridgeContent(targetConfig, lookalike, 'win32'))
      .toContain('Missing hosted SAP MCP URL https://mcp.sap.oobeprotocol.ai/mcp.');
  });

  it('accepts exact hosted endpoint assignments with trailing config comments', () => {
    const targetConfig: McpClientTarget = {
      id: 'codex',
      label: 'Codex',
      path: '/tmp/config.toml',
      format: 'toml',
      exists: true,
    };
    const built = buildCodexHostedPaymentBridgeContent('', undefined, 'win32');
    const commented = built.nextContent.replace(
      'url = "https://mcp.sap.oobeprotocol.ai/mcp"',
      'url = "https://mcp.sap.oobeprotocol.ai/mcp" # OOBE hosted SAP MCP',
    );

    expect(validateHostedPaymentBridgeContent(targetConfig, commented, 'win32')).toEqual([]);
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
    expect(parsed.mcpServers.sap_payments.command).toBe(EXPECTED_BRIDGE_COMMAND);
    expect(parsed.mcpServers.sap_payments.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY).toBe('true');
    expect(parsed.mcpServers.sap_payments.env.SAP_MCP_RUNTIME_ID).toBe('claude');
    expect(parsed.mcpServers.sap_payments.env.SAP_ALLOWED_TOOLS).toBe('all');
    expect(parsed.mcpServers.filesystem).toEqual({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    });
    expect(JSON.stringify(parsed)).not.toContain('SAP_WALLET_PATH');
  });

  it('preserves JSON client hardening while repairing hosted MCP plus payment bridge', () => {
    const targetConfig: McpClientTarget = {
      id: 'claude',
      label: 'Claude Desktop',
      path: '/tmp/claude_desktop_config.json',
      format: 'json',
      exists: true,
    };
    const built = buildHostedPaymentBridgeContent(targetConfig, JSON.stringify({
      mcpServers: {
        sap: {
          enabled: false,
          tools: { include: ['sap_discover_agents'] },
          command: 'old',
          transport: 'streamable-http',
        },
        sap_payments: {
          enabled: false,
          tools: { include: ['sap_payments_call_paid_tool'] },
          command: 'old',
          env: {
            CUSTOM_BRIDGE_FLAG: 'keep',
            SAP_RPC_URL: 'https://api.devnet.solana.com',
          },
        },
      },
    }));
    const parsed = JSON.parse(built.nextContent);

    expect(parsed.mcpServers.sap.enabled).toBe(false);
    expect(parsed.mcpServers.sap.tools).toEqual({ include: ['sap_discover_agents'] });
    expect(parsed.mcpServers.sap.command).toBeUndefined();
    expect(parsed.mcpServers.sap.transport).toBeUndefined();
    expect(parsed.mcpServers.sap.type).toBe('http');
    expect(parsed.mcpServers.sap.url).toBe('https://mcp.sap.oobeprotocol.ai/mcp');
    expect(parsed.mcpServers.sap_payments.enabled).toBe(false);
    expect(parsed.mcpServers.sap_payments.tools).toEqual({ include: ['sap_payments_call_paid_tool'] });
    expect(parsed.mcpServers.sap_payments.env.CUSTOM_BRIDGE_FLAG).toBe('keep');
    expect(parsed.mcpServers.sap_payments.env.SAP_RPC_URL).toBeUndefined();
    expect(parsed.mcpServers.sap_payments.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY).toBe('true');
    expect(parsed.mcpServers.sap_payments.env.SAP_ALLOWED_TOOLS).toBe('all');
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
    });
    expect(parsed.sap_payments.command).toBe(EXPECTED_BRIDGE_COMMAND);
  });

  it('auto-repairs Hermes global JSON by removing nested legacy SAP blocks only', () => {
    const targetConfig: McpClientTarget = {
      id: 'hermes',
      label: 'Hermes Global MCP',
      path: '/tmp/mcp.json',
      format: 'json',
      exists: true,
    };
    const built = buildHostedPaymentBridgeContent(targetConfig, JSON.stringify({
      mcpServers: {
        sap: {
          command: 'node',
          args: ['/old/local/dist/cli.js'],
          env: {
            SAP_MCP_RPC_URL: 'https://api.devnet.solana.com',
          },
        },
        sap_payments: {
          command: 'npx',
          args: ['--yes', '--package', '@oobe-protocol-labs/sap-mcp-server@0.9.1', 'sap-mcp-server'],
        },
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        },
      },
      otherSetting: true,
    }), 'win32');
    const parsed = JSON.parse(built.nextContent);

    expect(built.hadSapConfig).toBe(true);
    expect(parsed.sap).toEqual({
      url: 'https://mcp.sap.oobeprotocol.ai/mcp',
    });
    expect(parsed.sap_payments.command).toBe('npx.cmd');
    expect(parsed.sap_payments.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY).toBe('true');
    expect(parsed.sap_payments.env.SAP_ALLOWED_TOOLS).toBe('all');
    expect(parsed.mcpServers.sap).toBeUndefined();
    expect(parsed.mcpServers.sap_payments).toBeUndefined();
    expect(parsed.mcpServers.filesystem).toEqual({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    });
    expect(parsed.otherSetting).toBe(true);
    expect(JSON.stringify(parsed)).not.toContain('api.devnet.solana.com');
    expect(validateHostedPaymentBridgeContent(targetConfig, built.nextContent, 'win32')).toEqual([]);

    const legacyOnly = JSON.stringify({
      mcpServers: {
        sap: { command: 'node', args: ['/old/local/dist/cli.js'] },
      },
      sap: {
        url: 'https://mcp.sap.oobeprotocol.ai/mcp',
      },
      sap_payments: createNpxCodexServerConfig(),
    });
    expect(validateHostedPaymentBridgeContent(targetConfig, legacyOnly, 'darwin'))
      .toContain('Hermes global mcp.json still has legacy mcpServers.sap or mcpServers.sap_payments; Hermes expects flat sap and sap_payments entries.');
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
    expect(hermesYaml).toContain(`      - "${NPM_PACKAGE}"`);
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
    expect(built.nextContent).toContain('mcp_servers:\n  sap:\n    url: "https://mcp.sap.oobeprotocol.ai/mcp"');
    expect(built.nextContent).not.toContain('transport: "streamable-http"');
    expect(built.nextContent).toContain('  sap_payments:\n    command:');
    expect(built.nextContent).toContain(`      - "${NPM_PACKAGE}"`);
    expect(built.nextContent).toContain('      SAP_ALLOWED_TOOLS: "all"');
    expect(built.nextContent).toContain('  keep:\n    command: keep');
    expect(built.nextContent).not.toContain('command: old');
  });

  it('preserves Hermes YAML hardening while repairing hosted MCP plus payment bridge', () => {
    const targetConfig: McpClientTarget = {
      id: 'hermes',
      label: 'Hermes Profile: locked',
      path: '/tmp/config.yaml',
      format: 'yaml',
      exists: true,
    };
    const built = buildHostedPaymentBridgeContent(targetConfig, [
      'mcp_servers:',
      '  sap:',
      '    enabled: false',
      '    tools:',
      '      include:',
      '        - sap_discover_agents',
      '    transport: "streamable-http"',
      '    command: old',
      '  sap_payments:',
      '    enabled: false',
      '    tools:',
      '      include:',
      '        - sap_payments_call_paid_tool',
      '    command: old',
      '    env:',
      '      CUSTOM_BRIDGE_FLAG: "keep"',
      '      SAP_RPC_URL: "https://api.devnet.solana.com"',
      '',
    ].join('\n'));

    expect(built.nextContent).toContain('  sap:\n    enabled: false\n    tools:\n      include:\n        - sap_discover_agents\n    url: "https://mcp.sap.oobeprotocol.ai/mcp"');
    expect(built.nextContent).toContain(`  sap_payments:\n    enabled: false\n    tools:\n      include:\n        - sap_payments_call_paid_tool\n    command: "${EXPECTED_BRIDGE_COMMAND}"`);
    expect(built.nextContent).toContain('      CUSTOM_BRIDGE_FLAG: "keep"');
    expect(built.nextContent).toContain('      SAP_ALLOWED_TOOLS: "all"');
    expect(built.nextContent).not.toContain('transport: "streamable-http"');
    expect(built.nextContent).not.toContain('SAP_RPC_URL');
  });

  it('uses the reviewed sap-mcp server key for ClawPump YAML while migrating legacy sap', () => {
    const targetConfig: McpClientTarget = {
      id: 'clawpump',
      label: 'ClawPump Agent / Hermes Profile',
      path: '/tmp/config.yaml',
      format: 'yaml',
      exists: true,
    };
    const built = buildHostedPaymentBridgeContent(targetConfig, [
      'mcp_servers:',
      '  sap:',
      '    enabled: false',
      '    url: "https://mcp.sap.oobeprotocol.ai/mcp"',
      '',
    ].join('\n'));

    expect(built.nextContent).toContain('mcp_servers:\n  sap-mcp:\n    enabled: false\n    url: "https://mcp.sap.oobeprotocol.ai/mcp"');
    expect(built.nextContent).toContain(`  sap_payments:\n    command: "${EXPECTED_BRIDGE_COMMAND}"`);
    expect(built.nextContent).toContain(`      SAP_MCP_RUNTIME_ID: "clawpump"`);
    expect(built.nextContent).not.toContain('  sap:\n');
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
    expect(built.nextContent).toContain('mcp:\n  servers:\n    sap:\n      url: "https://mcp.sap.oobeprotocol.ai/mcp"');
    expect(built.nextContent).not.toContain('transport: "streamable-http"');
    expect(built.nextContent).toContain('    sap_payments:\n      command:');
    expect(built.nextContent).toContain(`        - "${NPM_PACKAGE}"`);
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
    });
    expect(parsed.mcp.servers.sap_payments.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY).toBe('true');
    expect(parsed.mcp.servers.sap_payments.env.SAP_MCP_RUNTIME_ID).toBe('openclaw');
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
    expect(codex).toContain('SAP_MCP_RUNTIME_ID = "codex"');
    expect(hermes.sap_payments.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY).toBe('true');
    expect(hermes.sap_payments.env.SAP_MCP_RUNTIME_ID).toBe('hermes');
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
      NPM_PACKAGE,
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
    expect(written).toContain('SAP_MCP_RUNTIME_ID = "codex"');
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
    expect(written).toContain('SAP_MCP_RUNTIME_ID = "codex"');
    expect(written).toContain('SAP_ALLOWED_TOOLS = "all"');
    expect(written).not.toContain('command = "old"');
  });

  it('keeps the ClawPump integration assets aligned with upstream review constraints', () => {
    const script = readFileSync(join(process.cwd(), 'integration/clawpump/scripts/sap-mcp-setup.sh'), 'utf-8');
    const manifest = readFileSync(join(process.cwd(), 'integration/clawpump/optional-mcps/sap-mcp/manifest.yaml'), 'utf-8');
    const defaultTools = /default_enabled:[\s\S]*?post_install:/u.exec(manifest)?.[0] ?? '';

    expect(script).toContain('SAP_MCP_VERSION="0.9.74"');
    expect(script).toContain('save_config(data)');
    expect(script).toContain('sap.pop("transport", None)');
    expect(script).toContain('"SAP_MCP_RUNTIME_ID": "clawpump"');
    expect(script).not.toContain('@latest');
    expect(script).not.toContain('~/.clawpump');
    expect(script).not.toContain('sap-mcp-config repair --runtime clawpump');
    expect(manifest).toContain('npx @oobe-protocol-labs/sap-mcp-server@0.9.74 sap-mcp-config wizard');
    expect(manifest).toContain('Installing skills writes into ~/.hermes/skills/ and is opt-in.');
    expect(defaultTools).not.toContain('sap_skills_install');
  });
});
