/**
 * @name sap-sdk-parsers
 * @description Shared input parsers and helpers for SAP SDK tool argument validation.
 *
 * Extracted from sap-sdk-tools.ts to break the circular dependency between
 * sap-sdk-tools.ts and identity-builders.ts. Both files import from this module
 * instead of importing each other.
 *
 * @module tools/sap-sdk-parsers
 */

import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import {
  SettlementMode,
  TokenType,
  type Capability,
  type PricingTier,
  type VolumeCurveBreakpoint,
} from '@oobe-protocol-labs/synapse-sap-sdk/types';

// ─── Shared Types ──────────────────────────────────────────────────────────────

export type JsonRecord = Record<string, unknown>;

// ─── Input Helpers ──────────────────────────────────────────────────────────────

export function asRecord(input: unknown): JsonRecord {
  return input && typeof input === 'object' && !Array.isArray(input) ? input as JsonRecord : {};
}

export function requiredString(input: JsonRecord, field: string): string {
  const value = input[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} is required`);
  }
  return value;
}

export function optionalString(input: JsonRecord, field: string): string | undefined {
  const value = input[field];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function requiredNumber(input: JsonRecord, field: string): number {
  const value = input[field];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  throw new Error(`${field} must be a finite number`);
}

export function optionalNumber(input: JsonRecord, field: string): number | undefined {
  const value = input[field];
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return requiredNumber(input, field);
}

export function requiredBn(input: JsonRecord, field: string): BN {
  const value = input[field];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new BN(Math.trunc(value));
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    return new BN(value, 10);
  }
  throw new Error(`${field} must be an integer number or decimal string`);
}

export function optionalBn(input: JsonRecord, field: string, fallback: BN): BN {
  const value = input[field];
  return value === undefined || value === null || value === '' ? fallback : requiredBn(input, field);
}

export function optionalBoolean(input: JsonRecord, field: string): boolean | undefined {
  const value = input[field];
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string' && (value === 'true' || value === 'false')) {
    return value === 'true';
  }
  throw new Error(`${field} must be a boolean`);
}

export function requiredPublicKey(input: JsonRecord, field: string): PublicKey {
  return new PublicKey(requiredString(input, field));
}

export function optionalPublicKey(input: JsonRecord, field: string): PublicKey | undefined {
  const value = optionalString(input, field);
  return value ? new PublicKey(value) : undefined;
}

export function parseVolumeCurve(value: unknown): VolumeCurveBreakpoint[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error('volumeCurve must be an array');
  }

  return value.map((item) => {
    const record = asRecord(item);
    return {
      afterCalls: requiredNumber(record, 'afterCalls'),
      pricePerCall: requiredBn(record, 'pricePerCall'),
    };
  });
}

export function optionalTokenType(input: JsonRecord): { tokenType: typeof TokenType[keyof typeof TokenType]; decimalsFallback: number } {
  const raw = optionalString(input, 'tokenType') ?? 'sol';
  const normalized = raw.trim().toLowerCase();

  if (normalized === 'sol' || normalized === 'native' || normalized === 'lamports') {
    return { tokenType: TokenType.Sol, decimalsFallback: 9 };
  }
  if (normalized === 'usdc' || normalized === 'micro-usdc' || normalized === 'micro_usdc') {
    return { tokenType: TokenType.Usdc, decimalsFallback: 6 };
  }
  if (normalized === 'spl' || normalized === 'token') {
    return { tokenType: TokenType.Spl, decimalsFallback: 0 };
  }

  throw new Error('tokenType must be one of sol, usdc, or spl');
}

export function optionalSettlementMode(input: JsonRecord): typeof SettlementMode[keyof typeof SettlementMode] {
  const raw = optionalString(input, 'settlementMode') ?? 'escrow';
  const normalized = raw.trim().toLowerCase();

  if (normalized === 'instant') {
    return SettlementMode.Instant;
  }
  if (normalized === 'escrow') {
    return SettlementMode.Escrow;
  }
  if (normalized === 'batched' || normalized === 'batch') {
    return SettlementMode.Batched;
  }
  if (normalized === 'x402' || normalized === 'pay.sh' || normalized === 'paysh') {
    return SettlementMode.X402;
  }

  throw new Error('settlementMode must be one of instant, escrow, batched, or x402');
}

// ─── Public Parsers ─────────────────────────────────────────────────────────────

/**
 * Normalizes a capability id to the on-chain validator format.
 *
 * The mainnet validator (validator.rs InvalidCapabilityFormat 6026) requires
 * capability ids to be colon-namespaced `protocol:capability` (e.g.
 * "synapse-agent-protocol:perps"). Bare ids like "perps" or "perp-trading"
 * are rejected on-chain. When the caller supplies a bare id we namespace it
 * with its protocolId when present, or with the "synapse-agent-protocol"
 * protocol namespace (the SAP home protocol) when no protocol is known.
 * Verified against mainnet simulation: bare id → CAP-ERR; "proto:cap" → SUCCESS.
 */
function normalizeCapabilityId(id: string, protocolId: string | null): string {
  if (id.includes(':')) {
    return id;
  }
  return `${protocolId ?? 'synapse-agent-protocol'}:${id}`;
}

export function parseCapabilities(value: unknown): Capability[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error('capabilities must be an array');
  }

  return value.map((item) => {
    if (typeof item === 'string') {
      if (item.includes(':')) {
        return { id: item, description: null, protocolId: item.slice(0, item.indexOf(':')), version: null };
      }
      return { id: `synapse-agent-protocol:${item}`, description: null, protocolId: null, version: null };
    }
    const record = asRecord(item);
    const protocolId = optionalString(record, 'protocolId') ?? null;
    return {
      id: normalizeCapabilityId(requiredString(record, 'id'), protocolId),
      description: optionalString(record, 'description') ?? null,
      protocolId,
      version: optionalString(record, 'version') ?? null,
    };
  });
}

export function parsePricingTiers(value: unknown): PricingTier[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error('pricing must be an array');
  }

  return value.map((item) => {
    const record = asRecord(item);
    const pricePerCall = optionalBn(record, 'pricePerCall', new BN(0));
    const { tokenType, decimalsFallback } = optionalTokenType(record);
    const tokenMint = optionalPublicKey(record, 'tokenMint') ?? null;
    if (tokenType === TokenType.Spl && tokenMint === null) {
      throw new Error('pricing.tokenMint is required when tokenType is spl');
    }
    const volumeCurve = parseVolumeCurve(record.volumeCurve);
    return {
      tierId: optionalString(record, 'tierId') ?? 'default',
      pricePerCall,
      minPricePerCall: record.minPricePerCall === undefined ? null : requiredBn(record, 'minPricePerCall'),
      maxPricePerCall: record.maxPricePerCall === undefined ? null : requiredBn(record, 'maxPricePerCall'),
      rateLimit: optionalNumber(record, 'rateLimit') ?? 60,
      maxCallsPerSession: optionalNumber(record, 'maxCallsPerSession') ?? 1_000,
      burstLimit: optionalNumber(record, 'burstLimit') ?? null,
      tokenType,
      tokenMint,
      tokenDecimals: optionalNumber(record, 'tokenDecimals') ?? decimalsFallback,
      settlementMode: optionalSettlementMode(record),
      minEscrowDeposit: record.minEscrowDeposit === undefined ? null : requiredBn(record, 'minEscrowDeposit'),
      batchIntervalSec: optionalNumber(record, 'batchIntervalSec') ?? null,
      volumeCurve: volumeCurve.length > 0 ? volumeCurve : null,
    };
  });
}

export function parseProtocols(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error('protocols must be an array');
  }
  return value.map((item) => {
    if (typeof item !== 'string' || item.length === 0) {
      throw new Error('protocols must contain non-empty strings');
    }
    return item;
  });
}