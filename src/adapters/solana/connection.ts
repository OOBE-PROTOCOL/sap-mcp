/**
 * @name adapters/solana/connection
 * @description Solana RPC connection factory.
 *
 * @module adapters/solana/connection
 */

import { Connection } from '@solana/web3.js';
import type { SapMcpConfig } from '../../core/types.js';

/**
 * @name createConnection
 * @description Creates a `@solana/web3.js` `Connection` from the SAP MCP config.
 *
 * @param config — The resolved SAP MCP configuration containing `rpcUrl` and `commitment`.
 * @returns A Solana `Connection` instance configured with the RPC URL and commitment level.
 *
 * @usedBy `adapters/solana/index.ts`, server bootstrap
 */
export function createConnection(config: SapMcpConfig): Connection {
  return new Connection(config.rpcUrl, {
    commitment: config.commitment,
  });
}
