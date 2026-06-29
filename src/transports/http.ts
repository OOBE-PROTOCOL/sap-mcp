/**
 * HTTP transport for SAP MCP Server
 *
 * Provides HTTP endpoint for MCP clients using StreamableHTTP transport.
 * Production-ready implementation following MCP SDK v1.x specification.
 *
 * Security:
 * - API-key authentication on every request (configurable via SAP_HTTP_API_KEY env or config file)
 * - CORS restricted to configured origins (never wildcard in production)
 * - Per-IP rate limiting (configurable via config.rateLimitPerMinute)
 * - JSON-RPC error responses follow MCP spec error codes
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { logger } from '../core/logger.js';
import * as http from 'http';
import type { SapMcpConfig } from '../config/env.js';
import { McpMonetizationGate } from '../payments/index.js';

/**
 * Contract describing http transport config data used by the SAP MCP runtime.
 */
export interface HttpTransportConfig {
  port: number;
  host?: string;
  /** Optional API key required from clients via `X-API-Key` header. */
  apiKey?: string;
  /** Allowed CORS origins. When empty, CORS is disabled entirely. */
  corsOrigins?: string[];
  /** Maximum requests per minute per remote address. 0 disables rate limiting. */
  rateLimitPerMinute: number;
  /** Full SAP MCP config, required only when hosted monetization is enabled. */
  appConfig?: SapMcpConfig;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_CLEANUP_INTERVAL = 5 * 60_000;
const MCP_ENDPOINT_PATH = '/mcp';

/**
 * @name getCorsOrigin
 * @description Returns the CORS origin header value if the request origin is allowed, otherwise null.
 */
function getCorsOrigin(reqOrigin: string | undefined, allowedOrigins: string[]): string | null {
  if (allowedOrigins.length === 0) {
    return null;
  }
  if (allowedOrigins.includes('*')) {
    return '*';
  }
  if (reqOrigin && allowedOrigins.includes(reqOrigin)) {
    return reqOrigin;
  }
  return null;
}

/**
 * @name isLoopbackHost
 * @description Checks whether an HTTP bind host is local-only.
 */
function isLoopbackHost(host: string | undefined): boolean {
  return !host || host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

/**
 * @name extractApiKey
 * @description Reads the API key from the `X-API-Key` header or `Authorization: Bearer <key>` header.
 */
function extractApiKey(headers: http.IncomingHttpHeaders): string | undefined {
  const direct = headers['x-api-key'];
  if (typeof direct === 'string' && direct.length > 0) {
    return direct;
  }
  const authHeader = headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim() || undefined;
  }
  return undefined;
}

/**
 * @name sendJsonRpcError
 * @description Writes a JSON-RPC 2.0 error response with the given code and message.
 */
function sendJsonRpcError(
  res: http.ServerResponse,
  status: number,
  code: number,
  message: string,
): void {
  if (!res.headersSent) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
  }
  res.end(JSON.stringify({
    jsonrpc: '2.0',
    error: { code, message },
    id: null,
  }));
}

/**
 * Start HTTP transport using StreamableHTTP (MCP SDK v1.x standard)
 *
 * Security enforcement:
 * 1. CORS — only configured origins receive `Access-Control-Allow-Origin`
 * 2. Rate limiting — per-remote-IP request counter with rolling window
 * 3. Authentication — API key required on every request when configured
 */
export async function startHttpTransport(
  server: Server,
  config: HttpTransportConfig,
): Promise<http.Server> {
  const host = config.host || '0.0.0.0';
  if (!config.apiKey && !isLoopbackHost(host)) {
    throw new Error('HTTP transport requires an API key when binding to a non-loopback host');
  }

  logger.info('Starting HTTP transport', {
    port: config.port,
    host,
    authEnabled: Boolean(config.apiKey),
    corsOrigins: config.corsOrigins ?? [],
    rateLimitPerMinute: config.rateLimitPerMinute,
  });

  // Create StreamableHTTP transport
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });
  const monetizationGate = config.appConfig
    ? await McpMonetizationGate.create(config.appConfig)
    : undefined;

  // Connect server to transport
  await server.connect(transport);

  const rateLimitMap = new Map<string, RateLimitEntry>();
  let lastCleanup = Date.now();

  function cleanupRateLimitMap(): void {
    const now = Date.now();
    if (now - lastCleanup < RATE_LIMIT_CLEANUP_INTERVAL) {
      return;
    }
    lastCleanup = now;
    for (const ip of Array.from(rateLimitMap.keys())) {
      const entry = rateLimitMap.get(ip);
      if (entry && now > entry.resetAt) {
        rateLimitMap.delete(ip);
      }
    }
  }

  function checkRateLimit(remoteAddress: string): boolean {
    if (config.rateLimitPerMinute <= 0) {
      return true;
    }
    const now = Date.now();
    let entry = rateLimitMap.get(remoteAddress);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
      rateLimitMap.set(remoteAddress, entry);
    }
    entry.count++;
    return entry.count <= config.rateLimitPerMinute;
  }

  // Create HTTP server
  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const reqOrigin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
    const allowedOrigins = config.corsOrigins ?? [];

    // CORS headers — restricted to configured origins
    const corsOrigin = getCorsOrigin(reqOrigin, allowedOrigins);
    if (corsOrigin) {
      res.setHeader('Access-Control-Allow-Origin', corsOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, mcp-session-id, X-API-Key, Authorization, PAYMENT-SIGNATURE, X-PAYMENT');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-PAYMENT-RESPONSE');
      if (corsOrigin !== '*') {
        res.setHeader('Vary', 'Origin');
      }
    }

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname !== MCP_ENDPOINT_PATH) {
      sendJsonRpcError(res, 404, -32004, `Not found. MCP endpoint is ${MCP_ENDPOINT_PATH}`);
      return;
    }

    // Rate limiting
    cleanupRateLimitMap();
    const remoteAddress = req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(remoteAddress)) {
      logger.warn('HTTP rate limit exceeded', { remoteAddress });
      sendJsonRpcError(res, 429, -32002, 'Rate limit exceeded');
      return;
    }

    // Authentication — when API key is configured, reject requests without a valid key
    if (config.apiKey) {
      const providedKey = extractApiKey(req.headers);
      if (!providedKey || providedKey !== config.apiKey) {
        logger.warn('HTTP authentication failed', { remoteAddress, path: url.pathname });
        sendJsonRpcError(res, 401, -32001, 'Unauthorized');
        return;
      }
    }

    try {
      // Route requests through StreamableHTTP transport
      if (monetizationGate) {
        await monetizationGate.handle(req, res, async (mcpReq, mcpRes) => {
          await transport.handleRequest(mcpReq, mcpRes, url.searchParams);
        });
      } else {
        await transport.handleRequest(req, res, url.searchParams);
      }
    } catch (error) {
      logger.error('HTTP transport error', { error, path: url.pathname });

      sendJsonRpcError(res, 500, -32603, 'Internal server error');
    }
  });

  // Start server
  await new Promise<void>((resolve, reject) => {
    httpServer.listen(config.port, host, () => {
      logger.info('HTTP transport started', {
        port: config.port,
        endpoint: `http://${host}:${config.port}${MCP_ENDPOINT_PATH}`,
        auth: config.apiKey ? 'enabled' : 'disabled',
        cors: config.corsOrigins && config.corsOrigins.length > 0 ? config.corsOrigins.join(', ') : 'disabled',
      });
      resolve();
    });

    httpServer.on('error', reject);
  });

  // Handle graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Shutting down HTTP transport (${signal})...`);
    await server.close();
    httpServer.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  return httpServer;
}
