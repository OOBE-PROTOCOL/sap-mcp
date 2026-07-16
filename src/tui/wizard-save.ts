import { existsSync, mkdirSync, writeFileSync, chmodSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { Keypair } from '@solana/web3.js';

const PROFILE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Contract describing tui wizard config data used by the SAP MCP runtime.
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
 * Contract describing tui wizard save result data used by the SAP MCP runtime.
 */
export interface TuiWizardSaveResult {
  configPath: string;
  walletPath?: string;
  walletCreated: boolean;
  agentPubkey?: string;
}

/**
 * Executes the preferred config dir operation.
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
 * Executes the default wallet path operation.
 */
export function defaultWalletPath(profileName: string): string {
  return join(preferredConfigDir(), 'keypairs', `${normalizeProfileName(profileName)}-keypair.json`);
}

/**
 * Resolves the config file path for a profile name.
 */
export function profileConfigPath(profileName: string): string {
  const normalized = normalizeProfileName(profileName);
  return join(preferredConfigDir(), `config-${normalized}.json`);
}

/**
 * Normalizes profile names accepted by the TUI wizard.
 */
export function normalizeProfileName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Returns true when a normalized profile name is safe for config and wallet paths.
 */
export function isValidProfileName(value: string): boolean {
  return PROFILE_NAME_PATTERN.test(value) && value !== 'default';
}

/**
 * Expands home-relative paths entered in the TUI wizard.
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
 * Reads the public key from a local Solana keypair file.
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
 * Executes the save tui wizard config operation.
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
