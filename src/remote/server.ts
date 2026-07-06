#!/usr/bin/env node
/**
 * @name RemoteMCPServer
 * @description Streamable HTTP entrypoint for remote SAP MCP deployments.
 */

import { randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import * as http from 'http';
import { dirname, join, posix } from 'path';
import { fileURLToPath } from 'url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { getDataDir, loadConfig, type SapMcpConfig } from '../config/env.js';
import { MCP_SERVER_VERSION } from '../core/constants.js';
import { logger, initLogger } from '../core/logger.js';
import { createSapMcpServer } from '../server/create-server.js';
import { AuthManager, type RemoteAuthConfig } from './auth/index.js';
import { McpMonetizationGate } from '../payments/index.js';
import { RemoteRateLimiter, buildRemoteRateLimitConfigFromEnv, type RemoteRateLimitConfig } from './rate-limiter.js';
import type { PaymentLedgerEvent } from '../payments/usage-ledger.js';

const PUBLIC_SERVER_TITLE = 'SAP MCP Server | OOBE Protocol';
const PUBLIC_SERVER_DESCRIPTION = 'Hosted Solana-native MCP gateway for Synapse Agent Protocol tools, x402/pay.sh monetization, SNS identity, and agent operations.';
const LOGO_ASSET_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'explorer_logo.png');
const DOCS_ROOT_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs');
const USER_DOCS_ROOT_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'USER_DOCS');
const PAYMENT_STATS_CACHE_MS = 15_000;
const WIZARD_NPM_COMMAND = 'npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config wizard';
const X402_PAID_CALL_NPX_COMMAND = 'npx --yes --package @oobe-protocol-labs/sap-mcp-server sap-mcp-x402-paid-call --tool sap_list_all_agents --arguments \'{"limit":5}\' --max-usd 0.02 --confirm';
const X402_PAID_CALL_ADDON_PATH = '~/.config/mcp-sap/addons/x402-paid-call';
let logoAssetCache: Buffer | undefined;
let paymentStatsCache: { expiresAt: number; stats: PublicPaymentStats } | undefined;

/**
 * @name PublicLogoAsset
 * @description Resolved public logo asset response metadata for browser and crawler icon routes.
 */
export interface PublicLogoAsset {
  contentType: 'image/png' | 'image/x-icon';
  contentLength: number;
  body?: Buffer;
}

/**
 * @name PublicMarkdownAsset
 * @description Resolved public documentation markdown asset served by the hosted docs site.
 */
export interface PublicMarkdownAsset {
  contentType: 'text/markdown; charset=utf-8';
  contentLength: number;
  body?: string;
}

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
    installX402PaidCallAddon: string;
    runX402PaidCall: string;
  };
  security: {
    keypairBytesExposed: false;
    modifiesSolanaCliKeypair: false;
    signerLocation: 'user-machine-or-external-signer';
  };
}

/**
 * @name PublicServerInfo
 * @description Public, secret-free metadata for the hosted SAP MCP deployment.
 */
export interface PublicServerInfo {
  name: 'sap-mcp-server';
  title: string;
  description: string;
  version: string;
  status: 'online';
  protocol: {
    primary: 'mcp';
    transport: 'streamable-http';
    protocolVersion: '2025-06-18';
  };
  endpoints: {
    landing: string;
    docs: string;
    mcp: string;
    health: string;
    serverInfo: string;
    agentCard: string;
    wizardDescriptor: string;
    wizardInstallScript: string;
    favicon: string;
    faviconIco: string;
  };
  capabilities: {
    tools: boolean;
    resources: boolean;
    prompts: boolean;
    streaming: boolean;
    payments: readonly ['x402', 'pay.sh'];
    userControlledSigning: true;
  };
  authentication: {
    schemes: readonly ('Bearer' | 'x402' | 'none')[];
    bearerRequired: boolean;
  };
  security: {
    keypairBytesExposed: false;
    storesUserKeypairs: false;
    rpcSecretsExposed: false;
    wizardConfigDirectory: '~/.config/mcp-sap';
  };
  docs: {
    npm: 'https://www.npmjs.com/package/@oobe-protocol-labs/sap-mcp-server';
    github: 'https://github.com/OOBE-PROTOCOL/sap-mcp';
    userDocs: 'https://github.com/OOBE-PROTOCOL/sap-mcp/tree/main/USER_DOCS';
  };
}

/**
 * @name PublicPaymentStats
 * @description Aggregated, public-safe hosted payment metrics rendered on the landing page.
 */
export interface PublicPaymentStats {
  totalVolumeUsd: number;
  totalSettlements: number;
  totalPaymentRequests: number;
  totalVerifiedPayments: number;
  totalFailedSettlements: number;
  lastSettlementAt?: string;
  ledgerAvailable: boolean;
}

type SapMcpServerInstance = Awaited<ReturnType<typeof createSapMcpServer>>;

interface StatefulMcpSession {
  server: SapMcpServerInstance;
  transport: StreamableHTTPServerTransport;
  createdAt: number;
  lastSeenAt: number;
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
    stateless: parseRemoteBoolean(process.env.SAP_MCP_HTTP_STATELESS, false),
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
 * @name writeMcpJsonRpcError
 * @description Writes an MCP-compatible JSON-RPC error response with HTTP status semantics.
 */
function writeMcpJsonRpcError(
  res: http.ServerResponse,
  status: number,
  code: number,
  id: string | number | null,
  message: string,
  data?: unknown,
): void {
  writeJson(res, status, {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  });
}

/**
 * @name readSingleHeader
 * @description Reads one normalized HTTP header value without accepting ambiguous arrays.
 */
function readSingleHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0]?.trim() || undefined;
  }
  return value?.trim() || undefined;
}

/**
 * @name extractJsonRpcId
 * @description Extracts a JSON-RPC id for error correlation.
 */
function extractJsonRpcId(body: unknown): string | number | null {
  if (Array.isArray(body) && body.length > 0) {
    return extractJsonRpcId(body[0]);
  }
  if (!body || typeof body !== 'object') {
    return null;
  }
  const record = body as Record<string, unknown>;
  return typeof record.id === 'string' || typeof record.id === 'number' ? record.id : null;
}

/**
 * @name isInitializeJsonRpcRequest
 * @description Detects MCP initialize requests that are allowed to create a new stateful session.
 */
function isInitializeJsonRpcRequest(body: unknown): boolean {
  if (Array.isArray(body)) {
    return body.some(isInitializeJsonRpcRequest);
  }
  if (!body || typeof body !== 'object') {
    return false;
  }
  return (body as Record<string, unknown>).method === 'initialize';
}

/**
 * @name writeHtml
 * @description Writes a cacheable HTML response for public endpoint previews and social sharing.
 */
function writeHtml(res: http.ServerResponse, status: number, html: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(html);
}

/**
 * @name writeMarkdownAsset
 * @description Writes a resolved public markdown documentation asset.
 */
function writeMarkdownAsset(res: http.ServerResponse, asset: PublicMarkdownAsset): void {
  res.writeHead(200, {
    'Content-Type': asset.contentType,
    'Cache-Control': 'public, max-age=120',
    'Content-Length': asset.contentLength,
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(asset.body);
}

/**
 * @name resolvePublicDocsMarkdown
 * @description Resolves safe hosted documentation markdown requests under /docs and /docs/user.
 */
export function resolvePublicDocsMarkdown(method: string | undefined, pathname: string): PublicMarkdownAsset | undefined {
  if (method !== 'GET' && method !== 'HEAD') {
    return undefined;
  }

  if (!pathname.startsWith('/docs/') || !pathname.endsWith('.md')) {
    return undefined;
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname.slice('/docs/'.length));
  } catch {
    return undefined;
  }

  const normalizedPath = posix.normalize(decodedPath.replace(/\\/g, '/')).replace(/^[/\\]+/, '');
  if (isUnsafeDocsPath(normalizedPath)) {
    return undefined;
  }

  const root = normalizedPath.startsWith('user/')
    ? USER_DOCS_ROOT_PATH
    : DOCS_ROOT_PATH;
  const relativePath = normalizedPath.startsWith('user/')
    ? normalizedPath.slice('user/'.length)
    : normalizedPath;
  if (isUnsafeDocsPath(relativePath)) {
    return undefined;
  }

  const absolutePath = join(root, relativePath);
  if (!existsSync(absolutePath)) {
    return undefined;
  }

  const markdown = readFileSync(absolutePath, 'utf-8');
  return {
    contentType: 'text/markdown; charset=utf-8',
    contentLength: Buffer.byteLength(markdown),
    body: method === 'HEAD' ? undefined : markdown,
  };
}

function isUnsafeDocsPath(pathname: string): boolean {
  return pathname === ''
    || pathname.includes('\0')
    || pathname === '..'
    || pathname.startsWith('../')
    || pathname.includes('/../');
}

/**
 * @name resolvePublicLogoAsset
 * @description Resolves public icon/social image routes, including HEAD-safe favicon responses for crawlers.
 */
export function resolvePublicLogoAsset(method: string | undefined, pathname: string): PublicLogoAsset | undefined {
  if (method !== 'GET' && method !== 'HEAD') {
    return undefined;
  }

  const image = readLogoAsset();
  const body = method === 'HEAD' ? undefined : image;
  if (['/favicon.png', '/apple-touch-icon.png', '/og.png'].includes(pathname)) {
    return {
      contentType: 'image/png',
      contentLength: image.byteLength,
      body,
    };
  }

  if (pathname === '/favicon.ico') {
    return {
      contentType: 'image/x-icon',
      contentLength: image.byteLength,
      body,
    };
  }

  return undefined;
}

/**
 * @name writeLogoAsset
 * @description Writes a resolved public logo asset response.
 */
function writeLogoAsset(res: http.ServerResponse, asset: PublicLogoAsset): void {
  res.writeHead(200, {
    'Content-Type': asset.contentType,
    'Cache-Control': 'public, max-age=86400',
    'Content-Length': asset.contentLength,
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(asset.body);
}

/**
 * @name readLogoAsset
 * @description Loads the bundled public logo once and reuses it for favicon and social preview routes.
 */
function readLogoAsset(): Buffer {
  logoAssetCache ??= readFileSync(LOGO_ASSET_PATH);
  return logoAssetCache;
}

/**
 * @name readPublicPaymentStats
 * @description Reads cached public-safe payment totals from the append-only usage ledger.
 */
export function readPublicPaymentStats(now = Date.now()): PublicPaymentStats {
  if (paymentStatsCache && paymentStatsCache.expiresAt > now) {
    return paymentStatsCache.stats;
  }

  const stats = readPaymentStatsFromLedger();
  paymentStatsCache = {
    expiresAt: now + PAYMENT_STATS_CACHE_MS,
    stats,
  };
  return stats;
}

function readPaymentStatsFromLedger(): PublicPaymentStats {
  const stats: PublicPaymentStats = {
    totalVolumeUsd: 0,
    totalSettlements: 0,
    totalPaymentRequests: 0,
    totalVerifiedPayments: 0,
    totalFailedSettlements: 0,
    ledgerAvailable: false,
  };

  const ledgerPath = join(getDataDir(), 'payments', 'usage-ledger.jsonl');
  if (!existsSync(ledgerPath)) {
    return stats;
  }

  stats.ledgerAvailable = true;

  const lines = readFileSync(ledgerPath, 'utf-8').split('\n');
  for (const line of lines) {
    const event = parsePaymentLedgerEvent(line);
    if (!event) {
      continue;
    }

    if (event.event === 'payment_required') {
      stats.totalPaymentRequests += 1;
    }

    if (event.event === 'payment_verified') {
      stats.totalVerifiedPayments += 1;
    }

    if (event.event === 'payment_settled') {
      stats.totalSettlements += 1;
      stats.totalVolumeUsd += event.priceUsd ?? 0;
      stats.lastSettlementAt = event.timestamp;
    }

    if (event.event === 'payment_failed') {
      stats.totalFailedSettlements += 1;
    }
  }

  return stats;
}

function parsePaymentLedgerEvent(line: string): PaymentLedgerEvent | undefined {
  const trimmed = line.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!isPaymentLedgerEvent(parsed)) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function isPaymentLedgerEvent(value: unknown): value is PaymentLedgerEvent {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.event === 'string'
    && typeof record.timestamp === 'string'
    && typeof record.requestHash === 'string'
    && typeof record.method === 'string'
    && typeof record.path === 'string'
    && Array.isArray(record.toolNames)
    && typeof record.paymentHeaderPresent === 'boolean';
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
 * @name buildPublicServerInfo
 * @description Builds secret-free public metadata for humans, crawlers, and agent discovery.
 */
export function buildPublicServerInfo(
  req: http.IncomingMessage,
  config: RemoteMCPConfig,
): PublicServerInfo {
  const baseUrl = buildPublicBaseUrl(req, config);
  const authRequired = config.auth.type !== 'none';
  return {
    name: 'sap-mcp-server',
    title: PUBLIC_SERVER_TITLE,
    description: PUBLIC_SERVER_DESCRIPTION,
    version: MCP_SERVER_VERSION,
    status: 'online',
    protocol: {
      primary: 'mcp',
      transport: 'streamable-http',
      protocolVersion: '2025-06-18',
    },
    endpoints: {
      landing: `${baseUrl}/`,
      docs: `${baseUrl}/docs`,
      mcp: `${baseUrl}/mcp`,
      health: `${baseUrl}/health`,
      serverInfo: `${baseUrl}/server.json`,
      agentCard: `${baseUrl}/.well-known/agent-card.json`,
      wizardDescriptor: `${baseUrl}/.well-known/sap-mcp-wizard.json`,
      wizardInstallScript: `${baseUrl}/wizard/install.sh`,
      favicon: `${baseUrl}/favicon.png`,
      faviconIco: `${baseUrl}/favicon.ico`,
    },
    capabilities: {
      tools: true,
      resources: true,
      prompts: true,
      streaming: true,
      payments: ['x402', 'pay.sh'],
      userControlledSigning: true,
    },
    authentication: {
      schemes: authRequired ? ['Bearer'] : ['none', 'x402'],
      bearerRequired: authRequired,
    },
    security: {
      keypairBytesExposed: false,
      storesUserKeypairs: false,
      rpcSecretsExposed: false,
      wizardConfigDirectory: '~/.config/mcp-sap',
    },
    docs: {
      npm: 'https://www.npmjs.com/package/@oobe-protocol-labs/sap-mcp-server',
      github: 'https://github.com/OOBE-PROTOCOL/sap-mcp',
      userDocs: 'https://github.com/OOBE-PROTOCOL/sap-mcp/tree/main/USER_DOCS',
    },
  };
}

/**
 * @name buildOpenApiSpec
 * @description OpenAPI 3.1 spec for x402scan discovery. Describes the /mcp endpoint
 * with x-payment-info so x402scan can discover and register the API.
 */
export function buildOpenApiSpec(
  req: http.IncomingMessage,
  config: RemoteMCPConfig,
): Record<string, unknown> {
  const baseUrl = buildPublicBaseUrl(req, config);

  return {
    openapi: '3.1.0',
    info: {
      title: 'SAP MCP Server',
      version: '0.5.0',
      description: 'MCP gateway for Solana DeFi, SAP agent registry, and x402 micropayments. 248 tools across Jupiter, Drift, Metaplex, Pump.fun, Raydium, Orca, and more.',
      'x-guidance': 'Connect to POST /mcp with Accept: application/json, text/event-stream. Initialize an MCP session first, then call tools. Paid tools return a payment_required JSON-RPC error (HTTP 200 for MCP SDK compatibility) or HTTP 402 for non-MCP clients. Use x402_paid_call or npx sap-mcp-x402-paid-call to self-pay and retry.',
      contact: {
        name: 'OOBE Protocol Labs',
        url: 'https://github.com/OOBE-PROTOCOL/sap-mcp',
        email: 'oobe@oobeprotocol.ai',
      },
    },
    servers: [
      { url: baseUrl, description: 'SAP MCP Hosted Server' },
    ],
    paths: {
      '/mcp': {
        post: {
          operationId: 'mcpCall',
          summary: 'Execute an MCP tool call (JSON-RPC 2.0). Payment required for paid tools.',
          tags: ['MCP'],
          'x-payment-info': {
            price: {
              mode: 'dynamic',
              currency: 'USD',
              min: '0.008',
              max: '0.20',
            },
            protocols: [{ 'x402': {} }],
          },
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    jsonrpc: { type: 'string', const: '2.0' },
                    id: { type: 'integer', description: 'JSON-RPC request ID' },
                    method: {
                      type: 'string',
                      description: 'MCP method: tools/call, tools/list, initialize, etc.',
                      examples: ['tools/call', 'initialize'],
                    },
                    params: {
                      type: 'object',
                      properties: {
                        name: { type: 'string', description: 'Tool name (e.g. jupiter_getPrice)' },
                        arguments: { type: 'object', description: 'Tool arguments' },
                      },
                      required: ['name', 'arguments'],
                    },
                  },
                  required: ['jsonrpc', 'id', 'method', 'params'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'MCP tool result or payment_required JSON-RPC error (for MCP SDK clients)',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      jsonrpc: { type: 'string' },
                      id: { type: 'integer' },
                      result: { type: 'object', description: 'Tool result (if free or paid)' },
                      error: {
                        type: 'object',
                        properties: {
                          code: { type: 'integer' },
                          message: { type: 'string' },
                          data: {
                            type: 'object',
                            properties: {
                              protocol: { type: 'string' },
                              paymentRequirements: { type: 'array' },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '402': {
              description: 'Payment Required (x402 challenge for non-MCP clients)',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      x402Version: { type: 'integer' },
                      error: { type: 'string' },
                      accepts: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            scheme: { type: 'string' },
                            network: { type: 'string' },
                            amount: { type: 'string', description: 'USDC atomic units (6 decimals)' },
                            asset: { type: 'string' },
                            payTo: { type: 'string' },
                            maxTimeoutSeconds: { type: 'integer' },
                            extra: {
                              type: 'object',
                              properties: {
                                feePayer: { type: 'string' },
                              },
                            },
                          },
                        },
                      },
                      resource: {
                        type: 'object',
                        properties: {
                          url: { type: 'string' },
                          description: { type: 'string' },
                          mimeType: { type: 'string' },
                          serviceName: { type: 'string' },
                          tags: { type: 'array', items: { type: 'string' } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

/**
 * @name buildLandingHtml
 * @description Builds professional public HTML metadata for root and `/mcp` URL previews.
 */
export function buildLandingHtml(
  req: http.IncomingMessage,
  config: RemoteMCPConfig,
  endpoint: 'root' | 'mcp' = 'root',
): string {
  const info = buildPublicServerInfo(req, config);
  const paymentStats = readPublicPaymentStats();
  const pageUrl = endpoint === 'mcp' ? info.endpoints.mcp : info.endpoints.landing;
  const title = endpoint === 'mcp'
    ? 'SAP MCP Streamable HTTP Endpoint | OOBE Protocol'
    : info.title;
  const endpointLabel = endpoint === 'mcp' ? 'Streamable HTTP MCP endpoint' : 'Hosted MCP gateway';
  const wizardCommand = WIZARD_NPM_COMMAND;
  const installScriptCommand = 'curl -fsSL https://mcp.sap.oobeprotocol.ai/wizard/install.sh | sh';
  const x402PaidCallCommand = X402_PAID_CALL_NPX_COMMAND;
  const publicInfo = JSON.stringify(info, null, 2).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(info.description)}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${escapeHtml(pageUrl)}">
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <link rel="icon" type="image/png" href="/favicon.png">
  <link rel="shortcut icon" href="/favicon.ico">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(info.description)}">
  <meta property="og:url" content="${escapeHtml(pageUrl)}">
  <meta property="og:image" content="${escapeHtml(info.endpoints.favicon)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(info.description)}">
  <meta name="twitter:image" content="${escapeHtml(info.endpoints.favicon)}">
  <script type="application/ld+json">${publicInfo}</script>
  <style>
    :root {
      color-scheme: dark;
      --aqua: #28d8e8;
      --aqua-soft: rgba(40,216,232,.13);
      --ink: #f4fbff;
      --muted: #a8bdc6;
      --subtle: #76909a;
      --panel: rgba(255,255,255,.062);
      --panel-strong: rgba(255,255,255,.095);
      --line: rgba(255,255,255,.14);
      --line-strong: rgba(40,216,232,.38);
      --surface: #080d12;
      --success: #8ef3c5;
      --warning: #ffd38a;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      min-height: 100vh;
      font: 16px/1.55 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--ink);
      background:
        linear-gradient(115deg, rgba(40,216,232,.13), transparent 34%),
        linear-gradient(180deg, #0a1218 0%, var(--surface) 46%, #05080b 100%);
    }
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px);
      background-size: 64px 64px;
      mask-image: linear-gradient(to bottom, rgba(0,0,0,.75), transparent 72%);
    }
    main { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 56px 0 40px; position: relative; }
    header { display: grid; grid-template-columns: 92px 1fr; gap: 24px; align-items: center; margin-bottom: 30px; }
    img.logo { width: 92px; height: 92px; border-radius: 24px; box-shadow: 0 18px 70px rgba(40,216,232,.22); }
    h1 { margin: 0; max-width: 920px; font-size: clamp(2.2rem, 5vw, 5rem); line-height: .95; letter-spacing: 0; }
    p { margin: 10px 0 0; color: var(--muted); max-width: 760px; }
    a { color: var(--aqua); text-underline-offset: 4px; }
    a:focus-visible { outline: 2px solid var(--aqua); outline-offset: 3px; border-radius: 6px; }
    code {
      color: #e9fcff;
      overflow-wrap: anywhere;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: .92em;
    }
    .badge { display: inline-flex; align-items: center; gap: 8px; color: var(--aqua); font-weight: 750; text-transform: uppercase; font-size: .78rem; letter-spacing: 0; }
    .hero-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 22px; }
    .button {
      display: inline-flex;
      min-height: 42px;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--line-strong);
      border-radius: 8px;
      padding: 9px 14px;
      background: var(--aqua-soft);
      color: var(--ink);
      font-weight: 700;
      text-decoration: none;
    }
    .button.secondary { background: transparent; border-color: var(--line); color: var(--aqua); }
    .bento { display: grid; grid-template-columns: repeat(12, 1fr); gap: 14px; margin-top: 28px; }
    .card {
      min-height: 148px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      padding: 18px;
      color: inherit;
      text-decoration: none;
    }
    .card.strong { background: linear-gradient(180deg, var(--panel-strong), var(--panel)); border-color: var(--line-strong); }
    .span-3 { grid-column: span 3; }
    .span-4 { grid-column: span 4; }
    .span-5 { grid-column: span 5; }
    .span-6 { grid-column: span 6; }
    .span-7 { grid-column: span 7; }
    .span-8 { grid-column: span 8; }
    .span-12 { grid-column: span 12; }
    h2 { margin: 0 0 12px; font-size: 1rem; color: var(--aqua); letter-spacing: 0; }
    h3 { margin: 0 0 6px; font-size: .86rem; color: var(--muted); font-weight: 650; text-transform: uppercase; letter-spacing: 0; }
    .metric { margin-top: 4px; font-size: clamp(2rem, 4vw, 3.35rem); line-height: 1; font-weight: 800; letter-spacing: 0; }
    .metric.small { font-size: clamp(1.55rem, 3vw, 2.3rem); }
    .caption { margin-top: 10px; color: var(--subtle); font-size: .94rem; }
    .status { color: var(--success); }
    .warning { color: var(--warning); }
    .list { padding-left: 18px; margin: 0; color: var(--muted); }
    .list li + li { margin-top: 8px; }
    .command { margin-top: 12px; border: 1px solid rgba(255,255,255,.10); border-radius: 8px; background: rgba(0,0,0,.28); padding: 13px; }
    .endpoint-list { display: grid; gap: 10px; margin-top: 10px; }
    .endpoint-row { display: grid; grid-template-columns: 72px 1fr; gap: 12px; align-items: baseline; }
    .method { color: var(--success); font: 700 .78rem/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .footer { margin-top: 26px; color: var(--muted); font-size: .94rem; }
    @media (max-width: 860px) {
      header { grid-template-columns: 1fr; }
      img.logo { width: 76px; height: 76px; border-radius: 20px; }
      .span-3, .span-4, .span-5, .span-6, .span-7, .span-8 { grid-column: span 12; }
    }
    @media (min-width: 861px) and (max-width: 1120px) {
      .span-3, .span-4 { grid-column: span 6; }
      .span-5, .span-6, .span-7, .span-8 { grid-column: span 12; }
    }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <img class="logo" src="/favicon.png" alt="SAP MCP logo" width="92" height="92">
      <div>
        <span class="badge">OOBE Protocol • ${escapeHtml(endpointLabel)}</span>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(info.description)}</p>
        <div class="hero-actions">
          <a class="button" href="/wizard/install.sh">Install wizard</a>
          <a class="button secondary" href="/docs">Docs</a>
          <a class="button secondary" href="/server.json">Server JSON</a>
          <a class="button secondary" href="/.well-known/agent-card.json">Agent card</a>
        </div>
      </div>
    </header>

    <div class="bento" aria-label="SAP MCP hosted server overview">
      <section class="card strong span-4">
        <h3>Facilitator Volume</h3>
        <div class="metric">${escapeHtml(formatUsd(paymentStats.totalVolumeUsd))}</div>
        <p class="caption">Estimated settled x402/pay.sh tool volume recorded by the hosted payment ledger.</p>
      </section>

      <section class="card strong span-4">
        <h3>Total Settlements</h3>
        <div class="metric">${escapeHtml(formatInteger(paymentStats.totalSettlements))}</div>
        <p class="caption">${escapeHtml(formatLastSettlement(paymentStats))}</p>
      </section>

      <section class="card span-4">
        <h3>Payment Requests</h3>
        <div class="metric">${escapeHtml(formatInteger(paymentStats.totalPaymentRequests))}</div>
        <p class="caption"><span class="status">${escapeHtml(formatInteger(paymentStats.totalVerifiedPayments))}</span> verified, <span class="warning">${escapeHtml(formatInteger(paymentStats.totalFailedSettlements))}</span> failed settlements.</p>
      </section>

      <section class="card span-7">
        <h2>Install Wizard</h2>
        <p>Create a local SAP MCP profile, signer, policy limits, and optional client injection. Hosted users still sign x402/pay.sh and value-moving operations from their own machine or external signer.</p>
        <div class="command"><code>${escapeHtml(installScriptCommand)}</code></div>
        <div class="command"><code>${escapeHtml(wizardCommand)}</code></div>
      </section>

      <section class="card span-5">
        <h2>Payments</h2>
        <ul class="list">
          <li><strong>x402:</strong> paid MCP tool calls return HTTP 402 with payment requirements, then settle through the OOBE facilitator.</li>
          <li><strong>pay.sh:</strong> supports pay-per-use and subscription specs for agents or dashboards that prefer checkout flows.</li>
          <li><strong>Local stdio:</strong> free by default; monetization applies to hosted remote usage.</li>
        </ul>
      </section>

      <section class="card strong span-12">
        <h2>x402 Paid-Call Plugin For Agents</h2>
        <p>Agents that can reach hosted MCP but cannot replay x402 challenges natively can install the wizard addon or invoke the local paid-call helper directly. The helper signs the payment payload locally and retries the hosted tool call without sending keypair bytes to OOBE.</p>
        <div class="command"><code>Addon path: ${escapeHtml(X402_PAID_CALL_ADDON_PATH)}</code></div>
        <div class="command"><code>${escapeHtml(x402PaidCallCommand)}</code></div>
      </section>

      <section class="card span-8">
        <h2>Endpoints</h2>
        <div class="endpoint-list">
          <div class="endpoint-row"><span class="method">POST</span><code>${escapeHtml(info.endpoints.mcp)}</code></div>
          <div class="endpoint-row"><span class="method">GET</span><code>${escapeHtml(info.endpoints.docs)}</code></div>
          <div class="endpoint-row"><span class="method">GET</span><code>${escapeHtml(info.endpoints.health)}</code></div>
          <div class="endpoint-row"><span class="method">GET</span><code>${escapeHtml(info.endpoints.serverInfo)}</code></div>
          <div class="endpoint-row"><span class="method">GET</span><code>${escapeHtml(info.endpoints.agentCard)}</code></div>
          <div class="endpoint-row"><span class="method">GET</span><code>${escapeHtml(info.endpoints.wizardDescriptor)}</code></div>
        </div>
      </section>

      <section class="card span-4">
        <h2>Security Boundary</h2>
        <ul class="list">
          <li>Keypair bytes are never exposed by public endpoints.</li>
          <li>RPC secrets are redacted from public metadata and UI.</li>
          <li>Paid tools require payment before execution.</li>
        </ul>
      </section>
    </div>
    <p class="footer">Use <a href="/server.json">/server.json</a> for machine-readable public metadata. MCP clients should connect to <a href="/mcp">/mcp</a> with <code>Accept: application/json, text/event-stream</code>.</p>
  </main>
</body>
</html>`;
}

/**
 * @name buildDocsHtml
 * @description Builds the hosted SAP MCP documentation shell powered by Docsify.
 */
export function buildDocsHtml(
  req: http.IncomingMessage,
  config: RemoteMCPConfig,
): string {
  const info = buildPublicServerInfo(req, config);
  const docsUrl = info.endpoints.docs;
  const title = 'SAP MCP Documentation | OOBE Protocol';
  const description = 'Install, configure, and operate SAP MCP with a focus on hosted remote access, local signer setup, x402/pay.sh payments, and MCP client configuration.';
  const docsifyConfig = JSON.stringify({
    name: 'SAP MCP',
    repo: 'https://github.com/OOBE-PROTOCOL/sap-mcp',
    homepage: 'README.md',
    loadSidebar: true,
    alias: {
      '/.*/_sidebar.md': '/docs/_sidebar.md',
    },
    subMaxLevel: 2,
    auto2top: true,
    themeColor: '#28d8e8',
    search: {
      paths: 'auto',
      placeholder: 'Search SAP MCP docs',
      noData: 'No results.',
      depth: 6,
    },
  }, null, 2).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${escapeHtml(docsUrl)}">
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <link rel="icon" type="image/png" href="/favicon.png">
  <link rel="shortcut icon" href="/favicon.ico">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(docsUrl)}">
  <meta property="og:image" content="${escapeHtml(info.endpoints.favicon)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(info.endpoints.favicon)}">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/docsify@4.13.1/lib/themes/vue.css">
  <style>
    :root {
      --theme-color: #28d8e8;
      --sidebar-width: 310px;
    }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #17242b;
    }
    .app-name-link {
      color: #062730;
      font-weight: 800;
    }
    .sidebar {
      border-right: 1px solid rgba(6,39,48,.10);
    }
    .sidebar-nav strong,
    .markdown-section h1,
    .markdown-section h2,
    .markdown-section h3 {
      color: #062730;
      letter-spacing: 0;
    }
    .markdown-section a {
      color: #087f91;
      text-underline-offset: 3px;
    }
    .markdown-section code {
      color: #062730;
      border-radius: 6px;
    }
    .markdown-section pre {
      border-radius: 8px;
      border: 1px solid rgba(6,39,48,.10);
    }
    .markdown-section table {
      display: table;
      width: 100%;
    }
    .markdown-section blockquote {
      border-left-color: #28d8e8;
      color: #49656f;
    }
    .cover-main,
    section.cover {
      background: linear-gradient(115deg, rgba(40,216,232,.13), transparent 34%), #f8fdff;
    }
  </style>
</head>
<body>
  <div id="app">Loading SAP MCP documentation...</div>
  <script>
    window.$docsify = ${docsifyConfig};
  </script>
  <script src="https://cdn.jsdelivr.net/npm/docsify@4.13.1/lib/docsify.min.js" defer></script>
  <script src="https://cdn.jsdelivr.net/npm/docsify@4.13.1/lib/plugins/search.min.js" defer></script>
</body>
</html>`;
}

/**
 * @name acceptsHtmlPreview
 * @description Returns true for browser-style GET previews without interfering with MCP SSE clients.
 */
function acceptsHtmlPreview(req: http.IncomingMessage): boolean {
  const accept = String(req.headers.accept ?? '');
  return accept.includes('text/html') && !accept.includes('text/event-stream') && !accept.includes('application/json');
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '$0.00';
  }

  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: value < 1 ? 3 : 2,
    maximumFractionDigits: value < 1 ? 3 : 2,
  })}`;
}

function formatInteger(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0';
  }

  return Math.trunc(value).toLocaleString('en-US');
}

function formatLastSettlement(stats: PublicPaymentStats): string {
  if (!stats.ledgerAvailable) {
    return 'Ledger not initialized yet. Metrics appear after the first paid hosted call.';
  }

  if (!stats.lastSettlementAt) {
    return 'No settlements yet. Paid requests will update this card after successful settlement.';
  }

  return `Last settlement: ${stats.lastSettlementAt}`;
}

/**
 * @name escapeHtml
 * @description Escapes dynamic strings before embedding them in public HTML metadata.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
      runWizard: WIZARD_NPM_COMMAND,
      showConfig: 'npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config show',
      showProfile: 'npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config profile-info',
      installX402PaidCallAddon: WIZARD_NPM_COMMAND,
      runX402PaidCall: X402_PAID_CALL_NPX_COMMAND,
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
 * @name extractToolNamesFromJsonRpc
 * @description Extracts tool names from a parsed JSON-RPC 2.0 request body for request logging.
 */
function extractToolNamesFromJsonRpc(body: unknown): string[] | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const record = body as Record<string, unknown>;

  // tools/call request: { method: "tools/call", params: { name: "tool_name", ... } }
  if (record.method === 'tools/call' && record.params && typeof record.params === 'object') {
    const params = record.params as Record<string, unknown>;
    if (typeof params.name === 'string') return [params.name];
  }

  // Batch request: array of requests
  if (Array.isArray(body)) {
    const names: string[] = [];
    for (const item of body) {
      const extracted = extractToolNamesFromJsonRpc(item);
      if (extracted) names.push(...extracted);
    }
    return names.length > 0 ? names : undefined;
  }

  return undefined;
}

/**
 * @name extractJsonRpcMethod
 * @description Extracts the JSON-RPC method name from a parsed request body for request logging.
 */
function extractJsonRpcMethod(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const record = body as Record<string, unknown>;
  if (typeof record.method === 'string') return record.method;
  return undefined;
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
  private readonly statefulSessions = new Map<string, StatefulMcpSession>();
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

    const monetizationGate = await McpMonetizationGate.create(this.appConfig);

    this.httpServer = http.createServer(async (req, res) => {
      if (this.applyCors(req, res)) {
        return;
      }

      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      if (req.method === 'GET' && url.pathname === '/') {
        writeHtml(res, 200, buildLandingHtml(req, this.config));
        return;
      }

      if (req.method === 'GET' && ['/docs', '/docs/', '/docs/index.html'].includes(url.pathname)) {
        writeHtml(res, 200, buildDocsHtml(req, this.config));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/server.json') {
        writeJson(res, 200, buildPublicServerInfo(req, this.config), {
          'Cache-Control': 'public, max-age=300',
        });
        return;
      }

      const publicLogoAsset = resolvePublicLogoAsset(req.method, url.pathname);
      if (publicLogoAsset) {
        writeLogoAsset(res, publicLogoAsset);
        return;
      }

      const publicDocsMarkdown = resolvePublicDocsMarkdown(req.method, url.pathname);
      if (publicDocsMarkdown) {
        writeMarkdownAsset(res, publicDocsMarkdown);
        return;
      }

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

      if (req.method === 'GET' && url.pathname === '/openapi.json') {
        writeJson(res, 200, buildOpenApiSpec(req, this.config), {
          'Cache-Control': 'public, max-age=300',
        });
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

      if (req.method === 'GET' && url.pathname === '/mcp' && acceptsHtmlPreview(req)) {
        writeHtml(res, 200, buildLandingHtml(req, this.config, 'mcp'));
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

      // ── Request logging ─────────────────────────────────────────────
      const reqStart = Date.now();
      const callerIp = getRateLimitKey(req);
      const originalEnd = res.end.bind(res) as typeof res.end;
      let loggedMethod: string | undefined;
      let loggedToolNames: string[] | undefined;

      (res as http.ServerResponse).end = ((...args: Parameters<typeof res.end>) => {
        const latencyMs = Date.now() - reqStart;
        const statusCode = res.statusCode;
        logger.info('MCP request', {
          method: req.method,
          path: url.pathname,
          status: statusCode,
          latencyMs,
          callerIp,
          toolNames: loggedToolNames,
          rpcMethod: loggedMethod,
        });
        return originalEnd(...args);
      }) as typeof res.end;

      try {
        if (this.config.stateless) {
          // Stateless mode: create a fresh transport + server per request.
          // The MCP SDK prohibits reusing a stateless transport across requests.
          const perRequestServer = await createSapMcpServer(this.appConfig);
          const perRequestTransport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
          });
          await perRequestServer.connect(perRequestTransport);

          if (monetizationGate) {
            await monetizationGate.handle(req, res, async (mcpReq, mcpRes, parsedBody) => {
              // Extract tool names from parsed JSON-RPC body for logging
              loggedToolNames = extractToolNamesFromJsonRpc(parsedBody);
              loggedMethod = extractJsonRpcMethod(parsedBody);
              await perRequestTransport.handleRequest(mcpReq, mcpRes, parsedBody);
            });
          } else {
            // Parse body for logging before passing to transport
            // The transport will re-read it from the stream
            loggedToolNames = undefined; // Will be logged without tool names in free mode
            await perRequestTransport.handleRequest(req, res);
          }
        } else {
          // Stateful mode: route each request to the transport created by its initialize response.
          if (monetizationGate) {
            await monetizationGate.handle(req, res, async (mcpReq, mcpRes, parsedBody) => {
              loggedToolNames = extractToolNamesFromJsonRpc(parsedBody);
              loggedMethod = extractJsonRpcMethod(parsedBody);
              await this.handleStatefulMcpRequest(mcpReq, mcpRes, parsedBody);
            }, {
              validatePaidRequest: context => this.validateStatefulPaidRequest(context.request, context.parsedBody),
            });
          } else {
            await this.handleStatefulMcpRequest(req, res);
          }
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
    const sessions = Array.from(this.statefulSessions.values());
    this.statefulSessions.clear();
    await Promise.allSettled(sessions.map(session => session.transport.close()));
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
   * @name handleStatefulMcpRequest
   * @description Routes a stateful MCP request to the session transport created by initialize.
   */
  private async handleStatefulMcpRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    parsedBody?: unknown,
  ): Promise<void> {
    const transport = await this.resolveStatefulTransport(req, parsedBody);
    if (!transport) {
      const providedSessionId = readSingleHeader(req.headers['mcp-session-id']);
      writeMcpJsonRpcError(
        res,
        providedSessionId ? 404 : 400,
        providedSessionId ? -32011 : -32010,
        extractJsonRpcId(parsedBody),
        providedSessionId ? 'mcp_session_not_found' : 'mcp_session_required',
        {
          requiredHeader: 'mcp-session-id',
          ...(providedSessionId ? { providedSessionId } : {}),
          hint: providedSessionId
            ? 'The mcp-session-id must come from this server initialize response. Client-generated UUIDs are not valid MCP sessions.'
            : 'Call initialize first and reuse the returned mcp-session-id header. Do not generate a client-side UUID.',
        },
      );
      return;
    }

    await transport.handleRequest(req, res, parsedBody);
  }

  /**
   * @name validateStatefulPaidRequest
   * @description Fails paid tool calls before x402 verification when the MCP session is missing or unknown.
   */
  private validateStatefulPaidRequest(
    req: http.IncomingMessage,
    parsedBody: unknown,
  ): { code: number; message: string; data: unknown } | undefined {
    if (isInitializeJsonRpcRequest(parsedBody)) {
      return undefined;
    }

    const sessionId = readSingleHeader(req.headers['mcp-session-id']);
    if (!sessionId) {
      return {
        code: -32010,
        message: 'mcp_session_required',
        data: {
          requiredHeader: 'mcp-session-id',
          hint: 'Initialize the MCP Streamable HTTP session first, then reuse the returned mcp-session-id for the unpaid payment challenge and the paid retry.',
        },
      };
    }

    if (!this.statefulSessions.has(sessionId)) {
      return {
        code: -32011,
        message: 'mcp_session_not_found',
        data: {
          requiredHeader: 'mcp-session-id',
          providedSessionId: sessionId,
          hint: 'The mcp-session-id must come from this server initialize response. Client-generated UUIDs are not valid MCP sessions.',
        },
      };
    }

    return undefined;
  }

  /**
   * @name resolveStatefulTransport
   * @description Returns the transport for an existing session or creates one for an initialize request.
   */
  private async resolveStatefulTransport(
    req: http.IncomingMessage,
    parsedBody?: unknown,
  ): Promise<StreamableHTTPServerTransport | undefined> {
    const sessionId = readSingleHeader(req.headers['mcp-session-id']);
    if (sessionId) {
      const session = this.statefulSessions.get(sessionId);
      if (!session) {
        return undefined;
      }
      session.lastSeenAt = Date.now();
      return session.transport;
    }

    if (req.method === 'POST' && (parsedBody === undefined || isInitializeJsonRpcRequest(parsedBody))) {
      return await this.createStatefulSessionTransport();
    }

    return undefined;
  }

  /**
   * @name createStatefulSessionTransport
   * @description Creates one MCP server and Streamable HTTP transport for a single initialized session.
   */
  private async createStatefulSessionTransport(): Promise<StreamableHTTPServerTransport> {
    const server = await createSapMcpServer(this.appConfig);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: sessionId => {
        this.statefulSessions.set(sessionId, {
          server,
          transport,
          createdAt: Date.now(),
          lastSeenAt: Date.now(),
        });
        logger.info('Stateful MCP session initialized', {
          sessionId,
          activeSessions: this.statefulSessions.size,
        });
      },
    });

    transport.onclose = () => {
      const sessionId = transport.sessionId;
      if (sessionId) {
        this.statefulSessions.delete(sessionId);
        logger.info('Stateful MCP session closed', {
          sessionId,
          activeSessions: this.statefulSessions.size,
        });
      }
    };

    await server.connect(transport);
    return transport;
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
