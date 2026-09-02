/**
 * @name tools/phoenix/phoenix-helpers
 * @description Shared helpers for Phoenix tool modules.
 *
 * @module tools/phoenix/phoenix-helpers
 */

import { PublicKey, Connection } from '@solana/web3.js';
import type { SapMcpContext } from '../../../core/src/types.js';

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

export function getConnection(context: SapMcpContext): Connection {
  return context.connection;
}

/**
 * Parse a string into a PublicKey, rejecting abbreviated/truncated addresses.
 * Base58 Solana addresses are 32-44 chars, no dots, no ellipsis.
 */
export function parsePublicKey(value: string): PublicKey {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') {
    throw new Error('Invalid public key: empty or null. Pass a full base58 wallet address (44 chars).');
  }
  if (trimmed.includes('...') || trimmed.includes('…')) {
    throw new Error(`Invalid public key: abbreviated address "${trimmed}" contains dots. Pass the FULL base58 address (44 chars, no dots).`);
  }
  if (trimmed.length < 32 || trimmed.length > 44) {
    throw new Error(`Invalid public key: length ${trimmed.length} is outside valid range (32-44 chars). Pass the FULL base58 address.`);
  }
  return new PublicKey(trimmed);
}

/** Returns trimmed authority or null if missing/undefined/null/abbreviated. */
export function validateAuthority(input: { authority?: unknown }): string | null {
  const authority = String(input.authority ?? '').trim();
  if (!authority || authority === 'undefined' || authority === 'null') {
    return null;
  }
  // Reject abbreviated addresses like "4emrGb...XVYD" — must be full base58 (32-44 chars, no dots)
  if (authority.includes('...') || authority.includes('…') || authority.length < 32) {
    return null;
  }
  return authority;
}

/** Default Phoenix perp symbols. */
export const PHOENIX_SYMBOLS = ['SOL', 'BTC', 'ETH', 'BNB'] as const;