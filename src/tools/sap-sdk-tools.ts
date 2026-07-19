/**
 * SAP SDK MCP tools.
 *
 * This module intentionally wraps only methods that exist on
 * `@oobe-protocol-labs/synapse-sap-sdk@1.0.x`. It does not create local
 * facades for missing SDK namespaces and it does not fabricate network data.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { TOOL_CATEGORY_VALUES } from '@oobe-protocol-labs/synapse-sap-sdk';
import {
  SettlementMode,
  TokenType,
  type Capability,
  type CompactInscribeArgs,
  type CreateAttestationArgs,
  type CreateEscrowV2Args,
  type CreateSubscriptionArgs,
  type GiveFeedbackArgs,
  type InscribeMemoryArgs,
  type PricingTier,
  type RegisterAgentArgs,
  type UpdateAgentArgs,
  type UpdateFeedbackArgs,
  type UpdateToolArgs,
  type VolumeCurveBreakpoint,
  type AgentAccountData,
  type AgentStatsData,
  type ProtocolIndexData,
} from '@oobe-protocol-labs/synapse-sap-sdk/types';
import type { SapClient } from '@oobe-protocol-labs/synapse-sap-sdk';
import type { FairScaleTask } from '@oobe-protocol-labs/synapse-sap-sdk/registries/fairscale';
import type { ToolCategoryName } from '@oobe-protocol-labs/synapse-sap-sdk/registries/discovery';
import type { PaymentContext, PreparePaymentOptions, SettleOptions } from '@oobe-protocol-labs/synapse-sap-sdk/registries/x402';
import type { SapMcpContext } from '../core/types.js';
import { createTextResponse } from '../adapters/mcp/tool-response.js';
import { registerTool } from '../adapters/mcp/sdk-compat.js';
import { getSapClient, isSapClientInitialized } from '../sap/sap-client-manager.js';
import { logger } from '../core/logger.js';

type JsonRecord = Record<string, unknown>;
type SapToolHandler = (input: JsonRecord, client: SapClient) => Promise<unknown>;

interface ToolRegistration {
  name: string;
  title: string;
  description: string;
  inputSchema: unknown;
  handler: SapToolHandler;
}

const ESCROW_AMOUNT_DESCRIPTION =
  'Amount in the escrow token smallest unit: lamports for SOL, micro-USDC for USDC, or base units for the configured SPL token.';

const ESCROW_V2_COSIGNED_MODE = 1;
const ESCROW_V2_DISPUTE_WINDOW_MODE = 2;
const DEFAULT_ESCROW_V2_DISPUTE_WINDOW_SLOTS = new BN(2160);

const escrowV2CreateInputSchema = {
  agentWallet: {
    type: 'string',
    description: 'Agent owner wallet public key (base58). The V2 escrow PDA is derived from this wallet plus nonce.',
  },
  pricePerCall: {
    type: 'string',
    description: `Price per served call as a decimal string. ${ESCROW_AMOUNT_DESCRIPTION}`,
  },
  maxCalls: {
    type: 'string',
    description: 'Maximum number of calls covered by the escrow as a decimal string. Use 0 for unlimited when supported by policy.',
  },
  initialDeposit: {
    type: 'string',
    description: `Initial escrow deposit as a decimal string. ${ESCROW_AMOUNT_DESCRIPTION}`,
  },
  nonce: {
    type: 'string',
    description: 'Optional escrow nonce as a decimal string. Defaults to 0.',
  },
  expiresAt: {
    type: 'string',
    description: 'Optional expiry timestamp in unix seconds as a decimal string. Defaults to 0 (no expiry).',
  },
  tokenMint: {
    type: 'string',
    description: 'Optional SPL payment token mint. Omit/null for native SOL. Use EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v for mainnet USDC x402 escrows.',
  },
  tokenDecimals: {
    type: 'number',
    description: 'Payment token decimals. Defaults to 6 when tokenMint is set, otherwise 9 for native SOL.',
  },
  settlementSecurity: {
    type: 'number',
    enum: [1, 2],
    description: 'V2 settlement security mode. 1=CoSigned (requires coSigner). 2=DisputeWindow (recommended default; requires disputeWindowSlots > 0). SelfReport/0 is deprecated and rejected on-chain.',
  },
  disputeWindowSlots: {
    type: 'string',
    description: 'Required positive dispute window in slots for settlementSecurity=2. Defaults to 2160 (~15 minutes).',
  },
  coSigner: {
    type: 'string',
    description: 'Required co-signer wallet public key when settlementSecurity=1 (CoSigned).',
  },
  arbiter: {
    type: 'string',
    description: 'Optional arbiter public key kept for IDL compatibility and dispute workflows.',
  },
};

interface AnchorAccountResult<TAccount> {
  publicKey: PublicKey;
  account: TAccount;
}

interface AnchorAccountClient<TAccount> {
  all(): Promise<Array<AnchorAccountResult<TAccount>>>;
}

interface SapAnchorAccounts {
  agentAccount: AnchorAccountClient<AgentAccountData>;
  agentStats: AnchorAccountClient<AgentStatsData>;
  protocolIndex: AnchorAccountClient<ProtocolIndexData>;
}

interface SapAnchorProgram {
  account: SapAnchorAccounts;
}

interface AgentDirectoryEntry {
  agentPda: string;
  wallet: string;
  name: string;
  description: string;
  agentId: string | null;
  agentUri: string | null;
  x402Endpoint: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  reputationScore: number;
  totalFeedbacks: number;
  totalCallsServed: string;
  avgLatencyMs: number;
  uptimePercent: number;
  protocols: string[];
  indexedProtocols: string[];
  capabilities: string[];
  activePlugins: string[];
}

interface ProtocolIndexSummary {
  pda: string;
  protocolId: string;
  agentCount: number;
  lastUpdated: string;
}

interface AgentDirectoryFilters {
  includeInactive: boolean;
  protocol?: string;
  capability?: string;
  capabilities?: string[];
  capabilityMode?: 'any' | 'all';
  query?: string;
  wallet?: string;
  agentPda?: string;
  hasX402Endpoint?: boolean;
}

interface AgentDirectoryPageOptions extends AgentDirectoryFilters {
  limit: number;
  offset: number;
  view: 'compact' | 'full';
  includeProtocolIndexes: boolean;
}

interface AgentDirectoryPage {
  source: string;
  overview: unknown;
  filters: JsonRecord;
  count: number;
  totalEnumerated: number;
  returned: number;
  offset: number;
  limit: number;
  truncated: boolean;
  pagination: {
    total: number;
    returned: number;
    offset: number;
    limit: number;
    hasMore: boolean;
    nextOffset: number | null;
    nextCursor: string | null;
  };
  totalAgentAccounts: number;
  activeAgentAccounts: number;
  protocolIndexes?: ProtocolIndexSummary[];
  agents: Array<AgentDirectoryEntry | JsonRecord>;
  agentGuidance: JsonRecord;
}

/**
 * @name jsonReplacer
 * @description Serializes SDK values such as PublicKey, BN, bigint, Buffer, and Uint8Array into JSON-safe output.
 */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof PublicKey) {
    return value.toBase58();
  }

  if (BN.isBN(value)) {
    return value.toString(10);
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Uint8Array) {
    return Array.from(value);
  }

  return value;
}

/**
 * @name ok
 * @description Wraps a successful tool result in the MCP text response shape.
 */
function ok(payload: unknown) {
  return createTextResponse(JSON.stringify({ success: true, ...asObjectPayload(payload) }, jsonReplacer, 2));
}

/**
 * @name asObjectPayload
 * @description Preserves object payloads and wraps scalar payloads under `result`.
 */
function asObjectPayload(payload: unknown): JsonRecord {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as JsonRecord
    : { result: payload };
}

/**
 * @name getSapAnchorAccounts
 * @description Narrows the SDK Anchor program account namespace used for global read-only enumeration.
 */
function getSapAnchorAccounts(client: SapClient): SapAnchorAccounts {
  return (client.program as unknown as SapAnchorProgram).account;
}

/**
 * @name bnString
 * @description Converts BN-like SDK counters into stable decimal strings.
 */
function bnString(value: BN | number): string {
  return BN.isBN(value) ? value.toString(10) : String(value);
}

/**
 * @name buildProtocolMembership
 * @description Builds an agent PDA to protocol ID lookup from protocol index accounts.
 */
function buildProtocolMembership(protocolIndexes: Array<AnchorAccountResult<ProtocolIndexData>>): Map<string, string[]> {
  const membership = new Map<string, string[]>();

  for (const { account } of protocolIndexes) {
    for (const agent of account.agents) {
      const agentPda = agent.toBase58();
      const protocols = membership.get(agentPda) ?? [];
      protocols.push(account.protocolId);
      membership.set(agentPda, protocols);
    }
  }

  return membership;
}

/**
 * @name summarizeProtocolIndexes
 * @description Converts protocol index accounts into compact MCP-safe summaries.
 */
function summarizeProtocolIndexes(protocolIndexes: Array<AnchorAccountResult<ProtocolIndexData>>): ProtocolIndexSummary[] {
  return protocolIndexes
    .map(({ publicKey, account }) => ({
      pda: publicKey.toBase58(),
      protocolId: account.protocolId,
      agentCount: account.agents.length,
      lastUpdated: bnString(account.lastUpdated),
    }))
    .sort((left, right) => left.protocolId.localeCompare(right.protocolId));
}

function normalizeDirectoryToken(value: string): string {
  return value.trim().toLowerCase();
}

function matchesNormalizedValue(values: readonly string[], expected: string): boolean {
  const normalizedExpected = normalizeDirectoryToken(expected);
  return values.some((value) => normalizeDirectoryToken(value) === normalizedExpected);
}

function matchesNormalizedSubstring(values: readonly string[], query: string): boolean {
  return values.some((value) => normalizeDirectoryToken(value).includes(query));
}

function encodeDirectoryCursor(offset: number): string {
  return encodeDirectoryCursorPayload(offset);
}

function decodeDirectoryCursor(cursor: string | undefined): number | undefined {
  if (!cursor) {
    return undefined;
  }
  try {
    const parsed = decodeDirectoryCursorPayload(cursor);
    const offset = parsed.offset;
    return typeof offset === 'number' && Number.isInteger(offset) && offset >= 0 ? offset : undefined;
  } catch {
    throw new Error('cursor must be a nextCursor value returned by sap_list_all_agents or sap_discover_agents');
  }
}

function encodeDirectoryCursorPayload(offset: number): string {
  const base64 = Buffer.from(JSON.stringify({ offset }), 'utf-8').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function decodeDirectoryCursorPayload(cursor: string): JsonRecord {
  const padded = cursor.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(cursor.length / 4) * 4, '=');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8')) as JsonRecord;
}

/**
 * @name buildAgentDirectoryEntry
 * @description Converts an AgentAccount into a compact directory row with optional stats and protocol-index membership.
 */
function buildAgentDirectoryEntry(
  accountResult: AnchorAccountResult<AgentAccountData>,
  statsByAgent: ReadonlyMap<string, AgentStatsData>,
  indexedProtocolsByAgent: ReadonlyMap<string, string[]>
): AgentDirectoryEntry {
  const agentPda = accountResult.publicKey.toBase58();
  const account = accountResult.account;
  const stats = statsByAgent.get(agentPda);

  return {
    agentPda,
    wallet: account.wallet.toBase58(),
    name: account.name,
    description: account.description,
    agentId: account.agentId,
    agentUri: account.agentUri,
    x402Endpoint: account.x402Endpoint,
    isActive: account.isActive,
    createdAt: bnString(account.createdAt),
    updatedAt: bnString(account.updatedAt),
    reputationScore: account.reputationScore,
    totalFeedbacks: account.totalFeedbacks,
    totalCallsServed: stats ? bnString(stats.totalCallsServed) : bnString(account.totalCallsServed),
    avgLatencyMs: account.avgLatencyMs,
    uptimePercent: account.uptimePercent,
    protocols: account.protocols,
    indexedProtocols: indexedProtocolsByAgent.get(agentPda) ?? [],
    capabilities: account.capabilities.map((capability) => capability.id),
    activePlugins: account.activePlugins.map((plugin) => `${plugin.pluginType}:${plugin.pda.toBase58()}`),
  };
}

/**
 * @name matchesAgentDirectoryFilters
 * @description Applies optional directory filters to an already hydrated agent row.
 */
function matchesAgentDirectoryFilters(entry: AgentDirectoryEntry, filters: {
  includeInactive: boolean;
  protocol?: string;
  capability?: string;
  capabilities?: string[];
  capabilityMode?: 'any' | 'all';
  query?: string;
  wallet?: string;
  agentPda?: string;
  hasX402Endpoint?: boolean;
}): boolean {
  if (!filters.includeInactive && !entry.isActive) {
    return false;
  }

  if (filters.wallet && normalizeDirectoryToken(entry.wallet) !== normalizeDirectoryToken(filters.wallet)) {
    return false;
  }

  if (filters.agentPda && normalizeDirectoryToken(entry.agentPda) !== normalizeDirectoryToken(filters.agentPda)) {
    return false;
  }

  if (filters.hasX402Endpoint !== undefined && Boolean(entry.x402Endpoint) !== filters.hasX402Endpoint) {
    return false;
  }

  if (
    filters.protocol
    && !matchesNormalizedValue(entry.protocols, filters.protocol)
    && !matchesNormalizedValue(entry.indexedProtocols, filters.protocol)
  ) {
    return false;
  }

  const requiredCapabilities = [
    ...(filters.capability ? [filters.capability] : []),
    ...(filters.capabilities ?? []),
  ];
  if (requiredCapabilities.length > 0) {
    const mode = filters.capabilityMode ?? 'any';
    const predicate = (capability: string) => matchesNormalizedValue(entry.capabilities, capability);
    if (mode === 'all' ? !requiredCapabilities.every(predicate) : !requiredCapabilities.some(predicate)) {
      return false;
    }
  }

  const query = filters.query ? normalizeDirectoryToken(filters.query) : undefined;
  if (query) {
    const searchableValues = [
      entry.agentPda,
      entry.wallet,
      entry.name,
      entry.description,
      entry.agentId,
      entry.agentUri,
      entry.x402Endpoint,
      ...entry.protocols,
      ...entry.indexedProtocols,
      ...entry.capabilities,
      ...entry.activePlugins,
    ].filter((value): value is string => typeof value === 'string');

    if (!matchesNormalizedSubstring(searchableValues, query)) {
      return false;
    }
  }

  return true;
}

function compactAgentDirectoryEntry(entry: AgentDirectoryEntry): JsonRecord {
  return {
    agentPda: entry.agentPda,
    wallet: entry.wallet,
    name: entry.name,
    description: entry.description,
    agentId: entry.agentId,
    x402Endpoint: entry.x402Endpoint,
    isActive: entry.isActive,
    protocols: entry.protocols,
    indexedProtocols: entry.indexedProtocols,
    capabilities: entry.capabilities,
    reputationScore: entry.reputationScore,
    totalCallsServed: entry.totalCallsServed,
    uptimePercent: entry.uptimePercent,
    createdAt: entry.createdAt,
  };
}

function directoryAgentGuidance(page: {
  hasMore: boolean;
  nextCursor: string | null;
  filters: AgentDirectoryFilters;
}): JsonRecord {
  return {
    paidHostedRead: true,
    useThisWhen: [
      'The user asks to find SAP agents, list the ecosystem, inspect available on-chain agents, or discover x402-enabled agents.',
      'Use query/protocol/capability/capabilities filters first; avoid repeated broad scans.',
    ],
    pagination: page.hasMore
      ? `Call the same tool with cursor="${page.nextCursor}" to fetch the next page.`
      : 'No further page is available for the current filters.',
    nextTools: [
      'sap_get_agent_profile with wallet for one hydrated owner profile.',
      'sap_fetch_protocol_index with protocolId when the user wants protocol membership.',
      'sap_fetch_capability_index with capabilityId when the user wants a capability-specific index.',
      'sap_x402_estimate_cost before calling a paid x402 endpoint exposed by a discovered agent.',
    ],
    matchingNotes: {
      query: 'Matches name, description, agentId, wallet, PDA, endpoint, protocols, capabilities, and active plugin labels.',
      capability: 'Capability matching is case-insensitive and exact after trimming. For multiple capabilities set capabilityMode to any or all.',
      x402: 'Set hasX402Endpoint=true to find agents that advertise paid HTTP/x402 resources.',
    },
  };
}

async function buildAgentDirectoryPage(client: SapClient, options: AgentDirectoryPageOptions): Promise<AgentDirectoryPage> {
  const accounts = getSapAnchorAccounts(client);

  const [agentAccounts, statsAccounts, protocolIndexes, overview] = await Promise.all([
    accounts.agentAccount.all(),
    accounts.agentStats.all(),
    accounts.protocolIndex.all(),
    client.discovery.getNetworkOverview(),
  ]);

  const statsByAgent = new Map(
    statsAccounts.map(({ account }) => [account.agent.toBase58(), account] as const)
  );
  const indexedProtocolsByAgent = buildProtocolMembership(protocolIndexes);
  const filteredAgents = agentAccounts
    .map((account) => buildAgentDirectoryEntry(account, statsByAgent, indexedProtocolsByAgent))
    .filter((entry) => matchesAgentDirectoryFilters(entry, options))
    .sort((left, right) => Number(right.createdAt) - Number(left.createdAt));

  const page = filteredAgents.slice(options.offset, options.offset + options.limit);
  const hasMore = options.offset + page.length < filteredAgents.length;
  const nextOffset = hasMore ? options.offset + page.length : null;
  const nextCursor = nextOffset === null ? null : encodeDirectoryCursor(nextOffset);
  const agents = options.view === 'compact' ? page.map(compactAgentDirectoryEntry) : page;

  return {
    source: 'program.account.agentAccount.all + program.account.protocolIndex.all',
    overview,
    filters: {
      includeInactive: options.includeInactive,
      protocol: options.protocol ?? null,
      capability: options.capability ?? null,
      capabilities: options.capabilities ?? [],
      capabilityMode: options.capabilityMode ?? 'any',
      query: options.query ?? null,
      wallet: options.wallet ?? null,
      agentPda: options.agentPda ?? null,
      hasX402Endpoint: options.hasX402Endpoint ?? null,
      view: options.view,
    },
    count: page.length,
    totalEnumerated: filteredAgents.length,
    returned: page.length,
    offset: options.offset,
    limit: options.limit,
    truncated: hasMore,
    pagination: {
      total: filteredAgents.length,
      returned: page.length,
      offset: options.offset,
      limit: options.limit,
      hasMore,
      nextOffset,
      nextCursor,
    },
    totalAgentAccounts: agentAccounts.length,
    activeAgentAccounts: agentAccounts.filter(({ account }) => account.isActive).length,
    protocolIndexes: options.includeProtocolIndexes ? summarizeProtocolIndexes(protocolIndexes) : undefined,
    agents,
    agentGuidance: directoryAgentGuidance({ hasMore, nextCursor, filters: options }),
  };
}

function parseCapabilityMode(input: JsonRecord): 'any' | 'all' {
  const mode = optionalString(input, 'capabilityMode')?.trim().toLowerCase();
  if (!mode) {
    return 'any';
  }
  if (mode === 'any' || mode === 'all') {
    return mode;
  }
  throw new Error('capabilityMode must be "any" or "all"');
}

function parseOptionalStringArray(input: JsonRecord, field: string): string[] {
  const value = input[field];
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array of strings`);
  }
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

function parseDirectoryOffset(input: JsonRecord): number {
  return Math.max(0, decodeDirectoryCursor(optionalString(input, 'cursor')) ?? optionalNumber(input, 'offset') ?? 0);
}

function parseDirectoryView(input: JsonRecord): 'compact' | 'full' {
  const view = optionalString(input, 'view');
  if (!view && input.hydrate === true) {
    return 'full';
  }
  if (!view || view === 'compact') {
    return 'compact';
  }
  if (view === 'full') {
    return 'full';
  }
  throw new Error('view must be "compact" or "full"');
}

function parseHasX402Endpoint(input: JsonRecord): boolean | undefined {
  return optionalBoolean(input, 'hasX402Endpoint');
}

function makeAgentDirectoryInputSchema(defaultLimit: number): JsonRecord {
  return {
    query: {
      type: 'string',
      description: 'Optional text search across name, description, agentId, wallet, PDA, x402 endpoint, protocols, capabilities, and active plugins. Example: "XONA" or "creative".',
    },
    wallet: {
      type: 'string',
      description: 'Optional exact owner wallet public key filter. Use this when a wallet is known; it is the most reliable lookup path.',
    },
    agentPda: {
      type: 'string',
      description: 'Optional exact SAP agent PDA filter.',
    },
    protocol: {
      type: 'string',
      description: 'Optional protocol filter matched case-insensitively against agent protocols and protocol-index membership. Example: "jupiter", "creative", "payments".',
    },
    capability: {
      type: 'string',
      description: 'Optional single capability ID filter matched case-insensitively. Example: "creative:imageGeneration" or "jupiter:swap".',
    },
    capabilities: {
      type: 'array',
      items: { type: 'string' },
      description: 'Optional list of capability IDs. Use capabilityMode="all" when the agent must have every capability.',
    },
    capabilityMode: {
      type: 'string',
      enum: ['any', 'all'],
      description: 'How to match the capability/capabilities filters. Defaults to "any".',
    },
    hasX402Endpoint: {
      type: 'boolean',
      description: 'Optional filter for agents that advertise a paid HTTP/x402 endpoint.',
    },
    includeInactive: {
      type: 'boolean',
      description: 'Include inactive agents. Defaults to false.',
    },
    limit: {
      type: 'number',
      description: `Maximum rows to return. Defaults to ${defaultLimit}; hard-capped at 500.`,
    },
    offset: {
      type: 'number',
      description: 'Zero-based pagination offset. Defaults to 0. Prefer cursor after the first page when nextCursor is returned.',
    },
    cursor: {
      type: 'string',
      description: 'Opaque pagination cursor returned as pagination.nextCursor by a previous sap_list_all_agents or sap_discover_agents call.',
    },
    view: {
      type: 'string',
      enum: ['compact', 'full'],
      description: 'Result shape. Use compact for broad discovery and full for detailed rows. Defaults to compact.',
    },
    hydrate: {
      type: 'boolean',
      description: 'Deprecated compatibility alias. Use view="full" for full rows or view="compact" for directory rows.',
    },
    includeProtocolIndexes: {
      type: 'boolean',
      description: 'Include compact protocol index summaries. Defaults to false for sap_discover_agents and true for sap_list_all_agents.',
    },
  };
}

/**
 * @name asRecord
 * @description Normalizes MCP tool input into an object.
 */
function asRecord(input: unknown): JsonRecord {
  return input && typeof input === 'object' && !Array.isArray(input) ? input as JsonRecord : {};
}

/**
 * @name requiredString
 * @description Reads a required string field from tool input.
 */
function requiredString(input: JsonRecord, field: string): string {
  const value = input[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} is required`);
  }
  return value;
}

/**
 * @name optionalString
 * @description Reads an optional string field from tool input.
 */
function optionalString(input: JsonRecord, field: string): string | undefined {
  const value = input[field];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * @name requiredNumber
 * @description Reads a required finite number field from tool input.
 */
function requiredNumber(input: JsonRecord, field: string): number {
  const value = input[field];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  throw new Error(`${field} must be a finite number`);
}

/**
 * @name optionalNumber
 * @description Reads an optional finite number field from tool input.
 */
function optionalNumber(input: JsonRecord, field: string): number | undefined {
  const value = input[field];
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return requiredNumber(input, field);
}

/**
 * @name requiredBn
 * @description Reads a numeric field and converts it to BN for SAP SDK calls.
 */
function requiredBn(input: JsonRecord, field: string): BN {
  const value = input[field];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new BN(Math.trunc(value));
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    return new BN(value, 10);
  }
  throw new Error(`${field} must be an integer number or decimal string`);
}

/**
 * @name optionalBn
 * @description Reads an optional numeric field and converts it to BN.
 */
function optionalBn(input: JsonRecord, field: string, fallback: BN): BN {
  const value = input[field];
  return value === undefined || value === null || value === '' ? fallback : requiredBn(input, field);
}

/**
 * @name optionalBoolean
 * @description Reads an optional boolean field from tool input.
 */
function optionalBoolean(input: JsonRecord, field: string): boolean | undefined {
  const value = input[field];
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string' && (value === 'true' || value === 'false')) {
    return value === 'true';
  }
  throw new Error(`${field} must be a boolean`);
}

/**
 * @name requiredPublicKey
 * @description Reads a required base58 public key field from tool input.
 */
function requiredPublicKey(input: JsonRecord, field: string): PublicKey {
  return new PublicKey(requiredString(input, field));
}

/**
 * @name optionalPublicKey
 * @description Reads an optional base58 public key field from tool input.
 */
function optionalPublicKey(input: JsonRecord, field: string): PublicKey | undefined {
  const value = optionalString(input, field);
  return value ? new PublicKey(value) : undefined;
}

/**
 * @name parseVolumeCurve
 * @description Converts MCP JSON input into SDK volume-curve breakpoints.
 */
function parseVolumeCurve(value: unknown): VolumeCurveBreakpoint[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error('volumeCurve must be an array');
  }

  return value.map((item) => {
    const record = asRecord(item);
    return {
      afterCalls: requiredNumber(record, 'afterCalls'),
      pricePerCall: requiredBn(record, 'pricePerCall'),
    };
  });
}

/**
 * @name requiredBytes
 * @description Reads byte-array fields used for hashes, nonces, and encrypted payloads.
 */
function requiredBytes(input: JsonRecord, field: string, expectedLength?: number): number[] {
  const value = input[field];
  let bytes: number[];

  if (Array.isArray(value)) {
    bytes = value.map((item) => {
      if (typeof item !== 'number' || item < 0 || item > 255 || !Number.isInteger(item)) {
        throw new Error(`${field} must contain byte values between 0 and 255`);
      }
      return item;
    });
  } else if (typeof value === 'string') {
    const normalized = value.startsWith('0x') ? value.slice(2) : value;
    if (/^[0-9a-fA-F]+$/.test(normalized) && normalized.length % 2 === 0) {
      bytes = Array.from(Buffer.from(normalized, 'hex'));
    } else {
      bytes = Array.from(Buffer.from(value, 'base64'));
    }
  } else {
    throw new Error(`${field} must be a byte array, hex string, or base64 string`);
  }

  if (expectedLength !== undefined && bytes.length !== expectedLength) {
    throw new Error(`${field} must be ${expectedLength} bytes`);
  }

  return bytes;
}

/**
 * @name optionalBytes
 * @description Reads an optional byte-array field.
 */
function optionalBytes(input: JsonRecord, field: string, fallback: number[] = []): number[] {
  return input[field] === undefined || input[field] === null ? fallback : requiredBytes(input, field);
}

/**
 * @name optionalFairScaleTask
 * @description Reads an optional FairScale task value supported by the SDK.
 */
function optionalFairScaleTask(input: JsonRecord, field: string): FairScaleTask | undefined {
  const value = optionalString(input, field);
  if (!value) {
    return undefined;
  }
  if (value === 'defi_execution' || value === 'trust_focused' || value === 'work_focused' || value === 'hiring') {
    return value;
  }
  throw new Error(`${field} must be one of defi_execution, trust_focused, work_focused, hiring`);
}

/**
 * @name requiredToolCategory
 * @description Reads a tool category compatible with SDK DiscoveryRegistry.findToolsByCategory.
 */
function requiredToolCategory(input: JsonRecord): ToolCategoryName | number {
  const rawCategory = input.category;
  if (typeof rawCategory === 'number') {
    return rawCategory;
  }

  const category = requiredString(input, 'category');
  if (category in TOOL_CATEGORY_VALUES) {
    return category as ToolCategoryName;
  }

  throw new Error(`category must be a numeric category or one of ${Object.keys(TOOL_CATEGORY_VALUES).join(', ')}`);
}

/**
 * @name parseCapabilities
 * @description Converts user input into SDK `Capability[]` values.
 */
function parseCapabilities(value: unknown): Capability[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error('capabilities must be an array');
  }

  return value.map((item) => {
    if (typeof item === 'string') {
      return { id: item, description: null, protocolId: null, version: null };
    }
    const record = asRecord(item);
    return {
      id: requiredString(record, 'id'),
      description: optionalString(record, 'description') ?? null,
      protocolId: optionalString(record, 'protocolId') ?? null,
      version: optionalString(record, 'version') ?? null,
    };
  });
}

/**
 * @name parsePricingTiers
 * @description Converts user input into SDK `PricingTier[]` values.
 */
function parsePricingTiers(value: unknown): PricingTier[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error('pricing must be an array');
  }

  return value.map((item) => {
    const record = asRecord(item);
    const pricePerCall = optionalBn(record, 'pricePerCall', new BN(0));
    return {
      tierId: optionalString(record, 'tierId') ?? 'default',
      pricePerCall,
      minPricePerCall: record.minPricePerCall === undefined ? null : requiredBn(record, 'minPricePerCall'),
      maxPricePerCall: record.maxPricePerCall === undefined ? null : requiredBn(record, 'maxPricePerCall'),
      rateLimit: optionalNumber(record, 'rateLimit') ?? 60,
      maxCallsPerSession: optionalNumber(record, 'maxCallsPerSession') ?? 1_000,
      burstLimit: optionalNumber(record, 'burstLimit') ?? null,
      tokenType: TokenType.Sol,
      tokenMint: optionalPublicKey(record, 'tokenMint') ?? null,
      tokenDecimals: optionalNumber(record, 'tokenDecimals') ?? null,
      settlementMode: SettlementMode.Escrow,
      minEscrowDeposit: record.minEscrowDeposit === undefined ? null : requiredBn(record, 'minEscrowDeposit'),
      batchIntervalSec: optionalNumber(record, 'batchIntervalSec') ?? null,
      volumeCurve: null,
    };
  });
}

/**
 * @name parseProtocols
 * @description Converts user input into SDK protocol identifiers.
 */
function parseProtocols(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error('protocols must be an array');
  }
  return value.map((item) => {
    if (typeof item !== 'string' || item.length === 0) {
      throw new Error('protocols must contain non-empty strings');
    }
    return item;
  });
}

/**
 * @name parseRegisterAgentArgs
 * @description Builds strongly typed `RegisterAgentArgs` from MCP JSON input.
 */
export function parseRegisterAgentArgs(input: JsonRecord): RegisterAgentArgs {
  return {
    name: requiredString(input, 'name'),
    description: requiredString(input, 'description'),
    capabilities: parseCapabilities(input.capabilities),
    pricing: parsePricingTiers(input.pricing),
    protocols: parseProtocols(input.protocols),
    agentId: optionalString(input, 'agentId') ?? null,
    agentUri: optionalString(input, 'agentUri') ?? optionalString(input, 'metadataUri') ?? null,
    x402Endpoint: optionalString(input, 'x402Endpoint') ?? null,
  };
}

/**
 * @name parseUpdateAgentArgs
 * @description Builds strongly typed `UpdateAgentArgs` from MCP JSON input.
 */
function parseUpdateAgentArgs(input: JsonRecord): UpdateAgentArgs {
  return {
    name: optionalString(input, 'name') ?? null,
    description: optionalString(input, 'description') ?? null,
    capabilities: input.capabilities === undefined ? null : parseCapabilities(input.capabilities),
    pricing: input.pricing === undefined ? null : parsePricingTiers(input.pricing),
    protocols: input.protocols === undefined ? null : parseProtocols(input.protocols),
    agentId: optionalString(input, 'agentId') ?? null,
    agentUri: optionalString(input, 'agentUri') ?? optionalString(input, 'metadataUri') ?? null,
    x402Endpoint: optionalString(input, 'x402Endpoint') ?? null,
  };
}

/**
 * @name parseX402PreparePaymentOptions
 * @description Builds typed x402 payment preparation options from MCP JSON input.
 */
function parseX402PreparePaymentOptions(input: JsonRecord): PreparePaymentOptions {
  return {
    pricePerCall: requiredString(input, 'pricePerCall'),
    deposit: requiredString(input, 'deposit'),
    maxCalls: optionalString(input, 'maxCalls'),
    expiresAt: optionalString(input, 'expiresAt'),
    volumeCurve: parseVolumeCurve(input.volumeCurve).map(point => ({
      afterCalls: point.afterCalls,
      pricePerCall: point.pricePerCall,
    })),
    nonce: optionalString(input, 'nonce'),
    tokenMint: optionalPublicKey(input, 'tokenMint') ?? null,
    tokenDecimals: optionalNumber(input, 'tokenDecimals'),
    networkIdentifier: optionalString(input, 'networkIdentifier'),
  };
}

/**
 * @name parsePaymentContext
 * @description Reconstructs a safe x402 payment context from public MCP fields.
 */
function parsePaymentContext(input: JsonRecord): PaymentContext {
  return {
    escrowPda: requiredPublicKey(input, 'escrowPda'),
    agentPda: requiredPublicKey(input, 'agentPda'),
    agentWallet: requiredPublicKey(input, 'agentWallet'),
    depositorWallet: requiredPublicKey(input, 'depositorWallet'),
    pricePerCall: requiredBn(input, 'pricePerCall'),
    maxCalls: requiredBn(input, 'maxCalls'),
    nonce: optionalBn(input, 'nonce', new BN(0)),
    txSignature: requiredString(input, 'txSignature'),
    networkIdentifier: requiredString(input, 'networkIdentifier'),
  };
}

/**
 * @name parseSettleOptions
 * @description Builds optional SDK settlement tuning options from MCP JSON input.
 */
function parseSettleOptions(input: JsonRecord): SettleOptions | undefined {
  const priorityFeeMicroLamports = optionalNumber(input, 'priorityFeeMicroLamports');
  const computeUnits = optionalNumber(input, 'computeUnits');
  const skipPreflight = optionalBoolean(input, 'skipPreflight');
  const commitment = optionalString(input, 'commitment');
  const maxRetries = optionalNumber(input, 'maxRetries');

  if (
    priorityFeeMicroLamports === undefined
    && computeUnits === undefined
    && skipPreflight === undefined
    && commitment === undefined
    && maxRetries === undefined
  ) {
    return undefined;
  }

  if (commitment !== undefined && commitment !== 'processed' && commitment !== 'confirmed' && commitment !== 'finalized') {
    throw new Error('commitment must be processed, confirmed, or finalized');
  }

  return {
    ...(priorityFeeMicroLamports !== undefined ? { priorityFeeMicroLamports } : {}),
    ...(computeUnits !== undefined ? { computeUnits } : {}),
    ...(skipPreflight !== undefined ? { skipPreflight } : {}),
    ...(commitment !== undefined ? { commitment } : {}),
    ...(maxRetries !== undefined ? { maxRetries } : {}),
  };
}

/**
 * @name parseX402BatchSettlementEntries
 * @description Converts MCP JSON input into SDK x402 batch-settlement entries.
 */
function parseX402BatchSettlementEntries(value: unknown): Array<{ calls: number; serviceData: string }> {
  if (!Array.isArray(value)) {
    throw new Error('entries must be an array');
  }

  return value.map((item) => {
    const record = asRecord(item);
    return {
      calls: requiredNumber(record, 'calls'),
      serviceData: requiredString(record, 'serviceData'),
    };
  });
}

/**
 * @name parseEscrowV2Args
 * @description Builds typed V2 escrow creation args from MCP JSON input.
 */
function parseEscrowV2Args(input: JsonRecord): CreateEscrowV2Args {
  const tokenMint = optionalPublicKey(input, 'tokenMint') ?? null;
  const settlementSecurity = optionalNumber(input, 'settlementSecurity') ?? ESCROW_V2_DISPUTE_WINDOW_MODE;
  if (settlementSecurity === 0) {
    throw new Error('settlementSecurity=0 / SelfReport is deprecated and rejected by the current SAP program. Use 1 (CoSigned) or 2 (DisputeWindow).');
  }
  if (settlementSecurity !== ESCROW_V2_COSIGNED_MODE && settlementSecurity !== ESCROW_V2_DISPUTE_WINDOW_MODE) {
    throw new Error('settlementSecurity must be 1 (CoSigned) or 2 (DisputeWindow).');
  }

  const coSigner = optionalPublicKey(input, 'coSigner') ?? null;
  if (settlementSecurity === ESCROW_V2_COSIGNED_MODE && !coSigner) {
    throw new Error('coSigner is required when settlementSecurity=1 (CoSigned).');
  }

  const disputeWindowSlots = optionalBn(
    input,
    'disputeWindowSlots',
    settlementSecurity === ESCROW_V2_DISPUTE_WINDOW_MODE ? DEFAULT_ESCROW_V2_DISPUTE_WINDOW_SLOTS : new BN(0)
  );
  if (settlementSecurity === ESCROW_V2_DISPUTE_WINDOW_MODE && disputeWindowSlots.lte(new BN(0))) {
    throw new Error('disputeWindowSlots must be positive when settlementSecurity=2 (DisputeWindow).');
  }

  return {
    escrowNonce: optionalBn(input, 'nonce', new BN(0)),
    pricePerCall: requiredBn(input, 'pricePerCall'),
    maxCalls: requiredBn(input, 'maxCalls'),
    initialDeposit: requiredBn(input, 'initialDeposit'),
    expiresAt: optionalBn(input, 'expiresAt', new BN(0)),
    volumeCurve: [],
    tokenMint,
    tokenDecimals: optionalNumber(input, 'tokenDecimals') ?? (tokenMint ? 6 : 9),
    settlementSecurity,
    disputeWindowSlots,
    coSigner,
    arbiter: optionalPublicKey(input, 'arbiter') ?? null,
  };
}

/**
 * @name parseFeedbackArgs
 * @description Builds typed feedback args from MCP JSON input.
 */
function parseFeedbackArgs(input: JsonRecord): GiveFeedbackArgs {
  return {
    score: requiredNumber(input, 'score'),
    tag: optionalString(input, 'tag') ?? 'general',
    commentHash: input.commentHash === undefined ? null : requiredBytes(input, 'commentHash', 32),
  };
}

/**
 * @name parseUpdateFeedbackArgs
 * @description Builds typed feedback update args from MCP JSON input.
 */
function parseUpdateFeedbackArgs(input: JsonRecord): UpdateFeedbackArgs {
  return {
    newScore: requiredNumber(input, 'score'),
    newTag: optionalString(input, 'tag') ?? null,
    commentHash: input.commentHash === undefined ? null : requiredBytes(input, 'commentHash', 32),
  };
}

/**
 * @name parseAttestationArgs
 * @description Builds typed attestation creation args from MCP JSON input.
 */
function parseAttestationArgs(input: JsonRecord): CreateAttestationArgs {
  return {
    attestationType: optionalString(input, 'attestationType') ?? 'generic',
    metadataHash: requiredBytes(input, 'metadataHash', 32),
    expiresAt: optionalBn(input, 'expiresAt', new BN(0)),
  };
}

/**
 * @name parseSubscriptionArgs
 * @description Builds typed subscription creation args from MCP JSON input.
 */
function parseSubscriptionArgs(input: JsonRecord): CreateSubscriptionArgs {
  return {
    subId: optionalBn(input, 'subId', new BN(0)),
    pricePerInterval: requiredBn(input, 'pricePerInterval'),
    billingInterval: requiredNumber(input, 'billingInterval'),
    initialFund: requiredBn(input, 'initialFund'),
  };
}

/**
 * @name parseMemoryArgs
 * @description Builds typed memory inscription args from MCP JSON input.
 */
function parseMemoryArgs(input: JsonRecord): InscribeMemoryArgs {
  return {
    sequence: requiredNumber(input, 'sequence'),
    encryptedData: Buffer.from(requiredBytes(input, 'encryptedData')),
    nonce: requiredBytes(input, 'nonce'),
    contentHash: requiredBytes(input, 'contentHash', 32),
    totalFragments: optionalNumber(input, 'totalFragments') ?? 1,
    fragmentIndex: optionalNumber(input, 'fragmentIndex') ?? 0,
    compression: optionalNumber(input, 'compression') ?? 0,
    epochIndex: optionalNumber(input, 'epochIndex') ?? 0,
  };
}

/**
 * @name parseCompactMemoryArgs
 * @description Builds typed compact inscription args from MCP JSON input.
 */
function parseCompactMemoryArgs(input: JsonRecord): CompactInscribeArgs {
  return {
    sequence: requiredNumber(input, 'sequence'),
    encryptedData: Buffer.from(requiredBytes(input, 'encryptedData')),
    nonce: requiredBytes(input, 'nonce'),
    contentHash: requiredBytes(input, 'contentHash', 32),
  };
}

/**
 * @name parseUpdateToolArgs
 * @description Builds typed tool update args from MCP JSON input.
 */
function parseUpdateToolArgs(input: JsonRecord): UpdateToolArgs {
  return {
    descriptionHash: input.descriptionHash === undefined ? null : requiredBytes(input, 'descriptionHash', 32),
    inputSchemaHash: input.inputSchemaHash === undefined ? null : requiredBytes(input, 'inputSchemaHash', 32),
    outputSchemaHash: input.outputSchemaHash === undefined ? null : requiredBytes(input, 'outputSchemaHash', 32),
    httpMethod: optionalNumber(input, 'httpMethod') ?? null,
    category: optionalNumber(input, 'category') ?? null,
    paramsCount: optionalNumber(input, 'paramsCount') ?? null,
    requiredParams: optionalNumber(input, 'requiredParams') ?? null,
  };
}

/**
 * @name registerSapTool
 * @description Registers one SAP SDK-backed MCP tool with common error handling.
 */
function registerSapTool(server: Server, client: SapClient, definition: ToolRegistration): void {
  registerTool(
    server,
    definition.name,
    {
      title: definition.title,
      description: buildSapSdkToolDescription(definition),
      inputSchema: definition.inputSchema,
    },
    async (rawInput: unknown) => {
      try {
        return ok(await definition.handler(asRecord(rawInput), client));
      } catch (error) {
        logger.error(`SAP SDK tool failed: ${definition.name}`, { error });
        return createTextResponse(
          `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { isError: true }
        );
      }
    }
  );
}

function buildSapSdkToolDescription(definition: ToolRegistration): string {
  return [
    definition.description,
    getSapSdkToolContext(definition.name),
  ].join(' ');
}

function getSapSdkToolContext(name: string): string {
  if (name === 'sap_register_agent') {
    return 'SAP MCP context: This is the primary on-chain SAP agent registration tool for a local profile signer or external signer. Hosted accountless SAP MCP rejects direct registration before x402 payment because OOBE never custodies user wallet keys. Use agentUri or metadataUri for off-chain metadata, including a Metaplex or DAS-backed identity document when the agent also has NFT/collection metadata. After registration, use sap_publish_tool_by_name for advertised MCP capabilities and AgentKit metaplex-nft_* tools for NFT collection, badge, or metadata workflows.';
  }

  if (name === 'sap_update_agent') {
    return 'SAP MCP context: Use this after sap_register_agent to refresh name, description, capabilities, pricing, supported protocols, x402 endpoint, or metadataUri. For NFT-backed identity changes, update the Metaplex asset first when needed, then point the SAP agent metadataUri at the current metadata document.';
  }

  if (name.startsWith('sap_publish_tool') || name.startsWith('sap_update_tool')) {
    return 'SAP MCP context: Use tool registry writes to advertise concrete capabilities that this MCP can serve, including AgentKit bridge tools such as bridging_bridgeWormhole and Metaplex tools such as metaplex-nft_mintNFT. Publish only schemas and descriptions that match the actual MCP tool surface.';
  }

  if (name.startsWith('sap_discover') || name.startsWith('sap_list') || name.startsWith('sap_find') || name.startsWith('sap_fetch') || name.startsWith('sap_get') || name.startsWith('sap_is')) {
    return 'SAP MCP context: Read-only SAP SDK wrapper against the configured Solana RPC and SAP program. Use these reads to inspect current chain state before mutating registry, payment, reputation, memory, or tool accounts.';
  }

  if (name.startsWith('sap_x402') || name.includes('escrow') || name.includes('settlement') || name.includes('subscription')) {
    return 'SAP MCP context: Payment and settlement flow. Estimate or fetch state before creating escrows or settling calls; write operations require an enabled signer mode and MCP policy approval.';
  }

  if (name.includes('feedback') || name.includes('attestation') || name.includes('fairscale') || name.includes('reputation')) {
    return 'SAP MCP context: Reputation and trust flow. Use after verifying the target agent PDA or wallet and keep hashes/attestation metadata stable and auditable.';
  }

  if (name.includes('vault') || name.includes('session') || name.includes('memory')) {
    return 'SAP MCP context: Memory/session flow. Store only intentionally encrypted payloads or public hashes; session and vault PDAs are visible on-chain metadata.';
  }

  if (name.includes('stake')) {
    return 'SAP MCP context: SAP protocol staking flow. Confirm agent wallet, amount, and unstake timing before writes; this is distinct from external AgentKit staking protocol tools.';
  }

  return 'SAP MCP context: Direct synapse-sap-sdk wrapper served by this MCP. Read tools return on-chain state; write tools require signer policy, configured RPC, and the active SAP profile.';
}

const agentTools: ToolRegistration[] = [
  {
    name: 'sap_register_agent',
    title: 'Register SAP Agent',
    description: 'Local-signer-only: register the connected wallet as a SAP agent using SDK AgentModule.register. Hosted accountless SAP MCP rejects this direct write before x402 payment; run it through a local SAP MCP profile or external signer.',
    inputSchema: {
      name: { type: 'string', description: 'Human-readable name for the SAP agent' },
      description: { type: 'string', description: 'Detailed description of the agent\'s purpose and capabilities' },
      capabilities: { type: 'array', description: 'Array of capability objects or strings identifying what the agent can do (e.g. "jupiter:swap")' },
      pricing: { type: 'array', description: 'Array of pricing tier objects defining per-call costs, rate limits, and settlement terms' },
      protocols: { type: 'array', items: { type: 'string' }, description: 'Array of protocol identifiers the agent supports (e.g. "jupiter", "drift")' },
      agentId: { type: 'string', description: 'Optional unique agent identifier string' },
      agentUri: { type: 'string', description: 'Optional URI to the agent\'s off-chain metadata or service endpoint' },
      metadataUri: { type: 'string', description: 'Alias for agentUri — URI to off-chain agent metadata JSON' },
      x402Endpoint: { type: 'string', description: 'Optional x402 payment endpoint URL for HTTP-based agent payments' },
    },
    handler: async (input, client) => ({ signature: await client.agent.register(parseRegisterAgentArgs(input)) }),
  },
  {
    name: 'sap_update_agent',
    title: 'Update SAP Agent',
    description: 'Update the connected wallet SAP agent using SDK AgentModule.update.',
    inputSchema: { type: 'object', additionalProperties: true, description: 'Object containing any combination of agent fields to update (name, description, capabilities, pricing, protocols, agentId, agentUri, x402Endpoint)' },
    handler: async (input, client) => ({ signature: await client.agent.update(parseUpdateAgentArgs(input)) }),
  },
  {
    name: 'sap_deactivate_agent',
    title: 'Deactivate SAP Agent',
    description: 'Deactivate the connected wallet SAP agent.',
    inputSchema: {},
    handler: async (_input, client) => ({ signature: await client.agent.deactivate() }),
  },
  {
    name: 'sap_reactivate_agent',
    title: 'Reactivate SAP Agent',
    description: 'Reactivate the connected wallet SAP agent.',
    inputSchema: {},
    handler: async (_input, client) => ({ signature: await client.agent.reactivate() }),
  },
  {
    name: 'sap_close_agent',
    title: 'Close SAP Agent',
    description: 'Close the connected wallet SAP agent and reclaim rent.',
    inputSchema: {},
    handler: async (_input, client) => ({ signature: await client.agent.close() }),
  },
  {
    name: 'sap_report_calls',
    title: 'Report Agent Calls',
    description: 'Report served call count for the connected wallet SAP agent.',
    inputSchema: { callsServed: { type: 'number', description: 'Number of calls served to report for the agent' } },
    handler: async (input, client) => ({ signature: await client.agent.reportCalls(requiredNumber(input, 'callsServed')) }),
  },
  {
    name: 'sap_update_reputation_metrics',
    title: 'Update Reputation Metrics',
    description: 'Update self-reported latency and uptime metrics for the connected wallet SAP agent.',
    inputSchema: { avgLatencyMs: { type: 'number', description: 'Average response latency in milliseconds to report' }, uptimePercent: { type: 'number', description: 'Uptime percentage (0–100) to report for the agent' } },
    handler: async (input, client) => ({
      signature: await client.agent.updateReputation(
        requiredNumber(input, 'avgLatencyMs'),
        requiredNumber(input, 'uptimePercent')
      ),
    }),
  },
  {
    name: 'sap_get_agent',
    title: 'Get SAP Agent',
    description: 'Fetch agent identity by owner wallet. If omitted, fetches the connected wallet agent.',
    inputSchema: { wallet: { type: 'string', description: 'Solana public key of the agent owner wallet (base58). If omitted, uses the connected wallet.' } },
    handler: async (input, client) => {
      const wallet = optionalPublicKey(input, 'wallet');
      const pda = client.agent.deriveAgent(wallet)[0];
      const agent = await client.agent.fetchNullable(wallet);
      return { agentPda: pda, agent };
    },
  },
  {
    name: 'sap_get_agent_stats',
    title: 'Get SAP Agent Stats',
    description: 'Fetch agent stats by agent PDA.',
    inputSchema: { agentPda: { type: 'string', description: 'Agent PDA (base58) to fetch stats for' } },
    handler: async (input, client) => ({
      stats: await client.agent.fetchStatsNullable(requiredPublicKey(input, 'agentPda')),
    }),
  },
  {
    name: 'sap_get_global_state',
    title: 'Get SAP Global State',
    description: 'Fetch the on-chain global registry through SDK AgentModule.fetchGlobalRegistry.',
    inputSchema: {},
    handler: async (_input, client) => ({ state: await client.agent.fetchGlobalRegistry() }),
  },
];

const discoveryTools: ToolRegistration[] = [
  {
    name: 'sap_get_network_overview',
    title: 'Get SAP Network Overview',
    description: 'Fetch real network counters from SDK DiscoveryRegistry.getNetworkOverview.',
    inputSchema: {},
    handler: async (_input, client) => ({ overview: await client.discovery.getNetworkOverview() }),
  },
  {
    name: 'sap_get_agent_profile',
    title: 'Get SAP Agent Profile',
    description: 'Fetch a hydrated SAP agent profile by owner wallet.',
    inputSchema: { wallet: { type: 'string', description: 'Solana public key of the agent owner wallet (base58)' } },
    handler: async (input, client) => ({ profile: await client.discovery.getAgentProfile(requiredPublicKey(input, 'wallet')) }),
  },
  {
    name: 'sap_is_agent_active',
    title: 'Check SAP Agent Active',
    description: 'Check if a wallet owns an active SAP agent.',
    inputSchema: { wallet: { type: 'string', description: 'Solana public key of the wallet to check for an active SAP agent (base58)' } },
    handler: async (input, client) => ({ active: await client.discovery.isAgentActive(requiredPublicKey(input, 'wallet')) }),
  },
  {
    name: 'sap_discover_agents',
    title: 'Discover SAP Agents',
    description: 'Paid hosted discovery for SAP agents. Search and filter the current on-chain AgentAccount directory by query, wallet, protocol, capability, x402 endpoint presence, and cursor pagination. Use this for targeted agent discovery before calling per-agent fetch tools.',
    inputSchema: makeAgentDirectoryInputSchema(50),
    handler: async (input, client) => {
      const limit = Math.max(1, Math.min(optionalNumber(input, 'limit') ?? 50, 500));
      const capability = optionalString(input, 'capability');
      const capabilities = parseOptionalStringArray(input, 'capabilities');

      return buildAgentDirectoryPage(client, {
        includeInactive: input.includeInactive === true,
        protocol: optionalString(input, 'protocol'),
        capability,
        capabilities,
        capabilityMode: parseCapabilityMode(input),
        query: optionalString(input, 'query'),
        wallet: optionalString(input, 'wallet'),
        agentPda: optionalString(input, 'agentPda'),
        hasX402Endpoint: parseHasX402Endpoint(input),
        limit,
        offset: parseDirectoryOffset(input),
        view: parseDirectoryView(input),
        includeProtocolIndexes: input.includeProtocolIndexes === true,
      });
    },
  },
  {
    name: 'sap_list_agents',
    title: 'List SAP Agents',
    description: 'Compatibility alias for sap_discover_agents. Supports query, wallet, protocol, capability, x402 endpoint filtering, and cursor pagination.',
    inputSchema: makeAgentDirectoryInputSchema(50),
    handler: async (input, client) => discoveryTools[3].handler(input, client),
  },
  {
    name: 'sap_list_all_agents',
    title: 'List All SAP Agents',
    description: 'Paid hosted global SAP agent directory read. Enumerates current on-chain AgentAccount PDAs and supports query, wallet, protocol, capability, x402 endpoint filtering, compact/full views, and cursor pagination.',
    inputSchema: makeAgentDirectoryInputSchema(100),
    handler: async (input, client) => {
      const limit = Math.max(1, Math.min(optionalNumber(input, 'limit') ?? 100, 500));
      const capability = optionalString(input, 'capability');

      return buildAgentDirectoryPage(client, {
        includeInactive: input.includeInactive === true,
        protocol: optionalString(input, 'protocol'),
        capability,
        capabilities: parseOptionalStringArray(input, 'capabilities'),
        capabilityMode: parseCapabilityMode(input),
        query: optionalString(input, 'query'),
        wallet: optionalString(input, 'wallet'),
        agentPda: optionalString(input, 'agentPda'),
        hasX402Endpoint: parseHasX402Endpoint(input),
        limit,
        offset: parseDirectoryOffset(input),
        view: parseDirectoryView(input),
        includeProtocolIndexes: input.includeProtocolIndexes !== false,
      });
    },
  },
  {
    name: 'sap_find_tools_by_category',
    title: 'Find SAP Tools By Category',
    description: 'Find on-chain tool descriptors by SDK tool category name or numeric category.',
    inputSchema: { category: { type: ['string', 'number'], description: 'Tool category name (e.g. "defi", "infrastructure") or numeric category ID' }, hydrate: { type: 'boolean', description: 'Whether to include full hydrated tool descriptors in results (default: true)' }, limit: { type: 'number', description: 'Maximum number of tools to return (default: 50)' } },
    handler: async (input, client) => {
      const tools = await client.discovery.findToolsByCategory(requiredToolCategory(input), { hydrate: input.hydrate !== false });
      const limit = optionalNumber(input, 'limit') ?? 50;
      return { count: Math.min(tools.length, limit), tools: tools.slice(0, limit) };
    },
  },
  {
    name: 'sap_get_tool_category_summary',
    title: 'Get SAP Tool Category Summary',
    description: 'Fetch SDK discovery summary across SAP tool categories.',
    inputSchema: {},
    handler: async (_input, client) => ({ categories: await client.discovery.getToolCategorySummary() }),
  },
];

const indexAndFetchTools: ToolRegistration[] = [
  {
    name: 'sap_fetch_capability_index',
    title: 'Fetch Capability Index',
    description: 'Fetch a SAP capability index by capability ID.',
    inputSchema: { capabilityId: { type: 'string', description: 'Capability ID to fetch the index for (e.g. "jupiter:swap")' } },
    handler: async (input, client) => ({ index: await client.indexing.fetchCapabilityIndexNullable(requiredString(input, 'capabilityId')) }),
  },
  {
    name: 'sap_fetch_protocol_index',
    title: 'Fetch Protocol Index',
    description: 'Fetch a SAP protocol index by protocol ID.',
    inputSchema: { protocolId: { type: 'string', description: 'Protocol ID to fetch the index for (e.g. "jupiter", "drift")' } },
    handler: async (input, client) => ({ index: await client.indexing.fetchProtocolIndexNullable(requiredString(input, 'protocolId')) }),
  },
  {
    name: 'sap_fetch_tool_category_index',
    title: 'Fetch Tool Category Index',
    description: 'Fetch a SAP tool category index by numeric category.',
    inputSchema: { category: { type: 'number', description: 'Numeric tool category ID to fetch the index for' } },
    handler: async (input, client) => ({ index: await client.indexing.fetchToolCategoryIndexNullable(requiredNumber(input, 'category')) }),
  },
  {
    name: 'sap_fetch_tool',
    title: 'Fetch SAP Tool Descriptor',
    description: 'Fetch a tool descriptor by agent PDA and tool name.',
    inputSchema: { agentPda: { type: 'string', description: 'Agent PDA (base58) that owns the tool descriptor' }, toolName: { type: 'string', description: 'Name of the tool descriptor to fetch' } },
    handler: async (input, client) => ({
      tool: await client.tools.fetchNullable(requiredPublicKey(input, 'agentPda'), requiredString(input, 'toolName')),
    }),
  },
  {
    name: 'sap_fetch_feedback',
    title: 'Fetch SAP Feedback',
    description: 'Fetch a feedback PDA by agent PDA and optional reviewer wallet.',
    inputSchema: { agentPda: { type: 'string', description: 'Agent PDA (base58) to fetch feedback for' }, reviewer: { type: 'string', description: 'Optional reviewer wallet (base58) to filter feedback by' } },
    handler: async (input, client) => ({
      feedback: await client.feedback.fetchNullable(requiredPublicKey(input, 'agentPda'), optionalPublicKey(input, 'reviewer')),
    }),
  },
  {
    name: 'sap_fetch_attestation',
    title: 'Fetch SAP Attestation',
    description: 'Fetch an attestation PDA by agent PDA and optional attester wallet.',
    inputSchema: { agentPda: { type: 'string', description: 'Agent PDA (base58) to fetch attestation for' }, attester: { type: 'string', description: 'Optional attester wallet (base58) to filter attestation by' } },
    handler: async (input, client) => ({
      attestation: await client.attestation.fetchNullable(requiredPublicKey(input, 'agentPda'), optionalPublicKey(input, 'attester')),
    }),
  },
  {
    name: 'sap_fetch_escrow',
    title: 'Fetch SAP Escrow V1',
    description: 'Fetch a V1 escrow by escrow PDA, or by agent PDA and optional depositor.',
    inputSchema: { escrowPda: { type: 'string', description: 'Escrow PDA (base58) to fetch directly' }, agentPda: { type: 'string', description: 'Agent PDA (base58) — used when escrowPda is omitted' }, depositor: { type: 'string', description: 'Optional depositor wallet (base58) to filter by' } },
    handler: async (input, client) => ({
      escrow: optionalString(input, 'escrowPda')
        ? await client.escrow.fetchByPda(requiredPublicKey(input, 'escrowPda'))
        : await client.escrow.fetchNullable(requiredPublicKey(input, 'agentPda'), optionalPublicKey(input, 'depositor')),
    }),
  },
  {
    name: 'sap_fetch_escrow_v2',
    title: 'Fetch SAP Escrow V2',
    description: 'Fetch a V2 escrow by escrow PDA, or by agent PDA, depositor, and nonce.',
    inputSchema: { escrowPda: { type: 'string', description: 'Escrow V2 PDA (base58) to fetch directly' }, agentPda: { type: 'string', description: 'Agent PDA (base58) — used when escrowPda is omitted' }, depositor: { type: 'string', description: 'Optional depositor wallet (base58) to filter by' }, nonce: { type: 'number', description: 'Escrow nonce (default: 0) — used with agentPda and depositor' } },
    handler: async (input, client) => ({
      escrow: optionalString(input, 'escrowPda')
        ? await client.escrowV2.fetchByPda(requiredPublicKey(input, 'escrowPda'))
        : await client.escrowV2.fetchNullable(
          requiredPublicKey(input, 'agentPda'),
          optionalPublicKey(input, 'depositor'),
          optionalBn(input, 'nonce', new BN(0))
        ),
    }),
  },
  {
    name: 'sap_fetch_pending_settlement',
    title: 'Fetch Pending Settlement',
    description: 'Fetch a V2 pending settlement PDA.',
    inputSchema: { pendingPda: { type: 'string', description: 'Pending settlement PDA (base58) to fetch' } },
    handler: async (input, client) => ({ pendingSettlement: await client.escrowV2.fetchPendingSettlementNullable(requiredPublicKey(input, 'pendingPda')) }),
  },
  {
    name: 'sap_fetch_dispute',
    title: 'Fetch SAP Dispute',
    description: 'Fetch a V2 dispute PDA.',
    inputSchema: { disputePda: { type: 'string', description: 'Dispute PDA (base58) to fetch' } },
    handler: async (input, client) => ({ dispute: await client.escrowV2.fetchDisputeNullable(requiredPublicKey(input, 'disputePda')) }),
  },
  {
    name: 'sap_fetch_vault',
    title: 'Fetch SAP Vault',
    description: 'Fetch a memory vault by agent PDA.',
    inputSchema: { agentPda: { type: 'string', description: 'Agent PDA (base58) to fetch the memory vault for' } },
    handler: async (input, client) => ({ vault: await client.vault.fetchVaultNullable(requiredPublicKey(input, 'agentPda')) }),
  },
  {
    name: 'sap_fetch_session',
    title: 'Fetch SAP Session',
    description: 'Fetch a session ledger by session PDA.',
    inputSchema: { sessionPda: { type: 'string', description: 'Session PDA (base58) to fetch the ledger for' } },
    handler: async (input, client) => ({ session: await client.vault.fetchSessionByPda(requiredPublicKey(input, 'sessionPda')) }),
  },
  {
    name: 'sap_fetch_epoch_page',
    title: 'Fetch SAP Epoch Page',
    description: 'Fetch an epoch page by session PDA and epoch index.',
    inputSchema: { sessionPda: { type: 'string', description: 'Session PDA (base58) to fetch epoch page for' }, epochIndex: { type: 'number', description: 'Zero-based epoch index to fetch' } },
    handler: async (input, client) => ({
      epochPage: await client.vault.fetchEpochPage(requiredPublicKey(input, 'sessionPda'), requiredNumber(input, 'epochIndex')),
    }),
  },
  {
    name: 'sap_fetch_stake',
    title: 'Fetch SAP Stake',
    description: 'Fetch agent stake by stake PDA or agent PDA.',
    inputSchema: { stakePda: { type: 'string', description: 'Stake PDA (base58) to fetch directly' }, agentPda: { type: 'string', description: 'Agent PDA (base58) — used when stakePda is omitted' } },
    handler: async (input, client) => ({
      stake: optionalString(input, 'stakePda')
        ? await client.staking.fetchByPda(requiredPublicKey(input, 'stakePda'))
        : await client.staking.fetchNullable(requiredPublicKey(input, 'agentPda')),
    }),
  },
  {
    name: 'sap_fetch_subscription',
    title: 'Fetch SAP Subscription',
    description: 'Fetch a subscription by PDA or by agent PDA/subscriber/subId.',
    inputSchema: { subscriptionPda: { type: 'string', description: 'Subscription PDA (base58) to fetch directly' }, agentPda: { type: 'string', description: 'Agent PDA (base58) — used when subscriptionPda is omitted' }, subscriber: { type: 'string', description: 'Optional subscriber wallet (base58) to filter by' }, subId: { type: 'number', description: 'Subscription ID (default: 0) — used with agentPda and subscriber' } },
    handler: async (input, client) => ({
      subscription: optionalString(input, 'subscriptionPda')
        ? await client.subscription.fetchByPda(requiredPublicKey(input, 'subscriptionPda'))
        : await client.subscription.fetchNullable(
          requiredPublicKey(input, 'agentPda'),
          optionalPublicKey(input, 'subscriber'),
          optionalBn(input, 'subId', new BN(0))
        ),
    }),
  },
];

const paymentAndEscrowTools: ToolRegistration[] = [
  {
    name: 'sap_x402_estimate_cost',
    title: 'Estimate SAP x402 Cost',
    description: 'Estimate cost for a number of calls using SDK X402Registry.estimateCost. Reads escrow/pricing when available and supports optional volume curve overrides.',
    inputSchema: {
      agentWallet: { type: 'string', description: 'Agent wallet public key (base58)' },
      calls: { type: 'number', description: 'Number of calls to estimate' },
      pricePerCall: { type: 'string', description: 'Optional base price per call override in token base units' },
      totalCallsBefore: { type: 'number', description: 'Optional cumulative settled calls before this estimate' },
      volumeCurve: { type: 'array', description: 'Optional array of { afterCalls, pricePerCall } pricing breakpoints' },
    },
    handler: async (input, client) => ({
      estimate: await client.x402.estimateCost(requiredPublicKey(input, 'agentWallet'), requiredNumber(input, 'calls'), {
        pricePerCall: input.pricePerCall === undefined ? undefined : requiredBn(input, 'pricePerCall'),
        volumeCurve: input.volumeCurve === undefined ? undefined : parseVolumeCurve(input.volumeCurve),
        totalCallsBefore: optionalNumber(input, 'totalCallsBefore'),
      }),
    }),
  },
  {
    name: 'sap_x402_calculate_cost',
    title: 'Calculate SAP x402 Cost',
    description: 'Pure local cost calculation using SDK X402Registry.calculateCost; does not read chain state.',
    inputSchema: {
      basePrice: { type: 'string', description: 'Base price per call in token base units' },
      calls: { type: 'number', description: 'Number of calls to calculate' },
      totalCallsBefore: { type: 'number', description: 'Cumulative settled calls before this calculation (default: 0)' },
      volumeCurve: { type: 'array', description: 'Array of { afterCalls, pricePerCall } pricing breakpoints' },
    },
    handler: async (input, client) => ({
      estimate: client.x402.calculateCost(
        requiredBn(input, 'basePrice'),
        parseVolumeCurve(input.volumeCurve),
        optionalNumber(input, 'totalCallsBefore') ?? 0,
        requiredNumber(input, 'calls')
      ),
    }),
  },
  {
    name: 'sap_x402_prepare_payment',
    title: 'Prepare SAP x402 Payment',
    description: 'Prepare an x402 payment context using SDK X402Registry.preparePayment. New production escrow funding should use Escrow V2 fields and nonce-aware flows.',
    inputSchema: { agentWallet: { type: 'string', description: 'Agent wallet public key (base58)' }, pricePerCall: { type: 'string', description: `Price per call as a decimal string. ${ESCROW_AMOUNT_DESCRIPTION}` }, deposit: { type: 'string', description: `Initial deposit as a decimal string. ${ESCROW_AMOUNT_DESCRIPTION}` }, maxCalls: { type: 'string', description: 'Optional maximum number of calls covered' }, nonce: { type: 'string', description: 'Optional escrow nonce as a decimal string. Defaults to 0.' }, expiresAt: { type: 'string', description: 'Optional expiry timestamp in unix seconds' }, volumeCurve: { type: 'array', description: 'Optional array of { afterCalls, pricePerCall } pricing breakpoints' }, tokenMint: { type: 'string', description: 'Optional SPL token mint; omit/null for SOL. Use EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v for mainnet USDC.' }, tokenDecimals: { type: 'number', description: 'Optional token decimals. Defaults to 6 for USDC/SPL flows when supplied by the SDK and 9 for native SOL.' }, networkIdentifier: { type: 'string', description: 'Optional x402 network identifier written into headers' } },
    handler: async (input, client) => ({
      payment: await client.x402.preparePayment(requiredPublicKey(input, 'agentWallet'), parseX402PreparePaymentOptions(input)),
    }),
  },
  {
    name: 'sap_x402_build_payment_headers',
    title: 'Build SAP x402 Payment Headers',
    description: 'Build SAP x402 HTTP headers from a public PaymentContext returned by sap_x402_prepare_payment.',
    inputSchema: { escrowPda: { type: 'string', description: 'Escrow PDA (base58)' }, agentPda: { type: 'string', description: 'Agent PDA (base58)' }, agentWallet: { type: 'string', description: 'Agent wallet public key (base58)' }, depositorWallet: { type: 'string', description: 'Depositor wallet public key (base58)' }, pricePerCall: { type: 'string', description: 'Price per call in token base units' }, maxCalls: { type: 'string', description: 'Max calls as a decimal string' }, nonce: { type: 'string', description: 'Escrow nonce as a decimal string. Defaults to 0.' }, txSignature: { type: 'string', description: 'Escrow creation transaction signature' }, networkIdentifier: { type: 'string', description: 'x402 network identifier stored in the payment context' }, network: { type: 'string', description: 'Optional override for X-Payment-Network' } },
    handler: async (input, client) => ({
      headers: client.x402.buildPaymentHeaders(parsePaymentContext(input), { network: optionalString(input, 'network') }),
    }),
  },
  {
    name: 'sap_x402_build_headers_from_escrow',
    title: 'Build SAP x402 Headers From Escrow',
    description: 'Build SAP x402 HTTP headers by fetching escrow data for an agent wallet with SDK X402Registry.buildPaymentHeadersFromEscrow.',
    inputSchema: { agentWallet: { type: 'string', description: 'Agent wallet public key (base58)' }, nonce: { type: 'string', description: 'Optional escrow nonce as a decimal string. Defaults to 0.' }, network: { type: 'string', description: 'Optional network identifier for X-Payment-Network' } },
    handler: async (input, client) => ({
      headers: await client.x402.buildPaymentHeadersFromEscrow(requiredPublicKey(input, 'agentWallet'), {
        nonce: optionalString(input, 'nonce'),
        network: optionalString(input, 'network'),
      }),
    }),
  },
  {
    name: 'sap_x402_has_escrow',
    title: 'Check SAP x402 Escrow',
    description: 'Check whether an x402 escrow exists for an agent/depositor pair.',
    inputSchema: { agentWallet: { type: 'string', description: 'Agent wallet public key (base58)' }, depositor: { type: 'string', description: 'Optional depositor wallet (base58); defaults to caller in SDK' }, nonce: { type: 'string', description: 'Optional escrow nonce as a decimal string. Defaults to 0.' } },
    handler: async (input, client) => ({ exists: await client.x402.hasEscrow(requiredPublicKey(input, 'agentWallet'), optionalPublicKey(input, 'depositor'), { nonce: optionalString(input, 'nonce') }) }),
  },
  {
    name: 'sap_x402_fetch_escrow',
    title: 'Fetch SAP x402 Escrow',
    description: 'Fetch raw x402 escrow account data using SDK X402Registry.fetchEscrow. Resolves V2 first, then V1 fallback.',
    inputSchema: { agentWallet: { type: 'string', description: 'Agent wallet public key (base58)' }, depositor: { type: 'string', description: 'Optional depositor wallet (base58); defaults to caller in SDK' }, nonce: { type: 'string', description: 'Optional escrow nonce as a decimal string. Defaults to 0.' } },
    handler: async (input, client) => ({ escrow: await client.x402.fetchEscrow(requiredPublicKey(input, 'agentWallet'), optionalPublicKey(input, 'depositor'), { nonce: optionalString(input, 'nonce') }) }),
  },
  {
    name: 'sap_x402_get_balance',
    title: 'Get SAP x402 Balance',
    description: 'Fetch x402 escrow balance using SDK X402Registry.getBalance.',
    inputSchema: { agentWallet: { type: 'string', description: 'Agent wallet public key (base58)' }, depositor: { type: 'string', description: 'Optional depositor wallet (base58) to filter balance by' }, nonce: { type: 'string', description: 'Optional escrow nonce as a decimal string. Defaults to 0.' } },
    handler: async (input, client) => ({ balance: await client.x402.getBalance(requiredPublicKey(input, 'agentWallet'), optionalPublicKey(input, 'depositor'), { nonce: optionalString(input, 'nonce') }) }),
  },
  {
    name: 'sap_x402_settle',
    title: 'Settle SAP x402 Calls',
    description: 'Settle served x402 calls through SDK X402Registry.settle. Must be called by the agent owner wallet.',
    inputSchema: { depositorWallet: { type: 'string', description: 'Depositor wallet public key (base58)' }, nonce: { type: 'string', description: 'Optional escrow nonce as a decimal string. Defaults to 0.' }, callsToSettle: { type: 'number', description: 'Number of calls to settle' }, serviceData: { type: 'string', description: 'Service data to hash into the settlement proof' }, priorityFeeMicroLamports: { type: 'number', description: 'Optional priority fee in microlamports per compute unit' }, computeUnits: { type: 'number', description: 'Optional compute-unit limit' }, skipPreflight: { type: 'boolean', description: 'Optional skip preflight flag' }, commitment: { type: 'string', description: 'Optional processed|confirmed|finalized commitment' }, maxRetries: { type: 'number', description: 'Optional RPC retry limit' } },
    handler: async (input, client) => ({
      settlement: await client.x402.settle(
        requiredPublicKey(input, 'depositorWallet'),
        requiredNumber(input, 'callsToSettle'),
        requiredString(input, 'serviceData'),
        {
          ...(parseSettleOptions(input) ?? {}),
          ...(optionalString(input, 'nonce') ? { nonce: optionalString(input, 'nonce') } : {}),
        }
      ),
    }),
  },
  {
    name: 'sap_x402_settle_batch',
    title: 'Batch Settle SAP x402 Calls',
    description: 'Batch-settle served x402 calls through SDK X402Registry.settleBatch. Must be called by the agent owner wallet.',
    inputSchema: { depositorWallet: { type: 'string', description: 'Depositor wallet public key (base58)' }, nonce: { type: 'string', description: 'Optional escrow nonce as a decimal string. Defaults to 0.' }, entries: { type: 'array', description: 'Array of { calls, serviceData } settlement entries' }, priorityFeeMicroLamports: { type: 'number', description: 'Optional priority fee in microlamports per compute unit' }, computeUnits: { type: 'number', description: 'Optional compute-unit limit' }, skipPreflight: { type: 'boolean', description: 'Optional skip preflight flag' }, commitment: { type: 'string', description: 'Optional processed|confirmed|finalized commitment' }, maxRetries: { type: 'number', description: 'Optional RPC retry limit' } },
    handler: async (input, client) => ({
      settlement: await client.x402.settleBatch(
        requiredPublicKey(input, 'depositorWallet'),
        parseX402BatchSettlementEntries(input.entries),
        {
          ...(parseSettleOptions(input) ?? {}),
          ...(optionalString(input, 'nonce') ? { nonce: optionalString(input, 'nonce') } : {}),
        }
      ),
    }),
  },
];

const escrowV2Tools: ToolRegistration[] = [
  {
    name: 'sap_create_escrow_v2',
    title: 'Create SAP Escrow V2',
    description: 'Create a V2 escrow using SDK EscrowV2Module.create. Defaults to DisputeWindow settlementSecurity=2; SelfReport/0 is rejected.',
    inputSchema: escrowV2CreateInputSchema,
    handler: async (input, client) => ({ signature: await client.escrowV2.create(requiredPublicKey(input, 'agentWallet'), parseEscrowV2Args(input)) }),
  },
  {
    name: 'sap_deposit_escrow_v2',
    title: 'Deposit SAP Escrow V2',
    description: 'Deposit funds into a V2 escrow.',
    inputSchema: { agentWallet: { type: 'string', description: 'Agent wallet public key (base58)' }, nonce: { type: 'string', description: 'Escrow nonce (as a decimal string, default: 0)' }, amount: { type: 'string', description: `Deposit amount as a decimal string. ${ESCROW_AMOUNT_DESCRIPTION}` } },
    handler: async (input, client) => ({ signature: await client.escrowV2.deposit(requiredPublicKey(input, 'agentWallet'), optionalBn(input, 'nonce', new BN(0)), requiredBn(input, 'amount')) }),
  },
  {
    name: 'sap_settle_escrow_v2',
    title: 'Settle SAP Escrow V2',
    description: 'Settle calls against a V2 escrow.',
    inputSchema: { depositorWallet: { type: 'string', description: 'Depositor wallet public key (base58)' }, nonce: { type: 'string', description: 'Escrow nonce (as a decimal string, default: 0)' }, callsToSettle: { type: 'string', description: 'Number of calls to settle (as a decimal string)' }, serviceHash: { type: 'array', description: '32-byte service hash as a byte array, hex string, or base64 string' } },
    handler: async (input, client) => ({
      signature: await client.escrowV2.settle(
        requiredPublicKey(input, 'depositorWallet'),
        optionalBn(input, 'nonce', new BN(0)),
        requiredBn(input, 'callsToSettle'),
        requiredBytes(input, 'serviceHash', 32)
      ),
    }),
  },
  {
    name: 'sap_next_settlement_index',
    title: 'Get Next Settlement Index',
    description: 'Read the next V2 settlement index.',
    inputSchema: { agentWallet: { type: 'string', description: 'Agent wallet public key (base58)' }, depositorWallet: { type: 'string', description: 'Depositor wallet public key (base58)' }, nonce: { type: 'string', description: 'Escrow nonce (as a decimal string, default: 0)' } },
    handler: async (input, client) => ({
      settlementIndex: await client.escrowV2.nextSettlementIndex(
        requiredPublicKey(input, 'agentWallet'),
        requiredPublicKey(input, 'depositorWallet'),
        optionalBn(input, 'nonce', new BN(0))
      ),
    }),
  },
  {
    name: 'sap_finalize_settlement_v2',
    title: 'Finalize SAP Escrow V2 Settlement',
    description: 'Finalize a V2 pending settlement.',
    inputSchema: { agentWallet: { type: 'string', description: 'Agent wallet public key (base58)' }, depositorWallet: { type: 'string', description: 'Depositor wallet public key (base58)' }, nonce: { type: 'string', description: 'Escrow nonce (as a decimal string, default: 0)' }, settlementIndex: { type: 'string', description: 'Settlement index to finalize (as a decimal string)' } },
    handler: async (input, client) => ({
      signature: await client.escrowV2.finalizeSettlement(
        requiredPublicKey(input, 'agentWallet'),
        requiredPublicKey(input, 'depositorWallet'),
        optionalBn(input, 'nonce', new BN(0)),
        requiredBn(input, 'settlementIndex')
      ),
    }),
  },
  {
    name: 'sap_file_dispute_v2',
    title: 'File SAP Escrow V2 Dispute',
    description: 'File a dispute for a V2 pending settlement.',
    inputSchema: { agentWallet: { type: 'string', description: 'Agent wallet public key (base58)' }, nonce: { type: 'string', description: 'Escrow nonce (as a decimal string, default: 0)' }, settlementIndex: { type: 'string', description: 'Settlement index to dispute (as a decimal string)' }, evidenceHash: { type: 'array', description: '32-byte evidence hash as a byte array, hex string, or base64 string' } },
    handler: async (input, client) => ({
      signature: await client.escrowV2.fileDispute(
        requiredPublicKey(input, 'agentWallet'),
        optionalBn(input, 'nonce', new BN(0)),
        requiredBn(input, 'settlementIndex'),
        requiredBytes(input, 'evidenceHash', 32)
      ),
    }),
  },
  {
    name: 'sap_withdraw_escrow_v2',
    title: 'Withdraw SAP Escrow V2',
    description: 'Withdraw funds from a V2 escrow.',
    inputSchema: { agentWallet: { type: 'string', description: 'Agent wallet public key (base58)' }, nonce: { type: 'string', description: 'Escrow nonce (as a decimal string, default: 0)' }, amount: { type: 'string', description: `Withdrawal amount as a decimal string. ${ESCROW_AMOUNT_DESCRIPTION}` } },
    handler: async (input, client) => ({ signature: await client.escrowV2.withdraw(requiredPublicKey(input, 'agentWallet'), optionalBn(input, 'nonce', new BN(0)), requiredBn(input, 'amount')) }),
  },
  {
    name: 'sap_close_escrow_v2',
    title: 'Close SAP Escrow V2',
    description: 'Close a V2 escrow.',
    inputSchema: { agentWallet: { type: 'string', description: 'Agent wallet public key (base58)' }, nonce: { type: 'string', description: 'Escrow nonce (as a decimal string, default: 0)' } },
    handler: async (input, client) => ({ signature: await client.escrowV2.close(requiredPublicKey(input, 'agentWallet'), optionalBn(input, 'nonce', new BN(0))) }),
  },
];

const reputationAndTrustTools: ToolRegistration[] = [
  {
    name: 'sap_give_feedback',
    title: 'Give SAP Feedback',
    description: 'Create on-chain feedback for an agent wallet.',
    inputSchema: { agentWallet: { type: 'string', description: 'Agent wallet public key (base58) to give feedback for' }, score: { type: 'number', description: 'Feedback score (numeric, e.g. 1–5)' }, tag: { type: 'string', description: 'Optional feedback tag/category (default: "general")' }, commentHash: { type: 'array', description: 'Optional 32-byte comment hash as a byte array, hex string, or base64 string' } },
    handler: async (input, client) => ({ signature: await client.feedback.give(requiredPublicKey(input, 'agentWallet'), parseFeedbackArgs(input)) }),
  },
  {
    name: 'sap_update_feedback',
    title: 'Update SAP Feedback',
    description: 'Update existing on-chain feedback for an agent wallet.',
    inputSchema: { agentWallet: { type: 'string', description: 'Agent wallet public key (base58) to update feedback for' }, score: { type: 'number', description: 'New feedback score (numeric, e.g. 1–5)' }, tag: { type: 'string', description: 'Optional new feedback tag/category' }, commentHash: { type: 'array', description: 'Optional 32-byte comment hash as a byte array, hex string, or base64 string' } },
    handler: async (input, client) => ({ signature: await client.feedback.update(requiredPublicKey(input, 'agentWallet'), parseUpdateFeedbackArgs(input)) }),
  },
  {
    name: 'sap_revoke_feedback',
    title: 'Revoke SAP Feedback',
    description: 'Revoke feedback for an agent wallet.',
    inputSchema: { agentWallet: { type: 'string', description: 'Agent wallet public key (base58) to revoke feedback for' } },
    handler: async (input, client) => ({ signature: await client.feedback.revoke(requiredPublicKey(input, 'agentWallet')) }),
  },
  {
    name: 'sap_create_attestation',
    title: 'Create SAP Attestation',
    description: 'Create an on-chain attestation for an agent wallet.',
    inputSchema: { agentWallet: { type: 'string', description: 'Agent wallet public key (base58) to create attestation for' }, attestationType: { type: 'string', description: 'Optional attestation type string (default: "generic")' }, metadataHash: { type: 'array', description: '32-byte metadata hash as a byte array, hex string, or base64 string' }, expiresAt: { type: 'string', description: 'Optional expiry timestamp (as a decimal string, 0 = no expiry)' } },
    handler: async (input, client) => ({ signature: await client.attestation.create(requiredPublicKey(input, 'agentWallet'), parseAttestationArgs(input)) }),
  },
  {
    name: 'sap_revoke_attestation',
    title: 'Revoke SAP Attestation',
    description: 'Revoke attestation for an agent wallet.',
    inputSchema: { agentWallet: { type: 'string', description: 'Agent wallet public key (base58) to revoke attestation for' } },
    handler: async (input, client) => ({ signature: await client.attestation.revoke(requiredPublicKey(input, 'agentWallet')) }),
  },
  {
    name: 'sap_fairscale_score',
    title: 'Get FairScale Score',
    description: 'Score an agent with SDK FairScaleRegistry.score.',
    inputSchema: { agent: { type: 'string', description: 'Agent PDA or wallet (base58) to score' }, task: { type: 'string', description: 'Optional FairScale task type: one of "defi_execution", "trust_focused", "work_focused", "hiring"' } },
    handler: async (input, client) => ({ score: await client.fairscale.score(requiredString(input, 'agent'), { task: optionalFairScaleTask(input, 'task') }) }),
  },
  {
    name: 'sap_fairscale_trust_gate',
    title: 'FairScale Trust Gate',
    description: 'Evaluate an agent with SDK FairScaleRegistry.trustGate.',
    inputSchema: { agent: { type: 'string', description: 'Agent PDA or wallet (base58) to evaluate' }, minScore: { type: 'number', description: 'Optional minimum trust score threshold' }, requireVerification: { type: 'boolean', description: 'Whether verified status is required to pass the gate (default: false)' } },
    handler: async (input, client) => ({
      result: await client.fairscale.trustGate(requiredString(input, 'agent'), {
        minScore: optionalNumber(input, 'minScore'),
        requireVerification: input.requireVerification === true,
      }),
    }),
  },
];

const vaultSessionTools: ToolRegistration[] = [
  {
    name: 'sap_init_vault',
    title: 'Initialize SAP Vault',
    description: 'Initialize a memory vault for the connected agent.',
    inputSchema: { vaultNonce: { type: 'array', description: 'Vault nonce as a byte array, hex string, or base64 string' } },
    handler: async (input, client) => ({ signature: await client.vault.initVault(requiredBytes(input, 'vaultNonce')) }),
  },
  {
    name: 'sap_open_vault_session',
    title: 'Open SAP Vault Session',
    description: 'Open a vault session by 32-byte session hash.',
    inputSchema: { sessionHash: { type: 'array', description: '32-byte session hash as a byte array, hex string, or base64 string' } },
    handler: async (input, client) => ({ signature: await client.vault.openSession(requiredBytes(input, 'sessionHash', 32)) }),
  },
  {
    name: 'sap_inscribe_memory',
    title: 'Inscribe SAP Memory',
    description: 'Inscribe encrypted memory using SDK VaultModule.inscribe.',
    inputSchema: { type: 'object', additionalProperties: true, description: 'Object containing memory inscription fields: sequence (number), encryptedData (byte array), nonce (byte array), contentHash (32-byte array), and optional totalFragments, fragmentIndex, compression, epochIndex' },
    handler: async (input, client) => ({ signature: await client.vault.inscribe(parseMemoryArgs(input)) }),
  },
  {
    name: 'sap_compact_inscribe_memory',
    title: 'Compact Inscribe SAP Memory',
    description: 'Compact memory inscription with explicit vault/session PDAs.',
    inputSchema: { sessionPda: { type: 'string', description: 'Session PDA (base58) for the memory inscription' }, vaultPda: { type: 'string', description: 'Vault PDA (base58) for the memory inscription' }, encryptedData: { type: 'array', description: 'Encrypted memory data as a byte array, hex string, or base64 string' }, nonce: { type: 'array', description: 'Encryption nonce as a byte array, hex string, or base64 string' }, contentHash: { type: 'array', description: '32-byte content hash as a byte array, hex string, or base64 string' } },
    handler: async (input, client) => ({
      signature: await client.vault.compactInscribe(
        requiredPublicKey(input, 'sessionPda'),
        requiredPublicKey(input, 'vaultPda'),
        parseCompactMemoryArgs(input)
      ),
    }),
  },
  {
    name: 'sap_session_start',
    title: 'Start SAP Memory Session',
    description: 'Start a high-level SDK session by session ID.',
    inputSchema: { sessionId: { type: 'string', description: 'High-level session identifier string' }, vaultNonce: { type: 'array', description: 'Optional vault nonce as a byte array, hex string, or base64 string' } },
    handler: async (input, client) => ({
      session: await client.session.start(requiredString(input, 'sessionId'), optionalBytes(input, 'vaultNonce', [])),
    }),
  },
  {
    name: 'sap_session_read_latest',
    title: 'Read Latest SAP Session Entries',
    description: 'Read latest entries from a high-level SDK session ID.',
    inputSchema: { sessionId: { type: 'string', description: 'High-level session identifier string to read latest entries from' } },
    handler: async (input, client) => {
      const ctx = client.session.deriveContext(requiredString(input, 'sessionId'));
      return { entries: await client.session.readLatest(ctx) };
    },
  },
  {
    name: 'sap_session_status',
    title: 'Get SAP Session Status',
    description: 'Fetch high-level SDK session status by session ID.',
    inputSchema: { sessionId: { type: 'string', description: 'High-level session identifier string to get status for' } },
    handler: async (input, client) => {
      const ctx = client.session.deriveContext(requiredString(input, 'sessionId'));
      return { status: await client.session.getStatus(ctx) };
    },
  },
];

const toolRegistryTools: ToolRegistration[] = [
  {
    name: 'sap_publish_tool_by_name',
    title: 'Publish SAP Tool By Name',
    description: 'Publish a tool descriptor using SDK ToolsModule.publishByName.',
    inputSchema: {
      toolName: { type: 'string', description: 'Name of the tool to publish' },
      protocolId: { type: 'string', description: 'Protocol ID the tool belongs to (e.g. "jupiter")' },
      description: { type: 'string', description: 'Human-readable description of the tool' },
      inputSchemaJson: { type: 'string', description: 'JSON string of the tool input schema' },
      outputSchemaJson: { type: 'string', description: 'JSON string of the tool output schema' },
      httpMethod: { type: 'number', description: 'HTTP method code (e.g. 0=GET, 1=POST)' },
      category: { type: 'number', description: 'Numeric tool category ID' },
      paramsCount: { type: 'number', description: 'Total number of parameters the tool accepts' },
      requiredParams: { type: 'number', description: 'Number of required parameters' },
      isCompound: { type: 'boolean', description: 'Whether the tool is a compound tool (default: false)' },
    },
    handler: async (input, client) => ({
      signature: await client.tools.publishByName(
        requiredString(input, 'toolName'),
        requiredString(input, 'protocolId'),
        requiredString(input, 'description'),
        requiredString(input, 'inputSchemaJson'),
        requiredString(input, 'outputSchemaJson'),
        requiredNumber(input, 'httpMethod'),
        requiredNumber(input, 'category'),
        requiredNumber(input, 'paramsCount'),
        requiredNumber(input, 'requiredParams'),
        input.isCompound === true
      ),
    }),
  },
  {
    name: 'sap_update_tool',
    title: 'Update SAP Tool',
    description: 'Update tool descriptor hashes using SDK ToolsModule.update.',
    inputSchema: { toolName: { type: 'string', description: 'Name of the tool to update' }, type: 'object', additionalProperties: true, description: 'Object containing optional update fields: descriptionHash, inputSchemaHash, outputSchemaHash (32-byte arrays), httpMethod, category, paramsCount, requiredParams (numbers)' },
    handler: async (input, client) => ({ signature: await client.tools.update(requiredString(input, 'toolName'), parseUpdateToolArgs(input)) }),
  },
  {
    name: 'sap_deactivate_tool',
    title: 'Deactivate SAP Tool',
    description: 'Deactivate a SAP tool descriptor by name.',
    inputSchema: { toolName: { type: 'string', description: 'Name of the tool descriptor to deactivate' } },
    handler: async (input, client) => ({ signature: await client.tools.deactivate(requiredString(input, 'toolName')) }),
  },
  {
    name: 'sap_reactivate_tool',
    title: 'Reactivate SAP Tool',
    description: 'Reactivate a SAP tool descriptor by name.',
    inputSchema: { toolName: { type: 'string', description: 'Name of the tool descriptor to reactivate' } },
    handler: async (input, client) => ({ signature: await client.tools.reactivate(requiredString(input, 'toolName')) }),
  },
  {
    name: 'sap_report_tool_invocations',
    title: 'Report SAP Tool Invocations',
    description: 'Report invocation count for a SAP tool descriptor.',
    inputSchema: { toolName: { type: 'string', description: 'Name of the tool descriptor to report invocations for' }, invocations: { type: 'number', description: 'Number of invocations to report' } },
    handler: async (input, client) => ({
      signature: await client.tools.reportInvocations(requiredString(input, 'toolName'), requiredNumber(input, 'invocations')),
    }),
  },
];

const stakingAndSubscriptionTools: ToolRegistration[] = [
  {
    name: 'sap_init_stake',
    title: 'Initialize SAP Stake',
    description: 'Initialize stake for an agent wallet.',
    inputSchema: { agentWallet: { type: 'string', description: 'Agent wallet public key (base58) to initialize stake for' }, initialDeposit: { type: 'string', description: 'Initial stake deposit amount in lamports (as a decimal string)' } },
    handler: async (input, client) => ({ signature: await client.staking.initStake(requiredPublicKey(input, 'agentWallet'), requiredBn(input, 'initialDeposit')) }),
  },
  {
    name: 'sap_deposit_stake',
    title: 'Deposit SAP Stake',
    description: 'Deposit additional stake for an agent wallet.',
    inputSchema: { agentWallet: { type: 'string', description: 'Agent wallet public key (base58)' }, amount: { type: 'string', description: 'Additional stake deposit amount in lamports (as a decimal string)' } },
    handler: async (input, client) => ({ signature: await client.staking.deposit(requiredPublicKey(input, 'agentWallet'), requiredBn(input, 'amount')) }),
  },
  {
    name: 'sap_request_unstake',
    title: 'Request SAP Unstake',
    description: 'Request unstake for an agent wallet.',
    inputSchema: { agentWallet: { type: 'string', description: 'Agent wallet public key (base58)' }, amount: { type: 'string', description: 'Unstake request amount in lamports (as a decimal string)' } },
    handler: async (input, client) => ({ signature: await client.staking.requestUnstake(requiredPublicKey(input, 'agentWallet'), requiredBn(input, 'amount')) }),
  },
  {
    name: 'sap_complete_unstake',
    title: 'Complete SAP Unstake',
    description: 'Complete unstake for an agent wallet.',
    inputSchema: { agentWallet: { type: 'string', description: 'Agent wallet public key (base58) to complete unstaking for' } },
    handler: async (input, client) => ({ signature: await client.staking.completeUnstake(requiredPublicKey(input, 'agentWallet')) }),
  },
  {
    name: 'sap_create_subscription',
    title: 'Create SAP Subscription',
    description: 'Create a recurring subscription for an agent wallet.',
    inputSchema: { agentWallet: { type: 'string', description: 'Agent wallet public key (base58) to create subscription for' }, subId: { type: 'string', description: 'Subscription ID (as a decimal string, default: 0)' }, pricePerInterval: { type: 'string', description: 'Price per billing interval in lamports (as a decimal string)' }, billingInterval: { type: 'number', description: 'Billing interval in seconds between charges' }, initialFund: { type: 'string', description: 'Initial fund amount in lamports (as a decimal string)' } },
    handler: async (input, client) => ({ signature: await client.subscription.create(requiredPublicKey(input, 'agentWallet'), parseSubscriptionArgs(input)) }),
  },
  {
    name: 'sap_fund_subscription',
    title: 'Fund SAP Subscription',
    description: 'Fund a recurring subscription.',
    inputSchema: { agentWallet: { type: 'string', description: 'Agent wallet public key (base58)' }, subId: { type: 'string', description: 'Subscription ID (as a decimal string, default: 0)' }, amount: { type: 'string', description: 'Funding amount in lamports (as a decimal string)' } },
    handler: async (input, client) => ({
      signature: await client.subscription.fund(requiredPublicKey(input, 'agentWallet'), optionalBn(input, 'subId', new BN(0)), requiredBn(input, 'amount')),
    }),
  },
  {
    name: 'sap_cancel_subscription',
    title: 'Cancel SAP Subscription',
    description: 'Cancel a recurring subscription.',
    inputSchema: { agentWallet: { type: 'string', description: 'Agent wallet public key (base58)' }, subId: { type: 'string', description: 'Subscription ID (as a decimal string, default: 0)' } },
    handler: async (input, client) => ({
      signature: await client.subscription.cancel(requiredPublicKey(input, 'agentWallet'), optionalBn(input, 'subId', new BN(0))),
    }),
  },
];

const sapToolGroups: ToolRegistration[][] = [
  agentTools,
  discoveryTools,
  indexAndFetchTools,
  paymentAndEscrowTools,
  escrowV2Tools,
  reputationAndTrustTools,
  vaultSessionTools,
  toolRegistryTools,
  stakingAndSubscriptionTools,
];

/**
 * @name registerSapSdkTools
 * @description Registers production SAP SDK-backed tools using the current public SDK v1.0.x client surface.
 */
export function registerSapSdkTools(server: Server, _context: SapMcpContext): void {
  logger.debug('Registering SAP SDK tools');

  if (!isSapClientInitialized()) {
    logger.warn('SAP client not initialized - skipping SDK tools');
    return;
  }

  const client = getSapClient();
  let count = 0;
  for (const group of sapToolGroups) {
    for (const tool of group) {
      registerSapTool(server, client, tool);
      count++;
    }
  }

  logger.debug('SAP SDK tools registered', { count });
}
