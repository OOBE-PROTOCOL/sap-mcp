/**
 * SAP network statistics resource.
 *
 * Exposes network counters from the public Synapse SAP SDK discovery and
 * global-registry APIs.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerResourceTemplate } from '../../adapters/mcp/sdk-compat.js';
import { logger, redactSensitiveString } from '../../core/logger.js';
import type { SapMcpContext } from '../../core/types.js';
import { getSapClient } from '../../sap/sap-client-manager.js';

type Network = 'devnet' | 'mainnet-beta' | 'testnet' | 'localnet';

/**
 * @name getNetworkFromRpcUrl
 * @description Identifies the Solana network from an RPC URL.
 */
function getNetworkFromRpcUrl(rpcUrl: string): Network {
  if (rpcUrl.includes('mainnet-beta') || rpcUrl.includes('mainnet')) return 'mainnet-beta';
  if (rpcUrl.includes('testnet')) return 'testnet';
  if (rpcUrl.includes('localnet') || rpcUrl.includes('localhost') || rpcUrl.includes('127.0.0.1')) return 'localnet';
  return 'devnet';
}

/**
 * @name jsonReplacer
 * @description Serializes SDK values that JSON.stringify cannot handle directly.
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
 * @name sapNetworkStatsResource
 * @description Registers the SDK-backed network stats resource template.
 */
export function sapNetworkStatsResource(server: Server, context: SapMcpContext): void {
  registerResourceTemplate(
    server,
    'sap://stats/network',
    {},
    {
      name: 'SAP Network Statistics',
      description: 'SAP network counters from synapse-sap-sdk DiscoveryRegistry and GlobalRegistry.',
      mimeType: 'application/json',
    },
    async (uri: string) => {
      try {
        const client = getSapClient();
        const [overview, globalRegistry] = await Promise.all([
          client.discovery.getNetworkOverview(),
          client.agent.fetchGlobalRegistry(),
        ]);
        const payload = {
          network: getNetworkFromRpcUrl(context.config.rpcUrl),
          rpcUrl: redactSensitiveString(context.config.rpcUrl),
          programId: context.config.programId,
          timestamp: new Date().toISOString(),
          source: 'synapse-sap-sdk',
          overview,
          globalRegistry,
        };

        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(payload, jsonReplacer, 2),
          }],
        };
      } catch (error) {
        logger.error('Error reading SAP network stats resource', { error });
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : 'Failed to fetch SAP network stats',
              source: 'synapse-sap-sdk',
              status: 'error',
            }, null, 2),
          }],
        };
      }
    }
  );

  logger.debug('SAP Network Stats resource registered');
}
