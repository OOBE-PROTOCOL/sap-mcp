/**
 * @module agent-start-tool
 * @description Free bootstrap tool that teaches agents how to activate SAP MCP correctly.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { buildDoctorReport } from '../../config-runtime/src/runtime-doctor.js';
import { MCP_SERVER_VERSION } from '../../core/src/constants.js';
import type { SapMcpContext } from '../../core/src/types.js';
import { buildPricingCatalog } from '../../payments/src/pricing.js';
import {
  buildActionPreparation,
  buildSessionContextPacket,
  normalizeSapAgentIntent,
  type SapAgentIntent,
} from './session-context-packet.js';
import {
  registerToolFamilyPipelineTool,
  type ToolFamilyPipelineDefinition,
  type ToolFamilyPipelineHandlerResult,
} from './tool-family-pipeline.js';

const HOSTED_MCP_URL = 'https://mcp.sap.oobeprotocol.ai/mcp';
const NPM_PACKAGE = `@oobe-protocol-labs/sap-mcp-server@${MCP_SERVER_VERSION}`;
const REPAIR_COMMAND = `npm exec --yes --package ${NPM_PACKAGE} -- sap-mcp-config repair`;
const WIZARD_COMMAND = `npm exec --yes --package ${NPM_PACKAGE} -- sap-mcp-config wizard`;

interface AgentStartPipelineToolDefinition extends ToolFamilyPipelineDefinition {
  readonly name: string;
  readonly execute: (input: { readonly input: unknown }) => Promise<ToolFamilyPipelineHandlerResult> | ToolFamilyPipelineHandlerResult;
}

function registerAgentStartPipelineTool(
  server: Server,
  context: SapMcpContext,
  definition: AgentStartPipelineToolDefinition,
): void {
  const { name, execute, ...toolDefinition } = definition;
  registerToolFamilyPipelineTool(server, context, name, toolDefinition, async (input) => execute({ input }));
}

/**
 * @name registerAgentStartTool
 * @description Registers the SAP MCP startup playbook as a free read-only tool.
 */
export function registerAgentStartTool(server: Server, context: SapMcpContext): void {
  registerAgentStartPipelineTool(
    server,
    context,
    {
      name: 'sap_agent_start',
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
          sessionContextPacket: { type: 'object', description: 'Machine-readable SAP MCP routing, freshness, memory, proof-tape, and forbidden-action rules for this session.' },
          connectionCheck: { type: 'object', description: 'How agents should answer simple connection/status questions.' },
          userFacingSummary: { type: 'string', description: 'Short text the agent can show the user after startup.' },
          repairCommand: { type: 'string', description: 'Wizard command to repair local hosted/profile/payment bridge setup.' },
        },
        required: ['success', 'activationPhrases', 'hostedEndpoint', 'serverMode', 'immediateToolCalls', 'paymentFlow', 'sessionContextPacket', 'connectionCheck', 'userFacingSummary', 'repairCommand'],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      execute: async ({ input }) => {
        const goal = parseGoal(input);
        return buildAgentStartPayload(context, goal);
      },
    },
  );

  registerAgentStartPipelineTool(
    server,
    context,
    {
      name: 'sap_agent_runtime_status',
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
          runtimeDoctor: { type: 'object', description: 'Secret-free local runtime doctor report generated from the active server config. Includes pass/warning/fail checks for profile, signer, wallet path presence, policy limits, RPC, and paid/write readiness without keypair bytes.' },
          toolCatalog: { type: ['object', 'null'], description: 'Secret-free modular tool catalog summary generated from registered tool modules, or null before registration summary is available.' },
          routing: { type: 'object', description: 'Canonical tool routes for reads, paid calls, writes, and unsigned transactions.' },
          sessionContextPacket: { type: 'object', description: 'Machine-readable SAP MCP routing, freshness, memory, proof-tape, and forbidden-action rules for this intent.' },
          nextToolCalls: { type: 'array', description: 'Exact next tool calls agents should make when available.', items: { type: 'object' } },
          userFacingSummary: { type: 'string', description: 'Short summary safe to show to the user.' },
          forbiddenActions: { type: 'array', description: 'Actions agents must not perform.', items: { type: 'string' } },
        },
        required: ['success', 'intent', 'hosted', 'localBridge', 'runtimeDoctor', 'toolCatalog', 'routing', 'sessionContextPacket', 'nextToolCalls', 'userFacingSummary', 'forbiddenActions'],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      execute: async ({ input }) => {
        const intent = parseStatusIntent(input);
        return buildRuntimeStatusPayload(context, intent);
      },
    },
  );

  registerAgentStartPipelineTool(
    server,
    context,
    {
      name: 'sap_prepare_action',
      title: 'Prepare SAP MCP Action',
      description: 'Free intent-level preflight planner for SAP MCP. Call before paid calls, swaps, registry writes, escrow, identity updates, external x402 calls, premium streams, or transaction finalization. It returns the correct hosted/local route, fresh-data requirements, max-price guidance, confirmation policy, retry rules, proof-tape shape, and forbidden actions without charging x402.',
      inputSchema: {
        type: 'object',
        properties: {
          intent: {
            type: 'string',
            enum: ['connection', 'paid-call', 'registry-write', 'update-agent', 'transaction-finalize', 'escrow', 'identity', 'swap', 'external-x402', 'premium-stream', 'balance', 'discovery', 'general'],
            description: 'Closest user intent. Use registry-write for agent registration, update-agent for profile/image updates, swap for token swaps, escrow for SAP Escrow V2, external-x402 for third-party x402 agents, and premium-stream for premium plugin streams/webhooks.',
          },
          toolName: {
            type: 'string',
            description: 'Exact hosted or local tool name being planned, such as jupiter_getOrder, sap_update_agent, sap_create_escrow_v2, or sap_payments_register_agent.',
          },
          userGoal: {
            type: 'string',
            description: 'Short user-facing goal in natural language, used only to tailor the plan and proof-tape shape.',
          },
          maxPriceUsd: {
            type: 'number',
            description: 'Optional user or policy x402 spend cap for this planned action. Agents should normally estimate first and use estimate × 1.25.',
          },
          estimatedNotionalUsd: {
            type: 'number',
            description: 'Optional estimated trade, escrow, or value-moving notional in USD for confirmation-policy guidance.',
          },
          hasUnsignedTransaction: {
            type: 'boolean',
            description: 'Set true when a hosted builder already returned unsigned transaction bytes that should be finalized locally.',
          },
          hasSubmittedSignature: {
            type: 'boolean',
            description: 'Set true when a transaction signature was already submitted. The planner will route to verification before any retry.',
          },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', description: 'Whether the action preparation plan was generated.' },
          intent: { type: 'string', description: 'Normalized intent used for routing.' },
          userGoal: { type: ['string', 'null'], description: 'Goal provided by the user, or null when omitted.' },
          toolName: { type: ['string', 'null'], description: 'Tool name provided for the planned action, or null when omitted.' },
          sessionContextPacket: { type: 'object', description: 'Shared SAP MCP session routing, freshness, memory, and forbidden-action rules.' },
          freshDataRequired: { type: 'array', description: 'Fresh data that must be fetched before user-facing claims, payment, signing, or execution.', items: { type: 'string' } },
          freePreflightTools: { type: 'array', description: 'Free tools that should be called before paid/write execution for this intent.', items: { type: 'string' } },
          paidOrWriteRoute: { type: 'object', description: 'Canonical paid/write route, including local bridge or hosted builder path.' },
          maxPricePolicy: { type: 'object', description: 'How to set maxPriceUsd and when to estimate paid call cost.' },
          confirmationPolicy: { type: 'object', description: 'Whether confirmation is required and why.' },
          proofTapeTemplate: { type: 'object', description: 'Audit object shape the agent should fill during execution.' },
          nextToolCalls: { type: 'array', description: 'Exact recommended next tool calls.', items: { type: 'object' } },
          retryRules: { type: 'object', description: 'Safe retry rules for x402, RPC, hosted signer guards, and submitted signatures.' },
          userFacingPreviewShape: { type: 'array', description: 'Fields that should appear in a compact human preview before value-moving work.', items: { type: 'string' } },
        },
        required: ['success', 'intent', 'userGoal', 'toolName', 'sessionContextPacket', 'freshDataRequired', 'freePreflightTools', 'paidOrWriteRoute', 'maxPricePolicy', 'confirmationPolicy', 'proofTapeTemplate', 'nextToolCalls', 'retryRules', 'userFacingPreviewShape'],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      execute: async ({ input }) => buildActionPreparation(context, parsePrepareActionInput(input)),
    },
  );

  registerAgentStartPipelineTool(
    server,
    context,
    {
      name: 'sap_agent_standard_context',
      title: 'Get SAP Agentic Standards Context',
      description: 'Free agentic-standards orientation for SAP MCP. Use this after sap_agent_start when an agent needs to understand how SAP MCP maps MCP, x402/pay.sh, A2A-style Agent Cards, OASF-style agent facts, AP2-style mandate planning, local signing, and hosted unsigned builders without guessing or over-claiming unsupported standards.',
      inputSchema: {
        type: 'object',
        properties: {
          intent: {
            type: 'string',
            enum: ['connection', 'paid-call', 'registry-write', 'transaction-finalize', 'escrow', 'identity', 'swap', 'external-x402', 'premium-stream', 'general'],
            description: 'Closest user intent so the standards context can highlight the correct MCP/x402/local-signer route.',
          },
          includeRoadmap: {
            type: 'boolean',
            description: 'Whether to include planned-but-not-claimed standards work such as MCP Apps, A2A signatures, AG-UI views, and full AP2 mandate signatures. Defaults to true.',
          },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', description: 'Whether the standards context was generated.' },
          serverVersion: { type: 'string', description: 'SAP MCP server version that generated this context.' },
          intent: { type: 'string', description: 'Normalized intent used for routing.' },
          standards: { type: 'object', description: 'SAP MCP mapping across MCP, x402/pay.sh, A2A-style metadata, OASF-style export, AP2-style mandates, and UI/runtime standards.' },
          trustBoundary: { type: 'object', description: 'Non-custodial and local-signing boundaries agents must preserve.' },
          bootstrapSequence: { type: 'array', description: 'Recommended first calls for agent runtimes.', items: { type: 'object' } },
          claims: { type: 'object', description: 'Public claims agents can safely make and claims they must avoid.' },
          nextToolCalls: { type: 'array', description: 'Exact next tool calls for this standards-aware session.', items: { type: 'object' } },
          roadmap: { type: 'array', description: 'Planned standards improvements when includeRoadmap is true.', items: { type: 'object' } },
        },
        required: ['success', 'serverVersion', 'intent', 'standards', 'trustBoundary', 'bootstrapSequence', 'claims', 'nextToolCalls', 'roadmap'],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      execute: async ({ input }) => buildAgentStandardContextPayload(context, parseStandardContextInput(input)),
    },
  );

  registerAgentStartPipelineTool(
    server,
    context,
    {
      name: 'sap_prepare_mandate',
      title: 'Prepare SAP Agent Mandate',
      description: 'Free AP2-style mandate planner for SAP MCP agent commerce. It converts a user intent into a bounded, unsigned planning artifact with spend limits, tool/protocol allow-lists, freshness rules, confirmation thresholds, proof-tape fields, and the correct hosted/local signing route. This tool does not sign, submit, authorize payment, or replace wallet confirmation.',
      inputSchema: {
        type: 'object',
        properties: {
          intent: {
            type: 'string',
            description: 'Human intent to bind, for example "check solking.sol", "register Solking", "swap 0.05 SOL to USDC", or "open a $10 BONK short".',
          },
          operationType: {
            type: 'string',
            enum: ['paid-tool', 'swap', 'perp-trade', 'registry-write', 'escrow', 'external-x402', 'premium-stream', 'transaction-finalize', 'other'],
            description: 'Closest operation family. Use registry-write for SAP agent registration/update, escrow for SAP Escrow V2, and transaction-finalize when an unsigned hosted transaction is already available.',
          },
          profile: {
            type: 'string',
            description: 'Optional local SAP profile name the user expects the runtime to use. Do not guess wallet/keypair paths from this value.',
          },
          wallet: {
            type: 'string',
            description: 'Optional expected owner/signer wallet public key in base58. Used only as a public constraint, never as a keypair path.',
          },
          maxX402Usd: {
            type: 'number',
            description: 'Maximum x402/pay.sh fee the agent may auto-pay for one hosted tool call under the user policy.',
          },
          maxTotalX402Usd: {
            type: 'number',
            description: 'Maximum total x402/pay.sh spend for this mandate before asking the user again.',
          },
          maxTradeUsd: {
            type: 'number',
            description: 'Maximum value-moving notional in USD for swaps, perps, escrow, or transaction finalization under this mandate.',
          },
          maxSlippageBps: {
            type: 'number',
            description: 'Maximum slippage in basis points for swap or trading routes. 100 means 1%.',
          },
          allowedProtocols: {
            type: 'array',
            description: 'Protocol allow-list such as sap, mcp, x402, jupiter, adrena, pyth, metaplex, sns, magicblock, or custom protocol ids.',
            items: { type: 'string' },
          },
          allowedTools: {
            type: 'array',
            description: 'Exact SAP MCP tool allow-list for this mandate. Use exact names from tools/list and do not rewrite hyphenated tools.',
            items: { type: 'string' },
          },
          requireConfirmationAboveUsd: {
            type: 'number',
            description: 'Require a human preview and explicit confirmation above this USD notional or spend threshold.',
          },
          expiresInSeconds: {
            type: 'number',
            description: 'Mandate TTL in seconds. Defaults to 900 and is capped to 86400.',
          },
        },
        required: ['intent'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', description: 'Whether the mandate draft was generated.' },
          mandate: { type: 'object', description: 'Unsigned mandate planning artifact. This is not a signature and not a payment authorization.' },
          route: { type: 'object', description: 'Canonical hosted/local route for this operation type.' },
          freshness: { type: 'array', description: 'Data that must be fetched fresh before paid, signed, or value-moving actions.', items: { type: 'string' } },
          confirmationPolicy: { type: 'object', description: 'When the agent must show a compact preview and ask the user to confirm.' },
          proofTapeTemplate: { type: 'object', description: 'Audit record shape to fill as execution proceeds.' },
          nextToolCalls: { type: 'array', description: 'Exact next SAP MCP tool calls recommended for this mandate.', items: { type: 'object' } },
          forbiddenActions: { type: 'array', description: 'Actions agents must not perform under this mandate.', items: { type: 'string' } },
        },
        required: ['success', 'mandate', 'route', 'freshness', 'confirmationPolicy', 'proofTapeTemplate', 'nextToolCalls', 'forbiddenActions'],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      execute: async ({ input }) => buildMandatePayload(context, parseMandateInput(input)),
    },
  );

  registerAgentStartPipelineTool(
    server,
    context,
    {
      name: 'sap_pricing_catalog',
      title: 'Get SAP MCP Pricing Catalog',
      description: 'Free machine-readable x402/pay.sh pricing catalog generated from the hosted SAP MCP pricing registry. Use before paid calls to understand free, micro-read, read-premium, builder, value-action, and batch tiers.',
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
      execute: async () => ({ ...buildPricingCatalog(context.config.monetization) }),
    },
  );

  registerAgentStartPipelineTool(
    server,
    context,
    {
      name: 'sap_agent_next_action',
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
      execute: async ({ input }) => buildAgentNextActionPayload(parseNextActionInput(input)),
    },
  );
}

function parseGoal(input: unknown): string | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return undefined;
  }
  const goal = (input as Record<string, unknown>).goal;
  return typeof goal === 'string' && goal.trim().length > 0 ? goal.trim() : undefined;
}

function parseStatusIntent(input: unknown): SapAgentIntent {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return 'general';
  }
  return normalizeSapAgentIntent((input as Record<string, unknown>).intent);
}

function parsePrepareActionInput(input: unknown) {
  const record = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  return {
    intent: normalizeSapAgentIntent(record.intent),
    toolName: readOptionalString(record.toolName),
    userGoal: readOptionalString(record.userGoal),
    maxPriceUsd: readOptionalNumber(record.maxPriceUsd),
    estimatedNotionalUsd: readOptionalNumber(record.estimatedNotionalUsd),
    hasUnsignedTransaction: record.hasUnsignedTransaction === true,
    hasSubmittedSignature: record.hasSubmittedSignature === true,
  };
}

interface StandardContextInput {
  intent: SapAgentIntent;
  includeRoadmap: boolean;
}

function parseStandardContextInput(input: unknown): StandardContextInput {
  const record = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  return {
    intent: normalizeSapAgentIntent(record.intent),
    includeRoadmap: record.includeRoadmap !== false,
  };
}

type MandateOperationType =
  | 'paid-tool'
  | 'swap'
  | 'perp-trade'
  | 'registry-write'
  | 'escrow'
  | 'external-x402'
  | 'premium-stream'
  | 'transaction-finalize'
  | 'other';

interface MandateInput {
  intent: string;
  operationType: MandateOperationType;
  profile?: string;
  wallet?: string;
  maxX402Usd?: number;
  maxTotalX402Usd?: number;
  maxTradeUsd?: number;
  maxSlippageBps?: number;
  allowedProtocols: string[];
  allowedTools: string[];
  requireConfirmationAboveUsd?: number;
  expiresInSeconds: number;
}

function parseMandateInput(input: unknown): MandateInput {
  const record = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const intent = readOptionalString(record.intent);
  if (!intent) {
    throw new Error('intent is required to prepare a SAP mandate.');
  }
  const explicitOperationType = normalizeMandateOperationType(record.operationType);
  return {
    intent,
    operationType: explicitOperationType === 'other' ? inferMandateOperationType(intent) : explicitOperationType,
    profile: readOptionalString(record.profile),
    wallet: readOptionalString(record.wallet),
    maxX402Usd: readOptionalNumber(record.maxX402Usd),
    maxTotalX402Usd: readOptionalNumber(record.maxTotalX402Usd),
    maxTradeUsd: readOptionalNumber(record.maxTradeUsd),
    maxSlippageBps: readOptionalNumber(record.maxSlippageBps),
    allowedProtocols: readOptionalStringArray(record.allowedProtocols),
    allowedTools: readOptionalStringArray(record.allowedTools),
    requireConfirmationAboveUsd: readOptionalNumber(record.requireConfirmationAboveUsd),
    expiresInSeconds: clampTtlSeconds(readOptionalNumber(record.expiresInSeconds)),
  };
}

function normalizeMandateOperationType(value: unknown): MandateOperationType {
  if (typeof value !== 'string') {
    return 'other';
  }
  const normalized = value.trim().toLowerCase().replace(/_/g, '-');
  if ([
    'paid-tool',
    'swap',
    'perp-trade',
    'registry-write',
    'escrow',
    'external-x402',
    'premium-stream',
    'transaction-finalize',
    'other',
  ].includes(normalized)) {
    return normalized as MandateOperationType;
  }
  return 'other';
}

function inferMandateOperationType(intent: string): MandateOperationType {
  const normalized = intent.toLowerCase();
  if (/\b(register|update|agent|profile|metadata|identity|sns|domain)\b/.test(normalized)) {
    return 'registry-write';
  }
  if (/\b(perp|short|long|leverage|position|stop loss|take profit|adrena|percolator)\b/.test(normalized)) {
    return 'perp-trade';
  }
  if (/\b(swap|quote|jupiter|raydium|orca|meteora)\b/.test(normalized)) {
    return 'swap';
  }
  if (/\b(escrow|settle|settlement|dispute|co-?sign)\b/.test(normalized)) {
    return 'escrow';
  }
  if (/\b(external x402|third[- ]party|http 402|payment-signature)\b/.test(normalized)) {
    return 'external-x402';
  }
  if (/\b(stream|webhook|premium session|subscription)\b/.test(normalized)) {
    return 'premium-stream';
  }
  if (/\b(finalize|submit|unsigned transaction|sign transaction)\b/.test(normalized)) {
    return 'transaction-finalize';
  }
  if (/\b(paid tool|x402|pay\.sh|payment)\b/.test(normalized)) {
    return 'paid-tool';
  }
  return 'other';
}

function readOptionalStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

function clampTtlSeconds(value: number | undefined): number {
  if (value === undefined) {
    return 900;
  }
  return Math.max(60, Math.min(Math.floor(value), 86400));
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

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
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

  if (containsAny(combined, ['pricing_menu', 'pricing menu', 'accountnotinitialized', 'account not initialized', 'error number: 3012', 'anchor 3012', '3012'])) {
    return nextAction({
      classification: 'sap_registry_account_lifecycle',
      retryable: false,
      safeToRetryNow: false,
      paymentCharged: 'no',
      nextTool: 'sap_protocol_invariants',
      nextAction: 'Do not repair the runtime and do not retry the same write. Inspect SAP protocol invariants and the agent registration/update lifecycle; the registry account set is missing a required on-chain PDA such as pricing_menu.',
      userMessage: 'The local bridge is not the problem. The SAP registry write reached the on-chain program, but a required registry account such as pricing_menu is not initialized for this agent lifecycle.',
      forbiddenActions: [...baseForbidden, 'Do not classify Anchor 3012/pricing_menu as missing sap_payments.', 'Do not retry paid or local writes until the account lifecycle is fixed or the SDK/server has an initializer path.'],
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

function buildAgentStandardContextPayload(context: SapMcpContext, input: StandardContextInput): Record<string, unknown> {
  const hostedMode = context.config.mode === 'hosted-api';
  return {
    success: true,
    serverVersion: MCP_SERVER_VERSION,
    intent: input.intent,
    standards: {
      mcp: {
        status: 'production',
        transport: 'Streamable HTTP for hosted SAP MCP; stdio for local sap_payments bridge.',
        endpoint: HOSTED_MCP_URL,
        protocolVersion: '2025-06-18 compatible runtime metadata; clients must initialize and reuse the returned mcp-session-id.',
        tasksAppsExtensions: 'tracked roadmap; do not claim full MCP Tasks/Apps/Extensions support unless a runtime advertises those capabilities.',
        route: 'Use hosted sap for reads/builders and local sap_payments for x402 replay, local signing, registry writes, and transaction finalization.',
      },
      x402PaySh: {
        status: 'production',
        discovery: [
          'https://mcp.sap.oobeprotocol.ai/.well-known/x402',
          'https://mcp.sap.oobeprotocol.ai/pay/provider.yml',
          'https://mcp.sap.oobeprotocol.ai/openapi.json',
        ],
        hostedToolFlow: 'Hosted paid tools return x402/pay.sh challenges. Resolve them with sap_payments_call_paid_tool unless the runtime has native x402 challenge replay.',
        externalAgentFlow: 'For third-party HTTP x402 endpoints discovered through SAP registry metadata, use sap_payments_call_external_x402.',
        receiptRule: 'Bind PAYMENT-RESPONSE or X-PAYMENT-RESPONSE to the tool result proof tape.',
      },
      a2a: {
        status: 'metadata-compatible',
        agentCardUrl: 'https://mcp.sap.oobeprotocol.ai/.well-known/agent-card.json',
        currentScope: 'SAP MCP publishes a machine-readable agent card and MCP server metadata; signed A2A task orchestration is roadmap work.',
      },
      oasf: {
        status: 'compatible-export',
        exportTool: 'sap_export_agent_oasf',
        currentScope: 'Export SAP on-chain identity, capabilities, protocols, pricing, x402 endpoint, and trust facts into an OASF-style JSON view for agent directories.',
      },
      ap2Mandates: {
        status: 'planning-artifact',
        plannerTool: 'sap_prepare_mandate',
        currentScope: 'Creates bounded, unsigned mandate drafts with spend/tool/protocol constraints. Wallet confirmation and local signing remain mandatory for value-moving actions.',
      },
      agUiA2Ui: {
        status: 'roadmap',
        currentScope: 'SAP MCP returns structured previews/proof tapes today. Runtime-native UI cards, wallet prompts, and agent cockpit surfaces belong in SAP Studio or runtime extensions.',
      },
      acpUcpCommerce: {
        status: 'interoperability-target',
        currentScope: 'SAP MCP can expose agent identity, pricing, x402 endpoint, reputation, and tool capabilities; do not claim native ACP/UCP compatibility until adapters are published.',
      },
    },
    trustBoundary: {
      hostedAccountless: hostedMode,
      canHostedSeeUserKeypair: false,
      canHostedSeeLocalProfile: !hostedMode,
      signerRule: 'User-owned signatures must come from sap_payments local bridge, a local SAP MCP profile, wallet UI, or a hosted unsigned builder finalized locally.',
      forbidden: [
        'Do not read keypair JSON.',
        'Do not create temporary signing scripts.',
        'Do not call hosted direct writes after hosted_local_signer_required.',
        'Do not reuse stale x402 payment payloads.',
      ],
    },
    bootstrapSequence: [
      { tool: 'sap_agent_start', arguments: {}, reason: 'Load canonical startup rules.' },
      { tool: 'sap_agent_runtime_status', arguments: { intent: input.intent }, reason: 'Check hosted/accountless/local bridge truth table.' },
      { tool: 'sap_agent_standard_context', arguments: { intent: input.intent }, reason: 'Load standards-aware routing and public claim boundaries.' },
      { tool: 'sap_prepare_action', arguments: { intent: input.intent }, reason: 'Prepare exact execution route before payment or signing.' },
      { tool: 'sap_skills_bundle', arguments: { includeContents: true }, reason: 'Load current SAP MCP skills before selecting tool families.' },
    ],
    claims: {
      safe: [
        'SAP MCP is an MCP server for Solana agent operations with x402/pay.sh monetization.',
        'Hosted SAP MCP is non-custodial and accountless.',
        'Local sap_payments signs x402 payments and user-approved transactions without exposing keypair bytes.',
        'SAP can export agent identity/capability facts in an OASF-style view.',
      ],
      avoid: [
        'Do not claim SAP MCP implements every emerging agent standard end-to-end.',
        'Do not claim hosted SAP MCP can sign user-owned writes.',
        'Do not call unsigned mandate drafts wallet authorizations.',
        'Do not claim external x402 agents use the OOBE facilitator unless their metadata says so.',
      ],
    },
    nextToolCalls: buildStandardContextNextCalls(input.intent),
    roadmap: input.includeRoadmap ? [
      { area: 'MCP Tasks/Apps', action: 'Expose task-state and UI-extension adapters once runtime compatibility stabilizes.' },
      { area: 'A2A', action: 'Add signed agent-card proofs and task-status webhooks for cross-agent orchestration.' },
      { area: 'AP2-style mandates', action: 'Bind mandate drafts to wallet-visible confirmations and proof-tape receipts.' },
      { area: 'OASF directories', action: 'Publish stable OASF-compatible agent profile resources for third-party discovery indexes.' },
      { area: 'SAP Studio', action: 'Render preview/confirm/done UI cards from the same proof-tape schema returned by tools.' },
    ] : [],
  };
}

function buildStandardContextNextCalls(intent: SapAgentIntent): Record<string, unknown>[] {
  const calls: Record<string, unknown>[] = [
    { namespace: 'hosted sap', tool: 'sap_prepare_action', arguments: { intent }, reason: 'Resolve freshness, pricing, route, and retry rules.' },
  ];
  if (['registry-write', 'identity'].includes(intent)) {
    calls.push({ namespace: 'hosted sap', tool: 'sap_agent_identity_plan', arguments: { intendedAction: intent === 'registry-write' ? 'register' : 'update' }, reason: 'Normalize SAP identity fields before local signing.' });
  }
  if (['paid-call', 'registry-write', 'transaction-finalize', 'escrow', 'identity'].includes(intent)) {
    calls.push({ namespace: 'local sap_payments', tool: 'sap_payments_wallet_guard', arguments: {}, reason: 'Inspect local signer guardrails without exposing wallet paths or keypair bytes.' });
    calls.push({ namespace: 'local sap_payments', tool: 'sap_payments_readiness', arguments: {}, reason: 'Verify local signer/payment bridge readiness.' });
  }
  calls.push({ namespace: 'hosted sap', tool: 'sap_prepare_mandate', arguments: { intent: `Prepare ${intent} under user policy`, operationType: mandateOperationForIntent(intent) }, reason: 'Create a bounded intent artifact before paid/write work.' });
  return calls;
}

function buildMandatePayload(context: SapMcpContext, input: MandateInput): Record<string, unknown> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + input.expiresInSeconds * 1000);
  const mandateId = `sap-mandate-${now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.abs(hashString(input.intent)).toString(36)}`;
  const route = routeForMandate(input.operationType);
  const requireConfirmation = shouldRequireConfirmation(input);

  return {
    success: true,
    mandate: {
      id: mandateId,
      status: 'unsigned_planning_artifact',
      standardIntent: 'AP2-style bounded agent mandate draft',
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      intent: input.intent,
      operationType: input.operationType,
      profile: input.profile ?? null,
      wallet: input.wallet ?? null,
      constraints: {
        maxX402Usd: input.maxX402Usd ?? 0.02,
        maxTotalX402Usd: input.maxTotalX402Usd ?? input.maxX402Usd ?? 0.02,
        maxTradeUsd: input.maxTradeUsd ?? null,
        maxSlippageBps: input.maxSlippageBps ?? null,
        allowedProtocols: input.allowedProtocols,
        allowedTools: input.allowedTools,
        requireConfirmationAboveUsd: input.requireConfirmationAboveUsd ?? 0,
      },
      notPaymentAuthorization: true,
      notWalletSignature: true,
      signerBoundary: 'A wallet, local sap_payments bridge, external signer, or local SAP MCP signer must still confirm any value-moving transaction.',
      hostedServerMode: context.config.mode,
    },
    route,
    freshness: freshnessForMandate(input.operationType),
    confirmationPolicy: {
      required: requireConfirmation,
      reason: requireConfirmation
        ? 'This mandate can involve payment, signing, or value movement; show a compact preview and ask the user to confirm before execution.'
        : 'Only free/read-only preflight is covered. Ask again before paid or value-moving work.',
      previewFields: [
        'user intent',
        'profile and wallet public key',
        'tool route',
        'x402 fee cap',
        'trade/escrow notional cap',
        'slippage or risk cap',
        'expected receipt/signature/proof tape',
      ],
    },
    proofTapeTemplate: {
      mandateId,
      preparedAt: now.toISOString(),
      toolsCalled: [],
      x402Receipts: [],
      unsignedTransactions: [],
      localSignatures: [],
      submittedSignatures: [],
      finalStatus: 'pending',
      verification: {
        paymentReceiptsChecked: false,
        transactionStatusChecked: false,
        onChainStateChecked: false,
      },
    },
    nextToolCalls: nextCallsForMandate(input),
    forbiddenActions: [
      'Do not treat this mandate draft as a wallet signature.',
      'Do not read or print keypair JSON.',
      'Do not create temporary signing scripts.',
      'Do not call hosted wallet-owned writes after hosted_local_signer_required.',
      'Do not retry submitted writes until signature status is known.',
      'Do not exceed maxX402Usd, maxTotalX402Usd, maxTradeUsd, maxSlippageBps, allowedProtocols, or allowedTools without asking the user again.',
    ],
  };
}

function mandateOperationForIntent(intent: SapAgentIntent): MandateOperationType {
  if (intent === 'paid-call') return 'paid-tool';
  if (intent === 'registry-write' || intent === 'identity') return 'registry-write';
  if (intent === 'transaction-finalize') return 'transaction-finalize';
  if (intent === 'escrow') return 'escrow';
  return 'other';
}

function routeForMandate(operationType: MandateOperationType): Record<string, unknown> {
  switch (operationType) {
    case 'paid-tool':
      return { hostedTool: true, localTool: 'sap_payments_call_paid_tool', rule: 'Estimate, cap maxPriceUsd, resolve x402 locally, capture receipt.' };
    case 'swap':
      return { hostedBuilder: true, localTool: 'sap_payments_finalize_transaction', rule: 'Fetch quote fresh, build unsigned transaction, preview, then finalize locally after confirmation.' };
    case 'perp-trade':
      return { hostedAnalytics: true, hostedBuilder: true, localTool: 'sap_payments_finalize_transaction', rule: 'Run market snapshot, signal score, fear/greed, risk check, simulate, then build/finalize only if wouldSucceed and user confirms.' };
    case 'registry-write':
      return { localTool: 'sap_payments_register_agent or sap_payments_update_agent', rule: 'Use local sap_payments registry write tools; hosted direct writes are accountless and blocked.' };
    case 'escrow':
      return { hostedBuilder: 'sap_escrow_build_*_transaction', localTool: 'sap_payments_finalize_transaction', rule: 'Build unsigned Escrow V2 transaction hosted, then finalize locally.' };
    case 'external-x402':
      return { localTool: 'sap_payments_call_external_x402', rule: 'Use only for third-party x402 endpoints; do not route hosted SAP MCP tools through generic HTTP.' };
    case 'premium-stream':
      return { hostedTools: ['sap_premium_session_start', 'sap_premium_stream_poll'], rule: 'Start a bounded premium session, then consume stream/webhook outputs under the returned limits.' };
    case 'transaction-finalize':
      return { localTool: 'sap_payments_finalize_transaction', rule: 'Preview unsigned transaction, sign locally, submit through relay when requested, verify signature status.' };
    default:
      return { hostedTool: 'sap_prepare_action', rule: 'Resolve exact SAP MCP route before spending, signing, or claiming support.' };
  }
}

function freshnessForMandate(operationType: MandateOperationType): string[] {
  const common = ['sap_agent_runtime_status', 'sap_prepare_action', 'sap_payments_wallet_guard and sap_payments_readiness when paid/write/local signing is needed'];
  if (operationType === 'swap') {
    return [...common, 'fresh wallet SOL/SPL balances', 'fresh quote', 'fresh slippage/routing preview'];
  }
  if (operationType === 'perp-trade') {
    return [...common, 'fresh wallet USDC/SOL balances', 'fresh market snapshot', 'fresh signal score', 'fresh risk check', 'fresh position simulation'];
  }
  if (operationType === 'registry-write') {
    return [...common, 'sap_protocol_invariants', 'sap_agent_identity_plan', 'current SAP agent profile when updating'];
  }
  if (operationType === 'escrow') {
    return [...common, 'fresh agent profile/x402 endpoint', 'fresh escrow PDA state', 'fresh token mint/decimals'];
  }
  return common;
}

function shouldRequireConfirmation(input: MandateInput): boolean {
  if (['swap', 'perp-trade', 'registry-write', 'escrow', 'transaction-finalize'].includes(input.operationType)) {
    return true;
  }
  if ((input.maxTotalX402Usd ?? input.maxX402Usd ?? 0) > (input.requireConfirmationAboveUsd ?? Number.POSITIVE_INFINITY)) {
    return true;
  }
  return false;
}

function nextCallsForMandate(input: MandateInput): Record<string, unknown>[] {
  const calls: Record<string, unknown>[] = [
    { namespace: 'hosted sap', tool: 'sap_prepare_action', arguments: { intent: sapIntentForMandate(input.operationType), userGoal: input.intent }, reason: 'Resolve exact route and retry rules.' },
  ];
  if (input.operationType !== 'other') {
    calls.push({ namespace: 'local sap_payments', tool: 'sap_payments_wallet_guard', arguments: {}, reason: 'Inspect local signer guardrails without reading keypair files.' });
    calls.push({ namespace: 'local sap_payments', tool: 'sap_payments_readiness', arguments: {}, reason: 'Verify local signer, payment balance, and policy before paid/write execution.' });
  }
  if (input.operationType === 'registry-write') {
    calls.push({ namespace: 'hosted sap', tool: 'sap_agent_identity_plan', arguments: { intendedAction: 'full-identity' }, reason: 'Normalize SAP + optional Metaplex/SNS identity fields.' });
  }
  if (input.operationType === 'paid-tool') {
    calls.push({ namespace: 'hosted sap', tool: 'sap_estimate_tool_cost', arguments: { toolName: input.allowedTools[0] ?? '' }, reason: 'Estimate before x402 payment and set maxPriceUsd.' });
  }
  return calls;
}

function sapIntentForMandate(operationType: MandateOperationType): SapAgentIntent {
  if (operationType === 'paid-tool') return 'paid-call';
  if (operationType === 'registry-write') return 'registry-write';
  if (operationType === 'escrow') return 'escrow';
  if (operationType === 'transaction-finalize') return 'transaction-finalize';
  if (operationType === 'external-x402') return 'paid-call';
  return 'general';
}

function hashString(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return hash;
}

function buildRuntimeStatusPayload(context: SapMcpContext, intent: SapAgentIntent): Record<string, unknown> {
  const signerConfigured = Boolean(context.signer || context.config.walletPath || context.config.externalSignerUrl);
  const hostedMode = context.config.mode === 'hosted-api';
  const localBridgeStatus = hostedMode
    ? 'unknown_from_hosted_server'
    : signerConfigured ? 'same_process_signer_available' : 'not_configured';
  const runtimeDoctor = buildDoctorReport({
    config: context.config,
    profileName: context.config.agentPubkey ? 'runtime-configured-profile' : 'runtime-context',
    configPath: 'runtime-context',
    configRoot: 'runtime-context',
  });

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
      walletGuardTool: 'sap_payments_wallet_guard',
      requiredTools: [
        'sap_payments_wallet_guard',
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
    runtimeDoctor,
    toolCatalog: context.toolCatalog ?? null,
    routing: {
      reads: {
        route: 'hosted sap',
        rule: 'Use hosted reads directly with exact schemas. Control-plane tools, wallet/payment readiness balances, and single-asset price snapshots are free; fresh exact SAP profile reads and compact orientation pages are micro-read; broad discovery/enrichment is read-premium and should use cursors/pagination.',
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
    sessionContextPacket: buildSessionContextPacket(context, intent),
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

function buildRuntimeStatusNextCalls(intent: SapAgentIntent): Record<string, unknown>[] {
  const calls: Record<string, unknown>[] = [
    { namespace: 'hosted sap', tool: 'sap_agent_start', arguments: {}, reason: 'Load startup rules.' },
    { namespace: 'hosted sap', tool: 'sap_prepare_action', arguments: { intent }, reason: 'Resolve the correct paid/write/local route and freshness rules before execution.' },
  ];
  if (['paid-call', 'registry-write', 'transaction-finalize', 'escrow', 'identity'].includes(intent)) {
    calls.push({
      namespace: 'local sap_payments',
      tool: 'sap_payments_wallet_guard',
      arguments: {},
      reason: 'Inspect capability-only local signer guardrails without reading wallet paths or keypair bytes.',
    });
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
    sessionContextPacket: buildSessionContextPacket(context, 'general', goal),
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
        tool: 'sap_prepare_action',
        arguments: { intent: goal ? 'general' : 'connection', userGoal: goal ?? undefined },
        required: false,
        reason: 'Create an intent-level route plan with fresh-data requirements, local/hosted tool path, confirmation policy, retry rules, and proof-tape shape.',
      },
      {
        namespace: 'hosted sap',
        tool: 'sap_agent_standard_context',
        arguments: { intent: goal ? 'general' : 'connection' },
        required: false,
        reason: 'Load MCP/x402/A2A-style/OASF/AP2-style interoperability rules and public-claim boundaries before composing cross-agent workflows.',
      },
      {
        namespace: 'hosted sap',
        tool: 'sap_agent_context',
        arguments: { limit: 10 },
        required: false,
        reason: 'Get compact SAP agent context and routing guidance as a micro-read before broader discovery scans.',
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
        tool: 'sap_payments_wallet_guard',
        required: false,
        reason: 'Inspect local signer guardrails. This never returns keypair paths or secret material.',
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
      'For standards/interoperability questions, call sap_agent_standard_context before claiming MCP Tasks, A2A, OASF, AP2, AG-UI, ACP/UCP, or other emerging-standard support.',
      'When an error or partial result appears, call sap_agent_next_action before retrying. It classifies x402 challenges, hosted local-signer guards, transient RPC failures, missing bridge tools, and submitted signatures.',
      'Hosted SAP MCP is accountless and non-custodial. OOBE never has user keypair bytes.',
      'Do not report hosted profile default as the user local profile.',
      'Treat local signing as a sap_payments capability, not as a filesystem keypair. Use sap_payments_wallet_guard for boundaries and forbidden actions.',
      'For local wallet/profile questions, prefer sap_payments_profile_current when available.',
      'For hosted SAP agent discovery, prefer sap_discover_agents with query, wallet, agentPda, protocol, capability, capabilities, hasX402Endpoint, small limit, and pagination.nextCursor before broad scans.',
      'For initial orientation, use free control-plane tools first, then micro-read exact/base reads: sap_agent_context, sap_get_agent, sap_get_agent_profile, sap_get_agent_stats, sap_is_agent_active, sap_get_global_state, or sap_list_agents with limit <= 20 and view: compact. Use read-premium sap_discover_agents or sap_list_all_agents only when the user needs search, enrichment, analytics, or larger pages.',
      'If a capability-filtered SAP agent lookup returns zero rows, retry with query or wallet before saying the agent is absent because secondary indexes can lag AgentAccount rows.',
      'For free control-plane, free readiness, and micro-read data calls, call hosted tools directly.',
      'Before any paid call, verify USDC and SOL balances using free readiness tools: sol_get_balance, spl-token_getBalance, spl-token_getTokenAccounts, sap_x402_get_balance, or magicblock_balance. Use read-premium holdings tools only when the user needs enriched portfolio context. An agent without USDC cannot make paid calls.',
      'For paid/write calls, use sap_payments_call_paid_tool from the local sap_payments bridge when available.',
      'Before paid calls, use sap_estimate_tool_cost to know the exact tier and estimated USD cost of a specific tool, or sap_pricing_catalog for the full tier overview. The x402 challenge itself is the final price source of truth.',
      'For bounded agent commerce flows, call sap_prepare_mandate to create an unsigned AP2-style planning artifact with spend/tool/protocol constraints before payment, signing, or execution. This mandate draft is not a wallet signature.',
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
      walletGuardHelper: 'sap_payments_wallet_guard',
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
      minimumChecks: ['sap_agent_start when available', 'sap_agent_runtime_status with intent: connection', 'sap_profile_current for hosted server state only when needed', 'sap_payments_wallet_guard and sap_payments_readiness only when the user asks about paid/write readiness'],
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
