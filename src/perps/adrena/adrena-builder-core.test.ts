import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import type { Program } from '@coral-xyz/anchor';
import { describe, expect, it } from 'vitest';
import {
  buildInstruction,
  encodeAdrenaLeverage,
} from './adrena-builder-core.js';
import { ADRENA_DEFAULT_REFERRER_PROFILE } from './adrena-constants.js';

function emptyIx(): TransactionInstruction {
  return new TransactionInstruction({
    keys: [],
    programId: PublicKey.default,
    data: Buffer.alloc(0),
  });
}

function ixWithKeys(keys: PublicKey[]): TransactionInstruction {
  return new TransactionInstruction({
    keys: keys.map(pubkey => ({
      pubkey,
      isSigner: false,
      isWritable: true,
    })),
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

  it('does not remove an arbitrary account at the referrerProfile IDL slot', async () => {
    const owner = new PublicKey('11111111111111111111111111111112');
    const referrer = new PublicKey('11111111111111111111111111111113');
    const program = {
      idl: {
        instructions: [{
          name: 'open_or_increase_position_short',
          accounts: [
            { name: 'owner' },
            { name: 'referrer_profile', optional: true },
          ],
        }],
      },
      methods: {
        openOrIncreasePositionShort: () => ({
          accounts: () => ({ instruction: async () => ixWithKeys([owner, referrer]) }),
          accountsPartial: () => ({ instruction: async () => ixWithKeys([owner, referrer]) }),
        }),
      },
    } as unknown as Program;

    const ix = await buildInstruction(program, 'openOrIncreasePositionShort', [], {
      owner,
      referrerProfile: null,
    });

    expect(ix.keys.map(key => key.pubkey.toBase58())).toEqual([owner.toBase58(), referrer.toBase58()]);
  });

  it('keeps an explicit referrerProfile meta when the caller provides one', async () => {
    const owner = new PublicKey('11111111111111111111111111111112');
    const referrer = new PublicKey('11111111111111111111111111111113');
    const program = {
      idl: {
        instructions: [{
          name: 'open_or_increase_position_short',
          accounts: [
            { name: 'owner' },
            { name: 'referrer_profile', optional: true },
          ],
        }],
      },
      methods: {
        openOrIncreasePositionShort: () => ({
          accounts: () => ({ instruction: async () => ixWithKeys([owner, referrer]) }),
          accountsPartial: () => ({ instruction: async () => ixWithKeys([owner, referrer]) }),
        }),
      },
    } as unknown as Program;

    const ix = await buildInstruction(program, 'openOrIncreasePositionShort', [], {
      owner,
      referrerProfile: referrer,
    });

    expect(ix.keys.map(key => key.pubkey.toBase58())).toEqual([owner.toBase58(), referrer.toBase58()]);
  });

  it('removes Adrena default referrer profile when Anchor materializes it for a null referrer', async () => {
    const owner = new PublicKey('11111111111111111111111111111112');
    const userProfile = new PublicKey('11111111111111111111111111111114');
    const defaultReferrer = new PublicKey(ADRENA_DEFAULT_REFERRER_PROFILE);
    const program = {
      idl: {
        instructions: [{
          name: 'open_or_increase_position_short',
          accounts: [
            { name: 'owner' },
            { name: 'payer' },
            { name: 'user_profile', optional: true },
            { name: 'referrer_profile', optional: true },
          ],
        }],
      },
      methods: {
        openOrIncreasePositionShort: () => ({
          accounts: () => ({ instruction: async () => ixWithKeys([owner, userProfile, defaultReferrer]) }),
          accountsPartial: () => ({ instruction: async () => ixWithKeys([owner, userProfile, defaultReferrer]) }),
        }),
      },
    } as unknown as Program;

    const ix = await buildInstruction(program, 'openOrIncreasePositionShort', [], {
      owner,
      userProfile,
      referrerProfile: null,
    });

    expect(ix.keys.map(key => key.pubkey.toBase58())).toEqual([owner.toBase58(), userProfile.toBase58()]);
  });

  it('keeps the first Adrena default-referrer pubkey as cortex and removes only the duplicate referrer', async () => {
    const owner = new PublicKey('11111111111111111111111111111112');
    const fundingAccount = new PublicKey('11111111111111111111111111111113');
    const userProfile = new PublicKey('11111111111111111111111111111114');
    const cortexAndDefaultReferrer = new PublicKey(ADRENA_DEFAULT_REFERRER_PROFILE);
    const program = {
      idl: {
        instructions: [{
          name: 'open_or_increase_position_short',
          accounts: [
            { name: 'owner' },
            { name: 'funding_account' },
            { name: 'cortex' },
            { name: 'user_profile', optional: true },
            { name: 'referrer_profile', optional: true },
          ],
        }],
      },
      methods: {
        openOrIncreasePositionShort: () => ({
          accounts: () => ({
            instruction: async () => ixWithKeys([
              owner,
              fundingAccount,
              cortexAndDefaultReferrer,
              userProfile,
              cortexAndDefaultReferrer,
            ]),
          }),
          accountsPartial: () => ({
            instruction: async () => ixWithKeys([
              owner,
              fundingAccount,
              cortexAndDefaultReferrer,
              userProfile,
              cortexAndDefaultReferrer,
            ]),
          }),
        }),
      },
    } as unknown as Program;

    const ix = await buildInstruction(program, 'openOrIncreasePositionShort', [], {
      owner,
      fundingAccount,
      cortex: cortexAndDefaultReferrer,
      userProfile,
      referrerProfile: null,
    });

    expect(ix.keys.map(key => key.pubkey.toBase58())).toEqual([
      owner.toBase58(),
      fundingAccount.toBase58(),
      cortexAndDefaultReferrer.toBase58(),
      userProfile.toBase58(),
    ]);
  });
});
