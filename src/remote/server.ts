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
import { McpMonetizationGate, resolvePaymentNetwork } from '../payments/index.js';
import { generatePayShProviderYaml } from '../payments/pay-sh-spec.js';
import { RemoteRateLimiter, buildRemoteRateLimitConfigFromEnv, type RemoteRateLimitConfig } from './rate-limiter.js';
import type { PaymentLedgerEvent } from '../payments/usage-ledger.js';
import { renderLandingPage } from './public-home/index.js';

const PUBLIC_SERVER_TITLE = 'SAP MCP Server | OOBE Protocol';
const PUBLIC_SERVER_DESCRIPTION = 'Hosted Solana-native MCP gateway for Synapse Agent Protocol tools, x402/pay.sh monetization, SNS identity, and agent operations.';
const LOGO_ASSET_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'explorer_logo.png');
const OOBE_LOGO_ASSET_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'oobe-logo.png');
const LOGO_ASSET_ROOT_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'logos');
const DOCS_ROOT_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs');
const USER_DOCS_ROOT_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'USER_DOCS');
const PAYMENT_STATS_CACHE_MS = 15_000;
const SERVER_CARD_CACHE_MS = 300_000;
const RELEASE_DOWNLOAD_BASE_URL = `https://github.com/OOBE-PROTOCOL/sap-mcp/releases/download/${MCP_SERVER_VERSION}`;
const WIZARD_NPM_COMMAND = 'npm exec --yes --package @oobe-protocol-labs/sap-mcp-server -- sap-mcp-config wizard';
const X402_PAID_CALL_NPX_COMMAND = 'npx --yes --package @oobe-protocol-labs/sap-mcp-server sap-mcp-x402-paid-call --tool sap_list_all_agents --arguments \'{"limit":5}\' --max-usd 0.02 --confirm';
const X402_PAID_CALL_ADDON_PATH = '~/.config/mcp-sap/addons/x402-paid-call';
const SOLANA_DEVNET_CAIP2 = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
const USDC_MAINNET_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_DEVNET_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const MCP_REGISTRY_AUTH_PATH = '/.well-known/mcp-registry-auth';
let logoAssetCache: Buffer | undefined;
let oobeLogoAssetCache: Buffer | undefined;
let paymentStatsCache: { expiresAt: number; stats: PublicPaymentStats } | undefined;
let serverCardCapabilitiesCache: { expiresAt: number; capabilities: StaticServerCardCapabilities } | undefined;

const PUBLIC_LOGO_ASSETS = {
  '/logos/claude.png': { filename: 'claude.png', contentType: 'image/png' },
  '/logos/codex.webp': { filename: 'codex.webp', contentType: 'image/webp' },
  '/logos/drift.svg': { filename: 'drift.svg', contentType: 'image/svg+xml' },
  '/logos/hermes.png': { filename: 'hermes.png', contentType: 'image/png' },
  '/logos/jupiter.ico': { filename: 'jupiter.ico', contentType: 'image/x-icon' },
  '/logos/mcp.svg': { filename: 'mcp.svg', contentType: 'image/svg+xml' },
  '/logos/meteora.png': { filename: 'meteora.png', contentType: 'image/png' },
  '/logos/orca.ico': { filename: 'orca.ico', contentType: 'image/x-icon' },
  '/logos/openclaw.svg': { filename: 'openclaw.svg', contentType: 'image/svg+xml' },
  '/logos/raydium.ico': { filename: 'raydium.ico', contentType: 'image/x-icon' },
  '/logos/smithery.svg': { filename: 'smithery.svg', contentType: 'image/svg+xml' },
} as const;

/**
 * @name PublicLogoAsset
 * @description Resolved public logo asset response metadata for browser and crawler icon routes.
 */
export interface PublicLogoAsset {
  contentType: 'image/png' | 'image/svg+xml' | 'image/webp' | 'image/x-icon';
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
  sessions?: RemoteSessionConfig;
  concurrency?: RemoteConcurrencyConfig;
  http?: RemoteHttpTuningConfig;
  paymentDiscovery?: PublicPaymentDiscovery;
  paymentPriceRange?: PublicPaymentPriceRange;
}

/**
 * @name RemoteSessionConfig
 * @description Bounds stateful Streamable HTTP MCP sessions so crawlers and idle agents cannot exhaust memory.
 */
export interface RemoteSessionConfig {
  maxStatefulSessions: number;
  idleTtlMs: number;
  absoluteTtlMs: number;
  cleanupIntervalMs: number;
}

/**
 * @name RemoteConcurrencyConfig
 * @description Bounds concurrently executing MCP requests while preserving fast failure under overload.
 */
export interface RemoteConcurrencyConfig {
  maxInFlightRequests: number;
}

/**
 * @name RemoteHttpTuningConfig
 * @description Node HTTP server socket and header timeout settings for reverse-proxied streaming deployments.
 */
export interface RemoteHttpTuningConfig {
  requestTimeoutMs: number;
  headersTimeoutMs: number;
  keepAliveTimeoutMs: number;
  maxRequestsPerSocket: number;
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
    downloads: string;
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
  displayName: string;
  display_name: string;
  description: string;
  version: string;
  homepage: string;
  websiteUrl: string;
  website_url: string;
  icon: string;
  iconUrl: string;
  icon_url: string;
  image: string;
  logo: string;
  icons: ReadonlyArray<{
    src: string;
    mimeType: 'image/png';
    sizes: readonly ['512x512'];
  }>;
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
    openApi: string;
    x402Discovery: string;
    smitheryServerCard: string;
    payShProvider: string;
    agentCard: string;
    wizardDescriptor: string;
    wizardDownloads: string;
    wizardInstallScript: string;
    favicon: string;
    faviconIco: string;
  };
  downloads: {
    release: string;
    desktopWizard: {
      macosArm64Dmg: string;
      windowsX64Setup: string;
      linuxX64TarGz: string;
    };
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
  payments?: PublicPaymentDiscovery;
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
 * @name StaticServerCard
 * @description Smithery-compatible static MCP server card served from /.well-known/mcp/server-card.json.
 */
export interface StaticServerCard {
  serverInfo: {
    name: 'sap-mcp-server';
    displayName: string;
    display_name: string;
    title: string;
    version: string;
    description: string;
    homepage: string;
    websiteUrl: string;
    website_url: string;
    icon: string;
    iconUrl: string;
    icon_url: string;
    image: string;
    logo: string;
    icons: ReadonlyArray<{
      src: string;
      mimeType: 'image/png';
      sizes: readonly ['512x512'];
    }>;
  };
  name: 'sap-mcp-server';
  displayName: string;
  display_name: string;
  title: string;
  version: string;
  description: string;
  homepage: string;
  websiteUrl: string;
  website_url: string;
  icon: string;
  iconUrl: string;
  icon_url: string;
  image: string;
  logo: string;
  icons: ReadonlyArray<{
    src: string;
    mimeType: 'image/png';
    sizes: readonly ['512x512'];
  }>;
  authentication: {
    required: boolean;
    schemes: readonly ('none' | 'x402' | 'Bearer')[];
  };
  transport: {
    type: 'streamable-http';
    url: string;
  };
  tools: readonly unknown[];
  resources: readonly unknown[];
  resourceTemplates: readonly unknown[];
  prompts: readonly unknown[];
}

interface StaticServerCardCapabilities {
  tools: readonly unknown[];
  resources: readonly unknown[];
  resourceTemplates: readonly unknown[];
  prompts: readonly unknown[];
}

interface RegisteredServerSnapshot {
  tools?: readonly unknown[];
  resources?: readonly unknown[];
  resourceTemplates?: readonly unknown[];
  prompts?: readonly unknown[];
}

/**
 * @name PublicPaymentDiscovery
 * @description Secret-free payment coordinates for x402/pay.sh discovery surfaces.
 */
export interface PublicPaymentDiscovery {
  provider: 'x402' | 'pay-sh';
  network: string;
  asset: string;
  assetSymbol: 'USDC';
  payTo: string;
  seller: {
    name: 'OOBE Protocol';
    payTo: string;
  };
  facilitator?: {
    role: 'x402-svm-fee-payer';
    publicKey: string;
  };
  headers: {
    paymentRequired: 'PAYMENT-REQUIRED';
    paymentSignature: 'PAYMENT-SIGNATURE';
    paymentResponse: 'PAYMENT-RESPONSE';
  };
}

/**
 * @name PublicPaymentPriceRange
 * @description Public-safe hosted payment price range for discovery documents.
 */
export interface PublicPaymentPriceRange {
  minUsd: number;
  maxUsd: number;
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
  uniqueRemoteCallers: number;
  uniqueUserAgents: number;
  lastSettlementAt?: string;
  ledgerAvailable: boolean;
}

/**
 * @name X402DiscoveryDocument
 * @description x402scan-compatible discovery fan-out document for paid hosted resources.
 */
export interface X402DiscoveryDocument {
  version: 1;
  resources: string[];
  payments?: PublicPaymentDiscovery;
  instructions: string;
}

type SapMcpServerInstance = Awaited<ReturnType<typeof createSapMcpServer>>;

interface StatefulMcpSession {
  server: SapMcpServerInstance;
  transport: StreamableHTTPServerTransport;
  createdAt: number;
  lastSeenAt: number;
}

class RemoteCapacityError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RemoteCapacityError';
  }
}

class InFlightRequestLimiter {
  private active = 0;

  public constructor(private readonly maxInFlightRequests: number) {}

  public tryAcquire(): (() => void) | undefined {
    if (this.maxInFlightRequests <= 0) {
      return () => undefined;
    }

    if (this.active >= this.maxInFlightRequests) {
      return undefined;
    }

    this.active += 1;
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.active = Math.max(0, this.active - 1);
    };
  }

  public getActiveCount(): number {
    return this.active;
  }
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
    sessions: buildRemoteSessionConfigFromEnv(),
    concurrency: buildRemoteConcurrencyConfigFromEnv(),
    http: buildRemoteHttpTuningConfigFromEnv(),
    paymentDiscovery: buildPublicPaymentDiscovery(appConfig),
    paymentPriceRange: {
      minUsd: appConfig.monetization.prices.minUsd,
      maxUsd: appConfig.monetization.prices.maxUsd,
    },
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

/**
 * @name buildPublicPaymentDiscovery
 * @description Builds public x402 seller/facilitator coordinates without exposing facilitator URL or auth tokens.
 */
function buildPublicPaymentDiscovery(appConfig: SapMcpConfig): PublicPaymentDiscovery | undefined {
  if (!appConfig.monetization.enabled || !appConfig.monetization.payTo) {
    return undefined;
  }

  const network = resolvePaymentNetwork(appConfig);
  const facilitatorPublicKey = (
    process.env.SAP_MCP_X402_FACILITATOR_PUBLIC_KEY
    ?? process.env.SAP_MCP_X402_FACILITATOR_FEE_PAYER
    ?? ''
  ).trim();

  return {
    provider: appConfig.monetization.provider,
    network,
    asset: resolvePublicPaymentAsset(network),
    assetSymbol: 'USDC',
    payTo: appConfig.monetization.payTo,
    seller: {
      name: 'OOBE Protocol',
      payTo: appConfig.monetization.payTo,
    },
    ...(facilitatorPublicKey
      ? {
          facilitator: {
            role: 'x402-svm-fee-payer',
            publicKey: facilitatorPublicKey,
          },
        }
      : {}),
    headers: {
      paymentRequired: 'PAYMENT-REQUIRED',
      paymentSignature: 'PAYMENT-SIGNATURE',
      paymentResponse: 'PAYMENT-RESPONSE',
    },
  };
}

/**
 * @name resolvePublicPaymentAsset
 * @description Resolves the public USDC mint advertised in x402 discovery metadata.
 */
function resolvePublicPaymentAsset(network: string): string {
  if (network === SOLANA_DEVNET_CAIP2) {
    return USDC_DEVNET_MINT;
  }
  return USDC_MAINNET_MINT;
}

function formatOpenApiUsd(value: number): string {
  return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function parseRemoteBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) {
    return fallback;
  }
  return ['true', '1', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

function buildRemoteSessionConfigFromEnv(): RemoteSessionConfig {
  return {
    maxStatefulSessions: parseRemotePositiveInteger(process.env.SAP_MCP_REMOTE_MAX_STATEFUL_SESSIONS, 2_000),
    idleTtlMs: parseRemotePositiveInteger(process.env.SAP_MCP_REMOTE_SESSION_IDLE_TTL_MS, 10 * 60 * 1000),
    absoluteTtlMs: parseRemotePositiveInteger(process.env.SAP_MCP_REMOTE_SESSION_ABSOLUTE_TTL_MS, 60 * 60 * 1000),
    cleanupIntervalMs: parseRemotePositiveInteger(process.env.SAP_MCP_REMOTE_SESSION_CLEANUP_INTERVAL_MS, 30_000),
  };
}

function buildRemoteConcurrencyConfigFromEnv(): RemoteConcurrencyConfig {
  return {
    maxInFlightRequests: parseRemotePositiveInteger(process.env.SAP_MCP_REMOTE_MAX_IN_FLIGHT_REQUESTS, 1_024),
  };
}

function buildRemoteHttpTuningConfigFromEnv(): RemoteHttpTuningConfig {
  return {
    requestTimeoutMs: parseRemotePositiveInteger(process.env.SAP_MCP_REMOTE_REQUEST_TIMEOUT_MS, 5 * 60 * 1000),
    headersTimeoutMs: parseRemotePositiveInteger(process.env.SAP_MCP_REMOTE_HEADERS_TIMEOUT_MS, 65_000),
    keepAliveTimeoutMs: parseRemotePositiveInteger(process.env.SAP_MCP_REMOTE_KEEP_ALIVE_TIMEOUT_MS, 75_000),
    maxRequestsPerSocket: parseRemotePositiveInteger(process.env.SAP_MCP_REMOTE_MAX_REQUESTS_PER_SOCKET, 0),
  };
}

function parseRemotePositiveInteger(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
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
  omitBody = false,
): void {
  const serialized = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(serialized),
    ...headers,
  });
  res.end(omitBody ? undefined : serialized);
}

/**
 * @name writeText
 * @description Writes a cacheable text response with an explicit content type.
 */
function writeText(
  res: http.ServerResponse,
  status: number,
  body: string,
  contentType: string,
  headers: http.OutgoingHttpHeaders = {},
  omitBody = false,
): void {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=300',
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(omitBody ? undefined : body);
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
function writeHtml(res: http.ServerResponse, status: number, html: string, omitBody = false): void {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
    'Content-Length': Buffer.byteLength(html),
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(omitBody ? undefined : html);
}

/**
 * @name isPublicReadMethod
 * @description Returns true for cacheable public metadata reads, including crawler-friendly HEAD checks.
 */
function isPublicReadMethod(method: string | undefined): boolean {
  return method === 'GET' || method === 'HEAD';
}

/**
 * @name isHeadMethod
 * @description Returns true when the request must emit headers without a response body.
 */
function isHeadMethod(method: string | undefined): boolean {
  return method === 'HEAD';
}

/**
 * @name resolveMcpRegistryAuthRecord
 * @description Resolves the MCP Registry HTTP ownership proof from a public env value or a private file path.
 */
function resolveMcpRegistryAuthRecord(): string | undefined {
  const inlineRecord = process.env.SAP_MCP_REGISTRY_AUTH_RECORD?.trim();
  if (inlineRecord) {
    return inlineRecord;
  }

  const recordPath = process.env.SAP_MCP_REGISTRY_AUTH_FILE?.trim();
  if (!recordPath) {
    return undefined;
  }

  try {
    if (!existsSync(recordPath)) {
      return undefined;
    }

    const fileRecord = readFileSync(recordPath, 'utf8').trim();
    return fileRecord || undefined;
  } catch (error) {
    logger.warn('Failed to read MCP Registry auth record', {
      path: recordPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

/**
 * @name writeMcpRegistryAuthRecord
 * @description Writes the MCP Registry HTTP ownership proof without exposing private signing material.
 */
function writeMcpRegistryAuthRecord(res: http.ServerResponse, omitBody: boolean): void {
  const record = resolveMcpRegistryAuthRecord();
  if (!record) {
    writeText(
      res,
      404,
      'MCP Registry auth record is not configured.\n',
      'text/plain; charset=utf-8',
      { 'Cache-Control': 'no-store' },
      omitBody,
    );
    return;
  }

  writeText(
    res,
    200,
    `${record}\n`,
    'text/plain; charset=utf-8',
    { 'Cache-Control': 'public, max-age=60' },
    omitBody,
  );
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

  const logoAsset = PUBLIC_LOGO_ASSETS[pathname as keyof typeof PUBLIC_LOGO_ASSETS];
  if (logoAsset !== undefined) {
    const image = readFileSync(join(LOGO_ASSET_ROOT_PATH, logoAsset.filename));
    return {
      contentType: logoAsset.contentType,
      contentLength: image.byteLength,
      body: method === 'HEAD' ? undefined : image,
    };
  }

  if (pathname === '/oobe-logo.png') {
    const image = readOobeLogoAsset();
    return {
      contentType: 'image/png',
      contentLength: image.byteLength,
      body: method === 'HEAD' ? undefined : image,
    };
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
 * @name readOobeLogoAsset
 * @description Loads the bundled OOBE mark used by the public navigation link.
 */
function readOobeLogoAsset(): Buffer {
  oobeLogoAssetCache ??= readFileSync(OOBE_LOGO_ASSET_PATH);
  return oobeLogoAssetCache;
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
    uniqueRemoteCallers: 0,
    uniqueUserAgents: 0,
    ledgerAvailable: false,
  };

  const ledgerPath = join(getDataDir(), 'payments', 'usage-ledger.jsonl');
  if (!existsSync(ledgerPath)) {
    return stats;
  }

  stats.ledgerAvailable = true;

  const remoteCallers = new Set<string>();
  const userAgents = new Set<string>();
  const lines = readFileSync(ledgerPath, 'utf-8').split('\n');
  for (const line of lines) {
    const event = parsePaymentLedgerEvent(line);
    if (!event) {
      continue;
    }

    if (event.remoteAddress) {
      remoteCallers.add(event.remoteAddress);
    }

    if (event.userAgent) {
      userAgents.add(event.userAgent);
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

  stats.uniqueRemoteCallers = remoteCallers.size;
  stats.uniqueUserAgents = userAgents.size;

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
  const homepage = `${baseUrl}/`;
  const iconUrl = `${baseUrl}/favicon.png`;
  const icons = [
    {
      src: iconUrl,
      mimeType: 'image/png' as const,
      sizes: ['512x512'] as const,
    },
  ];
  return {
    name: 'sap-mcp-server',
    title: PUBLIC_SERVER_TITLE,
    displayName: PUBLIC_SERVER_TITLE,
    display_name: PUBLIC_SERVER_TITLE,
    description: PUBLIC_SERVER_DESCRIPTION,
    version: MCP_SERVER_VERSION,
    homepage,
    websiteUrl: homepage,
    website_url: homepage,
    icon: iconUrl,
    iconUrl,
    icon_url: iconUrl,
    image: iconUrl,
    logo: iconUrl,
    icons,
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
      openApi: `${baseUrl}/openapi.json`,
      x402Discovery: `${baseUrl}/.well-known/x402`,
      smitheryServerCard: `${baseUrl}/.well-known/mcp/server-card.json`,
      payShProvider: `${baseUrl}/pay/provider.yml`,
      agentCard: `${baseUrl}/.well-known/agent-card.json`,
      wizardDescriptor: `${baseUrl}/.well-known/sap-mcp-wizard.json`,
      wizardDownloads: `${baseUrl}/wizard/downloads.json`,
      wizardInstallScript: `${baseUrl}/wizard/install.sh`,
      favicon: `${baseUrl}/favicon.png`,
      faviconIco: `${baseUrl}/favicon.ico`,
    },
    downloads: {
      release: `https://github.com/OOBE-PROTOCOL/sap-mcp/releases/tag/${MCP_SERVER_VERSION}`,
      desktopWizard: {
        macosArm64Dmg: `${RELEASE_DOWNLOAD_BASE_URL}/SAP-MCP-Wizard-${MCP_SERVER_VERSION}-arm64.dmg`,
        windowsX64Setup: `${RELEASE_DOWNLOAD_BASE_URL}/SAP-MCP-Wizard-Setup-${MCP_SERVER_VERSION}-x64.exe`,
        linuxX64TarGz: `${RELEASE_DOWNLOAD_BASE_URL}/sap-mcp-wizard-${MCP_SERVER_VERSION}-x64.tar.gz`,
      },
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
    ...(config.paymentDiscovery ? { payments: config.paymentDiscovery } : {}),
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
 * @name getStaticServerCardCapabilities
 * @description Reads capabilities from the real MCP registration store so static metadata never drifts from tools/list.
 */
async function getStaticServerCardCapabilities(appConfig: SapMcpConfig): Promise<StaticServerCardCapabilities> {
  const now = Date.now();
  if (serverCardCapabilitiesCache && serverCardCapabilitiesCache.expiresAt > now) {
    return serverCardCapabilitiesCache.capabilities;
  }

  const server = await createSapMcpServer(appConfig);
  const snapshot = server as RegisteredServerSnapshot;
  const capabilities: StaticServerCardCapabilities = {
    tools: snapshot.tools ?? [],
    resources: snapshot.resources ?? [],
    resourceTemplates: snapshot.resourceTemplates ?? [],
    prompts: snapshot.prompts ?? [],
  };
  serverCardCapabilitiesCache = {
    expiresAt: now + SERVER_CARD_CACHE_MS,
    capabilities,
  };
  return capabilities;
}

/**
 * @name buildStaticServerCard
 * @description Builds the static server card consumed by registries that need metadata outside initialize.
 */
export async function buildStaticServerCard(
  req: http.IncomingMessage,
  config: RemoteMCPConfig,
  appConfig: SapMcpConfig,
): Promise<StaticServerCard> {
  const baseUrl = buildPublicBaseUrl(req, config);
  const capabilities = await getStaticServerCardCapabilities(appConfig);
  const authRequired = config.auth.type !== 'none';
  const homepage = `${baseUrl}/`;
  const iconUrl = `${baseUrl}/favicon.png`;
  const icons = [
    {
      src: iconUrl,
      mimeType: 'image/png' as const,
      sizes: ['512x512'] as const,
    },
  ];

  return {
    name: 'sap-mcp-server',
    displayName: PUBLIC_SERVER_TITLE,
    display_name: PUBLIC_SERVER_TITLE,
    title: PUBLIC_SERVER_TITLE,
    version: MCP_SERVER_VERSION,
    description: PUBLIC_SERVER_DESCRIPTION,
    homepage,
    websiteUrl: homepage,
    website_url: homepage,
    icon: iconUrl,
    iconUrl,
    icon_url: iconUrl,
    image: iconUrl,
    logo: iconUrl,
    icons,
    serverInfo: {
      name: 'sap-mcp-server',
      displayName: PUBLIC_SERVER_TITLE,
      display_name: PUBLIC_SERVER_TITLE,
      title: PUBLIC_SERVER_TITLE,
      version: MCP_SERVER_VERSION,
      description: PUBLIC_SERVER_DESCRIPTION,
      homepage,
      websiteUrl: homepage,
      website_url: homepage,
      icon: iconUrl,
      iconUrl,
      icon_url: iconUrl,
      image: iconUrl,
      logo: iconUrl,
      icons,
    },
    authentication: {
      required: authRequired,
      schemes: authRequired ? ['Bearer'] : ['none', 'x402'],
    },
    transport: {
      type: 'streamable-http',
      url: `${baseUrl}/mcp`,
    },
    ...capabilities,
  };
}

/**
 * @name buildPublicPayShProviderYaml
 * @description Builds a public pay.sh provider catalog for the hosted SAP MCP endpoint without RPC secrets or signer paths.
 */
export function buildPublicPayShProviderYaml(
  req: http.IncomingMessage,
  config: RemoteMCPConfig,
  appConfig: SapMcpConfig,
): string {
  const baseUrl = buildPublicBaseUrl(req, config);
  return generatePayShProviderYaml(appConfig, {
    name: 'oobe-sap-mcp',
    subdomain: 'oobe-sap-mcp',
    title: 'OOBE SAP MCP Server',
    description: PUBLIC_SERVER_DESCRIPTION,
    version: MCP_SERVER_VERSION,
    upstreamUrl: baseUrl,
    recipient: config.paymentDiscovery?.payTo ?? appConfig.monetization.payTo,
    rpcUrl: undefined,
    signerPath: undefined,
  });
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
  const priceRange = config.paymentPriceRange ?? { minUsd: 0.001, maxUsd: 100 };

  return {
    openapi: '3.1.0',
    info: {
      title: 'SAP MCP Server',
      version: MCP_SERVER_VERSION,
      description: 'MCP gateway for Solana DeFi, SAP agent registry, and x402 micropayments. 248 tools across Jupiter, Drift, Metaplex, Pump.fun, Raydium, Orca, and more.',
      'x-guidance': 'Connect to POST /mcp with Accept: application/json, text/event-stream. Initialize an MCP session first, then call tools. Paid tools return a payment_required JSON-RPC error (HTTP 200 for MCP SDK compatibility) or HTTP 402 for non-MCP clients. Use the local sap_payments_call_paid_tool bridge or npx sap-mcp-x402-paid-call to self-pay and retry.',
      contact: {
        name: 'OOBE Protocol Labs',
        url: 'https://github.com/OOBE-PROTOCOL/sap-mcp',
        email: 'oobe@oobeprotocol.ai',
      },
    },
    'x-discovery': {
      resources: [`${baseUrl}/mcp`],
      openApi: `${baseUrl}/openapi.json`,
      x402Discovery: `${baseUrl}/.well-known/x402`,
      payShProvider: `${baseUrl}/pay/provider.yml`,
      ...(config.paymentDiscovery ? { payments: config.paymentDiscovery } : {}),
    },
    'x-pay-sh': {
      providerYaml: `${baseUrl}/pay/provider.yml`,
      routing: {
        type: 'proxy',
        upstream: `${baseUrl}/`,
      },
      monetization: {
        mode: 'metered',
        unit: 'requests',
        sourceOfTruth: 'SAP MCP per-tool x402 pricing remains authoritative after proxy forwarding.',
      },
    },
    servers: [
      { url: baseUrl, description: 'SAP MCP Hosted Server' },
    ],
    paths: {
      '/mcp': {
        post: {
          operationId: 'mcpCall',
          summary: 'Fetch SAP MCP JSON-RPC response',
          tags: ['MCP'],
          'x-payment-info': {
            price: {
              mode: 'dynamic',
              currency: 'USD',
              min: formatOpenApiUsd(priceRange.minUsd),
              max: formatOpenApiUsd(priceRange.maxUsd),
            },
            protocols: ['x402'],
            ...(config.paymentDiscovery
              ? {
                  network: config.paymentDiscovery.network,
                  asset: config.paymentDiscovery.asset,
                  assetSymbol: config.paymentDiscovery.assetSymbol,
                  payTo: config.paymentDiscovery.payTo,
                  seller: config.paymentDiscovery.seller,
                  facilitator: config.paymentDiscovery.facilitator,
                }
              : {}),
          },
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    {
                      type: 'object',
                      description: 'General MCP JSON-RPC request such as initialize, tools/list, prompts/list, resources/list, or ping.',
                      properties: {
                        jsonrpc: { type: 'string', const: '2.0' },
                        id: { oneOf: [{ type: 'integer' }, { type: 'string' }], description: 'JSON-RPC request ID' },
                        method: {
                          type: 'string',
                          description: 'MCP method.',
                          examples: ['initialize', 'tools/list', 'prompts/list', 'resources/list', 'ping'],
                        },
                        params: {
                          type: 'object',
                          description: 'JSON-RPC parameters for the requested MCP method. Use an empty object when the method has no parameters.',
                          additionalProperties: true,
                        },
                      },
                      required: ['jsonrpc', 'id', 'method'],
                    },
                    {
                      type: 'object',
                      description: 'MCP tools/call request. Paid tool calls may require x402 payment before execution.',
                      properties: {
                        jsonrpc: { type: 'string', const: '2.0' },
                        id: { oneOf: [{ type: 'integer' }, { type: 'string' }], description: 'JSON-RPC request ID' },
                        method: { type: 'string', const: 'tools/call' },
                        params: {
                          type: 'object',
                          description: 'MCP tools/call parameters containing the target tool name and optional tool arguments.',
                          properties: {
                            name: { type: 'string', description: 'Tool name (e.g. jupiter_getPrice)' },
                            arguments: { type: 'object', description: 'Tool arguments', additionalProperties: true },
                          },
                          required: ['name'],
                          additionalProperties: true,
                        },
                      },
                      required: ['jsonrpc', 'id', 'method', 'params'],
                    },
                  ],
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
                'text/event-stream': {
                  schema: {
                    type: 'string',
                    description: 'Streamable HTTP MCP event stream containing JSON-RPC response events.',
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
 * @name buildX402DiscoveryDocument
 * @description Builds the compatibility discovery document consumed by x402scan.
 */
export function buildX402DiscoveryDocument(
  req: http.IncomingMessage,
  config: RemoteMCPConfig,
): X402DiscoveryDocument {
  const baseUrl = buildPublicBaseUrl(req, config);
  return {
    version: 1,
    resources: [`${baseUrl}/mcp`],
    ...(config.paymentDiscovery ? { payments: config.paymentDiscovery } : {}),
    instructions: 'SAP MCP exposes paid hosted MCP tool calls at /mcp. Probe POST /mcp without a payment header to receive a parseable x402 challenge for paid tools.',
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
  return renderLandingPage({
    endpoint,
    info,
    paymentStats,
    pageUrl,
    title,
    installScriptCommand: 'curl -fsSL https://mcp.sap.oobeprotocol.ai/wizard/install.sh | sh',
    wizardCommand: WIZARD_NPM_COMMAND,
    paidCallCommand: X402_PAID_CALL_NPX_COMMAND,
    paidCallAddonPath: X402_PAID_CALL_ADDON_PATH,
  });
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
      --sap-bg: #111413;
      --sap-panel: rgba(255, 255, 255, .055);
      --sap-line: rgba(255, 255, 255, .14);
      --sap-aqua: #28d8e8;
      --sap-ink: #f5fbfc;
      --sap-muted: #a8b9bc;
    }
    * {
      box-sizing: border-box;
    }
    html {
      background: var(--sap-bg);
    }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--sap-ink);
      background:
        linear-gradient(rgba(40, 216, 232, .025) 1px, transparent 1px),
        linear-gradient(90deg, rgba(40, 216, 232, .025) 1px, transparent 1px),
        var(--sap-bg);
      background-size: 80px 80px;
      overflow-x: hidden;
    }
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      z-index: -1;
      pointer-events: none;
      background:
        radial-gradient(circle at 16% 10%, rgba(40, 216, 232, .12), transparent 30%),
        radial-gradient(circle at 84% 18%, rgba(134, 166, 255, .08), transparent 28%),
        linear-gradient(180deg, rgba(255,255,255,.025), transparent 40%);
    }
    .docs-home {
      position: fixed;
      top: 14px;
      left: 14px;
      z-index: 80;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-height: 54px;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 999px;
      padding: 7px 15px 7px 8px;
      color: var(--sap-ink);
      text-decoration: none;
      font-weight: 850;
      background: rgba(11, 17, 17, .82);
      box-shadow: 0 18px 44px rgba(0, 0, 0, .28);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }
    .docs-home:hover,
    .docs-home:focus-visible {
      border-color: rgba(40,216,232,.44);
      background: rgba(40,216,232,.09);
    }
    .docs-home img {
      width: 38px;
      height: 38px;
      border-radius: 12px;
      box-shadow: 0 0 0 1px rgba(40,216,232,.2);
    }
    .docs-home span {
      display: grid;
      gap: 1px;
      line-height: 1.05;
    }
    .docs-home small {
      color: var(--sap-muted);
      font-size: 11px;
      font-weight: 750;
    }
    .app-nav {
      background: rgba(11, 17, 17, .9);
      border-bottom: 1px solid var(--sap-line);
      color: var(--sap-ink);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
    }
    .github-corner svg {
      color: var(--sap-bg);
      fill: var(--sap-aqua);
    }
    .search input {
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 999px;
      color: var(--sap-ink);
      background: rgba(255,255,255,.055);
    }
    .app-name-link {
      color: var(--sap-ink);
      font-weight: 800;
    }
    .app-name {
      margin-top: 82px;
    }
    .sidebar {
      border-right: 1px solid var(--sap-line);
      background:
        linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.028)),
        rgba(9, 17, 18, .92);
      color: var(--sap-muted);
    }
    .sidebar-toggle {
      background: rgba(11, 17, 17, .88);
      border-radius: 0 14px 14px 0;
      border: 1px solid var(--sap-line);
      border-left: 0;
    }
    .sidebar-nav strong,
    .markdown-section h1,
    .markdown-section h2,
    .markdown-section h3 {
      color: var(--sap-ink);
      letter-spacing: 0;
    }
    .sidebar ul li a,
    .sidebar ul li.active > a,
    .anchor span {
      color: var(--sap-muted);
    }
    .sidebar ul li.active > a,
    .sidebar ul li a:hover {
      color: var(--sap-aqua);
    }
    .markdown-section {
      max-width: 920px;
      color: var(--sap-muted);
    }
    .markdown-section strong,
    .markdown-section table,
    .markdown-section li {
      color: var(--sap-muted);
    }
    .markdown-section a {
      color: var(--sap-aqua);
      text-underline-offset: 3px;
    }
    .markdown-section code {
      color: #d8faff;
      border-radius: 6px;
      background: rgba(255,255,255,.08);
    }
    .markdown-section pre {
      border-radius: 8px;
      border: 1px solid var(--sap-line);
      background: rgba(0,0,0,.34);
    }
    .markdown-section table {
      display: table;
      width: 100%;
      overflow-wrap: anywhere;
    }
    .markdown-section th,
    .markdown-section td {
      border-color: rgba(255,255,255,.12);
    }
    .markdown-section blockquote {
      border-left-color: var(--sap-aqua);
      color: var(--sap-muted);
      background: rgba(40,216,232,.045);
    }
    .cover-main,
    section.cover {
      background:
        linear-gradient(115deg, rgba(40,216,232,.13), transparent 34%),
        var(--sap-bg);
    }
    @media (max-width: 768px) {
      .docs-home {
        position: sticky;
        top: 8px;
        left: auto;
        width: calc(100% - 24px);
        margin: 8px 12px;
        justify-content: flex-start;
      }
      .app-name {
        margin-top: 18px;
      }
      .markdown-section {
        padding: 32px 18px 40px;
      }
      .markdown-section h1 {
        font-size: 34px;
        line-height: 1;
      }
      .markdown-section table {
        display: block;
        overflow-x: auto;
      }
    }
    @media (max-width: 420px) {
      .docs-home {
        border-radius: 20px;
      }
      .docs-home span strong {
        font-size: 14px;
      }
    }
  </style>
</head>
<body>
  <a class="docs-home" href="${escapeHtml(info.endpoints.landing)}" aria-label="Back to SAP MCP home">
    <img src="/favicon.png" width="38" height="38" alt="">
    <span>
      <strong>SAP MCP Docs</strong>
      <small>Back to hosted gateway</small>
    </span>
  </a>
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
      downloads: `${baseUrl}/wizard/downloads.json`,
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
  private readonly requestLimiter: InFlightRequestLimiter;
  private readonly statefulSessions = new Map<string, StatefulMcpSession>();
  private readonly sessionConfig: RemoteSessionConfig;
  private readonly httpTuning: RemoteHttpTuningConfig;
  private sessionCleanupInterval?: NodeJS.Timeout;
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
    this.sessionConfig = this.config.sessions ?? buildRemoteSessionConfigFromEnv();
    this.httpTuning = this.config.http ?? buildRemoteHttpTuningConfigFromEnv();
    this.requestLimiter = new InFlightRequestLimiter(
      this.config.concurrency?.maxInFlightRequests ?? buildRemoteConcurrencyConfigFromEnv().maxInFlightRequests,
    );
  }

  /**
   * @name start
   * @description Starts the remote MCP endpoint, health check, and A2A discovery routes.
   */
  public async start(): Promise<void> {
    this.validateAuthConfig();
    await this.rateLimiter.initialize();
    this.startSessionCleanup();

    const monetizationGate = await McpMonetizationGate.create(this.appConfig);

    this.httpServer = http.createServer(async (req, res) => {
      if (this.applyCors(req, res)) {
        return;
      }

      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      if (isPublicReadMethod(req.method) && url.pathname === '/') {
        writeHtml(res, 200, buildLandingHtml(req, this.config), isHeadMethod(req.method));
        return;
      }

      if (isPublicReadMethod(req.method) && ['/docs', '/docs/', '/docs/index.html'].includes(url.pathname)) {
        writeHtml(res, 200, buildDocsHtml(req, this.config), isHeadMethod(req.method));
        return;
      }

      if (isPublicReadMethod(req.method) && url.pathname === '/server.json') {
        writeJson(res, 200, buildPublicServerInfo(req, this.config), {
          'Cache-Control': 'public, max-age=300',
        }, isHeadMethod(req.method));
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

      if (isPublicReadMethod(req.method) && url.pathname === '/health') {
        writeJson(res, 200, {
          status: 'ok',
          service: 'sap-mcp-remote',
          transport: 'streamable-http',
          timestamp: new Date().toISOString(),
        }, {}, isHeadMethod(req.method));
        return;
      }

      if (isPublicReadMethod(req.method) && url.pathname === MCP_REGISTRY_AUTH_PATH) {
        writeMcpRegistryAuthRecord(res, isHeadMethod(req.method));
        return;
      }

      if (isPublicReadMethod(req.method) && url.pathname === '/.well-known/mcp/server-card.json') {
        writeJson(res, 200, await buildStaticServerCard(req, this.config, this.appConfig), {
          'Cache-Control': 'public, max-age=300',
        }, isHeadMethod(req.method));
        return;
      }

      if (isPublicReadMethod(req.method) && ['/.well-known/agent-card.json', '/a2a/agent-card'].includes(url.pathname)) {
        writeJson(res, 200, buildA2AAgentCard(req, this.config), {}, isHeadMethod(req.method));
        return;
      }

      if (isPublicReadMethod(req.method) && ['/.well-known/sap-mcp-wizard.json', '/wizard', '/wizard.json'].includes(url.pathname)) {
        writeJson(res, 200, buildWizardInstallDescriptor(req, this.config), {}, isHeadMethod(req.method));
        return;
      }

      if (isPublicReadMethod(req.method) && url.pathname === '/wizard/downloads.json') {
        const info = buildPublicServerInfo(req, this.config);
        writeJson(res, 200, info.downloads, {
          'Cache-Control': 'public, max-age=300',
        }, isHeadMethod(req.method));
        return;
      }

      if (isPublicReadMethod(req.method) && url.pathname === '/openapi.json') {
        writeJson(res, 200, buildOpenApiSpec(req, this.config), {
          'Cache-Control': 'public, max-age=300',
        }, isHeadMethod(req.method));
        return;
      }

      if (isPublicReadMethod(req.method) && url.pathname === '/pay/provider.yml') {
        const providerYaml = buildPublicPayShProviderYaml(req, this.config, this.appConfig);
        writeText(res, 200, providerYaml, 'application/yaml; charset=utf-8', {}, isHeadMethod(req.method));
        return;
      }

      if (isPublicReadMethod(req.method) && url.pathname === '/.well-known/x402') {
        writeJson(res, 200, buildX402DiscoveryDocument(req, this.config), {
          'Cache-Control': 'public, max-age=300',
        }, isHeadMethod(req.method));
        return;
      }

      if (isPublicReadMethod(req.method) && url.pathname === '/wizard/install.sh') {
        const script = buildWizardInstallScript(req, this.config);
        res.writeHead(200, {
          'Content-Type': 'text/x-shellscript; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
          'Content-Length': Buffer.byteLength(script),
        });
        res.end(isHeadMethod(req.method) ? undefined : script);
        return;
      }

      if (isPublicReadMethod(req.method) && url.pathname === '/mcp' && (isHeadMethod(req.method) || acceptsHtmlPreview(req))) {
        writeHtml(res, 200, buildLandingHtml(req, this.config, 'mcp'), isHeadMethod(req.method));
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

      const releaseRequest = this.requestLimiter.tryAcquire();
      if (!releaseRequest) {
        writeJson(res, 503, {
          error: 'remote_mcp_over_capacity',
          retryAfterSeconds: 2,
          hint: 'The hosted MCP gateway is protecting itself from overload. Retry shortly or reduce parallel calls.',
        }, {
          'Retry-After': '2',
          'X-MCP-In-Flight': String(this.requestLimiter.getActiveCount()),
        });
        return;
      }
      res.once('finish', releaseRequest);
      res.once('close', releaseRequest);
      res.setHeader('X-MCP-In-Flight', String(this.requestLimiter.getActiveCount()));

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
        if (error instanceof RemoteCapacityError) {
          logger.warn('Remote MCP capacity limit reached', {
            error: error.message,
            activeSessions: this.statefulSessions.size,
          });
          if (!res.headersSent) {
            writeJson(res, 503, {
              error: 'remote_mcp_session_capacity',
              retryAfterSeconds: 5,
              activeSessions: this.statefulSessions.size,
              maxStatefulSessions: this.sessionConfig.maxStatefulSessions,
            }, {
              'Retry-After': '5',
            });
          }
          return;
        }
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

    this.httpServer.requestTimeout = this.httpTuning.requestTimeoutMs;
    this.httpServer.headersTimeout = this.httpTuning.headersTimeoutMs;
    this.httpServer.keepAliveTimeout = this.httpTuning.keepAliveTimeoutMs;
    this.httpServer.maxRequestsPerSocket = this.httpTuning.maxRequestsPerSocket;

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
      maxStatefulSessions: this.sessionConfig.maxStatefulSessions,
      sessionIdleTtlMs: this.sessionConfig.idleTtlMs,
      maxInFlightRequests: this.config.concurrency?.maxInFlightRequests,
      requestTimeoutMs: this.httpTuning.requestTimeoutMs,
    });
  }

  /**
   * @name stop
   * @description Gracefully closes the MCP transport and HTTP listener.
   */
  public async stop(): Promise<void> {
    if (this.sessionCleanupInterval) {
      clearInterval(this.sessionCleanupInterval);
      this.sessionCleanupInterval = undefined;
    }
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
    await this.pruneStatefulSessions('before-create');
    if (this.statefulSessions.size >= this.sessionConfig.maxStatefulSessions) {
      throw new RemoteCapacityError(`Stateful MCP session capacity reached (${this.sessionConfig.maxStatefulSessions})`);
    }

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
        const deleted = this.statefulSessions.delete(sessionId);
        if (deleted) {
          logger.info('Stateful MCP session closed', {
            sessionId,
            activeSessions: this.statefulSessions.size,
          });
        }
      }
    };

    await server.connect(transport);
    return transport;
  }

  private startSessionCleanup(): void {
    if (this.config.stateless || this.sessionCleanupInterval) {
      return;
    }

    this.sessionCleanupInterval = setInterval(() => {
      void this.pruneStatefulSessions('interval').catch(error => {
        logger.warn('Stateful MCP session cleanup failed', { error });
      });
    }, this.sessionConfig.cleanupIntervalMs);
    this.sessionCleanupInterval.unref?.();
  }

  private async pruneStatefulSessions(reason: 'before-create' | 'interval'): Promise<void> {
    if (this.statefulSessions.size === 0) {
      return;
    }

    const now = Date.now();
    const expiredSessionIds: string[] = [];
    for (const [sessionId, session] of this.statefulSessions.entries()) {
      const idleMs = now - session.lastSeenAt;
      const ageMs = now - session.createdAt;
      if (idleMs > this.sessionConfig.idleTtlMs || ageMs > this.sessionConfig.absoluteTtlMs) {
        expiredSessionIds.push(sessionId);
      }
    }

    for (const sessionId of expiredSessionIds) {
      await this.closeStatefulSession(sessionId, 'expired');
    }

    if (this.statefulSessions.size < this.sessionConfig.maxStatefulSessions) {
      if (expiredSessionIds.length > 0) {
        logger.info('Stateful MCP session cleanup completed', {
          reason,
          closed: expiredSessionIds.length,
          activeSessions: this.statefulSessions.size,
        });
      }
      return;
    }

    const targetSize = Math.max(0, this.sessionConfig.maxStatefulSessions - 1);
    const sessionsByIdleAge = Array.from(this.statefulSessions.entries())
      .sort(([, left], [, right]) => left.lastSeenAt - right.lastSeenAt);
    const overflowCount = Math.max(0, this.statefulSessions.size - targetSize);
    for (const [sessionId] of sessionsByIdleAge.slice(0, overflowCount)) {
      await this.closeStatefulSession(sessionId, 'capacity-prune');
    }

    if (expiredSessionIds.length > 0 || overflowCount > 0) {
      logger.info('Stateful MCP session cleanup completed', {
        reason,
        expired: expiredSessionIds.length,
        prunedForCapacity: overflowCount,
        activeSessions: this.statefulSessions.size,
      });
    }
  }

  private async closeStatefulSession(
    sessionId: string,
    reason: 'expired' | 'capacity-prune' | 'shutdown',
  ): Promise<void> {
    const session = this.statefulSessions.get(sessionId);
    if (!session) {
      return;
    }

    this.statefulSessions.delete(sessionId);
    await session.transport.close().catch(error => {
      logger.warn('Failed to close stateful MCP session', {
        sessionId,
        reason,
        error,
      });
    });
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
