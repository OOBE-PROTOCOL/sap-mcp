/**
 * @name X402PaidCallTool
 * @description Local MCP tool that pays and retries hosted SAP MCP x402 calls with the user's SAP MCP profile signer.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { PaymentRequired } from '@x402/core/types';
import { registerTool } from '../adapters/mcp/sdk-compat.js';
import { createTextResponse } from '../adapters/mcp/tool-response.js';
import type { SapMcpContext } from '../core/types.js';
import { getActiveProfile, getProfileConfigPath } from '../config/profiles.js';
import {
  executeX402PaidCall,
  getX402PaymentReadiness,
  inspectX402Receipt,
  probeX402PaymentChallenge,
  signX402PaymentChallenge,
  type X402ChallengeProbeInput,
  type X402ChallengeSignInput,
  type X402PaidCallInput,
} from '../payments/x402-paid-call.js';

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

interface X402ChallengeProbeToolInput {
  endpoint?: string;
  toolName?: string;
  arguments?: unknown;
  body?: {
    jsonrpc: '2.0';
    id?: string | number | null;
    method: string;
    params?: unknown;
  };
  maxPriceUsd?: number;
}

interface X402ChallengeSignToolInput {
  paymentRequired?: PaymentRequired;
  challenge?: PaymentRequired;
  selectedIndex?: number;
  profileName?: string;
  maxPriceUsd?: number;
  confirm?: boolean;
}

interface X402ReceiptToolInput {
  receiptHeader?: string;
  paymentResponse?: string;
}

const paidCallInputSchema = {
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
} as const;

const paidCallOutputSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', description: 'Whether the hosted paid MCP call completed successfully.' },
    endpoint: { type: 'string', description: 'Hosted MCP endpoint used for the paid call.' },
    sessionId: { type: 'string', description: 'MCP session id used for the unpaid challenge and paid retry.' },
    signerAddress: { type: 'string', description: 'Public address of the local SAP MCP signer. Secret bytes are never returned.' },
    payment: { type: 'object', description: 'Selected payment requirements, including amountUsd, network, asset, and payTo.' },
    settlement: { type: 'object', description: 'x402 settlement response returned by the facilitator when available.' },
    response: { type: 'object', description: 'Remote MCP JSON-RPC response after successful paid retry.' },
    attempts: { type: 'number', description: 'Number of paid-call attempts used.' },
    transientRetries: { type: 'array', items: { type: 'string' }, description: 'Retryable errors encountered before success.' },
    audit: { type: 'object', description: 'Agent-readable proof object with intent id, profile, payment receipt, settlement signature, attempts, and secret-material guarantee.' },
  },
} as const;

function redactUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
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

function networkFromRpcUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
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

/**
 * @name registerX402PaidCallTool
 * @description Registers local hosted-payment tools for agents that need to resolve x402-gated SAP MCP calls.
 */
export function registerX402PaidCallTool(server: Server, _context: SapMcpContext): void {
  registerPaymentsProfileCurrentTool(server, _context);
  registerPaymentsReadinessTool(server);
  registerPaymentsCallPaidTool(server, 'sap_payments_call_paid_tool');
  registerPaymentsPrepareChallengeTool(server);
  registerPaymentsSignChallengeTool(server);
  registerPaymentsVerifyReceiptTool(server);

  // Backward-compatible alias used by existing Codex/Hermes/Claude client snippets.
  registerPaymentsCallPaidTool(server, 'sap_x402_paid_call');
}

function registerPaymentsProfileCurrentTool(server: Server, context: SapMcpContext): void {
  registerTool(
    server,
    'sap_payments_profile_current',
    {
      title: 'Show Local SAP Payments Profile',
      description: 'Return the local SAP MCP profile used by the sap_payments bridge for hosted x402 paid/write calls. Use this instead of the remote sap_profile_current when checking the caller wallet, signer, active profile, and local payment readiness. Never returns keypair bytes.',
      inputSchema: {},
      outputSchema: {
        type: 'object',
        properties: {
          serverRole: { type: 'string', description: 'Role of this local MCP server.' },
          activeProfile: { type: 'string', description: 'Profile selected by ~/.config/mcp-sap/.active-profile.' },
          configPath: { type: 'string', description: 'Local profile config path used by the bridge.' },
          mode: { type: 'string', description: 'SAP MCP mode from the local profile.' },
          network: { type: 'string', description: 'Derived Solana network for the local profile RPC.' },
          rpcUrl: { type: 'string', description: 'Redacted RPC URL used by the local profile.' },
          programId: { type: 'string', description: 'SAP program id configured by the local profile.' },
          walletPath: { type: 'string', description: 'Configured local wallet path. File contents are never returned.' },
          walletPathConfigured: { type: 'boolean', description: 'Whether a wallet path is configured.' },
          signerConfigured: { type: 'boolean', description: 'Whether the local bridge resolved a signer.' },
          signerPublicKey: { type: 'string', description: 'Public key of the local signer when available.' },
          secretMaterial: { type: 'string', description: 'Secret handling guarantee.' },
          recommendedPaidTool: { type: 'string', description: 'Tool agents should call for hosted paid/write calls.' },
        },
        required: ['serverRole', 'activeProfile', 'configPath', 'mode', 'walletPathConfigured', 'signerConfigured', 'secretMaterial', 'recommendedPaidTool'],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => createTextResponse(JSON.stringify({
      serverRole: 'local-sap-payments-bridge',
      activeProfile: getActiveProfile(),
      configPath: getProfileConfigPath(getActiveProfile()),
      mode: context.config.mode,
      network: networkFromRpcUrl(context.config.rpcUrl),
      rpcUrl: redactUrl(context.config.rpcUrl),
      programId: context.config.programId,
      agentPubkey: context.config.agentPubkey,
      walletPath: context.config.walletPath,
      walletPathConfigured: Boolean(context.config.walletPath),
      signerConfigured: Boolean(context.signer),
      signerPublicKey: context.signer?.publicKey.toBase58(),
      localProfileVisibility: 'visible-to-local-sap-payments-bridge',
      hostedRemoteVisibility: 'not-visible-to-hosted-accountless-server',
      secretMaterial: 'keypair-bytes-never-returned',
      recommendedPaidTool: 'sap_payments_call_paid_tool',
      recommendedReadinessTool: 'sap_payments_readiness',
      agentInstruction: 'For wallet/profile questions, trust this local sap_payments profile result over the remote hosted sap_profile_current result. For paid/write workflows call sap_payments_readiness first. The hosted SAP MCP server is intentionally accountless.',
    }, null, 2)),
  );
}

function registerPaymentsReadinessTool(server: Server): void {
  registerTool(
    server,
    'sap_payments_readiness',
    {
      title: 'Check Hosted Payment Readiness',
      description: 'Free local readiness check for hosted SAP MCP paid/write workflows. Verifies the local sap_payments bridge, active profile, signer public key, RPC reachability, SOL/USDC balances, and commerce policy limits without exposing keypair bytes. Agents should call this before paid tools, swaps, SNS registration, Metaplex minting, or SAP registry writes.',
      inputSchema: {
        profileName: {
          type: 'string',
          description: 'Optional SAP MCP profile name. Defaults to the active local profile.',
        },
        endpoint: {
          type: 'string',
          description: 'Hosted MCP endpoint. Defaults to https://mcp.sap.oobeprotocol.ai/mcp.',
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          hostedMcp: { type: 'object', description: 'Hosted remote MCP endpoint and accountless trust boundary.' },
          localBridge: { type: 'object', description: 'Local sap_payments bridge status and preferred tools.' },
          profile: { type: 'object', description: 'Redacted active profile, signer, RPC, and wallet path status.' },
          balances: { type: 'object', description: 'SOL and USDC payment readiness when RPC checks are available.' },
          policy: { type: 'object', description: 'Local agent commerce policy limits used before autopay or value-moving operations.' },
          readiness: { type: 'object', description: 'Ready/degraded/not-ready result with issues and next action.' },
          agentInstruction: { type: 'string', description: 'Operational instruction for MCP agents.' },
        },
        required: ['hostedMcp', 'localBridge', 'profile', 'balances', 'policy', 'readiness', 'agentInstruction'],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input: unknown) => {
      const record = input && typeof input === 'object' && !Array.isArray(input)
        ? input as Record<string, unknown>
        : {};
      const profileName = typeof record.profileName === 'string' ? record.profileName : undefined;
      const endpoint = typeof record.endpoint === 'string' ? record.endpoint : undefined;
      const result = await getX402PaymentReadiness(profileName, endpoint);
      return createTextResponse(JSON.stringify(result, null, 2));
    },
  );
}

function registerPaymentsCallPaidTool(server: Server, name: 'sap_payments_call_paid_tool' | 'sap_x402_paid_call'): void {
  registerTool(
    server,
    name,
    {
      title: 'Pay And Call Hosted SAP MCP Tool',
      description: 'High-level local payment bridge. It initializes the hosted MCP session, obtains the x402 challenge, signs with the user-controlled SAP MCP profile wallet, retries the exact remote tool call, settles payment, and returns the tool result plus receipt. Prefer this tool for hosted paid/write SAP MCP calls when the runtime cannot natively replay x402 challenges. Requires confirm: true and maxPriceUsd.',
      inputSchema: paidCallInputSchema,
      outputSchema: paidCallOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
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

function registerPaymentsPrepareChallengeTool(server: Server): void {
  registerTool(
    server,
    'sap_payments_prepare_challenge',
    {
      title: 'Prepare Hosted x402 Challenge',
      description: 'Low-level free helper that initializes hosted SAP MCP, calls the target paid tool without payment, and returns the parsed x402 challenge without signing. Use for inspection, policy review, or custom x402 clients. Normal agents should prefer sap_payments_call_paid_tool.',
      inputSchema: {
        endpoint: paidCallInputSchema.endpoint,
        toolName: paidCallInputSchema.toolName,
        arguments: paidCallInputSchema.arguments,
        body: paidCallInputSchema.body,
        maxPriceUsd: {
          type: 'number',
          description: 'Optional maximum acceptable USD price used only to reject oversized challenges during inspection.',
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          endpoint: { type: 'string', description: 'Hosted MCP endpoint that returned the challenge.' },
          sessionId: { type: 'string', description: 'MCP session id created for the challenge.' },
          requestBody: { type: 'object', description: 'Canonical JSON-RPC request body used to obtain the challenge.' },
          paymentRequired: { type: 'object', description: 'Parsed x402 PaymentRequired challenge.' },
          selectedRequirements: { type: 'object', description: 'Selected payment requirement from accepts[0].' },
          amountUsd: { type: 'number', description: 'Selected payment amount expressed in USD.' },
          instructions: { type: 'object', description: 'Agent-safe retry and signing instructions.' },
        },
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input: unknown) => {
      try {
        const result = await probeX402PaymentChallenge(parseProbeInput(input));
        return createTextResponse(JSON.stringify(result, null, 2));
      } catch (error) {
        return createTextResponse(formatPaidCallError(error), { isError: true });
      }
    },
  );
}

function registerPaymentsSignChallengeTool(server: Server): void {
  registerTool(
    server,
    'sap_payments_sign_challenge',
    {
      title: 'Sign Hosted x402 Challenge',
      description: 'Low-level local helper that signs a parsed x402 PaymentRequired challenge with the active SAP MCP profile wallet and returns a one-time Payment-Signature header. Use only when building a custom client; normal agents should prefer sap_payments_call_paid_tool so the payment header is not surfaced separately. Requires confirm: true and maxPriceUsd.',
      inputSchema: {
        paymentRequired: {
          type: 'object',
          description: 'Parsed x402 PaymentRequired challenge returned by sap_payments_prepare_challenge or the hosted MCP payment_required response.',
        },
        challenge: {
          type: 'object',
          description: 'Alias for paymentRequired for agent runtimes that store the challenge under a generic name.',
        },
        selectedIndex: {
          type: 'number',
          description: 'Index into paymentRequired.accepts to sign. Defaults to 0.',
        },
        profileName: paidCallInputSchema.profileName,
        maxPriceUsd: paidCallInputSchema.maxPriceUsd,
        confirm: paidCallInputSchema.confirm,
      },
      outputSchema: {
        type: 'object',
        properties: {
          signerAddress: { type: 'string', description: 'Public address of the signer that created the payment authorization.' },
          amountUsd: { type: 'number', description: 'USD amount authorized by the selected challenge.' },
          payment: { type: 'object', description: 'Selected network, asset, and payTo.' },
          headers: { type: 'object', description: 'HTTP headers to attach to the exact paid retry request.' },
          payload: { type: 'object', description: 'x402 payment payload produced by the official client SDK.' },
          warning: { type: 'string', description: 'Safety warning for one-time payment authorization material.' },
        },
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input: unknown) => {
      try {
        const result = await signX402PaymentChallenge(parseSignInput(input));
        return createTextResponse(JSON.stringify(result, null, 2));
      } catch (error) {
        return createTextResponse(formatPaidCallError(error), { isError: true });
      }
    },
  );
}

function registerPaymentsVerifyReceiptTool(server: Server): void {
  registerTool(
    server,
    'sap_payments_verify_receipt',
    {
      title: 'Inspect x402 Payment Receipt',
      description: 'Decodes a PAYMENT-RESPONSE or X-PAYMENT-RESPONSE receipt header into agent-readable JSON. This is a local inspection helper; on-chain finality still comes from the x402 facilitator response and Solana transaction status.',
      inputSchema: {
        receiptHeader: {
          type: 'string',
          description: 'Base64 JSON or raw JSON receipt header returned by PAYMENT-RESPONSE or X-PAYMENT-RESPONSE.',
        },
        paymentResponse: {
          type: 'string',
          description: 'Alias for receiptHeader.',
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          validJson: { type: 'boolean', description: 'Whether the receipt decoded to JSON.' },
          decoded: { type: 'object', description: 'Decoded receipt payload or the original string when not JSON.' },
          txSignature: { type: 'string', description: 'Settlement transaction signature when present.' },
          network: { type: 'string', description: 'Settlement network when present.' },
          warning: { type: 'string', description: 'Warning when the receipt could not be decoded as JSON.' },
        },
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input: unknown) => {
      try {
        const result = inspectX402Receipt(parseReceiptInput(input));
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

function parseProbeInput(input: unknown): X402ChallengeProbeInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('sap_payments_prepare_challenge requires an input object.');
  }

  const record = input as X402ChallengeProbeToolInput;
  return {
    endpoint: record.endpoint,
    toolName: record.toolName,
    arguments: record.arguments,
    body: record.body,
    maxPriceUsd: record.maxPriceUsd,
  };
}

function parseSignInput(input: unknown): X402ChallengeSignInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('sap_payments_sign_challenge requires an input object.');
  }

  const record = input as X402ChallengeSignToolInput;
  const paymentRequired = record.paymentRequired ?? record.challenge;
  if (!paymentRequired) {
    throw new Error('paymentRequired is required.');
  }
  if (record.maxPriceUsd === undefined) {
    throw new Error('maxPriceUsd is required.');
  }

  return {
    paymentRequired,
    selectedIndex: record.selectedIndex,
    profileName: record.profileName,
    maxPriceUsd: record.maxPriceUsd,
    confirm: record.confirm === true,
  };
}

function parseReceiptInput(input: unknown): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('sap_payments_verify_receipt requires an input object.');
  }

  const record = input as X402ReceiptToolInput;
  const header = record.receiptHeader ?? record.paymentResponse;
  if (!header) {
    throw new Error('receiptHeader is required.');
  }
  return header;
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
      ? 'Retry sap_payments_call_paid_tool with the same toolName and arguments, confirm: true, and maxAttempts: 5 so the helper creates a fresh x402 challenge and payment payload.'
      : 'Run sap_payments_readiness, then repair the local sap_payments bridge with sap-mcp-config wizard or the desktop wizard if needed.',
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
