/**
 * Unit tests for the perp backing policy on `sap_perpspad_launch_dbc`
 * (dbc-launch-tool.ts): inputSchema contract, all-or-nothing validation,
 * normalization, and the USDC fail-fast gate.
 */
import { describe, expect, it } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import {
  decodeRewardVault,
  DBC_LAUNCH_INPUT_SCHEMA,
  parseBackingPolicy,
  toQuoteBaseUnits,
} from './dbc-launch-tool.js';

describe('sap_perpspad_launch_dbc inputSchema', () => {
  it('exposes the three optional backing fields as primitives', () => {
    const props = DBC_LAUNCH_INPUT_SCHEMA.properties as Record<string, { type: string; enum?: string[] }>;
    expect(props.underlying).toBeDefined();
    expect(props.underlying.type).toBe('string');
    expect(props.leverage).toBeDefined();
    expect(props.leverage.type).toBe('number');
    expect(props.direction).toBeDefined();
    expect(props.direction.type).toBe('string');
    expect(props.direction.enum).toEqual(['long', 'short']);
    expect(props.metadataUri.type).toBe('string');
    expect(props.metadataUri.description).toMatch(/permanent HTTPS URI/i);
  });

  it('does NOT require the backing fields (optional → clean pure-curve launch)', () => {
    const required = DBC_LAUNCH_INPUT_SCHEMA.required as string[];
    expect(required).toContain('ticker');
    expect(required).toContain('name');
    expect(required).toContain('agentWallet');
    expect(required).toContain('payer');
    expect(required).not.toContain('devBuySol');
    expect(required).not.toContain('devBuyAmount');
    expect(required).toContain('latestBlockhash');
    expect(required).not.toContain('underlying');
    expect(required).not.toContain('leverage');
    expect(required).not.toContain('direction');
    expect(required).not.toContain('quote');
  });

  it('describes the all-or-nothing rule in every backing field description', () => {
    const props = DBC_LAUNCH_INPUT_SCHEMA.properties as Record<string, { description: string }>;
    for (const key of ['underlying', 'leverage', 'direction']) {
      expect(props[key].description).toMatch(/all-or-nothing/i);
    }
  });

  it('documents the USDC fail-fast in the quote field description', () => {
    const props = DBC_LAUNCH_INPUT_SCHEMA.properties as Record<string, { description: string }>;
    expect(props.quote.description).toMatch(/USDC/i);
  });
});

describe('DBC dev-buy amounts', () => {
  it('converts SOL and USDC display amounts without float multiplication', () => {
    expect(toQuoteBaseUnits(0.1, 9).toString()).toBe('100000000');
    expect(toQuoteBaseUnits(12.345678, 6).toString()).toBe('12345678');
  });
  it('rejects zero and invalid decimals', () => {
    expect(() => toQuoteBaseUnits(0, 9)).toThrow();
    expect(() => toQuoteBaseUnits(1, 10)).toThrow();
  });
});

describe('RewardVault binary contract', () => {
  it('decodes the Pinocchio v1 layout at the pinned offsets', () => {
    const data = Buffer.alloc(320);
    const executor = PublicKey.unique();
    const quoteMint = PublicKey.unique();
    const rewardMint = PublicKey.unique();
    const tokenProgram = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    executor.toBuffer().copy(data, 104);
    quoteMint.toBuffer().copy(data, 136);
    rewardMint.toBuffer().copy(data, 168);
    tokenProgram.toBuffer().copy(data, 200);
    tokenProgram.toBuffer().copy(data, 232);
    data.writeBigUInt64LE(500_000_000n, 264);
    data.writeUInt16LE(300, 272);
    data.writeBigUInt64LE(456n, 290);
    data.writeBigUInt64LE(400n, 298);
    data.writeUInt32LE(7, 316);

    expect(decodeRewardVault(data)).toMatchObject({
      executor, quoteMint, rewardMint, quoteTokenProgram: tokenProgram,
      rewardTokenProgram: tokenProgram, maxInputPerSwap: 500_000_000n, maxSlippageBps: 300,
      cumulativeRewardReceived: 456n, cumulativeRewardCommitted: 400n, latestEpoch: 7,
    });
    expect(() => decodeRewardVault(Buffer.alloc(319))).toThrow(/length/);
  });
});

describe('parseBackingPolicy — all-or-nothing', () => {
  it('accepts a launch with NO backing fields (clean pure-curve token)', () => {
    const { policy, error } = parseBackingPolicy({});
    expect(policy).toBeUndefined();
    expect(error).toBeUndefined();
  });

  it('rejects a partial triple (underlying only)', () => {
    const { policy, error } = parseBackingPolicy({ underlying: 'SOL' });
    expect(policy).toBeUndefined();
    expect(error?.message).toMatch(/all-or-nothing/i);
    expect(error?.message).toMatch(/leverage, direction/);
  });

  it('rejects a partial triple (leverage + direction, missing underlying)', () => {
    const { policy, error } = parseBackingPolicy({ leverage: 2, direction: 'long' });
    expect(policy).toBeUndefined();
    expect(error?.message).toMatch(/missing: underlying/);
  });

  it('rejects null/empty-string fields as absent (same all-or-nothing rule)', () => {
    const { policy, error } = parseBackingPolicy({ underlying: 'SOL', leverage: 2, direction: '' });
    expect(policy).toBeUndefined();
    expect(error?.message).toMatch(/all-or-nothing/i);
  });
});

describe('parseBackingPolicy — field validation', () => {
  it('accepts a valid SOL 2x long', () => {
    const { policy, error } = parseBackingPolicy({ underlying: 'SOL', leverage: 2, direction: 'long' });
    expect(error).toBeUndefined();
    expect(policy).toEqual({ underlying: 'SOL', leverage: 2, direction: 'long', status: 'pending-keeper' });
  });

  it('accepts equities and commodity symbols (TSLA, OIL)', () => {
    for (const underlying of ['TSLA', 'OIL']) {
      const { policy, error } = parseBackingPolicy({ underlying, leverage: 5, direction: 'short' });
      expect(error).toBeUndefined();
      expect(policy?.underlying).toBe(underlying);
      expect(policy?.status).toBe('pending-keeper');
    }
  });

  it('rejects lowercase input (uppercase A-Z 0-9 enforced, no silent normalization)', () => {
    const { policy, error } = parseBackingPolicy({ underlying: 'sol', leverage: 2, direction: 'long' });
    expect(policy).toBeUndefined();
    expect(error?.message).toMatch(/underlying/);
  });

  it('rejects symbols with non A-Z0-9 characters', () => {
    const { policy, error } = parseBackingPolicy({ underlying: 'SOL-USD', leverage: 2, direction: 'long' });
    expect(policy).toBeUndefined();
    expect(error?.message).toMatch(/underlying/);
  });

  it('rejects underlying longer than 12 chars', () => {
    const { policy, error } = parseBackingPolicy({ underlying: 'ABCDEFGHIJKLM', leverage: 2, direction: 'long' });
    expect(policy).toBeUndefined();
    expect(error?.message).toMatch(/underlying/);
  });

  it('rejects underlying longer than 12 chars even if alnum-stripped to valid', () => {
    const { policy, error } = parseBackingPolicy({ underlying: 'SOL-USD-EXTRA', leverage: 2, direction: 'long' });
    expect(policy).toBeUndefined();
    expect(error?.message).toMatch(/underlying/);
  });

  it('rejects non-integer leverage (0.5)', () => {
    const { policy, error } = parseBackingPolicy({ underlying: 'SOL', leverage: 0.5, direction: 'long' });
    expect(policy).toBeUndefined();
    expect(error?.message).toMatch(/leverage/);
  });

  it('rejects leverage below the 1 floor', () => {
    const { policy, error } = parseBackingPolicy({ underlying: 'SOL', leverage: 0, direction: 'long' });
    expect(policy).toBeUndefined();
    expect(error?.message).toMatch(/leverage/);
  });

  it('rejects leverage above the 10 ceiling', () => {
    const { policy, error } = parseBackingPolicy({ underlying: 'SOL', leverage: 11, direction: 'long' });
    expect(policy).toBeUndefined();
    expect(error?.message).toMatch(/leverage/);
  });

  it('rejects string-typed leverage', () => {
    const { policy, error } = parseBackingPolicy({ underlying: 'SOL', leverage: '2', direction: 'long' });
    expect(policy).toBeUndefined();
    expect(error?.message).toMatch(/leverage/);
  });

  it('rejects direction other than long|short', () => {
    const { policy, error } = parseBackingPolicy({ underlying: 'SOL', leverage: 2, direction: 'LONG' });
    expect(policy).toBeUndefined();
    expect(error?.message).toMatch(/direction/);
  });
});

describe('parseBackingPolicy — quote no longer gates the backing policy', () => {
  // Quote resolution (SOL | USDC | custom quoteMint) moved into the tool
  // handler — Lane A shipped USDC/custom support, so parseBackingPolicy must
  // ignore quote fields entirely and only validate the backing triple.
  it('does NOT fail on a missing or non-USDC quote', () => {
    expect(parseBackingPolicy({}).error).toBeUndefined();
    expect(parseBackingPolicy({ quote: 'SOL' }).error).toBeUndefined();
    expect(parseBackingPolicy({ quote: 'USDC' }).error).toBeUndefined();
    expect(parseBackingPolicy({ quote: 42 }).error).toBeUndefined(); // non-string ignored
  });

  it('backing triple with quote=USDC parses the policy (quote handled by the handler)', () => {
    const { policy, error } = parseBackingPolicy({ underlying: 'SOL', leverage: 2, direction: 'long', quote: 'USDC' });
    expect(error).toBeUndefined();
    expect(policy).toEqual({ underlying: 'SOL', leverage: 2, direction: 'long', status: 'pending-keeper' });
  });
});
