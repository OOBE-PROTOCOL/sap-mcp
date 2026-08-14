import { describe, expect, it, vi } from 'vitest';
import {
  AddressLookupTableAccount,
  Keypair,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  createTransferCheckedInstruction,
  createTransferInstruction,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import {
  assertTransactionPolicy,
  describeTransaction,
  estimateExplicitApprovalRisks,
  estimateTokenTransfers,
} from './transaction-tools.js';
import type { SapMcpContext } from '../core/types.js';

describe('transaction value estimation', () => {
  it('detects legacy SPL token transfers controlled by the signer', () => {
    const owner = Keypair.generate();
    const tx = new Transaction().add(
      createTransferInstruction(
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
        owner.publicKey,
        1_234n,
      )
    );

    const transfers = estimateTokenTransfers(tx, owner.publicKey);

    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toMatchObject({
      instruction: 'transfer',
      amount: '1234',
      authority: owner.publicKey.toBase58(),
    });
  });

  it('detects versioned Token-2022 checked transfers controlled by the signer', () => {
    const owner = Keypair.generate();
    const mint = Keypair.generate().publicKey;
    const instruction = createTransferCheckedInstruction(
      Keypair.generate().publicKey,
      mint,
      Keypair.generate().publicKey,
      owner.publicKey,
      50_000n,
      6,
      [],
      TOKEN_2022_PROGRAM_ID,
    );
    const message = new TransactionMessage({
      payerKey: owner.publicKey,
      recentBlockhash: '11111111111111111111111111111111',
      instructions: [instruction],
    }).compileToV0Message();
    const tx = new VersionedTransaction(message);

    const transfers = estimateTokenTransfers(tx, owner.publicKey);

    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toMatchObject({
      instruction: 'transferChecked',
      amount: '50000',
      mint: mint.toBase58(),
      authority: owner.publicKey.toBase58(),
      decimals: 6,
      programId: TOKEN_2022_PROGRAM_ID.toBase58(),
    });
  });

  it('surfaces token movement in transaction previews', () => {
    const owner = Keypair.generate();
    const tx = new Transaction().add(
      createTransferInstruction(
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
        owner.publicKey,
        99n,
      )
    );

    const preview = describeTransaction(tx);

    expect(preview.nativeTransferSol).toBe(0);
    expect(preview.tokenTransferCount).toBe(1);
    expect(preview.tokenTransfers[0]?.amount).toBe('99');
  });

  it('blocks token transfers before policy can treat them as zero-SOL transactions', async () => {
    const owner = Keypair.generate();
    const tx = new Transaction().add(
      createTransferInstruction(
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
        owner.publicKey,
        1n,
      )
    );
    const context = {
      policyEngine: {
        checkPermission: vi.fn(async () => ({ allowed: true })),
      },
    } as unknown as SapMcpContext;

    await expect(assertTransactionPolicy(context, tx, owner.publicKey)).rejects.toThrow(/token transfer requires explicit approval/i);
    expect(context.policyEngine.checkPermission).not.toHaveBeenCalled();
  });

  it('requires explicit approval for non-allowlisted programs that touch the signer', async () => {
    const owner = Keypair.generate();
    const tx = new Transaction().add(
      new TransactionInstruction({
        programId: Keypair.generate().publicKey,
        keys: [{ pubkey: owner.publicKey, isSigner: true, isWritable: true }],
        data: Buffer.alloc(0),
      })
    );
    const context = {
      policyEngine: {
        checkPermission: vi.fn(async () => ({ allowed: true })),
      },
    } as unknown as SapMcpContext;

    await expect(assertTransactionPolicy(context, tx, owner.publicKey)).rejects.toThrow(/explicit approval/i);
    expect(context.policyEngine.checkPermission).not.toHaveBeenCalled();
  });

  it('allows the configured SAP program for zero-value SDK metadata writes', async () => {
    const owner = Keypair.generate();
    const sapProgramId = Keypair.generate().publicKey;
    const tx = new Transaction().add(
      new TransactionInstruction({
        programId: sapProgramId,
        keys: [{ pubkey: owner.publicKey, isSigner: true, isWritable: true }],
        data: Buffer.alloc(0),
      })
    );

    const risks = estimateExplicitApprovalRisks(
      tx,
      owner.publicKey,
      { config: { programId: sapProgramId.toBase58() } },
    );

    expect(risks).toHaveLength(0);
  });

  it('requires explicit approval for versioned transactions with unresolved address lookup tables', async () => {
    const owner = Keypair.generate();
    const lookedUpAccount = Keypair.generate().publicKey;
    const lookupTable = new AddressLookupTableAccount({
      key: Keypair.generate().publicKey,
      state: {
        deactivationSlot: BigInt('0xffffffffffffffff'),
        lastExtendedSlot: 0,
        lastExtendedSlotStartIndex: 0,
        authority: owner.publicKey,
        addresses: [lookedUpAccount],
      },
    });
    const instruction = new TransactionInstruction({
      programId: sapProgramIdForTest(),
      keys: [{ pubkey: lookedUpAccount, isSigner: false, isWritable: true }],
      data: Buffer.alloc(0),
    });
    const message = new TransactionMessage({
      payerKey: owner.publicKey,
      recentBlockhash: '11111111111111111111111111111111',
      instructions: [instruction],
    }).compileToV0Message([lookupTable]);
    const tx = new VersionedTransaction(message);

    const risks = estimateExplicitApprovalRisks(tx, owner.publicKey);

    expect(risks).toEqual([
      expect.objectContaining({
        kind: 'addressLookupTable',
      }),
    ]);
  });
});

function sapProgramIdForTest() {
  return Keypair.generate().publicKey;
}
