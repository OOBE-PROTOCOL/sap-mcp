import type { IncomingMessage } from 'http';
import { afterEach, describe, expect, it } from 'vitest';
import type { SapMcpConfig } from '../config/env.js';
import { MCP_SERVER_VERSION } from '../core/constants.js';
import {
  buildA2AAgentCard,
  buildDocsHtml,
  buildLandingHtml,
  buildMarketplaceConfigurationMetadata,
  buildPublicPayShProviderYaml,
  buildPublicServerInfo,
  buildStaticServerCard,
  buildWizardInstallDescriptor,
  buildWizardInstallScript,
  buildOpenApiSpec,
  buildX402DiscoveryDocument,
  defaultRemoteConfig,
  resolvePublicDocsMarkdown,
  resolvePublicLogoAsset,
} from './server.js';

const originalAuthType = process.env.SAP_MCP_AUTH_TYPE;
const originalApiKeys = process.env.SAP_MCP_API_KEYS;
const originalAuthSecret = process.env.SAP_MCP_AUTH_SECRET;
const originalStateless = process.env.SAP_MCP_HTTP_STATELESS;
const originalRemoteRateLimit = process.env.SAP_MCP_REMOTE_RATE_LIMIT_PER_MINUTE;
const originalFacilitatorPublicKey = process.env.SAP_MCP_X402_FACILITATOR_PUBLIC_KEY;
const originalMaxStatefulSessions = process.env.SAP_MCP_REMOTE_MAX_STATEFUL_SESSIONS;
const originalSessionIdleTtl = process.env.SAP_MCP_REMOTE_SESSION_IDLE_TTL_MS;
const originalSessionAbsoluteTtl = process.env.SAP_MCP_REMOTE_SESSION_ABSOLUTE_TTL_MS;
const originalSessionCleanupInterval = process.env.SAP_MCP_REMOTE_SESSION_CLEANUP_INTERVAL_MS;
const originalMaxInFlightRequests = process.env.SAP_MCP_REMOTE_MAX_IN_FLIGHT_REQUESTS;
const originalRequestTimeout = process.env.SAP_MCP_REMOTE_REQUEST_TIMEOUT_MS;
const originalHeadersTimeout = process.env.SAP_MCP_REMOTE_HEADERS_TIMEOUT_MS;
const originalKeepAliveTimeout = process.env.SAP_MCP_REMOTE_KEEP_ALIVE_TIMEOUT_MS;
const originalMaxRequestsPerSocket = process.env.SAP_MCP_REMOTE_MAX_REQUESTS_PER_SOCKET;
const githubReleaseBaseUrl = `https://github.com/OOBE-PROTOCOL/sap-mcp/releases/download/${MCP_SERVER_VERSION}`;

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
    strictTools: false,
    prices: {
      readPremiumUsd: 0.001,
      builderUsd: 0.008,
      valueFixedUsd: 0.09,
      heavyValueUsd: 0.15,
      valueBps: 0,
      minUsd: 0.001,
      maxUsd: 100,
    },
  },
};

const paymentDiscovery = {
  provider: 'x402' as const,
  network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  asset: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  assetSymbol: 'USDC' as const,
  payTo: '11111111111111111111111111111111',
  seller: {
    name: 'OOBE Protocol' as const,
    payTo: '11111111111111111111111111111111',
  },
  facilitator: {
    role: 'x402-svm-fee-payer' as const,
    publicKey: 'FeePayer111111111111111111111111111111111',
  },
  headers: {
    paymentRequired: 'PAYMENT-REQUIRED' as const,
    paymentSignature: 'PAYMENT-SIGNATURE' as const,
    paymentResponse: 'PAYMENT-RESPONSE' as const,
  },
};

const publicRemoteConfig = {
  port: 8787,
  host: '127.0.0.1',
  auth: { type: 'none' as const },
  stateless: true,
  rateLimit: {
    enabled: true,
    requestsPerMinute: 60,
    keyPrefix: 'test:',
  },
  paymentDiscovery,
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
  if (originalStateless === undefined) {
    delete process.env.SAP_MCP_HTTP_STATELESS;
  } else {
    process.env.SAP_MCP_HTTP_STATELESS = originalStateless;
  }
  if (originalRemoteRateLimit === undefined) {
    delete process.env.SAP_MCP_REMOTE_RATE_LIMIT_PER_MINUTE;
  } else {
    process.env.SAP_MCP_REMOTE_RATE_LIMIT_PER_MINUTE = originalRemoteRateLimit;
  }
  if (originalFacilitatorPublicKey === undefined) {
    delete process.env.SAP_MCP_X402_FACILITATOR_PUBLIC_KEY;
  } else {
    process.env.SAP_MCP_X402_FACILITATOR_PUBLIC_KEY = originalFacilitatorPublicKey;
  }
  if (originalMaxStatefulSessions === undefined) {
    delete process.env.SAP_MCP_REMOTE_MAX_STATEFUL_SESSIONS;
  } else {
    process.env.SAP_MCP_REMOTE_MAX_STATEFUL_SESSIONS = originalMaxStatefulSessions;
  }
  if (originalSessionIdleTtl === undefined) {
    delete process.env.SAP_MCP_REMOTE_SESSION_IDLE_TTL_MS;
  } else {
    process.env.SAP_MCP_REMOTE_SESSION_IDLE_TTL_MS = originalSessionIdleTtl;
  }
  if (originalSessionAbsoluteTtl === undefined) {
    delete process.env.SAP_MCP_REMOTE_SESSION_ABSOLUTE_TTL_MS;
  } else {
    process.env.SAP_MCP_REMOTE_SESSION_ABSOLUTE_TTL_MS = originalSessionAbsoluteTtl;
  }
  if (originalSessionCleanupInterval === undefined) {
    delete process.env.SAP_MCP_REMOTE_SESSION_CLEANUP_INTERVAL_MS;
  } else {
    process.env.SAP_MCP_REMOTE_SESSION_CLEANUP_INTERVAL_MS = originalSessionCleanupInterval;
  }
  if (originalMaxInFlightRequests === undefined) {
    delete process.env.SAP_MCP_REMOTE_MAX_IN_FLIGHT_REQUESTS;
  } else {
    process.env.SAP_MCP_REMOTE_MAX_IN_FLIGHT_REQUESTS = originalMaxInFlightRequests;
  }
  if (originalRequestTimeout === undefined) {
    delete process.env.SAP_MCP_REMOTE_REQUEST_TIMEOUT_MS;
  } else {
    process.env.SAP_MCP_REMOTE_REQUEST_TIMEOUT_MS = originalRequestTimeout;
  }
  if (originalHeadersTimeout === undefined) {
    delete process.env.SAP_MCP_REMOTE_HEADERS_TIMEOUT_MS;
  } else {
    process.env.SAP_MCP_REMOTE_HEADERS_TIMEOUT_MS = originalHeadersTimeout;
  }
  if (originalKeepAliveTimeout === undefined) {
    delete process.env.SAP_MCP_REMOTE_KEEP_ALIVE_TIMEOUT_MS;
  } else {
    process.env.SAP_MCP_REMOTE_KEEP_ALIVE_TIMEOUT_MS = originalKeepAliveTimeout;
  }
  if (originalMaxRequestsPerSocket === undefined) {
    delete process.env.SAP_MCP_REMOTE_MAX_REQUESTS_PER_SOCKET;
  } else {
    process.env.SAP_MCP_REMOTE_MAX_REQUESTS_PER_SOCKET = originalMaxRequestsPerSocket;
  }
}

afterEach(() => {
  restoreEnv();
});

describe('remote MCP server config', () => {
  it('supports explicit bearerless x402-first hosted mode', () => {
    process.env.SAP_MCP_AUTH_TYPE = 'none';
    process.env.SAP_MCP_X402_FACILITATOR_PUBLIC_KEY = 'FeePayer111111111111111111111111111111111';
    delete process.env.SAP_MCP_API_KEYS;
    delete process.env.SAP_MCP_AUTH_SECRET;

    const config = defaultRemoteConfig(appConfig);

    expect(config.auth).toEqual({ type: 'none' });
    expect(config.stateless).toBe(false);
    expect(config.rateLimit.requestsPerMinute).toBe(60);
    expect(config.sessions).toEqual({
      maxStatefulSessions: 2000,
      idleTtlMs: 600000,
      absoluteTtlMs: 3600000,
      cleanupIntervalMs: 30000,
    });
    expect(config.concurrency).toEqual({
      maxInFlightRequests: 1024,
    });
    expect(config.http).toEqual({
      requestTimeoutMs: 300000,
      headersTimeoutMs: 65000,
      keepAliveTimeoutMs: 75000,
      maxRequestsPerSocket: 0,
    });
    expect(config.paymentDiscovery).toMatchObject({
      provider: 'x402',
      network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
      asset: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
      payTo: '11111111111111111111111111111111',
      facilitator: {
        role: 'x402-svm-fee-payer',
        publicKey: 'FeePayer111111111111111111111111111111111',
      },
    });
  });

  it('allows stateful remote sessions and custom remote rate limits when explicitly requested', () => {
    process.env.SAP_MCP_AUTH_TYPE = 'none';
    process.env.SAP_MCP_HTTP_STATELESS = 'false';
    process.env.SAP_MCP_REMOTE_RATE_LIMIT_PER_MINUTE = '500';

    const config = defaultRemoteConfig(appConfig);

    expect(config.stateless).toBe(false);
    expect(config.rateLimit.requestsPerMinute).toBe(500);
  });

  it('allows hosted concurrency and session lifecycle tuning from env', () => {
    process.env.SAP_MCP_AUTH_TYPE = 'none';
    process.env.SAP_MCP_REMOTE_MAX_STATEFUL_SESSIONS = '5000';
    process.env.SAP_MCP_REMOTE_SESSION_IDLE_TTL_MS = '120000';
    process.env.SAP_MCP_REMOTE_SESSION_ABSOLUTE_TTL_MS = '900000';
    process.env.SAP_MCP_REMOTE_SESSION_CLEANUP_INTERVAL_MS = '10000';
    process.env.SAP_MCP_REMOTE_MAX_IN_FLIGHT_REQUESTS = '2048';
    process.env.SAP_MCP_REMOTE_REQUEST_TIMEOUT_MS = '600000';
    process.env.SAP_MCP_REMOTE_HEADERS_TIMEOUT_MS = '70000';
    process.env.SAP_MCP_REMOTE_KEEP_ALIVE_TIMEOUT_MS = '80000';
    process.env.SAP_MCP_REMOTE_MAX_REQUESTS_PER_SOCKET = '10000';

    const config = defaultRemoteConfig(appConfig);

    expect(config.sessions).toEqual({
      maxStatefulSessions: 5000,
      idleTtlMs: 120000,
      absoluteTtlMs: 900000,
      cleanupIntervalMs: 10000,
    });
    expect(config.concurrency).toEqual({
      maxInFlightRequests: 2048,
    });
    expect(config.http).toEqual({
      requestTimeoutMs: 600000,
      headersTimeoutMs: 70000,
      keepAliveTimeoutMs: 80000,
      maxRequestsPerSocket: 10000,
    });
  });

  it('advertises no bearer requirement in the public agent card when auth is none', () => {
    const card = buildA2AAgentCard(
      { headers: { host: 'mcp.sap.oobeprotocol.ai', 'x-forwarded-proto': 'https' } } as IncomingMessage,
      {
        port: 8787,
        host: '127.0.0.1',
        auth: { type: 'none' },
        stateless: true,
        rateLimit: {
          enabled: true,
          requestsPerMinute: 60,
          keyPrefix: 'test:',
        },
      },
    );

    expect(card.capabilities.authenticated).toBe(false);
    expect(card.authentication.required).toBe(false);
    expect(card.authentication.schemes).toEqual(['none', 'x402']);
    expect(card.url).toBe('https://mcp.sap.oobeprotocol.ai/mcp');
    expect(card.setup.wizard.endpoints.descriptor).toBe('https://mcp.sap.oobeprotocol.ai/.well-known/sap-mcp-wizard.json');
    expect(card.setup.wizard.endpoints.downloads).toBe('https://mcp.sap.oobeprotocol.ai/wizard/downloads.json');
    expect(card.setup.wizard.security.keypairBytesExposed).toBe(false);
  });

  it('publishes wizard installation metadata for agents that cannot see local config', () => {
    const descriptor = buildWizardInstallDescriptor(
      { headers: { host: 'mcp.sap.oobeprotocol.ai', 'x-forwarded-proto': 'https' } } as IncomingMessage,
      {
        port: 8787,
        host: '127.0.0.1',
        auth: { type: 'none' },
        stateless: true,
        rateLimit: {
          enabled: true,
          requestsPerMinute: 60,
          keyPrefix: 'test:',
        },
      },
    );

    expect(descriptor.hostedMcpUrl).toBe('https://mcp.sap.oobeprotocol.ai/mcp');
    expect(descriptor.configDirectory).toBe('~/.config/mcp-sap');
    expect(descriptor.requiredFor).toContain('signing x402/pay.sh payment payloads');
    expect(descriptor.commands.runWizard).toContain('@oobe-protocol-labs/sap-mcp-server');
    expect(descriptor.commands.installX402PaidCallAddon).toContain('sap-mcp-config wizard');
    expect(descriptor.commands.runX402PaidCall).toContain('sap-mcp-x402-paid-call');
    expect(descriptor.security.modifiesSolanaCliKeypair).toBe(false);
  });

  it('generates a minimal wizard install script that launches the npm package binary', () => {
    const script = buildWizardInstallScript(
      { headers: { host: 'mcp.sap.oobeprotocol.ai', 'x-forwarded-proto': 'https' } } as IncomingMessage,
      {
        port: 8787,
        host: '127.0.0.1',
        auth: { type: 'none' },
        stateless: true,
        rateLimit: {
          enabled: true,
          requestsPerMinute: 60,
          keyPrefix: 'test:',
        },
      },
    );

    expect(script).toContain('Node.js 18+ is required');
    expect(script).toContain('npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config wizard');
    expect(script).toContain('https://mcp.sap.oobeprotocol.ai/mcp');
  });

  it('publishes share-safe public server metadata without runtime secrets', () => {
    const info = buildPublicServerInfo(
      { headers: { host: 'mcp.sap.oobeprotocol.ai', 'x-forwarded-proto': 'https' } } as IncomingMessage,
      publicRemoteConfig,
    );

    expect(info.endpoints.landing).toBe('https://mcp.sap.oobeprotocol.ai/');
    expect(info.displayName).toBe('SAP MCP Server | OOBE Protocol');
    expect(info.display_name).toBe('SAP MCP Server | OOBE Protocol');
    expect(info.description).toContain('Solana-native MCP gateway');
    expect(info.homepage).toBe('https://mcp.sap.oobeprotocol.ai/');
    expect(info.websiteUrl).toBe('https://mcp.sap.oobeprotocol.ai/');
    expect(info.website_url).toBe('https://mcp.sap.oobeprotocol.ai/');
    expect(info.icon).toBe('https://mcp.sap.oobeprotocol.ai/favicon.png');
    expect(info.iconUrl).toBe('https://mcp.sap.oobeprotocol.ai/favicon.png');
    expect(info.icon_url).toBe('https://mcp.sap.oobeprotocol.ai/favicon.png');
    expect(info.image).toBe('https://mcp.sap.oobeprotocol.ai/favicon.png');
    expect(info.logo).toBe('https://mcp.sap.oobeprotocol.ai/favicon.png');
    expect(info.icons[0]).toMatchObject({
      src: 'https://mcp.sap.oobeprotocol.ai/favicon.png',
      mimeType: 'image/png',
      sizes: ['512x512'],
    });
    expect(info.endpoints.docs).toBe('https://mcp.sap.oobeprotocol.ai/docs');
    expect(info.endpoints.mcp).toBe('https://mcp.sap.oobeprotocol.ai/mcp');
    expect(info.endpoints.txSubmit).toBe('https://mcp.sap.oobeprotocol.ai/tx/submit');
    expect(info.endpoints.pricing).toBe('https://mcp.sap.oobeprotocol.ai/pricing.json');
    expect(info.endpoints.openApi).toBe('https://mcp.sap.oobeprotocol.ai/openapi.json');
    expect(info.endpoints.x402Discovery).toBe('https://mcp.sap.oobeprotocol.ai/.well-known/x402');
    expect(info.endpoints.smitheryConfigSchema).toBe('https://mcp.sap.oobeprotocol.ai/smithery.config.schema.json');
    expect(info.endpoints.smitheryServerCard).toBe('https://mcp.sap.oobeprotocol.ai/.well-known/mcp/server-card.json');
    expect(info.endpoints.payShProvider).toBe('https://mcp.sap.oobeprotocol.ai/pay/provider.yml');
    expect(info.endpoints.faviconIco).toBe('https://mcp.sap.oobeprotocol.ai/favicon.ico');
    expect(info.endpoints.wizardDownloads).toBe('https://mcp.sap.oobeprotocol.ai/wizard/downloads.json');
    expect(info.downloads.desktopWizard.windowsX64Setup).toBe(`${githubReleaseBaseUrl}/SAP-MCP-Wizard-Setup-${MCP_SERVER_VERSION}-x64.exe`);
    expect(info.downloads.desktopWizard.macosArm64Dmg).toBe(`${githubReleaseBaseUrl}/SAP-MCP-Wizard-${MCP_SERVER_VERSION}-arm64.dmg`);
    expect(info.downloads.desktopWizard.linuxX64TarGz).toBe(`${githubReleaseBaseUrl}/sap-mcp-wizard-${MCP_SERVER_VERSION}-x64.tar.gz`);
    expect(info.payments).toEqual(paymentDiscovery);
    expect(info.capabilities.payments).toEqual(['x402', 'pay.sh']);
    expect(info.security.keypairBytesExposed).toBe(false);
    expect(info.security.rpcSecretsExposed).toBe(false);
    expect(JSON.stringify(info)).not.toContain('api_key=');
    expect(JSON.stringify(info)).not.toContain('/Users/keepeeto');
  });

  it('publishes a Smithery-compatible static MCP server card', async () => {
    const req = { headers: { host: 'mcp.sap.oobeprotocol.ai', 'x-forwarded-proto': 'https' } } as IncomingMessage;
    const card = await buildStaticServerCard(req, publicRemoteConfig, appConfig);
    const firstTool = card.tools[0] as {
      title?: string;
      outputSchema?: unknown;
      annotations?: unknown;
    };

    expect(card).toMatchObject({
      name: 'sap-mcp-server',
      displayName: 'SAP MCP Server | OOBE Protocol',
      display_name: 'SAP MCP Server | OOBE Protocol',
      title: 'SAP MCP Server | OOBE Protocol',
      version: MCP_SERVER_VERSION,
      description: expect.stringContaining('Solana-native MCP gateway'),
      homepage: 'https://mcp.sap.oobeprotocol.ai/',
      websiteUrl: 'https://mcp.sap.oobeprotocol.ai/',
      website_url: 'https://mcp.sap.oobeprotocol.ai/',
      icon: 'https://mcp.sap.oobeprotocol.ai/favicon.png',
      iconUrl: 'https://mcp.sap.oobeprotocol.ai/favicon.png',
      icon_url: 'https://mcp.sap.oobeprotocol.ai/favicon.png',
      image: 'https://mcp.sap.oobeprotocol.ai/favicon.png',
      logo: 'https://mcp.sap.oobeprotocol.ai/favicon.png',
    });
    expect(card.icons[0]).toMatchObject({
      src: 'https://mcp.sap.oobeprotocol.ai/favicon.png',
      mimeType: 'image/png',
      sizes: ['512x512'],
    });
    expect(card.serverInfo).toMatchObject({
      name: 'sap-mcp-server',
      displayName: 'SAP MCP Server | OOBE Protocol',
      display_name: 'SAP MCP Server | OOBE Protocol',
      title: 'SAP MCP Server | OOBE Protocol',
      version: MCP_SERVER_VERSION,
      description: expect.stringContaining('Solana-native MCP gateway'),
      homepage: 'https://mcp.sap.oobeprotocol.ai/',
      websiteUrl: 'https://mcp.sap.oobeprotocol.ai/',
      website_url: 'https://mcp.sap.oobeprotocol.ai/',
      icon: 'https://mcp.sap.oobeprotocol.ai/favicon.png',
      iconUrl: 'https://mcp.sap.oobeprotocol.ai/favicon.png',
      icon_url: 'https://mcp.sap.oobeprotocol.ai/favicon.png',
      image: 'https://mcp.sap.oobeprotocol.ai/favicon.png',
      logo: 'https://mcp.sap.oobeprotocol.ai/favicon.png',
    });
    expect(card.serverInfo.icons[0]).toMatchObject({
      src: 'https://mcp.sap.oobeprotocol.ai/favicon.png',
      mimeType: 'image/png',
      sizes: ['512x512'],
    });
    expect(card.authentication).toEqual({ required: false, schemes: ['none', 'x402'] });
    expect(card.configuration).toMatchObject({
      required: false,
      schemaUrl: 'https://mcp.sap.oobeprotocol.ai/smithery.config.schema.json',
      recommendedMode: 'free-discovery',
      paidToolModes: ['x402-native-client', 'local-sap-payments-bridge'],
      setupCommand: expect.stringContaining('sap-mcp-config wizard'),
      localBridge: {
        serverName: 'sap_payments',
        readinessTool: 'sap_payments_readiness',
        paidCallTool: 'sap_payments_call_paid_tool',
      },
    });
    expect(card.configuration.instructions).toContain('sap_agent_start');
    expect(card.configuration.instructions).toContain('sap_skills_bundle');
    expect(card.configuration.instructions).toContain('sap_payments');
    expect(card.configuration.instructions).toContain('never receives user keypair bytes');
    expect(card.transport).toEqual({
      type: 'streamable-http',
      url: 'https://mcp.sap.oobeprotocol.ai/mcp',
    });
    expect(card.tools).toHaveLength(278);
    expect(card.tools.some((tool) => tool.name === 'sap_agent_start')).toBe(true);
    expect(card.tools.some((tool) => tool.name === 'sap_agent_runtime_status')).toBe(true);
    expect(card.tools.some((tool) => tool.name === 'sap_agent_context')).toBe(true);
    expect(card.tools.some((tool) => tool.name === 'sap_agent_next_action')).toBe(true);
    expect(card.tools.some((tool) => tool.name === 'sap_pricing_catalog')).toBe(true);
    expect(card.tools.some((tool) => tool.name === 'sap_protocol_invariants')).toBe(true);
    expect(card.tools.some((tool) => tool.name === 'sap_agent_identity_plan')).toBe(true);
    expect(card.tools.some((tool) => tool.name === 'sap_skills_upgrade_plan')).toBe(true);
    expect(card.tools.some((tool) => tool.name === 'sap_runtime_repair_plan')).toBe(true);
    expect(card.tools.some((tool) => tool.name === 'sap_create_escrow')).toBe(false);
    expect(card.tools.some((tool) => tool.name === 'sap_create_escrow_v2')).toBe(true);
    expect(card.tools.some((tool) => tool.name === 'sap_payments_call_paid_tool')).toBe(false);
    expect(card.prompts.length).toBeGreaterThan(0);
    expect(firstTool.title).toBeTruthy();
    expect(firstTool.outputSchema).toMatchObject({ type: 'object' });
    expect(firstTool.annotations).toMatchObject({
      readOnlyHint: expect.any(Boolean),
      destructiveHint: expect.any(Boolean),
      idempotentHint: expect.any(Boolean),
      openWorldHint: expect.any(Boolean),
    });
  });

  it('builds marketplace configuration metadata for Smithery x402 setup UX', () => {
    const req = { headers: { host: 'mcp.sap.oobeprotocol.ai', 'x-forwarded-proto': 'https' } } as IncomingMessage;
    const metadata = buildMarketplaceConfigurationMetadata(req, publicRemoteConfig);

    expect(metadata.required).toBe(false);
    expect(metadata.schemaUrl).toBe('https://mcp.sap.oobeprotocol.ai/smithery.config.schema.json');
    expect(metadata.configSchema).toMatchObject({
      title: 'SAP MCP Smithery Setup',
      properties: {
        usageMode: {
          default: 'free-discovery',
        },
        x402Payer: {
          default: 'none',
        },
      },
    });
  });

  it('publishes x402scan-compatible discovery metadata', () => {
    const req = { headers: { host: 'mcp.sap.oobeprotocol.ai', 'x-forwarded-proto': 'https' } } as IncomingMessage;

    const openApi = buildOpenApiSpec(req, publicRemoteConfig) as {
      info: { version: string };
      'x-discovery': {
        resources: string[];
        openApi: string;
        x402Discovery: string;
        payShProvider: string;
        payments: typeof paymentDiscovery;
      };
      'x-pay-sh': { providerYaml: string };
      paths: {
        '/mcp': {
          post: {
            'x-payment-info': {
              protocols: string[];
              network: string;
              asset: string;
              payTo: string;
              facilitator: typeof paymentDiscovery.facilitator;
            };
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    oneOf: Array<{
                      properties?: {
                        params?: {
                          description?: string;
                        };
                      };
                    }>;
                  };
                };
              };
            };
            summary: string;
            responses: {
              '200': {
                content: Record<string, unknown>;
              };
              '402': unknown;
            };
          };
        };
      };
    };
    const wellKnown = buildX402DiscoveryDocument(req, publicRemoteConfig);

    expect(openApi.info.version).toBe(MCP_SERVER_VERSION);
    expect(openApi['x-discovery'].resources).toEqual(['https://mcp.sap.oobeprotocol.ai/mcp']);
    expect(openApi['x-discovery'].openApi).toBe('https://mcp.sap.oobeprotocol.ai/openapi.json');
    expect(openApi['x-discovery'].pricing).toBe('https://mcp.sap.oobeprotocol.ai/pricing.json');
    expect(openApi['x-discovery'].x402Discovery).toBe('https://mcp.sap.oobeprotocol.ai/.well-known/x402');
    expect(openApi['x-discovery'].payShProvider).toBe('https://mcp.sap.oobeprotocol.ai/pay/provider.yml');
    expect(openApi['x-pay-sh'].providerYaml).toBe('https://mcp.sap.oobeprotocol.ai/pay/provider.yml');
    expect(openApi['x-discovery'].payments).toEqual(paymentDiscovery);
    expect(openApi.paths).not.toHaveProperty('/pay/provider.yml');
    expect(openApi.paths['/mcp'].post['x-payment-info'].protocols).toEqual(['x402']);
    expect(openApi.paths['/mcp'].post['x-payment-info'].network).toBe(paymentDiscovery.network);
    expect(openApi.paths['/mcp'].post['x-payment-info'].asset).toBe(paymentDiscovery.asset);
    expect(openApi.paths['/mcp'].post['x-payment-info'].payTo).toBe(paymentDiscovery.payTo);
    expect(openApi.paths['/mcp'].post['x-payment-info'].facilitator).toEqual(paymentDiscovery.facilitator);
    expect(openApi.paths['/mcp'].post.summary.length).toBeLessThanOrEqual(63);
    const requestBodySchemas = openApi.paths['/mcp'].post.requestBody.content['application/json'].schema.oneOf;
    expect(requestBodySchemas.length).toBe(2);
    expect(requestBodySchemas[0]?.properties?.params?.description).toContain('JSON-RPC parameters');
    expect(requestBodySchemas[1]?.properties?.params?.description).toContain('MCP tools/call parameters');
    expect(openApi.paths['/mcp'].post.responses['200'].content['text/event-stream']).toBeDefined();
    expect(openApi.paths['/mcp'].post.responses['402']).toBeDefined();
    expect(wellKnown).toEqual({
      version: 1,
      resources: ['https://mcp.sap.oobeprotocol.ai/mcp'],
      payments: paymentDiscovery,
      instructions: expect.stringContaining('Probe POST /mcp'),
    });
  });

  it('publishes a public pay.sh provider YAML without RPC secrets or signer paths', () => {
    const req = { headers: { host: 'mcp.sap.oobeprotocol.ai', 'x-forwarded-proto': 'https' } } as IncomingMessage;
    const yaml = buildPublicPayShProviderYaml(req, publicRemoteConfig, {
      ...appConfig,
      rpcUrl: 'https://private-rpc.example/rpc?api_key=super-secret',
    });

    expect(yaml).toContain("name: 'oobe-sap-mcp'");
    expect(yaml).toContain("subdomain: 'oobe-sap-mcp'");
    expect(yaml).toContain('routing:');
    expect(yaml).toContain("  url: 'https://mcp.sap.oobeprotocol.ai/'");
    expect(yaml).toContain('operator:');
    expect(yaml).toContain('  network: devnet');
    expect(yaml).toContain("  recipient: '11111111111111111111111111111111'");
    expect(yaml).toContain("    path: 'mcp'");
    expect(yaml).toContain('    metering:');
    expect(yaml).toContain('            - price_usd: 0.001');
    expect(yaml).not.toContain('api_key=');
    expect(yaml).not.toContain('super-secret');
    expect(yaml).not.toContain('rpc_url:');
    expect(yaml).not.toContain('signer:');
    expect(yaml).not.toContain('/Users/keepeeto');
  });

  it('renders professional Open Graph metadata for root and MCP URL previews', () => {
    const config = {
      port: 8787,
      host: '127.0.0.1',
      auth: { type: 'none' as const },
      stateless: true,
      rateLimit: {
        enabled: true,
        requestsPerMinute: 60,
        keyPrefix: 'test:',
      },
    };
    const req = { headers: { host: 'mcp.sap.oobeprotocol.ai', 'x-forwarded-proto': 'https' } } as IncomingMessage;

    const root = buildLandingHtml(req, config);
    const mcp = buildLandingHtml(req, config, 'mcp');

    expect(root).toContain('<meta property="og:title" content="SAP MCP Server | OOBE Protocol">');
    expect(root).toContain('<link rel="icon" type="image/x-icon" href="/favicon.ico">');
    expect(root).toContain('<link rel="icon" type="image/png" href="/favicon.png">');
    expect(root).toContain('href="https://mcp.sap.oobeprotocol.ai/docs"');
    expect(root).toContain('href="https://mcp.sap.oobeprotocol.ai/openapi.json"');
    expect(root).toContain('href="https://mcp.sap.oobeprotocol.ai/pay/provider.yml"');
    expect(root).toContain('https://mcp.sap.oobeprotocol.ai/server.json');
    expect(root).toContain('Facilitator Volume');
    expect(root).toContain('Total Settlements');
    expect(root).toContain('SAP MCP compatible agent runtimes');
    expect(root).toContain('<strong>Hermes</strong>');
    expect(root).toContain('<strong>Codex</strong>');
    expect(root).toContain('<strong>Claude</strong>');
    expect(root).toContain('<strong>OpenClaw</strong>');
    expect(root).toContain('/logos/hermes.png');
    expect(root).toContain('/logos/codex.webp');
    expect(root).toContain('/logos/claude.png');
    expect(root).toContain('/logos/openclaw.svg');
    expect(root).not.toContain('Caller Fingerprints');
    expect(root).not.toContain('caller origins');
    expect(root).toContain('Native Downloads');
    expect(root).toContain(`SAP-MCP-Wizard-Setup-${MCP_SERVER_VERSION}-x64.exe`);
    expect(root).toContain(`SAP-MCP-Wizard-${MCP_SERVER_VERSION}-arm64.dmg`);
    expect(root).toContain(`sap-mcp-wizard-${MCP_SERVER_VERSION}-x64.tar.gz`);
    expect(root).toContain('/wizard/downloads.json');
    expect(root).toContain('curl -fsSL https://mcp.sap.oobeprotocol.ai/wizard/install.sh | sh');
    expect(root).toContain('npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config wizard');
    expect(root).toContain('x402 Challenge Tools For Agents');
    expect(root).toContain('sap_payments_readiness');
    expect(root).toContain('sap_payments_call_paid_tool');
    expect(root).toContain('~/.config/mcp-sap/addons/x402-paid-call');
    expect(root).toContain('npx --yes --package @oobe-protocol-labs/sap-mcp-server sap-mcp-x402-paid-call');
    expect(root).toContain('<strong>x402:</strong>');
    expect(root).toContain('<strong>pay.sh:</strong>');
    expect(root).toContain('https://mcp.sap.oobeprotocol.ai/pay/provider.yml');
    expect(mcp).toContain('SAP MCP Streamable HTTP Endpoint | OOBE Protocol');
    expect(mcp).toContain('Accept: application/json, text/event-stream');
  });

  it('renders a Docsify documentation shell for /docs', () => {
    const config = {
      port: 8787,
      host: '127.0.0.1',
      auth: { type: 'none' as const },
      stateless: true,
      rateLimit: {
        enabled: true,
        requestsPerMinute: 60,
        keyPrefix: 'test:',
      },
    };
    const req = { headers: { host: 'mcp.sap.oobeprotocol.ai', 'x-forwarded-proto': 'https' } } as IncomingMessage;
    const docs = buildDocsHtml(req, config);

    expect(docs).toContain('<title>SAP MCP Documentation | OOBE Protocol</title>');
    expect(docs).toContain('https://cdn.jsdelivr.net/npm/docsify@4.13.1/lib/docsify.min.js');
    expect(docs).toContain('homepage');
    expect(docs).toContain('README.md');
    expect(docs).toContain('Search SAP MCP docs');
    expect(docs).toContain('https://mcp.sap.oobeprotocol.ai/docs');
  });

  it('resolves favicon.ico for browser GETs and crawler HEAD probes', () => {
    const head = resolvePublicLogoAsset('HEAD', '/favicon.ico');
    const get = resolvePublicLogoAsset('GET', '/favicon.ico');

    expect(head?.contentType).toBe('image/x-icon');
    expect(head?.contentLength).toBeGreaterThan(0);
    expect(head?.body).toBeUndefined();
    expect(get?.contentType).toBe('image/x-icon');
    expect(get?.body?.byteLength).toBeGreaterThan(0);
    expect(resolvePublicLogoAsset('POST', '/favicon.ico')).toBeUndefined();
  });

  it('serves allowlisted public protocol and registry logos only', () => {
    const head = resolvePublicLogoAsset('HEAD', '/logos/smithery.svg');
    const get = resolvePublicLogoAsset('GET', '/logos/jupiter.ico');

    expect(head?.contentType).toBe('image/svg+xml');
    expect(head?.contentLength).toBeGreaterThan(0);
    expect(head?.body).toBeUndefined();
    expect(get?.contentType).toBe('image/x-icon');
    expect(get?.body?.byteLength).toBeGreaterThan(0);
    expect(resolvePublicLogoAsset('GET', '/logos/unknown.svg')).toBeUndefined();
    expect(resolvePublicLogoAsset('POST', '/logos/smithery.svg')).toBeUndefined();
  });

  it('serves official runtime logos for the hosted dashboard carousel', () => {
    const hermes = resolvePublicLogoAsset('GET', '/logos/hermes.png');
    const claude = resolvePublicLogoAsset('GET', '/logos/claude.png');
    const codex = resolvePublicLogoAsset('GET', '/logos/codex.webp');
    const openClaw = resolvePublicLogoAsset('GET', '/logos/openclaw.svg');

    expect(hermes?.contentType).toBe('image/png');
    expect(claude?.contentType).toBe('image/png');
    expect(codex?.contentType).toBe('image/webp');
    expect(openClaw?.contentType).toBe('image/svg+xml');
    expect(hermes?.body?.byteLength).toBeGreaterThan(0);
    expect(claude?.body?.byteLength).toBeGreaterThan(0);
    expect(codex?.body?.byteLength).toBeGreaterThan(0);
    expect(openClaw?.body?.byteLength).toBeGreaterThan(0);
  });

  it('resolves hosted docs markdown safely from docs and USER_DOCS', () => {
    const root = resolvePublicDocsMarkdown('GET', '/docs/README.md');
    const sidebar = resolvePublicDocsMarkdown('GET', '/docs/_sidebar.md');
    const user = resolvePublicDocsMarkdown('GET', '/docs/user/01_HOSTED_REMOTE_MCP.md');
    const head = resolvePublicDocsMarkdown('HEAD', '/docs/README.md');

    expect(root?.contentType).toBe('text/markdown; charset=utf-8');
    expect(root?.body).toContain('SAP MCP Documentation');
    expect(sidebar?.body).toContain('Hosted Remote MCP');
    expect(user?.body).toContain('https://mcp.sap.oobeprotocol.ai/mcp');
    expect(head?.body).toBeUndefined();
    expect(head?.contentLength).toBeGreaterThan(0);
    expect(resolvePublicDocsMarkdown('GET', '/docs/../package.json')).toBeUndefined();
    expect(resolvePublicDocsMarkdown('POST', '/docs/README.md')).toBeUndefined();
  });
});
