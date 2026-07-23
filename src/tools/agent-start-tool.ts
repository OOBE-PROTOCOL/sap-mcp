/**
 * @module agent-start-tool
 * @description Free bootstrap tool that teaches agents how to activate SAP MCP correctly.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerTool } from '../adapters/mcp/sdk-compat.js';
import { createStructuredJsonResponse } from '../adapters/mcp/tool-response.js';
import { MCP_SERVER_VERSION } from '../core/constants.js';
import type { SapMcpContext } from '../core/types.js';
import { buildPricingCatalog } from '../payments/pricing.js';

const HOSTED_MCP_URL = 'https://mcp.sap.oobeprotocol.ai/mcp';
const NPM_PACKAGE = `@oobe-protocol-labs/sap-mcp-server@${MCP_SERVER_VERSION}`;
const REPAIR_COMMAND = `npm exec --yes --package ${NPM_PACKAGE} -- sap-mcp-config repair`;
const WIZARD_COMMAND = `npm exec --yes --package ${NPM_PACKAGE} -- sap-mcp-config wizard`;

/**
 * @name registerAgentStartTool
 * @description Registers the SAP MCP startup playbook as a free read-only tool.
 */
export function registerAgentStartTool(server: Server, context: SapMcpContext): void {
  registerTool(
    server,
    'sap_agent_start',
    {
      title: 'Start SAP MCP Agent Mode',
      description: 'Return the concise startup playbook for agents using SAP MCP. Call this when the user says "Start SAP MCP", "Initialize SAP MCP", "Load SAP", or asks what SAP MCP can do.',
      inputSchema: {
        goal: {
          type: 'string',
          description: 'Optional user goal to tailor the startup plan, such as "register an agent", "check wallet balance", or "swap tokens".',
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', description: 'Whether the bootstrap instructions were generated.' },
          activationPhrases: {
            type: 'array',
            description: 'Short user phrases that should trigger this bootstrap behavior.',
            items: { type: 'string' },
          },
          hostedEndpoint: { type: 'string', description: 'Canonical hosted SAP MCP endpoint.' },
          serverMode: { type: 'string', description: 'Current SAP MCP server mode.' },
          immediateToolCalls: {
            type: 'array',
            description: 'Tool calls the agent should run first when available.',
            items: { type: 'object' },
          },
          paymentFlow: { type: 'object', description: 'How to handle hosted x402/pay.sh paid calls safely.' },
          connectionCheck: { type: 'object', description: 'How agents should answer simple connection/status questions.' },
          userFacingSummary: { type: 'string', description: 'Short text the agent can show the user after startup.' },
          repairCommand: { type: 'string', description: 'Wizard command to repair local hosted/profile/payment bridge setup.' },
        },
        required: ['success', 'activationPhrases', 'hostedEndpoint', 'serverMode', 'immediateToolCalls', 'paymentFlow', 'connectionCheck', 'userFacingSummary', 'repairCommand'],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input: unknown) => {
      const goal = parseGoal(input);
      return createStructuredJsonResponse(buildAgentStartPayload(context, goal));
    },
  );

  registerTool(
    server,
    'sap_agent_runtime_status',
    {
      title: 'Check SAP MCP Runtime Status',
      description: 'Free machine-readable readiness and routing summary for SAP MCP. Use this for "are you connected?", paid/write readiness, local profile visibility, and exact next actions without dumping the whole tool catalog.',
      inputSchema: {
        intent: {
          type: 'string',
          enum: ['connection', 'paid-call', 'registry-write', 'transaction-finalize', 'escrow', 'identity', 'general'],
          description: 'Optional user intent so the status can highlight the correct next tool path.',
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', description: 'Whether runtime status was generated.' },
          intent: { type: 'string', description: 'Status intent used for routing.' },
          hosted: { type: 'object', description: 'Observable hosted SAP MCP status for this server process.' },
          localBridge: { type: 'object', description: 'Expected local sap_payments bridge status and verification tools.' },
          routing: { type: 'object', description: 'Canonical tool routes for reads, paid calls, writes, and unsigned transactions.' },
          nextToolCalls: { type: 'array', description: 'Exact next tool calls agents should make when available.', items: { type: 'object' } },
          userFacingSummary: { type: 'string', description: 'Short summary safe to show to the user.' },
          forbiddenActions: { type: 'array', description: 'Actions agents must not perform.', items: { type: 'string' } },
        },
        required: ['success', 'intent', 'hosted', 'localBridge', 'routing', 'nextToolCalls', 'userFacingSummary', 'forbiddenActions'],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input: unknown) => {
      const intent = parseStatusIntent(input);
      return createStructuredJsonResponse(buildRuntimeStatusPayload(context, intent));
    },
  );

  registerTool(
    server,
    'sap_pricing_catalog',
    {
      title: 'Get SAP MCP Pricing Catalog',
      description: 'Free machine-readable x402/pay.sh pricing catalog generated from the hosted SAP MCP pricing registry. Use before paid calls to understand free, read-premium, builder, value-action, and batch tiers.',
      inputSchema: {},
      outputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Pricing catalog source identifier.' },
          version: { type: 'number', description: 'Pricing catalog schema version.' },
          strictTools: { type: 'boolean', description: 'Whether strict hosted tool pricing is enabled.' },
          currency: { type: 'string', description: 'Display currency for USD-denominated prices.' },
          tiers: { type: 'object', description: 'Tier pricing rules and examples.' },
          toolSets: { type: 'object', description: 'Current built-in tool sets for each tier.' },
          runtimeRules: { type: 'array', description: 'Agent routing rules for paid and write flows.', items: { type: 'string' } },
        },
        required: ['source', 'version', 'strictTools', 'currency', 'tiers', 'toolSets', 'runtimeRules'],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => createStructuredJsonResponse({ ...buildPricingCatalog(context.config.monetization) }),
  );

  registerTool(
    server,
    'sap_agent_next_action',
    {
      title: 'Resolve SAP MCP Next Action',
      description: 'Free routing resolver for SAP MCP errors and partial results. Use this before retrying after payment_required, hosted_local_signer_required, BlockhashNotFound, missing sap_payments, timeout, or a submitted signature that has not confirmed.',
      inputSchema: {
        intent: {
          type: 'string',
          enum: ['connection', 'paid-call', 'registry-write', 'transaction-finalize', 'escrow', 'identity', 'general'],
          description: 'Current user intent or workflow area.',
        },
        toolName: {
          type: 'string',
          description: 'Tool that produced the error or partial result, for example sap_register_agent, sap_update_agent, or sap_create_escrow_v2.',
        },
        errorCode: {
          type: 'string',
          description: 'Machine error code when available, for example hosted_local_signer_required, payment_required, BlockhashNotFound, or expired_or_not_landed.',
        },
        errorMessage: {
          type: 'string',
          description: 'Human or structured error message returned by the runtime, hosted server, local bridge, or wallet/RPC layer.',
        },
        hasSignature: {
          type: 'boolean',
          description: 'True when a transaction signature was already produced or submitted. This prevents unsafe duplicate retries.',
        },
        paymentRequired: {
          type: 'boolean',
          description: 'True when the previous response was an x402/pay.sh payment challenge.',
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', description: 'Whether the resolver produced guidance.' },
          classification: { type: 'string', description: 'Normalized error or routing classification.' },
          retryable: { type: 'boolean', description: 'Whether the underlying issue can generally be retried.' },
          safeToRetryNow: { type: 'boolean', description: 'Whether the agent should retry immediately without risking duplicate writes or duplicate user charges.' },
          paymentCharged: { type: 'string', description: 'Best-effort payment status: no, unknown, possible, or yes.' },
          nextTool: { type: 'string', description: 'Exact preferred next SAP MCP tool, or null when user/runtime action is needed.' },
          nextAction: { type: 'string', description: 'Concrete next action for the agent.' },
          userMessage: { type: 'string', description: 'Short user-facing explanation.' },
          forbiddenActions: { type: 'array', description: 'Actions the agent must not take for this case.', items: { type: 'string' } },
        },
        required: ['success', 'classification', 'retryable', 'safeToRetryNow', 'paymentCharged', 'nextTool', 'nextAction', 'userMessage', 'forbiddenActions'],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input: unknown) => createStructuredJsonResponse(buildAgentNextActionPayload(parseNextActionInput(input))),
  );
}

function parseGoal(input: unknown): string | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return undefined;
  }
  const goal = (input as Record<string, unknown>).goal;
  return typeof goal === 'string' && goal.trim().length > 0 ? goal.trim() : undefined;
}

function parseStatusIntent(input: unknown): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return 'general';
  }
  const intent = (input as Record<string, unknown>).intent;
  if (typeof intent !== 'string') {
    return 'general';
  }
  if (['connection', 'paid-call', 'registry-write', 'transaction-finalize', 'escrow', 'identity', 'general'].includes(intent)) {
    return intent;
  }
  return 'general';
}

interface NextActionInput {
  intent: string;
  toolName?: string;
  errorCode?: string;
  errorMessage?: string;
  hasSignature: boolean;
  paymentRequired: boolean;
}

function parseNextActionInput(input: unknown): NextActionInput {
  const record = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  return {
    intent: parseStatusIntent(record),
    toolName: readOptionalString(record.toolName),
    errorCode: readOptionalString(record.errorCode),
    errorMessage: readOptionalString(record.errorMessage),
    hasSignature: record.hasSignature === true,
    paymentRequired: record.paymentRequired === true,
  };
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function buildAgentNextActionPayload(input: NextActionInput): Record<string, unknown> {
  const combined = `${input.toolName ?? ''} ${input.errorCode ?? ''} ${input.errorMessage ?? ''}`.toLowerCase();
  const toolName = input.toolName?.toLowerCase() ?? '';
  const baseForbidden = [
    'Do not read or print keypair JSON.',
    'Do not create temporary signing scripts.',
    'Do not generate client-side MCP session IDs.',
  ];

  if (input.hasSignature || containsAny(combined, ['signature', 'expired_or_not_landed', 'not confirm', 'not confirmed', 'confirmation timeout'])) {
    return nextAction({
      classification: 'signature_status_unknown',
      retryable: true,
      safeToRetryNow: false,
      paymentCharged: input.paymentRequired ? 'possible' : 'unknown',
      nextTool: 'sap_payments_finalize_transaction',
      nextAction: 'Verify the submitted signature or transaction status before creating a fresh write. Retry only after confirmation that the previous transaction expired or failed.',
      userMessage: 'A transaction may already have been submitted, so I should verify its status before retrying to avoid duplicate writes.',
      forbiddenActions: [...baseForbidden, 'Do not retry a submitted write until the signature status is known.'],
    });
  }

  if (input.paymentRequired || containsAny(combined, ['payment_required', 'payment required', '402'])) {
    return nextAction({
      classification: 'x402_challenge_required',
      retryable: true,
      safeToRetryNow: true,
      paymentCharged: 'no',
      nextTool: 'sap_payments_call_paid_tool',
      nextAction: 'Call the same hosted tool through sap_payments_call_paid_tool with a maxPriceUsd cap, so the local bridge signs a fresh x402 payment and replays the tool call.',
      userMessage: 'This is a normal x402 challenge, not a failure. I should route it through the local payment bridge.',
      forbiddenActions: [...baseForbidden, 'Do not hand-roll PAYMENT-SIGNATURE headers for hosted SAP tools.'],
    });
  }

  if (containsAny(combined, ['hosted_local_signer_required', 'local signer required', 'hosted server cannot sign', 'no signer configured'])) {
    return nextAction({
      classification: 'local_signer_route_required',
      retryable: false,
      safeToRetryNow: false,
      paymentCharged: 'no',
      nextTool: localSignerToolFor(toolName, input.intent),
      nextAction: 'Switch to the local sap_payments route for this wallet-owned write. Do not retry the hosted accountless write.',
      userMessage: 'The hosted server is non-custodial and correctly refused to sign. I should use the local signing bridge for this write.',
      forbiddenActions: [...baseForbidden, 'Do not retry the hosted direct write after hosted_local_signer_required.'],
    });
  }

  if (containsAny(combined, ['blockhashnotfound', 'node is behind', 'minimum context slot', 'fetch failed', 'transaction_simulation_failed', 'gateway timeout', 'econnreset', 'etimedout'])) {
    return nextAction({
      classification: 'transient_solana_rpc',
      retryable: true,
      safeToRetryNow: true,
      paymentCharged: 'unknown',
      nextTool: input.intent === 'transaction-finalize' ? 'sap_payments_finalize_transaction' : 'sap_payments_call_paid_tool',
      nextAction: 'Retry with a fresh blockhash/challenge through the local bridge. Keep the same user intent and maxPriceUsd cap, and stop if a transaction signature is produced.',
      userMessage: 'This looks like a temporary Solana RPC or blockhash issue. I can retry safely with a fresh challenge unless a signature was already submitted.',
      forbiddenActions: [...baseForbidden, 'Do not reuse an old signed x402 payload.'],
    });
  }

  if (containsAny(combined, ['sap_payments', 'not exposed', 'not injected', 'cannot find module', 'yaml parse', 'connection closes', 'failed during startup', 'tool registry'])) {
    return nextAction({
      classification: 'local_bridge_runtime_missing',
      retryable: false,
      safeToRetryNow: false,
      paymentCharged: 'no',
      nextTool: 'sap_runtime_repair_plan',
      nextAction: 'Run the SAP runtime repair plan, repair the selected agent runtime, then restart the runtime so it reloads the sap_payments tool namespace.',
      userMessage: 'The hosted server can be connected while the local payment bridge is not loaded. Repair the runtime config and restart the agent app.',
      forbiddenActions: [...baseForbidden, 'Do not say paid writes are ready until sap_payments_readiness succeeds.'],
    });
  }

  return nextAction({
    classification: 'general_sap_mcp_routing',
    retryable: false,
    safeToRetryNow: false,
    paymentCharged: 'unknown',
    nextTool: 'sap_agent_runtime_status',
    nextAction: 'Call sap_agent_runtime_status with the closest intent, then choose hosted reads, sap_payments paid calls, local registry writes, or unsigned builder finalization from its routing table.',
    userMessage: 'I should inspect the SAP routing table before choosing the next tool.',
    forbiddenActions: baseForbidden,
  });
}

function containsAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function localSignerToolFor(toolName: string, intent: string): string {
  if (toolName.includes('register')) {
    return 'sap_payments_register_agent';
  }
  if (toolName.includes('update')) {
    return 'sap_payments_update_agent';
  }
  if (toolName.includes('escrow') || intent === 'escrow') {
    return 'sap_escrow_build_create_transaction';
  }
  return 'sap_payments_readiness';
}

function nextAction(payload: {
  classification: string;
  retryable: boolean;
  safeToRetryNow: boolean;
  paymentCharged: 'no' | 'unknown' | 'possible' | 'yes';
  nextTool: string;
  nextAction: string;
  userMessage: string;
  forbiddenActions: string[];
}): Record<string, unknown> {
  return { success: true, ...payload };
}

function buildRuntimeStatusPayload(context: SapMcpContext, intent: string): Record<string, unknown> {
  const signerConfigured = Boolean(context.signer || context.config.walletPath || context.config.externalSignerUrl);
  const hostedMode = context.config.mode === 'hosted-api';
  const localBridgeStatus = hostedMode
    ? 'unknown_from_hosted_server'
    : signerConfigured ? 'same_process_signer_available' : 'not_configured';

  return {
    success: true,
    intent,
    hosted: {
      endpoint: HOSTED_MCP_URL,
      mode: context.config.mode,
      accountModel: hostedMode ? 'hosted-remote-accountless' : 'local-or-delegated',
      network: context.config.rpcUrl.includes('devnet') ? 'devnet' : 'mainnet-beta',
      programId: context.config.programId,
      signerConfiguredOnThisServer: signerConfigured,
      canSeeUserLocalProfile: !hostedMode,
      note: hostedMode
        ? 'Hosted SAP MCP cannot read the user local profile, wallet path, or keypair. Use local sap_payments tools for that.'
        : 'This process can inspect its configured local/delegated signer according to policy.',
    },
    localBridge: {
      namespace: 'sap_payments',
      status: localBridgeStatus,
      verificationTool: 'sap_payments_readiness',
      profileTool: 'sap_payments_profile_current',
      requiredTools: [
        'sap_payments_readiness',
        'sap_payments_profile_current',
        'sap_payments_call_paid_tool',
        'sap_payments_call_external_x402',
        'sap_payments_register_agent',
        'sap_payments_update_agent',
        'sap_payments_finalize_transaction',
        'sap_payments_verify_receipt',
      ],
      repairTool: 'sap_runtime_repair_plan',
      repairCommand: REPAIR_COMMAND,
    },
    routing: {
      reads: {
        route: 'hosted sap',
        rule: 'Use hosted reads directly with exact schemas. Exact SAP profile reads and compact orientation pages are free; broad discovery/enrichment is paid and should use cursors/pagination.',
        freeOrientation: [
          'sap_agent_context',
          'sap_get_agent',
          'sap_get_agent_profile',
          'sap_get_agent_stats',
          'sap_is_agent_active',
          'sap_get_global_state',
          'sap_list_agents with limit <= 20, view: compact, includeProtocolIndexes: false',
        ],
      },
      paidHostedTools: {
        route: 'local sap_payments -> sap_payments_call_paid_tool',
        rule: 'The local bridge resolves x402/pay.sh challenges, signs payment payloads locally, retries transient RPC failures with fresh challenges, and returns receipts.',
      },
      externalX402Agents: {
        route: 'local sap_payments -> sap_payments_call_external_x402',
        rule: 'Use only for external HTTP x402 endpoints discovered through SAP registry metadata, not hosted SAP MCP tools.',
      },
      registryWrites: {
        route: 'local sap_payments',
        register: 'sap_payments_register_agent',
        update: 'sap_payments_update_agent',
        rule: 'Do not retry hosted sap_register_agent or sap_update_agent after hosted_local_signer_required.',
      },
      escrowWrites: {
        route: 'hosted builder -> local finalize',
        builders: [
          'sap_escrow_build_create_transaction',
          'sap_escrow_build_deposit_transaction',
          'sap_escrow_build_settle_transaction',
          'sap_escrow_build_finalize_transaction',
          'sap_escrow_build_withdraw_transaction',
          'sap_escrow_build_close_transaction',
        ],
        finalizer: 'sap_payments_finalize_transaction',
      },
      unsignedTransactions: {
        route: 'sap_payments_finalize_transaction',
        rule: 'When a hosted tool returns transactionBase64 or an unsigned transaction, finalize locally with submit:true and confirm:true.',
      },
    },
    nextToolCalls: buildRuntimeStatusNextCalls(intent),
    userFacingSummary: hostedMode
      ? 'Hosted SAP MCP is reachable and accountless. For paid/write flows, verify the local sap_payments bridge and use it for payments, registry writes, and transaction finalization.'
      : 'SAP MCP is running with a local/delegated profile. Verify signer readiness before value-moving actions.',
    forbiddenActions: [
      'Do not read or print keypair JSON.',
      'Do not create temporary signing scripts.',
      'Do not call hosted signing tools for user-owned signatures.',
      'Do not treat hosted profile default as the user local profile.',
      'Do not retry hosted local-signer-required writes after the routing guard.',
    ],
  };
}

function buildRuntimeStatusNextCalls(intent: string): Record<string, unknown>[] {
  const calls: Record<string, unknown>[] = [
    { namespace: 'hosted sap', tool: 'sap_agent_start', arguments: {}, reason: 'Load startup rules.' },
  ];
  if (['paid-call', 'registry-write', 'transaction-finalize', 'escrow', 'identity'].includes(intent)) {
    calls.push({
      namespace: 'local sap_payments',
      tool: 'sap_payments_readiness',
      arguments: {},
      reason: 'Verify the local profile, signer, balances, and bridge tool surface before paid/write work.',
    });
  }
  if (intent === 'registry-write' || intent === 'identity') {
    calls.push({
      namespace: 'hosted sap',
      tool: 'sap_agent_identity_plan',
      arguments: { intendedAction: intent === 'registry-write' ? 'register' : 'full-identity' },
      reason: 'Normalize registry fields and metadata requirements before local signing.',
    });
  }
  if (intent === 'escrow') {
    calls.push({
      namespace: 'hosted sap',
      tool: 'sap_pricing_catalog',
      arguments: {},
      reason: 'Confirm builder/value-action pricing before escrow workflow.',
    });
  }
  return calls;
}

function buildAgentStartPayload(context: SapMcpContext, goal: string | undefined): Record<string, unknown> {
  return {
    success: true,
    activationPhrases: [
      'Start SAP MCP',
      'Initialize SAP MCP',
      'Load SAP',
      'SAP mode',
      'Use SAP MCP',
    ],
    hostedEndpoint: HOSTED_MCP_URL,
    serverMode: context.config.mode,
    goal: goal ?? null,
    immediateToolCalls: [
      {
        namespace: 'hosted sap',
        tool: 'sap_agent_start',
        required: true,
        reason: 'Load the SAP MCP startup playbook and avoid guessing profile/payment behavior.',
      },
      {
        namespace: 'hosted sap',
        tool: 'sap_agent_runtime_status',
        arguments: { intent: goal ? 'general' : 'connection' },
        required: true,
        reason: 'Get the concise hosted/accountless/local-bridge truth table before answering connection or write-readiness questions.',
      },
      {
        namespace: 'hosted sap',
        tool: 'sap_agent_context',
        arguments: { limit: 10 },
        required: false,
        reason: 'Get free compact SAP agent context and routing guidance before paid discovery or broad scans.',
      },
      {
        namespace: 'hosted sap',
        tool: 'sap_skills_bundle',
        arguments: { includeContents: true },
        required: true,
        reason: 'Load the bundled SAP MCP skills into agent context before selecting protocol tools.',
      },
      {
        namespace: 'hosted sap',
        tool: 'sap_pricing_catalog',
        required: false,
        reason: 'Read the machine-readable x402/pay.sh pricing tiers before paid hosted tools or marketplace execution.',
      },
      {
        namespace: 'hosted sap',
        tool: 'sap_estimate_tool_cost',
        required: false,
        reason: 'Before any paid tool call, pass the tool name to get the exact tier, estimated USD cost, and recommended maxPriceUsd. Avoids silent cap aborts.',
      },
      {
        namespace: 'hosted sap',
        tool: 'sap_skills_upgrade_plan',
        required: false,
        reason: 'If local skills are missing or stale, return exact latest-release commands and target directories before retrying.',
      },
      {
        namespace: 'hosted sap',
        tool: 'sap_protocol_invariants',
        required: false,
        reason: 'Before SAP registry writes, read the canonical program id, protocol treasury, registration fee invariant, and hosted/local signer routing rules.',
      },
      {
        namespace: 'hosted sap',
        tool: 'sap_agent_identity_plan',
        required: false,
        reason: 'Before agent registration, profile-image updates, Metaplex identity, SNS linking, or full identity setup, return the exact local-signer route and verification checklist.',
      },
      {
        namespace: 'hosted sap',
        tool: 'sap_runtime_repair_plan',
        required: false,
        reason: 'If sap_payments is missing, returns the pinned repair command and OS-specific restart instructions.',
      },
      {
        namespace: 'hosted sap',
        tool: 'sap_agent_next_action',
        required: false,
        reason: 'Classify payment_required, hosted_local_signer_required, transient RPC failures, or missing sap_payments before retrying.',
      },
      {
        namespace: 'hosted sap',
        tool: 'sap_profile_current',
        required: false,
        reason: 'Inspect hosted server state only. Do not treat hosted profile default as the user local wallet.',
      },
      {
        namespace: 'local sap_payments',
        tool: 'sap_payments_profile_current',
        required: false,
        reason: 'Inspect the user local profile, wallet public key, and signer status when the bridge is exposed.',
      },
      {
        namespace: 'local sap_payments',
        tool: 'sap_payments_readiness',
        required: false,
        reason: 'Before paid/write workflows, verify hosted connectivity, local signer, payment balance, and policy limits.',
      },
    ],
    routingRules: [
      'Use exact tool names returned by tools/list; do not rewrite hyphens to underscores.',
      'For a simple connection question, answer briefly. Do not dump the full tool catalog, categories, or every protocol unless the user asks what tools are available.',
      'For connection/readiness questions, call sap_agent_runtime_status and use its hosted/localBridge/routing fields as the source of truth.',
      'When an error or partial result appears, call sap_agent_next_action before retrying. It classifies x402 challenges, hosted local-signer guards, transient RPC failures, missing bridge tools, and submitted signatures.',
      'Hosted SAP MCP is accountless and non-custodial. OOBE never has user keypair bytes.',
      'Do not report hosted profile default as the user local profile.',
      'For local wallet/profile questions, prefer sap_payments_profile_current when available.',
      'For hosted SAP agent discovery, prefer sap_discover_agents with query, wallet, agentPda, protocol, capability, capabilities, hasX402Endpoint, small limit, and pagination.nextCursor before broad scans.',
      'For initial orientation, use free exact/base reads first: sap_agent_context, sap_get_agent, sap_get_agent_profile, sap_get_agent_stats, sap_is_agent_active, sap_get_global_state, or sap_list_agents with limit <= 20 and view: compact. Use paid sap_discover_agents or sap_list_all_agents only when the user needs search, enrichment, analytics, or larger pages.',
      'If a capability-filtered SAP agent lookup returns zero rows, retry with query or wallet before saying the agent is absent because secondary indexes can lag AgentAccount rows.',
      'For free reads, call hosted tools directly.',
      'Before any paid call, verify USDC and SOL balances using free core balance tools: sol_get_balance, spl-token_getBalance, spl-token_getTokenAccounts, or magicblock_balance. Use paid read-premium holdings tools only when the user needs enriched portfolio context. An agent without USDC cannot make paid calls.',
      'For paid/write calls, use sap_payments_call_paid_tool from the local sap_payments bridge when available.',
      'Before paid calls, use sap_estimate_tool_cost to know the exact tier and estimated USD cost of a specific tool, or sap_pricing_catalog for the full tier overview. The x402 challenge itself is the final price source of truth.',
      'For external HTTP x402 agent endpoints discovered through SAP registry metadata, use sap_payments_call_external_x402 instead of hand-rolled HTTP/sign/retry scripts.',
      'If sap_payments is missing, ask the user to run the wizard repair flow and restart the agent runtime.',
      'If hosted sap_register_agent returns hosted_local_signer_required, do not retry the hosted direct write. No x402 payment was charged; call local sap_payments_register_agent with the same registration fields and confirm: true.',
      'If hosted sap_update_agent returns hosted_local_signer_required, do not retry the hosted direct write. No x402 payment was charged; call local sap_payments_update_agent with the intended replacement fields and confirm: true.',
      'After sap_payments_register_agent, verify success, agentRegistered, agentPda, confirmationStatus, protocolComplete, and protocolFee.status. success:true means the agent account exists and the protocol fee invariant was verified. If success:false with agentRegistered:true, treat the account as present but not SAP protocol-complete and inspect the deployed SAP program/treasury before retrying.',
      'After sap_payments_update_agent, fetch the agent profile again and verify the changed fields. For picture updates, metadataUri/agentUri must resolve to public metadata that contains the image URL.',
      'For Escrow V2 hosted workflows, use sap_escrow_build_create_transaction, sap_escrow_build_deposit_transaction, sap_escrow_build_settle_transaction, sap_escrow_build_finalize_transaction, sap_escrow_build_withdraw_transaction, or sap_escrow_build_close_transaction, then finalize locally with sap_payments_finalize_transaction.',
      'If another hosted write returns hosted_local_signer_required, switch to a local SAP MCP profile or an unsigned hosted builder plus sap_payments_finalize_transaction when one exists.',
      'If a hosted tool returns transactionBase64, transaction, or an unsigned transaction object, use local sap_payments_finalize_transaction with submit:true. It signs locally and submits through the hosted OOBE relay by default; the relay only broadcasts already-signed bytes.',
      'Never call hosted sap_sign_transaction for user-owned signing, create local .js/.mjs signing scripts, read keypair JSON, or export signer bytes.',
      'Treat expired_or_not_landed as unresolved, not success. Retry only when retrySafe is true and the user confirms.',
      'Preview value-moving actions and ask for confirmation when policy requires it.',
    ],
    paymentFlow: {
      challenge: 'Hosted paid tools return 402 Payment Required with x402/pay.sh requirements.',
      preferredHelper: 'sap_payments_call_paid_tool',
      externalHttpHelper: 'sap_payments_call_external_x402',
      readinessHelper: 'sap_payments_readiness',
      legacyAlias: 'sap_x402_paid_call',
      retryPolicy: 'On BlockhashNotFound, transaction_simulation_failed, node-behind, or expired payment payload, create a fresh challenge and retry through sap_payments_call_paid_tool. Do not reuse an old signed payload.',
      receiptRule: 'Capture PAYMENT-RESPONSE or X-PAYMENT-RESPONSE and bind it to the tool output/audit summary.',
    },
    transactionFlow: {
      unsignedTransactionTools: [
        'jupiter_swapInstructions',
        'jupiter_getOrder',
        'magicblock_swap',
        'magicblock_deposit',
        'magicblock_transfer',
        'magicblock_withdraw',
        'sap_sns_build_manage_record_transaction',
      ],
      localBridgePath: ['sap_payments_finalize_transaction'],
      localServerPath: ['sap_preview_transaction', 'sap_sign_transaction', 'sap_submit_signed_transaction'],
      submitRelay: 'https://mcp.sap.oobeprotocol.ai/tx/submit',
      rule: 'For hosted builders, finalize with local sap_payments_finalize_transaction and submit:true so the signed transaction uses the hosted submit relay and returns confirmed/failed/expired_or_not_landed. For local SAP MCP stdio builders, use sap_preview_transaction -> sap_sign_transaction -> sap_submit_signed_transaction. Do not write temporary signing scripts, shell commands that read keypair files, or raw transaction signers.',
    },
    connectionCheck: {
      intent: 'Use this when the user asks "are you connected?", "is SAP MCP connected?", "check SAP", or similar status-only questions.',
      minimumChecks: ['sap_agent_start when available', 'sap_agent_runtime_status with intent: connection', 'sap_profile_current for hosted server state only when needed', 'sap_payments_readiness only when the user asks about paid/write readiness'],
      responseShape: [
        'Connected: yes/no',
        'Endpoint and mode',
        'Hosted server is accountless/non-custodial',
        'Local sap_payments bridge ready/missing only if checked',
        'One next action',
      ],
      avoid: [
        'Do not list all tools or categories.',
        'Do not infer that registered tools are callable in the current runtime unless an MCP tool call actually succeeds.',
        'Do not say the hosted server is read-only because signerConfigured is false.',
        'Do not inspect local keypair files or guess wallet paths.',
      ],
    },
    skills: {
      listTool: 'sap_skills_list',
      bundleTool: 'sap_skills_bundle',
      installTool: 'sap_skills_install',
      upgradePlanTool: 'sap_skills_upgrade_plan',
      hostedInstallRule: 'Hosted SAP MCP cannot write local files; load sap_skills_bundle into context or run the wizard locally.',
    },
    maintenance: {
      repairTool: 'sap_runtime_repair_plan',
      repairCommand: REPAIR_COMMAND,
      wizardCommand: WIZARD_COMMAND,
      latestPackage: NPM_PACKAGE,
      rule: 'Use sap_runtime_repair_plan before asking users to hand-edit runtime config. It preserves other MCP servers and only repairs OOBE SAP entries.',
    },
    userFacingSummary: 'SAP MCP is ready: hosted tools are available at /mcp, skills are loaded, and paid/write operations should use the local sap_payments bridge so signatures stay user-controlled.',
    repairCommand: REPAIR_COMMAND,
  };
}
