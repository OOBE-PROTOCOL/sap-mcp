#!/usr/bin/env node
/**
 * @name RemoteMCPServer
 * @description Streamable HTTP entrypoint for remote SAP MCP deployments.
 */

import { randomUUID } from 'crypto';
import * as http from 'http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { loadConfig, type SapMcpConfig } from '../config/env.js';
import { MCP_SERVER_VERSION } from '../core/constants.js';
import { logger, initLogger } from '../core/logger.js';
import { createSapMcpServer } from '../server/create-server.js';
import { AuthManager, type RemoteAuthConfig } from './auth/index.js';
import { McpMonetizationGate } from '../payments/index.js';
import { RemoteRateLimiter, buildRemoteRateLimitConfigFromEnv, type RemoteRateLimitConfig } from './rate-limiter.js';

/**
 * @name RemoteMCPConfig
 * @description Resolved runtime configuration for the remote MCP HTTP server.
 */
export interface RemoteMCPConfig {
  port: number;
  host: string;
  corsOrigins?: string[];
  auth: RemoteAuthConfig;
  stateless: boolean;
  rateLimit: RemoteRateLimitConfig;
}

/**
 * @name A2AAgentCard
 * @description Public discovery document returned for A2A-compatible orchestrators.
 */
export interface A2AAgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  protocol: {
    primary: 'mcp';
    transport: 'streamable-http';
    endpoint: string;
  };
  capabilities: {
    streaming: boolean;
    tools: boolean;
    resources: boolean;
    prompts: boolean;
    authenticated: boolean;
  };
  authentication: {
    schemes: readonly ('Bearer' | 'x402' | 'none')[];
    required: boolean;
  };
  defaultInputModes: readonly ['application/json'];
  defaultOutputModes: readonly ['application/json', 'text/event-stream'];
  skills: ReadonlyArray<{
    id: string;
    name: string;
    description: string;
    tags: readonly string[];
  }>;
  setup: {
    wizard: WizardInstallDescriptor;
  };
}

/**
 * @name WizardInstallDescriptor
 * @description Public hosted metadata that tells agents and users how to install the local SAP MCP wizard.
 */
export interface WizardInstallDescriptor {
  name: 'SAP MCP Wizard';
  version: string;
  packageName: '@oobe-protocol-labs/sap-mcp-server';
  hostedMcpUrl: string;
  configDirectory: '~/.config/mcp-sap';
  requiredFor: readonly string[];
  endpoints: {
    descriptor: string;
    installScript: string;
    mcp: string;
  };
  commands: {
    runWizard: string;
    showConfig: string;
    showProfile: string;
  };
  security: {
    keypairBytesExposed: false;
    modifiesSolanaCliKeypair: false;
    signerLocation: 'user-machine-or-external-signer';
  };
}

/**
 * @name parseApiKeys
 * @description Parses comma-separated `apiKey=userId` entries from environment configuration.
 */
export function parseApiKeys(raw: string | undefined): Map<string, string> {
  const keys = new Map<string, string>();
  if (!raw) {
    return keys;
  }

  for (const pair of raw.split(',')) {
    const [key, userId] = pair.split('=');
    if (key?.trim() && userId?.trim()) {
      keys.set(key.trim(), userId.trim());
    }
  }

  return keys;
}

/**
 * @name defaultRemoteConfig
 * @description Builds remote-server configuration from SAP config plus remote-specific environment values.
 */
export function defaultRemoteConfig(appConfig: SapMcpConfig): RemoteMCPConfig {
  const rawAuthType = process.env.SAP_MCP_AUTH_TYPE;
  const authType = rawAuthType === 'none' || rawAuthType === 'jwt' ? rawAuthType : 'api_key';
  const secret = process.env.SAP_MCP_AUTH_SECRET?.trim() ?? '';

  const port = Number.parseInt(
    process.env.SAP_MCP_PORT ?? String(appConfig.httpPort || 3000),
    10,
  );
  const host = process.env.SAP_MCP_HOST ?? appConfig.httpHost ?? '0.0.0.0';
  const baseConfig = {
    port,
    host,
    corsOrigins: appConfig.httpCorsOrigins,
    stateless: parseRemoteBoolean(process.env.SAP_MCP_HTTP_STATELESS, appConfig.mode === 'hosted-api'),
    rateLimit: buildRemoteRateLimitConfigFromEnv(appConfig.rateLimitPerMinute),
  };

  if (authType === 'none') {
    return {
      ...baseConfig,
      auth: {
        type: 'none',
      },
    };
  }

  if (authType === 'jwt') {
    return {
      ...baseConfig,
      auth: {
        type: 'jwt',
        secret,
        issuer: 'sap-mcp-remote',
      },
    };
  }

  const keys = parseApiKeys(process.env.SAP_MCP_API_KEYS);
  if (secret) {
    keys.set(secret, 'default');
  }

  return {
    ...baseConfig,
    auth: {
      type: 'api_key',
      keys,
    },
  };
}

function parseRemoteBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) {
    return fallback;
  }
  return ['true', '1', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

/**
 * @name writeJson
 * @description Writes a JSON response with optional additional headers.
 */
function writeJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  headers: http.OutgoingHttpHeaders = {},
): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

/**
 * @name getRateLimitKey
 * @description Resolves the best available caller identity for hosted MCP rate limiting behind a reverse proxy.
 */
function getRateLimitKey(req: http.IncomingMessage): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown';
  }
  if (Array.isArray(forwardedFor) && forwardedFor[0]) {
    return forwardedFor[0].split(',')[0]?.trim() || 'unknown';
  }
  return req.socket.remoteAddress || 'unknown';
}

/**
 * @name buildPublicBaseUrl
 * @description Resolves the external base URL used in public discovery responses.
 */
function buildPublicBaseUrl(req: http.IncomingMessage, config: RemoteMCPConfig): string {
  if (process.env.SAP_MCP_PUBLIC_URL) {
    return process.env.SAP_MCP_PUBLIC_URL.replace(/\/$/, '');
  }

  const host = req.headers.host || `${config.host}:${config.port}`;
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || 'http';
  return `${proto}://${host}`;
}

/**
 * @name buildA2AAgentCard
 * @description Builds the public A2A-compatible agent-card document for remote discovery.
 */
export function buildA2AAgentCard(
  req: http.IncomingMessage,
  config: RemoteMCPConfig,
): A2AAgentCard {
  const baseUrl = buildPublicBaseUrl(req, config);
  const authRequired = config.auth.type !== 'none';
  return {
    name: 'SAP MCP Server',
    description: authRequired
      ? 'Authenticated SAP Protocol and Solana agent gateway exposed through native MCP Streamable HTTP.'
      : 'Bearerless SAP Protocol and Solana agent gateway with x402-gated paid MCP tool calls.',
    url: `${baseUrl}/mcp`,
    version: MCP_SERVER_VERSION,
    protocol: {
      primary: 'mcp',
      transport: 'streamable-http',
      endpoint: `${baseUrl}/mcp`,
    },
    capabilities: {
      streaming: true,
      tools: true,
      resources: true,
      prompts: true,
      authenticated: authRequired,
    },
    authentication: {
      schemes: authRequired ? ['Bearer'] : ['none', 'x402'],
      required: authRequired,
    },
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json', 'text/event-stream'],
    skills: [
      {
        id: 'sap-protocol',
        name: 'SAP Protocol Operations',
        description: 'Agent registry, identity, memory, reputation, execution proof, payments, and settlement tools.',
        tags: ['sap', 'solana', 'mcp'],
      },
      {
        id: 'sap-discovery',
        name: 'SAP Discovery And Directory',
        description: 'Network overview, global agent enumeration, protocol indexes, capability indexes, and tool category discovery.',
        tags: ['sap', 'discovery', 'agents', 'indexing'],
      },
      {
        id: 'sap-payments',
        name: 'SAP Payments And Escrow',
        description: 'x402 payment context, subscriptions, escrow v1/v2, settlement batches, disputes, and stake-backed trust flows.',
        tags: ['sap', 'x402', 'payments', 'escrow'],
      },
      {
        id: 'sap-memory',
        name: 'SAP Memory And Ledger',
        description: 'Encrypted vaults, sessions, inscriptions, compact memory, session ledgers, epoch pages, and durable memory reads.',
        tags: ['sap', 'memory', 'vault', 'ledger'],
      },
      {
        id: 'sap-sns',
        name: 'SAP SNS Domains',
        description: 'SNS domain availability, resolution, records, ownership, unsigned transaction builders, and agent domain registration.',
        tags: ['sap', 'sns', 'domains', 'identity'],
      },
      {
        id: 'solana-tools',
        name: 'Solana Tooling',
        description: 'Solana RPC, token, NFT, DeFi, and AgentKit plugin tools.',
        tags: ['solana', 'rpc', 'defi', 'nft'],
      },
    ],
    setup: {
      wizard: buildWizardInstallDescriptor(req, config),
    },
  };
}

/**
 * @name buildWizardInstallDescriptor
 * @description Builds the public wizard installation descriptor used by agents when local SAP MCP config is missing.
 */
export function buildWizardInstallDescriptor(
  req: http.IncomingMessage,
  config: RemoteMCPConfig,
): WizardInstallDescriptor {
  const baseUrl = buildPublicBaseUrl(req, config);
  return {
    name: 'SAP MCP Wizard',
    version: MCP_SERVER_VERSION,
    packageName: '@oobe-protocol-labs/sap-mcp-server',
    hostedMcpUrl: `${baseUrl}/mcp`,
    configDirectory: '~/.config/mcp-sap',
    requiredFor: [
      'creating a user SAP MCP profile',
      'configuring a dedicated wallet or external signer',
      'signing x402/pay.sh payment payloads',
      'signing value-moving SAP or Solana tool transactions',
      'injecting hosted or local MCP config into Claude, Hermes, OpenClaw, or Codex',
    ],
    endpoints: {
      descriptor: `${baseUrl}/.well-known/sap-mcp-wizard.json`,
      installScript: `${baseUrl}/wizard/install.sh`,
      mcp: `${baseUrl}/mcp`,
    },
    commands: {
      runWizard: 'npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config wizard',
      showConfig: 'npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config show',
      showProfile: 'npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config profile-info',
    },
    security: {
      keypairBytesExposed: false,
      modifiesSolanaCliKeypair: false,
      signerLocation: 'user-machine-or-external-signer',
    },
  };
}

/**
 * @name buildWizardInstallScript
 * @description Builds a small shell launcher that downloads the npm package and starts the wizard.
 */
export function buildWizardInstallScript(
  req: http.IncomingMessage,
  config: RemoteMCPConfig,
): string {
  const descriptor = buildWizardInstallDescriptor(req, config);
  return [
    '#!/usr/bin/env sh',
    'set -eu',
    '',
    'echo "SAP MCP Wizard"',
    `echo "Hosted MCP: ${descriptor.hostedMcpUrl}"`,
    `echo "Config dir:  ${descriptor.configDirectory}"`,
    'echo ""',
    'if ! command -v node >/dev/null 2>&1; then',
    '  echo "Node.js 18+ is required before running the SAP MCP wizard." >&2',
    '  exit 1',
    'fi',
    '',
    descriptor.commands.runWizard,
    '',
  ].join('\n');
}

/**
 * @name RemoteMCPServer
 * @description Remote MCP server backed by the official Streamable HTTP transport.
 */
export class RemoteMCPServer {
  private readonly config: RemoteMCPConfig;
  private readonly appConfig: SapMcpConfig;
  private readonly authManager: AuthManager;
  private readonly rateLimiter: RemoteRateLimiter;
  private transport?: StreamableHTTPServerTransport;
  private httpServer?: http.Server;

  public constructor(config?: RemoteMCPConfig) {
    this.appConfig = loadConfig();
    initLogger({
      level: this.appConfig.logLevel,
      format: this.appConfig.logFormat || 'pretty',
      file: this.appConfig.logFile,
    });

    this.config = config ?? defaultRemoteConfig(this.appConfig);
    this.authManager = new AuthManager(this.config.auth);
    this.rateLimiter = new RemoteRateLimiter(this.config.rateLimit);
  }

  /**
   * @name start
   * @description Starts the remote MCP endpoint, health check, and A2A discovery routes.
   */
  public async start(): Promise<void> {
    this.validateAuthConfig();
    await this.rateLimiter.initialize();

    const server = await createSapMcpServer(this.appConfig);
    this.transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: this.config.stateless ? undefined : () => randomUUID(),
    });
    await server.connect(this.transport);
    const monetizationGate = await McpMonetizationGate.create(this.appConfig);

    this.httpServer = http.createServer(async (req, res) => {
      if (this.applyCors(req, res)) {
        return;
      }

      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      if (req.method === 'GET' && url.pathname === '/health') {
        writeJson(res, 200, {
          status: 'ok',
          service: 'sap-mcp-remote',
          transport: 'streamable-http',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (req.method === 'GET' && ['/.well-known/agent-card.json', '/a2a/agent-card'].includes(url.pathname)) {
        writeJson(res, 200, buildA2AAgentCard(req, this.config));
        return;
      }

      if (req.method === 'GET' && ['/.well-known/sap-mcp-wizard.json', '/wizard', '/wizard.json'].includes(url.pathname)) {
        writeJson(res, 200, buildWizardInstallDescriptor(req, this.config));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/wizard/install.sh') {
        res.writeHead(200, {
          'Content-Type': 'text/x-shellscript; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
        });
        res.end(buildWizardInstallScript(req, this.config));
        return;
      }

      if (url.pathname !== '/mcp') {
        writeJson(res, 404, { error: 'Not Found' });
        return;
      }

      const rateLimit = await this.rateLimiter.check(getRateLimitKey(req));
      res.setHeader('X-RateLimit-Limit', String(rateLimit.limit));
      res.setHeader('X-RateLimit-Remaining', String(rateLimit.remaining));
      res.setHeader('X-RateLimit-Reset', String(rateLimit.resetSeconds));
      if (!rateLimit.allowed) {
        writeJson(res, 429, {
          error: 'rate_limited',
          retryAfterSeconds: rateLimit.resetSeconds,
        }, {
          'Retry-After': String(rateLimit.resetSeconds),
        });
        return;
      }

      const auth = this.authManager.validateFromHeaders(req.headers);
      if (!auth.success) {
        writeJson(res, 401, { error: auth.error || 'Unauthorized' }, {
          'WWW-Authenticate': 'Bearer',
        });
        return;
      }

      try {
        if (monetizationGate) {
          await monetizationGate.handle(req, res, async (mcpReq, mcpRes, parsedBody) => {
            await this.transport?.handleRequest(mcpReq, mcpRes, parsedBody);
          });
        } else {
          await this.transport?.handleRequest(req, res);
        }
      } catch (error) {
        logger.error('Remote MCP request failed', { error });
        if (!res.headersSent) {
          writeJson(res, 500, {
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
            },
            id: null,
          });
        }
      }
    });

    await new Promise<void>((resolve, reject) => {
      this.httpServer?.once('error', reject);
      this.httpServer?.listen(this.config.port, this.config.host, resolve);
    });

    logger.info('SAP MCP Remote Server started', {
      endpoint: `http://${this.config.host}:${this.config.port}/mcp`,
      health: `http://${this.config.host}:${this.config.port}/health`,
      a2aAgentCard: `http://${this.config.host}:${this.config.port}/.well-known/agent-card.json`,
      wizardDescriptor: `http://${this.config.host}:${this.config.port}/.well-known/sap-mcp-wizard.json`,
      transport: 'streamable-http',
      authType: this.config.auth.type,
      stateless: this.config.stateless,
      rateLimitPerMinute: this.config.rateLimit.enabled ? this.config.rateLimit.requestsPerMinute : 0,
      redisRateLimit: Boolean(this.config.rateLimit.redisUrl),
    });
  }

  /**
   * @name stop
   * @description Gracefully closes the MCP transport and HTTP listener.
   */
  public async stop(): Promise<void> {
    await this.transport?.close();
    if (!this.httpServer) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.httpServer?.close(() => resolve());
      setTimeout(() => {
        this.httpServer?.closeAllConnections();
        resolve();
      }, 5_000);
    });
    await this.rateLimiter.close();
  }

  /**
   * @name validateAuthConfig
   * @description Fails startup when configured remote authentication is incomplete.
   */
  private validateAuthConfig(): void {
    if (this.config.auth.type === 'none') {
      return;
    }
    if (this.config.auth.type === 'api_key' && this.config.auth.keys.size === 0) {
      throw new Error('Remote MCP API-key auth requires SAP_MCP_API_KEYS or SAP_MCP_AUTH_SECRET');
    }
    if (this.config.auth.type === 'jwt' && !this.config.auth.secret) {
      throw new Error('Remote MCP JWT auth requires SAP_MCP_AUTH_SECRET');
    }
  }

  /**
   * @name applyCors
   * @description Applies configured CORS headers and handles preflight requests.
   */
  private applyCors(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const configuredOrigins = this.config.corsOrigins?.filter(Boolean) ?? [];
    const origin = req.headers.origin;
    if (typeof origin === 'string' && configuredOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, mcp-session-id, mcp-protocol-version, PAYMENT-SIGNATURE, X-PAYMENT');
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-PAYMENT-RESPONSE');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return true;
    }

    return false;
  }
}

/**
 * @name startRemoteMcpServerProcess
 * @description Starts the remote MCP HTTP server and installs process signal handlers for CLI/PM2 execution.
 */
export async function startRemoteMcpServerProcess(): Promise<void> {
  initLogger({
    level: process.env.SAP_MCP_LOG_LEVEL === 'debug' ? 'debug' : 'info',
    format: process.env.SAP_MCP_LOG_FORMAT === 'json' ? 'json' : 'pretty',
  });

  const server = new RemoteMCPServer();

  process.on('SIGINT', () => {
    void server.stop().then(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    void server.stop().then(() => process.exit(0));
  });

  await server.start();
}

if (process.argv[1]?.endsWith('server.js') || process.argv[1]?.endsWith('server.ts')) {
  startRemoteMcpServerProcess().catch((error: unknown) => {
    logger.error('Failed to start remote MCP server', { error });
    process.exit(1);
  });
}
