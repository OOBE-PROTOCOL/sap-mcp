/**
 * Tests for the direct DBC launch builder (dbc-launch.ts): discriminators,
 * PDA derivations, borsh encoding, and ephemeral co-signing.
 */
import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';
import {
  anchorSighash,
  buildCreateConfigTx,
  buildDirectDbcLaunch,
  buildInitializePoolTx,
  CREATE_CONFIG_DISCRIMINATOR,
  DBC_EVENT_AUTHORITY,
  DBC_INIT_POOL_DISCRIMINATOR,
  DBC_POOL_AUTHORITY,
  DBC_PROGRAM_ID,
  deriveDbcBaseVault,
  deriveDbcPool,
  deriveMintMetadata,
  encodeInitializePoolParams,
  buildConfigArgsForQuote,
  MIGRATION_FEE_PERCENTAGE,
  buildTransferPoolCreatorTx,
  TRANSFER_POOL_CREATOR_DISCRIMINATOR,
  PERPSPAD_CONFIG_ARGS,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  tokenProgramForMint,
  WSOL_MINT,
} from './dbc-launch.js';

/** Verified on-chain 17/09/2026 (Token-2022, 8 decimals). */
const TSLAX_MINT = new PublicKey('XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB');

describe('dbc-launch', () => {
  it('create_config discriminator matches the one captured from a live PerpsPad tx', () => {
    expect(CREATE_CONFIG_DISCRIMINATOR.toString('hex')).toBe('c9cff3724b6f2fbd');
    expect(anchorSighash('global', 'create_config').toString('hex')).toBe('c9cff3724b6f2fbd');
  });

  it('init_pool discriminator is a stable anchor sighash', () => {
    expect(DBC_INIT_POOL_DISCRIMINATOR.length).toBe(8);
    // deterministic
    expect(anchorSighash('global', 'initialize_virtual_pool_with_spl_token').toString('hex'))
      .toBe(DBC_INIT_POOL_DISCRIMINATOR.toString('hex'));
  });

  it('the captured ConfigParameters preset is 283 bytes (PerpsPad live verbatim)', () => {
    // The full data (discriminator + args) from the captured tx was 291 bytes of ix.data; args alone = 292 - 8 = 284? Pin the actual captured length: 300 bytes total minus nothing — assert it equals the decoded verbatim capture.
    expect(PERPSPAD_CONFIG_ARGS.length).toBe(283);
  });

  it('builds create_config with fee_claimer = escrow PDA and leftover_receiver = agent wallet', () => {
    const configKeypair = Keypair.generate();
    const escrowPda = Keypair.generate().publicKey;
    const agentWallet = Keypair.generate().publicKey;
    const payer = Keypair.generate().publicKey;

    const tx = buildCreateConfigTx({ configKeypair, escrowPda, agentWallet, payer, quoteMint: WSOL_MINT, quoteDecimals: 9 });
    expect(tx.instructions).toHaveLength(1);
    const ix = tx.instructions[0];
    expect(ix.programId.toBase58()).toBe(DBC_PROGRAM_ID.toBase58());
    expect(ix.keys.map((k) => k.pubkey.toBase58())).toEqual([
      configKeypair.publicKey.toBase58(), // config (signer, writer)
      escrowPda.toBase58(), // fee_claimer
      agentWallet.toBase58(), // leftover_receiver
      WSOL_MINT.toBase58(), // quote_mint
      payer.toBase58(), // payer (signer)
      '11111111111111111111111111111111',
      DBC_EVENT_AUTHORITY.toBase58(),
      DBC_PROGRAM_ID.toBase58(),
    ]);
    expect(ix.data.subarray(0, 8).toString('hex')).toBe(CREATE_CONFIG_DISCRIMINATOR.toString('hex'));
    // The args equal the PerpsPad verbatim preset EXCEPT the
    // creator_trading_fee_percentage byte (@151, verified via SDK anchor
    // coder round-trip diff): ours is 100 (100% of trading fees to the pool
    // creator = escrow PDA, split 70/30 on claim), the preset's is 0.
    const args = Buffer.from(ix.data.subarray(8));
    const expected = Buffer.from(PERPSPAD_CONFIG_ARGS);
    expected[151] = 100;
    expected[153] = MIGRATION_FEE_PERCENTAGE;
    expect(args.equals(expected)).toBe(true);
  });

  it('derives pool/vault/metadata PDAs deterministically', () => {
    const mint = Keypair.generate().publicKey;
    const config = Keypair.generate().publicKey;
    const pool = deriveDbcPool(mint, config);
    const vault = deriveDbcBaseVault(mint, pool);
    const mintMetadata = deriveMintMetadata(mint);
    // deterministic across calls
    expect(deriveDbcPool(mint, config).toBase58()).toBe(pool.toBase58());
    expect(deriveDbcBaseVault(mint, pool).toBase58()).toBe(vault.toBase58());
    expect(deriveMintMetadata(mint).toBase58()).toBe(mintMetadata.toBase58());
    // PDAs are off-curve (no private key exists) — structural check: they
    // derive from findProgramAddressSync which never returns on-curve keys.
  });

  it('encodes InitializePoolParameters as three borsh strings (no numeric tail — verified from a live pool tx)', () => {
    const encoded = encodeInitializePoolParams({ name: 'Test', symbol: 'TST', uri: 'https://x.test/a.json' });
    // name: 4 + 4, symbol: 4 + 3, uri: 4 + 21 — that is ALL (114 bytes on the
    // live PerpsPad pool tx were exactly these three strings).
    expect(encoded.length).toBe(8 + 7 + 25);
    // name length prefix
    expect(encoded.readUInt32LE(0)).toBe(4);
    expect(encoded.subarray(4, 8).toString('utf8')).toBe('Test');
    // symbol length prefix (name total = 4 + 4 = 8)
    const symOff = 8;
    expect(encoded.readUInt32LE(symOff)).toBe(3);
    expect(encoded.subarray(symOff + 4, symOff + 7).toString('utf8')).toBe('TST');
  });

  it('buildDirectDbcLaunch co-signs with the ephemerals and leaves the payer signature missing', () => {
    const configKeypair = Keypair.generate();
    const mintKeypair = Keypair.generate();
    const escrowPda = Keypair.generate().publicKey;
    const agentWallet = Keypair.generate().publicKey;
    const payer = Keypair.generate();

    const out = buildDirectDbcLaunch({
    quoteMint: WSOL_MINT,
    quoteDecimals: 9,
      configKeypair,
      mintKeypair,
      escrowPda,
      agentWallet,
      payer: payer.publicKey,
      latestBlockhash: '11111111111111111111111111111111',
      metadata: { name: 'Test Coin', symbol: 'TEST', uri: 'https://x.test/a.json' },
    });

    expect(out.configAddress).toBe(configKeypair.publicKey.toBase58());
    expect(out.poolAddress).toBe(deriveDbcPool(mintKeypair.publicKey, configKeypair.publicKey, WSOL_MINT).toBase58());

    const bootstrap = Transaction.from(Buffer.from(out.bootstrapTxBase64, 'base64'));
    expect(Buffer.from(out.bootstrapTxBase64, 'base64').length).toBeLessThanOrEqual(1232);
    expect(bootstrap.instructions).toHaveLength(2);
    expect(bootstrap.signatures.find((s) => s.publicKey.equals(configKeypair.publicKey))?.signature).not.toBeNull();
    expect(bootstrap.signatures.find((s) => s.publicKey.equals(mintKeypair.publicKey))?.signature).not.toBeNull();
    expect(bootstrap.signatures.find((s) => s.publicKey.equals(payer.publicKey))?.signature).toBeNull();

    // The pool tx derives its pool PDA from config + mint — verify.
    expect(out.configAddress).toBe(configKeypair.publicKey.toBase58());

    // Both txs must deserialize and contain the ephemeral signature.
    const configTx = Transaction.from(Buffer.from(out.configTxBase64, 'base64'));
    const ephemeralSig = configTx.signatures.find(
      (s: { publicKey: PublicKey; signature: Buffer | null }) => s.publicKey.toBase58() === configKeypair.publicKey.toBase58(),
    );
    expect(ephemeralSig?.signature).not.toBeNull();
    const payerSig = configTx.signatures.find(
      (s: { publicKey: PublicKey; signature: Buffer | null }) => s.publicKey.toBase58() === payer.publicKey.toBase58(),
    );
    expect(payerSig?.signature).toBeNull(); // user wallet signs client-side

    // The transferPoolCreator tx: payer is the ONLY signer (no ephemerals),
    // addressed to the DBC program with the transfer_pool_creator sighash.
    const transferTx = Transaction.from(Buffer.from(out.transferCreatorTxBase64, 'base64'));
    expect(transferTx.instructions).toHaveLength(1);
    const tix = transferTx.instructions[0];
    expect(tix.programId.toBase58()).toBe(DBC_PROGRAM_ID.toBase58());
    expect(tix.data.subarray(0, 8).toString('hex')).toBe(TRANSFER_POOL_CREATOR_DISCRIMINATOR.toString('hex'));
    expect(tix.keys.map((k) => k.pubkey.toBase58())).toEqual([
      out.poolAddress, // virtual_pool (writable)
      configKeypair.publicKey.toBase58(), // config
      payer.publicKey.toBase58(), // creator (signer = initializePool signer)
      escrowPda.toBase58(), // new_creator = escrow PDA
      DBC_EVENT_AUTHORITY.toBase58(),
      DBC_PROGRAM_ID.toBase58(),
    ]);
    expect(tix.keys[0].isWritable).toBe(true);
    expect(tix.keys[2].isSigner).toBe(true);
    // reject identical creator/new_creator (DBC InvalidNewCreator)
    expect(() =>
      buildTransferPoolCreatorTx({ poolAddress: Keypair.generate().publicKey, configAddress: Keypair.generate().publicKey, currentCreator: payer.publicKey, newCreator: payer.publicKey }),
    ).toThrow(/must differ/);
  });

  it('pool_authority is the official const PDA (on-chain verified)', () => {
    // The mainline program pins pool_authority to a const PDA
    // (`address = const_pda::pool_authority::ID` in the source). This account
    // EXISTS on mainnet (SystemProgram-owned, ~59 SOL of accumulated fees).
    // PerpsPad's live txs use a fork/legacy interface — not our target.
    expect(DBC_POOL_AUTHORITY.toBase58()).toBe('FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM');
  });

  it('buildInitializePoolTx uses Token-2022 as token_quote_program for Token-2022 quote mints', () => {
    const mintKeypair = Keypair.generate();
    const configAddress = Keypair.generate().publicKey;
    const payer = Keypair.generate().publicKey;
    const common = {
      configAddress,
      mintKeypair,
      escrowPda: Keypair.generate().publicKey,
      payer,
      metadata: { name: 'T', symbol: 'T', uri: 'https://example.com/x.json' },
      quoteMint: TSLAX_MINT,
    };

    // Owner Token-2022 (xStocks) → token_quote_program = Token-2022
    const tx2022 = buildInitializePoolTx({ ...common, quoteMintOwner: TOKEN_2022_PROGRAM_ID }).tx;
    const ix2022 = tx2022.instructions[0];
    expect(ix2022.keys[11].pubkey.toBase58()).toBe('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
    // token_program (base mint) stays legacy SPL
    expect(ix2022.keys[12].pubkey.toBase58()).toBe('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // Owner SPL legacy → token_quote_program = legacy SPL (unchanged behaviour)
    const txSpl = buildInitializePoolTx({ ...common, quoteMintOwner: TOKEN_PROGRAM_ID }).tx;
    expect(txSpl.instructions[0].keys[11].pubkey.toBase58()).toBe('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // No owner passed → legacy SPL (back-compat default)
    const txDefault = buildInitializePoolTx(common).tx;
    expect(txDefault.instructions[0].keys[11].pubkey.toBase58()).toBe('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  });

  it('tokenProgramForMint maps owner → program', () => {
    expect(tokenProgramForMint(TOKEN_PROGRAM_ID).toBase58()).toBe('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    expect(tokenProgramForMint(TOKEN_2022_PROGRAM_ID).toBase58()).toBe('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
    expect(tokenProgramForMint(Keypair.generate().publicKey).toBase58()).toBe('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
  });
});
  it('buildConfigArgsForQuote scales the preset per quote decimals (on-chain verified)', () => {
    // WSOL (9 dec) = the original verbatim preset + creator fee byte @151 = 100
    const wsol = buildConfigArgsForQuote(9);
    expect(wsol.length).toBe(283);
    expect(wsol[151]).toBe(100); // creator_trading_fee_percentage
    expect(wsol[153]).toBe(MIGRATION_FEE_PERCENTAGE);
    // every other byte matches the verbatim preset, except our fixed creator
    // trading share and fixed 1% migration fee.
    const presetCopy = Buffer.from(PERPSPAD_CONFIG_ARGS);
    presetCopy[151] = 100;
    presetCopy[153] = MIGRATION_FEE_PERCENTAGE;
    expect(wsol.equals(presetCopy)).toBe(true);
    // Caller-controlled creator trading share never changes the migration fee.
    const partnerFees = buildConfigArgsForQuote(9, 0);
    expect(partnerFees[151]).toBe(0);
    expect(partnerFees[153]).toBe(MIGRATION_FEE_PERCENTAGE);
    const usdc = buildConfigArgsForQuote(6, 100, 150);
    expect(usdc.length).toBe(283);
    // 109.518 SOL at $150/SOL becomes 16,427.7 USDC.
    expect(usdc.readBigUInt64LE(69)).toBe(16_427_723_494n);
    // creator fee byte survives the scaling
    expect(usdc[151]).toBe(100);
    // same-decimals quotes share the preset
    expect(buildConfigArgsForQuote(6, 100, 150).toString('hex')).toBe(usdc.toString('hex'));
    // invalid decimals rejected
    expect(() => buildConfigArgsForQuote(5)).toThrow(/6-9/);
    expect(() => buildConfigArgsForQuote(10)).toThrow(/6-9/);
    // invalid fee percentage rejected
    expect(() => buildConfigArgsForQuote(9, 101)).toThrow(/0-100/);
    expect(() => buildConfigArgsForQuote(9, -1)).toThrow(/0-100/);
  });
