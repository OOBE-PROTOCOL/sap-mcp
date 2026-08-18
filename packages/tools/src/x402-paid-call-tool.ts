/**
 * @name X402PaidCallTool
 * @description Local MCP tool that pays and retries hosted SAP MCP x402 calls with the user's SAP MCP profile signer.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { PaymentRequired } from '@x402/core/types';
import type { SapMcpContext } from '../../core/src/types.js';
import { logger } from '../../core/src/logger.js';
import { getActiveProfile, getProfileConfigPath } from '../../config-runtime/src/profiles.js';
import { setValidationServer, validateToolArguments } from '../../payments/src/schema-validation.js';
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
} from '../../payments/src/x402-paid-call.js';
import { getGlobalPrepaidStore } from '../../payments/src/prepaid-credit-store.js';
import { finalizeTransactionWithLocalSigner, type TransactionEncoding } from './transaction-tools.js';
import {
  SAP_AGENT_REGISTER_INPUT_SCHEMA,
  SAP_AGENT_UPDATE_INPUT_SCHEMA,
  parseRegisterAgentArgs,
  parseUpdateAgentArgs,
} from './sap-sdk-tools.js';
import { SAP_PROTOCOL_TREASURY, SAP_REGISTRATION_FEE_LAMPORTS } from '../../core/src/constants.js';
import { getPaymentBridgeProcessStatus } from '../../runtime/src/payment-bridge-process.js';
import { buildWalletGuardSummary } from '../../signer/src/wallet-guard.js';
import {
  createStringToolPipelineResult,
  registerToolFamilyPipelineTool,
  type ToolFamilyPipelineDefinition,
  type ToolFamilyPipelineHandlerResult,
  type ToolFamilyPipelineResult,
} from './tool-family-pipeline.js';

type X402ToolDefinition = ToolFamilyPipelineDefinition;
type X402ToolHandlerResult = ToolFamilyPipelineHandlerResult;

function createX402PipelineResponse(
  body: string,
  options: { readonly isError?: boolean } = {},
): ToolFamilyPipelineResult {
  return createStringToolPipelineResult(body, options);
}

function registerX402PipelineTool(
  server: Server,
  context: SapMcpContext,
  name: string,
  definition: X402ToolDefinition,
  execute: (input: unknown) => Promise<X402ToolHandlerResult>,
): void {
  registerToolFamilyPipelineTool(server, context, name, definition, execute);
}

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
  prepaidSessionId?: string;
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
  confirmationTimeoutMs?: number;
  commitment?: 'processed' | 'confirmed' | 'finalized';
  submitViaRelay?: boolean;
  submitRelayUrl?: string;
  confirm?: boolean;
  signerProfile?: string;
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
  confirmationTimeoutMs?: number;
  confirm?: boolean;
}

interface PaymentsUpdateAgentToolInput {
  name?: string;
  description?: string;
  capabilities?: unknown[];
  pricing?: unknown[];
  protocols?: string[];
  agentId?: string;
  agentUri?: string;
  metadataUri?: string;
  x402Endpoint?: string;
  confirmationTimeoutMs?: number;
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
    description: 'Per-call safety cap in USD for the x402 payment. The call aborts before signing if the challenge exceeds this cap. Estimate first with sap_estimate_tool_cost.',
  },
  maxAttempts: {
    type: 'number',
    description: 'Optional retry count for transient x402/RPC failures such as BlockhashNotFound. Defaults to 3; max 5.',
  },
  confirm: {
    type: 'boolean',
    description: 'Must be true. Confirms the user allows this helper to sign an x402 payment payload.',
  },
  prepaidSessionId: {
    type: 'string',
    description: 'Optional prepaid session ID. When set, the bridge injects an X-SAP-Prepaid-Session header so the server can grant access from prepaid balance. If the prepaid session has sufficient balance, no x402 payment is charged (paymentCharged: false, prepaidUsed: true). If the prepaid balance is insufficient, the server returns 402 and the bridge falls through to normal x402 payment. Use sap_payments_start_prepaid to create a session, then pass the returned sessionId here.',
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
 * @name registerHostedPrepaidTools
 * @description Registers only the prepaid fund + balance tools on the hosted server.
 * The hosted server owns the PrepaidCreditStore that grantAccess checks against.
 * The bridge calls sap_payments_fund_prepaid via x402 to create a session here,
 * then passes the sessionId back as X-SAP-Prepaid-Session header for grantAccess.
 */
export function registerHostedPrepaidTools(server: Server, context: SapMcpContext): void {
  registerPaymentsFundPrepaidTool(server, context);
  registerPaymentsPrepaidBalanceTool(server, context);
  logger.info('Hosted prepaid tools registered (fund + balance)');
}

/**
 * @name registerX402PaidCallTool
 * @description Registers local hosted-payment tools for agents that need to resolve x402-gated SAP MCP calls.
 */
export function registerX402PaidCallTool(server: Server, _context: SapMcpContext): void {
  // Store server reference for pre-payment schema validation.
  // The paid-call handler uses this to look up tool schemas from the local
  // registration store and validate arguments before paying x402.
  setValidationServer(server);
  registerPaymentsProfileCurrentTool(server, _context);
  registerPaymentsWalletGuardTool(server, _context);
  registerPaymentsReadinessTool(server, _context);
  registerPaymentsProcessStatusTool(server, _context);
  registerPaymentsCallPaidTool(server, _context, 'sap_payments_call_paid_tool');
  registerPaymentsCallExternalX402Tool(server, _context);
  registerPaymentsRegisterAgentTool(server, _context);
  registerPaymentsUpdateAgentTool(server, _context);
  registerPaymentsFinalizeTransactionTool(server, _context);
  registerPaymentsPrepareChallengeTool(server, _context);
  registerPaymentsSignChallengeTool(server, _context);
  registerPaymentsVerifyReceiptTool(server, _context);
  registerPaymentsPrepaidBalanceTool(server, _context);
  registerPaymentsStartPrepaidTool(server, _context);

  // Backward-compatible alias used by existing Codex/Hermes/Claude client snippets.
  registerPaymentsCallPaidTool(server, _context, 'sap_x402_paid_call');
}

function registerPaymentsRegisterAgentTool(server: Server, context: SapMcpContext): void {
  registerX402PipelineTool(
    server,
    context,
    'sap_payments_register_agent',
    {
      title: 'Register SAP Agent With Local Signer',
      description: 'Canonical local non-custodial SAP registry write for hosted and local users. Use this after hosted sap_register_agent returns hosted_local_signer_required, or directly instead of raw sap_register_agent. It registers the active local SAP MCP profile wallet as an on-chain SAP agent with the local signer; OOBE never receives keypair bytes. This tool does not pay a hosted x402 fee because it runs locally through sap_payments. After confirmation it enforces the source-level expected 0.1 SOL SAP protocol registration fee against the protocol treasury. success is true only when the agent account exists and the protocol fee invariant is verified. Requires confirm: true.',
      inputSchema: {
        ...SAP_AGENT_REGISTER_INPUT_SCHEMA,
        confirmationTimeoutMs: {
          type: 'number',
          description: 'Optional local confirmation wait in milliseconds. Defaults to 90000 so the tool can distinguish confirmed registration from an expired/not-landed transaction.',
        },
        confirm: { type: 'boolean', description: 'Must be true. Confirms the user wants the local signer to submit this SAP registry transaction.' },
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', description: 'Whether the full SAP registration lifecycle completed: agent account confirmed and protocol fee invariant verified.' },
          signature: { type: 'string', description: 'Solana transaction signature returned by the SAP SDK.' },
          confirmationStatus: { type: 'string', description: 'Final local confirmation result: confirmed, finalized, processed, expired, missing, or failed.' },
          signerPublicKey: { type: 'string', description: 'Public key of the local SAP MCP signer that registered the agent.' },
          profile: { type: 'string', description: 'Active local SAP MCP profile used for registration when available.' },
          agentRegistered: { type: 'boolean', description: 'Whether the SAP agent account was found on-chain, even if protocolComplete is false.' },
          agent: { type: 'object', description: 'Agent registration fields submitted on-chain.' },
          protocolFee: { type: 'object', description: 'Verification of the SAP protocol registration fee credited to the protocol treasury in the landed transaction.' },
          protocolComplete: { type: 'boolean', description: 'True only when the agent account is confirmed and the expected protocol fee invariant is verified from transaction metadata.' },
          audit: { type: 'object', description: 'Agent-readable proof that the write was local, non-custodial, and did not use hosted x402.' },
        },
        required: ['success', 'signature', 'confirmationStatus', 'signerPublicKey', 'agentRegistered', 'agent', 'protocolFee', 'protocolComplete', 'audit'],
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
        const confirmation = await waitForLocalAgentRegistration(context, signature, parsed.confirmationTimeoutMs);
        if (!confirmation.confirmed) {
          return createX402PipelineResponse(JSON.stringify({
            success: false,
            signature,
            confirmationStatus: confirmation.status,
            signerPublicKey,
            profile: activeProfile,
            agentPda: confirmation.agentPda,
            agentRegistered: false,
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
            protocolFee: buildUnconfirmedProtocolFeeStatus(signature),
            protocolComplete: false,
            audit: {
              action: 'sap_payments_register_agent',
              registeredLocally: true,
              hostedX402Charged: false,
              signerBoundary: 'local-sap-payments-bridge',
              secretMaterial: 'keypair-bytes-never-returned',
              transactionLanded: false,
              retrySafe: confirmation.retrySafe,
              rule: 'The local signer submitted the SAP registry transaction, but the transaction did not confirm or the agent account was not found inside the local confirmation window.',
              nextAction: confirmation.retrySafe
                ? 'Ask the user for confirmation, then retry sap_payments_register_agent once with the same fields and confirm: true. Do not call hosted sap_register_agent.'
                : 'Do not retry automatically. Inspect the signature and local RPC health first.',
            },
          }, null, 2), { isError: true });
        }

        const protocolFee = await verifyProtocolRegistrationFee(context, signature);
        if (protocolFee.status === 'missing_or_underpaid') {
          return createX402PipelineResponse(JSON.stringify({
            success: false,
            signature,
            confirmationStatus: confirmation.status,
            signerPublicKey,
            profile: activeProfile,
            agentPda: confirmation.agentPda,
            agentRegistered: true,
            protocolComplete: false,
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
            protocolFee,
            audit: {
              action: 'sap_payments_register_agent',
              registeredLocally: true,
              hostedX402Charged: false,
              signerBoundary: 'local-sap-payments-bridge',
              secretMaterial: 'keypair-bytes-never-returned',
              transactionLanded: true,
              protocolIntegrity: 'failed',
              rule: 'The SAP agent account was found after registration, but the source-level expected protocol treasury registration fee was not visible in the landed transaction. The account exists, but the SAP registration lifecycle is not complete and must not be marketed as protocol-complete.',
              nextAction: 'Do not retry registration automatically. Inspect the signature, deployed SAP program version, and treasury account balance delta before changing fee policy or redeploying the program.',
            },
          }, null, 2), { isError: true });
        }

        if (protocolFee.status !== 'verified') {
          return createX402PipelineResponse(JSON.stringify({
            success: false,
            signature,
            confirmationStatus: confirmation.status,
            signerPublicKey,
            profile: activeProfile,
            agentPda: confirmation.agentPda,
            agentRegistered: true,
            protocolComplete: false,
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
            protocolFee,
            audit: {
              action: 'sap_payments_register_agent',
              registeredLocally: true,
              hostedX402Charged: false,
              signerBoundary: 'local-sap-payments-bridge',
              secretMaterial: 'keypair-bytes-never-returned',
              transactionLanded: true,
              protocolIntegrity: 'fee-verification-unavailable',
              rule: 'The SAP agent account was found, but transaction metadata did not prove the protocol treasury fee. The lifecycle is intentionally failed closed until another RPC or explorer verifies the fee delta.',
              nextAction: 'Fetch transaction metadata from a reliable RPC or explorer. Do not announce registration complete until protocolFee.status is verified.',
            },
          }, null, 2), { isError: true });
        }

        return createX402PipelineResponse(JSON.stringify({
          success: true,
          signature,
          confirmationStatus: confirmation.status,
          signerPublicKey,
          profile: activeProfile,
          agentPda: confirmation.agentPda,
          agentRegistered: true,
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
          protocolFee,
          protocolComplete: protocolFee.status === 'verified',
          audit: {
            action: 'sap_payments_register_agent',
            registeredLocally: true,
            hostedX402Charged: false,
            signerBoundary: 'local-sap-payments-bridge',
            secretMaterial: 'keypair-bytes-never-returned',
            transactionLanded: true,
            protocolIntegrity: 'verified',
            rule: 'Hosted sap_register_agent is accountless and cannot sign user-owned registry writes. This local bridge submitted the SAP registry transaction with the user-controlled profile signer.',
            nextAction: 'Registration is complete. Fetch the agent by owner wallet and continue with optional Metaplex or SNS identity links.',
          },
        }, null, 2));
      } catch (error) {
        return createX402PipelineResponse(formatLocalRegistryError(error), { isError: true });
      }
    },
  );
}

function buildUnconfirmedProtocolFeeStatus(signature: string): Record<string, unknown> {
  return {
    status: 'not_checked',
    signature,
    expectedTreasury: SAP_PROTOCOL_TREASURY,
    expectedLamports: SAP_REGISTRATION_FEE_LAMPORTS.toString(10),
    reason: 'Registration transaction was not confirmed, so protocol fee verification was skipped.',
  };
}

async function verifyProtocolRegistrationFee(
  context: SapMcpContext,
  signature: string,
): Promise<Record<string, unknown>> {
  try {
    const tx = await context.connection.getParsedTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    if (!tx?.meta) {
      return {
        status: 'unavailable',
        signature,
        expectedTreasury: SAP_PROTOCOL_TREASURY,
        expectedLamports: SAP_REGISTRATION_FEE_LAMPORTS.toString(10),
        reason: 'Transaction metadata was unavailable from the configured RPC.',
      };
    }

    const accountKeys = tx.transaction.message.accountKeys.map((account) => account.pubkey.toBase58());
    const treasuryIndex = accountKeys.indexOf(SAP_PROTOCOL_TREASURY);
    if (treasuryIndex < 0) {
      return {
        status: 'missing_or_underpaid',
        signature,
        expectedTreasury: SAP_PROTOCOL_TREASURY,
        expectedLamports: SAP_REGISTRATION_FEE_LAMPORTS.toString(10),
        observedLamportsDelta: '0',
        reason: 'Protocol treasury account was not present in the transaction account list.',
      };
    }

    const preBalance = BigInt(tx.meta.preBalances[treasuryIndex] ?? 0);
    const postBalance = BigInt(tx.meta.postBalances[treasuryIndex] ?? 0);
    const delta = postBalance - preBalance;
    const verified = delta >= SAP_REGISTRATION_FEE_LAMPORTS;
    return {
      status: verified ? 'verified' : 'missing_or_underpaid',
      signature,
      expectedTreasury: SAP_PROTOCOL_TREASURY,
      expectedLamports: SAP_REGISTRATION_FEE_LAMPORTS.toString(10),
      observedLamportsDelta: delta.toString(10),
      reason: verified
        ? 'Protocol treasury balance delta satisfies the expected SAP registration fee.'
        : 'Protocol treasury balance delta is below the expected SAP registration fee.',
    };
  } catch (error) {
    return {
      status: 'unavailable',
      signature,
      expectedTreasury: SAP_PROTOCOL_TREASURY,
      expectedLamports: SAP_REGISTRATION_FEE_LAMPORTS.toString(10),
      reason: error instanceof Error ? error.message : 'Unable to fetch transaction metadata from RPC.',
    };
  }
}

function registerPaymentsUpdateAgentTool(server: Server, context: SapMcpContext): void {
  registerX402PipelineTool(
    server,
    context,
    'sap_payments_update_agent',
    {
      title: 'Update SAP Agent With Local Signer',
      description: 'Local non-custodial SAP registry update for hosted users. Use this when hosted sap_update_agent returns hosted_local_signer_required. It updates the active local SAP MCP profile wallet agent with the local signer, including name, description, capabilities, protocols, pricing, agentUri/metadataUri, or x402Endpoint. Use it for agent picture/profile metadata updates after uploading image or metadata to a public URL such as IPFS, Arweave, Kommodo, or a HTTPS metadata endpoint. OOBE never receives keypair bytes and no hosted x402 fee is charged. Requires confirm: true.',
      inputSchema: {
        ...SAP_AGENT_UPDATE_INPUT_SCHEMA,
        confirmationTimeoutMs: {
          type: 'number',
          description: 'Optional local confirmation wait in milliseconds. Defaults to 90000 so the tool can distinguish confirmed update from an expired/not-landed transaction.',
        },
        confirm: { type: 'boolean', description: 'Must be true. Confirms the user wants the local signer to submit this SAP registry update transaction.' },
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', description: 'Whether the local SAP agent update transaction was confirmed on-chain.' },
          signature: { type: 'string', description: 'Solana transaction signature returned by the SAP SDK.' },
          confirmationStatus: { type: 'string', description: 'Final local confirmation result: confirmed, finalized, processed, expired, missing, or failed.' },
          signerPublicKey: { type: 'string', description: 'Public key of the local SAP MCP signer that updated the agent.' },
          profile: { type: 'string', description: 'Active local SAP MCP profile used for update when available.' },
          agentPda: { type: 'string', description: 'SAP agent PDA derived from the active local signer wallet.' },
          update: { type: 'object', description: 'Update fields submitted on-chain. Omitted fields were intentionally left unchanged.' },
          audit: { type: 'object', description: 'Agent-readable proof that the write was local, non-custodial, and did not use hosted x402.' },
        },
        required: ['success', 'signature', 'confirmationStatus', 'signerPublicKey', 'agentPda', 'update', 'audit'],
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
        const parsed = parseUpdateAgentInput(input);
        const activeProfile = getActiveProfile();
        const signerPublicKey = context.signer?.publicKey.toBase58();
        if (!signerPublicKey) {
          throw new Error('No local signer configured. Run the SAP MCP wizard full setup or repair the local sap_payments bridge, then restart the agent runtime.');
        }

        const args = parseUpdateAgentArgs(parsed as Record<string, unknown>);
        const signature = await context.sapClient.agent.update(args);
        const confirmation = await waitForLocalAgentUpdate(context, signature, parsed.confirmationTimeoutMs);
        const update = summarizeAgentUpdate(args);
        if (!confirmation.confirmed) {
          return createX402PipelineResponse(JSON.stringify({
            success: false,
            signature,
            confirmationStatus: confirmation.status,
            signerPublicKey,
            profile: activeProfile,
            agentPda: confirmation.agentPda,
            update,
            audit: {
              action: 'sap_payments_update_agent',
              updatedLocally: true,
              hostedX402Charged: false,
              signerBoundary: 'local-sap-payments-bridge',
              secretMaterial: 'keypair-bytes-never-returned',
              transactionLanded: false,
              retrySafe: confirmation.retrySafe,
              rule: 'The local signer submitted the SAP registry update transaction, but the transaction did not confirm or the agent account was not found inside the local confirmation window.',
              nextAction: confirmation.retrySafe
                ? 'Ask the user for confirmation, then retry sap_payments_update_agent once with the same fields and confirm: true. Do not call hosted sap_update_agent.'
                : 'Do not retry automatically. Inspect the signature and local RPC health first.',
            },
          }, null, 2), { isError: true });
        }

        return createX402PipelineResponse(JSON.stringify({
          success: true,
          signature,
          confirmationStatus: confirmation.status,
          signerPublicKey,
          profile: activeProfile,
          agentPda: confirmation.agentPda,
          update,
          audit: {
            action: 'sap_payments_update_agent',
            updatedLocally: true,
            hostedX402Charged: false,
            signerBoundary: 'local-sap-payments-bridge',
            secretMaterial: 'keypair-bytes-never-returned',
            transactionLanded: true,
            rule: 'Hosted sap_update_agent is accountless and cannot sign user-owned registry writes. This local bridge submitted the SAP registry update with the user-controlled profile signer.',
          },
        }, null, 2));
      } catch (error) {
        return createX402PipelineResponse(formatLocalRegistryError(error), { isError: true });
      }
    },
  );
}

async function waitForLocalAgentRegistration(
  context: SapMcpContext,
  signature: string,
  timeoutMs = 90_000,
): Promise<{
  confirmed: boolean;
  retrySafe: boolean;
  status: string;
  agentPda: string;
}> {
  return waitForLocalAgentWrite(context, signature, timeoutMs);
}

async function waitForLocalAgentWrite(
  context: SapMcpContext,
  signature: string,
  timeoutMs = 90_000,
): Promise<{
  confirmed: boolean;
  retrySafe: boolean;
  status: string;
  agentPda: string;
}> {
  const boundedTimeoutMs = Math.max(15_000, Math.min(timeoutMs, 180_000));
  const startedAt = Date.now();
  const [agentPda] = context.sapClient.agent.deriveAgent();
  let lastStatus = 'missing';

  while (Date.now() - startedAt < boundedTimeoutMs) {
    const statuses = await context.connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
    const status = statuses.value[0];
    if (status?.err) {
      return {
        confirmed: false,
        retrySafe: true,
        status: 'failed',
        agentPda: agentPda.toBase58(),
      };
    }

    lastStatus = status?.confirmationStatus ?? lastStatus;
    const agent = await context.sapClient.agent.fetchNullable();
    if (agent) {
      return {
        confirmed: true,
        retrySafe: false,
        status: status?.confirmationStatus ?? 'confirmed',
        agentPda: agentPda.toBase58(),
      };
    }

    await sleep(2_000);
  }

  return {
    confirmed: false,
    retrySafe: lastStatus === 'missing',
    status: lastStatus === 'missing' ? 'expired_or_not_landed' : lastStatus,
    agentPda: agentPda.toBase58(),
  };
}

async function waitForLocalAgentUpdate(
  context: SapMcpContext,
  signature: string,
  timeoutMs = 90_000,
): Promise<{
  confirmed: boolean;
  retrySafe: boolean;
  status: string;
  agentPda: string;
}> {
  const boundedTimeoutMs = Math.max(15_000, Math.min(timeoutMs, 180_000));
  const startedAt = Date.now();
  const [agentPda] = context.sapClient.agent.deriveAgent();
  let lastStatus = 'missing';

  while (Date.now() - startedAt < boundedTimeoutMs) {
    const statuses = await context.connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
    const status = statuses.value[0];
    if (status?.err) {
      return {
        confirmed: false,
        retrySafe: true,
        status: 'failed',
        agentPda: agentPda.toBase58(),
      };
    }

    lastStatus = status?.confirmationStatus ?? lastStatus;
    if (lastStatus === 'processed' || lastStatus === 'confirmed' || lastStatus === 'finalized') {
      return {
        confirmed: true,
        retrySafe: false,
        status: lastStatus,
        agentPda: agentPda.toBase58(),
      };
    }

    await sleep(2_000);
  }

  return {
    confirmed: false,
    retrySafe: lastStatus === 'missing',
    status: lastStatus === 'missing' ? 'expired_or_not_landed' : lastStatus,
    agentPda: agentPda.toBase58(),
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

function registerPaymentsCallExternalX402Tool(server: Server, context: SapMcpContext): void {
  registerX402PipelineTool(
    server,
    context,
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
        return createX402PipelineResponse(JSON.stringify(result, null, 2));
      } catch (error) {
        return createX402PipelineResponse(formatPaidCallError(error), { isError: true });
      }
    },
  );
}

function registerPaymentsFinalizeTransactionTool(server: Server, context: SapMcpContext): void {
  registerX402PipelineTool(
    server,
    context,
    'sap_payments_finalize_transaction',
    {
      title: 'Finalize Transaction With Local Signer',
      description: 'Local non-custodial transaction finalizer for hosted SAP MCP builders. Use this when a hosted tool returns transactionBase64, transaction, or an unsigned Solana transaction. It previews, signs with the active local SAP MCP profile signer, and optionally submits through the OOBE hosted submit relay for reliable confirmation. The relay only broadcasts already-signed bytes and never receives keypair material. Never create temporary signing scripts, read keypair JSON, or call hosted sap_sign_transaction for user-owned signatures. Requires confirm: true.',
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
        confirmationTimeoutMs: {
          type: 'number',
          description: 'Optional bounded confirmation wait in milliseconds. Defaults to 90000; maximum 180000.',
        },
        commitment: {
          type: 'string',
          enum: ['processed', 'confirmed', 'finalized'],
          description: 'Desired confirmation status before returning success. Defaults to confirmed.',
        },
        submitViaRelay: {
          type: 'boolean',
          description: 'When submit is true, defaults to true. Set false only when the user explicitly wants local RPC submission instead of the OOBE hosted submit relay.',
        },
        submitRelayUrl: {
          type: 'string',
          description: 'Optional submit relay URL. Must be HTTPS, localhost, or 127.0.0.1. Defaults to https://mcp.sap.oobeprotocol.ai/tx/submit.',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true. Confirms the user allows the local SAP MCP signer to sign this transaction.',
        },
        signerProfile: {
          type: 'string',
          description: 'Optional profile name to use for signing instead of the global active profile. When provided, the bridge loads config-<signerProfile>.json and uses its keypair. This eliminates the need to switch .active-profile manually — multiple profiles can coexist in the same session. Falls back to the active profile if omitted.',
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
          confirmationStatus: { type: 'string', description: 'Confirmed/finalized/failed/expired_or_not_landed status when submit is true.' },
          retrySafe: { type: 'boolean', description: 'Whether the agent may ask the user to retry without risking a known landed duplicate.' },
          explorerUrl: { type: 'string', description: 'Solana explorer URL for the submitted signature.' },
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
        return createX402PipelineResponse(JSON.stringify(result, null, 2));
      } catch (error) {
        return createX402PipelineResponse(formatFinalizeTransactionError(error), { isError: true });
      }
    },
  );
}

function registerPaymentsProfileCurrentTool(server: Server, context: SapMcpContext): void {
  registerX402PipelineTool(
    server,
    context,
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
          walletPathConfigured: { type: 'boolean', description: 'Whether a wallet path is configured.' },
          wallet: { type: 'object', description: 'Redacted wallet file status. The path is never returned.' },
          walletGuard: { type: 'object', description: 'Capability-only local signer guardrails and recommended safe flow.' },
          signerConfigured: { type: 'boolean', description: 'Whether the local bridge resolved a signer.' },
          signerPublicKey: { type: 'string', description: 'Public key of the local signer when available.' },
          secretMaterial: { type: 'string', description: 'Secret handling guarantee.' },
          recommendedPaidTool: { type: 'string', description: 'Tool agents should call for hosted paid/write calls.' },
        },
        required: ['serverRole', 'activeProfile', 'configPath', 'mode', 'walletPathConfigured', 'wallet', 'walletGuard', 'signerConfigured', 'secretMaterial', 'recommendedPaidTool'],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      // Re-read the active profile on every call to avoid stale cache.
      // The context.signer was resolved at startup from the then-active profile;
      // if the user switched .active-profile manually, the cached signer is stale.
      // We re-read .active-profile and resolve the current signer on demand.
      const currentProfile = getActiveProfile();
      const currentConfigPath = getProfileConfigPath(currentProfile);
      let currentSignerPubkey: string | undefined = context.signer?.publicKey.toBase58();
      let currentConfig = context.config;

      // Always try to re-resolve the signer from the active profile to avoid
      // stale cache. If .active-profile was switched manually after startup,
      // the context.signer reflects the OLD profile. We re-read and re-resolve.
      try {
        const { loadProfileConfig } = await import('../../config-runtime/src/profiles.js');
        const { resolveSigner } = await import('../../signer/src/signer-resolver.js');
        const profileConfig = loadProfileConfig(currentProfile);
        if (profileConfig) {
          currentConfig = { ...context.config, ...profileConfig };
          const signerResult = await resolveSigner(currentConfig);
          if (signerResult.signer) {
            currentSignerPubkey = signerResult.signer.publicKey.toBase58();
          }
        }
      } catch {
        // If we can't resolve the signer for the current profile, fall back
        // to the cached signer — better than crashing.
      }
      const walletGuard = buildWalletGuardSummary(currentConfig, {
        activeProfile: currentProfile,
        signerPublicKey: currentSignerPubkey,
      });

      return createX402PipelineResponse(JSON.stringify({
        serverRole: 'local-sap-payments-bridge',
        activeProfile: currentProfile,
        configPath: currentConfigPath,
        mode: currentConfig.mode,
        network: networkFromRpcUrl(currentConfig.rpcUrl),
        rpcUrl: redactUrl(currentConfig.rpcUrl),
        programId: currentConfig.programId,
        agentPubkey: currentConfig.agentPubkey,
        walletPathConfigured: walletGuard.wallet.configured,
        wallet: walletGuard.wallet,
        walletGuard,
        signerConfigured: Boolean(currentSignerPubkey),
        signerPublicKey: currentSignerPubkey,
        localProfileVisibility: 'visible-to-local-sap-payments-bridge',
        hostedRemoteVisibility: 'not-visible-to-hosted-accountless-server',
        secretMaterial: 'keypair-bytes-never-returned',
        recommendedPaidTool: 'sap_payments_call_paid_tool',
        recommendedReadinessTool: 'sap_payments_readiness',
        agentInstruction: 'For wallet/profile questions, trust this local sap_payments profile result over the remote hosted sap_profile_current result. For paid/write workflows call sap_payments_readiness first. The hosted SAP MCP server is intentionally accountless. If you need to sign with a specific profile, use signerProfile param on sap_payments_finalize_transaction instead of switching .active-profile.',
      }, null, 2));
    },
  );
}

function registerPaymentsWalletGuardTool(server: Server, context: SapMcpContext): void {
  registerX402PipelineTool(
    server,
    context,
    'sap_payments_wallet_guard',
    {
      title: 'Show Local Wallet Guardrails',
      description: 'Free local signer safety guard for agents. Returns the active SAP profile, signer public key, redacted wallet storage status, allowed sap_payments capabilities, and forbidden actions. Never returns wallet paths, keypair bytes, seed phrases, or private material.',
      inputSchema: {
        profileName: {
          type: 'string',
          description: 'Optional SAP MCP profile name to inspect. Defaults to the active local profile.',
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          serverRole: { type: 'string', description: 'Role of this local MCP server.' },
          activeProfile: { type: 'string', description: 'Inspected local SAP MCP profile name.' },
          signerConfigured: { type: 'boolean', description: 'Whether the profile resolves to a local signer capability.' },
          signerPublicKey: { type: 'string', description: 'Signer public key when available.' },
          walletGuard: { type: 'object', description: 'Redacted capability-only wallet guard result.' },
          agentInstruction: { type: 'string', description: 'Short instruction agents should follow before paid/write workflows.' },
        },
        required: ['serverRole', 'activeProfile', 'signerConfigured', 'walletGuard', 'agentInstruction'],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input: unknown) => {
      const record = input && typeof input === 'object' && !Array.isArray(input)
        ? input as Record<string, unknown>
        : {};
      const profileName = typeof record.profileName === 'string' ? record.profileName : getActiveProfile();
      let currentConfig = context.config;
      let signerPublicKey: string | undefined = context.signer?.publicKey.toBase58();

      try {
        const { loadProfileConfig } = await import('../../config-runtime/src/profiles.js');
        const { resolveSigner } = await import('../../signer/src/signer-resolver.js');
        const profileConfig = loadProfileConfig(profileName);
        if (profileConfig) {
          currentConfig = { ...context.config, ...profileConfig };
          const signerResult = await resolveSigner(currentConfig);
          signerPublicKey = signerResult.signer?.publicKey.toBase58();
        }
      } catch {
        // The guard should remain available even when signer resolution fails.
      }

      const walletGuard = buildWalletGuardSummary(currentConfig, {
        activeProfile: profileName,
        signerPublicKey,
      });
      return createX402PipelineResponse(JSON.stringify({
        serverRole: 'local-sap-payments-bridge',
        activeProfile: profileName,
        signerConfigured: Boolean(signerPublicKey),
        signerPublicKey,
        walletGuard,
        agentInstruction: 'Treat the local signer as a capability. Use sap_payments_readiness, sap_payments_call_paid_tool, sap_payments_finalize_transaction, sap_payments_register_agent, and sap_payments_update_agent. Do not read keypair files or create temporary signing scripts.',
      }, null, 2));
    },
  );
}

function registerPaymentsReadinessTool(server: Server, context: SapMcpContext): void {
  registerX402PipelineTool(
    server,
    context,
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
          walletGuard: { type: 'object', description: 'Capability-only local signer guardrails. No wallet path or keypair bytes are returned.' },
          balances: { type: 'object', description: 'SOL and USDC payment readiness when RPC checks are available.' },
          policy: { type: 'object', description: 'Local agent commerce policy limits used before autopay or value-moving operations.' },
          readiness: { type: 'object', description: 'Ready/degraded/not-ready result with issues and next action.' },
          agentInstruction: { type: 'string', description: 'Operational instruction for MCP agents.' },
        },
        required: ['hostedMcp', 'localBridge', 'profile', 'walletGuard', 'balances', 'policy', 'readiness', 'agentInstruction'],
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
      return createX402PipelineResponse(JSON.stringify(result, null, 2));
    },
  );
}

function registerPaymentsProcessStatusTool(server: Server, context: SapMcpContext): void {
  registerX402PipelineTool(
    server,
    context,
    'sap_payments_process_status',
    {
      title: 'Inspect Local Payment Bridge Process',
      description: 'Free local diagnostic for sap_payments process health. Shows the current bridge PID, profile/runtime lock, possible duplicate SAP MCP processes, and safe next action. Use this when paid-call settlement is slow, the bridge disappears, or an agent suspects stale/zombie bridge processes. This tool never kills processes and never reads keypair bytes.',
      inputSchema: {},
      outputSchema: {
        type: 'object',
        properties: {
          pid: { type: 'number', description: 'Current sap_payments bridge process id.' },
          ppid: { type: 'number', description: 'Parent process id, usually the agent runtime that spawned the stdio bridge.' },
          version: { type: 'string', description: 'SAP MCP package version running in this bridge.' },
          bridgeOnly: { type: 'boolean', description: 'Whether this process is running in sap_payments bridge-only mode.' },
          profileName: { type: 'string', description: 'Active or requested SAP MCP profile used for process lock scoping.' },
          runtimeId: { type: 'string', description: 'Runtime scope such as codex, hermes, claude, openclaw, or parent pid fallback.' },
          lock: { type: 'object', description: 'Profile/runtime process lock path and ownership status.' },
          processes: { type: 'object', description: 'Best-effort local process list for SAP MCP-looking node/npx processes.' },
          nextAction: { type: 'string', description: 'Safe operational next step for the agent.' },
        },
        required: ['pid', 'ppid', 'version', 'bridgeOnly', 'profileName', 'runtimeId', 'lock', 'processes', 'nextAction'],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => createX402PipelineResponse(JSON.stringify(getPaymentBridgeProcessStatus(), null, 2)),
  );
}

function registerPaymentsCallPaidTool(server: Server, context: SapMcpContext, name: 'sap_payments_call_paid_tool' | 'sap_x402_paid_call'): void {
  registerX402PipelineTool(
    server,
    context,
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

        // Pre-payment schema validation: check arguments against the local
        // tool registration store BEFORE paying the x402 challenge. This
        // prevents wasted USDC on calls with invalid schemas. If the tool is
        // not registered locally (hosted-only), validation is skipped.
        if (parsed.toolName && parsed.arguments && typeof parsed.arguments === 'object') {
          const validation = validateToolArguments(parsed.toolName, parsed.arguments);
          if (!validation.valid) {
            return createX402PipelineResponse(JSON.stringify({
              success: false,
              error: 'schema_validation_failed',
              message: 'Tool arguments do not match the expected schema. Payment was NOT charged.',
              toolName: parsed.toolName,
              errors: validation.errors,
              skipped: validation.skipped,
            }, null, 2), { isError: true });
          }
        }

        const result = await executeX402PaidCall(parsed);
        return createX402PipelineResponse(JSON.stringify(result, null, 2));
      } catch (error) {
        return createX402PipelineResponse(formatPaidCallError(error), { isError: true });
      }
    },
  );
}

function registerPaymentsPrepareChallengeTool(server: Server, context: SapMcpContext): void {
  registerX402PipelineTool(
    server,
    context,
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
          description: 'Maximum accepted x402 payment amount in USD. The call aborts if the challenge exceeds this cap. Common tool costs: micro-read ~$0.001, read-premium ~$0.002, builder ~$0.006, standard value-action ~$0.06, heavy value-action ~$0.035. Set to at least the expected tier price — e.g. maxPriceUsd: 0.08 for standard swaps, 0.05 for heavy private execution, 0.005 for reads. If omitted, defaults to a very low cap that may abort value-action calls silently.',
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
        return createX402PipelineResponse(JSON.stringify(result, null, 2));
      } catch (error) {
        return createX402PipelineResponse(formatPaidCallError(error), { isError: true });
      }
    },
  );
}

function registerPaymentsSignChallengeTool(server: Server, context: SapMcpContext): void {
  registerX402PipelineTool(
    server,
    context,
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
        return createX402PipelineResponse(JSON.stringify(result, null, 2));
      } catch (error) {
        return createX402PipelineResponse(formatPaidCallError(error), { isError: true });
      }
    },
  );
}

function registerPaymentsVerifyReceiptTool(server: Server, context: SapMcpContext): void {
  registerX402PipelineTool(
    server,
    context,
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
        return createX402PipelineResponse(JSON.stringify(result, null, 2));
      } catch (error) {
        return createX402PipelineResponse(formatPaidCallError(error), { isError: true });
      }
    },
  );
}

function registerPaymentsPrepaidBalanceTool(server: Server, context: SapMcpContext): void {
  registerX402PipelineTool(
    server,
    context,
    'sap_payments_prepaid_balance',
    {
      title: 'Check Prepaid Session Balance',
      description: 'FREE local tool that checks the remaining balance of a prepaid session. No x402 charge. Returns the session ID, remaining USD, total USD, per-call cost, expiry, and call count. Use this before calling sap_payments_call_paid_tool with prepaidSessionId to verify the session still has balance.',
      inputSchema: {
        sessionId: {
          type: 'string',
          description: 'Prepaid session ID returned by sap_payments_start_prepaid.',
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'The prepaid session ID checked.' },
          remainingUsd: { type: 'number', description: 'Remaining USDC balance in the session.' },
          totalUsd: { type: 'number', description: 'Original USDC amount deposited when the session was created.' },
          perCallCostUsd: { type: 'number', description: 'Cost deducted per granted call.' },
          expiresAt: { type: 'string', description: 'ISO timestamp when the session expires.' },
          callCount: { type: 'number', description: 'Number of calls made using this session.' },
        },
        required: ['sessionId', 'remainingUsd', 'totalUsd', 'perCallCostUsd', 'expiresAt', 'callCount'],
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
        const record = input as Record<string, unknown> | undefined;
        const sessionId = record?.sessionId;
        if (!sessionId || typeof sessionId !== 'string') {
          return createX402PipelineResponse(JSON.stringify({
            success: false,
            error: 'sessionId is required.',
          }, null, 2), { isError: true });
        }

        const store = getGlobalPrepaidStore();
        const credit = store.getBalance(sessionId);
        if (!credit) {
          return createX402PipelineResponse(JSON.stringify({
            success: false,
            error: 'session_not_found_or_expired',
            sessionId,
            message: 'No active prepaid session found with this ID, or the session has expired.',
          }, null, 2), { isError: true });
        }

        return createX402PipelineResponse(JSON.stringify({
          success: true,
          sessionId: credit.sessionId,
          remainingUsd: credit.remainingUsd,
          totalUsd: credit.totalUsd,
          perCallCostUsd: credit.perCallCostUsd,
          expiresAt: credit.expiresAt,
          callCount: credit.callCount,
        }, null, 2));
      } catch (error) {
        return createX402PipelineResponse(JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }, null, 2), { isError: true });
      }
    },
  );
}

function registerPaymentsStartPrepaidTool(server: Server, context: SapMcpContext): void {
  registerX402PipelineTool(
    server,
    context,
    'sap_payments_start_prepaid',
    {
      title: 'Start Prepaid Payment Session',
      description: 'FREE local tool that creates a prepaid session by paying a funding amount via the hosted x402 bridge. It calls the hosted sap_payments_fund_prepaid tool through the x402 paid-call bridge (paying the specified amountUsd), and returns the prepaid session ID. The agent then passes this sessionId as prepaidSessionId to future sap_payments_call_paid_tool calls to avoid per-call 402 challenges. This tool itself is free (no local charge), but it triggers a hosted x402 payment for the funding amount. Requires confirm: true.',
      inputSchema: {
        amountUsd: {
          type: 'number',
          description: 'Total USDC to deposit into the prepaid session. This is the amount that will be charged via x402 to fund the session.',
        },
        perCallCostUsd: {
          type: 'number',
          description: 'Cost deducted from the prepaid balance per granted call. Defaults to 0.015 USD.',
        },
        maxPriceUsd: {
          type: 'number',
          description: 'Per-call safety cap for the x402 funding payment. Should be at least amountUsd. Defaults to amountUsd * 1.5.',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true. Confirms the user allows this tool to trigger a hosted x402 payment for the funding amount.',
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', description: 'Whether the prepaid session was created successfully.' },
          sessionId: { type: 'string', description: 'Prepaid session ID to pass as prepaidSessionId to sap_payments_call_paid_tool.' },
          amountUsd: { type: 'number', description: 'Total USDC deposited into the session.' },
          perCallCostUsd: { type: 'number', description: 'Cost per call deducted from the session balance.' },
          maxPriceUsd: { type: 'number', description: 'Per-call cap used for the funding x402 payment.' },
          hostedResult: { type: 'object', description: 'Full result from the hosted sap_payments_fund_prepaid tool call.' },
          agentInstruction: { type: 'string', description: 'How to use the returned sessionId with sap_payments_call_paid_tool.' },
        },
        required: ['success', 'sessionId', 'amountUsd', 'perCallCostUsd', 'agentInstruction'],
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
        const record = input as Record<string, unknown> | undefined;
        if (!record || record.confirm !== true) {
          return createX402PipelineResponse(JSON.stringify({
            success: false,
            error: 'confirm: true is required to start a prepaid session (it triggers a hosted x402 payment).',
          }, null, 2), { isError: true });
        }

        const amountUsd = record.amountUsd;
        if (typeof amountUsd !== 'number' || !Number.isFinite(amountUsd) || amountUsd <= 0) {
          return createX402PipelineResponse(JSON.stringify({
            success: false,
            error: 'amountUsd must be a positive number.',
          }, null, 2), { isError: true });
        }

        const perCallCostUsd = typeof record.perCallCostUsd === 'number' && Number.isFinite(record.perCallCostUsd) && record.perCallCostUsd > 0
          ? record.perCallCostUsd
          : 0.015;

        const maxPriceUsd = typeof record.maxPriceUsd === 'number' && Number.isFinite(record.maxPriceUsd) && record.maxPriceUsd > 0
          ? record.maxPriceUsd
          : Math.max(amountUsd * 1.5, amountUsd + 0.01);

        // Call the hosted sap_payments_fund_prepaid tool via the x402 bridge
        const fundResult = await executeX402PaidCall({
          toolName: 'sap_payments_fund_prepaid',
          arguments: {
            amountUsd,
            perCallCostUsd,
          },
          maxPriceUsd,
          confirm: true,
        });

        if (!fundResult.success) {
          return createX402PipelineResponse(JSON.stringify({
            success: false,
            error: 'Hosted sap_payments_fund_prepaid call failed.',
            hostedResult: fundResult,
          }, null, 2), { isError: true });
        }

        const sessionId = extractHostedPrepaidSessionId(fundResult.response);

        if (!sessionId) {
          return createX402PipelineResponse(JSON.stringify({
            success: false,
            error: 'Hosted sap_payments_fund_prepaid did not return a sessionId.',
            hostedResult: fundResult,
          }, null, 2), { isError: true });
        }

        return createX402PipelineResponse(JSON.stringify({
          success: true,
          sessionId,
          amountUsd,
          perCallCostUsd,
          maxPriceUsd,
          hostedResult: fundResult,
          agentInstruction: `Pass this sessionId as prepaidSessionId to sap_payments_call_paid_tool for future calls. The server will check the prepaid balance and grant access without per-call 402 challenges. Use sap_payments_prepaid_balance to check remaining balance. Each call deducts ${perCallCostUsd} USD from the ${amountUsd} USD deposit.`,
        }, null, 2));
      } catch (error) {
        return createX402PipelineResponse(formatPaidCallError(error), { isError: true });
      }
    },
  );
}

function extractHostedPrepaidSessionId(response: unknown): string | undefined {
  const direct = extractSessionIdFromRecord(response);
  if (direct) return direct;

  if (!response || typeof response !== 'object') {
    return undefined;
  }

  const record = response as Record<string, unknown>;
  const result = record['result'];
  const resultDirect = extractSessionIdFromRecord(result);
  if (resultDirect) return resultDirect;

  const structuredContent = result && typeof result === 'object'
    ? (result as Record<string, unknown>)['structuredContent']
    : undefined;
  const structuredDirect = extractSessionIdFromRecord(structuredContent);
  if (structuredDirect) return structuredDirect;

  const content = result && typeof result === 'object'
    ? (result as Record<string, unknown>)['content']
    : undefined;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (!item || typeof item !== 'object') continue;
      const text = (item as Record<string, unknown>)['text'];
      if (typeof text !== 'string') continue;
      try {
        const parsed = JSON.parse(text) as unknown;
        const parsedSessionId = extractSessionIdFromRecord(parsed);
        if (parsedSessionId) return parsedSessionId;
      } catch {
        // Non-JSON text content is normal for some MCP tools.
      }
    }
  }

  return undefined;
}

function extractSessionIdFromRecord(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of ['sessionId', 'id']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * @name registerPaymentsFundPrepaidTool
 * @description Registers the hosted sap_payments_fund_prepaid tool. This tool
 * is PAID (x402 charge applies — the funding payment IS the deposit). After
 * the x402 settlement, it creates a PrepaidCreditStore session and returns
 * the session ID. The agent then passes this ID as prepaidSessionId to
 * sap_payments_call_paid_tool for per-call access without 402 challenges.
 * @internal
 */
function registerPaymentsFundPrepaidTool(server: Server, context: SapMcpContext): void {
  registerX402PipelineTool(
    server,
    context,
    'sap_payments_fund_prepaid',
    {
      title: 'Fund Prepaid Payment Session',
      description: 'Hosted paid tool that creates a prepaid session. The x402 charge for this tool IS the funding deposit. After settlement, creates a prepaid credit session with the specified amount and per-call cost. Returns sessionId, remainingUsd, and expiresAt. Pass the returned sessionId as prepaidSessionId to sap_payments_call_paid_tool for future calls to bypass per-call 402 challenges (x402 Lifecycle Hooks grantAccess pattern).',
      inputSchema: {
        type: 'object',
        properties: {
          amountUsd: {
            type: 'number',
            description: 'Total USDC to deposit into the prepaid session. This amount is charged via x402 when calling this tool.',
            minimum: 0.01,
          },
          perCallCostUsd: {
            type: 'number',
            description: 'Cost deducted from the prepaid balance per granted call. Defaults to 0.015 USD.',
            minimum: 0.001,
          },
          ttlHours: {
            type: 'number',
            description: 'Session TTL in hours. Defaults to 24.',
            minimum: 1,
            maximum: 168,
          },
        },
        required: ['amountUsd'],
        additionalProperties: false,
      },
    },
    async (input: unknown) => {
      try {
        const record = input as Record<string, unknown> | undefined;
        if (!record) {
          return createX402PipelineResponse(JSON.stringify({ error: 'Invalid input' }, null, 2), { isError: true });
        }
        const amountUsd = Number(record['amountUsd']);
        if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
          return createX402PipelineResponse(JSON.stringify({ error: 'amountUsd must be a positive number' }, null, 2), { isError: true });
        }
        const perCallCostUsd = typeof record['perCallCostUsd'] === 'number' && Number.isFinite(record['perCallCostUsd'])
          ? Number(record['perCallCostUsd'])
          : 0.015;
        const ttlHours = typeof record['ttlHours'] === 'number' && Number.isFinite(record['ttlHours'])
          ? Number(record['ttlHours'])
          : 24;

        // Create the prepaid session. The wallet address comes from the
        // x402 settlement payer — but since we don't have direct access to
        // the settlement result here, we use a generated UUID as wallet
        // identifier. The server-side prepaid store keys by sessionId, not
        // wallet, so this is fine for the grantAccess flow.
        const session = getGlobalPrepaidStore().createSession(
          'x402-payer', // wallet placeholder — the x402 settlement has the real payer
          amountUsd,
          perCallCostUsd,
          ttlHours,
        );

        return createX402PipelineResponse(JSON.stringify({
          success: true,
          sessionId: session.sessionId,
          wallet: session.wallet,
          totalUsd: session.totalUsd,
          remainingUsd: session.remainingUsd,
          perCallCostUsd: session.perCallCostUsd,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          callCount: session.callCount,
          agentInstruction: `Pass sessionId as prepaidSessionId to sap_payments_call_paid_tool. Each call deducts ${perCallCostUsd} USD. Balance: ${amountUsd} USD. Expires: ${session.expiresAt}.`,
        }, null, 2));
      } catch (error) {
        return createX402PipelineResponse(JSON.stringify({
          error: 'Failed to create prepaid session',
          message: error instanceof Error ? error.message : String(error),
        }, null, 2), { isError: true });
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
    prepaidSessionId: typeof record.prepaidSessionId === 'string' ? record.prepaidSessionId : undefined,
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

function parseUpdateAgentInput(input: unknown): PaymentsUpdateAgentToolInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('sap_payments_update_agent requires an input object.');
  }

  const record = input as PaymentsUpdateAgentToolInput;
  if (record.confirm !== true) {
    throw new Error('confirm: true is required to submit a local SAP registry update transaction.');
  }

  const hasUpdate = [
    'name',
    'description',
    'capabilities',
    'pricing',
    'protocols',
    'agentId',
    'agentUri',
    'metadataUri',
    'x402Endpoint',
  ].some((key) => Object.prototype.hasOwnProperty.call(record, key));
  if (!hasUpdate) {
    throw new Error('At least one update field is required: name, description, capabilities, pricing, protocols, agentId, agentUri/metadataUri, or x402Endpoint.');
  }

  return record;
}

function summarizeAgentUpdate(args: ReturnType<typeof parseUpdateAgentArgs>): Record<string, unknown> {
  return {
    name: args.name,
    description: args.description,
    agentId: args.agentId,
    agentUri: args.agentUri,
    x402Endpoint: args.x402Endpoint,
    protocols: args.protocols,
    capabilityCount: args.capabilities?.length ?? null,
    pricingTierCount: args.pricing?.length ?? null,
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
    confirmationTimeoutMs: record.confirmationTimeoutMs,
    commitment: record.commitment,
    submitViaRelay: record.submitViaRelay !== false,
    submitRelayUrl: record.submitRelayUrl,
    confirm: record.confirm === true,
    signerProfile: typeof record.signerProfile === 'string' ? record.signerProfile : undefined,
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
    agentInstruction: 'For SAP agent registration or profile updates from hosted-user setups, call sap_payments_register_agent or sap_payments_update_agent from the local sap_payments bridge. Do not retry hosted sap_register_agent/sap_update_agent after hosted_local_signer_required, and do not create temporary signing scripts or read keypair JSON.',
    nextAction: signerMissing
      ? 'Call sap_payments_readiness. If signerConfigured is false, run the SAP MCP wizard full setup or repair flow and restart the agent runtime.'
      : 'Check the registry fields, local profile, SOL fee balance, and SAP program/RPC status. Retry the matching sap_payments registry tool only after explicit user confirmation.',
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
    agentInstruction: 'Do not create temporary signing scripts, do not read keypair JSON, and do not call hosted sap_sign_transaction for user-owned signatures. Use sap_payments_finalize_transaction from the local sap_payments bridge. For submit:true, prefer the default hosted submit relay unless the user explicitly requests local RPC submission.',
    nextAction: 'Call sap_payments_readiness. If the local signer is ready, retry sap_payments_finalize_transaction with confirm: true, submit: true, and the same transaction only when retrySafe is true or the prior attempt never submitted. If readiness says missing bridge or signer, run the wizard repair flow.',
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
