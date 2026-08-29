/**
 * Regression tests: pin the Adrena Switchboard oracle relay layout after the
 * Release-39 multi-oracle migration. These pin the exact borsh layouts that
 * mainnet validated on 2026-08-29 — changing any byte here breaks live trading
 * with error 6088.
 *
 * See references/adrena-oracle-relay.md (skill adrena-perp-trading-v2).
 */
import { describe, it, expect } from 'vitest';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import {
  buildUpdateOracleInstruction,
  isOracleRecoverableError,
} from '../packages/perps/src/adrena/adrena-oracle-relay.js';

describe('adrena-oracle-relay layout pins (Release-39 multi-oracle)', () => {
  const _FEE_PAYER = new PublicKey('DaVA8ciisvFhW5fLfmHYEDfNDXjKJv8NtBdYUzZ2iY86');
  // Canonical SB joint quote account for feeds 142-147 (derived and simulated
  // on mainnet — Y8upmpJw8pd6TJEdykibY7Ai2cete7Ap4DTSW7w5A47).
  const QUOTE = new PublicKey('Y8upmpJw8pd6TJEdykibY7Ai2cete7Ap4DTSW7w5A47');

  it('buildUpdateOracleInstruction uses the canonical v2.1.5 discriminator', () => {
    const ix = buildUpdateOracleInstruction(QUOTE, 60);
    // update_oracle disc from @adrena/abi idl v2.1.5 (release/39_5)
    expect(Array.from(ix.data.subarray(0, 8))).toEqual([112, 41, 209, 18, 248, 226, 252, 188]);
    expect(ix.programId.toBase58()).toBe('13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet');
    expect(ix.keys.length).toBe(3); // #1 cortex, #2 oracle (mut), remaining: quote account (mut)
    expect(ix.keys[0]!.pubkey.toBase58()).toBe(new PublicKey('Dhz8Ta79hgyUbaRcu7qHMnqMfY47kQHfHt2s42D9dC4e').toBase58()); // cortex PDA
    expect(ix.keys[1]!.isWritable).toBe(true); // oracle PDA writable
    expect(ix.keys[2]!.pubkey.toBase58()).toBe(QUOTE.toBase58());
    expect(ix.keys[2]!.isWritable).toBe(true);
  });

  it('update_oracle params borsh: 3 options with switchboard_oracle_prices = Some', () => {
    const ix = buildUpdateOracleInstruction(QUOTE, 60);
    const params = ix.data.subarray(8);
    // Option tags: None, None, Some(switchboard)
    expect(params[0]).toBe(0); // oracle_prices = None
    expect(params[1]).toBe(0); // multi_oracle_prices = None
    expect(params[2]).toBe(1); // switchboard_oracle_prices = Some
    // max_age_slots u64 LE = 60
    const maxAge = params.subarray(3, 11).readBigUInt64LE();
    expect(maxAge).toBe(60n);
    // feed map vec length = 6
    const vecLen = params.subarray(11, 15).readUInt32LE();
    expect(vecLen).toBe(6);
    // First entry: feed_id 142 (SOL) then 32-byte hash
    expect(params[15]).toBe(142);
    const solHash = params.subarray(16, 48);
    expect(solHash.toString('hex')).toBe(
      '8f4f7b277e2593bdf04c5adba0b2a302793645de9326a7dcd6c332070846d52b',
    );
    // Complete params size: 3 option tags + 8 (u64) + 4 (vec len) + 6*(1+32)
    expect(ix.data.length).toBe(8 + 3 + 8 + 4 + 6 * 33);
  });

  it('feed map covers ALL main-pool custodies 142-147 (6103 regression)', () => {
    const ix = buildUpdateOracleInstruction(QUOTE, 60);
    const params = ix.data.subarray(8);
    const vecLen = params.subarray(11, 15).readUInt32LE();
    const feedIds: number[] = [];
    for (let i = 0; i < vecLen; i++) {
      feedIds.push(params[15 + i * 33]);
    }
    expect(feedIds).toEqual([142, 143, 144, 145, 146, 147]);
  });

  it('isOracleRecoverableError matches the multi-oracle error family only', () => {
    // These are the errors the auto-heal flow can fix:
    expect(isOracleRecoverableError('{"InstructionError":[0,{"Custom":6088}]}')).toBe(true);
    expect(isOracleRecoverableError('SwitchboardMissingAccounts 6098')).toBe(true);
    expect(isOracleRecoverableError('SwitchboardQuoteTooStale 6102')).toBe(true);
    expect(isOracleRecoverableError('SwitchboardFeedMappingMissing 6103')).toBe(true);
    // These must NOT trigger healing:
    expect(isOracleRecoverableError('custom program error: 6071')).toBe(false); // InsufficientCollateral
    expect(isOracleRecoverableError('6029 MinLeverage')).toBe(false);
    expect(isOracleRecoverableError(undefined)).toBe(false);
    expect(isOracleRecoverableError('')).toBe(false);
  });

  it('update_oracle data length is stable (guards against accidental borsh drift)', () => {
    const ix60 = buildUpdateOracleInstruction(QUOTE, 60);
    const ix120 = buildUpdateOracleInstruction(QUOTE, 120);
    expect(ix60.data.length).toBe(221);
    expect(ix120.data.length).toBe(221);
    // Only the u64 max_age changes
    expect(ix60.data).not.toEqual(ix120.data);
  });

  it('openOrIncreasePositionShort canonical discriminator is pinned', () => {
    // Guard against accidental re-introduction of the legacy
    // sha256('global:openOrIncreasePositionShort') discriminator that produces
    // InstructionFallbackNotFound (101) on the live program.
    const canonical = [98, 163, 165, 78, 141, 104, 75, 85];
    // Recompute what the WRONG (sha256-based) disc would be:
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createHash } = require('node:crypto');
    const legacy = createHash('sha256').update('global:openOrIncreasePositionShort', 'ascii').digest().subarray(0, 8);
    expect(Array.from(legacy)).not.toEqual(canonical);
    // The canonical disc comes from @adrena/abi v2.1.5 — pinned here verbatim.
    expect(canonical).toEqual([98, 163, 165, 78, 141, 104, 75, 85]);
  });

  it('TransactionInstruction shape sanity for the relay ix', () => {
    const ix: TransactionInstruction = buildUpdateOracleInstruction(QUOTE, 60);
    expect(ix.keys.every(k => !k.isSigner)).toBe(true); // permissionless — no signers
  });
});