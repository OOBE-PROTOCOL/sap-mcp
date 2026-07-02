/**
 * Client SDK Tools
 * 
 * Implements 110 Synapse AgentKit tools from @oobe-protocol-labs/synapse-client-sdk:
 * - Token, staking, and bridging tools
 * - NFT, Metaplex, 3.Land, and DAS tools
 * - DeFi protocol tools
 * - Miscellaneous ecosystem tools
 * - Blinks tools
 * 
 * All tools use real SDK plugin classes.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { PublicKey } from '@solana/web3.js';
import type { ProtocolTool } from '@oobe-protocol-labs/synapse-client-sdk/ai/tools/protocols';
import type { SapMcpContext } from '../core/types.js';
import { createTextResponse } from '../adapters/mcp/tool-response.js';
import { registerTool } from '../adapters/mcp/sdk-compat.js';
import { logger } from '../core/logger.js';

type CommitmentOverride = 'processed' | 'confirmed' | 'finalized';

interface BalanceToolInput {
  address?: string;
  pubkey?: string;
  commitment?: CommitmentOverride;
}

interface AgentKitTool {
  name: string;
  description?: string;
  schema?: unknown;
  inputSchema?: unknown;
  invoke(input: unknown): Promise<unknown>;
}

interface AgentKitSummary {
  plugins?: unknown[];
  totalTools?: number;
  totalProtocols?: number;
}

interface AgentKitToolContext {
  protocol: string;
  risk: 'read' | 'write';
  usage: string;
  workflow: string;
}

interface SynapseAgentKitInstance {
  use(plugin: unknown): SynapseAgentKitInstance;
  getTools(): AgentKitTool[];
  summary(): AgentKitSummary;
}

type SynapseAgentKitConstructor = new (config: { rpcUrl: string }) => SynapseAgentKitInstance;
type ProtocolToolsModule = typeof import('@oobe-protocol-labs/synapse-client-sdk/ai/tools/protocols');

/**
 * Initialize Client SDK (SynapseAgentKit) with all plugins
 */
let agentKit: SynapseAgentKitInstance | null = null;
let pluginTools: Array<{ name: string; tool: AgentKitTool }> | null = null;
let jupiterProtocolTools: Array<{ name: string; tool: ProtocolTool }> | null = null;

const REQUIRED_AGENTKIT_TOOL_NAMES = [
  'bridging_bridgeWormhole',
  'bridging_bridgeWormholeStatus',
  'bridging_bridgeDeBridge',
  'bridging_bridgeDeBridgeStatus',
  'metaplex-nft_deployCollection',
  'metaplex-nft_mintNFT',
  'metaplex-nft_updateMetadata',
  'metaplex-nft_verifyCreator',
  'metaplex-nft_verifyCollection',
  'metaplex-nft_setAndVerifyCollection',
  'metaplex-nft_delegateAuthority',
  'metaplex-nft_revokeAuthority',
  'metaplex-nft_configureRoyalties',
] as const;

const AGENTKIT_CONTEXT_BY_PREFIX: Array<[string, AgentKitToolContext]> = [
  ['bridging_', {
    protocol: 'bridging',
    risk: 'write',
    usage: 'Use for cross-chain asset movement through Wormhole or deBridge. Confirm source chain, destination chain, token mint, amount, recipient, route fees, and finality expectations before invoking a bridge write.',
    workflow: 'For bridge flows call the matching status tool after submission. If the bridge capability belongs to a registered SAP agent, advertise it with sap_publish_tool_by_name and include bridge capability IDs in sap_register_agent or sap_update_agent.',
  }],
  ['metaplex-nft_', {
    protocol: 'metaplex-nft',
    risk: 'write',
    usage: 'Use for Metaplex NFT collection, mint, metadata, royalty, creator verification, collection verification, and authority workflows. Confirm metadata URI, collection mint, creators, royalties, update authority, and ownership before writes.',
    workflow: 'For agent identity, keep sap_register_agent as the SAP on-chain registration step and use agentUri or metadataUri to point at off-chain or NFT-backed metadata. Use these Metaplex tools when the agent also needs an NFT collection, badge, or verifiable media asset.',
  }],
  ['3land_', {
    protocol: '3land',
    risk: 'write',
    usage: 'Use for 3.Land NFT collection, minting, listing, cancellation, and purchase flows. Confirm marketplace price, seller/buyer wallet, collection, and listing state before writes.',
    workflow: 'Pair marketplace actions with SAP registry metadata only when the marketplace asset is part of the agent identity or service catalog.',
  }],
  ['das_', {
    protocol: 'das',
    risk: 'read',
    usage: 'Use for read-only DAS NFT and asset discovery by owner, creator, collection, or search query.',
    workflow: 'Prefer DAS reads before Metaplex writes when validating existing assets for an agent profile, collection, or metadata update.',
  }],
  ['spl-token_', {
    protocol: 'spl-token',
    risk: 'write',
    usage: 'Use for SPL token deploy, mint, transfer, burn, freeze, thaw, and authority management. Confirm mint, decimals, authority, recipient, and amount before writes.',
    workflow: 'Use token tools alongside SAP payments and settlement tools only when token operations are part of the agent service lifecycle.',
  }],
  ['staking_', {
    protocol: 'staking',
    risk: 'write',
    usage: 'Use for SOL and liquid staking flows. Confirm validator or provider, amount, lockup/unstake terms, and account ownership before writes.',
    workflow: 'Use SAP staking tools for SAP protocol stake accounts; use AgentKit staking tools for external staking protocols.',
  }],
  ['sns_', {
    protocol: 'sns',
    risk: 'write',
    usage: 'Use for AgentKit SNS domain helpers. For SAP-linked domains prefer sap_sns_* tools because they include MCP signer policy and SAP agent-domain context.',
    workflow: 'Use sap_sns_register_agent_domain when binding a .sol domain to an SAP agent profile.',
  }],
  ['alldomains_', {
    protocol: 'alldomains',
    risk: 'write',
    usage: 'Use for AllDomains name registration and resolution workflows. Confirm domain, TLD, owner, and renewal or purchase terms before writes.',
    workflow: 'Use only when the requested name service is not SNS-specific.',
  }],
  ['pyth_', {
    protocol: 'pyth',
    risk: 'read',
    usage: 'Use for Pyth oracle price reads and feed discovery.',
    workflow: 'Use oracle reads as context for pricing, risk checks, and market-aware agent decisions; do not treat them as settlement proof.',
  }],
  ['coingecko_', {
    protocol: 'coingecko',
    risk: 'read',
    usage: 'Use for off-chain market data such as token prices, trending assets, token info, pools, and OHLCV.',
    workflow: 'Use market data as advisory context. On-chain SAP settlement and escrow state remain authoritative for payments.',
  }],
  ['gibwork_', {
    protocol: 'gibwork',
    risk: 'write',
    usage: 'Use for bounty creation, listing, and work submission. Confirm scope, payout, recipient, and deliverable evidence before writes.',
    workflow: 'Use SAP attestation or feedback tools after work completion when reputation should be recorded on SAP.',
  }],
  ['send-arcade_', {
    protocol: 'send-arcade',
    risk: 'write',
    usage: 'Use for Send Arcade game listing and play flows. Confirm account, wager or spend, and game rules before writes.',
    workflow: 'Keep gaming activity separate from SAP identity unless it is intentionally part of an agent profile.',
  }],
  ['blinks_', {
    protocol: 'blinks',
    risk: 'read',
    usage: 'Use for Solana Actions and Blinks metadata fetch, validation, and POST action preparation.',
    workflow: 'Preview and validate actions before signing or submitting transactions through SAP transaction tools.',
  }],
];

const AGENTKIT_CONTEXT_BY_NAME = new Map<string, AgentKitToolContext>([
  ['bridging_bridgeWormholeStatus', {
    protocol: 'bridging',
    risk: 'read',
    usage: 'Use to check Wormhole bridge transfer status after a bridge submission.',
    workflow: 'Call this after bridging_bridgeWormhole and keep the resulting status with the user-facing bridge audit trail.',
  }],
  ['bridging_bridgeDeBridgeStatus', {
    protocol: 'bridging',
    risk: 'read',
    usage: 'Use to check deBridge transfer status after a bridge submission.',
    workflow: 'Call this after bridging_bridgeDeBridge and keep the resulting status with the user-facing bridge audit trail.',
  }],
  ['sns_resolveDomain', {
    protocol: 'sns',
    risk: 'read',
    usage: 'Use to resolve a .sol domain through AgentKit SNS helpers.',
    workflow: 'For SAP-linked domains, prefer sap_sns_resolve_domain because it returns SAP MCP-shaped context.',
  }],
  ['sns_reverseLookup', {
    protocol: 'sns',
    risk: 'read',
    usage: 'Use to find the SNS domain associated with a wallet.',
    workflow: 'For SAP profile checks, pair this with sap_sns_resolve_wallet or sap_sns_check_ownership.',
  }],
  ['alldomains_resolveDomain', {
    protocol: 'alldomains',
    risk: 'read',
    usage: 'Use to resolve an AllDomains name without changing ownership or records.',
    workflow: 'Use only when the requested name service is not SNS-specific.',
  }],
  ['alldomains_getOwnedDomains', {
    protocol: 'alldomains',
    risk: 'read',
    usage: 'Use to list domains owned by a wallet through AllDomains.',
    workflow: 'Use as discovery context before choosing a name to associate with an agent.',
  }],
  ['blinks_executeAction', {
    protocol: 'blinks',
    risk: 'write',
    usage: 'Use to execute a Solana Action POST flow. Confirm the action metadata, parameters, expected transaction, and user intent before invoking.',
    workflow: 'Preview and validate action output before signing or submitting any returned transaction through SAP transaction tools.',
  }],
]);

/**
 * @name registerLegacySolanaRpcTools
 * @description Registers compatibility Solana RPC tools with native ESM-safe implementations.
 * @param server - MCP server receiving the tool registrations.
 * @param context - Runtime context containing the configured Solana connection.
 */
function registerLegacySolanaRpcTools(server: Server, context: SapMcpContext): void {
  registerTool(
    server,
    'sol_get_balance',
    {
      title: 'Get SOL Balance',
      description: 'Fetch the SOL balance for a wallet or account using the configured Solana RPC endpoint.',
      inputSchema: {
        address: { type: 'string', description: 'Wallet or account public key in base58' },
        pubkey: { type: 'string', description: 'Alias for address' },
        commitment: {
          type: 'string',
          enum: ['processed', 'confirmed', 'finalized'],
          description: 'Optional commitment override',
        },
      },
    },
    async (input: BalanceToolInput) => {
      try {
        const address = input.address ?? input.pubkey;
        if (!address) {
          throw new Error('address or pubkey is required');
        }

        const publicKey = new PublicKey(address);
        const commitment = input.commitment ?? context.config.commitment;
        const lamports = await context.connection.getBalance(publicKey, commitment);

        return createTextResponse(JSON.stringify({
          success: true,
          address: publicKey.toBase58(),
          lamports,
          sol: lamports / 1_000_000_000,
          commitment,
        }, null, 2));
      } catch (error) {
        logger.error('Failed to get SOL balance', { error });
        return createTextResponse(
          `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { isError: true }
        );
      }
    }
  );
}

async function initializeClientSdk(rpcUrl: string): Promise<void> {
  if (agentKit) {
    logger.debug('Client SDK already initialized');
    return;
  }

  logger.debug('Initializing Client SDK with all plugins', { rpcUrl });

  try {
    const sdk = await import('@oobe-protocol-labs/synapse-client-sdk/ai/plugins');
    const {
      SynapseAgentKit,
      TokenPlugin,
      NFTPlugin,
      DeFiPlugin,
      MiscPlugin,
      BlinksPlugin,
    } = sdk as {
      SynapseAgentKit: SynapseAgentKitConstructor;
      TokenPlugin: unknown;
      NFTPlugin: unknown;
      DeFiPlugin: unknown;
      MiscPlugin: unknown;
      BlinksPlugin: unknown;
    };

    agentKit = new SynapseAgentKit({ rpcUrl })
      .use(TokenPlugin)
      .use(NFTPlugin)
      .use(DeFiPlugin)
      .use(MiscPlugin)
      .use(BlinksPlugin);

    const tools = agentKit.getTools();
    pluginTools = tools.map((tool) => ({
      name: tool.name,
      tool,
    }));
    assertRequiredAgentKitTools(pluginTools.map(({ name }) => name));

    logger.debug('Client SDK tools cached', { count: pluginTools?.length || 0 });
    
    // Log summary
    const summary = agentKit.summary();
    logger.debug('AgentKit summary', {
      plugins: Array.isArray(summary.plugins) ? summary.plugins.length : 0,
      totalTools: summary.totalTools || 0,
      totalProtocols: summary.totalProtocols || 0,
    });

    const protocols = await import('@oobe-protocol-labs/synapse-client-sdk/ai/tools/protocols') as ProtocolToolsModule;
    const jupiterToolkit = protocols.createJupiterTools({
      prettyJson: true,
    });
    jupiterProtocolTools = jupiterToolkit.tools.map((tool) => ({
      name: tool.name,
      tool,
    }));
    logger.debug('Jupiter protocol tools cached', {
      count: jupiterProtocolTools.length,
      methods: jupiterToolkit.methodNames.length,
    });
    
    return;
  } catch (error) {
    logger.error('Failed to initialize Client SDK', { error });
    throw new Error(
      `Client SDK initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * @name registerClientSdkTools
 * @description Registers Synapse Client SDK AgentKit plugin tools and ESM-safe compatibility RPC tools.
 * @param server - MCP server receiving the tool registrations.
 * @param context - Runtime context containing RPC configuration and connection state.
 */
export async function registerClientSdkTools(server: Server, context: SapMcpContext): Promise<void> {
  logger.debug('Registering Client SDK tools via SynapseAgentKit');

  registerLegacySolanaRpcTools(server, context);

  try {
    await initializeClientSdk(context.config.rpcUrl);
  } catch (error) {
    logger.error('Failed to initialize Client SDK', { error });
    throw error;
  }

  if (!pluginTools) {
    throw new Error('AgentKit tools not cached after initialization');
  }

  if (!jupiterProtocolTools) {
    throw new Error('Jupiter protocol tools not cached after initialization');
  }

  // Tools that are blocked because they return placeholder responses or have known issues.
  // Agents should use the SAP SDK equivalents instead.
  const BLOCKED_AGENTKIT_TOOLS = new Set<string>([
    'sns_registerDomain',        // Returns { status: 'instruction_ready' } — use sap_sns_register_agent_domain instead
  ]);

  let registeredCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const { name, tool } of pluginTools) {
    if (BLOCKED_AGENTKIT_TOOLS.has(name)) {
      skippedCount++;
      logger.warn('Skipping blocked AgentKit tool — use SAP SDK equivalent instead', { name });
      continue;
    }
    try {
      registerTool(
        server,
        name,
        {
          title: formatToolTitle(name),
          description: buildAgentKitToolDescription(name, tool.description),
          inputSchema: tool.schema || tool.inputSchema || {},
        },
        async (input: unknown) => {
          try {
            const result = await tool.invoke(input);
            return createTextResponse(
              typeof result === 'string' ? result : JSON.stringify(result, null, 2)
            );
          } catch (invokeError) {
            logger.error(`Client SDK tool execution failed: ${name}`, { 
              error: invokeError,
              input,
            });
            return createTextResponse(
              `Error executing ${name}: ${invokeError instanceof Error ? invokeError.message : 'Unknown error'}`,
              { isError: true }
            );
          }
        }
      );

      registeredCount++;
      logger.debug('Client SDK tool registered', { name });
    } catch (error) {
      failedCount++;
      logger.error(`Failed to register Client SDK tool: ${name}`, { error });
    }
  }

  for (const { name, tool } of jupiterProtocolTools) {
    try {
      registerTool(
        server,
        name,
        {
          title: formatToolTitle(name),
          description: buildJupiterProtocolToolDescription(name, tool.description),
          inputSchema: tool.schema || {},
        },
        async (input: unknown) => {
          try {
            const result = await tool.invoke(input);
            return createTextResponse(
              typeof result === 'string' ? result : JSON.stringify(result, null, 2)
            );
          } catch (invokeError) {
            logger.error(`Jupiter protocol tool execution failed: ${name}`, {
              error: invokeError,
              input,
            });
            return createTextResponse(
              `Error executing ${name}: ${invokeError instanceof Error ? invokeError.message : 'Unknown error'}`,
              { isError: true }
            );
          }
        }
      );

      registeredCount++;
      logger.debug('Jupiter protocol tool registered', { name });
    } catch (error) {
      failedCount++;
      logger.error(`Failed to register Jupiter protocol tool: ${name}`, { error });
    }
  }

  logger.debug('Client SDK tools registered', {
    registered: registeredCount,
    failed: failedCount,
    skipped: skippedCount,
    total: pluginTools.length,
  });
}

/**
 * Format tool name to title case
 */
function formatToolTitle(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .trim();
}

function assertRequiredAgentKitTools(toolNames: string[]): void {
  const available = new Set(toolNames);
  const missing = REQUIRED_AGENTKIT_TOOL_NAMES.filter((name) => !available.has(name));

  if (missing.length > 0) {
    throw new Error(`Client SDK is missing required bridge/Metaplex AgentKit tools: ${missing.join(', ')}`);
  }
}

function buildAgentKitToolDescription(name: string, sdkDescription?: string): string {
  const context = getAgentKitToolContext(name);
  const base = sdkDescription || `${name} (Synapse AgentKit)`;

  if (!context) {
    return [
      base,
      'SAP MCP context: This Synapse AgentKit tool is served beside the sap_* SDK tools. Use sap_register_agent, sap_update_agent, and sap_publish_tool_by_name when the capability should become part of an on-chain SAP agent profile or tool registry entry.',
    ].join(' ');
  }

  return [
    base,
    `SAP MCP context: Protocol ${context.protocol}; operation class ${context.risk}. ${context.usage}`,
    context.workflow,
  ].join(' ');
}

function buildJupiterProtocolToolDescription(name: string, sdkDescription?: string): string {
  const base = sdkDescription || `${name} (Synapse Jupiter Protocol)`;
  return [
    base,
    'SAP MCP context: Jupiter protocol tools are served as AgentKit ecosystem tools. Use them for quote, route, and swap preparation, then use SAP transaction preview/sign/submit tools when an unsigned transaction must pass MCP signer policy.',
  ].join(' ');
}

function getAgentKitToolContext(name: string): AgentKitToolContext | undefined {
  const exactContext = AGENTKIT_CONTEXT_BY_NAME.get(name);
  if (exactContext) {
    return exactContext;
  }

  return AGENTKIT_CONTEXT_BY_PREFIX.find(([prefix]) => name.startsWith(prefix))?.[1];
}
