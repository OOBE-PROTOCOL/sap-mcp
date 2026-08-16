/**
 * @name tools/adrena/adrena-helpers
 * @description Shared helpers, constants, and JSON schema types for Adrena tool modules.
 *
 * @module tools/adrena/adrena-helpers
 */

import { PublicKey, Connection } from '@solana/web3.js';
import type { SapMcpContext } from '@oobe-protocol-labs/sap-mcp-core/types';

/* ═══════════════════════════════════════════════════════════════════
 *  JSON Schema types
 * ═══════════════════════════════════════════════════════════════════ */

export interface JsonSchemaProperty {
  readonly type: string;
  readonly description: string;
  readonly enum?: readonly string[];
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface JsonSchema {
  readonly type: 'object';
  readonly properties: Record<string, JsonSchemaProperty>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
}

/* ═══════════════════════════════════════════════════════════════════
 *  Helpers
 * ═══════════════════════════════════════════════════════════════════ */

/** Supported principal tokens for the main pool. */
export const MAIN_POOL_TOKENS = ['JITOSOL', 'WBTC', 'BONK'] as const;

/** Supported commodity tokens. */
export const COMMODITY_TOKENS = ['XAU', 'XAG', 'WTI'] as const;

/** Supported collateral tokens. */
export const COLLATERAL_TOKENS = ['USDC', 'JITOSOL', 'WBTC', 'BONK'] as const;

/**
 * Convert a human-readable price to Adrena raw price (10^10 scaling).
 * @param priceUsd — Price in USD.
 * @returns Raw price as bigint.
 */
export function priceToRaw(priceUsd: number): bigint {
  return BigInt(Math.floor(priceUsd * Math.pow(10, 10)));
}

/**
 * Get the connection from context.
 * @param context — SAP MCP context.
 * @returns Solana connection.
 */
export function getConnection(context: SapMcpContext): Connection {
  return context.connection;
}

/**
 * Parse and validate a public key.
 * @param value — Base58 public key string.
 * @returns PublicKey or throws.
 */
export function parsePublicKey(value: string): PublicKey {
  return new PublicKey(value);
}