/**
 * @name perps/adrena/adrena-builder-commodity
 * @description Commodity (synthetic perps) builders for the Adrena perps protocol.
 *
 * Contains builders for opening/closing long and short commodity positions
 * (XAU, XAG, WTI) using the commodities pool, plus internal shared builders
 * for pool-agnostic operations.
 *
 * @module perps/adrena/adrena-builder-commodity
 */

import {
  PublicKey,
  Connection,
} from '@solana/web3.js';
import {
  ADRENA_CUSTODIES,
  ADRENA_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
} from './adrena-constants.js';
import {
  deriveCortexPda,
  deriveOraclePda,
  deriveTransferAuthorityPda,
  deriveUserProfilePda,
  derivePositionPda,
  deriveAta,
} from './adrena-pda.js';
import {
  type PositionSide,
  type AdrenaPool,
  type BalanceCheck,
  type UnsignedTransactionResult,
  toBN,
  toBNOrNull,
  getPoolPublicKey,
  getCustodyPublicKey,
  getMintPublicKey,
  fetchOraclePrice,
  readCustodyTokenAccount,
  getWalletTokenBalances,
  checkSufficientBalance,
  encodeAdrenaLeverage,
  ensureUserProfileInstructions,
  ensureAtaInstructions,
  createAdrenaProgram,
  buildInstruction,
  serializeUnsignedTx,
  buildResult,
  assertAdrenaSimulationPassed,
} from './adrena-builder-core.js';

// ─── Commodity Builders (synthetic perps) ──────────────────────────────────────

/**
 * @name buildOpenCommodityLong
 * @description Build an unsigned transaction to open a long position on a commodity (XAU, XAG, WTI).
 * Uses the commodities pool.
 *
 * @param connection — Solana RPC connection.
 * @param owner — Position owner and fee payer.
 * @param principalToken — Commodity symbol (XAU, XAG, WTI).
 * @param collateralAmount — USDC collateral amount in human-readable units.
 * @param leverage — Leverage multiplier.
 * @param price — Price in USD (scaled by 10^10), or null for market order.
 * @returns Unsigned transaction result.
 */
export async function buildOpenCommodityLong(
  connection: Connection,
  owner: PublicKey,
  principalToken: string,
  collateralAmount: number,
  leverage: number,
  price: bigint | null,
): Promise<UnsignedTransactionResult> {
  return buildOpenPositionLongInternal(connection, owner, principalToken, 'USDC', collateralAmount, leverage, price, 'commodities-pool', 'openOrIncreasePositionLong', 'long');
}

/**
 * @name buildOpenCommodityShort
 * @description Build an unsigned transaction to open a short position on a commodity.
 * Uses the commodities pool.
 *
 * @param connection — Solana RPC connection.
 * @param owner — Position owner and fee payer.
 * @param principalToken — Commodity symbol (XAU, XAG, WTI).
 * @param collateralAmount — USDC collateral amount in human-readable units.
 * @param leverage — Leverage multiplier.
 * @param price — Price in USD (scaled by 10^10), or null for market order.
 * @returns Unsigned transaction result.
 */
export async function buildOpenCommodityShort(
  connection: Connection,
  owner: PublicKey,
  principalToken: string,
  collateralAmount: number,
  leverage: number,
  price: bigint | null,
): Promise<UnsignedTransactionResult> {
  return buildOpenPositionLongInternal(connection, owner, principalToken, 'USDC', collateralAmount, leverage, price, 'commodities-pool', 'openOrIncreasePositionShort', 'short');
}

/**
 * @name buildCloseCommodityLong
 * @description Build an unsigned transaction to close a long commodity position.
 * @param connection — Solana RPC connection.
 * @param owner — Position owner and fee payer.
 * @param principalToken — Commodity symbol.
 * @param price — Optional close price.
 * @param percentage — Percentage to close.
 * @returns Unsigned transaction result.
 */
export async function buildCloseCommodityLong(
  connection: Connection,
  owner: PublicKey,
  principalToken: string,
  price: bigint | null,
  percentage: bigint = 1_000_000n,
): Promise<UnsignedTransactionResult> {
  return buildClosePositionLongInternal(connection, owner, principalToken, 'USDC', price, percentage, 'commodities-pool', 'closePositionLong', 'long');
}

/**
 * @name buildCloseCommodityShort
 * @description Build an unsigned transaction to close a short commodity position.
 * @param connection — Solana RPC connection.
 * @param owner — Position owner and fee payer.
 * @param principalToken — Commodity symbol.
 * @param price — Optional close price.
 * @param percentage — Percentage to close.
 * @returns Unsigned transaction result.
 */
export async function buildCloseCommodityShort(
  connection: Connection,
  owner: PublicKey,
  principalToken: string,
  price: bigint | null,
  percentage: bigint = 1_000_000n,
): Promise<UnsignedTransactionResult> {
  return buildClosePositionLongInternal(connection, owner, principalToken, 'USDC', price, percentage, 'commodities-pool', 'closePositionShort', 'short');
}

// ─── Internal shared builders for pool-agnostic operations ──────────────────────

async function buildOpenPositionLongInternal(
  connection: Connection,
  owner: PublicKey,
  principalToken: string,
  collateralToken: string,
  collateralAmount: number,
  leverage: number,
  price: bigint | null,
  poolName: AdrenaPool,
  ixName: string,
  side: PositionSide,
): Promise<UnsignedTransactionResult> {
  const program = createAdrenaProgram(connection);
  const pool = getPoolPublicKey(poolName);
  const custody = getCustodyPublicKey(principalToken, poolName);
  const collateralCustody = getCustodyPublicKey(collateralToken, poolName);
  const cortex = deriveCortexPda();
  const oracle = deriveOraclePda();
  const transferAuthority = deriveTransferAuthorityPda();
  const userProfile = deriveUserProfilePda(owner);
  const position = derivePositionPda(owner, pool, custody, side);
  const collateralCustodyTokenAccount = await readCustodyTokenAccount(connection, collateralCustody);
  const fundingAccount = deriveAta(owner, getMintPublicKey(collateralToken));
  const referrerProfile = null;

  const collateralRaw = BigInt(Math.floor(collateralAmount * Math.pow(10, ADRENA_CUSTODIES[collateralToken.toUpperCase() as keyof typeof ADRENA_CUSTODIES].decimals)));
  const priceRaw = price ?? await fetchOraclePrice(principalToken, side);

  // Ensure the funding ATA exists before the Adrena instruction.
  const collateralMint = getMintPublicKey(collateralToken);
  const preInstructions = await ensureAtaInstructions(connection, owner, collateralMint, owner);

  // Ensure user profile exists — Adrena requires it before opening positions.
  const profileInstructions = await ensureUserProfileInstructions(connection, owner);
  const allPreInstructions = [...preInstructions, ...profileInstructions];

  // Leverage is passed as BPS (basis points) to Adrena: 3x = 30000 BPS.
  const leverageBps = encodeAdrenaLeverage(leverage);

  const ix = await buildInstruction(program, ixName, [
    {
      price: toBN(priceRaw),
      collateral: toBN(collateralRaw),
      leverage: leverageBps,
      oraclePrices: null,
      multiOraclePrices: null,
    },
  ], {
    owner,
    payer: owner,
    fundingAccount,
    oracle,
    custody,
    collateralCustody,
    collateralCustodyTokenAccount,
    transferAuthority,
    cortex,
    pool,
    position,
    systemProgram: new PublicKey(SYSTEM_PROGRAM_ID),
    tokenProgram: new PublicKey(TOKEN_PROGRAM_ID),
    adrenaProgram: new PublicKey(ADRENA_PROGRAM_ID),
    userProfile,
    referrerProfile,
  });

  const _serializeResult = await serializeUnsignedTx(connection, owner, [...allPreInstructions, ix]);
  assertAdrenaSimulationPassed(_serializeResult, [ixName]);
  const transactionBase64 = _serializeResult.transactionBase64;

  // Pre-flight balance check (commodity positions use USDC collateral).
  const balanceCheck = await checkSufficientBalance(connection, owner, collateralToken, collateralAmount);
  const warning = !balanceCheck.sufficient
    ? `Insufficient ${collateralToken.toUpperCase()} balance: need ${collateralAmount}, have ${balanceCheck.availableBalance} (shortfall: ${balanceCheck.shortfall}). The transaction will fail on-chain.`
    : !balanceCheck.solSufficientForFees
      ? `Insufficient SOL for transaction fees: have ${balanceCheck.solBalance} SOL, need ~0.005 SOL.`
      : undefined;

  return buildResult(transactionBase64, owner, [ixName], position, balanceCheck, warning, undefined, leverage, _serializeResult);
}

async function buildClosePositionLongInternal(
  connection: Connection,
  owner: PublicKey,
  principalToken: string,
  collateralToken: string,
  price: bigint | null,
  percentage: bigint,
  poolName: AdrenaPool,
  ixName: string,
  side: PositionSide,
): Promise<UnsignedTransactionResult> {
  const program = createAdrenaProgram(connection);
  const pool = getPoolPublicKey(poolName);
  const custody = getCustodyPublicKey(principalToken, poolName);
  const collateralCustody = getCustodyPublicKey(collateralToken, poolName);
  const cortex = deriveCortexPda();
  const oracle = deriveOraclePda();
  const transferAuthority = deriveTransferAuthorityPda();
  const userProfile = deriveUserProfilePda(owner);
  const position = derivePositionPda(owner, pool, custody, side);
  const collateralCustodyTokenAccount = await readCustodyTokenAccount(connection, collateralCustody);
  const receivingAccount = deriveAta(owner, getMintPublicKey(collateralToken));
  const referrerProfile = null;

  // Ensure the receiving ATA exists before closing.
  const receivingMint = getMintPublicKey(collateralToken);
  const preInstructions = await ensureAtaInstructions(connection, owner, receivingMint, owner);

  // Ensure user profile exists — Adrena requires it for position operations.
  const profileInstructions = await ensureUserProfileInstructions(connection, owner);
  const allPreInstructions = [...preInstructions, ...profileInstructions];

  const ix = await buildInstruction(program, ixName, [
    {
      price: toBNOrNull(price),
      oraclePrices: null,
      multiOraclePrices: null,
      percentage: toBN(percentage),
    },
  ], {
    caller: owner,
    owner,
    receivingAccount,
    transferAuthority,
    cortex,
    pool,
    position,
    custody,
    oracle,
    collateralCustody,
    collateralCustodyTokenAccount,
    userProfile,
    referrerProfile,
    tokenProgram: new PublicKey(TOKEN_PROGRAM_ID),
    adrenaProgram: new PublicKey(ADRENA_PROGRAM_ID),
    systemProgram: new PublicKey(SYSTEM_PROGRAM_ID),
  });

  const _serializeResult = await serializeUnsignedTx(connection, owner, [...allPreInstructions, ix]);
  assertAdrenaSimulationPassed(_serializeResult, [ixName]);
  const transactionBase64 = _serializeResult.transactionBase64;

  // Pre-flight: show balances and check SOL for fees (close returns tokens, doesn't require collateral).
  const balances = await getWalletTokenBalances(connection, owner);
  const solBalance = balances.find(b => b.symbol === 'SOL')?.balance ?? 0;
  const warning = solBalance < 0.005
    ? `Insufficient SOL for transaction fees: have ${solBalance} SOL, need ~0.005 SOL.`
    : undefined;
  const balanceCheck: BalanceCheck = {
    wallet: owner.toBase58(),
    balances,
    requiredToken: 'NONE',
    requiredAmount: 0,
    availableBalance: 0,
    sufficient: true,
    shortfall: 0,
    solBalance,
    solSufficientForFees: solBalance >= 0.005,
  };

  return buildResult(transactionBase64, owner, [ixName], position, balanceCheck, warning, undefined, undefined, _serializeResult);
}
