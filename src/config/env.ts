/**
 * SAP MCP Server - Configuration Module
 * 
 * Enterprise-grade configuration management with:
 * - Environment variable validation via Zod
 * - Config file support (JSON/YAML)
 * - User-specific paths (~/.config/mcp-sap/)
 * - Multi-environment support (dev, staging, prod)
 * - Secure defaults with explicit overrides
 */

import { z } from 'zod';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import {
  ensureConfigDirectories,
  getConfigDir as getCanonicalConfigDir,
  getDataDir as getCanonicalDataDir,
} from './paths.js';
import {
  getActiveProfile,
  getProfileConfigPath,
} from './profiles.js';

// ESM compatibility: __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Configuration Schema
// ============================================================================

const modeSchema = z.enum([
  'readonly',
  'local-dev-keypair',
  'external-signer',
  'delegated-session',
  'hosted-api'
]);

const commitmentSchema = z.enum(['processed', 'confirmed', 'finalized']);
const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
const monetizationProviderSchema = z.enum(['x402', 'pay-sh']);
const booleanEnvSchema = z.preprocess((value: unknown) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
  }
  return value;
}, z.boolean());

/**
 * Zod schema for environment-driven configuration.
 */
export const envSchema = z.object({
  // Profile/config pointer. Prefer this in MCP client YAML instead of duplicating RPC/wallet values.
  SAP_MCP_PROFILE: z.string().optional(),
  SAP_MCP_CONFIG_PATH: z.string().optional(),
  SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE: booleanEnvSchema.default(false),

  // Server Mode
  SAP_MCP_MODE: modeSchema.default('readonly'),
  
  // Solana RPC (support both SAP_RPC_URL and SAP_MCP_RPC_URL for compatibility)
  SAP_MCP_RPC_URL: z.string().url().optional(),  // Alias for SAP_RPC_URL
  SAP_RPC_URL: z.string().url().default('https://api.mainnet-beta.solana.com'),
  SAP_RPC_URL_DEVNET: z.string().url().optional(),
  SAP_RPC_URL_TESTNET: z.string().url().optional(),
  
  // SAP Program
  SAP_PROGRAM_ID: z.string().default('SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ'),
  
  // Commitment & Performance
  SAP_COMMITMENT: commitmentSchema.default('confirmed'),
  SAP_MAX_RETRIES: z.coerce.number().positive().default(3),
  SAP_RETRY_DELAY_MS: z.coerce.number().positive().default(1000),
  
  // Signer Configuration
  SAP_WALLET_PATH: z.string().optional(),
  SAP_WALLET_ENCRYPTED: booleanEnvSchema.default(false),
  SAP_WALLET_PASSPHRASE_ENV: z.string().optional(),
  
  // External Signer (for external-signer mode)
  SAP_EXTERNAL_SIGNER_URL: z.string().url().optional(),
  SAP_EXTERNAL_SIGNER_TIMEOUT_MS: z.coerce.number().positive().default(30000),
  
  // HTTP Transport (for hosted-api mode)
  SAP_ENABLE_HTTP: booleanEnvSchema.default(false),
  SAP_HTTP_PORT: z.coerce.number().positive().default(8787),
  SAP_HTTP_HOST: z.string().default('127.0.0.1'),
  SAP_HTTP_CORS_ORIGINS: z.string().optional(), // comma-separated
  
  // Security & Policies
  SAP_MAX_TX_VALUE_SOL: z.coerce.number().nonnegative().default(10),
  SAP_REQUIRE_APPROVAL_ABOVE_SOL: z.coerce.number().nonnegative().default(1),
  SAP_DAILY_LIMIT_SOL: z.coerce.number().nonnegative().default(100),
  SAP_ALLOWED_TOOLS: z.string().optional(), // comma-separated or 'all'
  
  // Logging & Observability
  SAP_LOG_LEVEL: logLevelSchema.default('info'),
  SAP_LOG_FORMAT: z.enum(['json', 'pretty']).default('pretty'),
  SAP_LOG_FILE: z.string().optional(),
  SAP_ENABLE_METRICS: booleanEnvSchema.default(false),
  SAP_METRICS_PORT: z.coerce.number().positive().default(9090),
  
  // Advanced
  SAP_ENABLE_CACHE: booleanEnvSchema.default(true),
  SAP_CACHE_TTL_SECONDS: z.coerce.number().positive().default(300),
  SAP_ENABLE_RATE_LIMIT: booleanEnvSchema.default(true),
  SAP_RATE_LIMIT_PER_MINUTE: z.coerce.number().positive().default(60),

  // Remote MCP monetization. Applies only when explicitly enabled by hosted HTTP deployments.
  SAP_MCP_MONETIZATION_ENABLED: booleanEnvSchema.default(false),
  SAP_MCP_MONETIZATION_PROVIDER: monetizationProviderSchema.default('x402'),
  SAP_MCP_MONETIZATION_PAY_TO: z.string().optional(),
  SAP_MCP_MONETIZATION_NETWORK: z.string().optional(),
  SAP_MCP_X402_FACILITATOR_URL: z.string().url().optional(),
  SAP_MCP_X402_FACILITATOR_AUTH_TOKEN: z.string().optional(),
  SAP_MCP_X402_MAX_TIMEOUT_SECONDS: z.coerce.number().positive().default(120),
  SAP_MCP_PAY_SH_CHECKOUT_URL: z.string().url().optional(),
  SAP_MCP_MONETIZATION_STRICT_TOOLS: booleanEnvSchema.default(false),
  SAP_MCP_PRICE_READ_PREMIUM_USD: z.coerce.number().positive().default(0.001),
  SAP_MCP_PRICE_BUILDER_USD: z.coerce.number().positive().default(0.008),
  SAP_MCP_PRICE_VALUE_FIXED_USD: z.coerce.number().nonnegative().default(0.2),
  SAP_MCP_PRICE_VALUE_BPS: z.coerce.number().nonnegative().default(50),
  SAP_MCP_PRICE_MIN_USD: z.coerce.number().nonnegative().default(0.001),
  SAP_MCP_PRICE_MAX_USD: z.coerce.number().positive().default(100),
});

/**
 * Parsed environment configuration before conversion to runtime config.
 */
export type SapEnvConfig = z.infer<typeof envSchema>;

// ============================================================================
// Runtime Configuration (after validation & transformation)
// ============================================================================

/**
 * Fully resolved runtime configuration consumed by server, policy, signer, and transport modules.
 */
export interface SapMcpConfig {
  mode: SapMcpMode;
  rpcUrl: string;
  rpcUrlDevnet?: string;
  rpcUrlTestnet?: string;
  commitment: 'processed' | 'confirmed' | 'finalized';
  programId: string;
  agentPubkey?: string;
  maxRetries: number;
  retryDelayMs: number;
  walletPath?: string;
  walletEncrypted: boolean;
  walletPassphraseEnv?: string;
  externalSignerUrl?: string;
  externalSignerTimeoutMs: number;
  enableHttp: boolean;
  httpPort: number;
  httpHost: string;
  httpCorsOrigins?: string[];
  maxTxValueSol: number;
  requireApprovalAboveSol: number;
  dailyLimitSol: number;
  allowedTools: string[] | 'all';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  logFormat: 'json' | 'pretty';
  logFile?: string;
  enableMetrics: boolean;
  metricsPort: number;
  enableCache: boolean;
  cacheTtlSeconds: number;
  enableRateLimit: boolean;
  rateLimitPerMinute: number;
  bento?: {
    enabled: boolean;
    apiKey?: string;
    agentId?: string;
    endpoint?: string;
  };
  policy?: {
    mode: 'local-only' | 'bento-only' | 'hybrid';
    failOpen: boolean;
    logging: boolean;
  };
  monetization: SapMcpMonetizationConfig;
}

/**
 * Supported operating modes for local, delegated, external-signer, and hosted workflows.
 */
export type SapMcpMode =
  | 'readonly'
  | 'local-dev-keypair'
  | 'external-signer'
  | 'delegated-session'
  | 'hosted-api';

/**
 * @name SapMcpMonetizationProvider
 * @description Supported payment rails for hosted remote MCP monetization.
 */
export type SapMcpMonetizationProvider = 'x402' | 'pay-sh';

/**
 * @name SapMcpMonetizationConfig
 * @description Runtime configuration for x402/pay.sh gated remote MCP tool execution.
 */
export interface SapMcpMonetizationConfig {
  enabled: boolean;
  provider: SapMcpMonetizationProvider;
  payTo?: string;
  network?: string;
  facilitatorUrl?: string;
  facilitatorAuthToken?: string;
  maxTimeoutSeconds: number;
  payShCheckoutUrl?: string;
  strictTools: boolean;
  prices: {
    readPremiumUsd: number;
    builderUsd: number;
    valueFixedUsd: number;
    valueBps: number;
    minUsd: number;
    maxUsd: number;
  };
}

type ConfigFileValue = unknown;
type ConfigFileData = Partial<SapEnvConfig> & Record<string, ConfigFileValue>;
type PolicyMode = NonNullable<SapMcpConfig['policy']>['mode'];
type ResolvedConfigFile = {
  path?: string;
  source: 'explicit' | 'profile' | 'active-profile' | 'default' | 'none';
  profileName?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asPolicyMode(value: unknown): PolicyMode | undefined {
  return value === 'local-only' || value === 'bento-only' || value === 'hybrid' ? value : undefined;
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

// ============================================================================
// Configuration Paths (Enterprise-grade)
// ============================================================================

/**
 * Get user-specific configuration directory
 * 
 * Follows XDG Base Directory Specification:
 * - Linux/macOS: ~/.config/mcp-sap/ or $XDG_CONFIG_HOME/mcp-sap/
 * - Windows: %APPDATA%/mcp-sap/
 */
export function getConfigDir(): string {
  return getCanonicalConfigDir();
}

/**
 * Get data directory for cache, logs, etc.
 * 
 * - Linux/macOS: ~/.local/share/mcp-sap/ or $XDG_DATA_HOME/mcp-sap/
 * - Windows: %LOCALAPPDATA%/mcp-sap/
 */
export function getDataDir(): string {
  return getCanonicalDataDir();
}

/**
 * Get log directory
 */
export function getLogDir(): string {
  return join(getDataDir(), 'logs');
}

/**
 * Get cache directory
 */
export function getCacheDir(): string {
  return join(getDataDir(), 'cache');
}

// ============================================================================
// Configuration Loading
// ============================================================================

/**
 * Load configuration from multiple sources (priority order):
 * 
 * 1. Environment variables (highest priority)
 * 2. Config file (~/.config/mcp-sap/config.json or config.yaml)
 * 3. .env file in project directory
 * 4. Default values (lowest priority)
 */
export function loadConfig(configPath?: string): SapMcpConfig {
  // Load .env from project root
  const projectRoot = join(dirname(__filename), '..');
  const envPath = join(projectRoot, '.env');
  
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
  
  // Load .env from user config directory
  const userEnvPath = join(getConfigDir(), '.env');
  if (existsSync(userEnvPath)) {
    dotenv.config({ path: userEnvPath, override: false });
  }
  
  // Load config file if exists. Explicit config/profile pointers are resolved before defaults.
  const resolvedConfigFile = resolveConfigFile(configPath);
  const configFile = resolvedConfigFile.path;
  let fileConfig: ConfigFileData = {};
  
  if (configFile && existsSync(configFile)) {
    fileConfig = normalizeFileConfig(loadConfigFile(configFile));
  }
  
  const envConfig = buildEnvironmentOverrides(fileConfig, resolvedConfigFile);

  // Merge: env vars override file config, defaults are fallback.
  // When a profile JSON is active, identity/network fields remain profile-owned by default.
  const merged = {
    ...getDefaultEnvConfig(),
    ...fileConfig,
    ...envConfig,
  };
  
  // Validate and transform
  const validated = envSchema.parse(merged);
  return transformToRuntimeConfig(validated, fileConfig);
}

/**
 * Find config file in standard locations
 */
function resolveConfigFile(explicitConfigPath?: string): ResolvedConfigFile {
  const envConfigPath = process.env.SAP_MCP_CONFIG_PATH;
  if (explicitConfigPath || envConfigPath) {
    return {
      path: explicitConfigPath || envConfigPath,
      source: 'explicit',
    };
  }

  const envProfile = process.env.SAP_MCP_PROFILE;
  if (envProfile) {
    const profilePath = getProfileConfigPath(envProfile);
    if (!existsSync(profilePath)) {
      throw new Error(`SAP_MCP_PROFILE="${envProfile}" does not exist at ${profilePath}`);
    }

    return {
      path: profilePath,
      source: 'profile',
      profileName: envProfile,
    };
  }

  const activeProfile = getActiveProfile();
  const activeProfilePath = getProfileConfigPath(activeProfile);
  if (existsSync(activeProfilePath)) {
    return {
      path: activeProfilePath,
      source: 'active-profile',
      profileName: activeProfile,
    };
  }

  return {
    path: findDefaultConfigFile(),
    source: 'default',
  };
}

/**
 * Find config file in standard default locations.
 */
function findDefaultConfigFile(): string | undefined {
  const configDir = getConfigDir();
  const extensions = ['.json', '.yaml', '.yml'];
  
  for (const ext of extensions) {
    const path = join(configDir, `config${ext}`);
    if (existsSync(path)) {
      return path;
    }
  }
  
  return undefined;
}

/**
 * Builds process environment overrides while preventing stale MCP client env from shadowing an active profile.
 */
function buildEnvironmentOverrides(
  fileConfig: ConfigFileData,
  resolvedConfigFile: ResolvedConfigFile
): Record<string, string | undefined> {
  const envConfig: Record<string, string | undefined> = { ...process.env };
  const allowConfigOverride = process.env.SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE?.toLowerCase() === 'true';
  const profileBacked = Boolean(process.env.SAP_MCP_PROFILE)
    || resolvedConfigFile.source === 'profile'
    || resolvedConfigFile.source === 'active-profile';

  if (!profileBacked || allowConfigOverride) {
    return envConfig;
  }

  if (fileConfig.SAP_MCP_MODE !== undefined) {
    delete envConfig.SAP_MCP_MODE;
  }

  if (fileConfig.SAP_RPC_URL !== undefined || fileConfig.SAP_MCP_RPC_URL !== undefined) {
    delete envConfig.SAP_MCP_RPC_URL;
    delete envConfig.SAP_RPC_URL;
  }

  if (fileConfig.SAP_PROGRAM_ID !== undefined) {
    delete envConfig.SAP_PROGRAM_ID;
  }

  if (fileConfig.SAP_WALLET_PATH !== undefined) {
    delete envConfig.SAP_WALLET_PATH;
  }

  return envConfig;
}

/**
 * Load config file (JSON or YAML)
 */
function loadConfigFile(filePath: string): ConfigFileData {
  const content = readFileSync(filePath, 'utf-8');
  const ext = filePath.split('.').pop()?.toLowerCase();
  
  if (ext === 'json') {
    const parsed: unknown = JSON.parse(content);
    if (!isRecord(parsed)) {
      throw new Error(`Config file must contain a JSON object: ${filePath}`);
    }
    return parsed as ConfigFileData;
  }
  
  if (ext === 'yaml' || ext === 'yml') {
    throw new Error('YAML support not enabled - install js-yaml package');
  }
  
  throw new Error(`Unsupported config file format: ${ext}`);
}

/**
 * Internal helper for the normalize file config operation.
 */
function normalizeFileConfig(config: ConfigFileData): ConfigFileData {
  const normalized: ConfigFileData = { ...config };
  const envNormalized = normalized as Record<keyof SapEnvConfig, unknown>;
  const mappings: Record<string, keyof SapEnvConfig> = {
    mode: 'SAP_MCP_MODE',
    rpcUrl: 'SAP_RPC_URL',
    rpcUrlDevnet: 'SAP_RPC_URL_DEVNET',
    rpcUrlTestnet: 'SAP_RPC_URL_TESTNET',
    programId: 'SAP_PROGRAM_ID',
    commitment: 'SAP_COMMITMENT',
    maxRetries: 'SAP_MAX_RETRIES',
    retryDelayMs: 'SAP_RETRY_DELAY_MS',
    walletPath: 'SAP_WALLET_PATH',
    walletEncrypted: 'SAP_WALLET_ENCRYPTED',
    walletPassphraseEnv: 'SAP_WALLET_PASSPHRASE_ENV',
    externalSignerUrl: 'SAP_EXTERNAL_SIGNER_URL',
    externalSignerTimeoutMs: 'SAP_EXTERNAL_SIGNER_TIMEOUT_MS',
    enableHttp: 'SAP_ENABLE_HTTP',
    httpPort: 'SAP_HTTP_PORT',
    httpHost: 'SAP_HTTP_HOST',
    maxTxValueSol: 'SAP_MAX_TX_VALUE_SOL',
    requireApprovalAboveSol: 'SAP_REQUIRE_APPROVAL_ABOVE_SOL',
    dailyLimitSol: 'SAP_DAILY_LIMIT_SOL',
    logLevel: 'SAP_LOG_LEVEL',
    logFormat: 'SAP_LOG_FORMAT',
    logFile: 'SAP_LOG_FILE',
    enableMetrics: 'SAP_ENABLE_METRICS',
    metricsPort: 'SAP_METRICS_PORT',
    enableCache: 'SAP_ENABLE_CACHE',
    cacheTtlSeconds: 'SAP_CACHE_TTL_SECONDS',
    enableRateLimit: 'SAP_ENABLE_RATE_LIMIT',
    rateLimitPerMinute: 'SAP_RATE_LIMIT_PER_MINUTE',
  };

  for (const [sourceKey, envKey] of Object.entries(mappings)) {
    if (config[sourceKey] !== undefined && normalized[envKey] === undefined) {
      envNormalized[envKey] = config[sourceKey];
    }
  }

  if (Array.isArray(config.httpCorsOrigins)) {
    normalized.SAP_HTTP_CORS_ORIGINS = config.httpCorsOrigins.join(',');
  }

  if (Array.isArray(config.allowedTools)) {
    normalized.SAP_ALLOWED_TOOLS = config.allowedTools.join(',');
  } else if (config.allowedTools === 'all') {
    normalized.SAP_ALLOWED_TOOLS = 'all';
  }

  if (isRecord(config.monetization)) {
    const monetization = config.monetization;
    if (normalized.SAP_MCP_MONETIZATION_ENABLED === undefined && monetization.enabled !== undefined) {
      envNormalized.SAP_MCP_MONETIZATION_ENABLED = monetization.enabled;
    }
    if (normalized.SAP_MCP_MONETIZATION_PROVIDER === undefined && monetization.provider !== undefined) {
      envNormalized.SAP_MCP_MONETIZATION_PROVIDER = monetization.provider;
    }
    if (normalized.SAP_MCP_MONETIZATION_PAY_TO === undefined && monetization.payTo !== undefined) {
      envNormalized.SAP_MCP_MONETIZATION_PAY_TO = monetization.payTo;
    }
    if (normalized.SAP_MCP_MONETIZATION_NETWORK === undefined && monetization.network !== undefined) {
      envNormalized.SAP_MCP_MONETIZATION_NETWORK = monetization.network;
    }
    if (normalized.SAP_MCP_X402_FACILITATOR_URL === undefined && monetization.facilitatorUrl !== undefined) {
      envNormalized.SAP_MCP_X402_FACILITATOR_URL = monetization.facilitatorUrl;
    }
    if (
      normalized.SAP_MCP_X402_FACILITATOR_AUTH_TOKEN === undefined
      && monetization.facilitatorAuthToken !== undefined
    ) {
      envNormalized.SAP_MCP_X402_FACILITATOR_AUTH_TOKEN = monetization.facilitatorAuthToken;
    }
    if (normalized.SAP_MCP_X402_MAX_TIMEOUT_SECONDS === undefined && monetization.maxTimeoutSeconds !== undefined) {
      envNormalized.SAP_MCP_X402_MAX_TIMEOUT_SECONDS = monetization.maxTimeoutSeconds;
    }
    if (normalized.SAP_MCP_PAY_SH_CHECKOUT_URL === undefined && monetization.payShCheckoutUrl !== undefined) {
      envNormalized.SAP_MCP_PAY_SH_CHECKOUT_URL = monetization.payShCheckoutUrl;
    }

    const prices = isRecord(monetization.prices) ? monetization.prices : {};
    if (normalized.SAP_MCP_PRICE_READ_PREMIUM_USD === undefined && prices.readPremiumUsd !== undefined) {
      envNormalized.SAP_MCP_PRICE_READ_PREMIUM_USD = prices.readPremiumUsd;
    }
    if (normalized.SAP_MCP_PRICE_BUILDER_USD === undefined && prices.builderUsd !== undefined) {
      envNormalized.SAP_MCP_PRICE_BUILDER_USD = prices.builderUsd;
    }
    if (normalized.SAP_MCP_PRICE_VALUE_FIXED_USD === undefined && prices.valueFixedUsd !== undefined) {
      envNormalized.SAP_MCP_PRICE_VALUE_FIXED_USD = prices.valueFixedUsd;
    }
    if (normalized.SAP_MCP_PRICE_VALUE_BPS === undefined && prices.valueBps !== undefined) {
      envNormalized.SAP_MCP_PRICE_VALUE_BPS = prices.valueBps;
    }
    if (normalized.SAP_MCP_PRICE_MIN_USD === undefined && prices.minUsd !== undefined) {
      envNormalized.SAP_MCP_PRICE_MIN_USD = prices.minUsd;
    }
    if (normalized.SAP_MCP_PRICE_MAX_USD === undefined && prices.maxUsd !== undefined) {
      envNormalized.SAP_MCP_PRICE_MAX_USD = prices.maxUsd;
    }
  }

  return normalized;
}

/**
 * Get default environment configuration
 */
function getDefaultEnvConfig(): Partial<SapEnvConfig> {
  return {
    SAP_MCP_MODE: 'readonly',
    SAP_RPC_URL: 'https://api.mainnet-beta.solana.com',
    SAP_PROGRAM_ID: 'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ',
    SAP_COMMITMENT: 'confirmed',
    SAP_MAX_RETRIES: 3,
    SAP_RETRY_DELAY_MS: 1000,
    SAP_WALLET_ENCRYPTED: false,
    SAP_EXTERNAL_SIGNER_TIMEOUT_MS: 30000,
    SAP_ENABLE_HTTP: false,
    SAP_HTTP_PORT: 8787,
    SAP_HTTP_HOST: '127.0.0.1',
    SAP_MAX_TX_VALUE_SOL: 10,
    SAP_REQUIRE_APPROVAL_ABOVE_SOL: 1,
    SAP_DAILY_LIMIT_SOL: 100,
    SAP_LOG_LEVEL: 'info',
    SAP_LOG_FORMAT: 'pretty',
    SAP_ENABLE_METRICS: false,
    SAP_METRICS_PORT: 9090,
    SAP_ENABLE_CACHE: true,
    SAP_CACHE_TTL_SECONDS: 300,
    SAP_ENABLE_RATE_LIMIT: true,
    SAP_RATE_LIMIT_PER_MINUTE: 60,
    SAP_MCP_MONETIZATION_ENABLED: false,
    SAP_MCP_MONETIZATION_PROVIDER: 'x402',
    SAP_MCP_X402_MAX_TIMEOUT_SECONDS: 120,
    SAP_MCP_PRICE_READ_PREMIUM_USD: 0.001,
    SAP_MCP_PRICE_BUILDER_USD: 0.008,
    SAP_MCP_PRICE_VALUE_FIXED_USD: 0.2,
    SAP_MCP_PRICE_VALUE_BPS: 50,
    SAP_MCP_PRICE_MIN_USD: 0.001,
    SAP_MCP_PRICE_MAX_USD: 100,
  };
}

/**
 * Transform validated env config to runtime config
 */
function transformToRuntimeConfig(env: SapEnvConfig, fileConfig: ConfigFileData = {}): SapMcpConfig {
  // Support both SAP_MCP_RPC_URL and SAP_RPC_URL (SAP_MCP_RPC_URL takes precedence)
  const rpcUrl = env.SAP_MCP_RPC_URL || env.SAP_RPC_URL;
  const bentoConfig = isRecord(fileConfig.bento) ? fileConfig.bento : {};
  const policyConfig = isRecord(fileConfig.policy) ? fileConfig.policy : {};
  const monetizationConfig = isRecord(fileConfig.monetization) ? fileConfig.monetization : {};
  const monetizationPrices = isRecord(monetizationConfig.prices) ? monetizationConfig.prices : {};
  const envPolicyMode = asPolicyMode(process.env.SAP_MCP_POLICY_MODE);
  const filePolicyMode = asPolicyMode(policyConfig.mode);
  const bentoEnabled = asOptionalBoolean(bentoConfig.enabled) ?? false;
  const effectiveBentoEnabled = Boolean(bentoEnabled || process.env.SAP_MCP_BENTO_API_KEY);
  const monetizationEnabled = env.SAP_MCP_MONETIZATION_ENABLED
    || asOptionalBoolean(monetizationConfig.enabled)
    || false;
  
  return {
    mode: env.SAP_MCP_MODE,
    rpcUrl: rpcUrl,
    rpcUrlDevnet: env.SAP_RPC_URL_DEVNET,
    rpcUrlTestnet: env.SAP_RPC_URL_TESTNET,
    commitment: env.SAP_COMMITMENT,
    programId: env.SAP_PROGRAM_ID,
    agentPubkey: asOptionalString(fileConfig.agentPubkey),
    maxRetries: env.SAP_MAX_RETRIES,
    retryDelayMs: env.SAP_RETRY_DELAY_MS,
    walletPath: env.SAP_WALLET_PATH,
    walletEncrypted: env.SAP_WALLET_ENCRYPTED,
    walletPassphraseEnv: env.SAP_WALLET_PASSPHRASE_ENV,
    externalSignerUrl: env.SAP_EXTERNAL_SIGNER_URL,
    externalSignerTimeoutMs: env.SAP_EXTERNAL_SIGNER_TIMEOUT_MS,
    enableHttp: env.SAP_ENABLE_HTTP,
    httpPort: env.SAP_HTTP_PORT,
    httpHost: env.SAP_HTTP_HOST,
    httpCorsOrigins: env.SAP_HTTP_CORS_ORIGINS?.split(',').map(s => s.trim()),
    maxTxValueSol: env.SAP_MAX_TX_VALUE_SOL,
    requireApprovalAboveSol: env.SAP_REQUIRE_APPROVAL_ABOVE_SOL,
    dailyLimitSol: env.SAP_DAILY_LIMIT_SOL,
    allowedTools: env.SAP_ALLOWED_TOOLS === 'all' || !env.SAP_ALLOWED_TOOLS
      ? 'all'
      : env.SAP_ALLOWED_TOOLS.split(',').map(s => s.trim()),
    logLevel: env.SAP_LOG_LEVEL,
    logFormat: env.SAP_LOG_FORMAT,
    logFile: env.SAP_LOG_FILE,
    enableMetrics: env.SAP_ENABLE_METRICS,
    metricsPort: env.SAP_METRICS_PORT,
    enableCache: env.SAP_ENABLE_CACHE,
    cacheTtlSeconds: env.SAP_CACHE_TTL_SECONDS,
    enableRateLimit: env.SAP_ENABLE_RATE_LIMIT,
    rateLimitPerMinute: env.SAP_RATE_LIMIT_PER_MINUTE,
    bento: {
      enabled: effectiveBentoEnabled,
      apiKey: process.env.SAP_MCP_BENTO_API_KEY || asOptionalString(bentoConfig.apiKey),
      agentId: process.env.SAP_MCP_BENTO_AGENT_ID || asOptionalString(bentoConfig.agentId),
      endpoint: process.env.SAP_MCP_BENTO_ENDPOINT || asOptionalString(bentoConfig.endpoint),
    },
    policy: {
      mode: envPolicyMode || filePolicyMode || (effectiveBentoEnabled ? 'hybrid' : 'local-only'),
      failOpen: process.env.SAP_MCP_POLICY_FAIL_OPEN
        ? process.env.SAP_MCP_POLICY_FAIL_OPEN.toLowerCase() === 'true'
        : asOptionalBoolean(policyConfig.failOpen) ?? false,
      logging: process.env.SAP_MCP_POLICY_LOGGING
        ? process.env.SAP_MCP_POLICY_LOGGING.toLowerCase() === 'true'
        : asOptionalBoolean(policyConfig.logging) ?? true,
    },
    monetization: {
      enabled: monetizationEnabled,
      provider: env.SAP_MCP_MONETIZATION_PROVIDER,
      payTo: env.SAP_MCP_MONETIZATION_PAY_TO,
      network: env.SAP_MCP_MONETIZATION_NETWORK,
      facilitatorUrl: env.SAP_MCP_X402_FACILITATOR_URL,
      facilitatorAuthToken: env.SAP_MCP_X402_FACILITATOR_AUTH_TOKEN,
      maxTimeoutSeconds: env.SAP_MCP_X402_MAX_TIMEOUT_SECONDS,
      payShCheckoutUrl: env.SAP_MCP_PAY_SH_CHECKOUT_URL,
      strictTools: asOptionalBoolean(monetizationConfig.strictTools)
        ?? env.SAP_MCP_MONETIZATION_STRICT_TOOLS,
      prices: {
        readPremiumUsd: asOptionalNumber(monetizationPrices.readPremiumUsd) ?? env.SAP_MCP_PRICE_READ_PREMIUM_USD,
        builderUsd: asOptionalNumber(monetizationPrices.builderUsd) ?? env.SAP_MCP_PRICE_BUILDER_USD,
        valueFixedUsd: asOptionalNumber(monetizationPrices.valueFixedUsd) ?? env.SAP_MCP_PRICE_VALUE_FIXED_USD,
        valueBps: asOptionalNumber(monetizationPrices.valueBps) ?? env.SAP_MCP_PRICE_VALUE_BPS,
        minUsd: asOptionalNumber(monetizationPrices.minUsd) ?? env.SAP_MCP_PRICE_MIN_USD,
        maxUsd: asOptionalNumber(monetizationPrices.maxUsd) ?? env.SAP_MCP_PRICE_MAX_USD,
      },
    },
  };
}

// ============================================================================
// Configuration Utilities
// ============================================================================

/**
 * Ensure all required directories exist
 */
export function ensureDirectories(): void {
  ensureConfigDirectories();
}

/**
 * Get config file path for writing
 */
export function getConfigFilePath(): string {
  return getProfileConfigPath(getActiveProfile());
}

/**
 * Save configuration to file
 */
export function saveConfig(config: Partial<SapEnvConfig>): void {
  const configPath = getConfigFilePath();
  
  // Ensure directory exists
  ensureDirectories();
  
  // Write config file
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Validate configuration for specific mode
 */
export function validateConfigForMode(config: SapMcpConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Mode-specific validation
  if (config.mode === 'local-dev-keypair' && !config.walletPath) {
    errors.push('SAP_WALLET_PATH is required for local-dev-keypair mode');
  }
  
  if (config.mode === 'external-signer' && !config.externalSignerUrl) {
    errors.push('SAP_EXTERNAL_SIGNER_URL is required for external-signer mode');
  }
  
  if (config.enableHttp && config.mode === 'hosted-api') {
    if (!config.httpCorsOrigins || config.httpCorsOrigins.length === 0) {
      errors.push('SAP_HTTP_CORS_ORIGINS recommended for hosted-api mode');
    }
  }
  
  // Security validation
  if (config.maxTxValueSol < config.requireApprovalAboveSol) {
    errors.push('SAP_MAX_TX_VALUE_SOL must be >= SAP_REQUIRE_APPROVAL_ABOVE_SOL');
  }
  
  if (config.dailyLimitSol < config.maxTxValueSol) {
    errors.push('SAP_DAILY_LIMIT_SOL must be >= SAP_MAX_TX_VALUE_SOL');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
