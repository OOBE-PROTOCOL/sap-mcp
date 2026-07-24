/**
 * @name tui/wizard-save
 * @description TUI wizard configuration persistence — saves profiles, generates keypairs, and writes config files.
 *
 * @flow
 *   1. `saveTuiWizardConfig` takes wizard input, normalizes the profile name, and optionally
 *      generates a new Solana keypair (saved to disk with restrictive permissions).
 *   2. Writes the full SAP MCP config JSON to the profile config path.
 *   3. Sets the active profile marker file.
 *   4. Returns the config path, wallet path, and agent public key.
 *
 * @module tui/wizard-save
 */

import { existsSync, mkdirSync, writeFileSync, chmodSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { Keypair } from '@solana/web3.js';

/** @description Regex pattern validating normalized profile names (lowercase alphanumeric with hyphens). */
const PROFILE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * @name TuiWizardConfig
 * @description Configuration data collected by the TUI wizard for a new profile.
 *
 * @property profileName     — Desired profile name (will be normalized).
 * @property mode            — SAP MCP operational mode string.
 * @property rpcUrl          — Solana RPC URL for on-chain interaction.
 * @property walletPath      — Optional path to an existing keypair file.
 * @property createNewWallet — Whether to generate a new keypair for this profile.
 * @property maxTxValueSol   — Maximum transaction value in SOL.
 * @property dailyLimitSol   — Daily spending limit in SOL.
 * @property enableBento     — Whether to enable Bento integration.
 * @property bentoApiKey     — Optional Bento API key.
 * @property bentoAgentId    — Optional Bento agent ID.
 * @property logLevel        — Logging level string.
 * @property enableMetrics   — Whether to enable metrics collection.
 *
 * @usedBy `saveTuiWizardConfig`
 */
export interface TuiWizardConfig {
  profileName: string;
  mode: string;
  rpcUrl: string;
  walletPath?: string;
  createNewWallet?: boolean;
  maxTxValueSol: number;
  dailyLimitSol: number;
  enableBento: boolean;
  bentoApiKey?: string;
  bentoAgentId?: string;
  logLevel: string;
  enableMetrics: boolean;
}

/**
 * @name TuiWizardSaveResult
 * @description Result of saving a TUI wizard configuration.
 *
 * @property configPath    — Filesystem path to the written config JSON.
 * @property walletPath    — Optional path to the keypair file used or created.
 * @property walletCreated — Whether a new keypair was generated.
 * @property agentPubkey   — Optional base58 public key of the agent's wallet.
 *
 * @usedBy TUI wizard save flow.
 */
export interface TuiWizardSaveResult {
  configPath: string;
  walletPath?: string;
  walletCreated: boolean;
  agentPubkey?: string;
}

/**
 * @name preferredConfigDir
 * @description Returns the preferred configuration directory for SAP MCP profiles.
 *
 * Respects `XDG_CONFIG_HOME` on Linux, `%APPDATA%` on Windows, and `~/.config` on macOS.
 *
 * @returns Absolute path to the config directory.
 *
 * @usedBy `saveTuiWizardConfig`, `defaultWalletPath`, `profileConfigPath`.
 */
export function preferredConfigDir(): string {
  if (process.env.XDG_CONFIG_HOME) {
    return join(process.env.XDG_CONFIG_HOME, 'mcp-sap');
  }

  if (process.platform === 'win32') {
    return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'mcp-sap');
  }

  return join(homedir(), '.config', 'mcp-sap');
}

/**
 * @name defaultWalletPath
 * @description Returns the default keypair file path for a given profile name.
 *
 * @param profileName — Normalized profile name.
 * @returns Absolute path to the keypair JSON file.
 *
 * @usedBy `saveTuiWizardConfig`.
 */
export function defaultWalletPath(profileName: string): string {
  return join(preferredConfigDir(), 'keypairs', `${normalizeProfileName(profileName)}-keypair.json`);
}

/**
 * @name profileConfigPath
 * @description Resolves the config file path for a normalized profile name.
 *
 * @param profileName — Profile name to resolve (will be normalized).
 * @returns Absolute path to the profile config JSON file.
 *
 * @usedBy `saveTuiWizardConfig`.
 */
export function profileConfigPath(profileName: string): string {
  const normalized = normalizeProfileName(profileName);
  return join(preferredConfigDir(), `config-${normalized}.json`);
}

/**
 * @name normalizeProfileName
 * @description Normalizes a profile name to lowercase alphanumeric with single hyphens.
 *
 * Trims, lowercases, replaces non-alphanumeric sequences with hyphens, and strips
 * leading/trailing hyphens.
 *
 * @param value — Raw profile name string from user input.
 * @returns Normalized profile name string.
 *
 * @usedBy `defaultWalletPath`, `profileConfigPath`, `saveTuiWizardConfig`.
 */
export function normalizeProfileName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * @name isValidProfileName
 * @description Returns `true` when a normalized profile name is safe for config and wallet paths.
 *
 * Rejects empty names, names that don't match the profile pattern, and the reserved name `default`.
 *
 * @param value — Normalized profile name to validate.
 * @returns `true` if the name is valid, `false` otherwise.
 *
 * @usedBy `saveTuiWizardConfig`.
 */
export function isValidProfileName(value: string): boolean {
  return PROFILE_NAME_PATTERN.test(value) && value !== 'default';
}

/**
 * @name normalizeTuiPath
 * @description Expands home-relative paths (`~` and `~/`) entered in the TUI wizard.
 *
 * @param value — Raw path string from user input.
 * @returns Expanded absolute path, or `undefined` if input was empty.
 *
 * @internal
 */
function normalizeTuiPath(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value === '~') {
    return homedir();
  }

  if (value.startsWith('~/')) {
    return join(homedir(), value.slice(2));
  }

  return value;
}

/**
 * @name readAgentPubkey
 * @description Reads the public key from a local Solana keypair file.
 *
 * @param walletPath — Optional path to the keypair JSON file.
 * @returns Base58-encoded public key string, or `undefined` if the file doesn't exist or is invalid.
 *
 * @internal
 */
function readAgentPubkey(walletPath: string | undefined): string | undefined {
  if (!walletPath || !existsSync(walletPath)) {
    return undefined;
  }

  const parsed: unknown = JSON.parse(readFileSync(walletPath, 'utf-8'));
  if (!Array.isArray(parsed) || parsed.length !== 64 || !parsed.every((item) => Number.isInteger(item))) {
    return undefined;
  }

  return Keypair.fromSecretKey(Uint8Array.from(parsed as number[])).publicKey.toBase58();
}

/**
 * @name saveTuiWizardConfig
 * @description Saves a TUI wizard configuration to disk, optionally generating a new keypair.
 *
 * @param config — TUI wizard configuration data from user input.
 * @returns Result containing the config path, wallet path, whether a wallet was created, and agent public key.
 * @throws If the profile name is invalid or if file I/O fails.
 *
 * @usedBy TUI wizard save flow.
 */
export function saveTuiWizardConfig(config: TuiWizardConfig): TuiWizardSaveResult {
  const configDir = preferredConfigDir();
  const keypairsDir = join(configDir, 'keypairs');
  mkdirSync(keypairsDir, { recursive: true, mode: 0o700 });

  const profileName = normalizeProfileName(config.profileName);
  if (!isValidProfileName(profileName)) {
    throw new Error('Profile name is required, cannot be "default", and may contain lowercase letters, numbers, and single hyphens between words.');
  }

  const walletPath = config.createNewWallet ? defaultWalletPath(profileName) : normalizeTuiPath(config.walletPath);
  const walletCreated = Boolean(config.createNewWallet && walletPath && !existsSync(walletPath));

  if (config.createNewWallet && walletPath && !existsSync(walletPath)) {
    const keypair = Keypair.generate();
    mkdirSync(dirname(walletPath), { recursive: true, mode: 0o700 });
    writeFileSync(walletPath, JSON.stringify(Array.from(keypair.secretKey)), {
      encoding: 'utf-8',
      mode: 0o600,
    });
    chmodSync(walletPath, 0o600);
  }

  const now = new Date().toISOString();
  const configPath = profileConfigPath(profileName);
  const agentPubkey = readAgentPubkey(walletPath);
  const fileConfig = {
    mode: config.mode,
    rpcUrl: config.rpcUrl,
    commitment: 'confirmed',
    programId: 'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ',
    maxRetries: 3,
    retryDelayMs: 1000,
    agentPubkey,
    walletPath,
    walletEncrypted: false,
    enableHttp: config.mode === 'hosted-api',
    httpPort: 8787,
    httpHost: '127.0.0.1',
    maxTxValueSol: config.maxTxValueSol,
    requireApprovalAboveSol: Math.min(1, config.maxTxValueSol || 1),
    dailyLimitSol: config.dailyLimitSol,
    allowedTools: 'all',
    logLevel: config.logLevel,
    logFormat: 'pretty',
    enableMetrics: config.enableMetrics,
    metricsPort: 9090,
    enableCache: true,
    cacheTtlSeconds: 300,
    enableRateLimit: true,
    rateLimitPerMinute: 60,
    bento: {
      enabled: config.enableBento,
      apiKey: config.enableBento ? config.bentoApiKey : undefined,
      agentId: config.enableBento ? config.bentoAgentId : undefined,
    },
    policy: {
      mode: config.enableBento ? 'hybrid' : 'local-only',
      failOpen: false,
      logging: true,
    },
    $meta: {
      version: '1.0.0',
      createdAt: now,
      updatedAt: now,
      lastHash: '',
    },
  };

  writeFileSync(configPath, JSON.stringify(fileConfig, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });

  writeFileSync(join(configDir, '.active-profile'), profileName, {
    encoding: 'utf-8',
    mode: 0o600,
  });

  return { configPath, walletPath, walletCreated, agentPubkey };
}