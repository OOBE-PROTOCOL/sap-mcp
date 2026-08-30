/**
 * @name tools/adrena/adrena-rpc-fallback
 * @description Shared Solana RPC fallback for Adrena on-chain reads.
 *
 * The hosted gateway frequently runs from datacenter IPs that the public
 * mainnet RPC throttles with HTTP 426 (Upgrade Required). Read tools that
 * go through `context.connection` therefore fail with 426 even though the
 * logic is correct. This helper retries the same read across the configured
 * primary RPC and well-known public fallbacks so a single blocked endpoint
 * does not fail the whole tool call.
 *
 * @module tools/adrena/adrena-rpc-fallback
 */

import { Connection } from '@solana/web3.js';
import type { SapMcpContext } from '../../../core/src/types.js';

/** Well-known public mainnet RPC fallbacks, tried in order after the primary. */
const FALLBACK_RPC_URLS: readonly string[] = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-rpc.publicnode.com',
  'https://solana-mainnet.g.alchemy.com/v2/demo',
];

/**
 * Build the candidate RPC URL list for a context: the configured primary
 * first, then public fallbacks (deduplicated).
 * @param context — SAP MCP context whose connection carries the primary RPC.
 * @returns Ordered RPC endpoint candidates.
 */
function rpcUrlCandidates(context: SapMcpContext): readonly string[] {
  const primary = context.config.rpcUrl?.trim();
  const urls: string[] = [];
  if (primary) urls.push(primary);
  for (const fallback of FALLBACK_RPC_URLS) {
    if (!urls.includes(fallback)) urls.push(fallback);
  }
  return urls;
}

/**
 * Run an on-chain read against the context connection, retrying across
 * public RPC fallbacks when the primary endpoint fails (426/403/429/5xx or
 * network error).
 * @param context — SAP MCP context.
 * @param operation — Read to execute with each candidate connection.
 * @param label — Error label used when every endpoint fails.
 * @returns The first successful result.
 * @throws Aggregated error when all endpoints fail.
 */
export async function withAdrenaConnectionFallback<T>(
  context: SapMcpContext,
  operation: (connection: Connection, rpcUrl: string) => Promise<T>,
  label = 'Adrena on-chain read',
): Promise<T> {
  const baseUrl = typeof context.config.rpcUrl === 'string' ? context.config.rpcUrl.trim() : '';
  const candidates = rpcUrlCandidates(context);
  let lastError: unknown;

  for (const rpcUrl of candidates) {
    if (baseUrl && rpcUrl === baseUrl && candidates.length > 1) {
      // First candidate: reuse the existing context connection (keeps
      // single-connection identity for caching callers).
      try {
        return await operation(context.connection, rpcUrl);
      } catch (error) {
        lastError = error;
      }
      continue;
    }
    try {
      return await operation(new Connection(rpcUrl, 'confirmed'), rpcUrl);
    } catch (error) {
      lastError = error;
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown error');
  throw new Error(`${label} failed through all RPC endpoints: ${message}`);
}