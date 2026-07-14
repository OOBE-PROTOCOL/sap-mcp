#!/usr/bin/env node
/**
 * @name X402PaidCallHelper
 * @description Local helper for paying and retrying hosted SAP MCP x402 tool calls with a user-controlled SAP profile signer.
 */

import { readFileSync } from 'fs';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import type { PaymentPayload, PaymentRequired, PaymentRequirements, SettleResponse } from '@x402/core/types';
import { registerExactSvmScheme } from '@x402/svm/exact/client';
import { createKeyPairSignerFromBytes } from '@solana/kit';
import { loadConfig, type SapMcpConfig } from '../config/env.js';
import { getProfileConfigPath } from '../config/profiles.js';
import { MCP_SERVER_VERSION } from '../core/constants.js';

export const DEFAULT_X402_PAID_CALL_ENDPOINT = 'https://mcp.sap.oobeprotocol.ai/mcp';
const MCP_PROTOCOL_VERSION = '2025-06-18';
const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_ALLOWED_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 500;

/**
 * @name X402PaidCallInput
 * @description Request shape accepted by the local x402 paid-call helper.
 */
export interface X402PaidCallInput {
  endpoint?: string;
  toolName?: string;
  arguments?: unknown;
  body?: JsonRpcRequest;
  profileName?: string;
  maxPriceUsd: number;
  maxAttempts?: number;
  confirm: boolean;
}

/**
 * @name X402ChallengeProbeInput
 * @description Request shape for obtaining a hosted MCP x402 challenge without signing it.
 */
export interface X402ChallengeProbeInput {
  endpoint?: string;
  toolName?: string;
  arguments?: unknown;
  body?: JsonRpcRequest;
  maxPriceUsd?: number;
}

/**
 * @name X402ChallengeProbeResult
 * @description Parsed x402 challenge returned by the hosted MCP server before local signing.
 */
export interface X402ChallengeProbeResult {
  endpoint: string;
  sessionId: string;
  requestBody: JsonRpcRequest;
  paymentRequired: PaymentRequired;
  selectedRequirements: PaymentRequirements;
  amountUsd: number;
  instructions: {
    signer: 'local-sap-mcp-profile-or-external-signer';
    retryHeader: 'Payment-Signature';
    settlementHeader: 'Payment-Response';
    requestBinding: 'json-rpc-method-and-params';
    recommendedTool: 'sap_payments_call_paid_tool';
  };
}

/**
 * @name X402ChallengeSignInput
 * @description Request shape for signing a previously obtained x402 challenge without executing the paid call.
 */
export interface X402ChallengeSignInput {
  paymentRequired: PaymentRequired;
  selectedIndex?: number;
  profileName?: string;
  maxPriceUsd: number;
  confirm: boolean;
}

/**
 * @name X402ChallengeSignResult
 * @description One-time payment header generated from a challenge and a local SAP MCP profile signer.
 */
export interface X402ChallengeSignResult {
  signerAddress: string;
  amountUsd: number;
  payment: {
    network: string;
    asset: string;
    payTo: string;
  };
  headers: Record<string, string>;
  payload: PaymentPayload;
  warning: string;
}

/**
 * @name X402ReceiptInspectionResult
 * @description Parsed x402 settlement receipt header or structured settlement response.
 */
export interface X402ReceiptInspectionResult {
  validJson: boolean;
  decoded: unknown;
  txSignature?: string;
  network?: string;
  warning?: string;
}

/**
 * @name X402PaidCallResult
 * @description Result returned after a hosted MCP paid request is completed.
 */
export interface X402PaidCallResult {
  success: boolean;
  endpoint: string;
  sessionId: string;
  signerAddress: string;
  payment: {
    amountUsd: number;
    network: string;
    asset: string;
    payTo: string;
  };
  settlement?: SettleResponse;
  response: unknown;
  attempts: number;
  transientRetries: readonly string[];
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: unknown;
}

interface ParsedCliArgs {
  endpoint?: string;
  toolName?: string;
  argumentsJson?: string;
  bodyJson?: string;
  profileName?: string;
  maxPriceUsd?: number;
  maxAttempts?: number;
  confirm: boolean;
}

type PaymentRequirementsWithLegacyAmount = PaymentRequirements & {
  maxAmountRequired?: string;
};

/**
 * @name executeX402PaidCall
 * @description Initializes MCP, obtains x402 payment requirements, signs locally, retries the call, and returns the settlement receipt.
 */
export async function executeX402PaidCall(input: X402PaidCallInput): Promise<X402PaidCallResult> {
  validateInput(input);

  const endpoint = input.endpoint ?? DEFAULT_X402_PAID_CALL_ENDPOINT;
  const config = loadPaymentProfile(input.profileName);
  const signer = await loadClientSigner(config);
  const httpClient = createHttpPaymentClient(signer);
  const sessionId = await initializeMcpSession(endpoint);
  const requestBody = input.body ?? buildToolCallRequest(input.toolName ?? '', input.arguments);
  const maxAttempts = normalizeMaxAttempts(input.maxAttempts);
  const transientRetries: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await executePaidAttempt({
        endpoint,
        sessionId,
        signerAddress: String(signer.address),
        httpClient,
        requestBody,
        maxPriceUsd: input.maxPriceUsd,
        attempt,
        transientRetries,
      });
    } catch (error) {
      const retry = classifyPaidCallRetry(error);
      if (!retry.retryable || attempt >= maxAttempts) {
        throw error;
      }

      transientRetries.push(retry.reason);
      await sleep(RETRY_BASE_DELAY_MS * attempt);
    }
  }

  throw new Error('x402 paid call exhausted retries.');
}

/**
 * @name probeX402PaymentChallenge
 * @description Initializes hosted MCP and returns a parsed x402 challenge for one unpaid tool call without signing.
 */
export async function probeX402PaymentChallenge(input: X402ChallengeProbeInput): Promise<X402ChallengeProbeResult> {
  const endpoint = input.endpoint ?? DEFAULT_X402_PAID_CALL_ENDPOINT;
  const sessionId = await initializeMcpSession(endpoint);
  const requestBody = input.body ?? buildToolCallRequest(input.toolName ?? '', input.arguments);
  if (!input.body && !input.toolName) {
    throw new Error('Provide either body or toolName.');
  }

  const unpaid = await postMcp(endpoint, requestBody, sessionId);
  const paymentRequired = extractPaymentRequired(unpaid.response, unpaid.body);
  const selectedRequirements = selectSingleRequirement(paymentRequired, input.maxPriceUsd ?? Number.POSITIVE_INFINITY);

  return {
    endpoint,
    sessionId,
    requestBody,
    paymentRequired,
    selectedRequirements,
    amountUsd: paymentRequirementsAmountUsd(selectedRequirements),
    instructions: {
      signer: 'local-sap-mcp-profile-or-external-signer',
      retryHeader: 'Payment-Signature',
      settlementHeader: 'Payment-Response',
      requestBinding: 'json-rpc-method-and-params',
      recommendedTool: 'sap_payments_call_paid_tool',
    },
  };
}

/**
 * @name signX402PaymentChallenge
 * @description Signs a parsed x402 challenge with the active SAP MCP profile signer and returns a one-time payment header.
 */
export async function signX402PaymentChallenge(input: X402ChallengeSignInput): Promise<X402ChallengeSignResult> {
  if (!input.confirm) {
    throw new Error('Signing an x402 challenge requires confirm: true because it creates a payment authorization.');
  }
  if (!Number.isFinite(input.maxPriceUsd) || input.maxPriceUsd <= 0) {
    throw new Error('Signing an x402 challenge requires a positive maxPriceUsd spending cap.');
  }

  const selectedRequirements = selectRequirementByIndex(input.paymentRequired, input.selectedIndex ?? 0, input.maxPriceUsd);
  const config = loadPaymentProfile(input.profileName);
  const signer = await loadClientSigner(config);
  const httpClient = createHttpPaymentClient(signer);
  const paymentPayload = await httpClient.createPaymentPayload({
    ...input.paymentRequired,
    accepts: [selectedRequirements],
  });

  return {
    signerAddress: String(signer.address),
    amountUsd: paymentRequirementsAmountUsd(selectedRequirements),
    payment: {
      network: selectedRequirements.network,
      asset: selectedRequirements.asset,
      payTo: selectedRequirements.payTo,
    },
    headers: httpClient.encodePaymentSignatureHeader(paymentPayload),
    payload: paymentPayload,
    warning: 'Treat this payment header as one-time authorization material. Prefer sap_payments_call_paid_tool for normal agent use.',
  };
}

/**
 * @name inspectX402Receipt
 * @description Decodes a PAYMENT-RESPONSE or X-PAYMENT-RESPONSE header for agent-readable receipt inspection.
 */
export function inspectX402Receipt(receiptHeader: string): X402ReceiptInspectionResult {
  const decoded = decodeMaybeBase64Json(receiptHeader);
  if (!decoded.validJson) {
    return {
      validJson: false,
      decoded: decoded.value,
      warning: 'Receipt header is not JSON or base64-encoded JSON.',
    };
  }

  const record = isRecord(decoded.value) ? decoded.value : {};
  const txSignature = firstString(record, ['txSignature', 'signature', 'transactionSignature', 'transaction']);
  const network = firstString(record, ['network', 'chain', 'chainId']);
  return {
    validJson: true,
    decoded: decoded.value,
    ...(txSignature ? { txSignature } : {}),
    ...(network ? { network } : {}),
  };
}

async function executePaidAttempt(options: {
  endpoint: string;
  sessionId: string;
  signerAddress: string;
  httpClient: x402HTTPClient;
  requestBody: JsonRpcRequest;
  maxPriceUsd: number;
  attempt: number;
  transientRetries: readonly string[];
}): Promise<X402PaidCallResult> {
  const unpaid = await postMcp(options.endpoint, options.requestBody, options.sessionId);
  const paymentRequired = getPaymentRequiredResponse(options.httpClient, unpaid.response, unpaid.body);
  const selectedRequirements = selectSingleRequirement(paymentRequired, options.maxPriceUsd);
  const amountUsd = paymentRequirementsAmountUsd(selectedRequirements);

  const paymentPayload = await options.httpClient.createPaymentPayload({
    ...paymentRequired,
    accepts: [selectedRequirements],
  });
  const paymentHeaders = options.httpClient.encodePaymentSignatureHeader(paymentPayload);
  const paid = await postMcp(options.endpoint, options.requestBody, options.sessionId, paymentHeaders);
  const paymentResult = await options.httpClient.processPaymentResult(
    paymentPayload,
    name => paid.response.headers.get(name),
    paid.response.status,
  );

  if (!paid.response.ok) {
    throw new Error(`Paid MCP call failed with HTTP ${paid.response.status}: ${JSON.stringify(paid.body)}`);
  }

  if (isJsonRpcError(paid.body)) {
    throw new Error(`Paid MCP call returned JSON-RPC error: ${JSON.stringify(paid.body.error)}`);
  }

  return {
    success: true,
    endpoint: options.endpoint,
    sessionId: options.sessionId,
    signerAddress: options.signerAddress,
    payment: {
      amountUsd,
      network: selectedRequirements.network,
      asset: selectedRequirements.asset,
      payTo: selectedRequirements.payTo,
    },
    settlement: paymentResult.settleResponse,
    response: paid.body,
    attempts: options.attempt,
    transientRetries: options.transientRetries,
  };
}

function validateInput(input: X402PaidCallInput): void {
  if (!input.confirm) {
    throw new Error('x402 paid calls require confirm: true because they sign a payment payload.');
  }
  if (!Number.isFinite(input.maxPriceUsd) || input.maxPriceUsd <= 0) {
    throw new Error('x402 paid calls require a positive maxPriceUsd spending cap.');
  }
  if (!input.body && !input.toolName) {
    throw new Error('Provide either body or toolName.');
  }
}

function loadPaymentProfile(profileName: string | undefined): SapMcpConfig {
  if (profileName) {
    return loadConfig(getProfileConfigPath(profileName));
  }
  return loadConfig();
}

async function loadClientSigner(config: SapMcpConfig): Promise<Awaited<ReturnType<typeof createKeyPairSignerFromBytes>>> {
  if (config.walletEncrypted) {
    throw new Error('Encrypted wallet files are not supported by sap_x402_paid_call yet. Use an unencrypted dedicated SAP MCP payment profile or external signing bridge.');
  }
  if (config.externalSignerUrl && !config.walletPath) {
    throw new Error('External signer x402 paid-call support requires a dedicated signing bridge. The helper will not fake external signer support.');
  }
  if (!config.walletPath) {
    throw new Error('SAP MCP profile has no walletPath. Run sap-mcp-config wizard and configure a local payment signer.');
  }

  const parsed = JSON.parse(readFileSync(config.walletPath, 'utf-8')) as unknown;
  if (!Array.isArray(parsed) || !parsed.every(value => Number.isInteger(value) && value >= 0 && value <= 255)) {
    throw new Error('Configured wallet file is not a Solana keypair byte array.');
  }

  return await createKeyPairSignerFromBytes(Uint8Array.from(parsed));
}

function createHttpPaymentClient(signer: Awaited<ReturnType<typeof createKeyPairSignerFromBytes>>): x402HTTPClient {
  const client = new x402Client();
  registerExactSvmScheme(client, { signer });
  return new x402HTTPClient(client);
}

async function initializeMcpSession(endpoint: string): Promise<string> {
  const initBody: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: 'sap-x402-paid-call-init',
    method: 'initialize',
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: 'sap-mcp-x402-paid-call',
        version: MCP_SERVER_VERSION,
      },
    },
  };
  const initializedBody: JsonRpcRequest = {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  };

  const initialized = await postMcp(endpoint, initBody);
  const sessionId = initialized.response.headers.get('mcp-session-id');
  if (!sessionId) {
    throw new Error('Hosted MCP initialize response did not include mcp-session-id.');
  }
  await postMcp(endpoint, initializedBody, sessionId);
  return sessionId;
}

function buildToolCallRequest(toolName: string, args: unknown): JsonRpcRequest {
  return {
    jsonrpc: '2.0',
    id: 'sap-x402-paid-call-tool',
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args ?? {},
    },
  };
}

async function postMcp(
  endpoint: string,
  body: JsonRpcRequest,
  sessionId?: string,
  extraHeaders: Record<string, string> = {},
): Promise<{ response: Response; body: unknown }> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'mcp-protocol-version': MCP_PROTOCOL_VERSION,
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return {
    response,
    body: parseMcpHttpBody(text, response.headers.get('content-type') ?? ''),
  };
}

function getPaymentRequiredResponse(
  httpClient: x402HTTPClient,
  response: Response,
  body: unknown,
): PaymentRequired {
  return httpClient.getPaymentRequiredResponse(
    name => response.headers.get(name),
    body,
  );
}

function extractPaymentRequired(response: Response, body: unknown): PaymentRequired {
  const header = response.headers.get('payment-required') ?? response.headers.get('PAYMENT-REQUIRED');
  if (header) {
    const decoded = decodeMaybeBase64Json(header);
    if (decoded.validJson && isPaymentRequired(decoded.value)) {
      return decoded.value;
    }
  }

  if (isPaymentRequired(body)) {
    return body;
  }

  if (isRecord(body) && isRecord(body.error) && isRecord(body.error.data)) {
    const data = body.error.data;
    const requirements = data.paymentRequirements;
    if (Array.isArray(requirements)) {
      return {
        x402Version: 2,
        error: 'Payment required',
        accepts: requirements as PaymentRequirements[],
      } as PaymentRequired;
    }
  }

  throw new Error(`Hosted MCP response did not contain an x402 challenge: ${JSON.stringify(body)}`);
}

function parseMcpHttpBody(text: string, contentType: string): unknown {
  if (!text.trim()) {
    return null;
  }

  if (contentType.includes('text/event-stream')) {
    const dataLines = text
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice('data:'.length).trim());
    const firstJson = dataLines.find(line => line.startsWith('{') || line.startsWith('['));
    if (!firstJson) {
      return text;
    }
    return JSON.parse(firstJson) as unknown;
  }

  return JSON.parse(text) as unknown;
}

function selectSingleRequirement(paymentRequired: PaymentRequired, maxPriceUsd: number): PaymentRequirements {
  if (!Array.isArray(paymentRequired.accepts) || paymentRequired.accepts.length === 0) {
    throw new Error('Payment challenge did not include accepted payment requirements.');
  }

  const selected = paymentRequired.accepts[0];
  const amountUsd = paymentRequirementsAmountUsd(selected);
  if (amountUsd > maxPriceUsd) {
    throw new Error(`Payment amount $${amountUsd.toFixed(6)} exceeds maxPriceUsd $${maxPriceUsd.toFixed(6)}.`);
  }
  return selected;
}

function selectRequirementByIndex(
  paymentRequired: PaymentRequired,
  selectedIndex: number,
  maxPriceUsd: number,
): PaymentRequirements {
  if (!Array.isArray(paymentRequired.accepts) || paymentRequired.accepts.length === 0) {
    throw new Error('Payment challenge did not include accepted payment requirements.');
  }
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= paymentRequired.accepts.length) {
    throw new Error(`selectedIndex must be between 0 and ${paymentRequired.accepts.length - 1}.`);
  }

  const selected = paymentRequired.accepts[selectedIndex];
  const amountUsd = paymentRequirementsAmountUsd(selected);
  if (amountUsd > maxPriceUsd) {
    throw new Error(`Payment amount $${amountUsd.toFixed(6)} exceeds maxPriceUsd $${maxPriceUsd.toFixed(6)}.`);
  }
  return selected;
}

function paymentRequirementsAmountUsd(requirements: PaymentRequirements): number {
  const compatibleRequirements = requirements as PaymentRequirementsWithLegacyAmount;
  const rawAmount = compatibleRequirements.amount || compatibleRequirements.maxAmountRequired;
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount)) {
    throw new Error('Payment requirement amount is not numeric.');
  }
  return amount / 1_000_000;
}

function normalizeMaxAttempts(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_MAX_ATTEMPTS;
  }
  if (!Number.isInteger(value) || value < 1 || value > MAX_ALLOWED_ATTEMPTS) {
    throw new Error(`maxAttempts must be an integer between 1 and ${MAX_ALLOWED_ATTEMPTS}.`);
  }
  return value;
}

function classifyPaidCallRetry(error: unknown): { retryable: boolean; reason: string } {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  const retryable = containsAny(normalized, [
    'blockhashnotfound',
    'blockhash not found',
    'transaction_simulation_failed',
    'smart_wallet_simulation_failed',
    '"retryable":true',
    '"category":"facilitator_rpc"',
    '"category":"facilitator_unavailable"',
    'facilitator_unavailable',
    'node is behind',
    'minimum context slot',
    'slot was skipped',
    'fetch failed',
    'gateway timeout',
    'service unavailable',
    'too many requests',
    'rate limit',
  ]);

  return {
    retryable,
    reason: retryable ? summarizeRetryReason(message) : 'not_retryable',
  };
}

function summarizeRetryReason(message: string): string {
  if (message.length <= 240) {
    return message;
  }
  return `${message.slice(0, 237)}...`;
}

function containsAny(value: string, needles: readonly string[]): boolean {
  return needles.some(needle => value.includes(needle));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isJsonRpcError(value: unknown): value is { error: unknown } {
  return value !== null && typeof value === 'object' && 'error' in value;
}

function parseCliArgs(argv: string[]): ParsedCliArgs {
  const parsed: ParsedCliArgs = { confirm: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--endpoint' && next) {
      parsed.endpoint = next;
      index += 1;
    } else if (arg === '--tool' && next) {
      parsed.toolName = next;
      index += 1;
    } else if (arg === '--arguments' && next) {
      parsed.argumentsJson = next;
      index += 1;
    } else if (arg === '--body' && next) {
      parsed.bodyJson = next;
      index += 1;
    } else if (arg === '--profile' && next) {
      parsed.profileName = next;
      index += 1;
    } else if (arg === '--max-usd' && next) {
      parsed.maxPriceUsd = Number(next);
      index += 1;
    } else if (arg === '--max-attempts' && next) {
      parsed.maxAttempts = Number(next);
      index += 1;
    } else if (arg === '--confirm' || arg === '--yes') {
      parsed.confirm = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsageAndExit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function buildInputFromCli(args: ParsedCliArgs): X402PaidCallInput {
  const parsedArguments = args.argumentsJson ? JSON.parse(args.argumentsJson) as unknown : undefined;
  const parsedBody = args.bodyJson ? JSON.parse(args.bodyJson) as unknown : undefined;
  if (parsedBody !== undefined && !isJsonRpcRequest(parsedBody)) {
    throw new Error('--body must be a JSON-RPC request object.');
  }
  return {
    endpoint: args.endpoint,
    toolName: args.toolName,
    arguments: parsedArguments,
    body: parsedBody,
    profileName: args.profileName,
    maxPriceUsd: args.maxPriceUsd ?? 0,
    maxAttempts: args.maxAttempts,
    confirm: args.confirm,
  };
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as Record<string, unknown>).jsonrpc === '2.0'
    && typeof (value as Record<string, unknown>).method === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPaymentRequired(value: unknown): value is PaymentRequired {
  return isRecord(value)
    && Array.isArray(value.accepts)
    && value.accepts.every(isPaymentRequirements);
}

function isPaymentRequirements(value: unknown): value is PaymentRequirements {
  return isRecord(value)
    && typeof value.network === 'string'
    && typeof value.asset === 'string'
    && typeof value.payTo === 'string';
}

function decodeMaybeBase64Json(value: string): { validJson: true; value: unknown } | { validJson: false; value: string } {
  const candidates = [
    value,
    Buffer.from(value, 'base64').toString('utf-8'),
  ];
  for (const candidate of candidates) {
    try {
      return { validJson: true, value: JSON.parse(candidate) as unknown };
    } catch {
      continue;
    }
  }
  return { validJson: false, value };
}

function firstString(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function printUsageAndExit(exitCode: number): never {
  const usage = [
    'sap-mcp-x402-paid-call --tool <tool> --arguments <json> --max-usd <n> --confirm',
    '',
    'Options:',
    `  --endpoint <url>    Hosted MCP endpoint. Defaults to ${DEFAULT_X402_PAID_CALL_ENDPOINT}`,
    '  --tool <name>       Remote MCP tool name to call.',
    '  --arguments <json>  JSON object passed as tools/call arguments.',
    '  --body <json>       Full JSON-RPC request object. Alternative to --tool.',
    '  --profile <name>    SAP MCP profile name. Defaults to active profile.',
    '  --max-usd <n>       Maximum allowed payment in USD.',
    '  --max-attempts <n>  Retry transient x402/RPC failures with fresh payment payloads. Defaults to 3; max 5.',
    '  --confirm           Required. Acknowledges that the helper signs a payment payload.',
  ].join('\n');
  console.log(usage);
  process.exit(exitCode);
}

if (process.argv[1]?.endsWith('x402-paid-call.js') || process.argv[1]?.endsWith('x402-paid-call.ts')) {
  executeX402PaidCall(buildInputFromCli(parseCliArgs(process.argv.slice(2))))
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error: unknown) => {
      console.error(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }, null, 2));
      process.exit(1);
    });
}
