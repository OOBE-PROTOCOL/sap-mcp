/**
 * @name perps/phoenix/phoenix-relay-api
 * @description Relay.link API client for cross-chain deposits to Solana.
 *
 * Uses the Relay.link REST API to generate deposit addresses for bridging
 * funds from EVM chains (Ethereum, Base, Arbitrum, etc.) to Solana USDC.
 *
 * @module perps/phoenix/phoenix-relay-api
 */

import { logger } from '../../../core/src/logger.js';

/** Relay.link API base URL. */
const RELAY_API_BASE_URL = 'https://api.relay.link';

/** Solana chain ID in Relay (not an EVM chain ID). */
export const RELAY_SOLANA_CHAIN_ID = 792703809;

/** USDC mint on Solana — the destination currency for cross-chain deposits. */
export const RELAY_SOLANA_USDC_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/** Common EVM chain IDs supported by Relay for cross-chain deposits. */
export const RELAY_EVM_CHAIN_IDS = {
  ethereum: 1,
  optimism: 10,
  bsc: 56,
  polygon: 137,
  arbitrum: 42161,
  base: 8453,
  avalanche: 43114,
  blast: 81457,
  scroll: 534352,
  linea: 59144,
} as const;

/** Native zero address for EVM chains (used for native currency like ETH). */
export const RELAY_EVM_NATIVE_ADDRESS = '0x0000000000000000000000000000000000000000';

/** USDC addresses on common EVM chains. */
export const RELAY_EVM_USDC_ADDRESSES: Record<number, string> = {
  1: '0xA0b86991c6218b36c1D19D4a2e9Eb0cE3606eB48',      // Ethereum
  10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',       // Optimism
  56: '0x8AC76A51cc950d9822D68b83fE1Ad97B32Cd580d',       // BSC
  137: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',      // Polygon
  42161: '0xaf88d6fE460f631A87C7455d2E8A1eB05539462B',   // Arbitrum
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',    // Base
  43114: '0xB97EF9Ef8734C71904D8002F14b5D4Ae41f4c6E2',   // Avalanche
  81457: '0x4300000000000000000000000000000000000003',    // Blast
};

export interface CrossChainQuoteRequest {
  /** Recipient wallet on Solana (base58). */
  recipient: string;
  /** Origin chain ID (e.g. 1 for Ethereum, 8453 for Base). */
  originChainId: number;
  /** Origin currency address (native = 0x000...000, or ERC20 contract). */
  originCurrency: string;
  /** Amount in smallest unit (wei for ETH, or token units for ERC20). */
  amount: string;
  /** Trade type: EXACT_INPUT (default) or EXPECTED_OUTPUT. */
  tradeType?: 'EXACT_INPUT' | 'EXPECTED_OUTPUT';
}

export interface CrossChainQuoteResponse {
  depositAddress: string;
  requestId: string;
  steps: unknown[];
  fees: {
    gas: { amount: string; currency: string };
    relayer?: { amount: string; currency: string };
  };
  details: {
    operation: string;
    timeEstimate: number;
    currencyIn: { currency: { symbol: string; name: string; decimals: number; chainId: number }; amount: string };
    currencyOut: { currency: { symbol: string; name: string; decimals: number; chainId: number }; amount: string };
  };
}

export interface DepositStatusResponse {
  status: 'pending' | 'success' | 'failed' | 'refunded' | 'delayed';
  inTxHashes: string[];
  txHashes: string[];
  updatedAt: number;
  originChainId: number;
  destinationChainId: number;
}

export interface RelayChainInfo {
  id: number;
  name: string;
  displayName: string;
  depositEnabled: boolean;
  currency: {
    symbol: string;
    address: string;
    decimals: number;
  };
}

/**
 * Fetch a cross-chain deposit quote from Relay.link.
 * The user sends funds to the deposit address and receives USDC on Solana.
 */
export async function getCrossChainQuote(params: CrossChainQuoteRequest): Promise<CrossChainQuoteResponse> {
  const body = {
    user: params.recipient,
    recipient: params.recipient,
    originChainId: params.originChainId,
    destinationChainId: RELAY_SOLANA_CHAIN_ID,
    originCurrency: params.originCurrency,
    destinationCurrency: RELAY_SOLANA_USDC_ADDRESS,
    amount: params.amount,
    tradeType: params.tradeType ?? 'EXACT_INPUT',
    useDepositAddress: true,
  };

  logger.debug('Relay cross-chain quote request', { originChainId: params.originChainId, amount: params.amount });

  const response = await fetch(`${RELAY_API_BASE_URL}/quote/v2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Relay quote failed: ${response.status} ${errorText}`);
  }

  const data = await response.json() as CrossChainQuoteResponse;
  return data;
}

/**
 * Check the status of a cross-chain deposit by requestId.
 */
export async function getDepositStatus(requestId: string): Promise<DepositStatusResponse> {
  const response = await fetch(`${RELAY_API_BASE_URL}/intents/status?requestId=${encodeURIComponent(requestId)}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Relay status check failed: ${response.status} ${errorText}`);
  }

  const data = await response.json() as DepositStatusResponse;
  return data;
}

/**
 * Get all chains supported by Relay for cross-chain deposits.
 */
export async function getSupportedChains(): Promise<RelayChainInfo[]> {
  const response = await fetch(`${RELAY_API_BASE_URL}/chains`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Relay chains fetch failed: ${response.status} ${errorText}`);
  }

  const data = await response.json() as RelayChainInfo[] | { chains: RelayChainInfo[] };
  const chains = Array.isArray(data) ? data : (data as { chains: RelayChainInfo[] }).chains;
  // Filter to only deposit-enabled chains
  return chains.filter((c) => c.depositEnabled);
}