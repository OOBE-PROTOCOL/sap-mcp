/**
 * @name tools/perpspad/dbc-launch
 * @description Direct Meteora DBC launch builder (Option 2): bypasses the
 *   PerpsPad API in the critical path by building create_config +
 *   initialize_virtual_pool_with_spl_token with caller-visible ephemeral
 *   keypairs. fee_claimer = escrow PDA (70/30 split via the creator-split
 *   escrow program's future claim_and_split CPI). The ephemeral secrets
 *   never leave the gateway process and control nothing of value.
 *
 * @module tools/perpspad/dbc-launch
 */

import { Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { createHash } from 'crypto';

/** Meteora DBC program (mainnet). */
export const DBC_PROGRAM_ID = new PublicKey('dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN');

/** PerpsPad's event_authority (copied from their live config tx — program-level constant). */
export const DBC_EVENT_AUTHORITY = new PublicKey('8Ks12pbrD6PXxfty1hVQiE9sc289zgU1zHkvXhrSdriF');

/** Wrapped SOL mint (quote token for crypto-perp launches). */
export const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

/** Metaplex Token Metadata program (mint metadata account owner). */
export const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

/** SPL Token (legacy) program — the base token is a standard SPL mint. */
export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

/** create_config anchor discriminator (sighash "global:create_config", verified against the captured tx). */
export const CREATE_CONFIG_DISCRIMINATOR = Buffer.from('c9cff3724b6f2fbd', 'hex');

/** initialize_virtual_pool_with_spl_token discriminator — sighash("global","initialize_virtual_pool_with_spl_token"). */
export const DBC_INIT_POOL_DISCRIMINATOR = anchorSighash('global', 'initialize_virtual_pool_with_spl_token');

/** The verbatim ConfigParameters args from PerpsPad's live config tx (283 bytes, curve preset ground truth). */
export const PERPSPAD_CONFIG_ARGS = Buffer.from(
  '005a6202000000003c0096000000000000004e0000000000000001010100cb10c7bab88d060000000000000000000a007800881360a4dc00570900000001000006003200325673ca7f190000005e1ac30024237e01000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002010080c6a47e8d03000080c6a47e8d03000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002000000f5f7257797f4000600000000000000002e4e98f0dad7093388dc8414a70500009b57694ea91a5c84b1c4feff000000005100ad662750e97e01d8020000000000',
  'hex',
);

/** DBC pool_authority (program-level PDA, pinned from PerpsPad's live init_pool tx). */
export const DBC_POOL_AUTHORITY = new PublicKey('9xNYu22Jgocjwrz8ZsyjVHoJcvwBk2AMyc5qoE5sYg8S');

/** Anchor sighash: sha256("<namespace>:<snake_case_name>").slice(0, 8). */
export function anchorSighash(namespace: string, name: string): Buffer {
  return createHash('sha256').update(`${namespace}:${name}`).digest().subarray(0, 8);
}

/** Metaplex metadata PDA of a mint. */
export function deriveMintMetadata(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), mint.toBuffer()],
    METADATA_PROGRAM_ID,
  )[0];
}

/** DBC virtual pool PDA: seeds ["pool", base_mint, config]. */
export function deriveDbcPool(mint: PublicKey, config: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pool'), mint.toBuffer(), config.toBuffer()],
    DBC_PROGRAM_ID,
  )[0];
}

/** DBC base vault PDA: seeds ["vault", pool]. */
export function deriveDbcBaseVault(pool: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), pool.toBuffer()],
    DBC_PROGRAM_ID,
  )[0];
}

/**
 * Builds the DBC `create_config` transaction with OUR config keypair.
 * Signers: payer wallet (user) + config keypair (generated here, secret discarded).
 * fee_claimer = escrow PDA; leftover_receiver = agent wallet.
 * The ConfigParameters bytes are the VERBATIM preset captured from
 * PerpsPad's live config tx (identical curve).
 */
export function buildCreateConfigTx(params: {
  configKeypair: Keypair;
  escrowPda: PublicKey;
  agentWallet: PublicKey;
  payer: PublicKey;
}): Transaction {
  const { configKeypair, escrowPda, agentWallet, payer } = params;
  return new Transaction().add({
    programId: DBC_PROGRAM_ID,
    keys: [
      { pubkey: configKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: escrowPda, isSigner: false, isWritable: false }, // fee_claimer
      { pubkey: agentWallet, isSigner: false, isWritable: false }, // leftover_receiver
      { pubkey: WSOL_MINT, isSigner: false, isWritable: false }, // quote_mint
      { pubkey: payer, isSigner: true, isWritable: true }, // payer
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: DBC_EVENT_AUTHORITY, isSigner: false, isWritable: false },
      { pubkey: DBC_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([CREATE_CONFIG_DISCRIMINATOR, PERPSPAD_CONFIG_ARGS]),
  });
}

/** InitializePoolParameters — string fields are dynamic; numerics pinned from PerpsPad's live pool tx. */
export interface InitializePoolParams {
  readonly name: string;
  readonly symbol: string;
  readonly uri: string;
}

/** Borsh string: u32 little-endian length + utf8 bytes. */
function borshString(value: string): Buffer {
  const bytes = Buffer.from(value, 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length, 0);
  return Buffer.concat([len, bytes]);
}

/**
 * Borsh-encodes InitializePoolParameters. The numeric tail is the verbatim
 * numeric region from PerpsPad's live pool tx (curve init constants — same
 * for every launch); the three string fields are the dynamic identity fields.
 */
export function encodeInitializePoolParams(p: InitializePoolParams, pinnedNumerics: Buffer): Buffer {
  return Buffer.concat([borshString(p.name), borshString(p.symbol), borshString(p.uri), pinnedNumerics]);
}

/**
 * Builds the DBC `initialize_virtual_pool_with_spl_token` transaction.
 * creator = escrow PDA — signed via the escrow PDA? No: this tx is signed by
 * the payer wallet + base_mint ephemeral. The escrow PDA as creator works
 * because DBC's initialize_virtual_pool records `creator` from the SIGNED
 * `creator` account: it must be a signer UNLESS the program tolerates the
 * payer co-signing for it. ⚠️ OPEN ITEM: if DBC demands the PDA's signature,
 * the escrow program needs a `create_pool` CPI instruction (tracked in the
 * plan doc). The chosen default swaps creator = payer wallet (fee_claimer
 * stays the escrow PDA — that is the split-relevant field).
 */
export function buildInitializePoolTx(params: {
  configAddress: PublicKey;
  mintKeypair: Keypair;
  escrowPda: PublicKey;
  payer: PublicKey;
  metadata: InitializePoolParams;
  pinnedNumerics: Buffer;
  creatorAddress?: PublicKey;
}): { tx: Transaction; poolAddress: PublicKey } {
  const { configAddress, mintKeypair, payer, metadata, pinnedNumerics, creatorAddress } = params;
  const creator = creatorAddress ?? payer; // fee_claimer (the split-relevant field) lives in the CONFIG, not here

  // DBC pool_authority (program-level PDA, pinned from PerpsPad's live tx).
  const poolAuthority = DBC_POOL_AUTHORITY;
  const pool = deriveDbcPool(mintKeypair.publicKey, configAddress);
  const baseVault = deriveDbcBaseVault(pool);
  const mintMetadata = deriveMintMetadata(mintKeypair.publicKey);

  const tx = new Transaction().add({
    programId: DBC_PROGRAM_ID,
    keys: [
      { pubkey: configAddress, isSigner: false, isWritable: false },
      { pubkey: poolAuthority, isSigner: false, isWritable: false },
      { pubkey: creator, isSigner: true, isWritable: false },
      { pubkey: mintKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: WSOL_MINT, isSigner: false, isWritable: false }, // quote_mint
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: baseVault, isSigner: false, isWritable: true }, // base_vault
      { pubkey: WSOL_MINT, isSigner: false, isWritable: true }, // quote_vault (WSOL: mint account doubles as vault target pre-wrap)
      { pubkey: mintMetadata, isSigner: false, isWritable: true },
      { pubkey: METADATA_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_quote_program
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: DBC_EVENT_AUTHORITY, isSigner: false, isWritable: false },
      { pubkey: DBC_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([DBC_INIT_POOL_DISCRIMINATOR, encodeInitializePoolParams(metadata, pinnedNumerics)]),
  });
  return { tx, poolAddress: pool };
}

/**
 * Co-signs a transaction with the ephemeral keypairs (brand-new accounts that
 * control nothing of value). Returns the same tx for chaining.
 */
export function coSignWithEphemerals(
  tx: Transaction,
  signers: readonly Keypair[],
): Transaction {
  tx.partialSign(...signers);
  return tx;
}

/**
 * End-to-end builder: creates the ephemerals, builds both txs, co-signs them
 * with the ephemerals, and returns everything the client needs. The
 * ephemeral secrets live only in this call frame and are never persisted.
 */
export function buildDirectDbcLaunch(params: {
  configKeypair: Keypair;
  mintKeypair: Keypair;
  escrowPda: PublicKey;
  agentWallet: PublicKey;
  payer: PublicKey;
  latestBlockhash: string;
  metadata: InitializePoolParams;
  pinnedNumerics: Buffer;
}): {
  configTxBase64: string;
  poolTxBase64: string;
  configAddress: string;
  poolAddress: string;
} {
  const { configKeypair, mintKeypair, escrowPda, agentWallet, payer, latestBlockhash, metadata, pinnedNumerics } =
    params;

  const configTx = buildCreateConfigTx({ configKeypair, escrowPda, agentWallet, payer });
  configTx.recentBlockhash = latestBlockhash;
  configTx.feePayer = payer;
  coSignWithEphemerals(configTx, [configKeypair]);

  const { tx: poolTx, poolAddress } = buildInitializePoolTx({
    configAddress: configKeypair.publicKey,
    mintKeypair,
    escrowPda,
    payer,
    metadata,
    pinnedNumerics,
  });
  poolTx.recentBlockhash = latestBlockhash;
  poolTx.feePayer = payer;
  coSignWithEphemerals(poolTx, [mintKeypair]);

  return {
    configTxBase64: configTx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
    poolTxBase64: poolTx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
    configAddress: configKeypair.publicKey.toBase58(),
    poolAddress: poolAddress.toBase58(),
  };
}