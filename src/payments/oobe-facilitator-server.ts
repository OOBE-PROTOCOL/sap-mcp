#!/usr/bin/env node
/**
 * @name OobeX402FacilitatorServer
 * @description Self-hosted OOBE x402 SVM facilitator compatible with @x402/core HTTPFacilitatorClient.
 */

import * as http from 'http';
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, resolve } from 'path';
import { timingSafeEqual } from 'crypto';
import { x402Facilitator } from '@x402/core/facilitator';
import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
  SettleRequest,
  VerifyRequest,
} from '@x402/core/types';
import { createKeyPairSignerFromBytes } from '@solana/kit';
import { Keypair } from '@solana/web3.js';
import { toFacilitatorSvmSigner } from '@x402/svm';
import { registerExactSvmScheme } from '@x402/svm/exact/facilitator';
import { logger, initLogger, redactSensitiveString } from '../core/logger.js';
import { getKeypairsDir } from '../config/paths.js';

const SOLANA_MAINNET_CAIP2 = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const SOLANA_DEVNET_CAIP2 = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
const SOLANA_TESTNET_CAIP2 = 'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z';
const DEFAULT_FACILITATOR_PORT = 8788;
const DEFAULT_FACILITATOR_HOST = '127.0.0.1';
const MAX_JSON_BYTES = 2 * 1024 * 1024;

/**
 * @name OobeFacilitatorConfig
 * @description Runtime configuration for the self-hosted OOBE x402 facilitator.
 */
export interface OobeFacilitatorConfig {
  host: string;
  port: number;
  pathPrefix: string;
  networks: Network[];
  signerPath: string;
  rpcUrl?: string;
  authToken?: string;
}

/**
 * @name OobeX402FacilitatorServer
 * @description HTTP server exposing `/supported`, `/verify`, and `/settle` for x402 facilitator clients.
 */
export class OobeX402FacilitatorServer {
  private readonly config: OobeFacilitatorConfig;
  private readonly facilitator: x402Facilitator;
  private httpServer?: http.Server;

  private constructor(config: OobeFacilitatorConfig, facilitator: x402Facilitator) {
    this.config = config;
    this.facilitator = facilitator;
  }

  /**
   * @name create
   * @description Creates a facilitator server with an SVM exact scheme registered for configured Solana networks.
   */
  public static async create(config = loadOobeFacilitatorConfig()): Promise<OobeX402FacilitatorServer> {
    validateFacilitatorConfig(config);
    const signerBytes = loadKeypairBytes(config.signerPath);
    const keypairSigner = await createKeyPairSignerFromBytes(signerBytes);
    const svmSigner = toFacilitatorSvmSigner(
      keypairSigner,
      config.rpcUrl ? { defaultRpcUrl: config.rpcUrl } : undefined,
    );

    const facilitator = new x402Facilitator();
    registerExactSvmScheme(facilitator, {
      signer: svmSigner,
      networks: config.networks,
    });

    facilitator
      .onAfterVerify(async context => {
        logger.info('x402 facilitator verify accepted', {
          network: context.requirements.network,
          amount: context.requirements.amount,
          payer: context.result.payer,
        });
      })
      .onAfterSettle(async context => {
        logger.info('x402 facilitator settlement complete', {
          network: context.result.network,
          transaction: context.result.transaction,
          amount: context.result.amount,
          payer: context.result.payer,
        });
      });

    return new OobeX402FacilitatorServer(config, facilitator);
  }

  /**
   * @name start
   * @description Starts the OOBE x402 facilitator HTTP server.
   */
  public async start(): Promise<void> {
    this.httpServer = http.createServer(async (request, response) => {
      try {
        await this.handleRequest(request, response);
      } catch (error) {
        logger.error('OOBE x402 facilitator request failed', { error });
        writeJson(response, 500, { error: 'internal_facilitator_error' });
      }
    });

    await new Promise<void>((resolveStart, rejectStart) => {
      this.httpServer?.once('error', rejectStart);
      this.httpServer?.listen(this.config.port, this.config.host, resolveStart);
    });

    logger.info('OOBE x402 facilitator started', {
      endpoint: `http://${this.config.host}:${this.config.port}${this.config.pathPrefix}`,
      networks: this.config.networks,
      signerAddresses: this.facilitator.getSupported().signers,
    });
  }

  /**
   * @name stop
   * @description Stops the facilitator HTTP listener.
   */
  public async stop(): Promise<void> {
    if (!this.httpServer) {
      return;
    }

    await new Promise<void>(resolveStop => {
      this.httpServer?.close(() => resolveStop());
    });
  }

  private async handleRequest(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    const route = normalizeRoute(url.pathname, this.config.pathPrefix);

    if (request.method === 'GET' && route === '/health') {
      writeJson(response, 200, { status: 'ok', service: 'oobe-x402-facilitator' });
      return;
    }

    if (request.method === 'OPTIONS') {
      writeCors(response);
      response.writeHead(204);
      response.end();
      return;
    }

    if (!this.isAuthorized(request)) {
      writeJson(response, 401, { error: 'unauthorized' }, { 'WWW-Authenticate': 'Bearer' });
      return;
    }

    if (request.method === 'GET' && route === '/supported') {
      writeJson(response, 200, this.facilitator.getSupported());
      return;
    }

    if (request.method === 'POST' && route === '/verify') {
      const body = parseVerifyRequest(await readJsonBody(request));
      const result = await this.facilitator.verify(body.paymentPayload, body.paymentRequirements);
      writeJson(response, 200, result);
      return;
    }

    if (request.method === 'POST' && route === '/settle') {
      const body = parseSettleRequest(await readJsonBody(request));
      const result = await this.facilitator.settle(body.paymentPayload, body.paymentRequirements);
      writeJson(response, result.success ? 200 : 402, result);
      return;
    }

    writeJson(response, 404, { error: 'not_found' });
  }

  private isAuthorized(request: http.IncomingMessage): boolean {
    if (!this.config.authToken) {
      return true;
    }

    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      return false;
    }

    return constantTimeEqual(authorization.slice(7).trim(), this.config.authToken);
  }
}

/**
 * @name loadOobeFacilitatorConfig
 * @description Loads OOBE facilitator config from process environment.
 */
export function loadOobeFacilitatorConfig(): OobeFacilitatorConfig {
  return {
    host: process.env.SAP_MCP_FACILITATOR_HOST ?? DEFAULT_FACILITATOR_HOST,
    port: Number.parseInt(process.env.SAP_MCP_FACILITATOR_PORT ?? String(DEFAULT_FACILITATOR_PORT), 10),
    pathPrefix: normalizePathPrefix(process.env.SAP_MCP_FACILITATOR_PATH_PREFIX ?? '/facilitator'),
    networks: parseNetworks(process.env.SAP_MCP_FACILITATOR_NETWORKS),
    signerPath: expandHome(
      process.env.SAP_MCP_FACILITATOR_SIGNER_PATH
        ?? `${getKeypairsDir()}/oobe-x402-facilitator-keypair.json`,
    ),
    rpcUrl: process.env.SAP_MCP_FACILITATOR_RPC_URL,
    authToken: process.env.SAP_MCP_FACILITATOR_AUTH_TOKEN,
  };
}

/**
 * @name createFacilitatorSigner
 * @description Creates a dedicated 64-byte Solana keypair JSON for the x402 facilitator fee-payer role.
 */
export function createFacilitatorSigner(path = loadOobeFacilitatorConfig().signerPath): {
  path: string;
  publicKey: string;
  created: boolean;
} {
  const resolvedPath = expandHome(path);
  if (existsSync(resolvedPath)) {
    return {
      path: resolvedPath,
      publicKey: getFacilitatorSignerPublicKey(resolvedPath),
      created: false,
    };
  }

  mkdirSync(dirname(resolvedPath), { recursive: true, mode: 0o700 });
  const keypair = Keypair.generate();
  writeFileSync(resolvedPath, JSON.stringify(Array.from(keypair.secretKey)), {
    encoding: 'utf-8',
    mode: 0o600,
  });
  chmodSync(resolvedPath, 0o600);

  return {
    path: resolvedPath,
    publicKey: keypair.publicKey.toBase58(),
    created: true,
  };
}

/**
 * @name getFacilitatorSignerPublicKey
 * @description Reads the facilitator signer file only to derive the public key and never returns secret bytes.
 */
export function getFacilitatorSignerPublicKey(path = loadOobeFacilitatorConfig().signerPath): string {
  const signerBytes = loadKeypairBytes(expandHome(path));
  return Keypair.fromSecretKey(signerBytes).publicKey.toBase58();
}

/**
 * @name validateFacilitatorConfig
 * @description Fails fast on unsafe public facilitator configuration before loading signer material.
 */
export function validateFacilitatorConfig(config: OobeFacilitatorConfig): void {
  if (!Number.isInteger(config.port) || config.port <= 0 || config.port > 65535) {
    throw new Error(`Invalid facilitator port: ${config.port}`);
  }

  if (config.networks.length === 0) {
    throw new Error('SAP_MCP_FACILITATOR_NETWORKS must contain at least one network');
  }

  if (!isLoopbackHost(config.host) && !config.authToken) {
    throw new Error(
      'SAP_MCP_FACILITATOR_AUTH_TOKEN is required when SAP_MCP_FACILITATOR_HOST is not loopback. ' +
      'Bind to 127.0.0.1 behind a reverse proxy or set a strong bearer token.',
    );
  }

  if (!existsSync(config.signerPath)) {
    throw new Error(
      `Facilitator signer not found at ${config.signerPath}. ` +
      'Run `npx sap-mcp-facilitator init` to create a dedicated fee-payer keypair, then fund it with SOL for transaction fees.',
    );
  }

  const mode = statSync(config.signerPath).mode & 0o777;
  if ((mode & 0o077) !== 0) {
    throw new Error(`Facilitator signer must not be group/world-readable. Run: chmod 600 ${config.signerPath}`);
  }
}

function parseNetworks(value: string | undefined): Network[] {
  if (!value) {
    return [SOLANA_DEVNET_CAIP2 as Network];
  }

  const networks = value.split(',').map(item => item.trim()).filter(Boolean);
  return networks.map(network => normalizeNetworkAlias(network) as Network);
}

function normalizeNetworkAlias(network: string): string {
  if (network === 'mainnet' || network === 'mainnet-beta' || network === 'solana') {
    return SOLANA_MAINNET_CAIP2;
  }
  if (network === 'devnet' || network === 'solana-devnet') {
    return SOLANA_DEVNET_CAIP2;
  }
  if (network === 'testnet' || network === 'solana-testnet') {
    return SOLANA_TESTNET_CAIP2;
  }
  return network;
}

function loadKeypairBytes(path: string): Uint8Array {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
  if (!Array.isArray(parsed) || parsed.length !== 64 || !parsed.every(isByte)) {
    throw new Error(`Facilitator signer must be a Solana 64-byte keypair JSON array: ${path}`);
  }
  return Uint8Array.from(parsed);
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === '127.0.0.1'
    || normalized === 'localhost'
    || normalized === '::1'
    || normalized === '[::1]';
}

function isByte(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value >= 0 && value <= 255;
}

async function readJsonBody(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > MAX_JSON_BYTES) {
      throw new Error(`Facilitator request body exceeds ${MAX_JSON_BYTES} bytes`);
    }
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as unknown;
}

function parseVerifyRequest(body: unknown): VerifyRequest {
  const record = requireRecord(body, 'verify request');
  return {
    x402Version: requireNumber(record.x402Version, 'x402Version'),
    paymentPayload: requireRecord(record.paymentPayload, 'paymentPayload') as PaymentPayload,
    paymentRequirements: requireRecord(record.paymentRequirements, 'paymentRequirements') as PaymentRequirements,
  };
}

function parseSettleRequest(body: unknown): SettleRequest {
  const record = requireRecord(body, 'settle request');
  return {
    x402Version: requireNumber(record.x402Version, 'x402Version'),
    paymentPayload: requireRecord(record.paymentPayload, 'paymentPayload') as PaymentPayload,
    paymentRequirements: requireRecord(record.paymentRequirements, 'paymentRequirements') as PaymentRequirements,
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value as Record<string, unknown>;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function normalizePathPrefix(value: string): string {
  const prefixed = value.startsWith('/') ? value : `/${value}`;
  return prefixed.replace(/\/+$/, '') || '';
}

function normalizeRoute(pathname: string, prefix: string): string {
  if (prefix && pathname.startsWith(prefix)) {
    return pathname.slice(prefix.length) || '/';
  }
  return pathname;
}

function expandHome(path: string): string {
  if (path === '~') {
    return homedir();
  }
  if (path.startsWith('~/')) {
    return resolve(homedir(), path.slice(2));
  }
  return path;
}

function constantTimeEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.byteLength !== expectedBuffer.byteLength) {
    return false;
  }
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function writeCors(response: http.ServerResponse): void {
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function writeJson(
  response: http.ServerResponse,
  status: number,
  body: unknown,
  headers: http.OutgoingHttpHeaders = {},
): void {
  writeCors(response);
  response.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  response.end(JSON.stringify(body));
}

function printCliUsage(): void {
  process.stdout.write([
    'sap-mcp-facilitator',
    '',
    'Self-hosted OOBE x402 SVM facilitator for SAP MCP.',
    '',
    'Usage:',
    '  npx sap-mcp-facilitator init    # Create dedicated facilitator fee-payer keypair',
    '  npx sap-mcp-facilitator show    # Show redacted facilitator config and public key',
    '  npx sap-mcp-facilitator start   # Start /supported, /verify, and /settle',
    '  npx sap-mcp-facilitator         # Same as start',
    '',
    'Required for public deployment:',
    '  SAP_MCP_FACILITATOR_AUTH_TOKEN=<strong bearer token>',
    '  SAP_MCP_FACILITATOR_SIGNER_PATH=~/.config/mcp-sap/keypairs/oobe-x402-facilitator-keypair.json',
    '',
  ].join('\n'));
}

async function runCli(argv: string[]): Promise<void> {
  const command = argv[0] ?? 'start';
  if (command === '--help' || command === '-h' || command === 'help') {
    printCliUsage();
    return;
  }

  const config = loadOobeFacilitatorConfig();
  if (command === 'init') {
    const signer = createFacilitatorSigner(config.signerPath);
    process.stdout.write([
      signer.created ? 'Facilitator signer created.' : 'Facilitator signer already exists.',
      `Path: ${signer.path}`,
      `Public Key: ${signer.publicKey}`,
      `Networks: ${config.networks.join(', ')}`,
      'Fund this public key with SOL on each configured network so it can pay settlement transaction fees.',
      'Never reuse the SAP agent wallet or Solana CLI keypair for this role.',
      '',
    ].join('\n'));
    return;
  }

  if (command === 'show') {
    validateFacilitatorConfig(config);
    process.stdout.write([
      'OOBE x402 facilitator configuration',
      `Endpoint: http://${config.host}:${config.port}${config.pathPrefix}`,
      `Networks: ${config.networks.join(', ')}`,
      `Signer Path: ${config.signerPath}`,
      `Signer Public Key: ${getFacilitatorSignerPublicKey(config.signerPath)}`,
      `RPC URL: ${config.rpcUrl ? redactSensitiveString(config.rpcUrl) : '(x402 default)'}`,
      `Auth Token: ${config.authToken ? 'configured' : 'not configured'}`,
      'Secret Material: never printed',
      '',
    ].join('\n'));
    return;
  }

  if (command !== 'start') {
    throw new Error(`Unknown sap-mcp-facilitator command: ${command}`);
  }

  const server = await OobeX402FacilitatorServer.create(config);
  await server.start();

  process.on('SIGINT', () => {
    void server.stop().then(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    void server.stop().then(() => process.exit(0));
  });
}

if (process.argv[1]?.endsWith('oobe-facilitator-server.js') || process.argv[1]?.endsWith('oobe-facilitator-server.ts')) {
  initLogger({
    level: process.env.SAP_MCP_LOG_LEVEL === 'debug' ? 'debug' : 'info',
    format: process.env.SAP_MCP_LOG_FORMAT === 'json' ? 'json' : 'pretty',
  });

  await runCli(process.argv.slice(2));
}
