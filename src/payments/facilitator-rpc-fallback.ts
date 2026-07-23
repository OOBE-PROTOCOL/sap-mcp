/**
 * @name FacilitatorRpcFallback
 * @description Resilient RPC endpoint failover with round-robin and timeouts
 *   for x402 SVM facilitator operations.
 *
 * Strategy:
 *   1. Round-robin — each call starts from the next endpoint in the rotation
 *   2. Timeout — each attempt gets a configurable deadline (default 8s)
 *   3. Failover — on transient errors or timeout, immediately tries the next endpoint
 *   4. Multiple public mainnet RPCs are included as defaults to avoid rate limits
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

/** Per-attempt timeout in milliseconds. If an RPC doesn't respond in this window, we move to the next. */
const RPC_ATTEMPT_TIMEOUT_MS = 8_000;

/** Health check interval — proactively probes endpoints every 30s. */
const HEALTH_CHECK_INTERVAL_MS = 30_000;

/** Round-robin counter — shared across all operations so calls distribute across endpoints. */
let roundRobinIndex = 0;

/** Endpoint health status — updated by periodic health checks and inline failures. */
const endpointHealth = new Map<string, { healthy: boolean; lastCheckedAt: number; consecutiveFailures: number }>();

/** Health check timer handle. */
let healthCheckTimer: NodeJS.Timeout | undefined;

/**
 * @name createResilientFacilitatorSigner
 * @description Wraps one or more facilitator signers with round-robin load balancing,
 *   per-attempt timeouts, and failover for transient RPC failures.
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
      runWithRoundRobin(endpoints, 'simulateTransaction', network, endpoint =>
        endpoint.signer.simulateTransaction(transaction, network)),
    sendTransaction: (transaction, network) =>
      runWithRoundRobin(endpoints, 'sendTransaction', network, endpoint =>
        endpoint.signer.sendTransaction(transaction, network)),
    confirmTransaction: (signature, network) =>
      runWithRoundRobin(endpoints, 'confirmTransaction', network, endpoint =>
        endpoint.signer.confirmTransaction(signature, network)),
    simulateTransactionWithInnerInstructions: async (transaction, feePayer, network) =>
      runWithRoundRobin(endpoints, 'simulateTransactionWithInnerInstructions', network, endpoint => {
        if (!endpoint.signer.simulateTransactionWithInnerInstructions) {
          throw new Error('simulateTransactionWithInnerInstructions is not available on facilitator signer');
        }
        return endpoint.signer.simulateTransactionWithInnerInstructions(transaction, feePayer, network);
      }),
    getConfirmedTransactionInnerInstructions: async (signature, network) =>
      runWithRoundRobin(endpoints, 'getConfirmedTransactionInnerInstructions', network, endpoint => {
        if (!endpoint.signer.getConfirmedTransactionInnerInstructions) {
          return Promise.resolve(null);
        }
        return endpoint.signer.getConfirmedTransactionInnerInstructions(signature, network);
      }),
    getTokenAccountBalance: async (tokenAccountAddress, network) =>
      runWithRoundRobin(endpoints, 'getTokenAccountBalance', network, endpoint => {
        if (!endpoint.signer.getTokenAccountBalance) {
          return Promise.resolve(null);
        }
        return endpoint.signer.getTokenAccountBalance(tokenAccountAddress, network);
      }),
    fetchAddressLookupTables: async (lookupTableAddresses, network) =>
      runWithRoundRobin(endpoints, 'fetchAddressLookupTables', network, endpoint => {
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
    'forbidden',
    'unauthorized',
    '401',
    '403',
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

async function runWithRoundRobin<T>(
  endpoints: readonly FacilitatorRpcEndpoint[],
  operation: FacilitatorOperation,
  network: string,
  execute: (endpoint: FacilitatorRpcEndpoint) => Promise<T>,
): Promise<T> {
  if (endpoints.length === 0) {
    throw new Error('No facilitator RPC endpoints configured');
  }

  // Start health check timer if not already running
  startHealthCheckTimer(endpoints);

  // Advance the round-robin counter — each call starts from the next endpoint.
  const startIndex = roundRobinIndex % endpoints.length;
  roundRobinIndex = (roundRobinIndex + 1) % endpoints.length;

  let lastError: unknown;

  for (let attempt = 0; attempt < endpoints.length; attempt++) {
    const index = (startIndex + attempt) % endpoints.length;
    const endpoint = endpoints[index];
    if (!endpoint) continue;

    // Skip unhealthy endpoints (but still try them as last resort)
    const health = getEndpointHealth(endpoint);
    if (!health.healthy && attempt < endpoints.length - 1) {
      continue;
    }

    try {
      // Race the execution against a timeout — if the RPC is slow, we move on immediately.
      const result = await withTimeout(
        execute(endpoint),
        RPC_ATTEMPT_TIMEOUT_MS,
        endpoint.label,
        operation,
      );

      // Mark endpoint as healthy on success
      markEndpointHealthy(endpoint);

      return result;
    } catch (error) {
      lastError = error;
      const hasNext = attempt < endpoints.length - 1;
      const isTimeout = error instanceof RpcTimeoutError;
      const isTransient = isTimeout || isTransientRpcError(error);

      // Mark endpoint as unhealthy on transient failure
      if (isTransient) {
        markEndpointUnhealthy(endpoint);
      }

      if (!hasNext || !isTransient) {
        throw error;
      }

      logger.warn('x402 facilitator RPC endpoint failed; trying next (round-robin)', {
        operation,
        network,
        endpoint: endpoint.rpcUrl ? redactSensitiveString(endpoint.rpcUrl) : endpoint.label,
        reason: isTimeout ? 'timeout' : 'transient error',
        error: isTimeout ? `Timed out after ${RPC_ATTEMPT_TIMEOUT_MS}ms` : getErrorMessage(error),
      });
    }
  }

  throw lastError instanceof Error ? lastError : new Error(getErrorMessage(lastError));
}

/**
 * Get or initialize health status for an endpoint.
 */
function getEndpointHealth(endpoint: FacilitatorRpcEndpoint): { healthy: boolean; lastCheckedAt: number; consecutiveFailures: number } {
  const key = endpoint.label;
  let status = endpointHealth.get(key);
  if (!status) {
    status = { healthy: true, lastCheckedAt: 0, consecutiveFailures: 0 };
    endpointHealth.set(key, status);
  }
  return status;
}

/**
 * Mark an endpoint as healthy after a successful operation.
 */
function markEndpointHealthy(endpoint: FacilitatorRpcEndpoint): void {
  const status = getEndpointHealth(endpoint);
  status.healthy = true;
  status.consecutiveFailures = 0;
  status.lastCheckedAt = Date.now();
}

/**
 * Mark an endpoint as unhealthy after a transient failure.
 * After 3 consecutive failures, the endpoint is marked unhealthy until the next health check.
 */
function markEndpointUnhealthy(endpoint: FacilitatorRpcEndpoint): void {
  const status = getEndpointHealth(endpoint);
  status.consecutiveFailures += 1;
  status.lastCheckedAt = Date.now();
  if (status.consecutiveFailures >= 3) {
    status.healthy = false;
    logger.warn('Facilitator RPC endpoint marked unhealthy', {
      endpoint: endpoint.label,
      consecutiveFailures: status.consecutiveFailures,
    });
  }
}

/**
 * Start periodic health check timer. Probes each endpoint every 30s with a lightweight
 * getLatestBlockhash call. Resets unhealthy endpoints that recover.
 */
function startHealthCheckTimer(endpoints: readonly FacilitatorRpcEndpoint[]): void {
  if (healthCheckTimer) {
    return; // Already running
  }

  healthCheckTimer = setInterval(async () => {
    for (const endpoint of endpoints) {
      if (!endpoint.rpcUrl) continue;

      const status = getEndpointHealth(endpoint);
      if (status.healthy) {
        continue; // Only probe unhealthy endpoints
      }

      try {
        // Lightweight probe — just check if the RPC responds
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3_000);
        const response = await fetch(endpoint.rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.ok) {
          markEndpointHealthy(endpoint);
          logger.info('Facilitator RPC endpoint recovered', { endpoint: endpoint.label });
        }
      } catch {
        // Still unhealthy — will be checked again next interval
      }
    }
  }, HEALTH_CHECK_INTERVAL_MS);

  healthCheckTimer.unref?.();
}

/**
 * Race a promise against a timeout. If the timeout fires, throw `RpcTimeoutError`.
 */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  operation: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new RpcTimeoutError(label, operation, ms));
    }, ms);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Custom error for RPC timeouts — treated as transient by the failover loop.
 */
class RpcTimeoutError extends Error {
  readonly label: string;
  readonly operation: string;
  readonly timeoutMs: number;

  constructor(label: string, operation: string, timeoutMs: number) {
    super(`RPC timeout: ${label} did not respond to ${operation} within ${timeoutMs}ms`);
    this.name = 'RpcTimeoutError';
    this.label = label;
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
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
