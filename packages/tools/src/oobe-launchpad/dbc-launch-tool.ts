/**
 * @name tools/oobe-launchpad/dbc-launch-tool
 * @description Registers `sap_steve_launch_build_dbc` — the Steve-native Meteora DBC
 *   launch builder (Option 2). Replaces PerpsPad's unsignable /api/v1/launch
 *   response with locally-built, co-signed transactions. Feature parity with
 *   the legacy build_launch: same inputs (ticker, name, dev-buy, perp backing
 *   recorded as metadata), plus the escrow split wired in.
 */

import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import BN from 'bn.js';
import { DynamicBondingCurveClient, getCurrentPoint, SwapMode } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { logger } from '../../../core/src/logger.js';
import {
  buildDirectDbcLaunch,
  deriveDbcPool,
  getQuoteDecimals,
  METADATA_PROGRAM_ID,
  deriveMintMetadata,
  WSOL_MINT,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from './dbc-launch.js';
import { ExtensionType, getExtensionTypes, getMint } from '@solana/spl-token';
import { buildInitializeEscrowInstruction, deriveEscrowPda, isValidSolanaAddress } from './escrow.js';
import { registerPerpspadPipelineTool, perpspadPipelineOk, perpspadPipelineException } from '../perpspad/perpspad-pipeline.js';

const OOBE_TREASURY = 'BiHdXQqNXTgMrNikZxw4CMnD1z1t6K2tmtwyXgSWSKqR';
const ESCROW_PROGRAM_ID = 'ENpvWhtTtnveMZ3WHpGKHMEYDrPHHc5v6JjjVUWFNYgA';

/** Perp backing policy attached to a DBC launch (read by the keeper). */
export interface DbcBackingPolicy {
  readonly underlying: string;
  readonly leverage: number;
  readonly direction: 'long' | 'short';
  readonly status: 'pending-keeper';
}

export function toQuoteBaseUnits(amount: number, decimals: number): BN {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(decimals) || decimals < 0 || decimals > 9) {
    throw new Error('Invalid quote amount or decimals');
  }
  const fixed = amount.toFixed(decimals);
  const [whole, fraction = ''] = fixed.split('.');
  return new BN(`${whole}${fraction.padEnd(decimals, '0')}`.replace(/^0+(?=\d)/, ''));
}

/** Shared input schema for the canonical Steve DBC builder and its legacy alias. */
export const DBC_LAUNCH_INPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    ticker: { type: 'string', description: 'Coin ticker, A-Z 0-9 only (e.g. MOON)' },
    name: { type: 'string', description: 'Coin display name' },
    agentWallet: { type: 'string', description: 'Agent wallet: receives 70% of claimed trading fees; also the leftover-token receiver' },
    payer: { type: 'string', description: 'Transaction payer + initial pool creator (signs the returned transactions client-side)' },
    devBuyAmount: { type: 'number', description: 'Initial buy amount, denominated in the selected quote token' },
    devBuySol: { type: 'number', description: 'Deprecated alias for devBuyAmount (SOL launches only)' },
    latestBlockhash: { type: 'string', description: 'FRESH mainnet blockhash fetched by the CALLER (getLatestBlockhash) — guarantees signability from the client. Required.' },
    metadataUri: { type: 'string', description: 'Exact permanent HTTPS URI of the Metaplex JSON (for example an IPFS/Arweave gateway URL). Preferred for production launches.' },
    metadataBaseUrl: { type: 'string', description: 'HTTPS base URL used to build the Metaplex JSON URI' },
    underlying: { type: 'string', description: 'Perp backing: Phoenix market symbol (e.g. SOL, TSLA, OIL). A-Z 0-9, 1-12 chars. REQUIRED together with leverage and direction (all-or-nothing).' },
    leverage: { type: 'number', description: 'Perp backing: integer leverage 1-10. REQUIRED together with underlying and direction (all-or-nothing).' },
    direction: { type: 'string', enum: ['long', 'short'], description: 'Perp backing: long|short. REQUIRED together with underlying and leverage (all-or-nothing).' },
    quote: { type: 'string', description: 'Quote token: SOL, USDC, or CUSTOM with quoteMint. Custom SPL/Token-2022 mints are validated on-chain.' },
    quoteMint: { type: 'string', description: 'Required when quote=CUSTOM: SPL or Token-2022 mint with 6-9 decimals and no unsupported transfer behavior.' },
    quotePriceUsd: { type: 'number', description: 'Live USD price of one quote token. Required for non-SOL quotes.' },
    solPriceUsd: { type: 'number', description: 'Live SOL/USD reference. Required for non-SOL quotes.' },
  },
  required: ['ticker', 'name', 'agentWallet', 'payer', 'latestBlockhash'],
} as const;

/**
 * Validates the perp backing triple (underlying + leverage + direction).
 * All-or-nothing: either all three are present (and valid) or none is.
 * Returns the normalized policy, or an Error describing the violation.
 */
export function parseBackingPolicy(
  input: Record<string, unknown>,
): { policy: DbcBackingPolicy | undefined; error: Error | undefined } {
  const hasUnderlying = input.underlying !== undefined && input.underlying !== null && input.underlying !== '';
  const hasLeverage = input.leverage !== undefined && input.leverage !== null;
  const hasDirection = input.direction !== undefined && input.direction !== null && input.direction !== '';

  if (!hasUnderlying && !hasLeverage && !hasDirection) {
    return { policy: undefined, error: undefined }; // clean pure-curve token
  }

  const missing = [
    !hasUnderlying && 'underlying',
    !hasLeverage && 'leverage',
    !hasDirection && 'direction',
  ].filter(Boolean).join(', ');
  if (missing) {
    return {
      policy: undefined,
      error: new Error(`invalid_backingPolicy: perp backing is all-or-nothing — provide ALL of underlying, leverage, direction (missing: ${missing}). Omit all three for a clean pure-curve token.`),
    };
  }

  const underlying = typeof input.underlying === 'string' ? input.underlying.trim() : '';
  if (!/^[A-Z0-9]{1,12}$/.test(underlying)) {
    return {
      policy: undefined,
      error: new Error('invalid_backingPolicy.underlying: must be an uppercase Phoenix market symbol, 1-12 chars, A-Z 0-9 only (e.g. SOL, TSLA, OIL)'),
    };
  }

  const leverage = input.leverage;
  if (typeof leverage !== 'number' || !Number.isInteger(leverage) || leverage < 1 || leverage > 10) {
    return {
      policy: undefined,
      error: new Error('invalid_backingPolicy.leverage: must be an integer between 1 and 10'),
    };
  }

  const direction = input.direction;
  if (direction !== 'long' && direction !== 'short') {
    return {
      policy: undefined,
      error: new Error('invalid_backingPolicy.direction: must be exactly "long" or "short"'),
    };
  }

  return {
    policy: { underlying, leverage, direction, status: 'pending-keeper' },
    error: undefined,
  };
}

/** USDC mainnet mint (quote option). */
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

export const STEVE_DBC_LAUNCH_TOOL = 'sap_steve_launch_build_dbc';
export const LEGACY_DBC_LAUNCH_TOOL = 'sap_perpspad_launch_dbc';
export const STEVE_DBC_DEV_BUY_TOOL = 'sap_steve_launch_build_dbc_dev_buy';
export const LEGACY_DBC_DEV_BUY_TOOL = 'sap_perpspad_build_dbc_dev_buy';

/** Registers the canonical Steve DBC builder and compatibility aliases. */
export function registerDbcLaunchTool(
  server: Parameters<typeof registerPerpspadPipelineTool>[0],
  context: Parameters<typeof registerPerpspadPipelineTool>[1],
): void {
  for (const toolName of [STEVE_DBC_LAUNCH_TOOL, LEGACY_DBC_LAUNCH_TOOL] as const) {
  registerPerpspadPipelineTool(server, context, toolName, {
    description: `${toolName === LEGACY_DBC_LAUNCH_TOOL ? 'DEPRECATED alias; use sap_steve_launch_build_dbc. ' : ''}Build a Steve-native direct Meteora DBC launch: create config, initialize pool, transfer creator authority to the 70/30 escrow PDA, then initialize escrow. A requested initial buy is built separately after pool confirmation with sap_steve_launch_build_dbc_dev_buy and a fresh blockhash. Supports SOL, USDC, and validated SPL/Token-2022 quote mints.`,
    inputSchema: DBC_LAUNCH_INPUT_SCHEMA,
  }, async (input) => {
    try {
      const ticker = String(input.ticker ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const name = String(input.name ?? '');
      const agentWallet = String(input.agentWallet ?? '');
      const payer = String(input.payer ?? '');
      const devBuyAmount = typeof input.devBuyAmount === 'number'
        ? input.devBuyAmount
        : typeof input.devBuySol === 'number' ? input.devBuySol : 0;

      if (ticker.length < 2 || ticker.length > 10) {
        return perpspadPipelineException('Invalid direct DBC launch input', new Error('invalid_ticker: 2-10 A-Z 0-9 characters'));
      }
      if (!name.trim()) {
        return perpspadPipelineException('Invalid direct DBC launch input', new Error('invalid_name: display name is required'));
      }
      if (!isValidSolanaAddress(agentWallet)) {
        return perpspadPipelineException('Invalid direct DBC launch input', new Error('invalid_agentWallet: must be a valid Solana address'));
      }
      if (!isValidSolanaAddress(payer)) {
        return perpspadPipelineException('Invalid direct DBC launch input', new Error('invalid_payer: must be a valid Solana address'));
      }
      if (!(Number.isFinite(devBuyAmount) && devBuyAmount >= 0)) {
        return perpspadPipelineException('Invalid direct DBC launch input', new Error('invalid_devBuyAmount: must be a non-negative quote-token amount'));
      }
      const latestBlockhash = String(input.latestBlockhash ?? '').trim();
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(latestBlockhash)) {
        return perpspadPipelineException('Invalid direct DBC launch input', new Error('invalid_latestBlockhash: fetch a fresh blockhash via getLatestBlockhash and pass it here'));
      }

      // Quote: SOL (default) | USDC | custom via quoteMint (SPL 6-9 decimals).
      const quote = typeof input.quote === 'string' ? input.quote.trim().toUpperCase() : 'SOL';
      const quoteMintStr = quote === 'USDC'
        ? USDC_MINT.toBase58()
        : (typeof input.quoteMint === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input.quoteMint)
          ? input.quoteMint
          : (quote === 'SOL' ? WSOL_MINT.toBase58() : ''));
      if (!quoteMintStr) {
        return perpspadPipelineException('Invalid direct DBC launch input', new Error('invalid_quote: use quote="SOL"|"USDC", or pass a valid 32-44 char base58 quoteMint (SPL mint, 6-9 decimals, no transfer fee).'));
      }

      // Perp backing policy: all-or-nothing triple, fail-fast on violations.
      const { policy: backingPolicy, error: backingError } = parseBackingPolicy(input);
      if (backingError) {
        return perpspadPipelineException('Invalid direct DBC launch input', backingError);
      }

      const configKeypair = Keypair.generate();
      const mintKeypair = Keypair.generate();
      const { escrowPda, bump } = deriveEscrowPda(mintKeypair.publicKey);

      // Prefer a content-addressed metadata URI uploaded before the launch.
      // metadataBaseUrl remains available for backward-compatible clients.
      const permanentMetadataUri = typeof input.metadataUri === 'string'
        ? input.metadataUri.trim()
        : '';
      const metadataBaseUrl = typeof input.metadataBaseUrl === 'string'
        ? input.metadataBaseUrl.replace(/\/$/, '')
        : 'https://steve.oobeprotocol.ai/api/launchpad/metadata';
      if (permanentMetadataUri && !permanentMetadataUri.startsWith('https://')) {
        return perpspadPipelineException('Invalid direct DBC launch input', new Error('metadataUri must use HTTPS'));
      }
      if (!permanentMetadataUri && !metadataBaseUrl.startsWith('https://')) {
        return perpspadPipelineException('Invalid direct DBC launch input', new Error('metadataBaseUrl must use HTTPS'));
      }
      const uri = permanentMetadataUri || `${metadataBaseUrl}/${mintKeypair.publicKey.toBase58()}`;

      // latestBlockhash comes from the CALLER (fetched client-side moments
      // before signing) — a server-side fetch here produced blockhashes that
      // were stale/invalid on mainnet by the time the client signed.

      // Quote mint decimals from the chain (validates the mint exists) plus
      // the owner program — Token-2022 quote mints (xStocks) need
      // token_quote_program = Token-2022 in the pool tx.
      const quoteMint = new PublicKey(quoteMintStr);
      const { getConnection } = await import('./../phoenix/phoenix-helpers.js');
      const conn = getConnection(context);
      const [quoteDecimals, quoteMintInfo] = await Promise.all([
        getQuoteDecimals(conn, quoteMint),
        conn.getAccountInfo(quoteMint),
      ]);
      const quoteMintOwner = quoteMintInfo ? quoteMintInfo.owner : undefined;
      if (!quoteMintOwner || (!quoteMintOwner.equals(TOKEN_PROGRAM_ID) && !quoteMintOwner.equals(TOKEN_2022_PROGRAM_ID))) {
        throw new Error('Quote mint must be owned by SPL Token or Token-2022');
      }
      const quoteMintState = await getMint(conn, quoteMint, 'confirmed', quoteMintOwner);
      const extensionTypes = getExtensionTypes(quoteMintState.tlvData);
      // Passive metadata/display extensions do not change transfer account
      // requirements. Active extensions need dedicated DBC/escrow builders
      // (hook slices, memos, fee accounting, thaw/pause policy, etc.).
      const passiveExtensions = new Set<number>([3, 10, 18, 19, 20, 21, 22, 23, 25]);
      const unsupportedExtensions = extensionTypes.filter((extension) => !passiveExtensions.has(extension));
      if (unsupportedExtensions.length > 0) {
        const labels = unsupportedExtensions.map(
          (extension) => ExtensionType[extension] ?? `Unknown(${extension})`,
        );
        throw new Error(`Quote mint uses unsupported Token-2022 transfer semantics: ${labels.join(', ')}`);
      }
      const { resolveQuoteUnitsPerSol } = await import('./dbc-config-preview.js');
      const quoteUnitsPerSol = resolveQuoteUnitsPerSol(
        quoteMintStr,
        typeof input.quotePriceUsd === 'number' ? input.quotePriceUsd : undefined,
        typeof input.solPriceUsd === 'number' ? input.solPriceUsd : undefined,
      );

      const built = buildDirectDbcLaunch({
        configKeypair,
        mintKeypair,
        escrowPda,
        agentWallet: new PublicKey(agentWallet),
        payer: new PublicKey(payer),
        latestBlockhash,
        metadata: { name: name.trim(), symbol: ticker, uri },
        quoteMint,
        quoteDecimals,
        quoteUnitsPerSol,
        quoteMintOwner,
      });

      // initialize_escrow instruction (third tx) — the existing helper.
      const initEscrowIx = buildInitializeEscrowInstruction({
        escrowPda,
        tokenMint: mintKeypair.publicKey,
        agentWallet: new PublicKey(agentWallet),
        payer: new PublicKey(payer),
      });
      const escrowTx = new Transaction().add(initEscrowIx);
      escrowTx.recentBlockhash = latestBlockhash;
      escrowTx.feePayer = new PublicKey(payer);
      // NO ephemeral signature needed — the payer is the only signer.

      logger.debug('Direct DBC launch built', {
        ticker,
        configAddress: built.configAddress,
        poolAddress: built.poolAddress,
        escrowPda: escrowPda.toBase58(),
      });

      return perpspadPipelineOk({
        success: true,
        directDbc: true,
        tokenMint: mintKeypair.publicKey.toBase58(),
        configAddress: built.configAddress,
        poolAddress: built.poolAddress,
        escrowPda: escrowPda.toBase58(),
        escrowBump: bump,
        agentWallet,
        payer,
        devBuyAmount,
        devBuyRequired: devBuyAmount > 0,
        split: { agentBps: 7000, oobeBps: 3000, oobeTreasury: OOBE_TREASURY },
        // Perp backing policy — present ONLY when the caller passed the full
        // triple; the keeper reads it to open the hedge legs. Absent = clean
        // pure-curve token.
        ...(backingPolicy ? { backingPolicy } : {}),
        transactions: {
          bootstrapLaunch: {
            base64: built.bootstrapTxBase64,
            note: 'Atomic createConfig + initializePool, co-signed by both ephemeral keypairs.',
          },
          createConfig: {
            base64: built.configTxBase64,
            note: 'Co-signed by the config keypair (gateway). The payer wallet adds its signature client-side.',
          },
          initializePool: {
            base64: built.poolTxBase64,
            note: 'Co-signed by the mint keypair (gateway). The payer wallet adds its signature client-side.',
          },
          transferPoolCreator: {
            base64: built.transferCreatorTxBase64,
            note: 'Moves pool creatorship payer → escrow PDA (DBC transfer_pool_creator). Payer-signed only. REQUIRED: only pool.creator can claim trading fees, and the escrow PDA must be the creator for claim_and_split to work.',
          },
          initializeEscrow: {
            programId: ESCROW_PROGRAM_ID,
            accounts: {
              escrowPda: escrowPda.toBase58(),
              tokenMint: mintKeypair.publicKey.toBase58(),
              agentWallet,
              payer,
              systemProgram: '11111111111111111111111111111111',
            },
            data: [0],
            note: 'Build with buildInitializeEscrowInstruction client-side; sign with the payer wallet.',
          },
        },
        signingOrder: ['createConfig', 'initializePool', 'transferPoolCreator', 'initializeEscrow'],
        nextStep: `Send bootstrapLaunch, transferPoolCreator, and initializeEscrow in order. Then call sap_meteora_build_launchpad_trade with side="buy", this DBC pool, devBuyAmount as a decimal string, and a fresh blockhash.`,
        _note: 'Semi-signed transactions only — never broadcasts. The ephemeral keypairs control nothing of value and are discarded.',
      });
    } catch (err) {
      return perpspadPipelineException('Failed to build direct DBC launch', err);
    }
  });
  }

  for (const toolName of [STEVE_DBC_DEV_BUY_TOOL, LEGACY_DBC_DEV_BUY_TOOL] as const) {
  registerPerpspadPipelineTool(server, context, toolName, {
    description: `${toolName === LEGACY_DBC_DEV_BUY_TOOL ? 'DEPRECATED alias; use sap_steve_launch_build_dbc_dev_buy. ' : ''}Legacy DBC-only initial-buy builder. New integrations must use sap_meteora_build_launchpad_trade, which supports buy/sell, exact decimal amounts, curve-capacity errors, and automatic routing after DAMM v2 graduation.`,
    inputSchema: {
      type: 'object',
      properties: {
        poolAddress: { type: 'string' }, owner: { type: 'string' }, amount: { type: 'number', exclusiveMinimum: 0 },
        latestBlockhash: { type: 'string' }, slippageBps: { type: 'number', minimum: 1, maximum: 5000 },
      },
      required: ['poolAddress', 'owner', 'amount', 'latestBlockhash'],
    },
  }, async (input) => {
    try {
      const poolAddress = String(input.poolAddress ?? '');
      const owner = String(input.owner ?? '');
      const amount = Number(input.amount);
      const latestBlockhash = String(input.latestBlockhash ?? '');
      if (!isValidSolanaAddress(poolAddress) || !isValidSolanaAddress(owner) || !Number.isFinite(amount) || amount <= 0) {
        throw new Error('poolAddress, owner and a positive amount are required');
      }
      const { getConnection } = await import('./../phoenix/phoenix-helpers.js');
      const connection = getConnection(context);
      const client = DynamicBondingCurveClient.create(connection, 'confirmed');
      const pool = await client.state.getPool(poolAddress);
      if (!pool || pool.poolState.isMigrated) throw new Error(pool ? 'DBC pool already migrated' : 'DBC pool not found');
      const virtualPool = pool.poolState;
      const config = await client.state.getPoolConfig(virtualPool.config);
      if (!config) throw new Error('DBC config not found');
      const decimals = await getQuoteDecimals(connection, config.quoteMint);
      const amountIn = toQuoteBaseUnits(amount, decimals);
      const currentPoint = await getCurrentPoint(connection, config.activationType);
      const quoteResult = client.pool.swapQuote2({
        virtualPool: pool, config, swapBaseForQuote: false,
        swapMode: SwapMode.PartialFill, amountIn,
        slippageBps: typeof input.slippageBps === 'number' ? input.slippageBps : 300,
        hasReferral: false, eligibleForFirstSwapWithMinFee: true, currentPoint,
      });
      const amountLeft = quoteResult.amountLeft ?? new BN(0);
      const consumedAmountIn = BN.max(amountIn.sub(amountLeft), new BN(0));
      if (consumedAmountIn.isZero()) throw new Error('bonding curve is complete and migration is being finalized');
      const minimumAmountOut = quoteResult.minimumAmountOut ?? quoteResult.outputAmount;
      const tx = await client.pool.swap2({ owner: new PublicKey(owner), pool: new PublicKey(poolAddress),
        swapMode: SwapMode.PartialFill, amountIn, minimumAmountOut,
        swapBaseForQuote: false, referralTokenAccount: null });
      tx.recentBlockhash = latestBlockhash;
      tx.feePayer = new PublicKey(owner);
      return perpspadPipelineOk({ success: true, poolAddress, amount, quoteMint: config.quoteMint.toBase58(),
        requestedAmountInRaw: amountIn.toString(), consumedAmountInRaw: consumedAmountIn.toString(),
        unusedAmountInRaw: amountLeft.toString(), partialFill: amountLeft.gt(new BN(0)),
        minimumAmountOut: minimumAmountOut.toString(),
        transactionBase64: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64') });
    } catch (err) {
      return perpspadPipelineException('Failed to build DBC dev-buy', err);
    }
  });
  }
}

// Registry-derivation helpers re-exported for the metadata endpoint + tests.
export { deriveDbcPool, deriveMintMetadata, METADATA_PROGRAM_ID };
