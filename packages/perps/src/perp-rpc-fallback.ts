/**
 * @name perps/perp-rpc-fallback
 * @description Solana RPC fallback for Adrena on-chain reads inside the perps
 * package. The hosted gateway often runs from datacenter IPs that the public
 * mainnet RPC throttles with HTTP 426; reads retried across fallback
 * endpoints keep the tools functional.
 * @module perps/perp-rpc-fallback
 */

import { Connection } from '@solana/web3.js';
import type { SapMcpContext } from '../../core/src/types.js';

/** Well-known public mainnet RPC fallbacks, tried in order after the primary. */
const FALLBACK_RPC_URLS: readonly string[] = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-rpc.publicnode.com',
];

/**
 * Run an on-chain read against the context connection, retrying across
 * public RPC fallbacks when the primary endpoint fails.
 * @param context — SAP MCP context.
 * @param operation — Read to execute with each candidate connection.
 * @param label — Error label used when every endpoint fails.
 * @returns The first successful result.
 * @throws Aggregated error when all endpoints fail.
 */
export async function withPerpsConnectionFallback<T>(
  context: SapMcpContext,
  operation: (connection: Connection, rpcUrl: string) => Promise<T>,
  label = 'Adrena on-chain read',
): Promise<T> {
  const primary = context.config.rpcUrl?.trim();
  const urls: string[] = [];
  if (primary) urls.push(primary);
  for (const fallback of FALLBACK_RPC_URLS) {
    if (!urls.includes(fallback)) urls.push(fallback);
  }

  // The context.connection already carries the primary endpoint; try it
  // first without building a duplicate connection.
  urls[0] = urls[0] ?? primary ?? '';

  let lastError: unknown;
  for (let i = 0; i < urls.length; i++) {
    try {
      const connection = i === 0 ? context.connection : new Connection(urls[i], 'confirmed');
      return await operation(connection, urls[i]);
    } catch (error) {
      lastError = error;
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown error');
  throw new Error(`${label} failed through all RPC endpoints: ${message}`);
}