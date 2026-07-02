import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from './env.js';

const ORIGINAL_ENV = { ...process.env };

function writeProfileConfig(configHome: string, profileName: string): void {
  const configDir = join(configHome, 'mcp-sap');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, '.active-profile'), profileName, 'utf-8');
  writeFileSync(join(configDir, `config-${profileName}.json`), JSON.stringify({
    mode: 'local-dev-keypair',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    commitment: 'confirmed',
    programId: 'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ',
    maxRetries: 3,
    retryDelayMs: 1000,
    walletPath: '/tmp/mainnet-agent.json',
    walletEncrypted: false,
    externalSignerTimeoutMs: 30000,
    enableHttp: false,
    httpPort: 8787,
    httpHost: '127.0.0.1',
    maxTxValueSol: 10,
    requireApprovalAboveSol: 1,
    dailyLimitSol: 100,
    allowedTools: 'all',
    logLevel: 'info',
    logFormat: 'pretty',
    enableMetrics: false,
    metricsPort: 9090,
    enableCache: true,
    cacheTtlSeconds: 300,
    enableRateLimit: true,
    rateLimitPerMinute: 60,
  }, null, 2), 'utf-8');
}

describe('loadConfig profile precedence', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('keeps profile network and wallet ahead of stale MCP client env overrides', () => {
    const configHome = mkdtempSync(join(tmpdir(), 'sap-mcp-config-'));
    const profileName = 'gianni-market-nft-agent';

    try {
      writeProfileConfig(configHome, profileName);
      process.env.XDG_CONFIG_HOME = configHome;
      process.env.SAP_MCP_PROFILE = profileName;
      process.env.SAP_MCP_RPC_URL = 'https://api.devnet.solana.com';
      process.env.SAP_WALLET_PATH = '/tmp/devnet-agent.json';

      const config = loadConfig();

      expect(config.rpcUrl).toBe('https://api.mainnet-beta.solana.com');
      expect(config.walletPath).toBe('/tmp/mainnet-agent.json');
    } finally {
      rmSync(configHome, { recursive: true, force: true });
    }
  });

  it('allows explicit env override when SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE is true', () => {
    const configHome = mkdtempSync(join(tmpdir(), 'sap-mcp-config-'));
    const profileName = 'gianni-market-nft-agent';

    try {
      writeProfileConfig(configHome, profileName);
      process.env.XDG_CONFIG_HOME = configHome;
      process.env.SAP_MCP_PROFILE = profileName;
      process.env.SAP_MCP_RPC_URL = 'https://api.devnet.solana.com';
      process.env.SAP_WALLET_PATH = '/tmp/devnet-agent.json';
      process.env.SAP_MCP_ALLOW_ENV_CONFIG_OVERRIDE = 'true';

      const config = loadConfig();

      expect(config.rpcUrl).toBe('https://api.devnet.solana.com');
      expect(config.walletPath).toBe('/tmp/devnet-agent.json');
    } finally {
      rmSync(configHome, { recursive: true, force: true });
    }
  });

  it('keeps profile-owned values when SAP_MCP_PROFILE is paired with an explicit config path', () => {
    const configHome = mkdtempSync(join(tmpdir(), 'sap-mcp-config-'));
    const profileName = 'gianni-market-nft-agent';

    try {
      writeProfileConfig(configHome, profileName);
      process.env.XDG_CONFIG_HOME = configHome;
      process.env.SAP_MCP_PROFILE = profileName;
      process.env.SAP_MCP_CONFIG_PATH = join(configHome, 'mcp-sap', `config-${profileName}.json`);
      process.env.SAP_MCP_RPC_URL = 'https://api.devnet.solana.com';
      process.env.SAP_WALLET_PATH = '/tmp/devnet-agent.json';

      const config = loadConfig();

      expect(config.rpcUrl).toBe('https://api.mainnet-beta.solana.com');
      expect(config.walletPath).toBe('/tmp/mainnet-agent.json');
    } finally {
      rmSync(configHome, { recursive: true, force: true });
    }
  });

  it('enables hybrid policy mode when Bento is configured from environment', () => {
    const configHome = mkdtempSync(join(tmpdir(), 'sap-mcp-config-'));
    const profileName = 'gianni-market-nft-agent';

    try {
      writeProfileConfig(configHome, profileName);
      process.env.XDG_CONFIG_HOME = configHome;
      process.env.SAP_MCP_PROFILE = profileName;
      process.env.SAP_MCP_BENTO_API_KEY = 'bento-test-key';
      process.env.SAP_MCP_BENTO_AGENT_ID = 'sap-test-agent';

      const config = loadConfig();

      expect(config.bento?.enabled).toBe(true);
      expect(config.bento?.apiKey).toBe('bento-test-key');
      expect(config.policy?.mode).toBe('hybrid');
    } finally {
      rmSync(configHome, { recursive: true, force: true });
    }
  });

  it('parses string boolean environment values explicitly', () => {
    const configHome = mkdtempSync(join(tmpdir(), 'sap-mcp-config-'));

    try {
      process.env.XDG_CONFIG_HOME = configHome;
      process.env.SAP_MCP_CONFIG_PATH = join(configHome, 'mcp-sap', 'hosted.json');
      process.env.SAP_MCP_MODE = 'hosted-api';
      process.env.SAP_MCP_RPC_URL = 'https://api.devnet.solana.com';
      process.env.SAP_ENABLE_HTTP = 'true';
      process.env.SAP_ENABLE_CACHE = 'false';
      process.env.SAP_ENABLE_RATE_LIMIT = 'false';
      process.env.SAP_MCP_MONETIZATION_ENABLED = 'false';

      const config = loadConfig();

      expect(config.enableHttp).toBe(true);
      expect(config.enableCache).toBe(false);
      expect(config.enableRateLimit).toBe(false);
      expect(config.monetization.enabled).toBe(false);
    } finally {
      rmSync(configHome, { recursive: true, force: true });
    }
  });
});
