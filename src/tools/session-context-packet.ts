/**
 * @module session-context-packet
 * @description Agent-native SAP MCP session context and action planning helpers.
 */

import { MCP_SERVER_VERSION } from '../core/constants.js';
import type { SapMcpContext } from '../core/types.js';

const HOSTED_MCP_URL = 'https://mcp.sap.oobeprotocol.ai/mcp';

export type SapAgentIntent =
  | 'connection'
  | 'paid-call'
  | 'registry-write'
  | 'update-agent'
  | 'transaction-finalize'
  | 'escrow'
  | 'identity'
  | 'swap'
  | 'external-x402'
  | 'premium-stream'
  | 'balance'
  | 'discovery'
  | 'general';

export interface SapActionPrepInput {
  intent: SapAgentIntent;
  toolName?: string;
  userGoal?: string;
  maxPriceUsd?: number;
  estimatedNotionalUsd?: number;
  hasUnsignedTransaction?: boolean;
  hasSubmittedSignature?: boolean;
}

export function normalizeSapAgentIntent(value: unknown): SapAgentIntent {
  if (typeof value !== 'string') return 'general';
  if ([
    'connection',
    'paid-call',
    'registry-write',
    'update-agent',
    'transaction-finalize',
    'escrow',
    'identity',
    'swap',
    'external-x402',
    'premium-stream',
    'balance',
    'discovery',
    'general',
  ].includes(value)) {
    return value as SapAgentIntent;
  }
  return 'general';
}

export function buildSessionContextPacket(
  context: SapMcpContext,
  intent: SapAgentIntent = 'general',
  goal?: string,
): Record<string, unknown> {
  const hostedMode = context.config.mode === 'hosted-api';
  const signerConfigured = Boolean(context.signer || context.config.walletPath || context.config.externalSignerUrl);

  return {
    schemaVersion: 1,
    serverVersion: MCP_SERVER_VERSION,
    intent,
    goal: goal ?? null,
    mode: hostedMode ? 'hosted_plus_local_payments_expected' : context.config.mode,
    hosted: {
      endpoint: HOSTED_MCP_URL,
      ready: true,
      accountModel: hostedMode ? 'accountless-non-custodial' : 'local-or-delegated',
      canSeeUserLocalProfile: !hostedMode,
      signerConfiguredOnThisServer: signerConfigured,
      rule: hostedMode
        ? 'Hosted SAP MCP serves reads, paid hosted tools, unsigned builders, and routing guards. It cannot see local wallet paths or sign user-owned writes.'
        : 'This SAP MCP process can use its configured local/delegated signer according to policy.',
    },
    localBridge: {
      namespace: 'sap_payments',
      expectedForHostedUsers: hostedMode,
      readinessTool: 'sap_payments_readiness',
      profileTool: 'sap_payments_profile_current',
      paidCallTool: 'sap_payments_call_paid_tool',
      externalX402Tool: 'sap_payments_call_external_x402',
      registerAgentTool: 'sap_payments_register_agent',
      updateAgentTool: 'sap_payments_update_agent',
      finalizeTool: 'sap_payments_finalize_transaction',
      verifyReceiptTool: 'sap_payments_verify_receipt',
      rule: 'If this namespace is missing in the agent runtime, run sap_runtime_repair_plan or the wizard repair flow, then restart the runtime before paid/write workflows.',
    },
    dataFreshness: {
      neverCacheAsTruth: [
        'token prices',
        'Jupiter quotes and orders',
        'balances',
        'blockhashes',
        'transaction simulation results',
        'agent account state',
        'liquidity and route availability',
      ],
      sessionMemoryCanStore: [
        'active profile name and wallet public key after sap_payments_readiness',
        'user goal and policy limits',
        'runtime namespace availability',
        'correct tool schemas and canonical field names',
        'x402 receipts and settlement signatures',
        'submitted transaction signatures and final status',
        'known error classification and safe next tool',
      ],
      rule: 'Use memory for operational context and audit, not for fresh market/on-chain truth. Re-fetch fresh data before payment, signing, and final user claims.',
    },
    recommendedFlows: {
      connection: ['sap_agent_start', 'sap_agent_runtime_status'],
      bootstrap: ['sap_quick_context', 'sap_skills_bundle'],
      paidHostedTool: ['sap_estimate_tool_cost', 'sap_payments_readiness', 'sap_payments_call_paid_tool'],
      registryWrite: ['sap_agent_identity_plan', 'sap_payments_readiness', 'sap_payments_register_agent or sap_payments_update_agent'],
      unsignedTransaction: ['hosted builder tool', 'sap_payments_finalize_transaction'],
      escrowV2: ['sap_protocol_invariants', 'sap_escrow_build_*_transaction', 'sap_payments_finalize_transaction'],
      externalX402Agent: ['sap_get_agent_profile', 'sap_payments_call_external_x402'],
      premiumStream: ['sap_premium_plugin_catalog', 'sap_premium_session_start', 'sap_premium_activate_session', 'GET /premium/stream/:sessionId'],
      proofTape: ['sap_audit_record when local memory is available', 'return receipts/signatures/final state in user summary'],
    },
    proofTapeTemplate: buildProofTapeTemplate(intent),
    stopConditions: [
      'Stop before retrying if a transaction signature has already been submitted and status is unknown.',
      'Stop when a quote/order is expired; create a fresh quote/order instead of signing stale bytes.',
      'Stop when hosted_local_signer_required appears; route to sap_payments_* or a hosted unsigned builder, not another hosted direct write.',
      'Stop when sap_payments is missing; repair and restart the runtime.',
      'Stop when a payment challenge exceeds user policy or maxPriceUsd.',
    ],
    forbiddenActions: [
      'Do not read or print keypair JSON.',
      'Do not create temporary signing scripts.',
      'Do not hand-roll hosted SAP MCP x402 headers when sap_payments_call_paid_tool is available.',
      'Do not infer local profile state from hosted sap_profile_current.',
      'Do not use memory as a price, balance, or quote source of truth.',
    ],
  };
}

export function buildActionPreparation(
  context: SapMcpContext,
  input: SapActionPrepInput,
): Record<string, unknown> {
  const intent = input.intent;
  const maxPriceUsd = typeof input.maxPriceUsd === 'number' && Number.isFinite(input.maxPriceUsd)
    ? input.maxPriceUsd
    : undefined;

  return {
    success: true,
    intent,
    userGoal: input.userGoal ?? null,
    toolName: input.toolName ?? null,
    sessionContextPacket: buildSessionContextPacket(context, intent, input.userGoal),
    freshDataRequired: freshDataForIntent(intent),
    freePreflightTools: freePreflightToolsForIntent(intent),
    paidOrWriteRoute: paidRouteForIntent(intent, input.toolName),
    maxPricePolicy: {
      userProvidedMaxPriceUsd: maxPriceUsd ?? null,
      recommendedBeforePaidCall: 'Call sap_estimate_tool_cost for the exact hosted tier. Use maxPriceUsd >= estimate * 1.25, then let the x402 challenge be the final price source of truth.',
      estimatedNotionalUsd: input.estimatedNotionalUsd ?? null,
    },
    confirmationPolicy: confirmationPolicyForIntent(intent, input.estimatedNotionalUsd),
    proofTapeTemplate: buildProofTapeTemplate(intent),
    nextToolCalls: nextToolCallsForIntent(intent, input),
    retryRules: {
      transientRpc: 'Retry with a fresh challenge/blockhash only if no transaction signature was submitted.',
      paymentRequired: 'Route through sap_payments_call_paid_tool; do not treat the x402 challenge as a server failure.',
      submittedSignature: 'Verify status before retrying. Do not create duplicate writes.',
      hostedLocalSignerRequired: 'Switch to sap_payments_* or hosted unsigned builder finalization. Do not retry hosted direct write.',
    },
    userFacingPreviewShape: [
      'intent',
      'wallet/profile used when known',
      'fresh quote/balance source',
      'estimated x402 fee',
      'network/trading fee if applicable',
      'minimum received or expected result when applicable',
      'route/tool path',
      'confirmation required yes/no',
    ],
  };
}

function freshDataForIntent(intent: SapAgentIntent): string[] {
  switch (intent) {
    case 'swap':
      return ['wallet SOL/USDC balance', 'fresh quote/order', 'lastValidBlockHeight', 'slippage/minimum received'];
    case 'balance':
      return ['native SOL balance', 'SPL token accounts', 'mint metadata if symbol/name is needed'];
    case 'registry-write':
    case 'update-agent':
    case 'identity':
      return ['current agent account/profile', 'public metadata URI reachability', 'protocol invariants'];
    case 'escrow':
      return ['agent profile/pricing', 'escrow PDA status', 'token balance/allowance', 'V2 settlement security'];
    case 'premium-stream':
      return ['premium catalog provider readiness', 'session status', 'remaining quota'];
    default:
      return ['current hosted runtime status', 'local bridge readiness when paid/write work is planned'];
  }
}

function freePreflightToolsForIntent(intent: SapAgentIntent): string[] {
  const base = ['sap_agent_runtime_status', 'sap_agent_next_action'];
  switch (intent) {
    case 'connection':
      return ['sap_agent_start', 'sap_agent_runtime_status'];
    case 'paid-call':
      return [...base, 'sap_estimate_tool_cost', 'sap_payments_readiness'];
    case 'registry-write':
    case 'update-agent':
    case 'identity':
      return [...base, 'sap_agent_identity_plan', 'sap_protocol_invariants', 'sap_payments_readiness'];
    case 'swap':
      return [...base, 'sol_get_balance', 'spl-token_getTokenAccounts', 'sap_estimate_tool_cost', 'sap_payments_readiness'];
    case 'escrow':
      return [...base, 'sap_protocol_invariants', 'sap_estimate_tool_cost', 'sap_payments_readiness'];
    case 'premium-stream':
      return [...base, 'sap_premium_plugin_catalog', 'sap_premium_session_start'];
    case 'discovery':
      return ['sap_agent_context', 'sap_get_agent', 'sap_get_agent_profile', 'sap_list_agents with compact pagination'];
    default:
      return [...base, 'sap_quick_context'];
  }
}

function paidRouteForIntent(intent: SapAgentIntent, toolName?: string): Record<string, unknown> {
  if (intent === 'registry-write') {
    return { route: 'local sap_payments_register_agent', payment: 'no hosted x402 fee', tool: 'sap_payments_register_agent' };
  }
  if (intent === 'update-agent') {
    return { route: 'local sap_payments_update_agent', payment: 'no hosted x402 fee', tool: 'sap_payments_update_agent' };
  }
  if (intent === 'external-x402') {
    return { route: 'local sap_payments_call_external_x402', payment: 'external endpoint x402', tool: 'sap_payments_call_external_x402' };
  }
  if (intent === 'transaction-finalize') {
    return { route: 'local sap_payments_finalize_transaction', payment: 'no hosted x402 unless builder was paid separately', tool: 'sap_payments_finalize_transaction' };
  }
  if (intent === 'premium-stream') {
    return { route: 'session plan -> paid activation -> stream/webhook', payment: 'x402/pay.sh session or event pricing', tool: 'sap_premium_session_start' };
  }
  return { route: 'hosted tool through local sap_payments_call_paid_tool when x402 is required', payment: 'hosted x402', tool: toolName ?? 'sap_payments_call_paid_tool' };
}

function confirmationPolicyForIntent(intent: SapAgentIntent, notionalUsd?: number): Record<string, unknown> {
  const highValue = typeof notionalUsd === 'number' && notionalUsd >= 10;
  return {
    required: ['swap', 'escrow', 'registry-write', 'update-agent', 'transaction-finalize', 'identity'].includes(intent) || highValue,
    reason: highValue
      ? 'Estimated notional is at or above the default fast-mode threshold.'
      : 'Confirmation is required for writes/value-moving actions and optional for read-only discovery.',
    fastModeSuggestion: 'Auto-pay tiny x402 reads only when local policy allows it; require confirmation for registry writes, swaps, escrow, SNS, NFTs, and any transaction signing.',
  };
}

function nextToolCallsForIntent(intent: SapAgentIntent, input: SapActionPrepInput): Array<Record<string, unknown>> {
  if (input.hasSubmittedSignature) {
    return [{ namespace: 'local sap_payments', tool: 'sap_payments_finalize_transaction', arguments: { verifyOnly: true }, reason: 'A signature exists; verify before retrying.' }];
  }
  if (input.hasUnsignedTransaction || intent === 'transaction-finalize') {
    return [{ namespace: 'local sap_payments', tool: 'sap_payments_finalize_transaction', arguments: { submit: true, confirm: true }, reason: 'Sign locally and submit already-built transaction bytes.' }];
  }
  switch (intent) {
    case 'registry-write':
      return [{ namespace: 'local sap_payments', tool: 'sap_payments_register_agent', arguments: { confirm: true }, reason: 'Canonical non-custodial registry creation path.' }];
    case 'update-agent':
      return [{ namespace: 'local sap_payments', tool: 'sap_payments_update_agent', arguments: { confirm: true }, reason: 'Canonical non-custodial agent profile update path.' }];
    case 'paid-call':
    case 'swap':
      return [{ namespace: 'local sap_payments', tool: 'sap_payments_call_paid_tool', arguments: { toolName: input.toolName ?? '<hosted-tool>', maxPriceUsd: input.maxPriceUsd ?? '<estimate*1.25>' }, reason: 'Resolve x402 and replay the hosted tool with a fresh payment.' }];
    case 'premium-stream':
      return [{ namespace: 'hosted sap', tool: 'sap_premium_session_start', arguments: {}, reason: 'Create a bounded unpaid session plan before x402 activation.' }];
    case 'external-x402':
      return [{ namespace: 'local sap_payments', tool: 'sap_payments_call_external_x402', arguments: {}, reason: 'Pay an external agent endpoint without exposing keypair bytes.' }];
    default:
      return [{ namespace: 'hosted sap', tool: 'sap_agent_runtime_status', arguments: { intent }, reason: 'Confirm routing before selecting tools.' }];
  }
}

function buildProofTapeTemplate(intent: SapAgentIntent): Record<string, unknown> {
  return {
    intentId: 'agent-generated stable id for this user request',
    intent,
    profile: 'local profile name when known; never keypair bytes',
    wallet: 'public key only',
    toolCalls: 'ordered list of free/paid tools called',
    x402Receipts: 'payment signatures and settlement receipts when paid calls occur',
    transactionSignatures: 'submitted Solana signatures and final confirmation status',
    finalStateChecks: 'fresh reads proving the result after execution',
    retryCount: 0,
    errors: 'normalized errors plus sap_agent_next_action classification',
  };
}
