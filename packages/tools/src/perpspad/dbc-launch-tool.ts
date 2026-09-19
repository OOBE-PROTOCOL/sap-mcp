/**
 * @name tools/perpspad/dbc-launch-tool
 * @description Registers `sap_perpspad_launch_dbc` — the DIRECT Meteora DBC
 *   launch builder (Option 2). Replaces PerpsPad's unsignable /api/v1/launch
 *   response with locally-built, co-signed transactions. Feature parity with
 *   the legacy build_launch: same inputs (ticker, name, dev-buy, perp backing
 *   recorded as metadata), plus the escrow split wired in.
 */

import { Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import BN from 'bn.js';
import { DynamicBondingCurveClient, getCurrentPoint } from '@meteora-ag/dynamic-bonding-curve-sdk';
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
import {
  createAssociatedTokenAccountIdempotentInstruction,
  ExtensionType,
  getAssociatedTokenAddressSync,
  getExtensionTypes,
  getMint,
} from '@solana/spl-token';
import {
  buildInitializeEscrowInstruction,
  buildInitializeRewardVaultInstruction,
  deriveEscrowPda,
  deriveRewardVaultPda,
  isValidSolanaAddress,
} from './perpspad-escrow.js';
import { registerPerpspadPipelineTool, perpspadPipelineOk, perpspadPipelineException } from './perpspad-pipeline.js';

const OOBE_TREASURY = 'BiHdXQqNXTgMrNikZxw4CMnD1z1t6K2tmtwyXgSWSKqR';
const ESCROW_PROGRAM_ID = 'ENpvWhtTtnveMZ3WHpGKHMEYDrPHHc5v6JjjVUWFNYgA';
const JUPITER_V6_PROGRAM_ID = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';

interface RewardVaultConfig {
  quoteMint: PublicKey;
  rewardMint: PublicKey;
  quoteTokenProgram: PublicKey;
  rewardTokenProgram: PublicKey;
  executor: PublicKey;
  maxInputPerSwap: bigint;
  maxSlippageBps: number;
}

export function decodeRewardVault(data: Buffer): RewardVaultConfig {
  if (data.length !== 320) throw new Error('Invalid RewardVault account length');
  return {
    executor: new PublicKey(data.subarray(104, 136)),
    quoteMint: new PublicKey(data.subarray(136, 168)),
    rewardMint: new PublicKey(data.subarray(168, 200)),
    quoteTokenProgram: new PublicKey(data.subarray(200, 232)),
    rewardTokenProgram: new PublicKey(data.subarray(232, 264)),
    maxInputPerSwap: data.readBigUInt64LE(264),
    maxSlippageBps: data.readUInt16LE(272),
  };
}

function jupiterBaseUrl(): string {
  return (process.env.SAP_MCP_JUPITER_API_BASE_URL || 'https://api.jup.ag')
    .replace(/\/(swap|ultra)\/v\d+\/?$/, '')
    .replace(/\/$/, '');
}

function jupiterHeaders(): Record<string, string> {
  const apiKey = process.env.SAP_MCP_JUPITER_API_KEY?.trim() || process.env.JUPITER_API_KEY?.trim();
  return { 'content-type': 'application/json', ...(apiKey ? { 'x-api-key': apiKey } : {}) };
}

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

/** inputSchema for `sap_perpspad_launch_dbc` (exported for unit tests). */
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
    feeStrategy: { type: 'string', enum: ['classic', 'perpetual', 'marketRewards'], description: 'Creator 70% routing strategy. Market Rewards routes the creator share into an immutable reward vault.' },
    rewardMint: { type: 'string', description: 'Market Rewards only: canonical SPL/Token-2022 asset mint bought with the creator share.' },
    maxRewardSwapAmount: { type: 'number', description: 'Market Rewards only: maximum quote-token units converted by one keeper swap.' },
    rewardSlippageBps: { type: 'number', minimum: 1, maximum: 2000, description: 'Market Rewards only: maximum swap slippage, in basis points.' },
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

/** Registers `sap_perpspad_launch_dbc` on the MCP server. */
export function registerDbcLaunchTool(
  server: Parameters<typeof registerPerpspadPipelineTool>[0],
  context: Parameters<typeof registerPerpspadPipelineTool>[1],
): void {
  registerPerpspadPipelineTool(server, context, 'sap_perpspad_launch_dbc', {
    description: 'Build a direct Meteora DBC launch: create config, initialize pool, transfer creator authority to the 70/30 escrow PDA, then initialize escrow. A requested initial buy is built separately after pool confirmation with sap_perpspad_build_dbc_dev_buy and a fresh blockhash. Supports SOL, USDC, and validated SPL/Token-2022 quote mints.',
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

      const feeStrategy = input.feeStrategy === 'marketRewards'
        ? 'marketRewards'
        : input.feeStrategy === 'perpetual' ? 'perpetual' : 'classic';
      if (feeStrategy === 'marketRewards' && process.env.MARKET_REWARDS_ENABLED !== 'true') {
        return perpspadPipelineException(
          'Market Rewards is not active',
          new Error('market_rewards_not_active: program upgrade and keeper readiness must be verified before enabling launches'),
        );
      }
      const rewardMintInput = typeof input.rewardMint === 'string' ? input.rewardMint.trim() : '';
      if (feeStrategy === 'marketRewards' && !isValidSolanaAddress(rewardMintInput)) {
        return perpspadPipelineException('Invalid direct DBC launch input', new Error('invalid_rewardMint: Market Rewards requires a valid canonical reward mint'));
      }
      const marketRewardsExecutor = String(process.env.MARKET_REWARDS_EXECUTOR ?? '').trim();
      if (feeStrategy === 'marketRewards' && !isValidSolanaAddress(marketRewardsExecutor)) {
        return perpspadPipelineException('Market Rewards is not configured', new Error('invalid_market_rewards_executor'));
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
      const { rewardVaultPda, bump: rewardVaultBump } = deriveRewardVaultPda(mintKeypair.publicKey);

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
      const unsafeExtensions = new Set([
        ExtensionType.TransferFeeConfig,
        ExtensionType.NonTransferable,
        ExtensionType.PermanentDelegate,
      ]);
      const extensionTypes = getExtensionTypes(quoteMintState.tlvData);
      if (extensionTypes.some((extension) => unsafeExtensions.has(extension))) {
        throw new Error(`Quote mint uses unsupported Token-2022 extensions: ${extensionTypes.join(',')}`);
      }

      let rewardMint: PublicKey | undefined;
      let maxRewardSwapBaseUnits: bigint | undefined;
      const rewardSlippageBps = typeof input.rewardSlippageBps === 'number' ? input.rewardSlippageBps : 300;
      if (feeStrategy === 'marketRewards') {
        rewardMint = new PublicKey(rewardMintInput);
        const rewardMintInfo = await conn.getAccountInfo(rewardMint);
        if (!rewardMintInfo || (!rewardMintInfo.owner.equals(TOKEN_PROGRAM_ID) && !rewardMintInfo.owner.equals(TOKEN_2022_PROGRAM_ID))) {
          throw new Error('Reward mint must be owned by SPL Token or Token-2022');
        }
        const rewardMintState = await getMint(conn, rewardMint, 'confirmed', rewardMintInfo.owner);
        const rewardExtensions = getExtensionTypes(rewardMintState.tlvData);
        if (rewardExtensions.some((extension) => unsafeExtensions.has(extension))) {
          throw new Error(`Reward mint uses unsupported Token-2022 extensions: ${rewardExtensions.join(',')}`);
        }
        const maxRewardSwapAmount = typeof input.maxRewardSwapAmount === 'number' ? input.maxRewardSwapAmount : 1;
        maxRewardSwapBaseUnits = BigInt(toQuoteBaseUnits(maxRewardSwapAmount, quoteDecimals).toString());
      }

      const built = buildDirectDbcLaunch({
        configKeypair,
        mintKeypair,
        escrowPda,
        agentWallet: feeStrategy === 'marketRewards' ? rewardVaultPda : new PublicKey(agentWallet),
        payer: new PublicKey(payer),
        latestBlockhash,
        metadata: { name: name.trim(), symbol: ticker, uri },
        quoteMint,
        quoteDecimals,
        quoteMintOwner,
      });

      // initialize_escrow instruction (third tx) — the existing helper.
      const initEscrowIx = buildInitializeEscrowInstruction({
        escrowPda,
        tokenMint: mintKeypair.publicKey,
        agentWallet: feeStrategy === 'marketRewards' ? rewardVaultPda : new PublicKey(agentWallet),
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

      const initializeRewardVault = rewardMint && maxRewardSwapBaseUnits
        ? buildInitializeRewardVaultInstruction({
          rewardVaultPda,
          escrowPda,
          tokenMint: mintKeypair.publicKey,
          dbcPool: new PublicKey(built.poolAddress),
          quoteMint,
          rewardMint,
          creator: new PublicKey(agentWallet),
          executor: new PublicKey(marketRewardsExecutor),
          payer: new PublicKey(payer),
          maxInputPerSwap: maxRewardSwapBaseUnits,
          maxSlippageBps: rewardSlippageBps,
        })
        : undefined;

      return perpspadPipelineOk({
        success: true,
        directDbc: true,
        tokenMint: mintKeypair.publicKey.toBase58(),
        configAddress: built.configAddress,
        poolAddress: built.poolAddress,
        escrowPda: escrowPda.toBase58(),
        escrowBump: bump,
        agentWallet,
        feeStrategy,
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
              agentWallet: feeStrategy === 'marketRewards' ? rewardVaultPda.toBase58() : agentWallet,
              payer,
              systemProgram: '11111111111111111111111111111111',
            },
            data: [0],
            note: 'Build with buildInitializeEscrowInstruction client-side; sign with the payer wallet.',
          },
          ...(initializeRewardVault ? {
            initializeRewardVault: {
              programId: ESCROW_PROGRAM_ID,
              accounts: {
                rewardVaultPda: rewardVaultPda.toBase58(), escrowPda: escrowPda.toBase58(),
                tokenMint: mintKeypair.publicKey.toBase58(), dbcPool: built.poolAddress,
                quoteMint: quoteMint.toBase58(), rewardMint: rewardMint!.toBase58(), creator: agentWallet,
                executor: marketRewardsExecutor, payer,
              },
              data: [...initializeRewardVault.data],
              rewardVaultBump,
              note: 'Send after initializeEscrow. The agent and payer sign; reward mint and risk limits become immutable.',
            },
          } : {}),
        },
        signingOrder: ['createConfig', 'initializePool', 'transferPoolCreator', 'initializeEscrow', ...(initializeRewardVault ? ['initializeRewardVault'] : [])],
        nextStep: `Send bootstrapLaunch, transferPoolCreator, and initializeEscrow in order. Then call sap_perpspad_build_dbc_dev_buy with this pool and devBuyAmount using a fresh blockhash.`,
        _note: 'Semi-signed transactions only — never broadcasts. The ephemeral keypairs control nothing of value and are discarded.',
      });
    } catch (err) {
      return perpspadPipelineException('Failed to build direct DBC launch', err);
    }
  });

  registerPerpspadPipelineTool(server, context, 'sap_perpspad_build_market_reward_swap', {
    description: 'Build an executor-signed Jupiter conversion of accrued creator quote fees into the immutable Market Rewards asset. Returns an unsigned transaction and never broadcasts.',
    inputSchema: {
      type: 'object',
      properties: {
        tokenMint: { type: 'string' },
        amount: { type: 'number', exclusiveMinimum: 0, description: 'Quote-token units to convert.' },
        latestBlockhash: { type: 'string' },
      },
      required: ['tokenMint', 'amount', 'latestBlockhash'],
    },
  }, async (input) => {
    try {
      if (process.env.MARKET_REWARDS_ENABLED !== 'true') throw new Error('market_rewards_not_active');
      const tokenMint = new PublicKey(String(input.tokenMint ?? ''));
      const executor = new PublicKey(String(process.env.MARKET_REWARDS_EXECUTOR ?? ''));
      const amount = Number(input.amount);
      const latestBlockhash = String(input.latestBlockhash ?? '');
      if (!Number.isFinite(amount) || amount <= 0 || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(latestBlockhash)) {
        throw new Error('A positive amount and fresh blockhash are required');
      }
      const { rewardVaultPda } = deriveRewardVaultPda(tokenMint);
      const { getConnection } = await import('./../phoenix/phoenix-helpers.js');
      const connection = getConnection(context);
      const vaultInfo = await connection.getAccountInfo(rewardVaultPda, 'confirmed');
      if (!vaultInfo || !vaultInfo.owner.equals(new PublicKey(ESCROW_PROGRAM_ID))) throw new Error('RewardVault not found');
      const vault = decodeRewardVault(vaultInfo.data);
      if (!vault.executor.equals(executor)) throw new Error('Configured executor does not match immutable RewardVault executor');
      const quoteMint = await getMint(connection, vault.quoteMint, 'confirmed', vault.quoteTokenProgram);
      const amountIn = BigInt(toQuoteBaseUnits(amount, quoteMint.decimals).toString());
      if (amountIn > vault.maxInputPerSwap) throw new Error('Amount exceeds immutable maxInputPerSwap');

      const quoteAta = getAssociatedTokenAddressSync(vault.quoteMint, rewardVaultPda, true, vault.quoteTokenProgram);
      const rewardAta = getAssociatedTokenAddressSync(vault.rewardMint, rewardVaultPda, true, vault.rewardTokenProgram);
      const quoteUrl = new URL(`${jupiterBaseUrl()}/swap/v1/quote`);
      quoteUrl.searchParams.set('inputMint', vault.quoteMint.toBase58());
      quoteUrl.searchParams.set('outputMint', vault.rewardMint.toBase58());
      quoteUrl.searchParams.set('amount', amountIn.toString());
      quoteUrl.searchParams.set('slippageBps', String(vault.maxSlippageBps));
      quoteUrl.searchParams.set('swapMode', 'ExactIn');
      quoteUrl.searchParams.set('maxAccounts', '20');
      const quoteResponse = await fetch(quoteUrl, { headers: jupiterHeaders() }).then(async (response) => {
        if (!response.ok) throw new Error(`Jupiter quote failed (${response.status})`);
        return response.json() as Promise<Record<string, unknown>>;
      });
      const expectedOut = BigInt(String(quoteResponse.outAmount ?? '0'));
      const minimumOut = BigInt(String(quoteResponse.otherAmountThreshold ?? '0'));
      if (expectedOut <= 0n || minimumOut <= 0n) throw new Error('Jupiter returned an empty quote');

      const swapEnvelope = await fetch(`${jupiterBaseUrl()}/swap/v1/swap-instructions`, {
        method: 'POST', headers: jupiterHeaders(),
        body: JSON.stringify({
          userPublicKey: rewardVaultPda.toBase58(), payer: executor.toBase58(), quoteResponse,
          destinationTokenAccount: rewardAta.toBase58(), wrapAndUnwrapSol: false,
          useSharedAccounts: true, dynamicComputeUnitLimit: false,
          skipUserAccountsRpcCalls: true, asLegacyTransaction: true,
        }),
      }).then(async (response) => {
        if (!response.ok) throw new Error(`Jupiter swap-instructions failed (${response.status})`);
        return response.json() as Promise<Record<string, unknown>>;
      });
      const swap = swapEnvelope.swapInstruction as {
        programId?: string;
        data?: string;
        accounts?: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
      } | undefined;
      if (!swap || swap.programId !== JUPITER_V6_PROGRAM_ID || !swap.data || !Array.isArray(swap.accounts)) {
        throw new Error('Jupiter returned an unsupported swap instruction');
      }
      if (swap.accounts.some((account) => account.isSigner && account.pubkey !== rewardVaultPda.toBase58())) {
        throw new Error('Jupiter route requested an unexpected signer');
      }
      const decodeJupiterIx = (value: unknown): TransactionInstruction => {
        const ix = value as { programId?: string; data?: string; accounts?: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }> };
        if (!ix?.programId || typeof ix.data !== 'string' || !Array.isArray(ix.accounts)) {
          throw new Error('Jupiter returned a malformed setup instruction');
        }
        if (ix.accounts.some((account) => account.isSigner && account.pubkey !== executor.toBase58())) {
          throw new Error('Jupiter setup requested an unexpected signer');
        }
        return new TransactionInstruction({
          programId: new PublicKey(ix.programId), data: Buffer.from(ix.data, 'base64'),
          keys: ix.accounts.map((account) => ({
            pubkey: new PublicKey(account.pubkey), isSigner: account.isSigner, isWritable: account.isWritable,
          })),
        });
      };
      const preInstructions = [
        ...((swapEnvelope.computeBudgetInstructions as unknown[] | undefined) ?? []),
        ...((swapEnvelope.setupInstructions as unknown[] | undefined) ?? []),
        ...((swapEnvelope.otherInstructions as unknown[] | undefined) ?? []),
      ].map(decodeJupiterIx);
      if (swapEnvelope.cleanupInstruction) throw new Error('Wrapped SOL cleanup is not allowed for Market Rewards');

      const swapData = Buffer.from(swap.data, 'base64');
      const wrapperData = Buffer.alloc(25 + swapData.length);
      wrapperData[0] = 4;
      wrapperData.writeBigUInt64LE(amountIn, 1);
      wrapperData.writeBigUInt64LE(minimumOut, 9);
      wrapperData.writeBigUInt64LE(expectedOut, 17);
      swapData.copy(wrapperData, 25);
      const wrapperIx = new TransactionInstruction({
        programId: new PublicKey(ESCROW_PROGRAM_ID),
        keys: [
          { pubkey: rewardVaultPda, isSigner: false, isWritable: true },
          { pubkey: quoteAta, isSigner: false, isWritable: true },
          { pubkey: rewardAta, isSigner: false, isWritable: true },
          { pubkey: executor, isSigner: true, isWritable: true },
          { pubkey: new PublicKey(JUPITER_V6_PROGRAM_ID), isSigner: false, isWritable: false },
          ...swap.accounts.map((account) => ({
            pubkey: new PublicKey(account.pubkey),
            isSigner: false,
            isWritable: account.isWritable,
          })),
        ],
        data: wrapperData,
      });
      const tx = new Transaction().add(
        ...preInstructions,
        createAssociatedTokenAccountIdempotentInstruction(executor, quoteAta, rewardVaultPda, vault.quoteMint, vault.quoteTokenProgram),
        createAssociatedTokenAccountIdempotentInstruction(executor, rewardAta, rewardVaultPda, vault.rewardMint, vault.rewardTokenProgram),
        wrapperIx,
      );
      tx.feePayer = executor;
      tx.recentBlockhash = latestBlockhash;
      return perpspadPipelineOk({
        success: true, tokenMint: tokenMint.toBase58(), rewardVault: rewardVaultPda.toBase58(),
        quoteMint: vault.quoteMint.toBase58(), rewardMint: vault.rewardMint.toBase58(),
        amountIn: amountIn.toString(), expectedOut: expectedOut.toString(), minimumOut: minimumOut.toString(),
        transactionBase64: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
        safeToApprove: true, approvalBlocked: false,
      });
    } catch (err) {
      return perpspadPipelineException('Failed to build Market Rewards conversion', err);
    }
  });

  registerPerpspadPipelineTool(server, context, 'sap_perpspad_build_dbc_dev_buy', {
    description: 'Build an unsigned exact-in initial buy for an existing Meteora DBC pool. Call only after initializePool confirms; amount is denominated in the pool quote token.',
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
      const quoteResult = client.pool.swapQuote({
        virtualPool: pool, config, swapBaseForQuote: false, amountIn,
        slippageBps: typeof input.slippageBps === 'number' ? input.slippageBps : 300,
        hasReferral: false, eligibleForFirstSwapWithMinFee: true, currentPoint,
      });
      const tx = await client.pool.swap({ owner: new PublicKey(owner), pool: new PublicKey(poolAddress), amountIn,
        minimumAmountOut: quoteResult.minimumAmountOut, swapBaseForQuote: false, referralTokenAccount: null });
      tx.recentBlockhash = latestBlockhash;
      tx.feePayer = new PublicKey(owner);
      return perpspadPipelineOk({ success: true, poolAddress, amount, quoteMint: config.quoteMint.toBase58(),
        minimumAmountOut: quoteResult.minimumAmountOut.toString(), transactionBase64: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64') });
    } catch (err) {
      return perpspadPipelineException('Failed to build DBC dev-buy', err);
    }
  });
}

// Registry-derivation helpers re-exported for the metadata endpoint + tests.
export { deriveDbcPool, deriveMintMetadata, METADATA_PROGRAM_ID };
