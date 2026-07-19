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
  executeExternalX402Call,
  getX402PaymentReadiness,
  inspectX402Receipt,
  probeX402PaymentChallenge,
  signX402PaymentChallenge,
  type X402ChallengeProbeInput,
  type X402ChallengeSignInput,
  type X402ExternalCallInput,
  type X402PaidCallInput,
} from '../payments/x402-paid-call.js';
import { finalizeTransactionWithLocalSigner, type TransactionEncoding } from './transaction-tools.js';
import { parseRegisterAgentArgs } from './sap-sdk-tools.js';

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

interface X402ExternalCallToolInput {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
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

interface PaymentsFinalizeTransactionToolInput {
  transaction?: string;
  transactionBase64?: string;
  encoding?: TransactionEncoding;
  submit?: boolean;
  skipPreflight?: boolean;
  maxRetries?: number;
  confirm?: boolean;
  intentId?: string;
}

interface PaymentsRegisterAgentToolInput {
  name?: string;
  description?: string;
  capabilities?: unknown[];
  pricing?: unknown[];
  protocols?: string[];
  agentId?: string;
  agentUri?: string;
  metadataUri?: string;
  x402Endpoint?: string;
  confirm?: boolean;
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
  registerPaymentsCallExternalX402Tool(server);
  registerPaymentsRegisterAgentTool(server, _context);
  registerPaymentsFinalizeTransactionTool(server, _context);
  registerPaymentsPrepareChallengeTool(server);
  registerPaymentsSignChallengeTool(server);
  registerPaymentsVerifyReceiptTool(server);

  // Backward-compatible alias used by existing Codex/Hermes/Claude client snippets.
  registerPaymentsCallPaidTool(server, 'sap_x402_paid_call');
}

function registerPaymentsRegisterAgentTool(server: Server, context: SapMcpContext): void {
  registerTool(
    server,
    'sap_payments_register_agent',
    {
      title: 'Register SAP Agent With Local Signer',
      description: 'Local non-custodial SAP registry write for hosted users. Use this when hosted sap_register_agent returns hosted_local_signer_required. It registers the active local SAP MCP profile wallet as an on-chain SAP agent with the local signer; OOBE never receives keypair bytes. This tool does not pay a hosted x402 fee because it runs locally through sap_payments. Requires confirm: true.',
      inputSchema: {
        name: { type: 'string', description: 'Human-readable SAP agent name.' },
        description: { type: 'string', description: 'Detailed description of the agent purpose and capabilities.' },
        capabilities: { type: 'array', description: 'Capability objects or strings identifying what the agent can do, for example "jupiter:swap" or "sns:identity".' },
        pricing: { type: 'array', description: 'Pricing tier objects defining per-call costs, rate limits, and settlement terms. Use micro-USDC/base token units where applicable.' },
        protocols: { type: 'array', items: { type: 'string' }, description: 'Protocol identifiers supported by the agent, for example sap, mcp, jupiter, sns, metaplex, or x402.' },
        agentId: { type: 'string', description: 'Optional stable agent identifier, for example solking.' },
        agentUri: { type: 'string', description: 'Optional URI to the agent off-chain metadata or service endpoint.' },
        metadataUri: { type: 'string', description: 'Alias for agentUri; URI to off-chain agent metadata JSON.' },
        x402Endpoint: { type: 'string', description: 'Optional x402 payment/discovery endpoint URL advertised by this agent.' },
        confirm: { type: 'boolean', description: 'Must be true. Confirms the user wants the local signer to submit this SAP registry transaction.' },
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', description: 'Whether the local SAP agent registration transaction was submitted.' },
          signature: { type: 'string', description: 'Solana transaction signature returned by the SAP SDK.' },
          signerPublicKey: { type: 'string', description: 'Public key of the local SAP MCP signer that registered the agent.' },
          profile: { type: 'string', description: 'Active local SAP MCP profile used for registration when available.' },
          agent: { type: 'object', description: 'Agent registration fields submitted on-chain.' },
          audit: { type: 'object', description: 'Agent-readable proof that the write was local, non-custodial, and did not use hosted x402.' },
        },
        required: ['success', 'signature', 'signerPublicKey', 'agent', 'audit'],
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
        const parsed = parseRegisterAgentInput(input);
        const activeProfile = getActiveProfile();
        const signerPublicKey = context.signer?.publicKey.toBase58();
        if (!signerPublicKey) {
          throw new Error('No local signer configured. Run the SAP MCP wizard full setup or repair the local sap_payments bridge, then restart the agent runtime.');
        }

        const args = parseRegisterAgentArgs(parsed as Record<string, unknown>);
        const signature = await context.sapClient.agent.register(args);
        return createTextResponse(JSON.stringify({
          success: true,
          signature,
          signerPublicKey,
          profile: activeProfile,
          agent: {
            name: args.name,
            description: args.description,
            agentId: args.agentId,
            agentUri: args.agentUri,
            x402Endpoint: args.x402Endpoint,
            protocols: args.protocols,
            capabilityCount: args.capabilities.length,
            pricingTierCount: args.pricing.length,
          },
          audit: {
            action: 'sap_payments_register_agent',
            registeredLocally: true,
            hostedX402Charged: false,
            signerBoundary: 'local-sap-payments-bridge',
            secretMaterial: 'keypair-bytes-never-returned',
            rule: 'Hosted sap_register_agent is accountless and cannot sign user-owned registry writes. This local bridge submitted the SAP registry transaction with the user-controlled profile signer.',
          },
        }, null, 2));
      } catch (error) {
        return createTextResponse(formatLocalRegistryError(error), { isError: true });
      }
    },
  );
}

function registerPaymentsCallExternalX402Tool(server: Server): void {
  registerTool(
    server,
    'sap_payments_call_external_x402',
    {
      title: 'Pay And Call External x402 Endpoint',
      description: 'High-level local payment bridge for generic HTTP x402 endpoints outside hosted SAP MCP, such as another SAP agent endpoint discovered from the registry. It sends the request once to obtain the 402 payment challenge, signs with the user-controlled local SAP MCP profile wallet, retries the same HTTP request with PAYMENT-SIGNATURE, and returns the response plus receipt. Use sap_payments_call_paid_tool for hosted SAP MCP tools; use this only for external HTTP x402 providers. Requires confirm: true and maxPriceUsd.',
      inputSchema: {
        url: {
          type: 'string',
          description: 'External HTTP or HTTPS x402 endpoint URL to call, for example an agent endpoint discovered from SAP registry metadata.',
        },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
          description: 'HTTP method for the external request. Defaults to POST.',
        },
        headers: {
          type: 'object',
          description: 'Optional non-sensitive headers for the external request. Do not include PAYMENT-SIGNATURE, X-PAYMENT, Authorization, or cookies.',
        },
        body: {
          type: 'object',
          description: 'Optional JSON request body for POST, PUT, PATCH, or DELETE calls. Strings are sent as-is; objects are JSON-encoded.',
        },
        profileName: paidCallInputSchema.profileName,
        maxPriceUsd: paidCallInputSchema.maxPriceUsd,
        maxAttempts: paidCallInputSchema.maxAttempts,
        confirm: paidCallInputSchema.confirm,
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', description: 'Whether the external x402 call completed successfully.' },
          url: { type: 'string', description: 'External endpoint URL called.' },
          method: { type: 'string', description: 'HTTP method used.' },
          signerAddress: { type: 'string', description: 'Public address of the local SAP MCP signer. Secret bytes are never returned.' },
          payment: { type: 'object', description: 'Selected payment requirements, including amountUsd, network, asset, and payTo, when a 402 challenge was paid.' },
          settlement: { type: 'object', description: 'x402 settlement response returned by the provider/facilitator when available.' },
          response: { type: 'object', description: 'External HTTP response status, safe headers, and parsed body.' },
          attempts: { type: 'number', description: 'Number of attempts used.' },
          transientRetries: { type: 'array', items: { type: 'string' }, description: 'Retryable errors encountered before success.' },
          audit: { type: 'object', description: 'Agent-readable proof object with intent id, profile, payment receipt, attempts, and secret-material guarantee.' },
        },
        required: ['success', 'url', 'method', 'signerAddress', 'response', 'attempts', 'transientRetries', 'audit'],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input: unknown) => {
      try {
        const parsed = parseExternalInput(input);
        const result = await executeExternalX402Call(parsed);
        return createTextResponse(JSON.stringify(result, null, 2));
      } catch (error) {
        return createTextResponse(formatPaidCallError(error), { isError: true });
      }
    },
  );
}

function registerPaymentsFinalizeTransactionTool(server: Server, context: SapMcpContext): void {
  registerTool(
    server,
    'sap_payments_finalize_transaction',
    {
      title: 'Finalize Transaction With Local Signer',
      description: 'Local non-custodial transaction finalizer for hosted SAP MCP builders. Use this when a hosted tool returns transactionBase64, transaction, or an unsigned Solana transaction. It previews, signs with the active local SAP MCP profile signer, and optionally submits through the configured RPC. Never create temporary signing scripts, read keypair JSON, or call hosted sap_sign_transaction for user-owned signatures. Requires confirm: true.',
      inputSchema: {
        transaction: {
          type: 'string',
          description: 'Serialized unsigned or partially signed Solana transaction. Accepts base64 by default.',
        },
        transactionBase64: {
          type: 'string',
          description: 'Alias for transaction when the builder returns transactionBase64.',
        },
        encoding: {
          type: 'string',
          enum: ['base64', 'base58'],
          description: 'Encoding for transaction or transactionBase64. Defaults to base64.',
        },
        submit: {
          type: 'boolean',
          description: 'When true, submit the signed transaction after preview and signing. When false or omitted, return the signed transaction for inspection.',
        },
        skipPreflight: {
          type: 'boolean',
          description: 'Optional Solana RPC sendRawTransaction skipPreflight flag, used only when submit is true.',
        },
        maxRetries: {
          type: 'number',
          description: 'Optional Solana RPC sendRawTransaction maxRetries value, used only when submit is true.',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true. Confirms the user allows the local SAP MCP signer to sign this transaction.',
        },
        intentId: {
          type: 'string',
          description: 'Optional caller-provided id used to bind preview, signature, submission, and audit output.',
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', description: 'Whether finalization succeeded.' },
          action: { type: 'string', description: 'preview-sign or preview-sign-submit.' },
          submitted: { type: 'boolean', description: 'Whether the signed transaction was submitted to RPC.' },
          signature: { type: 'string', description: 'Solana transaction signature when submit is true.' },
          signerPublicKey: { type: 'string', description: 'Public key of the local signer that signed the transaction.' },
          nativeTransferSol: { type: 'number', description: 'Estimated native SOL transferred by the transaction.' },
          preview: { type: 'object', description: 'Decoded transaction preview and policy result.' },
          signedTransaction: { type: 'string', description: 'Base64 signed transaction when submit is false or for audit.' },
          encoding: { type: 'string', description: 'Encoding of signedTransaction.' },
          audit: { type: 'object', description: 'Proof object binding intent, local signer, preview, signing, submission, and secret-material guarantee.' },
        },
        required: ['success', 'action', 'submitted', 'signerPublicKey', 'nativeTransferSol', 'preview', 'audit'],
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
        const parsed = parseFinalizeTransactionInput(input);
        const result = await finalizeTransactionWithLocalSigner(context, parsed);
        return createTextResponse(JSON.stringify(result, null, 2));
      } catch (error) {
        return createTextResponse(formatFinalizeTransactionError(error), { isError: true });
      }
    },
  );
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

function parseExternalInput(input: unknown): X402ExternalCallInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('sap_payments_call_external_x402 requires an input object.');
  }

  const record = input as X402ExternalCallToolInput;
  if (!record.url) {
    throw new Error('url is required.');
  }
  if (record.maxPriceUsd === undefined) {
    throw new Error('maxPriceUsd is required.');
  }

  return {
    url: record.url,
    method: record.method,
    headers: record.headers,
    body: record.body,
    profileName: record.profileName,
    maxPriceUsd: record.maxPriceUsd,
    maxAttempts: record.maxAttempts,
    confirm: record.confirm === true,
  };
}

function parseRegisterAgentInput(input: unknown): PaymentsRegisterAgentToolInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('sap_payments_register_agent requires an input object.');
  }

  const record = input as PaymentsRegisterAgentToolInput;
  if (record.confirm !== true) {
    throw new Error('confirm: true is required to submit a local SAP registry transaction.');
  }

  return record;
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

function parseFinalizeTransactionInput(input: unknown): PaymentsFinalizeTransactionToolInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('sap_payments_finalize_transaction requires an input object.');
  }

  const record = input as PaymentsFinalizeTransactionToolInput;
  if (!record.transaction && !record.transactionBase64) {
    throw new Error('transaction or transactionBase64 is required.');
  }

  return {
    transaction: record.transaction,
    transactionBase64: record.transactionBase64,
    encoding: record.encoding,
    submit: record.submit === true,
    skipPreflight: record.skipPreflight,
    maxRetries: record.maxRetries,
    confirm: record.confirm === true,
    intentId: record.intentId,
  };
}

type X402PaidCallErrorCategory = 'x402_transient_rpc' | 'x402_client_or_config';
type LocalRegistryErrorCategory = 'local_signer_missing' | 'local_registry_write_failed';

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

function formatLocalRegistryError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  const signerMissing = normalized.includes('no local signer') || normalized.includes('no signer configured');
  const retryable = isRetryablePaymentError(message);
  const category: LocalRegistryErrorCategory = signerMissing
    ? 'local_signer_missing'
    : 'local_registry_write_failed';

  return JSON.stringify({
    success: false,
    error: message,
    retryable,
    category,
    hostedX402Charged: false,
    agentInstruction: 'For SAP agent registration from hosted-user setups, call sap_payments_register_agent from the local sap_payments bridge. Do not retry hosted sap_register_agent after hosted_local_signer_required, and do not create temporary signing scripts or read keypair JSON.',
    nextAction: signerMissing
      ? 'Call sap_payments_readiness. If signerConfigured is false, run the SAP MCP wizard full setup or repair flow and restart the agent runtime.'
      : 'Check the registration fields, local profile, SOL fee balance, and SAP program/RPC status. Retry sap_payments_register_agent only after explicit user confirmation.',
  }, null, 2);
}

function formatFinalizeTransactionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return JSON.stringify({
    success: false,
    error: message,
    retryable: isRetryablePaymentError(message),
    category: message.toLowerCase().includes('no local signer') || message.toLowerCase().includes('no signer')
      ? 'local_signer_missing'
      : 'local_transaction_finalization_failed',
    agentInstruction: 'Do not create temporary signing scripts, do not read keypair JSON, and do not call hosted sap_sign_transaction for user-owned signatures. Use sap_payments_finalize_transaction from the local sap_payments bridge. If this tool is missing or no signer is configured, ask the user to run the SAP MCP wizard full setup or repair flow and restart the agent runtime.',
    nextAction: 'Call sap_payments_readiness. If the local signer is ready, retry sap_payments_finalize_transaction with confirm: true. If readiness says missing bridge or signer, run the wizard repair flow.',
  }, null, 2);
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
