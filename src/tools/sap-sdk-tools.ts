/**
 * SAP SDK MCP tools.
 *
 * This module intentionally wraps only methods that exist on
 * `@oobe-protocol-labs/synapse-sap-sdk@1.0.x`. It does not create local
 * facades for missing SDK namespaces and it does not fabricate network data.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { PublicKey, SystemProgram, Transaction, type AccountMeta } from '@solana/web3.js';
import BN from 'bn.js';
import { Pda, TOOL_CATEGORY_VALUES, USDC_MINT_DEVNET, USDC_MINT_MAINNET } from '@oobe-protocol-labs/synapse-sap-sdk';
import {
  SettlementMode,
  TokenType,
  type Capability,
  type CompactInscribeArgs,
  type CreateAttestationArgs,
  type CreateEscrowV2Args,
  type CreateSubscriptionArgs,
  type EscrowAccountV2Data,
  type GiveFeedbackArgs,
  type InscribeMemoryArgs,
  type PendingSettlementData,
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
import {
  DEFAULT_SAP_PROGRAM_ID,
  SAP_PROTOCOL_TREASURY,
  SAP_REGISTRATION_FEE_LAMPORTS,
} from '../core/constants.js';
import { classifyTool } from '../payments/pricing.js';

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
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

export const SAP_AGENT_CAPABILITY_INPUT_SCHEMA = {
  oneOf: [
    {
      type: 'string',
      description: 'Capability id shorthand, for example jupiter:swap, pyth:price, metaplex:identity, sns:identity, or risk:management.',
    },
    {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Required stable capability id. Use protocol:action naming, for example jupiter:swap, pyth:price, metaplex:identity, sns:identity, x402:payments, or risk:management.',
        },
        description: {
          type: 'string',
          description: 'Optional human-readable capability description for agents and explorers.',
        },
        protocolId: {
          type: 'string',
          description: 'Optional protocol namespace backing this capability, for example sap, mcp, jupiter, pyth, metaplex, sns, x402, or custom.',
        },
        version: {
          type: 'string',
          description: 'Optional capability version string. Use semver when the capability maps to an API contract.',
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
  ],
} as const;

export const SAP_AGENT_PRICING_TIER_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    tierId: {
      type: 'string',
      description: 'Stable tier id, for example default, read, premium, value-action, or enterprise.',
    },
    pricePerCall: {
      type: 'string',
      description: 'Price per call in the smallest unit of tokenType: lamports for sol, micro-USDC for usdc, or base units for spl.',
    },
    minPricePerCall: {
      type: 'string',
      description: 'Optional floor price per call in the smallest unit of tokenType.',
    },
    maxPricePerCall: {
      type: 'string',
      description: 'Optional ceiling price per call in the smallest unit of tokenType.',
    },
    rateLimit: {
      type: 'number',
      description: 'Maximum calls per second allowed by this tier. Defaults to 60.',
    },
    maxCallsPerSession: {
      type: 'number',
      description: 'Maximum calls allowed per session for this tier. Defaults to 1000.',
    },
    burstLimit: {
      type: 'number',
      description: 'Optional short-window burst allowance for this tier.',
    },
    tokenType: {
      type: 'string',
      enum: ['sol', 'usdc', 'spl'],
      description: 'Payment token type. Use usdc for x402/pay.sh agent commerce. Use spl only with tokenMint.',
    },
    tokenMint: {
      type: 'string',
      description: 'Optional SPL token mint public key. Required when tokenType is spl. For mainnet USDC use EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v.',
    },
    tokenDecimals: {
      type: 'number',
      description: 'Decimals for the payment token. Defaults to 6 for usdc and 9 for sol when omitted.',
    },
    settlementMode: {
      type: 'string',
      enum: ['instant', 'escrow', 'batched', 'x402'],
      description: 'Settlement strategy. Use x402 for HTTP 402/pay.sh flows, escrow for prepaid SAP usage ledgers, instant for direct pay-per-call, and batched for periodic settlement.',
    },
    minEscrowDeposit: {
      type: 'string',
      description: 'Optional minimum escrow deposit in the smallest unit of tokenType.',
    },
    batchIntervalSec: {
      type: 'number',
      description: 'Optional settlement batch interval in seconds when settlementMode is batched.',
    },
    volumeCurve: {
      type: 'array',
      description: 'Optional volume discounts. Each item lowers pricePerCall after a call threshold.',
      items: {
        type: 'object',
        properties: {
          afterCalls: { type: 'number', description: 'Call count threshold where this price starts.' },
          pricePerCall: { type: 'string', description: 'Discounted price per call in the smallest unit of tokenType.' },
        },
        required: ['afterCalls', 'pricePerCall'],
        additionalProperties: false,
      },
    },
  },
  required: ['pricePerCall'],
  additionalProperties: false,
} as const;

export const SAP_AGENT_REGISTER_INPUT_SCHEMA = {
  name: {
    type: 'string',
    description: 'Required public display name for the SAP agent. Keep it stable enough for explorers and humans.',
  },
  description: {
    type: 'string',
    description: 'Required public description of what the agent does, which protocols it can use, and its safety/trust boundaries.',
  },
  capabilities: {
    type: 'array',
    description: 'Required capability list. Prefer object form for production; strings are accepted as shorthand.',
    items: SAP_AGENT_CAPABILITY_INPUT_SCHEMA,
  },
  pricing: {
    type: 'array',
    description: 'Optional pricing tiers advertised by the agent. Use tokenType usdc + settlementMode x402 for pay.sh/x402 agent commerce.',
    items: SAP_AGENT_PRICING_TIER_INPUT_SCHEMA,
  },
  protocols: {
    type: 'array',
    items: { type: 'string' },
    description: 'Required protocol tags the agent supports, for example sap, mcp, jupiter, pyth, metaplex, sns, x402, payments.',
  },
  agentId: {
    type: 'string',
    description: 'Optional stable lowercase agent id, for example solking. This is separate from the on-chain agent PDA.',
  },
  agentUri: {
    type: 'string',
    description: 'Optional public HTTPS/IPFS/Arweave/Kommodo URI for the agent profile metadata or profile page. Never use local desktop file paths.',
  },
  metadataUri: {
    type: 'string',
    description: 'Alias for agentUri. Prefer a public JSON metadata document containing name, description, image, external_url, attributes, sap, metaplex, sns, and x402 fields.',
  },
  x402Endpoint: {
    type: 'string',
    description: 'Optional public x402 discovery/payment endpoint, usually https://host/.well-known/x402 for external agent services.',
  },
} as const;

export const SAP_AGENT_UPDATE_INPUT_SCHEMA = {
  name: {
    type: 'string',
    description: 'Optional replacement display name. Omit to keep the current name.',
  },
  description: {
    type: 'string',
    description: 'Optional replacement description. Omit to keep the current description.',
  },
  capabilities: {
    type: 'array',
    description: 'Optional full replacement capability list. Omit to keep current capabilities; do not send only the new item unless replacing the whole list is intended.',
    items: SAP_AGENT_CAPABILITY_INPUT_SCHEMA,
  },
  pricing: {
    type: 'array',
    description: 'Optional full replacement pricing tier list. Omit to keep current pricing.',
    items: SAP_AGENT_PRICING_TIER_INPUT_SCHEMA,
  },
  protocols: {
    type: 'array',
    items: { type: 'string' },
    description: 'Optional full replacement protocol list. Omit to keep current protocols.',
  },
  agentId: {
    type: 'string',
    description: 'Optional replacement stable agent id. Omit to keep current agentId.',
  },
  agentUri: {
    type: 'string',
    description: 'Optional replacement public URI for agent metadata/profile. Use this to update pictures after uploading metadata to IPFS, Arweave, Kommodo, or HTTPS.',
  },
  metadataUri: {
    type: 'string',
    description: 'Alias for agentUri. Use a public metadata JSON URI; never use a desktop file path.',
  },
  x402Endpoint: {
    type: 'string',
    description: 'Optional replacement x402 discovery/payment endpoint. Omit to keep current endpoint.',
  },
} as const;

const SAP_AGENT_IDENTITY_PLAN_INPUT_SCHEMA = {
  intendedAction: {
    type: 'string',
    enum: ['register', 'update', 'link-metaplex', 'link-sns', 'full-identity'],
    description: 'Agent identity lifecycle step to plan. Use register for a new SAP agent, update for profile/image/capability changes, link-metaplex for NFT/MPL Core identity, link-sns for .sol identity, or full-identity for the recommended end-to-end flow.',
  },
  ...SAP_AGENT_REGISTER_INPUT_SCHEMA,
  snsDomain: {
    type: 'string',
    description: 'Optional .sol domain to link after ownership or registration is verified.',
  },
  imageUrl: {
    type: 'string',
    description: 'Optional public image URL. This must be HTTPS, IPFS, Arweave, or another public URI; desktop file paths are not valid.',
  },
  metaplexAsset: {
    type: 'string',
    description: 'Optional Metaplex NFT or MPL Core asset/collection address to reference from public agent metadata.',
  },
  ownerWallet: {
    type: 'string',
    description: 'Optional expected SAP owner wallet. Use this for verification planning only; signing still comes from the active local SAP profile.',
  },
} as const;

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

const escrowV2CreateBuilderInputSchema = {
  depositorWallet: {
    type: 'string',
    description: 'Depositor wallet public key (base58). This wallet signs locally and funds the escrow; hosted SAP MCP never receives its private key.',
  },
  ...escrowV2CreateInputSchema,
} as const;

const escrowV2DepositBuilderInputSchema = {
  depositorWallet: {
    type: 'string',
    description: 'Depositor wallet public key (base58). This wallet signs locally and provides the additional escrow funds.',
  },
  agentWallet: {
    type: 'string',
    description: 'Agent owner wallet public key (base58). The escrow PDA is derived from agentWallet, depositorWallet, and nonce.',
  },
  nonce: {
    type: 'string',
    description: 'Optional escrow nonce as a decimal string. Defaults to 0.',
  },
  amount: {
    type: 'string',
    description: `Deposit amount as a decimal string. ${ESCROW_AMOUNT_DESCRIPTION}`,
  },
} as const;

const escrowV2WithdrawBuilderInputSchema = {
  depositorWallet: {
    type: 'string',
    description: 'Depositor wallet public key (base58). Only the depositor can locally sign a withdrawal from this escrow.',
  },
  agentWallet: {
    type: 'string',
    description: 'Agent owner wallet public key (base58). The escrow PDA is derived from agentWallet, depositorWallet, and nonce.',
  },
  nonce: {
    type: 'string',
    description: 'Optional escrow nonce as a decimal string. Defaults to 0.',
  },
  amount: {
    type: 'string',
    description: `Withdrawal amount as a decimal string. ${ESCROW_AMOUNT_DESCRIPTION}`,
  },
} as const;

const escrowV2SettleBuilderInputSchema = {
  agentWallet: {
    type: 'string',
    description: 'Agent owner wallet public key (base58). This wallet signs locally because settlement releases funds to the serving agent.',
  },
  depositorWallet: {
    type: 'string',
    description: 'Depositor wallet public key (base58) for the escrow being settled.',
  },
  nonce: {
    type: 'string',
    description: 'Optional escrow nonce as a decimal string. Defaults to 0.',
  },
  callsToSettle: {
    type: 'string',
    description: 'Number of served calls to settle as a decimal string.',
  },
  serviceHash: {
    oneOf: [
      {
        type: 'array',
        items: { type: 'number' },
        description: '32-byte service/audit hash as byte array.',
      },
      {
        type: 'string',
        description: '32-byte service/audit hash encoded as 64-char hex or base64 string.',
      },
    ],
    description: '32-byte service/audit hash. Use a stable hash of the fulfilled paid work.',
  },
  coSigner: {
    type: 'string',
    description: 'Optional co-signer public key for CoSigned escrows when the escrow account requires it.',
  },
} as const;

const escrowV2FinalizeBuilderInputSchema = {
  payerWallet: {
    type: 'string',
    description: 'Wallet public key (base58) that signs and pays transaction fees to finalize the pending settlement.',
  },
  agentWallet: {
    type: 'string',
    description: 'Agent owner wallet public key (base58).',
  },
  depositorWallet: {
    type: 'string',
    description: 'Depositor wallet public key (base58).',
  },
  nonce: {
    type: 'string',
    description: 'Optional escrow nonce as a decimal string. Defaults to 0.',
  },
  settlementIndex: {
    type: 'string',
    description: 'Pending settlement index as a decimal string.',
  },
} as const;

const escrowV2CloseBuilderInputSchema = {
  depositorWallet: {
    type: 'string',
    description: 'Depositor wallet public key (base58). The depositor signs locally to close the empty escrow.',
  },
  agentWallet: {
    type: 'string',
    description: 'Agent owner wallet public key (base58).',
  },
  nonce: {
    type: 'string',
    description: 'Optional escrow nonce as a decimal string. Defaults to 0.',
  },
} as const;

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
  freshness: JsonRecord;
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

const directoryPageInflight = new Map<string, Promise<AgentDirectoryPage>>();

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
 *   Includes hostedPricing metadata so agents know the tier and estimated cost.
 */
function ok(payload: unknown, toolName?: string) {
  const pricingMeta = toolName ? buildHostedPricingMeta(toolName) : undefined;
  return createTextResponse(
    JSON.stringify(
      { success: true, ...(pricingMeta ? { hostedPricing: pricingMeta } : {}), ...asObjectPayload(payload) },
      jsonReplacer,
      2,
    ),
  );
}

/**
 * @name buildHostedPricingMeta
 * @description Returns a human-readable pricing hint for a SAP SDK tool.
 *   Uses the same classifyTool function as the hosted monetization gate.
 */
function buildHostedPricingMeta(toolName: string): string {
  const tier = classifyTool(toolName);
  if (tier === 'free') return 'free — no x402 payment required';
  const prices: Record<string, string> = {
    'read-premium': '~$0.001',
    'builder': '~$0.008',
    'value-action': '~$0.09 standard / ~$0.15 heavy',
    'batch': '~$0.09+',
  };
  const price = prices[tier] ?? '~$0.001';
  return `${tier} tier — estimated ${price} USD per call. Use sap_estimate_tool_cost for exact pricing.`;
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

function stableJson(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value) ?? String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
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
    freshness: {
      status: 'fresh',
      cache: 'disabled',
      fetchedAt: new Date().toISOString(),
    },
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

async function getFreshAgentDirectoryPage(client: SapClient, options: AgentDirectoryPageOptions): Promise<AgentDirectoryPage> {
  const cacheKey = stableJson(options);
  const inflight = directoryPageInflight.get(cacheKey);
  if (inflight) {
    const page = await inflight;
    return {
      ...page,
      freshness: {
        ...page.freshness,
        status: 'fresh_joined_inflight',
        cache: 'disabled',
        key: cacheKey.slice(0, 24),
      },
    };
  }

  const load = buildAgentDirectoryPage(client, options)
    .finally(() => {
      directoryPageInflight.delete(cacheKey);
    });
  directoryPageInflight.set(cacheKey, load);

  const page = await load;
  return {
    ...page,
    freshness: {
      ...page.freshness,
      status: 'fresh',
      cache: 'disabled',
      key: cacheKey.slice(0, 24),
    },
  };
}

async function buildSapAgentContext(input: JsonRecord, client: SapClient): Promise<JsonRecord> {
  const wallet = optionalString(input, 'wallet');
  const agentPda = optionalString(input, 'agentPda');
  const query = optionalString(input, 'query');
  const limit = Math.max(1, Math.min(optionalNumber(input, 'limit') ?? 10, 20));
  const exact: JsonRecord = {};

  if (wallet) {
    const owner = new PublicKey(wallet);
    const derivedAgentPda = client.agent.deriveAgent(owner)[0].toBase58();
    const [agent, active, profile] = await Promise.all([
      client.agent.fetchNullable(owner),
      client.discovery.isAgentActive(owner).catch(() => false),
      client.discovery.getAgentProfile(owner).catch((error) => ({
        unavailable: true,
        reason: error instanceof Error ? error.message : 'profile_fetch_failed',
      })),
    ]);
    exact.wallet = wallet;
    exact.agentPda = derivedAgentPda;
    exact.active = active;
    exact.agent = agent;
    exact.profile = profile;
  }

  const directory = wallet
    ? null
    : await getFreshAgentDirectoryPage(client, {
        includeInactive: false,
        protocol: undefined,
        capability: undefined,
        capabilities: [],
        capabilityMode: 'any',
        query,
        wallet: undefined,
        agentPda,
        hasX402Endpoint: undefined,
        limit,
        offset: 0,
        view: 'compact',
        includeProtocolIndexes: false,
      });

  return {
    contextType: wallet ? 'exact-wallet' : agentPda ? 'exact-agent-pda' : query ? 'compact-query' : 'compact-orientation',
    freeRead: true,
    exact,
    directory,
    routing: {
      firstReads: [
        'Use sap_get_agent or sap_get_agent_profile when the owner wallet is known.',
        'Use sap_list_agents with limit <= 20 and view: compact for free orientation.',
        'Use sap_discover_agents or sap_list_all_agents only for paid search, enriched rows, large pages, or ecosystem-scale scans.',
      ],
      paidHostedTools: 'Use sap_payments_call_paid_tool when a hosted tool returns x402 payment_required and the runtime cannot replay x402 natively.',
      registryWrites: 'Use sap_payments_register_agent and sap_payments_update_agent for wallet-owned SAP registry writes. Do not retry hosted accountless writes after hosted_local_signer_required.',
      unsignedTransactions: 'Use hosted builders when available, then sap_payments_finalize_transaction with submit:true after user confirmation.',
    },
    nextActions: [
      wallet ? 'If the user wants details, use the exact profile already returned here before paid discovery.' : 'If the user selects an agent row, call sap_get_agent_profile with that row wallet.',
      'For registration or image/profile updates, call sap_agent_identity_plan before any write.',
      'For paid or write flows, call sap_payments_readiness first when the local bridge is visible.',
    ],
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
 * @name optionalTokenType
 * @description Converts public tokenType strings into SDK Anchor enum variants.
 */
function optionalTokenType(input: JsonRecord): { tokenType: typeof TokenType[keyof typeof TokenType]; decimalsFallback: number } {
  const raw = optionalString(input, 'tokenType') ?? 'sol';
  const normalized = raw.trim().toLowerCase();

  if (normalized === 'sol' || normalized === 'native' || normalized === 'lamports') {
    return { tokenType: TokenType.Sol, decimalsFallback: 9 };
  }
  if (normalized === 'usdc' || normalized === 'micro-usdc' || normalized === 'micro_usdc') {
    return { tokenType: TokenType.Usdc, decimalsFallback: 6 };
  }
  if (normalized === 'spl' || normalized === 'token') {
    return { tokenType: TokenType.Spl, decimalsFallback: 0 };
  }

  throw new Error('tokenType must be one of sol, usdc, or spl');
}

/**
 * @name optionalSettlementMode
 * @description Converts public settlementMode strings into SDK Anchor enum variants.
 */
function optionalSettlementMode(input: JsonRecord): typeof SettlementMode[keyof typeof SettlementMode] {
  const raw = optionalString(input, 'settlementMode') ?? 'escrow';
  const normalized = raw.trim().toLowerCase();

  if (normalized === 'instant') {
    return SettlementMode.Instant;
  }
  if (normalized === 'escrow') {
    return SettlementMode.Escrow;
  }
  if (normalized === 'batched' || normalized === 'batch') {
    return SettlementMode.Batched;
  }
  if (normalized === 'x402' || normalized === 'pay.sh' || normalized === 'paysh') {
    return SettlementMode.X402;
  }

  throw new Error('settlementMode must be one of instant, escrow, batched, or x402');
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
    const { tokenType, decimalsFallback } = optionalTokenType(record);
    const tokenMint = optionalPublicKey(record, 'tokenMint') ?? null;
    if (tokenType === TokenType.Spl && tokenMint === null) {
      throw new Error('pricing.tokenMint is required when tokenType is spl');
    }
    const volumeCurve = parseVolumeCurve(record.volumeCurve);
    return {
      tierId: optionalString(record, 'tierId') ?? 'default',
      pricePerCall,
      minPricePerCall: record.minPricePerCall === undefined ? null : requiredBn(record, 'minPricePerCall'),
      maxPricePerCall: record.maxPricePerCall === undefined ? null : requiredBn(record, 'maxPricePerCall'),
      rateLimit: optionalNumber(record, 'rateLimit') ?? 60,
      maxCallsPerSession: optionalNumber(record, 'maxCallsPerSession') ?? 1_000,
      burstLimit: optionalNumber(record, 'burstLimit') ?? null,
      tokenType,
      tokenMint,
      tokenDecimals: optionalNumber(record, 'tokenDecimals') ?? decimalsFallback,
      settlementMode: optionalSettlementMode(record),
      minEscrowDeposit: record.minEscrowDeposit === undefined ? null : requiredBn(record, 'minEscrowDeposit'),
      batchIntervalSec: optionalNumber(record, 'batchIntervalSec') ?? null,
      volumeCurve: volumeCurve.length > 0 ? volumeCurve : null,
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
export function parseUpdateAgentArgs(input: JsonRecord): UpdateAgentArgs {
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

function parseIdentityPlanAction(input: JsonRecord): string {
  const value = optionalString(input, 'intendedAction') ?? 'full-identity';
  if (['register', 'update', 'link-metaplex', 'link-sns', 'full-identity'].includes(value)) {
    return value;
  }
  throw new Error('intendedAction must be one of register, update, link-metaplex, link-sns, full-identity');
}

function optionalPublicMetadataUri(input: JsonRecord): string | null {
  return optionalString(input, 'metadataUri') ?? optionalString(input, 'agentUri') ?? null;
}

function buildSapAgentIdentityPlan(input: JsonRecord): JsonRecord {
  const intendedAction = parseIdentityPlanAction(input);
  const metadataUri = optionalPublicMetadataUri(input);
  const imageUrl = optionalString(input, 'imageUrl') ?? null;
  const metaplexAsset = optionalString(input, 'metaplexAsset') ?? null;
  const snsDomain = optionalString(input, 'snsDomain') ?? null;
  const ownerWallet = optionalString(input, 'ownerWallet') ?? null;
  const missingRegisterFields = ['name', 'description', 'capabilities', 'protocols']
    .filter((field) => input[field] === undefined || input[field] === null);
  const hasCompleteRegisterFields = missingRegisterFields.length === 0;
  const registerArgs = hasCompleteRegisterFields
    ? parseRegisterAgentArgs({
        ...input,
        capabilities: input.capabilities ?? [],
        pricing: input.pricing ?? [],
        protocols: input.protocols ?? [],
      })
    : null;
  const updateArgs = parseUpdateAgentArgs(input);

  return {
    intendedAction,
    trustBoundary: {
      hostedSap: 'Use hosted sap for reads, paid hosted tools, and unsigned builders.',
      localSapPayments: 'Use local sap_payments for x402 payment signing, SAP registry writes, and transaction finalization.',
      keypairMaterial: 'Never read or export keypair JSON. Only local SAP MCP signer tools may sign.',
    },
    nextTools: {
      readiness: 'sap_payments_readiness',
      register: intendedAction === 'register' || intendedAction === 'full-identity' ? 'sap_payments_register_agent' : null,
      update: intendedAction !== 'register' ? 'sap_payments_update_agent' : null,
      metaplex: metaplexAsset ? 'metaplex-nft_* or DAS verification tools before SAP metadata update' : null,
      sns: snsDomain ? ['sap_sns_check_domain', 'sap_sns_check_ownership', 'sap_sns_build_manage_record_transaction when managing records'] : null,
      profileVerification: 'sap_get_agent_profile',
    },
    missingRegisterFields,
    normalizedRegistration: registerArgs
      ? {
          name: registerArgs.name,
          description: registerArgs.description,
          agentId: registerArgs.agentId,
          agentUri: registerArgs.agentUri,
          x402Endpoint: registerArgs.x402Endpoint,
          protocols: registerArgs.protocols,
          capabilities: registerArgs.capabilities,
          pricing: registerArgs.pricing,
          confirm: true,
        }
      : null,
    normalizedUpdate: {
      name: updateArgs.name,
      description: updateArgs.description,
      agentId: updateArgs.agentId,
      agentUri: updateArgs.agentUri,
      x402Endpoint: updateArgs.x402Endpoint,
      protocols: updateArgs.protocols,
      capabilities: updateArgs.capabilities,
      pricing: updateArgs.pricing,
      confirm: true,
    },
    publicMetadataContract: {
      requiredForImages: true,
      metadataUri,
      imageUrl,
      metaplexAsset,
      snsDomain,
      recommendedShape: {
        name: input.name ?? '<agent name>',
        description: input.description ?? '<agent description>',
        image: imageUrl ?? '<public image URL>',
        external_url: ownerWallet ? `https://explorer.oobeprotocol.ai/agents/${ownerWallet}` : '<public agent page>',
        attributes: [
          { trait_type: 'Protocol', value: 'SAP' },
          { trait_type: 'Identity', value: [metaplexAsset ? 'Metaplex' : null, snsDomain ? 'SNS' : null].filter(Boolean).join(' + ') || 'SAP' },
        ],
        sap: {
          ownerWallet: ownerWallet ?? '<owner wallet>',
          agentId: optionalString(input, 'agentId') ?? '<stable id>',
          capabilities: Array.isArray(input.capabilities) ? input.capabilities : [],
        },
        metaplex: metaplexAsset ? { asset: metaplexAsset } : null,
        sns: snsDomain ? { domain: snsDomain } : null,
        x402: optionalString(input, 'x402Endpoint') ? { endpoint: optionalString(input, 'x402Endpoint') } : null,
      },
    },
    verificationChecklist: [
      'Call sap_payments_readiness before paid/write actions.',
      'For registration, call sap_payments_register_agent with confirm:true; do not call hosted sap_register_agent after hosted_local_signer_required.',
      'Verify sap_payments_register_agent success, confirmationStatus, agentPda, and protocolFee.status.',
      'Fetch sap_get_agent_profile by owner wallet after registration or update.',
      'For update, verify every intended replacement field because arrays are full replacements.',
      'For Metaplex identity, verify the asset/collection metadata URI and update authority before linking it from SAP metadata.',
      'For SNS identity, verify domain ownership and records before claiming the .sol identity is linked.',
    ],
    forbiddenActions: [
      'Do not create temporary signing scripts.',
      'Do not read keypair JSON.',
      'Do not reuse stale x402 payment signatures.',
      'Do not pay hosted x402 fees for hosted_local_signer_required registry writes.',
      'Do not announce lifecycle complete if protocolFee.status is missing_or_underpaid.',
    ],
  };
}

function buildSapProtocolInvariants(): JsonRecord {
  return {
    protocol: {
      name: 'Synapse Agent Protocol',
      programId: DEFAULT_SAP_PROGRAM_ID,
      network: 'mainnet-beta',
      custodyModel: 'non-custodial',
    },
    registrationFee: {
      sourceExpected: true,
      treasury: SAP_PROTOCOL_TREASURY,
      lamports: SAP_REGISTRATION_FEE_LAMPORTS.toString(10),
      sol: Number(SAP_REGISTRATION_FEE_LAMPORTS) / 1_000_000_000,
      verification: 'sap_payments_register_agent verifies the landed transaction pre/post balance delta for the treasury account because deployed program behavior can drift from the source-level invariant.',
      failureStatus: 'missing_or_underpaid',
      failureRule: 'If protocolFee.status is missing_or_underpaid, the agent account can still exist, but sap_payments_register_agent must return success:false, agentRegistered:true, and protocolComplete:false. Do not retry registration automatically; inspect the signature, deployed SAP program, and treasury delta first.',
    },
    hostedWritePolicy: {
      register: 'Hosted sap_register_agent is accountless and returns hosted_local_signer_required before x402 payment.',
      update: 'Hosted sap_update_agent is accountless and returns hosted_local_signer_required before x402 payment.',
      sns: 'Hosted direct SNS writes require a local signer or unsigned builder. If no builder exists, stop and route through local SAP MCP.',
      noChargeRule: 'hosted_local_signer_required is a routing guard, not a paid failure; no hosted x402 fee should be charged for that blocked write.',
    },
    localSignerRoutes: {
      readiness: 'sap_payments_readiness',
      registerAgent: 'sap_payments_register_agent',
      updateAgent: 'sap_payments_update_agent',
      finalizeUnsignedTransaction: 'sap_payments_finalize_transaction',
      paidHostedTool: 'sap_payments_call_paid_tool',
      externalX402Http: 'sap_payments_call_external_x402',
    },
    identityPipeline: [
      'Call sap_agent_identity_plan for register, update, Metaplex, SNS, or full-identity intent.',
      'Upload image and metadata to a public URL before writing agentUri or metadataUri.',
      'Use sap_payments_register_agent for local non-custodial registration.',
      'Verify success, agentRegistered, confirmationStatus, agentPda, protocolComplete, and protocolFee.status.',
      'Use Metaplex/MPL Core tools only after metadata authority and URI are clear.',
      'Use SNS tools only after domain availability/ownership and user confirmation are clear.',
      'Use sap_payments_update_agent for profile image, metadata, capabilities, pricing, protocols, or x402 endpoint updates.',
      'Fetch sap_get_agent_profile after every registry write and compare intended fields.',
    ],
    forbiddenActions: [
      'Do not create temporary signing scripts.',
      'Do not read keypair JSON.',
      'Do not call hosted sap_sign_transaction for user-owned signatures.',
      'Do not call hosted sap_register_agent or sap_update_agent again after hosted_local_signer_required.',
      'Do not call an agent lifecycle complete when protocolFee.status is missing_or_underpaid, unavailable, or anything other than verified.',
    ],
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

interface HostedEscrowBuilderResult {
  action: string;
  transactionBase64: string;
  encoding: 'base64';
  requiredSigner: string;
  requiredSignerRole: 'depositor' | 'agentWallet' | 'payer';
  submitWith: 'sap_payments_finalize_transaction';
  nextStep: string;
  accounts: JsonRecord;
  tokenMode: 'SOL' | 'SPL';
  security?: JsonRecord;
  warnings?: string[];
}

type AnchorInstructionBuilder = {
  accounts(accounts: JsonRecord): {
    remainingAccounts(accounts: AccountMeta[]): { instruction(): Promise<unknown> };
    instruction(): Promise<unknown>;
  };
  accountsPartial(accounts: JsonRecord): {
    remainingAccounts(accounts: AccountMeta[]): { instruction(): Promise<unknown> };
  };
};

type AnchorMethods = Record<string, (...args: unknown[]) => AnchorInstructionBuilder>;

function publicKeyOrNull(value: unknown): PublicKey | null {
  return value instanceof PublicKey ? value : null;
}

function bnToBigInt(value: BN | number | bigint | { toString(): string }): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    return BigInt(value);
  }
  return BigInt(value.toString());
}

function bnToPdaSeed(value: BN, field: string): bigint {
  const asBigInt = BigInt(value.toString(10));
  if (asBigInt < 0n) {
    throw new Error(`${field} must be >= 0`);
  }
  return asBigInt;
}

function serializeAccountMetas(accounts: AccountMeta[]): JsonRecord[] {
  return accounts.map((account) => ({
    pubkey: account.pubkey.toBase58(),
    isSigner: account.isSigner,
    isWritable: account.isWritable,
  }));
}

function validateEscrowPaymentMint(tokenMint: PublicKey | null): void {
  if (!tokenMint) {
    return;
  }
  if (!tokenMint.equals(USDC_MINT_MAINNET) && !tokenMint.equals(USDC_MINT_DEVNET)) {
    throw new Error('Escrow V2 hosted builders only accept native SOL or USDC mints supported by the current SAP program.');
  }
}

function deriveAssociatedTokenAddress(tokenMint: PublicKey, owner: PublicKey): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), tokenMint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return address;
}

function getEscrowPdas(client: SapClient, agentWallet: PublicKey, depositorWallet: PublicKey, nonce: BN) {
  const [agentPda] = Pda.deriveAgent(agentWallet, client.programId);
  const [escrowPda] = Pda.deriveEscrowV2(agentPda, depositorWallet, bnToPdaSeed(nonce, 'nonce'), client.programId);
  const [agentStake] = Pda.deriveStake(agentPda, client.programId);
  const [agentStats] = Pda.deriveAgentStats(agentPda, client.programId);
  const [pricingMenu] = Pda.derivePricingMenu(agentPda, client.programId);
  return { agentPda, escrowPda, agentStake, agentStats, pricingMenu };
}

function buildSplRemainingAccounts(
  tokenMint: PublicKey | null,
  sourceOwner: PublicKey,
  destinationOwner: PublicKey,
): AccountMeta[] {
  if (!tokenMint) {
    return [];
  }
  return [
    {
      pubkey: deriveAssociatedTokenAddress(tokenMint, sourceOwner),
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: deriveAssociatedTokenAddress(tokenMint, destinationOwner),
      isSigner: false,
      isWritable: true,
    },
    { pubkey: tokenMint, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
}

function buildEscrowSettlementRemainingAccounts(params: {
  tokenMint: PublicKey | null;
  escrowPda: PublicKey;
  agentWallet: PublicKey;
  pendingSettlementPda?: PublicKey;
  coSigner?: PublicKey | null;
}): AccountMeta[] {
  const accounts: AccountMeta[] = params.tokenMint
    ? [
        ...buildSplRemainingAccounts(params.tokenMint, params.escrowPda, params.agentWallet),
        {
          pubkey: deriveAssociatedTokenAddress(params.tokenMint, new PublicKey(SAP_PROTOCOL_TREASURY)),
          isSigner: false,
          isWritable: true,
        },
      ]
    : [
        {
          pubkey: new PublicKey(SAP_PROTOCOL_TREASURY),
          isSigner: false,
          isWritable: true,
        },
      ];

  if (params.pendingSettlementPda) {
    accounts.push({ pubkey: params.pendingSettlementPda, isSigner: false, isWritable: true });
  }
  if (params.coSigner) {
    accounts.push({ pubkey: params.coSigner, isSigner: true, isWritable: false });
  }
  return accounts;
}

async function serializeUnsignedTransaction(
  client: SapClient,
  feePayer: PublicKey,
  instructions: unknown[],
): Promise<{ transactionBase64: string; blockhash: string; lastValidBlockHeight: number }> {
  const latestBlockhash = await client.connection.getLatestBlockhash('confirmed');
  const tx = new Transaction();
  tx.feePayer = feePayer;
  tx.recentBlockhash = latestBlockhash.blockhash;
  for (const instruction of instructions) {
    tx.add(instruction as Parameters<Transaction['add']>[0]);
  }
  return {
    transactionBase64: Buffer.from(tx.serialize({ requireAllSignatures: false })).toString('base64'),
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  };
}

async function fetchEscrowV2Nullable(client: SapClient, escrowPda: PublicKey): Promise<EscrowAccountV2Data | null> {
  const accounts = getSapAnchorAccounts(client) as unknown as Record<string, {
    fetchNullable(address: PublicKey): Promise<EscrowAccountV2Data | null>;
  }>;
  return accounts.escrowAccountV2.fetchNullable(escrowPda);
}

async function fetchPendingSettlementNullable(client: SapClient, pendingPda: PublicKey): Promise<PendingSettlementData | null> {
  const accounts = getSapAnchorAccounts(client) as unknown as Record<string, {
    fetchNullable(address: PublicKey): Promise<PendingSettlementData | null>;
  }>;
  return accounts.pendingSettlement.fetchNullable(pendingPda);
}

function isDisputeWindowEscrow(escrow: EscrowAccountV2Data): boolean {
  const security = escrow.settlementSecurity as unknown;
  return typeof security === 'object' && security !== null && 'disputeWindow' in security;
}

function isCoSignedEscrow(escrow: EscrowAccountV2Data): boolean {
  const security = escrow.settlementSecurity as unknown;
  return typeof security === 'object' && security !== null && 'coSigned' in security;
}

function escrowBuilderResponse(params: {
  action: string;
  transactionBase64: string;
  requiredSigner: PublicKey;
  requiredSignerRole: HostedEscrowBuilderResult['requiredSignerRole'];
  accounts: JsonRecord;
  tokenMint: PublicKey | null;
  blockhash: string;
  lastValidBlockHeight: number;
  security?: JsonRecord;
  warnings?: string[];
}): HostedEscrowBuilderResult {
  return {
    action: params.action,
    transactionBase64: params.transactionBase64,
    encoding: 'base64',
    requiredSigner: params.requiredSigner.toBase58(),
    requiredSignerRole: params.requiredSignerRole,
    submitWith: 'sap_payments_finalize_transaction',
    nextStep: 'Call sap_payments_finalize_transaction with transactionBase64, submit:true, confirm:true, and the same user-approved intent. Do not create temporary signing scripts and do not read keypair JSON.',
    accounts: {
      ...params.accounts,
      blockhash: params.blockhash,
      lastValidBlockHeight: params.lastValidBlockHeight,
    },
    tokenMode: params.tokenMint ? 'SPL' : 'SOL',
    ...(params.security ? { security: params.security } : {}),
    ...(params.warnings && params.warnings.length > 0 ? { warnings: params.warnings } : {}),
  };
}

async function buildEscrowCreateTransaction(input: JsonRecord, client: SapClient): Promise<HostedEscrowBuilderResult> {
  const depositorWallet = requiredPublicKey(input, 'depositorWallet');
  const agentWallet = requiredPublicKey(input, 'agentWallet');
  const args = parseEscrowV2Args(input);
  validateEscrowPaymentMint(args.tokenMint);
  const pdas = getEscrowPdas(client, agentWallet, depositorWallet, args.escrowNonce);
  const remainingAccounts = buildSplRemainingAccounts(args.tokenMint, depositorWallet, pdas.escrowPda);
  const methods = (client.program as unknown as { methods: AnchorMethods }).methods;
  const instruction = await methods.createEscrowV2(
    args.escrowNonce,
    args.pricePerCall,
    args.maxCalls,
    args.initialDeposit,
    args.expiresAt,
    args.volumeCurve,
    args.tokenMint,
    args.tokenDecimals,
    args.settlementSecurity,
    args.disputeWindowSlots,
    args.coSigner,
    args.arbiter,
  )
    .accounts({
      depositor: depositorWallet,
      agent: pdas.agentPda,
      agentStake: pdas.agentStake,
      agentStats: pdas.agentStats,
      pricingMenu: pdas.pricingMenu,
      escrow: pdas.escrowPda,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(remainingAccounts)
    .instruction();
  const tx = await serializeUnsignedTransaction(client, depositorWallet, [instruction]);
  return escrowBuilderResponse({
    action: 'create_escrow_v2',
    transactionBase64: tx.transactionBase64,
    requiredSigner: depositorWallet,
    requiredSignerRole: 'depositor',
    tokenMint: args.tokenMint,
    blockhash: tx.blockhash,
    lastValidBlockHeight: tx.lastValidBlockHeight,
    accounts: {
      agentWallet,
      depositorWallet,
      agentPda: pdas.agentPda,
      escrowPda: pdas.escrowPda,
      agentStake: pdas.agentStake,
      agentStats: pdas.agentStats,
      pricingMenu: pdas.pricingMenu,
      remainingAccounts: serializeAccountMetas(remainingAccounts),
    },
    security: {
      settlementSecurity: args.settlementSecurity,
      disputeWindowSlots: args.disputeWindowSlots,
      coSigner: args.coSigner,
      arbiter: args.arbiter,
    },
  });
}

async function buildEscrowDepositTransaction(input: JsonRecord, client: SapClient): Promise<HostedEscrowBuilderResult> {
  const depositorWallet = requiredPublicKey(input, 'depositorWallet');
  const agentWallet = requiredPublicKey(input, 'agentWallet');
  const nonce = optionalBn(input, 'nonce', new BN(0));
  const amount = requiredBn(input, 'amount');
  const pdas = getEscrowPdas(client, agentWallet, depositorWallet, nonce);
  const escrow = await fetchEscrowV2Nullable(client, pdas.escrowPda);
  if (!escrow) {
    throw new Error(`Escrow V2 PDA ${pdas.escrowPda.toBase58()} does not exist. Build and finalize sap_escrow_build_create_transaction first.`);
  }
  const tokenMint = publicKeyOrNull(escrow.tokenMint);
  const remainingAccounts = buildSplRemainingAccounts(tokenMint, depositorWallet, pdas.escrowPda);
  const methods = (client.program as unknown as { methods: AnchorMethods }).methods;
  const instruction = await methods.depositEscrowV2(nonce, amount)
    .accounts({
      depositor: depositorWallet,
      escrow: pdas.escrowPda,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(remainingAccounts)
    .instruction();
  const tx = await serializeUnsignedTransaction(client, depositorWallet, [instruction]);
  return escrowBuilderResponse({
    action: 'deposit_escrow_v2',
    transactionBase64: tx.transactionBase64,
    requiredSigner: depositorWallet,
    requiredSignerRole: 'depositor',
    tokenMint,
    blockhash: tx.blockhash,
    lastValidBlockHeight: tx.lastValidBlockHeight,
    accounts: {
      agentWallet,
      depositorWallet,
      escrowPda: pdas.escrowPda,
      amount,
      remainingAccounts: serializeAccountMetas(remainingAccounts),
    },
  });
}

async function buildEscrowWithdrawTransaction(input: JsonRecord, client: SapClient): Promise<HostedEscrowBuilderResult> {
  const depositorWallet = requiredPublicKey(input, 'depositorWallet');
  const agentWallet = requiredPublicKey(input, 'agentWallet');
  const nonce = optionalBn(input, 'nonce', new BN(0));
  const amount = requiredBn(input, 'amount');
  const pdas = getEscrowPdas(client, agentWallet, depositorWallet, nonce);
  const escrow = await fetchEscrowV2Nullable(client, pdas.escrowPda);
  if (!escrow) {
    throw new Error(`Escrow V2 PDA ${pdas.escrowPda.toBase58()} does not exist.`);
  }
  const balance = bnToBigInt(escrow.balance);
  const pendingAmount = bnToBigInt(escrow.pendingAmount);
  const withdrawable = balance > pendingAmount ? balance - pendingAmount : 0n;
  if (BigInt(amount.toString(10)) > withdrawable) {
    throw new Error(`Withdraw amount exceeds withdrawable escrow balance. requested=${amount.toString(10)}, withdrawable=${withdrawable.toString()}.`);
  }
  const tokenMint = publicKeyOrNull(escrow.tokenMint);
  const remainingAccounts = buildSplRemainingAccounts(tokenMint, pdas.escrowPda, depositorWallet);
  const methods = (client.program as unknown as { methods: AnchorMethods }).methods;
  const instruction = await methods.withdrawEscrowV2(amount)
    .accounts({
      depositor: depositorWallet,
      escrow: pdas.escrowPda,
    })
    .remainingAccounts(remainingAccounts)
    .instruction();
  const tx = await serializeUnsignedTransaction(client, depositorWallet, [instruction]);
  return escrowBuilderResponse({
    action: 'withdraw_escrow_v2',
    transactionBase64: tx.transactionBase64,
    requiredSigner: depositorWallet,
    requiredSignerRole: 'depositor',
    tokenMint,
    blockhash: tx.blockhash,
    lastValidBlockHeight: tx.lastValidBlockHeight,
    accounts: {
      agentWallet,
      depositorWallet,
      escrowPda: pdas.escrowPda,
      amount,
      withdrawable: withdrawable.toString(),
      remainingAccounts: serializeAccountMetas(remainingAccounts),
    },
  });
}

async function buildEscrowSettleTransaction(input: JsonRecord, client: SapClient): Promise<HostedEscrowBuilderResult> {
  const agentWallet = requiredPublicKey(input, 'agentWallet');
  const depositorWallet = requiredPublicKey(input, 'depositorWallet');
  const nonce = optionalBn(input, 'nonce', new BN(0));
  const callsToSettle = requiredBn(input, 'callsToSettle');
  const serviceHash = requiredBytes(input, 'serviceHash', 32);
  const pdas = getEscrowPdas(client, agentWallet, depositorWallet, nonce);
  const escrow = await fetchEscrowV2Nullable(client, pdas.escrowPda);
  if (!escrow) {
    throw new Error(`Escrow V2 PDA ${pdas.escrowPda.toBase58()} does not exist.`);
  }
  const tokenMint = publicKeyOrNull(escrow.tokenMint);
  const pendingSettlementIndex = bnToBigInt(escrow.settlementIndex);
  let pendingSettlementPda: PublicKey | undefined;
  if (isDisputeWindowEscrow(escrow)) {
    [pendingSettlementPda] = Pda.derivePendingSettlement(pdas.escrowPda, pendingSettlementIndex, client.programId);
    const existing = await fetchPendingSettlementNullable(client, pendingSettlementPda);
    if (existing) {
      throw new Error(`Pending settlement ${pendingSettlementPda.toBase58()} already exists for settlementIndex=${pendingSettlementIndex.toString()}. Finalize or quarantine it before building another DisputeWindow settlement.`);
    }
  }
  const coSigner = isCoSignedEscrow(escrow) ? publicKeyOrNull(escrow.coSigner) : optionalPublicKey(input, 'coSigner') ?? null;
  if (isCoSignedEscrow(escrow) && !coSigner) {
    throw new Error('CoSigned escrow requires coSigner in the escrow account.');
  }
  const remainingAccounts = buildEscrowSettlementRemainingAccounts({
    tokenMint,
    escrowPda: pdas.escrowPda,
    agentWallet,
    pendingSettlementPda,
    coSigner,
  });
  const methods = (client.program as unknown as { methods: AnchorMethods }).methods;
  const instruction = await methods.settleCallsV2(nonce, callsToSettle, serviceHash)
    .accountsPartial({
      wallet: agentWallet,
      agent: pdas.agentPda,
      agentStats: pdas.agentStats,
      escrow: pdas.escrowPda,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(remainingAccounts)
    .instruction();
  const tx = await serializeUnsignedTransaction(client, agentWallet, [instruction]);
  return escrowBuilderResponse({
    action: 'settle_calls_v2',
    transactionBase64: tx.transactionBase64,
    requiredSigner: agentWallet,
    requiredSignerRole: 'agentWallet',
    tokenMint,
    blockhash: tx.blockhash,
    lastValidBlockHeight: tx.lastValidBlockHeight,
    accounts: {
      agentWallet,
      depositorWallet,
      agentPda: pdas.agentPda,
      agentStats: pdas.agentStats,
      escrowPda: pdas.escrowPda,
      pendingSettlementPda: pendingSettlementPda ?? null,
      pendingSettlementIndex: pendingSettlementIndex.toString(),
      callsToSettle,
      serviceHash,
      remainingAccounts: serializeAccountMetas(remainingAccounts),
    },
    security: {
      settlementSecurity: isDisputeWindowEscrow(escrow) ? ESCROW_V2_DISPUTE_WINDOW_MODE : ESCROW_V2_COSIGNED_MODE,
      coSigner,
    },
  });
}

async function buildEscrowFinalizeTransaction(input: JsonRecord, client: SapClient): Promise<HostedEscrowBuilderResult> {
  const payerWallet = requiredPublicKey(input, 'payerWallet');
  const agentWallet = requiredPublicKey(input, 'agentWallet');
  const depositorWallet = requiredPublicKey(input, 'depositorWallet');
  const nonce = optionalBn(input, 'nonce', new BN(0));
  const settlementIndex = requiredBn(input, 'settlementIndex');
  const pdas = getEscrowPdas(client, agentWallet, depositorWallet, nonce);
  const [pendingSettlementPda] = Pda.derivePendingSettlement(pdas.escrowPda, bnToPdaSeed(settlementIndex, 'settlementIndex'), client.programId);
  const escrow = await fetchEscrowV2Nullable(client, pdas.escrowPda);
  if (!escrow) {
    throw new Error(`Escrow V2 PDA ${pdas.escrowPda.toBase58()} does not exist.`);
  }
  const pending = await fetchPendingSettlementNullable(client, pendingSettlementPda);
  if (!pending) {
    throw new Error(`Pending settlement ${pendingSettlementPda.toBase58()} does not exist.`);
  }
  const tokenMint = publicKeyOrNull(escrow.tokenMint);
  const remainingAccounts = buildSplRemainingAccounts(tokenMint, pdas.escrowPda, agentWallet);
  const methods = (client.program as unknown as { methods: AnchorMethods }).methods;
  const instruction = await methods.finalizeSettlement()
    .accounts({
      payer: payerWallet,
      agentWallet,
      escrow: pdas.escrowPda,
      pendingSettlement: pendingSettlementPda,
      agentStats: pdas.agentStats,
    })
    .remainingAccounts(remainingAccounts)
    .instruction();
  const tx = await serializeUnsignedTransaction(client, payerWallet, [instruction]);
  return escrowBuilderResponse({
    action: 'finalize_settlement',
    transactionBase64: tx.transactionBase64,
    requiredSigner: payerWallet,
    requiredSignerRole: 'payer',
    tokenMint,
    blockhash: tx.blockhash,
    lastValidBlockHeight: tx.lastValidBlockHeight,
    accounts: {
      payerWallet,
      agentWallet,
      depositorWallet,
      escrowPda: pdas.escrowPda,
      pendingSettlementPda,
      settlementIndex,
      releaseSlot: pending.releaseSlot,
      remainingAccounts: serializeAccountMetas(remainingAccounts),
    },
  });
}

async function buildEscrowCloseTransaction(input: JsonRecord, client: SapClient): Promise<HostedEscrowBuilderResult> {
  const depositorWallet = requiredPublicKey(input, 'depositorWallet');
  const agentWallet = requiredPublicKey(input, 'agentWallet');
  const nonce = optionalBn(input, 'nonce', new BN(0));
  const pdas = getEscrowPdas(client, agentWallet, depositorWallet, nonce);
  const escrow = await fetchEscrowV2Nullable(client, pdas.escrowPda);
  if (!escrow) {
    throw new Error(`Escrow V2 PDA ${pdas.escrowPda.toBase58()} does not exist.`);
  }
  if (bnToBigInt(escrow.balance) !== 0n || bnToBigInt(escrow.pendingAmount) !== 0n) {
    throw new Error('Escrow cannot close until balance and pendingAmount are both zero.');
  }
  const methods = (client.program as unknown as { methods: AnchorMethods }).methods;
  const instruction = await methods.closeEscrowV2()
    .accounts({
      depositor: depositorWallet,
      escrow: pdas.escrowPda,
      agentStats: pdas.agentStats,
    })
    .instruction();
  const tx = await serializeUnsignedTransaction(client, depositorWallet, [instruction]);
  return escrowBuilderResponse({
    action: 'close_escrow_v2',
    transactionBase64: tx.transactionBase64,
    requiredSigner: depositorWallet,
    requiredSignerRole: 'depositor',
    tokenMint: publicKeyOrNull(escrow.tokenMint),
    blockhash: tx.blockhash,
    lastValidBlockHeight: tx.lastValidBlockHeight,
    accounts: {
      agentWallet,
      depositorWallet,
      escrowPda: pdas.escrowPda,
      agentStats: pdas.agentStats,
    },
  });
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
        return ok(await definition.handler(asRecord(rawInput), client), definition.name);
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
    return 'SAP MCP context: Do not use this raw SDK wrapper for production registration. The canonical registration path is sap_payments_register_agent, because it confirms the account, audits the protocol treasury fee, and fails closed when protocolComplete is false. Hosted accountless SAP MCP rejects direct registration before x402 payment because OOBE never custodies user wallet keys. Use sap_agent_identity_plan first, then sap_payments_register_agent with confirm:true.';
  }

  if (name === 'sap_update_agent') {
    return 'SAP MCP context: Use this after sap_register_agent to refresh name, description, capabilities, pricing, supported protocols, x402 endpoint, or metadataUri. For NFT-backed identity changes, update the Metaplex asset first when needed, then point the SAP agent metadataUri at the current metadata document.';
  }

  if (name.startsWith('sap_publish_tool') || name.startsWith('sap_update_tool')) {
    return 'SAP MCP context: Use tool registry writes to advertise concrete capabilities that this MCP can serve, including AgentKit bridge tools such as bridging_bridgeWormhole and Metaplex tools such as metaplex-nft_mintNFT. Publish only schemas and descriptions that match the actual MCP tool surface.';
  }

  if (name.startsWith('sap_escrow_build_')) {
    return 'SAP MCP context: Hosted-safe unsigned Escrow V2 builder. The output is not submitted and is not signed by hosted SAP MCP. Preview it, then call local sap_payments_finalize_transaction with submit:true and confirm:true. Never create temporary signing scripts or read keypair JSON.';
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
    name: 'sap_protocol_invariants',
    title: 'Get SAP Protocol Invariants',
    description: 'Free read-only protocol invariant card for agents. Returns the current SAP program id, protocol treasury, source-level expected 0.1 SOL registration fee invariant, hosted write routing rules, local sap_payments routes, identity pipeline, and forbidden actions. Use this before SAP registry writes and whenever fee/treasury behavior is unclear.',
    inputSchema: {},
    handler: async () => buildSapProtocolInvariants(),
  },
  {
    name: 'sap_agent_identity_plan',
    title: 'Plan SAP Agent Identity',
    description: 'Free read-only planner for SAP agent registration, profile/image updates, Metaplex/MPL Core identity linking, SNS linking, x402 pricing metadata, and post-write verification. Use this before sap_payments_register_agent or sap_payments_update_agent so agents know the exact local-signer route, metadata contract, forbidden actions, and protocol fee verification checklist. It does not touch chain and never signs.',
    inputSchema: SAP_AGENT_IDENTITY_PLAN_INPUT_SCHEMA,
    handler: async (input) => buildSapAgentIdentityPlan(input),
  },
  {
    name: 'sap_register_agent',
    title: 'Register SAP Agent (Raw SDK Deprecated)',
    description: 'Deprecated raw SDK wrapper. Production registration must use sap_payments_register_agent so the local signer path confirms the account, verifies the 0.1 SOL protocol treasury fee invariant, and returns protocolComplete. Hosted accountless SAP MCP rejects this direct write before x402 payment.',
    inputSchema: SAP_AGENT_REGISTER_INPUT_SCHEMA,
    handler: async () => {
      throw new Error('sap_register_agent raw SDK path is disabled for production safety. Call sap_agent_identity_plan, then sap_payments_register_agent with the same registration fields and confirm: true. success is true only when the agent account exists and protocolFee.status is verified.');
    },
  },
  {
    name: 'sap_update_agent',
    title: 'Update SAP Agent',
    description: 'Local-signer-only: update the connected wallet SAP agent using SDK AgentModule.update. Hosted accountless SAP MCP rejects this direct write before x402 payment; hosted users should call sap_payments_update_agent from the local sap_payments bridge.',
    inputSchema: SAP_AGENT_UPDATE_INPUT_SCHEMA,
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
    description: 'Free exact SAP agent identity read by owner wallet. If omitted, fetches the connected wallet agent. Use this before paid discovery when the wallet is known.',
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
    description: 'Free exact SAP agent stats read by agent PDA. Use after sap_get_agent or sap_get_agent_profile when stats are needed.',
    inputSchema: { agentPda: { type: 'string', description: 'Agent PDA (base58) to fetch stats for' } },
    handler: async (input, client) => ({
      stats: await client.agent.fetchStatsNullable(requiredPublicKey(input, 'agentPda')),
    }),
  },
  {
    name: 'sap_get_global_state',
    title: 'Get SAP Global State',
    description: 'Free compact global SAP registry state read. Use for initial orientation before paid network analytics.',
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
    name: 'sap_agent_context',
    title: 'Get SAP Agent Context',
    description: 'Free one-shot SAP orientation context for agents. Use this when the user asks whether SAP MCP is connected, wants to understand an agent/wallet, or needs the next safe paid/write route. It combines exact reads or a compact directory page with routing guidance without triggering x402.',
    inputSchema: {
      wallet: {
        type: 'string',
        description: 'Optional exact owner wallet public key (base58). When supplied, returns the matching agent identity, PDA, active state, and hydrated profile when available.',
      },
      agentPda: {
        type: 'string',
        description: 'Optional exact SAP agent PDA (base58) for compact context lookup when the owner wallet is not known.',
      },
      query: {
        type: 'string',
        description: 'Optional text query for a free compact orientation search. Keep this narrow, for example "XONA" or "Solking".',
      },
      limit: {
        type: 'number',
        description: 'Maximum compact orientation rows to include when wallet is not supplied. Defaults to 10 and is capped at 20 to keep this tool free.',
      },
    },
    handler: async (input, client) => buildSapAgentContext(input, client),
  },
  {
    name: 'sap_get_agent_profile',
    title: 'Get SAP Agent Profile',
    description: 'Free exact SAP agent profile read by owner wallet. Use this for a known agent before paid discovery or enrichment.',
    inputSchema: { wallet: { type: 'string', description: 'Solana public key of the agent owner wallet (base58)' } },
    handler: async (input, client) => ({ profile: await client.discovery.getAgentProfile(requiredPublicKey(input, 'wallet')) }),
  },
  {
    name: 'sap_is_agent_active',
    title: 'Check SAP Agent Active',
    description: 'Free exact activity check for an owner wallet. Use this before paid discovery when the wallet is known.',
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

      return getFreshAgentDirectoryPage(client, {
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
    description: 'Compact SAP agent orientation list. Free only when limit <= 20, view is compact, hydrate is false, and includeProtocolIndexes is false; larger or enriched pages are paid read-premium.',
    inputSchema: makeAgentDirectoryInputSchema(20),
    handler: async (input, client) => {
      const limit = Math.max(1, Math.min(optionalNumber(input, 'limit') ?? 20, 500));
      const capability = optionalString(input, 'capability');

      return getFreshAgentDirectoryPage(client, {
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
        includeProtocolIndexes: input.includeProtocolIndexes === true,
      });
    },
  },
  {
    name: 'sap_list_all_agents',
    title: 'List All SAP Agents',
    description: 'Paid hosted global SAP agent directory read. Enumerates current on-chain AgentAccount PDAs and supports query, wallet, protocol, capability, x402 endpoint filtering, compact/full views, and cursor pagination.',
    inputSchema: makeAgentDirectoryInputSchema(100),
    handler: async (input, client) => {
      const limit = Math.max(1, Math.min(optionalNumber(input, 'limit') ?? 100, 500));
      const capability = optionalString(input, 'capability');

      return getFreshAgentDirectoryPage(client, {
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
    name: 'sap_escrow_build_create_transaction',
    title: 'Build SAP Escrow V2 Create Transaction',
    description: 'Hosted-safe unsigned builder for create_escrow_v2. Use this from hosted SAP MCP, preview the result, then call local sap_payments_finalize_transaction with submit:true. The depositorWallet signs locally; keypair bytes never leave the user machine. Defaults to DisputeWindow settlementSecurity=2 and rejects SelfReport/0.',
    inputSchema: escrowV2CreateBuilderInputSchema,
    handler: buildEscrowCreateTransaction,
  },
  {
    name: 'sap_escrow_build_deposit_transaction',
    title: 'Build SAP Escrow V2 Deposit Transaction',
    description: 'Hosted-safe unsigned builder for deposit_escrow_v2. Use this when a hosted workflow needs to add funds to an existing V2 escrow, then finalize locally with sap_payments_finalize_transaction.',
    inputSchema: escrowV2DepositBuilderInputSchema,
    handler: buildEscrowDepositTransaction,
  },
  {
    name: 'sap_escrow_build_settle_transaction',
    title: 'Build SAP Escrow V2 Settlement Transaction',
    description: 'Hosted-safe unsigned builder for settle_calls_v2. The agent owner wallet signs locally. DisputeWindow escrows create a pending settlement PDA; CoSigned escrows require the coSigner account when configured.',
    inputSchema: escrowV2SettleBuilderInputSchema,
    handler: buildEscrowSettleTransaction,
  },
  {
    name: 'sap_escrow_build_finalize_transaction',
    title: 'Build SAP Escrow V2 Finalize Transaction',
    description: 'Hosted-safe unsigned builder for finalize_settlement. Use after the dispute window has elapsed and a pending settlement exists; any payerWallet can locally sign to crank finalization.',
    inputSchema: escrowV2FinalizeBuilderInputSchema,
    handler: buildEscrowFinalizeTransaction,
  },
  {
    name: 'sap_escrow_build_withdraw_transaction',
    title: 'Build SAP Escrow V2 Withdraw Transaction',
    description: 'Hosted-safe unsigned builder for withdraw_escrow_v2. The depositor signs locally and can only withdraw unlocked balance after pending amounts are excluded.',
    inputSchema: escrowV2WithdrawBuilderInputSchema,
    handler: buildEscrowWithdrawTransaction,
  },
  {
    name: 'sap_escrow_build_close_transaction',
    title: 'Build SAP Escrow V2 Close Transaction',
    description: 'Hosted-safe unsigned builder for close_escrow_v2. The depositor signs locally; the builder refuses to close until balance and pendingAmount are both zero.',
    inputSchema: escrowV2CloseBuilderInputSchema,
    handler: buildEscrowCloseTransaction,
  },
  {
    name: 'sap_create_escrow_v2',
    title: 'Create SAP Escrow V2',
    description: 'Local-signer-only direct V2 escrow creation using SDK EscrowV2Module.create. Defaults to DisputeWindow settlementSecurity=2; SelfReport/0 is rejected. Hosted accountless SAP MCP rejects this before x402 payment; hosted users should call sap_escrow_build_create_transaction and finalize locally.',
    inputSchema: escrowV2CreateInputSchema,
    handler: async (input, client) => ({ signature: await client.escrowV2.create(requiredPublicKey(input, 'agentWallet'), parseEscrowV2Args(input)) }),
  },
  {
    name: 'sap_deposit_escrow_v2',
    title: 'Deposit SAP Escrow V2',
    description: 'Local-signer-only direct deposit into a V2 escrow. Hosted users should call sap_escrow_build_deposit_transaction and finalize locally.',
    inputSchema: { agentWallet: { type: 'string', description: 'Agent wallet public key (base58)' }, nonce: { type: 'string', description: 'Escrow nonce (as a decimal string, default: 0)' }, amount: { type: 'string', description: `Deposit amount as a decimal string. ${ESCROW_AMOUNT_DESCRIPTION}` } },
    handler: async (input, client) => ({ signature: await client.escrowV2.deposit(requiredPublicKey(input, 'agentWallet'), optionalBn(input, 'nonce', new BN(0)), requiredBn(input, 'amount')) }),
  },
  {
    name: 'sap_settle_escrow_v2',
    title: 'Settle SAP Escrow V2',
    description: 'Local-signer-only direct settlement against a V2 escrow. Hosted users should call sap_escrow_build_settle_transaction and finalize locally.',
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
    description: 'Local-signer-only direct finalization of a V2 pending settlement. Hosted users should call sap_escrow_build_finalize_transaction and finalize locally.',
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
    description: 'Local-signer-only direct withdrawal from a V2 escrow. Hosted users should call sap_escrow_build_withdraw_transaction and finalize locally.',
    inputSchema: { agentWallet: { type: 'string', description: 'Agent wallet public key (base58)' }, nonce: { type: 'string', description: 'Escrow nonce (as a decimal string, default: 0)' }, amount: { type: 'string', description: `Withdrawal amount as a decimal string. ${ESCROW_AMOUNT_DESCRIPTION}` } },
    handler: async (input, client) => ({ signature: await client.escrowV2.withdraw(requiredPublicKey(input, 'agentWallet'), optionalBn(input, 'nonce', new BN(0)), requiredBn(input, 'amount')) }),
  },
  {
    name: 'sap_close_escrow_v2',
    title: 'Close SAP Escrow V2',
    description: 'Local-signer-only direct close for an empty V2 escrow. Hosted users should call sap_escrow_build_close_transaction and finalize locally.',
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
