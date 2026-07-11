/**
 * @name X402PaidCallTool
 * @description Local MCP tool that pays and retries hosted SAP MCP x402 calls with the user's SAP MCP profile signer.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerTool } from '../adapters/mcp/sdk-compat.js';
import { createTextResponse } from '../adapters/mcp/tool-response.js';
import type { SapMcpContext } from '../core/types.js';
import { executeX402PaidCall, type X402PaidCallInput } from '../payments/x402-paid-call.js';

interface X402PaidCallToolInput {
  endpoint?: string;
  toolName?: string;
  arguments?: unknown;
  body?: {
    jsonrpc: '2.0';
    id?: string | number | null;
    method: string;
    params?: unknown;
  };
  profileName?: string;
  maxPriceUsd?: number;
  maxAttempts?: number;
  confirm?: boolean;
}

/**
 * @name registerX402PaidCallTool
 * @description Registers the local hosted-payment helper for agents that need to pay remote x402-gated SAP MCP tools.
 */
export function registerX402PaidCallTool(server: Server, _context: SapMcpContext): void {
  registerTool(
    server,
    'sap_x402_paid_call',
    {
      title: 'Pay And Call Hosted SAP MCP Tool',
      description: 'Local helper that initializes the hosted MCP session, signs an x402 payment with the user SAP MCP profile wallet, retries the remote tool call, and returns the settlement receipt. Use this instead of calling hosted paid tools directly when the runtime cannot attach x402 payment headers. Requires confirm: true and maxPriceUsd.',
      inputSchema: {
        endpoint: {
          type: 'string',
          description: 'Hosted MCP endpoint. Defaults to https://mcp.sap.oobeprotocol.ai/mcp.',
        },
        toolName: {
          type: 'string',
          description: 'Remote hosted SAP MCP tool name to call, for example sap_list_all_agents.',
        },
        arguments: {
          type: 'object',
          description: 'Arguments for the remote tools/call request.',
        },
        body: {
          type: 'object',
          description: 'Optional full JSON-RPC request body. Use this instead of toolName when the caller already has a complete request.',
        },
        profileName: {
          type: 'string',
          description: 'SAP MCP profile used to sign the x402 payment. Defaults to the active profile.',
        },
        maxPriceUsd: {
          type: 'number',
          description: 'Maximum accepted x402 payment amount in USD. The call aborts if the challenge exceeds this cap.',
        },
        maxAttempts: {
          type: 'number',
          description: 'Optional retry count for transient x402/RPC failures such as BlockhashNotFound. Defaults to 3; max 5.',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true. Confirms the user allows this helper to sign an x402 payment payload.',
        },
      },
    },
    async (input: unknown) => {
      try {
        const parsed = parseInput(input);
        const result = await executeX402PaidCall(parsed);
        return createTextResponse(JSON.stringify(result, null, 2));
      } catch (error) {
        return createTextResponse(formatPaidCallError(error), { isError: true });
      }
    },
  );
}

function parseInput(input: unknown): X402PaidCallInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('sap_x402_paid_call requires an input object.');
  }

  const record = input as X402PaidCallToolInput;
  if (record.maxPriceUsd === undefined) {
    throw new Error('maxPriceUsd is required.');
  }

  return {
    endpoint: record.endpoint,
    toolName: record.toolName,
    arguments: record.arguments,
    body: record.body,
    profileName: record.profileName,
    maxPriceUsd: record.maxPriceUsd,
    maxAttempts: record.maxAttempts,
    confirm: record.confirm === true,
  };
}

type X402PaidCallErrorCategory = 'x402_transient_rpc' | 'x402_client_or_config';

interface X402PaidCallErrorPayload {
  success: false;
  error: string;
  retryable: boolean;
  category: X402PaidCallErrorCategory;
  agentInstruction: string;
  nextAction: string;
}

function formatPaidCallError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const retryable = isRetryablePaymentError(message);
  const payload: X402PaidCallErrorPayload = {
    success: false,
    error: message,
    retryable,
    category: retryable ? 'x402_transient_rpc' : 'x402_client_or_config',
    agentInstruction: retryable
      ? 'This is a transient x402 settlement or Solana RPC failure, not proof that SAP MCP is down. Do not bypass hosted x402, do not switch to terminal/direct RPC, and do not reuse an old signed payment payload unless the user explicitly asks.'
      : 'The local x402 payment bridge could not complete the call. Fix the SAP MCP profile, wallet balance, maxPriceUsd, or runtime configuration before retrying.',
    nextAction: retryable
      ? 'Retry sap_x402_paid_call with the same toolName and arguments, confirm: true, and maxAttempts: 5 so the helper creates a fresh x402 challenge and payment payload.'
      : 'Run sap_profile_current and sap_x402_estimate_cost, then repair the local x402 payment bridge with sap-mcp-config wizard or the desktop wizard if needed.',
  };

  return JSON.stringify(payload, null, 2);
}

function isRetryablePaymentError(message: string): boolean {
  const normalized = message.toLowerCase();
  const retryablePatterns = [
    'blockhashnotfound',
    'blockhash not found',
    'transaction_simulation_failed',
    'smart_wallet_simulation_failed',
    '"retryable":true',
    '"category":"facilitator_rpc"',
    '"category":"facilitator_unavailable"',
    'node is behind',
    'minimum context slot',
    'slot was skipped',
    'fetch failed',
    'gateway timeout',
    'service unavailable',
    'too many requests',
    'rate limit',
  ];

  return retryablePatterns.some((pattern) => normalized.includes(pattern));
}
