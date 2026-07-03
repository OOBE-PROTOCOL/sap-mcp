import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';

/**
 * @name McpClientId
 * @description Supported local MCP clients that can receive SAP MCP server config.
 */
export type McpClientId = 'claude' | 'hermes' | 'openclaw' | 'codex';

/**
 * @name McpClientConfigFormat
 * @description File formats supported by the MCP client injection pipeline.
 */
export type McpClientConfigFormat = 'json' | 'yaml' | 'toml';

/**
 * @name McpClientInjectionMode
 * @description Write strategy used when a config already contains a SAP MCP server entry.
 */
export type McpClientInjectionMode = 'merge' | 'override';

/**
 * @name McpClientTarget
 * @description A concrete MCP client config file that can be inspected or updated.
 */
export interface McpClientTarget {
  id: McpClientId;
  label: string;
  path: string;
  format: McpClientConfigFormat;
  exists: boolean;
  profileName?: string;
}

/**
 * @name McpServerInjectionConfig
 * @description Canonical SAP MCP server config injected into client files.
 */
export interface McpServerInjectionConfig {
  command: string;
  args: string[];
  cwd?: string;
  env: Record<string, string>;
}

/**
 * @name HostedMcpServerConfig
 * @description Remote Streamable HTTP MCP server config for clients that connect to OOBE hosted SAP MCP.
 */
export interface HostedMcpServerConfig {
  url: string;
  transport: 'streamable-http';
}

/**
 * @name McpClientInjectionPlan
 * @description Preview data generated before writing a client config file.
 */
export interface McpClientInjectionPlan {
  target: McpClientTarget;
  mode: McpClientInjectionMode;
  exists: boolean;
  hadSapConfig: boolean;
  legacyFindings: string[];
  beforeSummary: string;
  afterSummary: string;
  nextContent: string;
  backupPath?: string;
}

/**
 * @name McpClientInjectionResult
 * @description Result returned after applying an injection plan.
 */
export interface McpClientInjectionResult {
  target: McpClientTarget;
  mode: McpClientInjectionMode;
  written: boolean;
  backupPath?: string;
  message: string;
}

/**
 * @name ManualMcpClientSnippet
 * @description Copy/paste MCP client config snippet shown when users prefer manual setup.
 */
export interface ManualMcpClientSnippet {
  title: string;
  description: string;
  content: string;
}

/**
 * @name McpClientAddonInstallResult
 * @description Files written when the wizard installs a local client addon bundle.
 */
export interface McpClientAddonInstallResult {
  addonId: 'x402-paid-call';
  targetDir: string;
  files: string[];
}

type JsonRecord = Record<string, unknown>;

const SAP_SERVER_NAME = 'sap';
const X402_PAID_CALL_ADDON_ID = 'x402-paid-call';
const X402_PAID_CALL_COMMAND = 'sap-mcp-x402-paid-call';
/**
 * @name HOSTED_SAP_MCP_URL
 * @description Public OOBE hosted SAP MCP Streamable HTTP endpoint used in manual client setup snippets.
 */
export const HOSTED_SAP_MCP_URL = 'https://mcp.sap.oobeprotocol.ai/mcp';
const LEGACY_ENV_KEYS = new Set([
  'SAP_MCP_PROFILE',
  'SAP_MCP_CONFIG_PATH',
  'SAP_MCP_RPC_URL',
  'SAP_RPC_URL',
  'SAP_WALLET_PATH',
  'SAP_MCP_WALLET_PATH',
  'SAP_NETWORK',
]);

/**
 * @name isRecord
 * @description Narrows unknown data to a JSON-like object.
 */
function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @name escapeRegExp
 * @description Escapes a literal string for safe use in a regular expression.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @name readTargetContent
 * @description Reads an existing target file or returns a format-appropriate empty config.
 */
function readTargetContent(target: McpClientTarget): string {
  if (target.exists && existsSync(target.path)) {
    return readFileSync(target.path, 'utf-8');
  }

  if (target.format === 'json') {
    return '{}';
  }

  return '';
}

/**
 * @name formatJson
 * @description Serializes client JSON config with stable indentation.
 */
function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * @name createCanonicalServerConfig
 * @description Builds a SAP MCP server config that follows the active profile manager.
 */
export function createCanonicalServerConfig(workspaceRoot = process.cwd()): McpServerInjectionConfig {
  const localCliPath = join(workspaceRoot, 'dist', 'cli.js');
  if (existsSync(localCliPath)) {
    return {
      command: 'node',
      args: [localCliPath],
      cwd: workspaceRoot,
      env: {
        SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE: 'false',
        SAP_LOG_LEVEL: 'info',
      },
    };
  }

  return {
    command: 'sap-mcp-server',
    args: [],
    env: {
      SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE: 'false',
      SAP_LOG_LEVEL: 'info',
    },
  };
}

/**
 * @name createManualMcpJsonSnippets
 * @description Builds copy/paste JSON snippets for hosted remote and local active-profile MCP client setup.
 */
export function createManualMcpJsonSnippets(
  canonical: McpServerInjectionConfig,
  hostedUrl = HOSTED_SAP_MCP_URL
): ManualMcpClientSnippet[] {
  const hostedConfig: HostedMcpServerConfig = {
    url: hostedUrl,
    transport: 'streamable-http',
  };

  return [
    {
      title: 'Hosted SAP MCP JSON (Claude, Codex, OpenClaw)',
      description: 'Use this for clients whose config expects a root mcpServers map.',
      content: formatJson({
        mcpServers: {
          [SAP_SERVER_NAME]: hostedConfig,
        },
      }),
    },
    {
      title: 'Hosted SAP MCP JSON (Hermes global mcp.json)',
      description: 'Use this for ~/.hermes/mcp.json, which expects flat server entries rather than a nested mcpServers map.',
      content: formatJson({
        [SAP_SERVER_NAME]: hostedConfig,
      }),
    },
    {
      title: 'Hosted SAP MCP YAML (Hermes profile config.yaml)',
      description: 'Use this inside Hermes profile YAML files under the top-level mcp_servers section.',
      content: [
        'mcp_servers:',
        `  ${SAP_SERVER_NAME}:`,
        `    url: ${hostedUrl}`,
        '    transport: streamable-http',
        '',
      ].join('\n'),
    },
    {
      title: 'Local SAP MCP JSON',
      description: 'Use this when the agent runs SAP MCP locally and follows ~/.config/mcp-sap/.active-profile.',
      content: formatJson({
        mcpServers: {
          [SAP_SERVER_NAME]: canonical,
        },
      }),
    },
  ];
}

/**
 * @name createX402PaidCallAddonSnippets
 * @description Builds manual plugin/addon snippets for clients that can call a local x402 payment helper.
 */
export function createX402PaidCallAddonSnippets(): ManualMcpClientSnippet[] {
  return [
    {
      title: 'Hermes Addon: x402_paid_call',
      description: 'Use this concept for Hermes plugin/addon registries that expose local command-backed tools.',
      content: formatJson({
        plugins: {
          x402_paid_call: {
            command: X402_PAID_CALL_COMMAND,
            description: 'Pay and retry hosted SAP MCP x402 tool calls with the active local SAP MCP profile.',
            args: [],
            env: {
              SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE: 'false',
            },
          },
        },
      }),
    },
    {
      title: 'Claude/Codex/OpenClaw Addon Command',
      description: 'Use this command from a local tool/plugin wrapper when the client supports command-backed addons.',
      content: [
        `${X402_PAID_CALL_COMMAND} \\`,
        '  --tool sap_list_all_agents \\',
        '  --arguments \'{"limit":5}\' \\',
        '  --max-usd 0.02 \\',
        '  --confirm',
        '',
      ].join('\n'),
    },
    {
      title: 'Local MCP Tool Alternative',
      description: 'When the local SAP MCP stdio server is installed, agents can call sap_x402_paid_call instead of using a runtime-specific plugin.',
      content: formatJson({
        name: 'sap_x402_paid_call',
        arguments: {
          toolName: 'sap_list_all_agents',
          arguments: { limit: 5 },
          maxPriceUsd: 0.02,
          confirm: true,
        },
      }),
    },
  ];
}

/**
 * @name installX402PaidCallAddon
 * @description Installs a portable local addon bundle with manifest and client snippets.
 */
export function installX402PaidCallAddon(
  targetDir = join(homedir(), '.config', 'mcp-sap', 'addons', X402_PAID_CALL_ADDON_ID),
): McpClientAddonInstallResult {
  mkdirSync(targetDir, { recursive: true, mode: 0o700 });

  const manifestPath = join(targetDir, 'manifest.json');
  const readmePath = join(targetDir, 'README.md');
  const snippetsPath = join(targetDir, 'client-snippets.json');
  const files = [manifestPath, readmePath, snippetsPath];

  writeFileSync(manifestPath, formatJson({
    id: X402_PAID_CALL_ADDON_ID,
    name: 'SAP MCP x402 Paid Call',
    command: X402_PAID_CALL_COMMAND,
    toolName: 'x402_paid_call',
    localMcpToolName: 'sap_x402_paid_call',
    description: 'Local payment helper for hosted SAP MCP paid tools. It signs x402 payment payloads with the user-controlled SAP MCP profile signer.',
    security: {
      readsLocalKeypairFileForSigning: true,
      printsKeypairBytes: false,
      sendsKeypairBytesToHostedServer: false,
      requiresConfirm: true,
      requiresMaxPriceUsd: true,
    },
  }), { encoding: 'utf-8', mode: 0o600 });

  writeFileSync(readmePath, [
    '# SAP MCP x402 Paid Call Addon',
    '',
    'This addon lets local agent runtimes pay hosted SAP MCP x402 tool challenges without giving OOBE or the hosted server user keypair bytes.',
    '',
    'Use the command directly from a runtime-specific plugin wrapper:',
    '',
    '```bash',
    `${X402_PAID_CALL_COMMAND} --tool sap_list_all_agents --arguments '{"limit":5}' --max-usd 0.02 --confirm`,
    '```',
    '',
    'Or call the local SAP MCP tool `sap_x402_paid_call` when local stdio SAP MCP is available.',
    '',
    'Security rules:',
    '',
    '- keep keypair files under `~/.config/mcp-sap` or use a future external signing bridge;',
    '- never paste keypair bytes into agent config;',
    '- always set `maxPriceUsd` / `--max-usd`;',
    '- `confirm: true` / `--confirm` is required because a payment payload is signed.',
    '',
  ].join('\n'), { encoding: 'utf-8', mode: 0o600 });

  writeFileSync(snippetsPath, formatJson({
    snippets: createX402PaidCallAddonSnippets(),
  }), { encoding: 'utf-8', mode: 0o600 });

  return {
    addonId: X402_PAID_CALL_ADDON_ID,
    targetDir,
    files,
  };
}

/**
 * @name getKnownClientTargets
 * @description Returns known MCP client config paths for the current operating system.
 */
export function getKnownClientTargets(homeDir = homedir()): McpClientTarget[] {
  const targets: McpClientTarget[] = [
    {
      id: 'claude',
      label: 'Claude Desktop',
      path: join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
      format: 'json',
      exists: false,
    },
    {
      id: 'claude',
      label: 'Claude App Config',
      path: join(homeDir, 'Library', 'Application Support', 'Claude', 'config.json'),
      format: 'json',
      exists: false,
    },
    {
      id: 'hermes',
      label: 'Hermes Global MCP',
      path: join(homeDir, '.hermes', 'mcp.json'),
      format: 'json',
      exists: false,
    },
    {
      id: 'codex',
      label: 'Codex',
      path: join(homeDir, '.codex', 'config.toml'),
      format: 'toml',
      exists: false,
    },
    {
      id: 'openclaw',
      label: 'OpenClaw',
      path: join(homeDir, '.openclaw', 'config.yaml'),
      format: 'yaml',
      exists: false,
    },
    {
      id: 'openclaw',
      label: 'OpenClaw MCP',
      path: join(homeDir, '.openclaw', 'mcp.json'),
      format: 'json',
      exists: false,
    },
  ];

  const hermesProfilesDir = join(homeDir, '.hermes', 'profiles');
  if (existsSync(hermesProfilesDir)) {
    for (const profileName of readdirSync(hermesProfilesDir)) {
      const profileConfigPath = join(hermesProfilesDir, profileName, 'config.yaml');
      targets.push({
        id: 'hermes',
        label: `Hermes Profile: ${profileName}`,
        path: profileConfigPath,
        format: 'yaml',
        exists: false,
        profileName,
      });
    }
  }

  return targets.map((target) => ({
    ...target,
    exists: existsSync(target.path),
  }));
}

/**
 * @name discoverMcpClientTargets
 * @description Finds existing client config files and keeps create-capable standard targets.
 */
export function discoverMcpClientTargets(homeDir = homedir()): McpClientTarget[] {
  const targets = getKnownClientTargets(homeDir);
  return targets.filter((target) => {
    if (target.exists) {
      return true;
    }

    return target.path.endsWith('claude_desktop_config.json')
      || target.path.endsWith(join('.openclaw', 'mcp.json'));
  });
}

/**
 * @name findLegacySignals
 * @description Detects stale SAP MCP paths and hardcoded environment overrides.
 */
export function findLegacySignals(content: string): string[] {
  const findings: string[] = [];
  if (content.includes('.config/sap-mcp')) {
    findings.push('legacy config path "~/.config/sap-mcp"');
  }
  if (content.includes('.config/mcp-sap')) {
    findings.push('existing canonical path "~/.config/mcp-sap"');
  }

  for (const key of LEGACY_ENV_KEYS) {
    if (content.includes(key)) {
      findings.push(`hardcoded env override "${key}"`);
    }
  }

  return Array.from(new Set(findings));
}

/**
 * @name mergeEnv
 * @description Merges env variables while removing SAP MCP identity/network/wallet overrides.
 */
function mergeEnv(existing: unknown, required: Record<string, string>): Record<string, string> {
  const current = isRecord(existing) ? existing : {};
  const cleanEntries = Object.entries(current)
    .filter(([key, value]) => !LEGACY_ENV_KEYS.has(key) && typeof value === 'string') as Array<[string, string]>;

  return {
    ...Object.fromEntries(cleanEntries),
    ...required,
  };
}

/**
 * @name mergeServerConfig
 * @description Creates the final server object for JSON config files.
 */
function mergeServerConfig(existing: unknown, canonical: McpServerInjectionConfig, mode: McpClientInjectionMode): McpServerInjectionConfig {
  if (mode === 'override' || !isRecord(existing)) {
    return canonical;
  }

  return {
    command: canonical.command,
    args: canonical.args,
    cwd: canonical.cwd,
    env: mergeEnv(existing.env, canonical.env),
  };
}

/**
 * @name buildJsonContent
 * @description Builds a merged JSON MCP client config.
 */
function buildJsonContent(
  content: string,
  canonical: McpServerInjectionConfig,
  mode: McpClientInjectionMode
): { nextContent: string; hadSapConfig: boolean } {
  const parsed: unknown = content.trim() ? JSON.parse(content) : {};
  const root = isRecord(parsed) ? parsed : {};
  const serversRaw = root.mcpServers;
  const servers = isRecord(serversRaw) ? { ...serversRaw } : {};
  const hadSapConfig = isRecord(servers[SAP_SERVER_NAME]);
  servers[SAP_SERVER_NAME] = mergeServerConfig(servers[SAP_SERVER_NAME], canonical, mode);

  return {
    nextContent: formatJson({ ...root, mcpServers: servers }),
    hadSapConfig,
  };
}

/**
 * @name yamlServerBlock
 * @description Renders a Hermes/OpenClaw-compatible YAML MCP server block.
 */
function yamlServerBlock(canonical: McpServerInjectionConfig, baseIndent = 0): string[] {
  const indent = ' '.repeat(baseIndent);
  const child = ' '.repeat(baseIndent + 2);
  const grandchild = ' '.repeat(baseIndent + 4);
  const lines = [
    `${indent}${SAP_SERVER_NAME}:`,
    `${child}command: ${canonical.command}`,
    `${child}args:`,
  ];

  for (const arg of canonical.args) {
    lines.push(`${child}- ${arg}`);
  }

  if (canonical.cwd) {
    lines.push(`${child}cwd: ${canonical.cwd}`);
  }

  lines.push(`${child}env:`);
  for (const [key, value] of Object.entries(canonical.env)) {
    const rendered = value === 'false' || value === 'true' ? `"${value}"` : value;
    lines.push(`${grandchild}${key}: ${rendered}`);
  }

  return lines;
}

/**
 * @name countLeadingSpaces
 * @description Counts indentation spaces at the start of a YAML line.
 */
function countLeadingSpaces(line: string): number {
  return line.length - line.trimStart().length;
}

/**
 * @name replaceYamlSapBlock
 * @description Replaces a top-level mcp_servers.sap YAML block or appends one.
 */
function replaceYamlSapBlock(content: string, canonical: McpServerInjectionConfig): { nextContent: string; hadSapConfig: boolean } {
  const lines = content.split(/\r?\n/);
  const mcpIndex = lines.findIndex((line) => /^mcp_servers:\s*$/.test(line));

  if (mcpIndex === -1) {
    const prefix = content.trimEnd();
    const appended = ['mcp_servers:', ...yamlServerBlock(canonical, 2)].join('\n');
    return {
      nextContent: `${prefix ? `${prefix}\n` : ''}${appended}\n`,
      hadSapConfig: false,
    };
  }

  const sapIndex = lines.findIndex((line, index) => index > mcpIndex && /^ {2}sap:\s*$/.test(line));
  if (sapIndex === -1) {
    const nextLines = [...lines];
    nextLines.splice(mcpIndex + 1, 0, ...yamlServerBlock(canonical, 2));
    return {
      nextContent: `${nextLines.join('\n').replace(/\n*$/, '')}\n`,
      hadSapConfig: false,
    };
  }

  let endIndex = sapIndex + 1;
  while (endIndex < lines.length) {
    const line = lines[endIndex];
    if (line.trim() && countLeadingSpaces(line) <= 2) {
      break;
    }
    endIndex += 1;
  }

  const nextLines = [...lines];
  nextLines.splice(sapIndex, endIndex - sapIndex, ...yamlServerBlock(canonical, 2));
  return {
    nextContent: `${nextLines.join('\n').replace(/\n*$/, '')}\n`,
    hadSapConfig: true,
  };
}

/**
 * @name tomlServerBlock
 * @description Renders a Codex-compatible TOML MCP server block.
 */
function tomlServerBlock(canonical: McpServerInjectionConfig): string {
  const args = `[${canonical.args.map((arg) => JSON.stringify(arg)).join(', ')}]`;
  const lines = [
    `[mcp_servers.${SAP_SERVER_NAME}]`,
    `command = ${JSON.stringify(canonical.command)}`,
    `args = ${args}`,
  ];

  if (canonical.cwd) {
    lines.push(`cwd = ${JSON.stringify(canonical.cwd)}`);
  }

  lines.push('');
  lines.push(`[mcp_servers.${SAP_SERVER_NAME}.env]`);
  for (const [key, value] of Object.entries(canonical.env)) {
    lines.push(`${key} = ${JSON.stringify(value)}`);
  }

  return lines.join('\n');
}

/**
 * @name removeTomlSapSections
 * @description Removes existing Codex SAP MCP TOML sections before appending the canonical one.
 */
function removeTomlSapSections(content: string): { content: string; hadSapConfig: boolean } {
  const lines = content.split(/\r?\n/);
  const nextLines: string[] = [];
  let skipping = false;
  let hadSapConfig = false;
  const sapHeader = new RegExp(`^\\[mcp_servers\\.${escapeRegExp(SAP_SERVER_NAME)}(?:\\.|\\])`);

  for (const line of lines) {
    if (/^\[/.test(line)) {
      skipping = sapHeader.test(line);
      if (skipping) {
        hadSapConfig = true;
        continue;
      }
    }

    if (!skipping) {
      nextLines.push(line);
    }
  }

  return {
    content: nextLines.join('\n').replace(/\n*$/, ''),
    hadSapConfig,
  };
}

/**
 * @name buildTomlContent
 * @description Builds a merged TOML MCP client config.
 */
function buildTomlContent(content: string, canonical: McpServerInjectionConfig): { nextContent: string; hadSapConfig: boolean } {
  const stripped = removeTomlSapSections(content);
  const prefix = stripped.content.trimEnd();
  return {
    nextContent: `${prefix ? `${prefix}\n\n` : ''}${tomlServerBlock(canonical)}\n`,
    hadSapConfig: stripped.hadSapConfig,
  };
}

/**
 * @name summarizeContent
 * @description Produces a short safe summary for wizard preview output.
 */
function summarizeContent(target: McpClientTarget, content: string, hadSapConfig: boolean): string {
  if (!target.exists) {
    return 'new file';
  }

  const findings = findLegacySignals(content);
  const parts = [hadSapConfig ? 'SAP MCP entry present' : 'no SAP MCP entry'];
  if (findings.length > 0) {
    parts.push(`${findings.length} warning(s)`);
  }

  return parts.join(', ');
}

/**
 * @name planMcpClientInjection
 * @description Creates a write plan with preview metadata but does not modify files.
 */
export function planMcpClientInjection(
  target: McpClientTarget,
  canonical: McpServerInjectionConfig,
  mode: McpClientInjectionMode
): McpClientInjectionPlan {
  const content = readTargetContent(target);
  const legacyFindings = findLegacySignals(content);
  const built = target.format === 'json'
    ? buildJsonContent(content, canonical, mode)
    : target.format === 'toml'
      ? buildTomlContent(content, canonical)
      : replaceYamlSapBlock(content, canonical);

  const backupPath = target.exists
    ? `${target.path}.bak-${Date.now()}`
    : undefined;

  return {
    target,
    mode,
    exists: target.exists,
    hadSapConfig: built.hadSapConfig,
    legacyFindings,
    beforeSummary: summarizeContent(target, content, built.hadSapConfig),
    afterSummary: 'SAP MCP follows ~/.config/mcp-sap/.active-profile with env overrides disabled',
    nextContent: built.nextContent,
    backupPath,
  };
}

/**
 * @name applyMcpClientInjection
 * @description Applies a previously reviewed MCP client injection plan.
 */
export function applyMcpClientInjection(plan: McpClientInjectionPlan): McpClientInjectionResult {
  mkdirSync(dirname(plan.target.path), { recursive: true, mode: 0o700 });
  if (plan.target.exists && existsSync(plan.target.path) && plan.backupPath) {
    writeFileSync(plan.backupPath, readFileSync(plan.target.path, 'utf-8'), {
      encoding: 'utf-8',
      mode: 0o600,
    });
  }

  writeFileSync(plan.target.path, plan.nextContent, {
    encoding: 'utf-8',
    mode: 0o600,
  });

  return {
    target: plan.target,
    mode: plan.mode,
    written: true,
    backupPath: plan.backupPath,
    message: plan.hadSapConfig
      ? `Updated existing SAP MCP config in ${plan.target.label}`
      : `Added SAP MCP config to ${plan.target.label}`,
  };
}
