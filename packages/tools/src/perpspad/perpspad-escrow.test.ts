/**
 * Unit tests for the escrow integration module (PDA derivation + ix shape).
 * The expected PDA values were computed with the standalone devnet flow
 * (tests/devnet-init.ts) — the SAME derivation the deployed program uses.
 */
import { describe, expect, it } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import {
  CREATOR_SPLIT_ESCROW_PROGRAM_ID,
  ESCROW_SEED,
  REWARD_VAULT_SEED,
  deriveEscrowPda,
  deriveRewardVaultPda,
  buildInitializeEscrowInstruction,
  buildInitializeRewardVaultInstruction,
  isValidSolanaAddress,
} from './perpspad-escrow.js';

// Cross-verified with the derivation script: the SAME mint under the
// MAINNET program yields 6phMHCwjTK2ep7QgR3S3uk8kgQ1b2teZcT3WWTXnaNEC
// (bump 255). The devnet known pair (FmwHXw6…C3j) matches only under the
// devnet program 6R8W5q… — proving the derivation math itself is identical
// to the runtime syscall; only the program id differs per network.
const MAINNET_PROGRAM_ID = 'ENpvWhtTtnveMZ3WHpGKHMEYDrPHHc5v6JjjVUWFNYgA';
const TEST_MINT = 'BCaPswCY66X8ih1KL3EAMetxE87brGxcgN8jbbAHAsna';
const EXPECTED_MAINNET_ESCROW = '6phMHCwjTK2ep7QgR3S3uk8kgQ1b2teZcT3WWTXnaNEC';

describe('perpspad-escrow', () => {
  it('derives the escrow PDA exactly as the deployed mainnet program does', () => {
    const { escrowPda, bump } = deriveEscrowPda(TEST_MINT);
    expect(escrowPda.toBase58()).to.equal(EXPECTED_MAINNET_ESCROW);
    expect(bump).to.equal(255);
  });

  it('program ID constant matches the mainnet deployment', () => {
    expect(CREATOR_SPLIT_ESCROW_PROGRAM_ID.toBase58()).to.equal(MAINNET_PROGRAM_ID);
  });

  it('derives deterministically from string or PublicKey input', () => {
    const a = deriveEscrowPda(TEST_MINT);
    const b = deriveEscrowPda(new PublicKey(TEST_MINT));
    expect(a.escrowPda.toBase58()).to.equal(b.escrowPda.toBase58());
    expect(a.bump).to.equal(b.bump);
  });

  it('PDA is program-derived (off-curve) for the right program', () => {
    const { escrowPda } = deriveEscrowPda(TEST_MINT);
    const onCurve = PublicKey.isOnCurve(escrowPda.toBytes());
    expect(onCurve).to.equal(false);
  });

  it('buildInitializeEscrowInstruction matches the Rust account order', () => {
    const mint = new PublicKey(TEST_MINT);
    const { escrowPda } = deriveEscrowPda(TEST_MINT);
    const agent = PublicKey.unique();
    const payer = PublicKey.unique();

    const ix = buildInitializeEscrowInstruction({
      escrowPda,
      tokenMint: mint,
      agentWallet: agent,
      payer,
    });

    expect(ix.programId.toBase58()).to.equal(CREATOR_SPLIT_ESCROW_PROGRAM_ID.toBase58());
    expect(ix.keys).to.have.length(5);
    // [escrow(w), mint(ro), agent(ro), payer(w+s), system(ro)]
    expect(ix.keys[0]).to.deep.equal({ pubkey: escrowPda, isSigner: false, isWritable: true });
    expect(ix.keys[1]).to.deep.equal({ pubkey: mint, isSigner: false, isWritable: false });
    expect(ix.keys[2]).to.deep.equal({ pubkey: agent, isSigner: false, isWritable: false });
    expect(ix.keys[3]).to.deep.equal({ pubkey: payer, isSigner: true, isWritable: true });
    expect(ix.keys[4].pubkey.toBase58()).to.equal('11111111111111111111111111111111');
    // initialize_escrow discriminator byte
    expect(ix.data).to.deep.equal(Buffer.from([0]));
  });

  it('escrow seed constant matches the Rust program', () => {
    expect(ESCROW_SEED).to.equal('creator_escrow');
  });

  it('builds the immutable Market Rewards vault instruction contract', () => {
    const mint = new PublicKey(TEST_MINT);
    const { escrowPda } = deriveEscrowPda(mint);
    const { rewardVaultPda } = deriveRewardVaultPda(mint);
    const pool = PublicKey.unique();
    const quoteMint = PublicKey.unique();
    const rewardMint = PublicKey.unique();
    const creator = PublicKey.unique();
    const executor = PublicKey.unique();
    const payer = PublicKey.unique();
    const ix = buildInitializeRewardVaultInstruction({
      rewardVaultPda, escrowPda, tokenMint: mint, dbcPool: pool, quoteMint,
      rewardMint, creator, payer, maxInputPerSwap: 1_234_567n, maxSlippageBps: 250,
      executor,
    });

    expect(REWARD_VAULT_SEED).to.equal('reward_vault');
    expect(PublicKey.isOnCurve(rewardVaultPda.toBytes())).to.equal(false);
    expect(ix.keys.map(({ pubkey }) => pubkey.toBase58())).to.deep.equal([
      rewardVaultPda, escrowPda, mint, pool, quoteMint, rewardMint, creator, executor, payer,
      new PublicKey('11111111111111111111111111111111'),
    ].map((key) => key.toBase58()));
    expect(ix.keys[6]).to.deep.equal({ pubkey: creator, isSigner: true, isWritable: false });
    expect(ix.keys[8]).to.deep.equal({ pubkey: payer, isSigner: true, isWritable: true });
    expect(ix.data[0]).to.equal(3);
    expect(ix.data.readBigUInt64LE(1)).to.equal(1_234_567n);
    expect(ix.data.readUInt16LE(9)).to.equal(250);
  });

  it('rejects unsafe Market Rewards limits before building', () => {
    const mint = new PublicKey(TEST_MINT);
    const { escrowPda } = deriveEscrowPda(mint);
    const { rewardVaultPda } = deriveRewardVaultPda(mint);
    const key = PublicKey.unique();
    expect(() => buildInitializeRewardVaultInstruction({
      rewardVaultPda, escrowPda, tokenMint: mint, dbcPool: key, quoteMint: key,
      rewardMint: key, creator: key, payer: key, maxInputPerSwap: 0n, maxSlippageBps: 250,
      executor: PublicKey.unique(),
    })).to.throw(/positive u64/);
  });

  it('isValidSolanaAddress accepts real addresses and rejects junk', () => {
    expect(isValidSolanaAddress(TEST_MINT)).to.equal(true);
    expect(isValidSolanaAddress('BiHdXQqNXTgMrNikZxw4CMnD1z1t6K2tmtwyXgSWSKqR')).to.equal(true);
    expect(isValidSolanaAddress('not-a-real-address-123456789012345678')).to.equal(false);
    expect(isValidSolanaAddress('')).to.equal(false);
    // case-sensitive base58: uppercase-mangled input must fail
    expect(isValidSolanaAddress(TEST_MINT.toLowerCase())).to.equal(false);
  });
});
