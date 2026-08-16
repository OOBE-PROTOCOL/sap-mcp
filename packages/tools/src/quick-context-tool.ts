/**
 * @module quick-context-tool
 * @description Single-call bootstrap tool that aggregates tools summary, pricing tiers,
 * premium capabilities, and skills list into one compact response to reduce agent
 * bootstrap from 5+ tool calls to 1.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { execSync } from 'child_process';
import { MCP_SERVER_VERSION } from '../../core/src/constants.js';
import type { SapMcpContext, SapMcpToolCatalogContext } from '../../core/src/types.js';
import { listPremiumPlugins, publicPremiumProviderStatus } from '../../../src/premium/index.js';
import { listBundledSkillNames, getBundledSkillContents } from './skills-tools.js';
import { CAPABILITIES } from '../../server-runtime/src/server-metadata.js';
import { registerToolFamilyPipelineTool } from './tool-family-pipeline.js';
import {
  buildSessionContextPacket,
  normalizeSapAgentIntent,
  type SapAgentIntent,
} from './session-context-packet.js';

/**
 * @name getServerCommit
 * @description Returns the short git commit hash of the current build.
 * Falls back to 'unknown' when git is not available or the repo has no commits.
 */
function getServerCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8', timeout: 2000 }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * @name resolveNetwork
 * @description Derives the Solana network name from an RPC URL.
 */
function resolveNetwork(rpcUrl: string | undefined): string {
  if (!rpcUrl) return 'unknown';
  if (rpcUrl.includes('mainnet')) return 'mainnet-beta';
  if (rpcUrl.includes('testnet')) return 'testnet';
  if (rpcUrl.includes('devnet')) return 'devnet';
  return 'custom';
}

/**
 * @name buildRecommendedFlow
 * @description Returns the recommended agent workflow based on server mode.
 */
function buildRecommendedFlow(mode: string): string {
  if (mode === 'hosted-api') {
    return 'Hosted mode: use hosted reads directly, sap_payments_call_paid_tool for x402 paid hosted calls, sap_payments_register_agent/update_agent for wallet-owned registry writes, and sap_payments_finalize_transaction for hosted unsigned transactions. Never create signing scripts or read keypair JSON.';
  }
  if (mode === 'local-dev-keypair') {
    return 'Local mode: use sap_preview_transaction → sap_sign_transaction → sap_submit_signed_transaction for signing. The active profile keypair is available for direct signing.';
  }
  return 'Read-only mode: no signing available. Use read-only tools (sol_get_balance, jupiter_getQuote, sap_list_all_agents, etc.).';
}

/**
 * @name QuickContextInput
 * @description Parsed input for the sap_quick_context tool.
 */
interface QuickContextInput {
  include: string[];
  compact: boolean;
  maxChars: number;
  agentKnownVersion?: string;
  intent: SapAgentIntent;
}

/**
 * @name QuickContextSection
 * @description Identifiers for the optional sections that can be included or excluded.
 */
type QuickContextSection = 'version' | 'tools' | 'pricing' | 'premium' | 'skills' | 'nextAction';

/**
 * @name QuickContextPayload
 * @description Structured response returned by the sap_quick_context tool.
 */
interface QuickContextPayload {
  success: boolean;
  version: string;
  serverCommit: string;
  totalTools: number;
  toolsByCategory: Record<string, number>;
  toolCatalog: SapMcpToolCatalogContext | null;
  pricingTiers: string[];
  premiumPlugins: number;
  premiumCapabilities: number;
  premiumProvidersReady: number;
  skills: string[];
  skillsUpdateRequired: boolean;
  skillsContents?: Array<{ name: string; content: string }>;
  environment: { network: string; mode: string; authType: string; rateLimitPerMinute: number };
  recommendedFlow: string;
  summary: string;
  nextAction: string;
  sessionContextPacket: Record<string, unknown>;
  truncated: boolean;
}

const ALL_SECTIONS: readonly QuickContextSection[] = [
  'version',
  'tools',
  'pricing',
  'premium',
  'skills',
  'nextAction',
];

const DEFAULT_MAX_CHARS = 4000;

/**
 * @name registerQuickContextTool
 * @description Registers the free sap_quick_context bootstrap aggregation tool.
 * @param server - MCP server receiving the tool definition and handler.
 * @param context - Shared runtime context with SAP client, signer, policy, and configuration.
 */
export function registerQuickContextTool(server: Server, context: SapMcpContext): void {
  registerToolFamilyPipelineTool(
    server,
    context,
    'sap_quick_context',
    {
      title: 'SAP MCP Quick Context',
      description:
        'Free single-call bootstrap aggregator. Returns a compact markdown-like summary with server version, total tools count, tools by category, pricing tiers summary, premium plugins/capabilities count, bundled skills list, and nextAction guidance. Pass agentKnownVersion with the version you currently know to get skillsUpdateRequired + skillsContents (full SKILL.md inline) when the server version differs — this lets you auto-update your local skills in 1 call without a separate sap_skills_bundle. Use this instead of calling sap_agent_start, sap_pricing_catalog, sap_premium_plugin_catalog, sap_skills_list, and sap_get_tool_category_summary separately to reduce bootstrap from 5+ tool calls to 1.',
      inputSchema: {
        type: 'object',
        properties: {
          include: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional subset of section names to include (version, tools, pricing, premium, skills, nextAction). When omitted, all sections are returned.',
          },
          compact: {
            type: 'boolean',
            description: 'When true (default), the summary string is kept compact. When false, a more readable multi-line summary is returned.',
          },
          maxChars: {
            type: 'number',
            description: 'Maximum character length for the summary string. Defaults to 4000. The summary is truncated if it exceeds this length.',
          },
          agentKnownVersion: {
            type: 'string',
            description: 'The SAP MCP version the agent currently knows about. When this differs from the server version, skillsUpdateRequired is set to true and skillsContents is populated with full SKILL.md contents. Omit to always force a skills update (first bootstrap).',
          },
          intent: {
            type: 'string',
            enum: ['connection', 'paid-call', 'registry-write', 'update-agent', 'transaction-finalize', 'escrow', 'identity', 'swap', 'external-x402', 'premium-stream', 'balance', 'discovery', 'general'],
            description: 'Optional user intent for the embedded sessionContextPacket. Use this to route bootstrap toward paid calls, registry writes, swaps, escrow, external x402 agents, premium streams, balance reads, or discovery.',
          },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', description: 'Whether the quick context summary was generated.' },
          version: { type: 'string', description: 'SAP MCP server version.' },
          serverCommit: { type: 'string', description: 'Git commit hash of the running server build. Changes on every deploy even without version bump.' },
          totalTools: { type: 'number', description: 'Total number of registered MCP tools.' },
          toolsByCategory: { type: 'object', description: 'Tool counts by category (sap, sns, agentKit, premium, etc.).' },
          toolCatalog: { type: ['object', 'null'], description: 'Secret-free modular tool catalog summary with selected modules, payment tiers, signer-boundary policy buckets, and hosted/local bridge hints.' },
          pricingTiers: { type: 'array', description: 'Pricing tier names available on the hosted server.', items: { type: 'string' } },
          premiumPlugins: { type: 'number', description: 'Number of discoverable premium plugins.' },
          premiumCapabilities: { type: 'number', description: 'Number of premium capabilities across all plugins.' },
          premiumProvidersReady: { type: 'number', description: 'Number of premium providers with configured environment variables.' },
          skills: { type: 'array', description: 'Bundled skill names available via sap_skills_bundle.', items: { type: 'string' } },
          skillsUpdateRequired: { type: 'boolean', description: 'True when the server version differs from agentKnownVersion (or agentKnownVersion was omitted). When true, skillsContents contains the full SKILL.md contents of all bundled skills.' },
          skillsContents: { type: 'array', description: 'Full SKILL.md contents of all bundled skills, included only when skillsUpdateRequired is true. Each entry has {name, content}.', items: { type: 'object' } },
          environment: { type: 'object', description: 'Server environment summary: network (mainnet/devnet), mode (hosted-api/local-dev-keypair/readonly), authType (none/bearer), rateLimitPerMinute.', properties: { network: { type: 'string' }, mode: { type: 'string' }, authType: { type: 'string' }, rateLimitPerMinute: { type: 'number' } } },
          recommendedFlow: { type: 'string', description: 'Recommended agent workflow based on server mode. Hosted: build unsigned → sign locally. Local: preview → sign → submit.' },
          summary: { type: 'string', description: 'Compact markdown-like summary string suitable for agent context loading.' },
          nextAction: { type: 'string', description: 'Concrete next action for the agent after loading this context.' },
          sessionContextPacket: { type: 'object', description: 'Machine-readable SAP MCP routing, freshness, memory, proof-tape, and forbidden-action rules for this session.' },
          truncated: { type: 'boolean', description: 'Whether the summary was truncated to fit within maxChars.' },
        },
        required: ['success', 'version', 'serverCommit', 'totalTools', 'toolsByCategory', 'toolCatalog', 'pricingTiers', 'premiumPlugins', 'premiumCapabilities', 'premiumProvidersReady', 'skills', 'skillsUpdateRequired', 'environment', 'recommendedFlow', 'summary', 'nextAction', 'sessionContextPacket', 'truncated'],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      const parsed = parseQuickContextInput(input);
      const payload = buildQuickContextPayload(context, parsed);
      return payload as unknown as Record<string, unknown>;
    },
  );
}

/**
 * @name parseQuickContextInput
 * @description Narrows unknown MCP tool input into a typed QuickContextInput.
 * @param input - Raw tool input from the MCP caller.
 * @returns Parsed quick context input with defaults applied.
 */
function parseQuickContextInput(input: unknown): QuickContextInput {
  const record = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};

  const includeRaw = record.include;
  const include = Array.isArray(includeRaw)
    ? includeRaw.filter((item): item is string => typeof item === 'string')
    : [];

  const compact = typeof record.compact === 'boolean' ? record.compact : true;
  const maxChars = typeof record.maxChars === 'number' && record.maxChars > 0
    ? Math.floor(record.maxChars)
    : DEFAULT_MAX_CHARS;
  const agentKnownVersion = typeof record.agentKnownVersion === 'string' && record.agentKnownVersion.length > 0
    ? record.agentKnownVersion
    : undefined;
  const intent = normalizeSapAgentIntent(record.intent);

  return { include, compact, maxChars, agentKnownVersion, intent };
}

/**
 * @name resolveSections
 * @description Determines which sections to include based on the requested include list.
 * @param requested - Optional list of section names; empty means all sections.
 * @returns Set of section identifiers to include.
 */
function resolveSections(requested: string[]): Set<QuickContextSection> {
  if (requested.length === 0) {
    return new Set(ALL_SECTIONS);
  }

  const validSections = new Set<string>(ALL_SECTIONS);
  const resolved = new Set<QuickContextSection>();
  for (const raw of requested) {
    const lower = raw.toLowerCase();
    if (validSections.has(lower)) {
      resolved.add(lower as QuickContextSection);
    }
  }
  return resolved.size > 0 ? resolved : new Set(ALL_SECTIONS);
}

/**
 * @name buildQuickContextPayload
 * @description Assembles the structured quick context payload from server metadata, pricing, premium, and skills.
 * @param context - Shared runtime SAP MCP context.
 * @param input - Parsed tool input with include, compact, and maxChars.
 * @returns Structured quick context payload.
 */
function buildQuickContextPayload(context: SapMcpContext, input: QuickContextInput): QuickContextPayload {
  const sections = resolveSections(input.include);

  const plugins = listPremiumPlugins();
  const providerStatus = publicPremiumProviderStatus();
  const premiumCapabilitiesCount = plugins.reduce(
    (sum, plugin) => sum + plugin.capabilities.length,
    0,
  );
  const premiumProvidersReady = Object.values(providerStatus).filter(Boolean).length;
  const skills = listBundledSkillNames();

  // Skills auto-update: when the agent passes agentKnownVersion and it differs
  // from the server version (or agentKnownVersion is omitted — first bootstrap),
  // include the full SKILL.md contents inline so the agent can update its local
  // skills without a separate sap_skills_bundle call.
  const skillsUpdateRequired = !input.agentKnownVersion || input.agentKnownVersion !== MCP_SERVER_VERSION;
  const skillsContents = skillsUpdateRequired ? getBundledSkillContents() : undefined;

  const toolsByCategory = CAPABILITIES.tools.categories as Record<string, number>;
  const totalTools = CAPABILITIES.tools.count;

  // Build pricing tiers from the actual monetization config, not hardcoded values.
  // This ensures quick_context and estimate_tool_cost always agree.
  const monPrices = context.config.monetization?.prices ?? {
    microReadUsd: 0.001,
    readPremiumUsd: 0.002,
    builderUsd: 0.006,
    valueFixedUsd: 0.06,
    heavyValueUsd: 0.035,
  };
  const pricingTiers = [
    'free=$0',
    `micro-read=$${monPrices.microReadUsd ?? 0.001}`,
    `read-premium=$${monPrices.readPremiumUsd ?? 0.002}`,
    `builder=$${monPrices.builderUsd ?? 0.006}`,
    `value-action=$${monPrices.valueFixedUsd ?? 0.06}`,
    `heavy-value=$${monPrices.heavyValueUsd ?? 0.035}`,
    'batch=clamped sum',
  ];

  const summary = buildSummaryString({
    sections,
    compact: input.compact,
    maxChars: input.maxChars,
    version: MCP_SERVER_VERSION,
    totalTools,
    toolsByCategory,
    toolCatalog: context.toolCatalog ?? null,
    pricingTiers,
    premiumPlugins: plugins.length,
    premiumCapabilities: premiumCapabilitiesCount,
    premiumProvidersReady,
    skills,
    serverMode: context.config.mode,
  });

  return {
    success: true,
    version: MCP_SERVER_VERSION,
    serverCommit: getServerCommit(),
    totalTools,
    toolsByCategory,
    toolCatalog: context.toolCatalog ?? null,
    pricingTiers,
    premiumPlugins: plugins.length,
    premiumCapabilities: premiumCapabilitiesCount,
    premiumProvidersReady,
    skills,
    skillsUpdateRequired,
    ...(skillsUpdateRequired ? { skillsContents } : {}),
    environment: {
      network: resolveNetwork(context.config.rpcUrl),
      mode: context.config.mode,
      authType: process.env.SAP_HTTP_API_KEY ? 'bearer' : 'none',
      rateLimitPerMinute: context.config.rateLimitPerMinute,
    },
    recommendedFlow: buildRecommendedFlow(context.config.mode),
    summary: summary.text,
    nextAction: buildNextAction(sections),
    sessionContextPacket: buildSessionContextPacket(context, input.intent),
    truncated: summary.truncated,
  };
}

/**
 * @name SummaryParts
 * @description Inputs for building the compact summary string.
 */
interface SummaryParts {
  sections: Set<QuickContextSection>;
  compact: boolean;
  maxChars: number;
  version: string;
  totalTools: number;
  toolsByCategory: Record<string, number>;
  toolCatalog: SapMcpToolCatalogContext | null;
  pricingTiers: string[];
  premiumPlugins: number;
  premiumCapabilities: number;
  premiumProvidersReady: number;
  skills: string[];
  serverMode: string;
}

/**
 * @name buildSummaryString
 * @description Builds a compact markdown-like summary and truncates it to maxChars.
 * @param parts - Summary content inputs.
 * @returns Object with the summary text and a truncated flag.
 */
function buildSummaryString(parts: SummaryParts): { text: string; truncated: boolean } {
  const separator = parts.compact ? ' | ' : '\n';
  const lines: string[] = [];

  if (parts.sections.has('version')) {
    lines.push(`**SAP MCP v${parts.version}** (mode: ${parts.serverMode})`);
  }

  if (parts.sections.has('tools')) {
    const categoryLines = Object.entries(parts.toolsByCategory)
      .map(([category, count]) => `${category}:${count}`)
      .join(', ');
    const moduleCatalog = parts.toolCatalog
      ? `; modules:${parts.toolCatalog.moduleCount}, catalogTools:${parts.toolCatalog.toolCount}`
      : '';
    lines.push(`Tools: ${parts.totalTools} total (${categoryLines}${moduleCatalog})`);
  }

  if (parts.sections.has('pricing')) {
    lines.push(`Pricing tiers: ${parts.pricingTiers.join(', ')}`);
  }

  if (parts.sections.has('premium')) {
    lines.push(
      `Premium: ${parts.premiumPlugins} plugins, ${parts.premiumCapabilities} capabilities, ${parts.premiumProvidersReady} providers ready`,
    );
  }

  if (parts.sections.has('skills')) {
    const skillsList = parts.skills.length > 0 ? parts.skills.join(', ') : 'none';
    lines.push(`Skills: ${skillsList}`);
  }

  if (parts.sections.has('nextAction')) {
    lines.push(`Next: ${buildNextAction(parts.sections)}`);
  }

  const fullText = lines.join(separator);
  const truncated = fullText.length > parts.maxChars;
  const text = truncated
    ? `${fullText.slice(0, Math.max(0, parts.maxChars - 3))}...`
    : fullText;

  return { text, truncated };
}

/**
 * @name buildNextAction
 * @description Returns concrete next-action guidance for the agent based on included sections.
 * @param sections - Set of sections included in the response.
 * @returns Next action string.
 */
function buildNextAction(sections: Set<QuickContextSection>): string {
  if (!sections.has('nextAction')) {
    return 'Call sap_agent_start for the full startup playbook, then sap_skills_bundle with includeContents:true to load bundled skills.';
  }

  return [
    'Call sap_agent_start for the full startup playbook.',
    'On future sessions, pass agentKnownVersion to sap_quick_context to auto-update local skills when the server version changes.',
    'Then sap_skills_bundle with includeContents:true to load bundled skills.',
    'If the server version is newer than your local SAP MCP repo, update it: git pull origin main && pnpm run build && pm2 restart sap-mcp-remote (or npx @oobe-protocol-labs/sap-mcp-server@latest for client installs).',
    'Use sap_estimate_tool_cost before any paid tool call — set maxPriceUsd to estimate × 1.25.',
    'Use sap_payments_readiness before any write or paid workflow.',
    'Use sap_prepare_action before swaps, registry writes, escrow, external x402 calls, premium streams, or transaction finalization.',
    'Treat memory as operational context/proof tape only; never use it as cached truth for balances, prices, quotes, blockhashes, simulations, liquidity, or agent account state.',
    'For wallet/profile info: the hosted server is accountless — use sap_payments_profile_current (local bridge) not sap_profile_current.',
    'For signing: use sap_payments_finalize_transaction with signerProfile to sign with a specific profile — no need to switch .active-profile.',
    'For SOL/SPL transfers: use sap_build_sol_transfer or sap_build_spl_transfer (hosted builders), then sign locally with sap_payments_finalize_transaction.',
    'For perps: call sap_perp_builder_status first. If builderAvailable=false, use sap_perp_markets, chart tools, and sap_perp_trade_plan for analysis only and do not pay x402 for direct signer-only perps tools.',
    'For builder-supported writes, build unsigned on hosted and sign locally with sap_payments_finalize_transaction. For local-signer-only tools with no hosted builder, such as direct Adrena perps writes, stop and report the missing builder — do not route them through paid-call replay and do not create signing scripts.',
    'Namespace: hosted tools are mcp__sap__* (e.g. mcp__sap__jupiter_getQuote). Local bridge tools are mcp__sap_payments__* (e.g. mcp__sap_payments__sap_payments_finalize_transaction). Search both namespaces when looking for a tool.',
  ].join(' ');
}
