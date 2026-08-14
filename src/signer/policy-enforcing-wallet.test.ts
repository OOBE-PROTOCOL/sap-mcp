/**
 * @file src/signer/policy-enforcing-wallet.test.ts
 * @description Unit tests for the PolicyEnforcingWallet spending-limit interception.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { createTransferInstruction } from '@solana/spl-token';
import { PolicyEnforcingWallet } from './policy-enforcing-wallet.js';
import type { SignerWallet } from './policy-enforcing-wallet.js';

function makeTransferTx(from: PublicKey, amountSol: number): Transaction {
  const tx = new Transaction();
  tx.add(
    SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: Keypair.generate().publicKey,
      lamports: Math.round(amountSol * LAMPORTS_PER_SOL),
    })
  );
  return tx;
}

function makeSplTransferTx(owner: PublicKey): Transaction {
  const tx = new Transaction();
  tx.add(
    createTransferInstruction(
      Keypair.generate().publicKey,
      Keypair.generate().publicKey,
      owner,
      1_000n,
    )
  );
  return tx;
}

function fakeSignerWallet(publicKey: PublicKey): SignerWallet {
  return {
    publicKey,
    signTransaction: vi.fn(async (tx: Transaction) => tx) as unknown as SignerWallet['signTransaction'],
    signAllTransactions: vi.fn(async (txs: Transaction[]) => txs) as unknown as SignerWallet['signAllTransactions'],
  };
}

function denyPolicy() {
  return {
    checkPermission: vi.fn(async () => ({ allowed: false, reason: 'over limit' })),
  } as unknown as import('../policy/policy-engine.js').PolicyEngine;
}

function allowPolicy() {
  return {
    checkPermission: vi.fn(async () => ({ allowed: true })),
  } as unknown as import('../policy/policy-engine.js').PolicyEngine;
}

describe('PolicyEnforcingWallet', () => {
  it('signs without policy engine (delegated/hosted passthrough)', async () => {
    const kp = Keypair.generate();
    const wrapped = fakeSignerWallet(kp.publicKey);
    const wallet = new PolicyEnforcingWallet(wrapped);
    const tx = makeTransferTx(kp.publicKey, 5);

    const signed = await wallet.signTransaction(tx);
    expect(signed).toBe(tx);
    expect(wrapped.signTransaction).toHaveBeenCalledOnce();
  });

  it('blocks signing when the policy engine denies the SOL amount', async () => {
    const kp = Keypair.generate();
    const wrapped = fakeSignerWallet(kp.publicKey);
    const wallet = new PolicyEnforcingWallet(wrapped, denyPolicy());
    const tx = makeTransferTx(kp.publicKey, 5);

    await expect(wallet.signTransaction(tx)).rejects.toThrow(/over limit/);
    expect(wrapped.signTransaction).not.toHaveBeenCalled();
  });

  it('allows signing when the policy engine approves', async () => {
    const kp = Keypair.generate();
    const wrapped = fakeSignerWallet(kp.publicKey);
    const wallet = new PolicyEnforcingWallet(wrapped, allowPolicy());
    const tx = makeTransferTx(kp.publicKey, 0.5);

    const signed = await wallet.signTransaction(tx);
    expect(signed).toBe(tx);
    expect(wrapped.signTransaction).toHaveBeenCalledOnce();
  });

  it('skips the policy lookup for zero-SOL transactions', async () => {
    const kp = Keypair.generate();
    const wrapped = fakeSignerWallet(kp.publicKey);
    const policy = allowPolicy();
    const wallet = new PolicyEnforcingWallet(wrapped, policy);
    // A transaction with no native transfer (empty tx) must not trigger a lookup.
    const tx = new Transaction();

    const signed = await wallet.signTransaction(tx);
    expect(signed).toBe(tx);
    expect(policy.checkPermission).not.toHaveBeenCalled();
  });

  it('blocks SPL token transfers even when no native SOL leaves the signer', async () => {
    const kp = Keypair.generate();
    const wrapped = fakeSignerWallet(kp.publicKey);
    const policy = allowPolicy();
    const wallet = new PolicyEnforcingWallet(wrapped, policy);
    const tx = makeSplTransferTx(kp.publicKey);

    await expect(wallet.signTransaction(tx)).rejects.toThrow(/token transfer requires explicit approval/i);
    expect(policy.checkPermission).not.toHaveBeenCalled();
    expect(wrapped.signTransaction).not.toHaveBeenCalled();
  });

  it('blocks non-allowlisted signer-touching programs even when native SOL is zero', async () => {
    const kp = Keypair.generate();
    const wrapped = fakeSignerWallet(kp.publicKey);
    const wallet = new PolicyEnforcingWallet(wrapped, allowPolicy());
    const tx = new Transaction().add(
      new TransactionInstruction({
        programId: Keypair.generate().publicKey,
        keys: [{ pubkey: kp.publicKey, isSigner: true, isWritable: true }],
        data: Buffer.alloc(0),
      })
    );

    await expect(wallet.signTransaction(tx)).rejects.toThrow(/explicit approval/i);
    expect(wrapped.signTransaction).not.toHaveBeenCalled();
  });

  it('enforces policy on every transaction in signAllTransactions', async () => {
    const kp = Keypair.generate();
    const wrapped = fakeSignerWallet(kp.publicKey);
    const wallet = new PolicyEnforcingWallet(wrapped, denyPolicy());
    const txs = [makeTransferTx(kp.publicKey, 1), makeTransferTx(kp.publicKey, 2)];

    await expect(wallet.signAllTransactions(txs)).rejects.toThrow(/over limit/);
    expect(wrapped.signAllTransactions).not.toHaveBeenCalled();
  });
});
