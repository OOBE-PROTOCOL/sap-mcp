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

export function parsePublicKey(value: string): PublicKey {
  return new PublicKey(value);
}

/** Default Phoenix perp symbols. */
export const PHOENIX_SYMBOLS = ['SOL', 'BTC', 'ETH', 'BNB'] as const;