import type { IncomingMessage } from 'http';
import { afterEach, describe, expect, it } from 'vitest';
import type { SapMcpConfig } from '../config/env.js';
import { MCP_SERVER_VERSION } from '../core/constants.js';
import {
  buildA2AAgentCard,
  buildDocsHtml,
  buildLandingHtml,
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
    expect(info.endpoints.openApi).toBe('https://mcp.sap.oobeprotocol.ai/openapi.json');
    expect(info.endpoints.x402Discovery).toBe('https://mcp.sap.oobeprotocol.ai/.well-known/x402');
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
    expect(card.transport).toEqual({
      type: 'streamable-http',
      url: 'https://mcp.sap.oobeprotocol.ai/mcp',
    });
    expect(card.tools).toHaveLength(268);
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
    expect(yaml).toContain('            - price_usd: 0.008');
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
