import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import type { Program } from '@coral-xyz/anchor';
import { describe, expect, it } from 'vitest';
import {
  buildInstruction,
  encodeAdrenaLeverage,
} from './adrena-builder-core.js';

function emptyIx(): TransactionInstruction {
  return new TransactionInstruction({
    keys: [],
    programId: PublicKey.default,
    data: Buffer.alloc(0),
  });
}

describe('Adrena builder core', () => {
  it('encodes human leverage into Adrena BPS format', () => {
    expect(encodeAdrenaLeverage(1)).toBe(10_000);
    expect(encodeAdrenaLeverage(3)).toBe(30_000);
    expect(encodeAdrenaLeverage(100)).toBe(1_000_000);
  });

  it('prefers accountsPartial and omits null optional accounts', async () => {
    let receivedAccounts: Record<string, unknown> | undefined;
    const program = {
      methods: {
        openOrIncreasePositionLong: () => ({
          accounts: () => ({ instruction: async () => emptyIx() }),
          accountsPartial: (accounts: Record<string, unknown>) => {
            receivedAccounts = accounts;
            return { instruction: async () => emptyIx() };
          },
        }),
      },
    } as unknown as Program;

    await buildInstruction(program, 'openOrIncreasePositionLong', [], {
      owner: PublicKey.default,
      referrerProfile: null,
    });

    expect(receivedAccounts).toEqual({ owner: PublicKey.default });
  });

  it('retries with explicit nulls when an Anchor builder requires an optional account key', async () => {
    const calls: Record<string, unknown>[] = [];
    const program = {
      methods: {
        openOrIncreasePositionLong: () => ({
          accounts: (accounts: Record<string, unknown>) => {
            calls.push(accounts);
            if (!Object.prototype.hasOwnProperty.call(accounts, 'referrerProfile')) {
              throw new Error('referrerProfile not provided');
            }
            return { instruction: async () => emptyIx() };
          },
        }),
      },
    } as unknown as Program;

    await buildInstruction(program, 'openOrIncreasePositionLong', [], {
      owner: PublicKey.default,
      referrerProfile: null,
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ owner: PublicKey.default });
    expect(calls[1]).toEqual({ owner: PublicKey.default, referrerProfile: null });
  });
});
