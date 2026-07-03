#!/usr/bin/env node
/**
 * @name X402PaidCallHelper
 * @description Local helper for paying and retrying hosted SAP MCP x402 tool calls with a user-controlled SAP profile signer.
 */

import { readFileSync } from 'fs';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import type { PaymentRequired, PaymentRequirements, SettleResponse } from '@x402/core/types';
import { registerExactSvmScheme } from '@x402/svm/exact/client';
import { createKeyPairSignerFromBytes } from '@solana/kit';
import { loadConfig, type SapMcpConfig } from '../config/env.js';
import { getProfileConfigPath } from '../config/profiles.js';
import { MCP_SERVER_VERSION } from '../core/constants.js';

const DEFAULT_ENDPOINT = 'https://mcp.sap.oobeprotocol.ai/mcp';
const MCP_PROTOCOL_VERSION = '2025-06-18';

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
  confirm: boolean;
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

  const endpoint = input.endpoint ?? DEFAULT_ENDPOINT;
  const config = loadPaymentProfile(input.profileName);
  const signer = await loadClientSigner(config);
  const httpClient = createHttpPaymentClient(signer);
  const sessionId = await initializeMcpSession(endpoint);
  const requestBody = input.body ?? buildToolCallRequest(input.toolName ?? '', input.arguments);

  const unpaid = await postMcp(endpoint, requestBody, sessionId);
  const paymentRequired = httpClient.getPaymentRequiredResponse(
    name => unpaid.response.headers.get(name),
    unpaid.body,
  );
  const selectedRequirements = selectSingleRequirement(paymentRequired, input.maxPriceUsd);
  const amountUsd = paymentRequirementsAmountUsd(selectedRequirements);

  const paymentPayload = await httpClient.createPaymentPayload({
    ...paymentRequired,
    accepts: [selectedRequirements],
  });
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);
  const paid = await postMcp(endpoint, requestBody, sessionId, paymentHeaders);
  const paymentResult = await httpClient.processPaymentResult(
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
    endpoint,
    sessionId,
    signerAddress: String(signer.address),
    payment: {
      amountUsd,
      network: selectedRequirements.network,
      asset: selectedRequirements.asset,
      payTo: selectedRequirements.payTo,
    },
    settlement: paymentResult.settleResponse,
    response: paid.body,
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

function paymentRequirementsAmountUsd(requirements: PaymentRequirements): number {
  const compatibleRequirements = requirements as PaymentRequirementsWithLegacyAmount;
  const rawAmount = compatibleRequirements.amount || compatibleRequirements.maxAmountRequired;
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount)) {
    throw new Error('Payment requirement amount is not numeric.');
  }
  return amount / 1_000_000;
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

function printUsageAndExit(exitCode: number): never {
  const usage = [
    'sap-mcp-x402-paid-call --tool <tool> --arguments <json> --max-usd <n> --confirm',
    '',
    'Options:',
    '  --endpoint <url>    Hosted MCP endpoint. Defaults to https://mcp.sap.oobeprotocol.ai/mcp',
    '  --tool <name>       Remote MCP tool name to call.',
    '  --arguments <json>  JSON object passed as tools/call arguments.',
    '  --body <json>       Full JSON-RPC request object. Alternative to --tool.',
    '  --profile <name>    SAP MCP profile name. Defaults to active profile.',
    '  --max-usd <n>       Maximum allowed payment in USD.',
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
