/**
 * SAP MCP Signing Proxy
 * 
 * Local signing service for remote MCP servers.
 * 
 * Architecture:
 * - Runs on localhost:8765 (never exposed externally)
 * - Reads dedicated agent keypairs from ~/.config/mcp-sap/keypairs/
 * - Signs transactions locally (keys never leave machine)
 * - Returns signed transactions to remote MCP server
 * 
 * Security:
 * - Auth token required for all requests
 * - CORS restricted to localhost
 * - Rate limiting per session
 * - Audit logging of all signing requests
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createDecipheriv, scryptSync } from 'crypto';
import { Keypair, Transaction, VersionedTransaction } from '@solana/web3.js';
import { getConfigDir, getKeypairsDir } from '../config/paths.js';
import { loadProfileConfig } from '../config/profiles.js';

type LogData = Record<string, unknown>;
type HeaderValue = string | string[] | undefined;

interface HttpRequest {
  headers: Record<string, HeaderValue>;
  params?: Record<string, string | undefined>;
  query?: Record<string, unknown>;
  body: unknown;
}

interface HttpResponse {
  status: (code: number) => HttpResponse;
  json: (body: unknown) => void;
}

type HttpNext = () => void;
type HttpHandler = (req: HttpRequest, res: HttpResponse, next: HttpNext) => void | Promise<void>;

const logger = {
  info: (msg: string, data?: LogData) => console.log('[INFO] ' + msg, data ? JSON.stringify(data) : ''),
  warn: (msg: string, data?: LogData) => console.warn('[WARN] ' + msg, data ? JSON.stringify(data) : ''),
  error: (msg: string, data?: LogData) => console.error('[ERROR] ' + msg, data ? JSON.stringify(data) : ''),
  audit: (event: string, data?: LogData) => console.log('[AUDIT] ' + event, data ? JSON.stringify(data) : ''),
};

const PORT = process.env.SAP_SIGNING_PROXY_PORT || 8765;
const HOST = '127.0.0.1';
const CONFIG_DIR = getConfigDir();

/**
 * Internal contract describing signing request data.
 */
interface SigningRequest {
  transaction: string; // base64 encoded
  agentId?: string;
  sessionId: string;
}

/**
 * Internal contract describing signing response data.
 */
interface SigningResponse {
  success: boolean;
  signedTransaction?: string;
  publicKey?: string;
  error?: string;
}

interface SigningProxyConfig {
  authToken: string;
  port: number;
}

interface SigningConfigFile {
  signingProxy?: {
    authToken?: string;
    port?: number;
  };
}

function isSigningConfigFile(value: unknown): value is SigningConfigFile {
  return Boolean(value) && typeof value === 'object';
}

/**
 * @name readOptionalSigningConfigFile
 * @description Reads optional signing proxy settings from the default profile config without requiring it to exist.
 * @returns Parsed signing proxy config fields, or an empty object when no default config exists.
 */
function readOptionalSigningConfigFile(): SigningConfigFile {
  const configPath = join(CONFIG_DIR, 'config.json');

  if (!existsSync(configPath)) {
    return {};
  }

  const parsed: unknown = JSON.parse(readFileSync(configPath, 'utf-8'));
  return isSigningConfigFile(parsed) ? parsed : {};
}

function parseSigningRequest(value: unknown): Partial<SigningRequest> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const body = value as Record<string, unknown>;
  return {
    transaction: typeof body.transaction === 'string' ? body.transaction : undefined,
    agentId: typeof body.agentId === 'string' ? body.agentId : undefined,
    sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
  };
}

/**
 * Resolves the requested agent/profile id from a path parameter, query parameter, body, or default env.
 */
function resolveRequestedAgentId(req: HttpRequest, bodyAgentId?: string): string | undefined {
  if (bodyAgentId) {
    return bodyAgentId;
  }

  const paramAgentId = req.params?.agentId;
  if (paramAgentId) {
    return paramAgentId;
  }

  const queryAgentId = req.query?.agentId;
  if (typeof queryAgentId === 'string' && queryAgentId.length > 0) {
    return queryAgentId;
  }

  return process.env.SAP_SIGNING_AGENT_ID;
}

/**
 * @name loadSigningConfig
 * @description Resolves signing proxy runtime configuration from environment first and optional default config second.
 * @returns Signing proxy auth token and port.
 */
export function loadSigningConfig(): SigningProxyConfig {
  const config = readOptionalSigningConfigFile();

  return {
    authToken: process.env.SAP_SIGNING_AUTH_TOKEN || config.signingProxy?.authToken || '',
    port: Number(process.env.SAP_SIGNING_PROXY_PORT) || config.signingProxy?.port || Number(PORT),
  };
}

/**
 * Internal helper for the load agent keyfile operation.
 *
 * Supports both plaintext (development) and AES-256-GCM encrypted keyfiles.
 * Encrypted keyfiles must contain: { _secret, salt, iv, authTag } encoded as hex.
 */
export function resolveAgentKeyfilePath(agentId: string): string {
  const profileConfig = loadProfileConfig(agentId);
  if (profileConfig?.walletPath) {
    return profileConfig.walletPath;
  }

  const keypairsDir = getKeypairsDir();
  const candidates = [
    join(keypairsDir, `${agentId}.json`),
    join(keypairsDir, `${agentId}-keypair.json`),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Agent keyfile not found for "${agentId}". Expected a profile walletPath or a canonical keypair under ~/.config/mcp-sap/keypairs/.`,
  );
}

/**
 * Loads a local SAP MCP agent keyfile from profile walletPath or canonical keypairs directory.
 */
export function loadAgentKeyfile(agentId: string, passphrase?: string): Keypair {
  const keyfilePath = resolveAgentKeyfilePath(agentId);
  const keyfile: Record<string, unknown> = JSON.parse(readFileSync(keyfilePath, 'utf-8'));

  if (Array.isArray(keyfile)) {
    return Keypair.fromSecretKey(new Uint8Array(keyfile));
  }

  if (keyfile.secretKey && Array.isArray(keyfile.secretKey)) {
    return Keypair.fromSecretKey(new Uint8Array(keyfile.secretKey));
  }

  if (keyfile._secret && keyfile.salt && keyfile.iv && keyfile.authTag) {
    if (!passphrase) {
      throw new Error('Encrypted keyfile requires a passphrase. Set SAP_KEYFILE_PASSPHRASE env variable.');
    }

    const derivedKey = scryptSync(passphrase, String(keyfile.salt), 32, { N: 262144, r: 8, p: 1 });
    const decipher = createDecipheriv('aes-256-gcm', derivedKey, Buffer.from(String(keyfile.iv), 'hex'));
    decipher.setAuthTag(Buffer.from(String(keyfile.authTag), 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(String(keyfile._secret), 'hex')),
      decipher.final(),
    ]);
    return Keypair.fromSecretKey(new Uint8Array(decrypted));
  }

  throw new Error(`Keyfile for agent "${agentId}" has unrecognized format`);
}

/**
 * Signs a serialized Solana transaction and returns the fully signed transaction bytes as base64.
 */
function signSerializedTransaction(transaction: string, keypair: Keypair): string {
  const txBytes = Buffer.from(transaction, 'base64');

  try {
    const versioned = VersionedTransaction.deserialize(txBytes);
    versioned.sign([keypair]);
    return Buffer.from(versioned.serialize()).toString('base64');
  } catch {
    const legacy = Transaction.from(txBytes);
    legacy.partialSign(keypair);
    return legacy.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    }).toString('base64');
  }
}

/**
 * Executes the create signing proxy operation.
 */
export async function createSigningProxy() {
  const config = loadSigningConfig();
  
  if (!config.authToken) {
    logger.warn('No auth token configured - signing proxy will reject all requests');
  }
  
  // Dynamic imports for ESM compatibility
  const express = (await import('express')).default;
  const cors = (await import('cors')).default;
  
  const app = express();
  
  app.use(cors({ origin: 'http://localhost', credentials: false }));
  app.use(express.json({ limit: '1mb' }));
  
  const authMiddleware: HttpHandler = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const authToken = typeof authHeader === 'string' ? authHeader.replace('Bearer ', '') : undefined;
    
    if (!authToken || authToken !== config.authToken) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  };
  app.use(authMiddleware);
  
  const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
  
  const rateLimitMiddleware: HttpHandler = (req, res, next) => {
    const headerSessionId = req.headers['x-session-id'];
    const sessionId = typeof headerSessionId === 'string' ? headerSessionId : 'unknown';
    const now = Date.now();
    
    let session = rateLimitMap.get(sessionId);
    
    if (!session || now > session.resetAt) {
      session = { count: 0, resetAt: now + 60000 };
      rateLimitMap.set(sessionId, session);
    }
    
    session.count++;
    
    if (session.count > 100) {
      res.status(429).json({ error: 'Rate limit exceeded' });
      return;
    }
    next();
  };
  app.use(rateLimitMiddleware);
  
  const healthHandler: HttpHandler = (_req, res) => {
    res.json({
      status: 'ok',
      service: 'sap-signing-proxy',
      port: config.port,
      timestamp: new Date().toISOString(),
    });
  };
  app.get('/health', healthHandler);

  const publicKeyHandler: HttpHandler = async (req, res) => {
    const agentId = resolveRequestedAgentId(req);

    if (!agentId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required agent id. Use /sign/:agentId, ?agentId=, or SAP_SIGNING_AGENT_ID.',
      });
    }

    try {
      const keypair = loadAgentKeyfile(agentId, process.env.SAP_KEYFILE_PASSPHRASE);
      res.json({
        publicKey: keypair.publicKey.toBase58(),
      });
    } catch (error) {
      logger.error('Public key lookup failed', { error, agentId });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Public key lookup failed',
      });
    }
  };
  app.get('/sign', publicKeyHandler);
  app.get('/sign/:agentId', publicKeyHandler);
  
  const signHandler: HttpHandler = async (req, res) => {
    const { transaction, agentId: bodyAgentId, sessionId } = parseSigningRequest(req.body);
    const agentId = resolveRequestedAgentId(req, bodyAgentId);
    
    logger.info('Signing request received', { agentId, sessionId });
    
    try {
      if (!transaction || !agentId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: transaction, agentId',
        } as SigningResponse);
      }
      
      const keypair = loadAgentKeyfile(agentId, process.env.SAP_KEYFILE_PASSPHRASE);
      
      logger.info('Keypair loaded', { 
        publicKey: keypair.publicKey.toBase58().slice(0, 8) + '...' 
      });
      
      const signedTransaction = signSerializedTransaction(transaction, keypair);
      
      logger.info('Transaction signed', { agentId });
      
      logger.audit('transaction_signed', {
        agentId,
        sessionId,
        signer: keypair.publicKey.toBase58(),
        timestamp: new Date().toISOString(),
      });
      
      res.json({
        success: true,
        signedTransaction,
        publicKey: keypair.publicKey.toBase58(),
      } as SigningResponse);
      
    } catch (error) {
      logger.error('Signing failed', { error, agentId });
      
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Signing failed',
      } as SigningResponse);
    }
  };
  app.post('/sign', signHandler);
  app.post('/sign/:agentId', signHandler);
  
  const server = app.listen(config.port, HOST, () => {
    logger.info('Signing proxy started', {
      host: HOST,
      port: config.port,
      configDir: CONFIG_DIR,
    });
    
    console.log(`
╔══════════════════════════════════════════════════════════╗
║           SAP MCP Signing Proxy                          ║
╚══════════════════════════════════════════════════════════╝
Endpoint: http://${HOST}:${config.port}/sign
Health:   http://${HOST}:${config.port}/health
Config:   ${CONFIG_DIR}
Keypairs: ${getKeypairsDir()}
`);
  });
  
  process.on('SIGINT', () => {
    logger.info('Shutting down signing proxy...');
    server.close(() => {
      logger.info('Signing proxy stopped');
      process.exit(0);
    });
  });
  
  return server;
}

if (process.argv[1]?.endsWith('signing-proxy.js') || process.argv[1]?.endsWith('signing-proxy.ts')) {
  void createSigningProxy();
}
