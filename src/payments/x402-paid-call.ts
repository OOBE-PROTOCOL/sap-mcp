#!/usr/bin/env node
/**
 * @name X402PaidCallHelper
 * @description Local helper for paying and retrying hosted SAP MCP x402 tool calls with a user-controlled SAP profile signer.
 */

import { existsSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import type { PaymentPayload, PaymentRequired, PaymentRequirements, SettleResponse } from '@x402/core/types';
import { registerExactSvmScheme } from '@x402/svm/exact/client';
import { createKeyPairSignerFromBytes } from '@solana/kit';
import { Connection, PublicKey } from '@solana/web3.js';
import { loadConfig, type SapMcpConfig } from '../config/env.js';
import { getActiveProfile, getProfileConfigPath } from '../config/profiles.js';
import { MCP_SERVER_VERSION } from '../core/constants.js';

export const DEFAULT_X402_PAID_CALL_ENDPOINT = 'https://mcp.sap.oobeprotocol.ai/mcp';
const MCP_PROTOCOL_VERSION = '2025-06-18';
const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_ALLOWED_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 500;
const MAX_EXTERNAL_BODY_BYTES = 256 * 1024;
const MAINNET_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const DEVNET_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

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
 * @name X402ExternalCallInput
 * @description Request shape accepted by the local helper for generic HTTP x402 endpoints outside hosted SAP MCP.
 */
export interface X402ExternalCallInput {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
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
 * @name AgentCommercePolicySnapshot
 * @description Redacted local policy limits used by agents before paying or moving value.
 */
export interface AgentCommercePolicySnapshot {
  autoPayX402BelowUsd: number;
  dailyX402LimitUsd?: number;
  maxTradeUsd?: number;
  maxSlippageBps: number;
  requireConfirmationAboveUsd: number;
  allowedProtocols: readonly string[];
  maxAttempts: number;
}

/**
 * @name X402PaymentReadinessResult
 * @description Full local readiness snapshot for hosted paid/write SAP MCP workflows.
 */
export interface X402PaymentReadinessResult {
  hostedMcp: {
    endpoint: string;
    accountModel: 'hosted-remote-accountless';
    toolNamespace: 'sap';
  };
  localBridge: {
    status: 'connected';
    toolNamespace: 'sap_payments';
    preferredTool: 'sap_payments_call_paid_tool';
    readinessTool: 'sap_payments_readiness';
  };
  profile: {
    activeProfile: string;
    configPath: string;
    mode: SapMcpConfig['mode'];
    network: string;
    rpcUrl: string;
    programId: string;
    walletPathConfigured: boolean;
    walletFileExists: boolean;
    signerConfigured: boolean;
    signerPublicKey?: string;
    agentPubkey?: string;
    secretMaterial: 'keypair-bytes-never-returned';
  };
  balances: {
    checked: boolean;
    sol?: number;
    usdc?: number;
    usdcMint: string;
    payerBalanceEnoughForAutoPay?: boolean;
    error?: string;
  };
  policy: AgentCommercePolicySnapshot;
  readiness: {
    status: 'ready' | 'degraded' | 'not-ready';
    canPayX402: boolean;
    canExecuteWriteTools: boolean;
    issues: readonly string[];
    nextAction: string;
  };
  agentInstruction: string;
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
  audit: X402PaidCallAudit;
}

/**
 * @name X402PaidCallAudit
 * @description Agent-readable proof object for one hosted paid MCP execution.
 */
export interface X402PaidCallAudit {
  intentId: string;
  profileName: string;
  signerAddress: string;
  endpoint: string;
  toolName?: string;
  requestMethod: string;
  payment: {
    amountUsd: number;
    network: string;
    asset: string;
    payTo: string;
  };
  receipt: {
    present: boolean;
    transaction?: string;
    network?: string;
    amount?: string;
    payer?: string;
  };
  attempts: number;
  transientRetries: readonly string[];
  secretMaterial: 'keypair-bytes-never-returned';
}

/**
 * @name X402ExternalCallResult
 * @description Result returned after a generic HTTP x402 request is completed through the local signer.
 */
export interface X402ExternalCallResult {
  success: boolean;
  url: string;
  method: string;
  signerAddress: string;
  payment?: {
    amountUsd: number;
    network: string;
    asset: string;
    payTo: string;
  };
  settlement?: SettleResponse;
  response: {
    status: number;
    headers: Record<string, string>;
    body: unknown;
  };
  attempts: number;
  transientRetries: readonly string[];
  audit: X402ExternalCallAudit;
}

/**
 * @name X402ExternalCallAudit
 * @description Agent-readable proof object for one generic x402 HTTP request.
 */
export interface X402ExternalCallAudit {
  intentId: string;
  profileName: string;
  signerAddress: string;
  url: string;
  method: string;
  payment?: {
    amountUsd: number;
    network: string;
    asset: string;
    payTo: string;
  };
  receipt: {
    present: boolean;
    transaction?: string;
    network?: string;
    amount?: string;
    payer?: string;
  };
  attempts: number;
  transientRetries: readonly string[];
  secretMaterial: 'keypair-bytes-never-returned';
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
  const profileName = input.profileName ?? getActiveProfile();
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
        profileName,
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
 * @name executeExternalX402Call
 * @description Calls a generic HTTP x402 endpoint by fetching its challenge, signing locally, retrying with the payment header, and returning the receipt.
 */
export async function executeExternalX402Call(input: X402ExternalCallInput): Promise<X402ExternalCallResult> {
  validateExternalInput(input);

  const url = normalizeExternalUrl(input.url);
  const method = normalizeHttpMethod(input.method);
  const profileName = input.profileName ?? getActiveProfile();
  const config = loadPaymentProfile(input.profileName);
  const signer = await loadClientSigner(config);
  const httpClient = createHttpPaymentClient(signer);
  const maxAttempts = normalizeMaxAttempts(input.maxAttempts);
  const transientRetries: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await executeExternalPaidAttempt({
        url,
        method,
        headers: normalizeExternalHeaders(input.headers),
        body: input.body,
        signerAddress: String(signer.address),
        httpClient,
        profileName,
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

  throw new Error('external x402 call exhausted retries.');
}

/**
 * @name getX402PaymentReadiness
 * @description Checks local profile, signer, RPC, balances, and commerce policy for hosted paid/write workflows.
 */
export async function getX402PaymentReadiness(
  profileName?: string,
  endpoint = DEFAULT_X402_PAID_CALL_ENDPOINT,
): Promise<X402PaymentReadinessResult> {
  const activeProfile = profileName ?? getActiveProfile();
  const configPath = getProfileConfigPath(activeProfile);
  let config: SapMcpConfig | undefined;
  let signerAddress: string | undefined;
  const issues: string[] = [];

  try {
    config = loadPaymentProfile(profileName);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    issues.push(`profile_load_failed: ${message}`);
  }

  if (config) {
    try {
      const signer = await loadClientSigner(config);
      signerAddress = String(signer.address);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      issues.push(`signer_unavailable: ${message}`);
    }
  }

  const policy = readAgentCommercePolicy();
  const network = networkFromRpcUrl(config?.rpcUrl);
  const usdcMint = usdcMintForNetwork(network);
  const balances = await readBalanceSnapshot(config?.rpcUrl, signerAddress, usdcMint, policy.autoPayX402BelowUsd);
  if (balances.error) {
    issues.push(`balance_check_degraded: ${balances.error}`);
  }

  const walletFileExists = Boolean(config?.walletPath && existsSync(config.walletPath));
  if (config?.walletPath && !walletFileExists) {
    issues.push('wallet_file_missing');
  }

  const canPayX402 = Boolean(signerAddress && balances.payerBalanceEnoughForAutoPay !== false);
  const canExecuteWriteTools = Boolean(signerAddress && config?.mode !== 'readonly');
  const status = !config || !signerAddress || !walletFileExists
    ? 'not-ready'
    : issues.length > 0
      ? 'degraded'
      : 'ready';

  return {
    hostedMcp: {
      endpoint,
      accountModel: 'hosted-remote-accountless',
      toolNamespace: 'sap',
    },
    localBridge: {
      status: 'connected',
      toolNamespace: 'sap_payments',
      preferredTool: 'sap_payments_call_paid_tool',
      readinessTool: 'sap_payments_readiness',
    },
    profile: {
      activeProfile,
      configPath,
      mode: config?.mode ?? 'readonly',
      network,
      rpcUrl: redactUrl(config?.rpcUrl),
      programId: config?.programId ?? '',
      walletPathConfigured: Boolean(config?.walletPath),
      walletFileExists,
      signerConfigured: Boolean(signerAddress),
      ...(signerAddress ? { signerPublicKey: signerAddress } : {}),
      ...(config?.agentPubkey ? { agentPubkey: config.agentPubkey } : {}),
      secretMaterial: 'keypair-bytes-never-returned',
    },
    balances,
    policy,
    readiness: {
      status,
      canPayX402,
      canExecuteWriteTools,
      issues,
      nextAction: readinessNextAction(status, issues, canPayX402),
    },
    agentInstruction: 'Call sap_payments_readiness first for hosted paid/write workflows. If status is ready or degraded with canPayX402=true, use sap_payments_call_paid_tool for paid hosted tools. Do not infer local wallet state from hosted sap_profile_current.',
  };
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
  profileName: string;
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

  const toolName = extractToolName(options.requestBody);
  const audit: X402PaidCallAudit = {
    intentId: buildIntentId(options.requestBody, options.sessionId),
    profileName: options.profileName,
    signerAddress: options.signerAddress,
    endpoint: options.endpoint,
    ...(toolName ? { toolName } : {}),
    requestMethod: options.requestBody.method,
    payment: {
      amountUsd,
      network: selectedRequirements.network,
      asset: selectedRequirements.asset,
      payTo: selectedRequirements.payTo,
    },
    receipt: {
      present: Boolean(paymentResult.settleResponse),
      ...(paymentResult.settleResponse?.transaction ? { transaction: paymentResult.settleResponse.transaction } : {}),
      ...(paymentResult.settleResponse?.network ? { network: paymentResult.settleResponse.network } : {}),
      ...(paymentResult.settleResponse?.amount ? { amount: paymentResult.settleResponse.amount } : {}),
      ...(paymentResult.settleResponse?.payer ? { payer: paymentResult.settleResponse.payer } : {}),
    },
    attempts: options.attempt,
    transientRetries: options.transientRetries,
    secretMaterial: 'keypair-bytes-never-returned',
  };

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
    audit,
  };
}

async function executeExternalPaidAttempt(options: {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  signerAddress: string;
  httpClient: x402HTTPClient;
  profileName: string;
  maxPriceUsd: number;
  attempt: number;
  transientRetries: readonly string[];
}): Promise<X402ExternalCallResult> {
  const unpaid = await fetchExternal(options.url, options.method, options.headers, options.body);
  if (unpaid.response.status !== 402) {
    return buildExternalResultWithoutPayment(options, unpaid);
  }

  const paymentRequired = getPaymentRequiredResponse(options.httpClient, unpaid.response, unpaid.body);
  const selectedRequirements = selectSingleRequirement(paymentRequired, options.maxPriceUsd);
  const amountUsd = paymentRequirementsAmountUsd(selectedRequirements);
  const paymentPayload = await options.httpClient.createPaymentPayload({
    ...paymentRequired,
    accepts: [selectedRequirements],
  });
  const paymentHeaders = options.httpClient.encodePaymentSignatureHeader(paymentPayload);
  const paid = await fetchExternal(options.url, options.method, {
    ...options.headers,
    ...paymentHeaders,
  }, options.body);
  const paymentResult = await options.httpClient.processPaymentResult(
    paymentPayload,
    name => paid.response.headers.get(name),
    paid.response.status,
  );

  if (!paid.response.ok) {
    throw new Error(`External x402 call failed with HTTP ${paid.response.status}: ${JSON.stringify(paid.body)}`);
  }

  const audit: X402ExternalCallAudit = {
    intentId: buildExternalIntentId(options.url, options.method),
    profileName: options.profileName,
    signerAddress: options.signerAddress,
    url: options.url,
    method: options.method,
    payment: {
      amountUsd,
      network: selectedRequirements.network,
      asset: selectedRequirements.asset,
      payTo: selectedRequirements.payTo,
    },
    receipt: {
      present: Boolean(paymentResult.settleResponse),
      ...(paymentResult.settleResponse?.transaction ? { transaction: paymentResult.settleResponse.transaction } : {}),
      ...(paymentResult.settleResponse?.network ? { network: paymentResult.settleResponse.network } : {}),
      ...(paymentResult.settleResponse?.amount ? { amount: paymentResult.settleResponse.amount } : {}),
      ...(paymentResult.settleResponse?.payer ? { payer: paymentResult.settleResponse.payer } : {}),
    },
    attempts: options.attempt,
    transientRetries: options.transientRetries,
    secretMaterial: 'keypair-bytes-never-returned',
  };

  return {
    success: true,
    url: options.url,
    method: options.method,
    signerAddress: options.signerAddress,
    payment: audit.payment,
    settlement: paymentResult.settleResponse,
    response: {
      status: paid.response.status,
      headers: safeResponseHeaders(paid.response.headers),
      body: paid.body,
    },
    attempts: options.attempt,
    transientRetries: options.transientRetries,
    audit,
  };
}

function buildExternalResultWithoutPayment(
  options: {
    url: string;
    method: string;
    signerAddress: string;
    profileName: string;
    attempt: number;
    transientRetries: readonly string[];
  },
  result: { response: Response; body: unknown },
): X402ExternalCallResult {
  const audit: X402ExternalCallAudit = {
    intentId: buildExternalIntentId(options.url, options.method),
    profileName: options.profileName,
    signerAddress: options.signerAddress,
    url: options.url,
    method: options.method,
    receipt: { present: false },
    attempts: options.attempt,
    transientRetries: options.transientRetries,
    secretMaterial: 'keypair-bytes-never-returned',
  };

  return {
    success: result.response.ok,
    url: options.url,
    method: options.method,
    signerAddress: options.signerAddress,
    response: {
      status: result.response.status,
      headers: safeResponseHeaders(result.response.headers),
      body: result.body,
    },
    attempts: options.attempt,
    transientRetries: options.transientRetries,
    audit,
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

function validateExternalInput(input: X402ExternalCallInput): void {
  if (!input.confirm) {
    throw new Error('external x402 calls require confirm: true because they sign a payment payload.');
  }
  if (!Number.isFinite(input.maxPriceUsd) || input.maxPriceUsd <= 0) {
    throw new Error('external x402 calls require a positive maxPriceUsd spending cap.');
  }
  if (!input.url || typeof input.url !== 'string') {
    throw new Error('url is required for external x402 calls.');
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

async function fetchExternal(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<{ response: Response; body: unknown }> {
  const hasBody = method !== 'GET' && method !== 'HEAD' && body !== undefined;
  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...headers,
  };
  let requestBody: BodyInit | undefined;

  if (hasBody) {
    if (typeof body === 'string') {
      requestBody = body;
    } else {
      requestHeaders['Content-Type'] = requestHeaders['Content-Type'] ?? requestHeaders['content-type'] ?? 'application/json';
      requestBody = JSON.stringify(body);
    }

    if (Buffer.byteLength(requestBody) > MAX_EXTERNAL_BODY_BYTES) {
      throw new Error(`External x402 request body exceeds ${MAX_EXTERNAL_BODY_BYTES} bytes.`);
    }
  }

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    ...(requestBody !== undefined ? { body: requestBody } : {}),
  });
  const text = await response.text();
  return {
    response,
    body: parseExternalHttpBody(text, response.headers.get('content-type') ?? ''),
  };
}

function parseExternalHttpBody(text: string, contentType: string): unknown {
  if (!text.trim()) {
    return null;
  }
  if (contentType.includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  return text;
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

function normalizeExternalUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('External x402 URL must use http or https.');
  }
  if (url.username || url.password) {
    throw new Error('External x402 URL must not contain embedded credentials.');
  }
  assertExternalHostAllowed(url.hostname);
  return url.toString();
}

function assertExternalHostAllowed(hostname: string): void {
  const normalized = hostname.toLowerCase();
  if (normalized === 'localhost' || normalized.endsWith('.localhost') || normalized.endsWith('.local')) {
    throw new Error('External x402 URL must not target local hostnames.');
  }

  if (normalized === '0.0.0.0' || normalized === '::' || normalized === '::1' || normalized.startsWith('127.')) {
    throw new Error('External x402 URL must not target loopback addresses.');
  }

  if (
    normalized.startsWith('10.') ||
    normalized.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized) ||
    normalized.startsWith('169.254.')
  ) {
    throw new Error('External x402 URL must not target private or link-local addresses.');
  }
}

function normalizeHttpMethod(value: string | undefined): string {
  const method = (value ?? 'POST').toUpperCase();
  const allowed = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
  if (!allowed.has(method)) {
    throw new Error('method must be one of GET, POST, PUT, PATCH, or DELETE.');
  }
  return method;
}

function normalizeExternalHeaders(value: Record<string, string> | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value ?? {})) {
    const normalized = key.toLowerCase();
    if (normalized === 'payment-signature' || normalized === 'x-payment' || normalized === 'payment-response' || normalized === 'x-payment-response') {
      throw new Error(`Do not provide ${key}; the local x402 helper creates payment headers itself.`);
    }
    if (normalized === 'authorization' || normalized === 'cookie' || normalized === 'set-cookie') {
      throw new Error(`Refusing to forward sensitive header ${key} through generic x402 helper.`);
    }
    headers[key] = String(rawValue);
  }
  return headers;
}

function safeResponseHeaders(headers: Headers): Record<string, string> {
  const safe = new Set([
    'content-type',
    'payment-response',
    'x-payment-response',
    'x402-version',
    'x-request-id',
  ]);
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (safe.has(key.toLowerCase())) {
      out[key] = value;
    }
  });
  return out;
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

function networkFromRpcUrl(value: string | undefined): string {
  if (!value) {
    return 'mainnet-beta';
  }
  if (value.includes('mainnet')) {
    return 'mainnet-beta';
  }
  if (value.includes('testnet')) {
    return 'testnet';
  }
  if (value.includes('localhost') || value.includes('127.0.0.1') || value.includes('localnet')) {
    return 'localnet';
  }
  return 'devnet';
}

function usdcMintForNetwork(network: string): string {
  return network === 'devnet' ? DEVNET_USDC_MINT : MAINNET_USDC_MINT;
}

function redactUrl(value: string | undefined): string {
  if (!value) {
    return '';
  }
  try {
    const url = new URL(value);
    if (url.search) {
      url.search = '?redacted=true';
    }
    return url.toString();
  } catch {
    return value.includes('?') ? `${value.split('?')[0]}?redacted=true` : value;
  }
}

async function readBalanceSnapshot(
  rpcUrl: string | undefined,
  signerAddress: string | undefined,
  usdcMint: string,
  autoPayX402BelowUsd: number,
): Promise<X402PaymentReadinessResult['balances']> {
  if (!rpcUrl || !signerAddress) {
    return {
      checked: false,
      usdcMint,
      error: 'missing_rpc_or_signer',
    };
  }

  try {
    const connection = new Connection(rpcUrl, 'confirmed');
    const owner = new PublicKey(signerAddress);
    const mint = new PublicKey(usdcMint);
    const [lamports, tokenAccounts] = await Promise.all([
      connection.getBalance(owner, 'confirmed'),
      connection.getParsedTokenAccountsByOwner(owner, { mint }, 'confirmed'),
    ]);
    const usdc = tokenAccounts.value.reduce((total, account) => {
      const parsed = account.account.data.parsed as unknown;
      if (!isRecord(parsed) || !isRecord(parsed.info) || !isRecord(parsed.info.tokenAmount)) {
        return total;
      }
      const amount = parsed.info.tokenAmount.uiAmount;
      return total + (typeof amount === 'number' && Number.isFinite(amount) ? amount : 0);
    }, 0);

    return {
      checked: true,
      sol: lamports / 1_000_000_000,
      usdc,
      usdcMint,
      payerBalanceEnoughForAutoPay: usdc >= autoPayX402BelowUsd,
    };
  } catch (error) {
    return {
      checked: false,
      usdcMint,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function readAgentCommercePolicy(): AgentCommercePolicySnapshot {
  return {
    autoPayX402BelowUsd: readPositiveNumberEnv('SAP_MCP_X402_AUTO_PAY_MAX_USD', 0.02),
    dailyX402LimitUsd: readOptionalPositiveNumberEnv('SAP_MCP_X402_DAILY_LIMIT_USD'),
    maxTradeUsd: readOptionalPositiveNumberEnv('SAP_MCP_MAX_TRADE_USD') ?? 10,
    maxSlippageBps: readPositiveNumberEnv('SAP_MCP_MAX_SLIPPAGE_BPS', 100),
    requireConfirmationAboveUsd: readPositiveNumberEnv('SAP_MCP_REQUIRE_CONFIRMATION_ABOVE_USD', 1),
    allowedProtocols: readListEnv('SAP_MCP_ALLOWED_PROTOCOLS', ['jupiter', 'sns', 'sap', 'metaplex']),
    maxAttempts: readIntegerEnv('SAP_MCP_X402_MAX_ATTEMPTS', DEFAULT_MAX_ATTEMPTS, 1, MAX_ALLOWED_ATTEMPTS),
  };
}

function readPositiveNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readOptionalPositiveNumberEnv(name: string): number | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function readIntegerEnv(name: string, fallback: number, min: number, max: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function readListEnv(name: string, fallback: readonly string[]): readonly string[] {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const parsed = value.split(',').map(item => item.trim()).filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

function readinessNextAction(
  status: X402PaymentReadinessResult['readiness']['status'],
  issues: readonly string[],
  canPayX402: boolean,
): string {
  if (status === 'ready') {
    return 'Use sap_payments_call_paid_tool for hosted paid/write SAP MCP calls.';
  }
  if (canPayX402) {
    return 'Proceed with paid calls if the user accepts degraded readiness; retry transient RPC errors with fresh challenges.';
  }
  if (issues.some(issue => issue.includes('wallet_file_missing'))) {
    return 'Run the SAP MCP wizard repair or update the active profile walletPath to an existing dedicated keypair.';
  }
  if (issues.some(issue => issue.includes('signer_unavailable'))) {
    return 'Run the SAP MCP wizard full setup or repair the local signer before paid/write calls.';
  }
  return 'Run the SAP MCP wizard repair flow, restart the agent runtime, then call sap_payments_readiness again.';
}

function extractToolName(requestBody: JsonRpcRequest): string | undefined {
  if (requestBody.method !== 'tools/call' || !isRecord(requestBody.params)) {
    return undefined;
  }
  const name = requestBody.params.name;
  return typeof name === 'string' ? name : undefined;
}

function buildIntentId(requestBody: JsonRpcRequest, sessionId: string): string {
  const source = JSON.stringify({
    method: requestBody.method,
    params: requestBody.params ?? null,
    sessionId,
    at: Date.now(),
  });
  return `sap-intent-${createHash('sha256').update(source).digest('hex').slice(0, 16)}`;
}

function buildExternalIntentId(url: string, method: string): string {
  const source = JSON.stringify({
    url,
    method,
    at: Date.now(),
  });
  return `sap-external-x402-${createHash('sha256').update(source).digest('hex').slice(0, 16)}`;
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
