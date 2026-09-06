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

// ─── On-chain Limits ────────────────────────────────────────────────────────────

/**
 * Hard limits enforced by the SAP mainnet validator (validator.rs).
 * Rejecting here — at builder time — surfaces an actionable message in the
 * tool result instead of a post-preview RPC simulation failure (Anchor
 * errors 6003 TooManyProtocols... see synapse-sap-sdk anchor-errors.ts).
 *
 * All values mirror `programs/synapse-agent-sap/src/state.rs` AgentAccount
 * constants and `validator.rs` checks byte-for-byte:
 *
 * | Constant              | Value | Anchor error                       |
 * |-----------------------|-------|------------------------------------|
 * | MAX_NAME_LEN          | 64    | 6000 NameTooLong / 6022 EmptyName  |
 * | MAX_DESC_LEN          | 256   | 6001 / 6024                        |
 * | MAX_URI_LEN           | 256   | 6002 UriTooLong                    |
 * | MAX_AGENT_ID_LEN      | 128   | 6025 AgentIdTooLong                |
 * | MAX_CAPABILITIES      | 10    | 6003 TooManyCapabilities           |
 * | MAX_PRICING_TIERS     | 5     | 6004 TooManyPricingTiers           |
 * | MAX_PROTOCOLS         | 5     | 6005 TooManyProtocols              |
 * | MAX_VOLUME_CURVE_PTS  | 5     | 6034 TooManyVolumeCurvePoints      |
 *
 * Name must also contain no control chars (6023 ControlCharInName, bytes
 * < 0x20). x402Endpoint must start with "https://" (6032). Capability ids
 * must be colon-namespaced with non-empty parts (6026) and unique (6027).
 * Tier ids must be non-empty (6028) and unique (6029), rateLimit > 0
 * (6030), min ≤ max price (6035), curve afterCalls strictly ascending
 * (6033) with non-increasing prices (6142).
 *
 * @see synapse-agent-sap/programs/synapse-agent-sap/src/validator.rs
 */
export const MAX_NAME_LEN = 64;
export const MAX_DESCRIPTION_LEN = 256;
export const MAX_URI_LEN = 256;
export const MAX_AGENT_ID_LEN = 128;
export const MAX_CAPABILITIES = 10;
export const MAX_PROTOCOLS = 5;
export const MAX_PRICING_TIERS = 5;
export const MAX_VOLUME_CURVE_POINTS = 5;

// ─── On-chain Payload Validators ────────────────────────────────────────────────

/**
 * Byte length of a UTF-8 string as counted by the Rust validator
 * (`str::len()` counts bytes, not chars — a 40-emoji name can exceed 64
 * bytes while looking short in a JS UI).
 */
function rustStrLen(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

/** Mirrors validator.rs validate_name: non-empty, ≤64B, no control chars. */
export function validateNameOnChain(name: string): void {
  if (rustStrLen(name) === 0) {
    throw new Error('name is empty (SAP error 6022 EmptyName). Provide a public display name.');
  }
  if (rustStrLen(name) > MAX_NAME_LEN) {
    throw new Error(
      `name exceeds the on-chain limit: ${rustStrLen(name)} bytes > ${MAX_NAME_LEN} (SAP error 6000 NameTooLong). ` +
      'Shorten the name to at most 64 UTF-8 bytes and retry.',
    );
  }
  if (Buffer.from(name, 'utf8').some((b) => b < 0x20)) {
    throw new Error(
      'name contains control characters (SAP error 6023 ControlCharInName). ' +
      'Remove tabs, newlines, and other bytes < 0x20 and retry.',
    );
  }
}

/** Mirrors validator.rs validate_description: non-empty, ≤256B. */
export function validateDescriptionOnChain(description: string): void {
  if (rustStrLen(description) === 0) {
    throw new Error('description is empty (SAP error 6024 EmptyDescription). Describe what the agent does.');
  }
  if (rustStrLen(description) > MAX_DESCRIPTION_LEN) {
    throw new Error(
      `description exceeds the on-chain limit: ${rustStrLen(description)} bytes > ${MAX_DESCRIPTION_LEN} ` +
      `(SAP error 6001 DescriptionTooLong). Shorten it to at most ${MAX_DESCRIPTION_LEN} UTF-8 bytes and retry.`,
    );
  }
}

/** Mirrors validator.rs validate_agent_id: ≤128B. */
export function validateAgentIdOnChain(agentId: string): void {
  if (rustStrLen(agentId) > MAX_AGENT_ID_LEN) {
    throw new Error(
      `agentId exceeds the on-chain limit: ${rustStrLen(agentId)} bytes > ${MAX_AGENT_ID_LEN} ` +
      `(SAP error 6025 AgentIdTooLong). Shorten it to at most ${MAX_AGENT_ID_LEN} UTF-8 bytes and retry.`,
    );
  }
}

/** Mirrors validator.rs validate_uri: ≤256B. */
export function validateUriOnChain(uri: string, field: string): void {
  if (rustStrLen(uri) > MAX_URI_LEN) {
    throw new Error(
      `${field} exceeds the on-chain limit: ${rustStrLen(uri)} bytes > ${MAX_URI_LEN} ` +
      `(SAP error 6002 UriTooLong). Shorten it to at most ${MAX_URI_LEN} UTF-8 bytes and retry.`,
    );
  }
}

/** Mirrors validator.rs validate_x402_endpoint: ≤256B AND starts with "https://". */
export function validateX402EndpointOnChain(endpoint: string): void {
  validateUriOnChain(endpoint, 'x402Endpoint');
  if (!endpoint.startsWith('https://')) {
    throw new Error(
      'x402Endpoint must start with "https://" (SAP error 6032 InvalidX402Endpoint). ' +
      'Provide a public HTTPS payment/discovery endpoint and retry.',
    );
  }
}

/** Mirrors validator.rs validate_capability_format + duplicate check. */
export function validateCapabilityIdsOnChain(ids: readonly string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    const colon = id.indexOf(':');
    if (colon <= 0 || colon === id.length - 1) {
      throw new Error(
        `capability id "${id}" is not colon-namespaced "protocol:capability" with non-empty parts ` +
        '(SAP error 6026 InvalidCapabilityFormat). Use ids like "synapse-agent-protocol:perp-trading" and retry.',
      );
    }
    if (seen.has(id)) {
      throw new Error(
        `capability id "${id}" is duplicated (SAP error 6027 DuplicateCapability). ` +
        'Remove the duplicate and retry.',
      );
    }
    seen.add(id);
  }
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
  if (value.length > MAX_CAPABILITIES) {
    throw new Error(
      `capabilities exceeds the on-chain limit: ${value.length} > ${MAX_CAPABILITIES} (SAP error 6003 TooManyCapabilities). ` +
      'Reduce the list to at most 10 colon-namespaced ids and retry.',
    );
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

/**
 * Full on-chain validation of already-parsed capabilities (counts, id
 * format, duplicates, per-field byte lengths and field size limits).
 * Call AFTER parseCapabilities — mirrors validator.rs validate_capabilities
 * including the per-Capability #[max_len] bounds from state.rs.
 */
export function validateCapabilitiesOnChain(caps: readonly Capability[]): void {
  const seen = new Set<string>();
  for (const cap of caps) {
    validateCapabilityIdsOnChain([cap.id]);
    if (seen.has(cap.id)) {
      throw new Error(
        `capability id "${cap.id}" is duplicated (SAP error 6027 DuplicateCapability). Remove the duplicate and retry.`,
      );
    }
    seen.add(cap.id);
    if (cap.description !== null) {
      if (rustStrLen(cap.description) > 128) {
        throw new Error(
          `capability "${cap.id}" description exceeds the on-chain limit: ${rustStrLen(cap.description)} bytes > 128 ` +
          '(Anchor #[max_len(128)] in state.rs). Shorten it and retry.',
        );
      }
    }
    if (cap.protocolId !== null && rustStrLen(cap.protocolId) > 64) {
      throw new Error(
        `capability "${cap.id}" protocolId exceeds the on-chain limit: ${rustStrLen(cap.protocolId)} bytes > 64 ` +
        '(Anchor #[max_len(64)] in state.rs). Shorten it and retry.',
      );
    }
    if (cap.version !== null && rustStrLen(cap.version) > 16) {
      throw new Error(
        `capability "${cap.id}" version exceeds the on-chain limit: ${rustStrLen(cap.version)} bytes > 16 ` +
        '(Anchor #[max_len(16)] in state.rs). Use a short semver like "1.0.0" and retry.',
      );
    }
  }
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

/**
 * Full on-chain validation of already-parsed pricing tiers. Mirrors
 * validator.rs validate_pricing: count ≤ 5, non-empty unique tierIds,
 * rateLimit > 0, min ≤ max price, and the volume-curve invariants
 * (≤ 5 points, strictly ascending afterCalls, non-increasing prices).
 * Call AFTER parsePricingTiers.
 */
export function validatePricingTiersOnChain(tiers: readonly PricingTier[]): void {
  if (tiers.length > MAX_PRICING_TIERS) {
    throw new Error(
      `pricing exceeds the on-chain limit: ${tiers.length} tiers > ${MAX_PRICING_TIERS} ` +
      '(SAP error 6004 TooManyPricingTiers). Reduce to at most 5 tiers and retry.',
    );
  }
  const seen = new Set<string>();
  for (const tier of tiers) {
    if (tier.tierId.length === 0) {
      throw new Error('pricing tierId is empty (SAP error 6028 EmptyTierId). Name every tier and retry.');
    }
    if (rustStrLen(tier.tierId) > 32) {
      throw new Error(
        `pricing tierId "${tier.tierId}" exceeds the on-chain limit: ${rustStrLen(tier.tierId)} bytes > 32 ` +
        '(Anchor #[max_len(32)] in state.rs). Shorten it and retry.',
      );
    }
    if (seen.has(tier.tierId)) {
      throw new Error(
        `pricing tierId "${tier.tierId}" is duplicated (SAP error 6029 DuplicateTierId). Rename one tier and retry.`,
      );
    }
    seen.add(tier.tierId);
    if (!tier.rateLimit || tier.rateLimit <= 0) {
      throw new Error(
        `pricing tier "${tier.tierId}" has rateLimit ${tier.rateLimit} (SAP error 6030 InvalidRateLimit). ` +
        'rateLimit must be > 0 — pass calls per second (e.g. 60) and retry.',
      );
    }
    if (tier.minPricePerCall !== null && tier.maxPricePerCall !== null && tier.minPricePerCall.gt(tier.maxPricePerCall)) {
      throw new Error(
        `pricing tier "${tier.tierId}" has minPricePerCall > maxPricePerCall (SAP error 6035 MinPriceExceedsMax). ` +
        'Fix the price floor/ceiling and retry.',
      );
    }
    const curve = tier.volumeCurve ?? [];
    if (curve.length > MAX_VOLUME_CURVE_POINTS) {
      throw new Error(
        `pricing tier "${tier.tierId}" volumeCurve has ${curve.length} points > ${MAX_VOLUME_CURVE_POINTS} ` +
        '(SAP error 6034 TooManyVolumeCurvePoints). Reduce to at most 5 breakpoints and retry.',
      );
    }
    for (let i = 1; i < curve.length; i++) {
      if (curve[i].afterCalls <= curve[i - 1].afterCalls) {
        throw new Error(
          `pricing tier "${tier.tierId}" volumeCurve afterCalls must strictly increase ` +
          `(${curve[i].afterCalls} after ${curve[i - 1].afterCalls}, SAP error 6033 InvalidVolumeCurve). ` +
          'Order breakpoints by ascending afterCalls and retry.',
        );
      }
      if (curve[i].pricePerCall.gt(curve[i - 1].pricePerCall)) {
        throw new Error(
          `pricing tier "${tier.tierId}" volumeCurve prices must be non-increasing with volume ` +
          '(SAP error 6142 VolumeCurveNotDescending). A discount curve must never raise the price — fix and retry.',
        );
      }
    }
  }
}

/**
 * Optional-field identity payload validation shared by the register/update
 * arg parsers (local signer runtime) and the hosted identity builders.
 * null = field absent → skipped, mirroring validator.rs validate_update.
 */
export function validateIdentityArgsOnChain(args: {
  readonly name?: string | null;
  readonly description?: string | null;
  readonly agentId?: string | null;
  readonly agentUri?: string | null;
  readonly x402Endpoint?: string | null;
  readonly capabilities?: Capability[] | null;
  readonly pricing?: PricingTier[] | null;
  readonly protocols?: string[] | null;
}): void {
  if (args.name != null) validateNameOnChain(args.name);
  if (args.description != null) validateDescriptionOnChain(args.description);
  if (args.agentId != null) validateAgentIdOnChain(args.agentId);
  if (args.agentUri != null) validateUriOnChain(args.agentUri, 'agentUri');
  if (args.x402Endpoint != null) validateX402EndpointOnChain(args.x402Endpoint);
  if (args.capabilities != null) validateCapabilitiesOnChain(args.capabilities);
  if (args.pricing != null) validatePricingTiersOnChain(args.pricing);
  // Protocol count is checked inside parseProtocols (6005).
}

export function parseProtocols(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error('protocols must be an array');
  }
  if (value.length > MAX_PROTOCOLS) {
    throw new Error(
      `protocols exceeds the on-chain limit: ${value.length} > ${MAX_PROTOCOLS} (SAP error 6005 TooManyProtocols). ` +
      'Keep at most 5 protocol tags (e.g. "sap", "mcp", "jupiter", "sns", "x402") and retry.',
    );
  }
  return value.map((item) => {
    if (typeof item !== 'string' || item.length === 0) {
      throw new Error('protocols must contain non-empty strings');
    }
    return item;
  });
}