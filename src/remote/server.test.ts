import type { IncomingMessage } from 'http';
import { afterEach, describe, expect, it } from 'vitest';
import type { SapMcpConfig } from '../config/env.js';
import {
  buildA2AAgentCard,
  buildWizardInstallDescriptor,
  buildWizardInstallScript,
  defaultRemoteConfig,
} from './server.js';

const originalAuthType = process.env.SAP_MCP_AUTH_TYPE;
const originalApiKeys = process.env.SAP_MCP_API_KEYS;
const originalAuthSecret = process.env.SAP_MCP_AUTH_SECRET;

const appConfig: SapMcpConfig = {
  mode: 'hosted-api',
  rpcUrl: 'https://api.devnet.solana.com',
  commitment: 'confirmed',
  programId: 'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ',
  maxRetries: 3,
  retryDelayMs: 1000,
  walletEncrypted: false,
  externalSignerTimeoutMs: 30000,
  enableHttp: true,
  httpPort: 8787,
  httpHost: '127.0.0.1',
  maxTxValueSol: 1,
  requireApprovalAboveSol: 1,
  dailyLimitSol: 10,
  allowedTools: 'all',
  logLevel: 'info',
  logFormat: 'pretty',
  enableMetrics: false,
  metricsPort: 9090,
  enableCache: true,
  cacheTtlSeconds: 300,
  enableRateLimit: true,
  rateLimitPerMinute: 60,
  monetization: {
    enabled: true,
    provider: 'x402',
    payTo: '11111111111111111111111111111111',
    facilitatorUrl: 'http://127.0.0.1:8788/facilitator',
    maxTimeoutSeconds: 120,
    prices: {
      readPremiumUsd: 0.008,
      builderUsd: 0.05,
      valueFixedUsd: 0.2,
      valueBps: 50,
      minUsd: 0.001,
      maxUsd: 100,
    },
  },
};

function restoreEnv(): void {
  if (originalAuthType === undefined) {
    delete process.env.SAP_MCP_AUTH_TYPE;
  } else {
    process.env.SAP_MCP_AUTH_TYPE = originalAuthType;
  }
  if (originalApiKeys === undefined) {
    delete process.env.SAP_MCP_API_KEYS;
  } else {
    process.env.SAP_MCP_API_KEYS = originalApiKeys;
  }
  if (originalAuthSecret === undefined) {
    delete process.env.SAP_MCP_AUTH_SECRET;
  } else {
    process.env.SAP_MCP_AUTH_SECRET = originalAuthSecret;
  }
}

afterEach(() => {
  restoreEnv();
});

describe('remote MCP server config', () => {
  it('supports explicit bearerless x402-first hosted mode', () => {
    process.env.SAP_MCP_AUTH_TYPE = 'none';
    delete process.env.SAP_MCP_API_KEYS;
    delete process.env.SAP_MCP_AUTH_SECRET;

    const config = defaultRemoteConfig(appConfig);

    expect(config.auth).toEqual({ type: 'none' });
  });

  it('advertises no bearer requirement in the public agent card when auth is none', () => {
    const card = buildA2AAgentCard(
      { headers: { host: 'mcp.sap.oobeprotocol.ai', 'x-forwarded-proto': 'https' } } as IncomingMessage,
      {
        port: 8787,
        host: '127.0.0.1',
        auth: { type: 'none' },
      },
    );

    expect(card.capabilities.authenticated).toBe(false);
    expect(card.authentication.required).toBe(false);
    expect(card.authentication.schemes).toEqual(['none', 'x402']);
    expect(card.url).toBe('https://mcp.sap.oobeprotocol.ai/mcp');
    expect(card.setup.wizard.endpoints.descriptor).toBe('https://mcp.sap.oobeprotocol.ai/.well-known/sap-mcp-wizard.json');
    expect(card.setup.wizard.security.keypairBytesExposed).toBe(false);
  });

  it('publishes wizard installation metadata for agents that cannot see local config', () => {
    const descriptor = buildWizardInstallDescriptor(
      { headers: { host: 'mcp.sap.oobeprotocol.ai', 'x-forwarded-proto': 'https' } } as IncomingMessage,
      {
        port: 8787,
        host: '127.0.0.1',
        auth: { type: 'none' },
      },
    );

    expect(descriptor.hostedMcpUrl).toBe('https://mcp.sap.oobeprotocol.ai/mcp');
    expect(descriptor.configDirectory).toBe('~/.config/mcp-sap');
    expect(descriptor.requiredFor).toContain('signing x402/pay.sh payment payloads');
    expect(descriptor.commands.runWizard).toContain('@oobe-protocol-labs/sap-mcp-server');
    expect(descriptor.security.modifiesSolanaCliKeypair).toBe(false);
  });

  it('generates a minimal wizard install script that launches the npm package binary', () => {
    const script = buildWizardInstallScript(
      { headers: { host: 'mcp.sap.oobeprotocol.ai', 'x-forwarded-proto': 'https' } } as IncomingMessage,
      {
        port: 8787,
        host: '127.0.0.1',
        auth: { type: 'none' },
      },
    );

    expect(script).toContain('Node.js 18+ is required');
    expect(script).toContain('npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config wizard');
    expect(script).toContain('https://mcp.sap.oobeprotocol.ai/mcp');
  });
});
