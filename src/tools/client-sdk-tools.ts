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

  logger.info('Initializing Client SDK with all plugins', { rpcUrl });

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

    logger.info('Client SDK tools cached', { count: pluginTools?.length || 0 });
    
    // Log summary
    const summary = agentKit.summary();
    logger.info('AgentKit summary', {
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
    logger.info('Jupiter protocol tools cached', {
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
  logger.info('Registering Client SDK tools via SynapseAgentKit');

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
          description: tool.description || `${name} (Synapse AgentKit)`,
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
          description: tool.description || `${name} (Synapse Jupiter Protocol)`,
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

  logger.info('Client SDK tools registered', {
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
