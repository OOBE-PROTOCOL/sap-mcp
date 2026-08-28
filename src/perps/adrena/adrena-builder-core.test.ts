import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import type { Program } from '@coral-xyz/anchor';
import { describe, expect, it } from 'vitest';
import {
  buildInstruction,
  buildResult,
  decodeAdrenaLimitedString,
  describeAdrenaSimulationFailure,
  encodeAdrenaLeverage,
  assertAdrenaSimulationPassed,
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

  it('decodes Adrena LimitedString account fields', () => {
    expect(decodeAdrenaLimitedString({
      value: [87, 66, 84, 67, 85, 83, 68, 0, 0],
      length: 7,
    })).toBe('WBTCUSD');
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
            { name: 'funding_account', writable: true },
            { name: 'cortex' },
            { name: 'user_profile', writable: true, optional: true },
            { name: 'referrer_profile', writable: true, optional: true },
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
    expect(ix.keys.map(key => key.isWritable)).toEqual([false, true, true, true]);
  });

  it('marks Adrena open-position cortex writable when it is the only default-referrer pubkey left', async () => {
    const owner = new PublicKey('11111111111111111111111111111112');
    const payer = owner;
    const fundingAccount = new PublicKey('11111111111111111111111111111113');
    const oracle = new PublicKey('11111111111111111111111111111114');
    const custody = new PublicKey('11111111111111111111111111111115');
    const collateralCustody = new PublicKey('11111111111111111111111111111116');
    const collateralCustodyTokenAccount = new PublicKey('11111111111111111111111111111117');
    const transferAuthority = new PublicKey('11111111111111111111111111111118');
    const cortex = new PublicKey(ADRENA_DEFAULT_REFERRER_PROFILE);
    const pool = new PublicKey('11111111111111111111111111111119');
    const position = new PublicKey('1111111111111111111111111111111A');
    const systemProgram = new PublicKey('11111111111111111111111111111111');
    const tokenProgram = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    const adrenaProgram = new PublicKey('13gDzEXCdocbj8jSqy5beXCnLff8Z3SWzvkD7oqLZ9t6');
    const userProfile = new PublicKey('1111111111111111111111111111111B');
    const program = {
      idl: {
        instructions: [{
          name: 'open_or_increase_position_short',
          accounts: [
            { name: 'owner', signer: true },
            { name: 'payer', writable: true, signer: true },
            { name: 'funding_account', writable: true },
            { name: 'oracle', writable: true },
            { name: 'custody', writable: true },
            { name: 'collateral_custody', writable: true },
            { name: 'collateral_custody_token_account', writable: true },
            { name: 'transfer_authority' },
            { name: 'cortex' },
            { name: 'pool', writable: true },
            { name: 'position', writable: true },
            { name: 'system_program' },
            { name: 'token_program' },
            { name: 'adrena_program' },
            { name: 'user_profile', writable: true, optional: true },
            { name: 'referrer_profile', writable: true, optional: true },
          ],
        }],
      },
      methods: {
        openOrIncreasePositionShort: () => ({
          accounts: () => ({
            instruction: async () => ixWithKeys([
              owner,
              payer,
              fundingAccount,
              oracle,
              custody,
              collateralCustody,
              collateralCustodyTokenAccount,
              transferAuthority,
              cortex,
              pool,
              position,
              systemProgram,
              tokenProgram,
              adrenaProgram,
              userProfile,
            ]),
          }),
          accountsPartial: () => ({
            instruction: async () => ixWithKeys([
              owner,
              payer,
              fundingAccount,
              oracle,
              custody,
              collateralCustody,
              collateralCustodyTokenAccount,
              transferAuthority,
              cortex,
              pool,
              position,
              systemProgram,
              tokenProgram,
              adrenaProgram,
              userProfile,
            ]),
          }),
        }),
      },
    } as unknown as Program;

    const ix = await buildInstruction(program, 'openOrIncreasePositionShort', [], {
      owner,
      payer,
      fundingAccount,
      oracle,
      custody,
      collateralCustody,
      collateralCustodyTokenAccount,
      transferAuthority,
      cortex,
      pool,
      position,
      systemProgram,
      tokenProgram,
      adrenaProgram,
      userProfile,
      referrerProfile: null,
    });

    const cortexMeta = ix.keys.find(key => key.pubkey.equals(cortex));
    expect(cortexMeta?.isWritable).toBe(true);
    expect(ix.keys.map(key => key.isWritable)).toEqual([
      false,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      true,
      true,
      true,
      false,
      false,
      false,
      true,
    ]);
  });

  it('describes MissingOraclePrice simulation failures before approval', () => {
    const diagnostic = describeAdrenaSimulationFailure({
      simulationError: '{"InstructionError":[2,{"Custom":6088}]}',
      simulationLogs: [
        'Program log: OpenPositionShort: collateral=30000000, leverage=20000',
        'Program log: AnchorError occurred. Error Code: MissingOraclePrice. Error Number: 6088.',
      ],
      simulationUnitsConsumed: 130_042,
    }, ['openOrIncreasePositionShort']);

    expect(diagnostic).toContain('MissingOraclePrice (6088)');
    expect(diagnostic).toContain('Do not show an approval');
  });

  it('blocks unsigned transaction results when simulation already failed', () => {
    expect(() => assertAdrenaSimulationPassed({
      simulationError: '{"InstructionError":[2,{"Custom":6088}]}',
      simulationLogs: ['Program log: Error Number: 6088. Error Message: Missing at least one oracle price.'],
    }, ['openOrIncreasePositionShort'])).toThrow(/MissingOraclePrice \(6088\)/);
  });

  it('includes successful simulation metadata in unsigned transaction results', () => {
    const result = buildResult(
      'AQID',
      PublicKey.default,
      ['swap'],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        simulationLogs: ['Program log: ok'],
        simulationUnitsConsumed: 11_100,
        priorityFeeMicroLamports: 5_000,
      },
    );

    expect(result.simulationLogs).toEqual(['Program log: ok']);
    expect(result.simulationUnitsConsumed).toBe(11_100);
    expect(result.priorityFeeMicroLamports).toBe(5_000);
  });
});
