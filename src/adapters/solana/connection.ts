/**
 * Create Solana connection
 */

import { Connection } from '@solana/web3.js';
import type { SapMcpConfig } from '../../core/types.js';

/**
 * Executes the create connection operation.
 */
export function createConnection(config: SapMcpConfig): Connection {
  return new Connection(config.rpcUrl, {
    commitment: config.commitment,
  });
}
