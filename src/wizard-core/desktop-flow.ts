import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { defaults } from '../config/defaults.js';
import { defaultGeneratedWalletPath, getPreferredConfigDir } from '../config/paths.js';
import { saveWizardSetup, type WizardSetupInput, type WizardSetupResult } from '../config/setup.js';
import {
  discoverMcpClientTargets,
  installCodexHostedPaymentBridgeConfig,
  installHostedPaymentBridgeConfigs,
  installX402PaidCallAddon,
  type McpClientTarget,
} from '../config/mcp-client-injection.js';
import type { SapMcpMode } from '../config/env.js';

/**
 * @name DesktopRuntimeId
 * @description Agent runtimes supported by the desktop wizard runtime setup screen.
 */
export type DesktopRuntimeId = 'codex' | 'claude' | 'hermes' | 'openclaw';

/**
 * @name DesktopWizardDraft
 * @description Serializable setup draft collected by the desktop wizard renderer.
 */
export interface DesktopWizardDraft {
  setupMode: 'full' | 'payments-only';
  profileName: string;
  mode: SapMcpMode;
  rpcUrl: string;
  createNewWallet: boolean;
  walletPath?: string;
  maxTxValueSol: number;
  dailyLimitSol: number;
  enableBento: boolean;
  bentoApiKey?: string;
  bentoAgentId?: string;
  logLevel: WizardSetupInput['logLevel'];
  enableMetrics: boolean;
  configureCodex: boolean;
  configureRuntimes: DesktopRuntimeId[];
  installAddonBundle: boolean;
}

/**
 * @name DesktopWizardRuntimeStatus
 * @description Safe runtime config target metadata shown by the desktop wizard.
 */
export interface DesktopWizardRuntimeStatus {
  id: DesktopRuntimeId;
  label: string;
  detected: boolean;
  paths: string[];
  autoConfigurable: boolean;
  recommendation: string;
}

/**
 * @name DesktopProfileStatus
 * @description Safe local SAP MCP profile metadata shown by the desktop wizard without reading wallet bytes.
 */
export interface DesktopProfileStatus {
  name: string;
  path: string;
  active: boolean;
  mode?: SapMcpMode;
  rpcUrl?: string;
  network?: string;
  agentPubkey?: string;
  walletPath?: string;
  walletExists: boolean;
}

/**
 * @name DesktopWizardResult
 * @description Result returned after the desktop wizard saves profile and runtime integration state.
 */
export interface DesktopWizardResult {
  setup?: WizardSetupResult;
  setupMode: DesktopWizardDraft['setupMode'];
  runtimeActions: Array<{
    runtime: string;
    status: 'configured' | 'installed' | 'skipped';
    path?: string;
    backupPath?: string;
    message: string;
  }>;
}

/**
 * @name normalizeDesktopProfileName
 * @description Produces a safe suggested profile name while preserving validation in saveWizardSetup.
 */
export function normalizeDesktopProfileName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/**
 * @name createDefaultDesktopWizardDraft
 * @description Creates the hosted-first desktop wizard draft used by GUI and future TUI flows.
 */
export function createDefaultDesktopWizardDraft(): DesktopWizardDraft {
  const profileName = 'my-sap-agent';
  return {
    profileName,
    mode: 'hosted-api',
    rpcUrl: defaults.rpcUrl,
    createNewWallet: true,
    walletPath: defaultGeneratedWalletPath(profileName),
    maxTxValueSol: 1,
    dailyLimitSol: 10,
    enableBento: false,
    logLevel: 'info',
    enableMetrics: false,
    setupMode: 'full',
    configureCodex: true,
    configureRuntimes: ['codex'],
    installAddonBundle: true,
  };
}

/**
 * @name getDesktopRuntimeStatuses
 * @description Summarizes local runtime config files without exposing secret material.
 */
export function getDesktopRuntimeStatuses(homeDir?: string): DesktopWizardRuntimeStatus[] {
  const targets = discoverMcpClientTargets(homeDir);
  const byRuntime = new Map<DesktopRuntimeId, McpClientTarget[]>();
  for (const target of targets) {
    const id = target.id as DesktopRuntimeId;
    byRuntime.set(id, [...(byRuntime.get(id) ?? []), target]);
  }

  return [
    {
      id: 'codex',
      label: 'Codex',
      detected: Boolean(byRuntime.get('codex')?.length),
      paths: byRuntime.get('codex')?.map((target) => target.path) ?? [],
      autoConfigurable: true,
      recommendation: 'Recommended: hosted SAP MCP plus local sap_payments bridge.',
    },
    {
      id: 'claude',
      label: 'Claude',
      detected: Boolean(byRuntime.get('claude')?.length),
      paths: byRuntime.get('claude')?.map((target) => target.path) ?? [],
      autoConfigurable: true,
      recommendation: 'Hosted SAP MCP plus local sap_payments bridge in Claude Desktop JSON.',
    },
    {
      id: 'hermes',
      label: 'Hermes',
      detected: Boolean(byRuntime.get('hermes')?.length),
      paths: byRuntime.get('hermes')?.map((target) => target.path) ?? [],
      autoConfigurable: true,
      recommendation: 'Hosted SAP MCP plus local sap_payments bridge in Hermes global/profile config.',
    },
    {
      id: 'openclaw',
      label: 'OpenClaw',
      detected: Boolean(byRuntime.get('openclaw')?.length),
      paths: byRuntime.get('openclaw')?.map((target) => target.path) ?? [],
      autoConfigurable: true,
      recommendation: 'Hosted SAP MCP plus local sap_payments bridge in OpenClaw MCP JSON.',
    },
  ];
}

/**
 * @name getDesktopProfileStatuses
 * @description Lists local SAP MCP config profiles without loading or exposing keypair material.
 */
export function getDesktopProfileStatuses(homeDir?: string): DesktopProfileStatus[] {
  const configDir = homeDir ? join(homeDir, '.config', 'mcp-sap') : getPreferredConfigDir();
  if (!existsSync(configDir)) {
    return [];
  }

  const activeProfile = readActiveDesktopProfile(configDir);
  const profiles: DesktopProfileStatus[] = [];
  for (const file of readdirSync(configDir)) {
    const profileName = profileNameFromConfigFile(file);
    if (!profileName) {
      continue;
    }

    const profilePath = join(configDir, file);
    const config = readJsonObject(profilePath);
    const walletPath = readStringField(config, 'walletPath');
    const rpcUrl = readStringField(config, 'rpcUrl');
    const mode = readModeField(config, 'mode');

    profiles.push({
      name: profileName,
      path: profilePath,
      active: profileName === activeProfile,
      mode,
      rpcUrl,
      network: networkFromRpcUrl(rpcUrl),
      agentPubkey: readStringField(config, 'agentPubkey'),
      walletPath,
      walletExists: Boolean(walletPath && existsSync(walletPath)),
    });
  }

  profiles.sort((a, b) => {
    if (a.active) return -1;
    if (b.active) return 1;
    return a.name.localeCompare(b.name);
  });
  return profiles;
}

function profileNameFromConfigFile(file: string): string | undefined {
  if (file === 'config.json') {
    return 'default';
  }
  if (file.startsWith('config-') && file.endsWith('.json')) {
    return file.slice('config-'.length, -'.json'.length);
  }
  return undefined;
}

function readActiveDesktopProfile(configDir: string): string {
  const activePath = join(configDir, '.active-profile');
  if (!existsSync(activePath)) {
    return 'default';
  }
  try {
    return readFileSync(activePath, 'utf-8').trim() || 'default';
  } catch {
    return 'default';
  }
}

function readJsonObject(path: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function readStringField(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readModeField(record: Record<string, unknown>, field: string): SapMcpMode | undefined {
  const value = readStringField(record, field);
  if (
    value === 'readonly'
    || value === 'local-dev-keypair'
    || value === 'external-signer'
    || value === 'delegated-session'
    || value === 'hosted-api'
  ) {
    return value;
  }
  return undefined;
}

function networkFromRpcUrl(rpcUrl?: string): string | undefined {
  if (!rpcUrl) {
    return undefined;
  }
  if (rpcUrl.includes('devnet')) {
    return 'devnet';
  }
  if (rpcUrl.includes('testnet')) {
    return 'testnet';
  }
  return 'mainnet-beta';
}

/**
 * @name validateDesktopWizardDraft
 * @description Returns actionable validation errors before persistence.
 */
export function validateDesktopWizardDraft(draft: DesktopWizardDraft): string[] {
  const errors: string[] = [];
  if (draft.setupMode === 'payments-only') {
    if (draft.configureRuntimes.length === 0 && !draft.configureCodex && !draft.installAddonBundle) {
      errors.push('Choose at least one runtime or install the local bridge reference bundle.');
    }
    return errors;
  }

  const profileName = normalizeDesktopProfileName(draft.profileName);
  if (!profileName || profileName === 'default') {
    errors.push('Choose a named profile such as solking-agent. The desktop wizard does not create ambiguous default profiles.');
  }
  if (!draft.rpcUrl.startsWith('https://') && !draft.rpcUrl.startsWith('http://')) {
    errors.push('RPC URL must start with http:// or https://.');
  }
  if (!draft.createNewWallet && !draft.walletPath) {
    errors.push('Provide a wallet path or choose to create a dedicated SAP MCP wallet.');
  }
  if (!Number.isFinite(draft.maxTxValueSol) || draft.maxTxValueSol <= 0) {
    errors.push('Max transaction value must be greater than zero.');
  }
  if (!Number.isFinite(draft.dailyLimitSol) || draft.dailyLimitSol <= 0) {
    errors.push('Daily limit must be greater than zero.');
  }
  if (draft.enableBento && !draft.bentoApiKey && !draft.bentoAgentId) {
    errors.push('Bento Guard is enabled. Add a Bento API key or agent ID, or disable Bento for now.');
  }
  return errors;
}

/**
 * @name saveDesktopWizardDraft
 * @description Persists a desktop wizard draft and installs selected runtime integrations.
 */
export async function saveDesktopWizardDraft(
  draft: DesktopWizardDraft,
  homeDir?: string,
  platform: NodeJS.Platform = process.platform,
): Promise<DesktopWizardResult> {
  const errors = validateDesktopWizardDraft(draft);
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  const profileName = normalizeDesktopProfileName(draft.profileName);
  const setup = draft.setupMode === 'full'
    ? await saveWizardSetup({
      mode: draft.mode,
      rpcUrl: draft.rpcUrl,
      profileName,
      walletPath: draft.walletPath,
      createNewWallet: draft.createNewWallet,
      maxTxValueSol: draft.maxTxValueSol,
      dailyLimitSol: draft.dailyLimitSol,
      enableBento: draft.enableBento,
      bentoApiKey: draft.bentoApiKey,
      bentoAgentId: draft.bentoAgentId,
      enableHttp: false,
      logLevel: draft.logLevel,
      enableMetrics: draft.enableMetrics,
    })
    : undefined;

  const runtimeActions: DesktopWizardResult['runtimeActions'] = [];
  const selectedRuntimes = new Set<DesktopRuntimeId>(draft.configureRuntimes);
  if (draft.configureCodex) {
    selectedRuntimes.add('codex');
  }

  for (const result of installHostedPaymentBridgeConfigs(Array.from(selectedRuntimes), homeDir, platform)) {
    runtimeActions.push({
      runtime: result.target.label,
      status: 'configured',
      path: result.target.path,
      backupPath: result.backupPath,
      message: result.message,
    });
  }

  if (runtimeActions.length === 0 && draft.setupMode === 'full') {
    const codex = installCodexHostedPaymentBridgeConfig(homeDir, platform);
    runtimeActions.push({
      runtime: 'Codex',
      status: 'configured',
      path: codex.target.path,
      backupPath: codex.backupPath,
      message: codex.message,
    });
  }

  if (draft.installAddonBundle) {
    const addon = installX402PaidCallAddon(homeDir ? join(homeDir, '.config', 'mcp-sap', 'addons', 'x402-paid-call') : undefined);
    runtimeActions.push({
      runtime: 'SAP MCP payment bridge bundle',
      status: 'installed',
      path: addon.targetDir,
      message: `Installed ${addon.addonId} reference bundle.`,
    });
  }

  return { setup, setupMode: draft.setupMode, runtimeActions };
}
