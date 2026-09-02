/**
 * @name PrePaymentValidation
 * @description Rejects malformed wallet-bearing tool calls BEFORE the x402 paywall,
 * so clients never pay for a call that would fail on input validation.
 */

import type { ParsedMcpRequest } from './json-rpc.js';

export interface PrePaymentValidationFailure {
  code: number;
  message: string;
  data: {
    reason: string;
    paymentNotCharged: true;
    blockedTools: string[];
    invalidParams: Record<string, string>;
    recommendedFix: string;
  };
}

/**
 * Params that carry a Solana wallet public key across SAP MCP tools. Any string
 * value in these params is validated pre-payment: abbreviated, dotted, or
 * wrong-length addresses are rejected before the client is charged.
 */
const WALLET_PARAM_NAMES = [
  'authority',
  'trader',
  'traderAddress',
  'address',
  'publicKey',
  'owner',
  'ownerAddress',
  'walletAddress',
  'wallet',
  'recipient',
  'mint',
  'fromAddress',
  'toAddress',
] as readonly string[];

const BASE58_ALPHABET = /^[1-9A-HJ-NP-Za-km-z]+$/;

/**
 * Returns null when the value is absent or a plausible full base58 public key;
 * returns a reason string when the value is demonstrably invalid (abbreviated,
 * dotted, wrong length, or non-base58 characters).
 *
 * @param value - Raw parameter value from the tool call arguments.
 * @returns Rejection reason, or null when the value passes.
 */
function invalidWalletReason(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (trimmed === 'undefined' || trimmed === 'null') {
    return 'Parameter resolves to "undefined"/"null". Pass the FULL wallet public key (base58, 32-44 chars).';
  }
  if (trimmed.includes('...') || trimmed.includes('…')) {
    return `Abbreviated address "${trimmed}" contains dots. Pass the FULL base58 address (32-44 chars, no dots) - get it from steve_get_wallet_balance.`;
  }
  if (trimmed.length < 32 || trimmed.length > 44) {
    return `Address length ${trimmed.length} is outside the valid range (32-44 chars). Pass the FULL base58 address.`;
  }
  if (!BASE58_ALPHABET.test(trimmed)) {
    return 'Address contains non-base58 characters. Pass the full base58 wallet public key.';
  }
  return null;
}

/**
 * Validates wallet-bearing arguments of every tool call in the request BEFORE the
 * x402 payment challenge. Only rejects when a value is demonstrably invalid;
 * absent params are the handler's concern (they stay payable so the tool can
 * return its own actionable "parameter required" guidance).
 *
 * @param parsedRequest - Parsed MCP request with all tool calls.
 * @returns A failure with paymentNotCharged when any wallet param is malformed.
 */
export function evaluatePrePaymentValidation(
  parsedRequest: ParsedMcpRequest,
): PrePaymentValidationFailure | undefined {
  const blockedTools: string[] = [];
  const invalidParams: Record<string, string> = {};

  for (const toolCall of parsedRequest.toolCalls) {
    if (!toolCall.arguments || typeof toolCall.arguments !== 'object') continue;
    for (const [paramName, paramValue] of Object.entries(toolCall.arguments as Record<string, unknown>)) {
      if (!WALLET_PARAM_NAMES.includes(paramName)) continue;
      if (typeof paramValue !== 'string') continue;
      const reason = invalidWalletReason(paramValue);
      if (reason) {
        blockedTools.push(toolCall.toolName);
        invalidParams[`${toolCall.toolName}.${paramName}`] = reason;
      }
    }
  }

  if (blockedTools.length === 0) return undefined;

  return {
    code: -32010,
    message: 'invalid_wallet_input',
    data: {
      reason: 'One or more wallet-bearing parameters are abbreviated, truncated, or malformed. No x402 payment was charged.',
      paymentNotCharged: true,
      blockedTools,
      invalidParams,
      recommendedFix: 'Call steve_get_wallet_balance (or the source system) and pass the FULL base58 wallet public key (44 chars, no dots).',
    },
  };
}