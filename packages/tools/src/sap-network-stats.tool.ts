/**
 * SAP network statistics MCP tool.
 *
 * Uses the public Synapse SAP SDK discovery/global-registry APIs. It does not
 * bulk-read dynamic Anchor account namespaces or synthesize missing counters.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import type { SapMcpContext } from '../../core/src/types.js';
import { getSapClient } from '../../../src/sap/sap-client-manager.js';
import { redactSensitiveString } from '../../core/src/logger.js';
import { createToolExecutionResult, registerPipelineTool } from './tool-execution-pipeline.js';

const SapNetworkStatsInputSchema = z.object({
  detailed: z.boolean().optional().default(false),
}).passthrough();

type Network = 'devnet' | 'mainnet-beta' | 'testnet' | 'localnet';

/**
 * @name getNetworkFromRpcUrl
 * @description Identifies the Solana network from the configured RPC URL.
 */
function getNetworkFromRpcUrl(rpcUrl: string): Network {
  if (rpcUrl.includes('mainnet-beta') || rpcUrl.includes('mainnet')) return 'mainnet-beta';
  if (rpcUrl.includes('testnet')) return 'testnet';
  if (rpcUrl.includes('localnet') || rpcUrl.includes('localhost') || rpcUrl.includes('127.0.0.1')) return 'localnet';
  return 'devnet';
}

/**
 * @name jsonReplacer
 * @description Serializes SDK values that JSON.stringify cannot handle by default.
 */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value && typeof value === 'object' && 'toBase58' in value) {
    const toBase58 = value.toBase58;
    return typeof toBase58 === 'function' ? toBase58.call(value) : value;
  }
  return value;
}

/**
 * @name sapNetworkStatsTool
 * @description Registers a real SDK-backed SAP network statistics tool.
 */
export function sapNetworkStatsTool(server: Server, context: SapMcpContext): void {
  registerPipelineTool(
    server,
    context,
    {
      name: 'sap_network_stats',
      title: 'Get SAP Network Statistics',
      description: 'Fetch real SAP network statistics using synapse-sap-sdk DiscoveryRegistry and GlobalRegistry.',
      inputSchema: SapNetworkStatsInputSchema,
      execute: async ({ input: parsedInput, context: runtimeContext }) => {
        const startedAt = performance.now();
        const client = getSapClient();
        const network = getNetworkFromRpcUrl(runtimeContext.config.rpcUrl);
        const [overview, globalRegistry] = await Promise.all([
          client.discovery.getNetworkOverview(),
          client.agent.fetchGlobalRegistry(),
        ]);
        const fetchTimeMs = Math.round(performance.now() - startedAt);

        const response = parsedInput.detailed
          ? {
            network,
            rpcUrl: redactSensitiveString(runtimeContext.config.rpcUrl),
            programId: runtimeContext.config.programId,
            timestamp: new Date().toISOString(),
            fetchTimeMs,
            source: 'synapse-sap-sdk',
            overview,
            globalRegistry,
          }
          : {
            network,
            timestamp: new Date().toISOString(),
            fetchTimeMs,
            source: 'synapse-sap-sdk',
            overview,
          };

        return createToolExecutionResult(
          JSON.parse(JSON.stringify(response, jsonReplacer)) as Record<string, unknown>,
          {
            source: 'synapse-sap-sdk',
            fetchTimeMs,
          },
        );
      },
    },
  );
}
