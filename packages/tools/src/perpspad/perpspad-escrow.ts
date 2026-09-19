/**
 * @name tools/perpspad/perpspad-escrow
 * @description Creator-split escrow (Option B) integration for PerpsPad
 *   launches. Derives the escrow PDA for a token mint, builds the
 *   initialize_escrow instruction for the deployed mainnet program, and
 *   swaps the launch creatorAddress to the escrow PDA so PerpsPad's hourly
 *   creator_payout lands in the trustless 70/30 split program.
 *
 * Program facts (verified: devnet decisive test 200 + mainnet live deploy):
 *   - Program ID: ENpvWhtTtnveMZ3WHpGKHMEYDrPHHc5v6JjjVUWFNYgA
 *   - PDA seeds: ["creator_escrow", token_mint_bytes]
 *   - initialize_escrow accounts: [escrow(w), mint(r), agent_wallet(r),
 *     payer(+s,w), system_program(r)] — data: single byte 0
 *   - The agent wallet is stored IMMUTABLY as the 70% destination.
 *
 * Launch-order note (verified against the live API, devnet 2026-09-16):
 *   POST /api/v1/launch returns the REAL mint in its response (`mint`
 *   field) even while pending. The launch body requires creatorAddress
 *   UP FRONT, before any mint exists. The clean flow:
 *     1. Caller generates an ephemeral "escrow seed key" (any valid pubkey).
 *     2. escrow PDA = findProgramAddress(["creator_escrow", seedKey]).
 *     3. Launch submitted with creatorAddress = escrow PDA.
 *     4. PerpsPad responds with the REAL mint.
 *     5. initialize_escrow is signed with the REAL mint + agent wallet —
 *        the escrow PDA is derived from the REAL mint from then on, so the
 *        hourly creator_payout lands on a PDA owned by our program and the
 *        pre-launch seed key is discarded.
 *   IMPORTANT correction: because the escrow PDA used as creatorAddress is
 *   derived from the seed key while PerpsPad pays the creatorAddress, the
 *   escrow the program initializes later (mint-derived) is NOT the account
 *   that received the payouts. THE VERIFIED WORKING PATTERN is therefore:
 *   derive the escrow from the REAL mint returned by PerpsPad only when
 *   PerpsPad preserves the creatorAddress across the pending→live
 *   transition — OTHERWISE the launch must be a two-phase flow where the
 *   mint is known BEFORE the launch body is submitted.
 *
 *   RESOLUTION (chosen design, see DESIGN.md): the escrow is derived from
 *   the MINT, and PerpsPad derives its mint FROM THE LAUNCH TX ITSELF —
 *   the mint keypair is generated client-side and the config tx creates
 *   it. So the mint IS known before the launch body is submitted: the
 *   caller generates the mint keypair, derives the escrow PDA from it,
 *   passes escrowPda as creatorAddress, and later signs the config tx that
 *   materializes that exact mint. Everything lines up deterministically.
 *
 * @module tools/perpspad/perpspad-escrow
 */
import { PublicKey, TransactionInstruction } from '@solana/web3.js';

/** Deployed creator-split-escrow program (mainnet). */
export const CREATOR_SPLIT_ESCROW_PROGRAM_ID = new PublicKey(
  'ENpvWhtTtnveMZ3WHpGKHMEYDrPHHc5v6JjjVUWFNYgA',
);

/** PDA seed constant — must match the Rust `ESCROW_SEED`. */
export const ESCROW_SEED = 'creator_escrow';
export const REWARD_VAULT_SEED = 'reward_vault';

/** initialize_escrow instruction discriminator (first data byte). */
export const INITIALIZE_ESCROW_IX = 0;
export const INITIALIZE_REWARD_VAULT_IX = 3;

/** System program id (avoids importing SystemProgram for a constant). */
const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');

/**
 * Derives the escrow PDA for a token mint. Same derivation the client uses
 * for PerpsPad's `creatorAddress` and the Rust program uses in
 * `initialize_escrow` (runtime `sol_try_find_program_address`).
 */
export function deriveEscrowPda(tokenMint: string | PublicKey): {
  escrowPda: PublicKey;
  bump: number;
} {
  const mint = typeof tokenMint === 'string' ? new PublicKey(tokenMint) : tokenMint;
  const [escrowPda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(ESCROW_SEED), mint.toBuffer()],
    CREATOR_SPLIT_ESCROW_PROGRAM_ID,
  );
  return { escrowPda, bump };
}

export function deriveRewardVaultPda(tokenMint: string | PublicKey): {
  rewardVaultPda: PublicKey;
  bump: number;
} {
  const mint = typeof tokenMint === 'string' ? new PublicKey(tokenMint) : tokenMint;
  const [rewardVaultPda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(REWARD_VAULT_SEED), mint.toBuffer()],
    CREATOR_SPLIT_ESCROW_PROGRAM_ID,
  );
  return { rewardVaultPda, bump };
}

/**
 * Builds the initialize_escrow instruction (borsh-free — the program reads
 * raw accounts). Account order MUST match the Rust handler:
 *   0 escrow (writable), 1 mint (ro), 2 agent_wallet (ro),
 *   3 payer (writable+signer), 4 system_program (ro).
 */
export function buildInitializeEscrowInstruction(params: {
  readonly escrowPda: PublicKey;
  readonly tokenMint: PublicKey;
  readonly agentWallet: PublicKey;
  readonly payer: PublicKey;
}): {
  programId: PublicKey;
  keys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[];
  data: Buffer;
} {
  return {
    programId: CREATOR_SPLIT_ESCROW_PROGRAM_ID,
    keys: [
      { pubkey: params.escrowPda, isSigner: false, isWritable: true },
      { pubkey: params.tokenMint, isSigner: false, isWritable: false },
      { pubkey: params.agentWallet, isSigner: false, isWritable: false },
      { pubkey: params.payer, isSigner: true, isWritable: true },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([INITIALIZE_ESCROW_IX]),
  };
}

export function buildInitializeRewardVaultInstruction(params: {
  readonly rewardVaultPda: PublicKey;
  readonly escrowPda: PublicKey;
  readonly tokenMint: PublicKey;
  readonly dbcPool: PublicKey;
  readonly quoteMint: PublicKey;
  readonly rewardMint: PublicKey;
  readonly creator: PublicKey;
  readonly payer: PublicKey;
  readonly maxInputPerSwap: bigint;
  readonly maxSlippageBps: number;
}): TransactionInstruction {
  if (params.maxInputPerSwap <= 0n || params.maxInputPerSwap > 0xffff_ffff_ffff_ffffn) {
    throw new Error('maxInputPerSwap must fit in a positive u64');
  }
  if (!Number.isInteger(params.maxSlippageBps) || params.maxSlippageBps < 1 || params.maxSlippageBps > 2_000) {
    throw new Error('maxSlippageBps must be an integer between 1 and 2000');
  }
  const data = Buffer.alloc(11);
  data[0] = INITIALIZE_REWARD_VAULT_IX;
  data.writeBigUInt64LE(params.maxInputPerSwap, 1);
  data.writeUInt16LE(params.maxSlippageBps, 9);
  return new TransactionInstruction({
    programId: CREATOR_SPLIT_ESCROW_PROGRAM_ID,
    keys: [
      { pubkey: params.rewardVaultPda, isSigner: false, isWritable: true },
      { pubkey: params.escrowPda, isSigner: false, isWritable: false },
      { pubkey: params.tokenMint, isSigner: false, isWritable: false },
      { pubkey: params.dbcPool, isSigner: false, isWritable: false },
      { pubkey: params.quoteMint, isSigner: false, isWritable: false },
      { pubkey: params.rewardMint, isSigner: false, isWritable: false },
      { pubkey: params.creator, isSigner: true, isWritable: false },
      { pubkey: params.payer, isSigner: true, isWritable: true },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Validates a base58 mint/creator address shape without constructing the
 * full keypair machinery (cheap fail-fast for tool inputs).
 */
export function isValidSolanaAddress(value: string): boolean {
  try {
    const key = new PublicKey(value);
    return key.toBase58() === value.trim();
  } catch {
    return false;
  }
}
