import { existsSync, writeFileSync, chmodSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';
import { Keypair } from '@solana/web3.js';
import { type FullConfig } from './secure-config.js';
import { defaultGeneratedWalletPath, ensureConfigDirectories } from './paths.js';
import { defaults } from './defaults.js';
import type { SapMcpMode } from './env.js';
import { getProfileConfigPath, loadProfileConfig, saveProfileConfig, setActiveProfile } from './profiles.js';

type LogLevel = FullConfig['logLevel'];
const PROFILE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Raw answers collected by the CLI or TUI setup wizard before persistence.
 */
export interface WizardSetupInput {
  mode: SapMcpMode;
  rpcUrl: string;
  profileName?: string;  // Profile name for wallet path
  walletPath?: string;
  createNewWallet?: boolean;
  externalSignerUrl?: string;
  maxTxValueSol: number;
  dailyLimitSol: number;
  enableBento: boolean;
  bentoApiKey?: string;
  bentoAgentId?: string;
  enableHttp?: boolean;
  httpPort?: number;
  logLevel: LogLevel;
  enableMetrics: boolean;
}

function parseWizardMode(mode: string): SapMcpMode {
  if (
    mode === 'readonly'
    || mode === 'local-dev-keypair'
    || mode === 'external-signer'
    || mode === 'delegated-session'
    || mode === 'hosted-api'
  ) {
    return mode;
  }

  throw new Error(`Unsupported SAP MCP mode: ${mode}`);
}

function parseLogLevel(logLevel: string): LogLevel {
  if (logLevel === 'debug' || logLevel === 'info' || logLevel === 'warn' || logLevel === 'error') {
    return logLevel;
  }

  throw new Error(`Unsupported SAP MCP log level: ${logLevel}`);
}

/**
 * Normalizes and validates wizard profile names before they are used for file paths.
 */
function resolveWizardProfileName(profileName: string | undefined): string {
  const normalized = profileName?.trim().toLowerCase();
  if (!normalized) {
    throw new Error('Profile name is required. Use a descriptive name such as "gianni-market-nft-agent".');
  }

  if (normalized === 'default') {
    throw new Error('The wizard requires a named profile. Use a descriptive name instead of "default".');
  }

  if (!PROFILE_NAME_PATTERN.test(normalized)) {
    throw new Error('Profile name may contain lowercase letters, numbers, and single hyphens between words.');
  }

  return normalized;
}

/**
 * Expands user-friendly wallet paths before saving them into profile config.
 */
function normalizeWizardPath(path: string | undefined): string | undefined {
  if (!path) {
    return undefined;
  }

  if (path === '~') {
    return homedir();
  }

  if (path.startsWith('~/')) {
    return join(homedir(), path.slice(2));
  }

  return path;
}

/**
 * Result returned after the wizard writes config and optional wallet material.
 */
export interface WizardSetupResult {
  config: FullConfig;
  configPath: string;
  walletPath?: string;
  walletCreated: boolean;
}

/**
 * Writes a new dedicated Solana keypair if the target wallet path does not already exist.
 */
function writeGeneratedWallet(walletPath: string): void {
  if (existsSync(walletPath)) {
    return;
  }

  mkdirSync(dirname(walletPath), { recursive: true, mode: 0o700 });

  const keypair = Keypair.generate();
  writeFileSync(walletPath, JSON.stringify(Array.from(keypair.secretKey)), {
    encoding: 'utf-8',
    mode: 0o600,
  });
  chmodSync(walletPath, 0o600);
}

/**
 * Converts wizard answers into a complete, schema-valid runtime config object.
 */
export function buildWizardConfig(input: WizardSetupInput): FullConfig {
  const now = new Date().toISOString();
  const mode = parseWizardMode(input.mode);
  const logLevel = parseLogLevel(input.logLevel);
  const profileName = resolveWizardProfileName(input.profileName);
  const walletPath = input.createNewWallet
    ? defaultGeneratedWalletPath(profileName)
    : normalizeWizardPath(input.walletPath);

  return {
    mode,
    rpcUrl: input.rpcUrl,
    commitment: defaults.commitment,
    programId: defaults.programId,
    maxRetries: defaults.maxRetries,
    retryDelayMs: defaults.retryDelayMs,
    walletPath,
    walletEncrypted: false,
    externalSignerUrl: input.externalSignerUrl,
    externalSignerTimeoutMs: defaults.externalSignerTimeoutMs,
    enableHttp: input.enableHttp ?? mode === 'hosted-api',
    httpPort: input.httpPort ?? defaults.httpPort,
    httpHost: defaults.httpHost,
    maxTxValueSol: input.maxTxValueSol,
    requireApprovalAboveSol: Math.min(defaults.requireApprovalAboveSol, input.maxTxValueSol || defaults.requireApprovalAboveSol),
    dailyLimitSol: input.dailyLimitSol,
    allowedTools: 'all',
    logLevel,
    logFormat: defaults.logFormat,
    enableMetrics: input.enableMetrics,
    metricsPort: defaults.metricsPort,
    enableCache: defaults.enableCache,
    cacheTtlSeconds: defaults.cacheTtlSeconds,
    enableRateLimit: defaults.enableRateLimit,
    rateLimitPerMinute: defaults.rateLimitPerMinute,
    bento: {
      enabled: input.enableBento,
      apiKey: input.enableBento ? input.bentoApiKey : undefined,
      agentId: input.enableBento ? input.bentoAgentId : undefined,
    },
    policy: {
      mode: input.enableBento ? 'hybrid' : 'local-only',
      failOpen: false,
      logging: true,
    },
    $security: {
      requireApprovalFor: ['mode', 'walletPath', 'externalSignerUrl', 'maxTxValueSol', 'dailyLimitSol'],
      approvalTimeout: 300,
      maxChangesPerDay: 10,
      requireMultiSig: false,
    },
    $audit: {
      enabled: true,
      retentionDays: 90,
      submitToOracle: false,
    },
    $meta: {
      version: '1.0.0',
      createdAt: now,
      updatedAt: now,
      lastHash: '',
    },
  };
}

/**
 * Persists wizard output to the preferred config directory and creates a dedicated wallet when requested.
 */
export async function saveWizardSetup(input: WizardSetupInput): Promise<WizardSetupResult> {
  ensureConfigDirectories();

  const profileName = resolveWizardProfileName(input.profileName);
  const walletPath = input.createNewWallet
    ? defaultGeneratedWalletPath(profileName)
    : normalizeWizardPath(input.walletPath);

  const walletCreated = Boolean(input.createNewWallet && walletPath && !existsSync(walletPath));
  if (input.createNewWallet && walletPath) {
    writeGeneratedWallet(walletPath);
  }

  const config = buildWizardConfig({ ...input, walletPath });
  
  // Extract and store agent pubkey
  if (walletPath && existsSync(walletPath)) {
    try {
      const { loadKeypairFromFile } = await import('../signer/load-keypair.js');
      const keypair = loadKeypairFromFile(walletPath);
      config.agentPubkey = keypair.publicKey.toBase58();
    } catch (error) {
      console.warn('Could not load pubkey from wallet:', error instanceof Error ? error.message : error);
    }
  }
  
  await saveProfileConfig(profileName, config);
  setActiveProfile(profileName);

  const savedConfig = loadProfileConfig(profileName) ?? config;

  return {
    config: savedConfig,
    configPath: getProfileConfigPath(profileName),
    walletPath,
    walletCreated,
  };
}
