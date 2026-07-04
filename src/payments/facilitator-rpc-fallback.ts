/**
 * @name FacilitatorRpcFallback
 * @description Resilient RPC endpoint failover for x402 SVM facilitator operations.
 */

import type { FacilitatorSvmSigner } from '@x402/svm';
import { logger, redactSensitiveString } from '../core/logger.js';

/**
 * @name FacilitatorRpcEndpoint
 * @description One RPC-backed facilitator signer candidate used during failover.
 */
export interface FacilitatorRpcEndpoint {
  label: string;
  rpcUrl?: string;
  signer: FacilitatorSvmSigner;
}

type FacilitatorOperation =
  | 'simulateTransaction'
  | 'sendTransaction'
  | 'confirmTransaction'
  | 'simulateTransactionWithInnerInstructions'
  | 'getConfirmedTransactionInnerInstructions'
  | 'getTokenAccountBalance'
  | 'fetchAddressLookupTables';

/**
 * @name createResilientFacilitatorSigner
 * @description Wraps one or more facilitator signers with failover for transient RPC failures.
 */
export function createResilientFacilitatorSigner(endpoints: readonly FacilitatorRpcEndpoint[]): FacilitatorSvmSigner {
  if (endpoints.length === 0) {
    throw new Error('At least one facilitator RPC endpoint is required');
  }

  const primary = endpoints[0];
  if (!primary) {
    throw new Error('At least one facilitator RPC endpoint is required');
  }

  return {
    getAddresses: () => primary.signer.getAddresses(),
    signTransaction: (transaction, feePayer, network) =>
      primary.signer.signTransaction(transaction, feePayer, network),
    simulateTransaction: (transaction, network) =>
      runWithRpcFallback(endpoints, 'simulateTransaction', network, endpoint =>
        endpoint.signer.simulateTransaction(transaction, network)),
    sendTransaction: (transaction, network) =>
      runWithRpcFallback(endpoints, 'sendTransaction', network, endpoint =>
        endpoint.signer.sendTransaction(transaction, network)),
    confirmTransaction: (signature, network) =>
      runWithRpcFallback(endpoints, 'confirmTransaction', network, endpoint =>
        endpoint.signer.confirmTransaction(signature, network)),
    simulateTransactionWithInnerInstructions: async (transaction, feePayer, network) =>
      runWithRpcFallback(endpoints, 'simulateTransactionWithInnerInstructions', network, endpoint => {
        if (!endpoint.signer.simulateTransactionWithInnerInstructions) {
          throw new Error('simulateTransactionWithInnerInstructions is not available on facilitator signer');
        }
        return endpoint.signer.simulateTransactionWithInnerInstructions(transaction, feePayer, network);
      }),
    getConfirmedTransactionInnerInstructions: async (signature, network) =>
      runWithRpcFallback(endpoints, 'getConfirmedTransactionInnerInstructions', network, endpoint => {
        if (!endpoint.signer.getConfirmedTransactionInnerInstructions) {
          return Promise.resolve(null);
        }
        return endpoint.signer.getConfirmedTransactionInnerInstructions(signature, network);
      }),
    getTokenAccountBalance: async (tokenAccountAddress, network) =>
      runWithRpcFallback(endpoints, 'getTokenAccountBalance', network, endpoint => {
        if (!endpoint.signer.getTokenAccountBalance) {
          return Promise.resolve(null);
        }
        return endpoint.signer.getTokenAccountBalance(tokenAccountAddress, network);
      }),
    fetchAddressLookupTables: async (lookupTableAddresses, network) =>
      runWithRpcFallback(endpoints, 'fetchAddressLookupTables', network, endpoint => {
        if (!endpoint.signer.fetchAddressLookupTables) {
          throw new Error('fetchAddressLookupTables is not available on facilitator signer');
        }
        return endpoint.signer.fetchAddressLookupTables(lookupTableAddresses, network);
      }),
  };
}

/**
 * @name parseRpcFallbackUrls
 * @description Parses comma-separated RPC fallback URLs from environment variables or config files.
 */
export function parseRpcFallbackUrls(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return uniqueRpcUrls(value.split(',').map(item => item.trim()).filter(Boolean));
}

/**
 * @name uniqueRpcUrls
 * @description Deduplicates RPC URLs while preserving priority order.
 */
export function uniqueRpcUrls(urls: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const url of urls) {
    if (seen.has(url)) {
      continue;
    }
    seen.add(url);
    unique.push(url);
  }

  return unique;
}

/**
 * @name isTransientRpcError
 * @description Returns true when an error is likely caused by endpoint health, lag, throttling, or transport.
 */
export function isTransientRpcError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  if (!message) {
    return false;
  }

  if (
    message.startsWith('simulation failed:')
    && !containsAny(message, [
      'blockhash not found',
      'minimum context slot',
      'node is behind',
      'behind by',
      'fetch failed',
      'slot was skipped',
      'slot skipped',
    ])
  ) {
    return false;
  }

  return containsAny(message, [
    'fetch failed',
    'network request failed',
    'networkerror',
    'socket hang up',
    'connection closed',
    'connection reset',
    'connection refused',
    'econnreset',
    'econnrefused',
    'etimedout',
    'timeout',
    'eai_again',
    'too many requests',
    'rate limit',
    '429',
    '502',
    '503',
    '504',
    'bad gateway',
    'service unavailable',
    'gateway timeout',
    'node is behind',
    'behind by',
    'minimum context slot',
    'slot was skipped',
    'slot skipped',
    'blockhash not found',
    'failed to get latest blockhash',
    'failed to get recent blockhash',
  ]);
}

async function runWithRpcFallback<T>(
  endpoints: readonly FacilitatorRpcEndpoint[],
  operation: FacilitatorOperation,
  network: string,
  execute: (endpoint: FacilitatorRpcEndpoint) => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let index = 0; index < endpoints.length; index += 1) {
    const endpoint = endpoints[index];
    if (!endpoint) {
      continue;
    }

    try {
      return await execute(endpoint);
    } catch (error) {
      lastError = error;
      const hasNext = index < endpoints.length - 1;
      if (!hasNext || !isTransientRpcError(error)) {
        throw error;
      }

      logger.warn('x402 facilitator RPC endpoint failed; trying fallback', {
        operation,
        network,
        endpoint: endpoint.rpcUrl ? redactSensitiveString(endpoint.rpcUrl) : endpoint.label,
        error: getErrorMessage(error),
      });
    }
  }

  throw lastError instanceof Error ? lastError : new Error(getErrorMessage(lastError));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
}

function containsAny(message: string, needles: readonly string[]): boolean {
  return needles.some(needle => message.includes(needle));
}
