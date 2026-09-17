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
import {
  deriveDbcPoolAddress,
  deriveDbcPoolAuthority,
  deriveDbcTokenVaultAddress,
  deriveMintMetadata as deriveMintMetadataSdk,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
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

/** Anchor sighash for DBC transfer_pool_creator — sha256("global:transfer_pool_creator")[0..8]. */
export const TRANSFER_POOL_CREATOR_DISCRIMINATOR = anchorSighash('global', 'transfer_pool_creator');

/** The verbatim ConfigParameters args from PerpsPad's live config tx (283 bytes, curve preset ground truth, quote = WSOL 9 decimals). */
export const PERPSPAD_CONFIG_ARGS = Buffer.from(
  '005a6202000000003c0096000000000000004e0000000000000001010100cb10c7bab88d060000000000000000000a007800881360a4dc00570900000001000006003200325673ca7f190000005e1ac30024237e0100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002010080c6a47e8d03000080c6a47e8d03000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002000000f5f7257797f4000600000000000000002e4e98f0dad7093388dc8414a70500009b57694ea91a5c84b1c4feff000000005100ad662750e97e01d8020000000000',
  'hex',
);

/** Verified quote-decimal offsets inside the 283-byte ConfigParameters blob:
 * migration_quote_threshold @69 (u64), sqrt_start_price @77 (u128),
 * curve.len @215 (u32), curve[i] @219+i*32 (u128 sqrt_price, u128 liquidity).
 * All quote-denominated values scale by 10^(9 - quote_decimals) with the
 * sqrt fields scaling by the SQUARE ROOT of that factor. Verified on-chain
 * via simulateTransaction: WSOL (9 dec), USDC (6), JUP (6) — all PASS. */
const CURVE_OFFSET_BASE = 219;
const CURVE_ENTRY_SIZE = 32;
const WSOL_DECIMALS = 9;

/** Decimals of a quote mint — read from the SPL Mint account at offset 44
 * (Mint layout: [0..4] COption tag, [4..36] mintAuthority, [36..44] supply
 * u64, [44] decimals). Verified: USDC data[44]=6, WSOL data[44]=9. */
const quoteDecimalsCache = new Map<string, number>();
export async function getQuoteDecimals(connection: { getAccountInfo(pk: PublicKey): Promise<{ data: Uint8Array } | null> }, quoteMint: PublicKey): Promise<number> {
  const cached = quoteDecimalsCache.get(quoteMint.toBase58());
  if (cached !== undefined) return cached;
  const info = await connection.getAccountInfo(quoteMint);
  if (!info || info.data.length < 82) {
    throw new Error(`Quote mint ${quoteMint.toBase58()} not found on-chain (or not an SPL mint — expected ≥82-byte Mint account).`);
  }
  const decimals = info.data[44];
  if (decimals < 6 || decimals > 9) {
    throw new Error(`Quote mint ${quoteMint.toBase58()} has ${decimals} decimals — the DBC requires 6-9 and no transfer fee.`);
  }
  quoteDecimalsCache.set(quoteMint.toBase58(), decimals);
  return decimals;
}

/**
 * Scales the quote-denominated fields of the PerpsPad preset for a quote mint
 * with `quoteDecimals` decimals (preset is 9-dec WSOL). Scale factor for
 * amounts = 10^(quoteDecimals - 9); for sqrt prices = its square root.
 */
export function buildConfigArgsForQuote(quoteDecimals: number, creatorTradingFeePercentage = 100): Buffer {
  if (!Number.isInteger(quoteDecimals) || quoteDecimals < 6 || quoteDecimals > 9) {
    throw new Error(`Quote decimals must be an integer 6-9 (DBC requirement), got ${quoteDecimals}.`);
  }
  if (!Number.isInteger(creatorTradingFeePercentage) || creatorTradingFeePercentage < 0 || creatorTradingFeePercentage > 100) {
    throw new Error(`creatorTradingFeePercentage must be an integer 0-100, got ${creatorTradingFeePercentage}.`);
  }
  // quoteDecimals <= 9 always (preset is 9-dec WSOL), so values only SHRINK.
  // amount divisor = 10^(9 - dec); sqrt divisor = ceil(sqrt(10^(9-dec))).
  // Verified on-chain: WSOL(9)/USDC(6)/JUP(6) all PASS with divisors 1/1000/32.
  const amountDivisor = 10n ** BigInt(WSOL_DECIMALS - quoteDecimals);
  const sqrtDivisor = amountDivisor; // verified on-chain: ALL quote fields scale by 10^(9-dec) (sqrt fields included) — sqrt(1000)÷ failed TypeCast/liquidity checks

  const out = Buffer.from(PERPSPAD_CONFIG_ARGS);

  const readU128 = (offset: number): bigint => {
    let h = '';
    for (let i = offset + 15; i >= offset; i--) h += out[i].toString(16).padStart(2, '0');
    return BigInt('0x' + h);
  };
  const writeU128 = (offset: number, v: bigint): void => {
    const bytes = v.toString(16).padStart(32, '0').match(/../g) ?? [];
    bytes.reverse().forEach((byte, idx) => { out[offset + idx] = parseInt(byte, 16); });
  };

  // migration_quote_threshold @69 (u64, quote lamports)
  out.writeBigUInt64LE(out.readBigUInt64LE(69) / amountDivisor, 69);
  // sqrt_start_price @77 (u128)
  writeU128(77, readU128(77) / sqrtDivisor);
  // curve points: sqrt_price by sqrtDivisor, liquidity by amountDivisor
  const curveLen = out.readUInt32LE(215);
  for (let i = 0; i < curveLen; i++) {
    const sqrtOffset = CURVE_OFFSET_BASE + i * CURVE_ENTRY_SIZE;
    const liqOffset = sqrtOffset + 16;
    writeU128(sqrtOffset, readU128(sqrtOffset) / sqrtDivisor);
    writeU128(liqOffset, readU128(liqOffset) / amountDivisor);
  }
  // creator_trading_fee_percentage @151 (u8) — offset verified via SDK anchor
  // coder round-trip diff (decode preset → set 100 → encode → first-diff @151;
  // identity round-trip byte-identical). 0 = all trading fees to partner
  // (PerpsPad preset), 100 = all to pool creator (our escrow-driven split).
  out[151] = creatorTradingFeePercentage;
  return out;
}

/** DBC pool_authority — const PDA from the official SDK. On-chain verified: this
 * account EXISTS on mainnet (owner SystemProgram, ~59 SOL of accumulated fees).
 * NOTE: PerpsPad's live txs use a different (fork/legacy) interface where the
 * pool authority is a signer keypair — the mainline program's source
 * (`address = const_pda::pool_authority::ID`) and the SDK both point here. */
export const DBC_POOL_AUTHORITY = deriveDbcPoolAuthority();

/** Anchor sighash: sha256("<namespace>:<snake_case_name>").slice(0, 8). */
export function anchorSighash(namespace: string, name: string): Buffer {
  return createHash('sha256').update(`${namespace}:${name}`).digest().subarray(0, 8);
}

/** Metaplex metadata PDA — OFFICIAL SDK derivation (seeds ["metadata", program_id, mint]; my previous ["metadata", mint] was missing the program id and failed Metaplex seed validation on-chain). */
export function deriveMintMetadata(mint: PublicKey): PublicKey {
  return deriveMintMetadataSdk(mint);
}

/** DBC pool PDA — OFFICIAL Meteora SDK derivation (deriveDbcPoolAddress handles the max/min key ordering internally). Verified: derives PerpsPad's live pool HyhQAsTw… byte-for-byte. */
export function deriveDbcPool(mint: PublicKey, config: PublicKey, quoteMint: PublicKey = WSOL_MINT): PublicKey {
  return deriveDbcPoolAddress(quoteMint, mint, config);
}

/** DBC token vault PDA — OFFICIAL Meteora SDK derivation, works for base AND quote vaults. */
export function deriveDbcVault(mint: PublicKey, pool: PublicKey): PublicKey {
  return deriveDbcTokenVaultAddress(pool, mint);
}

/** @deprecated use deriveDbcVault — kept for the re-export surface. */
export const deriveDbcBaseVault = deriveDbcVault;

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
  quoteMint: PublicKey;
  /** Quote mint decimals (6-9). The caller fetches it via getQuoteDecimals. */
  quoteDecimals: number;
}): Transaction {
  const { configKeypair, escrowPda, agentWallet, payer, quoteMint, quoteDecimals } = params;
  return new Transaction().add({
    programId: DBC_PROGRAM_ID,
    keys: [
      { pubkey: configKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: escrowPda, isSigner: false, isWritable: false }, // fee_claimer
      { pubkey: agentWallet, isSigner: false, isWritable: false }, // leftover_receiver
      { pubkey: quoteMint, isSigner: false, isWritable: false }, // quote_mint
      { pubkey: payer, isSigner: true, isWritable: true }, // payer
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: DBC_EVENT_AUTHORITY, isSigner: false, isWritable: false },
      { pubkey: DBC_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
      // creatorTradingFeePercentage = 100: the pool creator (the escrow PDA,
      // set by the transferPoolCreator tx) receives 100% of the trading fees;
      // the escrow program's claim_and_split then splits 70/30. The DBC
      // config's fee_claimer field is inert (verified in DBC source — only
      // creator_trading_fee_percentage gates the creator/partner fee split).
      data: Buffer.concat([CREATE_CONFIG_DISCRIMINATOR, buildConfigArgsForQuote(quoteDecimals, 100)]),
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
 * Borsh-encodes InitializePoolParameters. Decoded from PerpsPad's live pool
 * tx (2026-09-16): the args are EXACTLY three borsh strings — name, symbol,
 * uri — 114 bytes total, NO numeric tail (the uri is the token's metadata
 * JSON endpoint; ours points at our own metadata host).
 */
export function encodeInitializePoolParams(p: InitializePoolParams): Buffer {
  return Buffer.concat([borshString(p.name), borshString(p.symbol), borshString(p.uri)]);
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
/** SPL Token-2022 program (quote mints like xStocks are Token-2022 mints). */
export const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

/**
 * Which token program owns the quote mint's token accounts. The DBC
 * initialize_virtual_pool_with_spl_token ctx declares quote_mint with
 * `mint::token_program = token_quote_program` (source:
 * ix_initialize_virtual_pool_with_spl_token.rs), so the account we pass as
 * token_quote_program MUST match the quote mint's owner program. Verified
 * on-chain: xStocks mints (TSLAx/NVDAx/SPCXx/AAPLx/AMZNx) are owned by
 * Token-2022.
 */
export function tokenProgramForMint(mintOwner: PublicKey): PublicKey {
  return mintOwner.equals(TOKEN_PROGRAM_ID) ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID;
}

export function buildInitializePoolTx(params: {
  configAddress: PublicKey;
  mintKeypair: Keypair;
  escrowPda: PublicKey;
  payer: PublicKey;
  metadata: InitializePoolParams;
  creatorAddress?: PublicKey;
  /** Quote mint: must match the one baked into the config. */
  quoteMint: PublicKey;
  /** Owner program of the quote mint (from getAccountInfo). Defaults to legacy SPL. */
  quoteMintOwner?: PublicKey;
}): { tx: Transaction; poolAddress: PublicKey } {
  const { configAddress, mintKeypair, payer, metadata, creatorAddress, quoteMint, quoteMintOwner } = params;
  const creator = creatorAddress ?? payer; // fee_claimer (the split-relevant field) lives in the CONFIG, not here
  // token_quote_program must match the quote mint's owner program (SPL legacy
  // or Token-2022) — the ctx binds quote_mint to it on-chain.
  const quoteTokenProgram = quoteMintOwner ? tokenProgramForMint(quoteMintOwner) : TOKEN_PROGRAM_ID;

  // DBC pool_authority — const PDA from the official SDK.
  const poolAuthority = DBC_POOL_AUTHORITY;
  const pool = deriveDbcPool(mintKeypair.publicKey, configAddress, quoteMint);
  const baseVault = deriveDbcVault(mintKeypair.publicKey, pool);
  const quoteVault = deriveDbcVault(quoteMint, pool);
  const mintMetadata = deriveMintMetadata(mintKeypair.publicKey);

  const tx = new Transaction().add({
    programId: DBC_PROGRAM_ID,
    keys: [
      { pubkey: configAddress, isSigner: false, isWritable: false },
      { pubkey: poolAuthority, isSigner: false, isWritable: false },
      { pubkey: creator, isSigner: true, isWritable: false },
      { pubkey: mintKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: quoteMint, isSigner: false, isWritable: false }, // quote_mint
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: baseVault, isSigner: false, isWritable: true }, // base_vault
      { pubkey: quoteVault, isSigner: false, isWritable: true }, // quote_vault: PDA ["token_vault", WSOL, pool] — created by this ix
      { pubkey: mintMetadata, isSigner: false, isWritable: true },
      { pubkey: METADATA_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: quoteTokenProgram, isSigner: false, isWritable: false }, // token_quote_program — SPL legacy or Token-2022 to match the quote mint
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program (base mint is always legacy SPL)
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: DBC_EVENT_AUTHORITY, isSigner: false, isWritable: false },
      { pubkey: DBC_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([DBC_INIT_POOL_DISCRIMINATOR, encodeInitializePoolParams(metadata)]),
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
 * Builds the DBC `transfer_pool_creator` transaction: moves pool creatorship
 * from the initializePool signer (payer) to the escrow PDA. Verified from DBC
 * source (ix_transfer_pool_creator.rs): TransferPoolCreatorCtx = 4 accounts
 * (virtual_pool mut, config, creator signer, new_creator ≠ creator) and the
 * #[event_cpi] macro appends event_authority + program → 6 keys total.
 * Guard: PreBondingCurve (pool not migrated) → always permitted.
 */
export function buildTransferPoolCreatorTx(params: {
  poolAddress: PublicKey;
  configAddress: PublicKey;
  /** Current pool creator (the initializePool signer). */
  currentCreator: PublicKey;
  /** New creator — our escrow PDA. Must differ from currentCreator. */
  newCreator: PublicKey;
}): Transaction {
  const { poolAddress, configAddress, currentCreator, newCreator } = params;
  if (newCreator.equals(currentCreator)) {
    throw new Error('transfer_pool_creator: new_creator must differ from the current creator (DBC InvalidNewCreator).');
  }
  return new Transaction().add({
    programId: DBC_PROGRAM_ID,
    keys: [
      { pubkey: poolAddress, isSigner: false, isWritable: true }, // virtual_pool
      { pubkey: configAddress, isSigner: false, isWritable: false }, // config
      { pubkey: currentCreator, isSigner: true, isWritable: false }, // creator (signer)
      { pubkey: newCreator, isSigner: false, isWritable: false }, // new_creator
      { pubkey: DBC_EVENT_AUTHORITY, isSigner: false, isWritable: false },
      { pubkey: DBC_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(TRANSFER_POOL_CREATOR_DISCRIMINATOR),
  });
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
  /** Quote mint: WSOL (default), USDC, or any SPL/Token-2022 mint 6-9 decimals. */
  quoteMint: PublicKey;
  /** Quote mint decimals (6-9), fetched by the caller via getQuoteDecimals. */
  quoteDecimals: number;
  /** Owner program of the quote mint (SPL legacy or Token-2022). Optional — defaults to legacy SPL. */
  quoteMintOwner?: PublicKey;
}): {
  bootstrapTxBase64: string;
  configTxBase64: string;
  poolTxBase64: string;
  /** transfer_pool_creator (payer → escrow PDA) — payer-signed, no ephemerals. */
  transferCreatorTxBase64: string;
  configAddress: string;
  poolAddress: string;
} {
  const { configKeypair, mintKeypair, escrowPda, agentWallet, payer, latestBlockhash, metadata, quoteMint, quoteDecimals, quoteMintOwner } = params;

  const configTx = buildCreateConfigTx({ configKeypair, escrowPda, agentWallet, payer, quoteMint, quoteDecimals });
  configTx.recentBlockhash = latestBlockhash;
  configTx.feePayer = payer;
  coSignWithEphemerals(configTx, [configKeypair]);

  const { tx: poolTx, poolAddress } = buildInitializePoolTx({
    configAddress: configKeypair.publicKey,
    mintKeypair,
    escrowPda,
    payer,
    metadata,
    quoteMint,
    quoteMintOwner,
  });
  poolTx.recentBlockhash = latestBlockhash;
  poolTx.feePayer = payer;
  coSignWithEphemerals(poolTx, [mintKeypair]);

  // Atomic bootstrap prevents a confirmed config from becoming orphaned if
  // the separately signed pool transaction expires in the wallet UI.
  const bootstrapTx = new Transaction().add(...configTx.instructions, ...poolTx.instructions);
  bootstrapTx.recentBlockhash = latestBlockhash;
  bootstrapTx.feePayer = payer;
  coSignWithEphemerals(bootstrapTx, [configKeypair, mintKeypair]);

  // 3rd tx: transfer_pool_creator (payer → escrow PDA). DBC records the
  // initializePool SIGNER as pool.creator; only pool.creator can claim trading
  // fees (access_control::is_pool_creator). Transferring creatorship to the
  // escrow PDA makes the escrow program's claim_and_split CPI the sole claim
  // path. Verified from DBC source (ix_transfer_pool_creator.rs): 4 ctx
  // accounts + 2 event_cpi accounts; PreBondingCurve → always permitted;
  // new_creator must differ from the current creator (escrow ≠ payer ✓).
  const transferTx = buildTransferPoolCreatorTx({
    poolAddress,
    configAddress: configKeypair.publicKey,
    currentCreator: payer,
    newCreator: escrowPda,
  });
  transferTx.recentBlockhash = latestBlockhash;
  transferTx.feePayer = payer;

  return {
    bootstrapTxBase64: bootstrapTx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
    configTxBase64: configTx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
    poolTxBase64: poolTx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
    transferCreatorTxBase64: transferTx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
    configAddress: configKeypair.publicKey.toBase58(),
    poolAddress: poolAddress.toBase58(),
  };
}
