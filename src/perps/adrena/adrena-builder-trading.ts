/**
 * @name perps/adrena/adrena-builder-trading
 * @description Trading position builders for the Adrena perps protocol.
 *
 * Contains builders for opening/closing long and short positions, stop loss,
 * take profit, and limit order operations.
 *
 * @module perps/adrena/adrena-builder-trading
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
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from './adrena-constants.js';
import {
  deriveCortexPda,
  deriveOraclePda,
  deriveTransferAuthorityPda,
  deriveUserProfilePda,
  derivePositionPda,
  deriveLimitOrderBookPda,
  deriveCollateralEscrowPda,
  deriveAta,
} from './adrena-pda.js';
import {
  type PositionSide,
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
  ensureUserProfileInstructions,
  ensureAtaInstructions,
  createAdrenaProgram,
  buildInstruction,
  serializeUnsignedTx,
  buildResult,
} from './adrena-builder-core.js';

// ─── Trading Builders ─────────────────────────────────────────────────────────

/**
 * @name buildOpenPositionLong
 * @description Build an unsigned transaction to open a long position on Adrena.
 *
 * @param connection — Solana RPC connection.
 * @param owner — Position owner and fee payer.
 * @param principalToken — Asset to trade (e.g. "JITOSOL").
 * @param collateralToken — Collateral token (must match principal for longs).
 * @param collateralAmount — Collateral amount in human-readable units (e.g. 10 = 10 JITOSOL).
 * @param leverage — Leverage multiplier.
 * @param price — Price in USD (scaled by 10^10), or null for market order.
 * @returns Unsigned transaction result.
 */
export async function buildOpenPositionLong(
  connection: Connection,
  owner: PublicKey,
  principalToken: string,
  collateralToken: string,
  collateralAmount: number,
  leverage: number,
  price: bigint | null,
): Promise<UnsignedTransactionResult> {
  const program = createAdrenaProgram(connection);
  const pool = getPoolPublicKey('main-pool');
  const custody = getCustodyPublicKey(principalToken, 'main-pool');
  const collateralCustody = getCustodyPublicKey(collateralToken, 'main-pool');
  const cortex = deriveCortexPda();
  const oracle = deriveOraclePda();
  const transferAuthority = deriveTransferAuthorityPda();
  const userProfile = deriveUserProfilePda(owner);
  const position = derivePositionPda(owner, pool, custody, 'long');
  const collateralCustodyTokenAccount = await readCustodyTokenAccount(connection, collateralCustody);
  const fundingAccount = deriveAta(owner, getMintPublicKey(collateralToken));
  const referrerProfile = null;

  const collateralRaw = BigInt(Math.floor(collateralAmount * Math.pow(10, ADRENA_CUSTODIES[collateralToken.toUpperCase() as keyof typeof ADRENA_CUSTODIES].decimals)));
  const priceRaw = price ?? await fetchOraclePrice(principalToken, 'long');

  // Ensure the funding ATA exists before the Adrena instruction.
  const collateralMint = getMintPublicKey(collateralToken);
  const preInstructions = await ensureAtaInstructions(connection, owner, collateralMint, owner);

  // Ensure user profile exists — Adrena requires it before opening positions.
  const profileInstructions = await ensureUserProfileInstructions(connection, owner);
  const allPreInstructions = [...preInstructions, ...profileInstructions];

  // Leverage is passed as BPS (basis points) to Adrena: 3x = 30000 BPS.
  // The SDK does: Math.floor(normalLeverage * BPS) where BPS = 10000.
  const leverageBps = Math.floor(leverage * 10000);

  const ix = await buildInstruction(program, 'openOrIncreasePositionLong', [
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

  // Pre-flight balance check.
  const balanceCheck = await checkSufficientBalance(connection, owner, collateralToken, collateralAmount);
  const warning = !balanceCheck.sufficient
    ? `Insufficient ${collateralToken.toUpperCase()} balance: need ${collateralAmount}, have ${balanceCheck.availableBalance} (shortfall: ${balanceCheck.shortfall}). The transaction will fail on-chain.`
    : !balanceCheck.solSufficientForFees
      ? `Insufficient SOL for transaction fees: have ${balanceCheck.solBalance} SOL, need ~0.005 SOL.`
      : undefined;

  const transactionBase64 = await serializeUnsignedTx(connection, owner, [...allPreInstructions, ix]);
  return buildResult(transactionBase64, owner, ['openOrIncreasePositionLong'], position, balanceCheck, warning);
}

/**
 * @name buildOpenPositionShort
 * @description Build an unsigned transaction to open a short position on Adrena.
 *
 * @param connection — Solana RPC connection.
 * @param owner — Position owner and fee payer.
 * @param principalToken — Asset to short (e.g. "JITOSOL").
 * @param collateralToken — Collateral token (must be USDC for shorts).
 * @param collateralAmount — Collateral amount in human-readable units.
 * @param leverage — Leverage multiplier.
 * @param price — Price in USD (scaled by 10^10), or null for market order.
 * @returns Unsigned transaction result.
 */
export async function buildOpenPositionShort(
  connection: Connection,
  owner: PublicKey,
  principalToken: string,
  collateralToken: string,
  collateralAmount: number,
  leverage: number,
  price: bigint | null,
): Promise<UnsignedTransactionResult> {
  const program = createAdrenaProgram(connection);
  const pool = getPoolPublicKey('main-pool');
  const custody = getCustodyPublicKey(principalToken, 'main-pool');
  const collateralCustody = getCustodyPublicKey(collateralToken, 'main-pool');
  const cortex = deriveCortexPda();
  const oracle = deriveOraclePda();
  const transferAuthority = deriveTransferAuthorityPda();
  const userProfile = deriveUserProfilePda(owner);
  const position = derivePositionPda(owner, pool, custody, 'short');
  const collateralCustodyTokenAccount = await readCustodyTokenAccount(connection, collateralCustody);
  const fundingAccount = deriveAta(owner, getMintPublicKey(collateralToken));
  const referrerProfile = null;

  const collateralRaw = BigInt(Math.floor(collateralAmount * Math.pow(10, ADRENA_CUSTODIES[collateralToken.toUpperCase() as keyof typeof ADRENA_CUSTODIES].decimals)));
  const priceRaw = price ?? await fetchOraclePrice(principalToken, 'short');

  // Ensure the funding ATA exists before the Adrena instruction.
  const collateralMint = getMintPublicKey(collateralToken);
  const preInstructions = await ensureAtaInstructions(connection, owner, collateralMint, owner);

  // Ensure user profile exists — Adrena requires it before opening positions.
  const profileInstructions = await ensureUserProfileInstructions(connection, owner);
  const allPreInstructions = [...preInstructions, ...profileInstructions];

  // Leverage is passed as BPS (basis points) to Adrena: 3x = 30000 BPS.
  const leverageBps = Math.floor(leverage * 10000);

  const ix = await buildInstruction(program, 'openOrIncreasePositionShort', [
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

  // Pre-flight balance check.
  const balanceCheck = await checkSufficientBalance(connection, owner, collateralToken, collateralAmount);
  const warning = !balanceCheck.sufficient
    ? `Insufficient ${collateralToken.toUpperCase()} balance: need ${collateralAmount}, have ${balanceCheck.availableBalance} (shortfall: ${balanceCheck.shortfall}). The transaction will fail on-chain.`
    : !balanceCheck.solSufficientForFees
      ? `Insufficient SOL for transaction fees: have ${balanceCheck.solBalance} SOL, need ~0.005 SOL.`
      : undefined;

  const transactionBase64 = await serializeUnsignedTx(connection, owner, [...allPreInstructions, ix]);
  return buildResult(transactionBase64, owner, ['openOrIncreasePositionShort'], position, balanceCheck, warning);
}

/**
 * @name buildClosePositionLong
 * @description Build an unsigned transaction to close a long position on Adrena.
 *
 * @param connection — Solana RPC connection.
 * @param owner — Position owner and fee payer.
 * @param principalToken — Asset of the position.
 * @param price — Optional close price (scaled by 10^10), null for market close.
 * @param percentage — Percentage to close (1_000_000 = 100%).
 * @returns Unsigned transaction result.
 */
export async function buildClosePositionLong(
  connection: Connection,
  owner: PublicKey,
  principalToken: string,
  price: bigint | null,
  percentage: bigint = 1_000_000n,
): Promise<UnsignedTransactionResult> {
  const program = createAdrenaProgram(connection);
  const pool = getPoolPublicKey('main-pool');
  const custody = getCustodyPublicKey(principalToken, 'main-pool');
  const collateralCustody = custody;
  const cortex = deriveCortexPda();
  const oracle = deriveOraclePda();
  const transferAuthority = deriveTransferAuthorityPda();
  const userProfile = deriveUserProfilePda(owner);
  const position = derivePositionPda(owner, pool, custody, 'long');
  const collateralCustodyTokenAccount = await readCustodyTokenAccount(connection, collateralCustody);
  const receivingAccount = deriveAta(owner, getMintPublicKey(principalToken));
  const referrerProfile = null;

  // Ensure the receiving ATA exists before closing.
  const receivingMint = getMintPublicKey(principalToken);
  const preInstructions = await ensureAtaInstructions(connection, owner, receivingMint, owner);

  // Ensure user profile exists — Adrena requires it for position operations.
  const profileInstructions = await ensureUserProfileInstructions(connection, owner);
  const allPreInstructions = [...preInstructions, ...profileInstructions];

  const ix = await buildInstruction(program, 'closePositionLong', [
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

  const transactionBase64 = await serializeUnsignedTx(connection, owner, [...allPreInstructions, ix]);

  // Pre-flight: show balances and check SOL for fees.
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

  return buildResult(transactionBase64, owner, ['closePositionLong'], position, balanceCheck, warning);
}

/**
 * @name buildClosePositionShort
 * @description Build an unsigned transaction to close a short position on Adrena.
 *
 * @param connection — Solana RPC connection.
 * @param owner — Position owner and fee payer.
 * @param principalToken — Asset of the position.
 * @param collateralToken — Collateral token (USDC for shorts).
 * @param price — Optional close price (scaled by 10^10), null for market close.
 * @param percentage — Percentage to close (1_000_000 = 100%).
 * @returns Unsigned transaction result.
 */
export async function buildClosePositionShort(
  connection: Connection,
  owner: PublicKey,
  principalToken: string,
  collateralToken: string,
  price: bigint | null,
  percentage: bigint = 1_000_000n,
): Promise<UnsignedTransactionResult> {
  const program = createAdrenaProgram(connection);
  const pool = getPoolPublicKey('main-pool');
  const custody = getCustodyPublicKey(principalToken, 'main-pool');
  const collateralCustody = getCustodyPublicKey(collateralToken, 'main-pool');
  const cortex = deriveCortexPda();
  const oracle = deriveOraclePda();
  const transferAuthority = deriveTransferAuthorityPda();
  const userProfile = deriveUserProfilePda(owner);
  const position = derivePositionPda(owner, pool, custody, 'short');
  const collateralCustodyTokenAccount = await readCustodyTokenAccount(connection, collateralCustody);
  const receivingAccount = deriveAta(owner, getMintPublicKey(collateralToken));
  const referrerProfile = null;

  // Ensure the receiving ATA exists before closing.
  const receivingMint = getMintPublicKey(collateralToken);
  const preInstructions = await ensureAtaInstructions(connection, owner, receivingMint, owner);

  // Ensure user profile exists — Adrena requires it for position operations.
  const profileInstructions = await ensureUserProfileInstructions(connection, owner);
  const allPreInstructions = [...preInstructions, ...profileInstructions];

  const ix = await buildInstruction(program, 'closePositionShort', [
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

  const transactionBase64 = await serializeUnsignedTx(connection, owner, [...allPreInstructions, ix]);

  // Pre-flight: show balances and check SOL for fees.
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

  return buildResult(transactionBase64, owner, ['closePositionShort'], position, balanceCheck, warning);
}

// ─── SL / TP Builders ──────────────────────────────────────────────────────────

/**
 * @name buildSetStopLoss
 * @description Build an unsigned transaction to set stop loss on a position.
 *
 * @param connection — Solana RPC connection.
 * @param owner — Position owner and fee payer.
 * @param principalToken — Asset of the position.
 * @param side — Position side.
 * @param stopLossLimitPrice — Stop loss trigger price (scaled by 10^10).
 * @param closePositionPrice — Optional close position price (scaled by 10^10).
 * @returns Unsigned transaction result.
 */
export async function buildSetStopLoss(
  connection: Connection,
  owner: PublicKey,
  principalToken: string,
  side: PositionSide,
  stopLossLimitPrice: bigint,
  closePositionPrice: bigint | null,
): Promise<UnsignedTransactionResult> {
  const program = createAdrenaProgram(connection);
  const pool = getPoolPublicKey('main-pool');
  const custody = getCustodyPublicKey(principalToken, 'main-pool');
  const cortex = deriveCortexPda();
  const position = derivePositionPda(owner, pool, custody, side);
  const ixName = side === 'long' ? 'setStopLossLong' : 'setStopLossShort';

  const ix = await buildInstruction(program, ixName, [
    {
      stopLossLimitPrice: toBN(stopLossLimitPrice),
      closePositionPrice: toBNOrNull(closePositionPrice),
    },
  ], {
    owner,
    cortex,
    pool,
    position,
    custody,
    systemProgram: new PublicKey(SYSTEM_PROGRAM_ID),
  });

  const transactionBase64 = await serializeUnsignedTx(connection, owner, [ix]);

  // Pre-flight: check SOL for fees.
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

  return buildResult(transactionBase64, owner, [ixName], position, balanceCheck, warning);
}

/**
 * @name buildSetTakeProfit
 * @description Build an unsigned transaction to set take profit on a position.
 *
 * @param connection — Solana RPC connection.
 * @param owner — Position owner and fee payer.
 * @param principalToken — Asset of the position.
 * @param side — Position side.
 * @param takeProfitLimitPrice — Take profit trigger price (scaled by 10^10).
 * @returns Unsigned transaction result.
 */
export async function buildSetTakeProfit(
  connection: Connection,
  owner: PublicKey,
  principalToken: string,
  side: PositionSide,
  takeProfitLimitPrice: bigint,
): Promise<UnsignedTransactionResult> {
  const program = createAdrenaProgram(connection);
  const pool = getPoolPublicKey('main-pool');
  const custody = getCustodyPublicKey(principalToken, 'main-pool');
  const cortex = deriveCortexPda();
  const position = derivePositionPda(owner, pool, custody, side);
  const ixName = side === 'long' ? 'setTakeProfitLong' : 'setTakeProfitShort';

  const ix = await buildInstruction(program, ixName, [
    {
      takeProfitLimitPrice: toBN(takeProfitLimitPrice),
    },
  ], {
    owner,
    cortex,
    pool,
    position,
    custody,
    systemProgram: new PublicKey(SYSTEM_PROGRAM_ID),
  });

  const transactionBase64 = await serializeUnsignedTx(connection, owner, [ix]);

  // Pre-flight: check SOL for fees.
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

  return buildResult(transactionBase64, owner, [ixName], position, balanceCheck, warning);
}

/**
 * @name buildCancelStopLoss
 * @description Build an unsigned transaction to cancel stop loss on a position.
 * @param connection — Solana RPC connection.
 * @param owner — Position owner and fee payer.
 * @param principalToken — Asset of the position.
 * @param side — Position side.
 * @returns Unsigned transaction result.
 */
export async function buildCancelStopLoss(
  connection: Connection,
  owner: PublicKey,
  principalToken: string,
  side: PositionSide,
): Promise<UnsignedTransactionResult> {
  const program = createAdrenaProgram(connection);
  const pool = getPoolPublicKey('main-pool');
  const custody = getCustodyPublicKey(principalToken, 'main-pool');
  const cortex = deriveCortexPda();
  const position = derivePositionPda(owner, pool, custody, side);

  const ix = await buildInstruction(program, 'cancelStopLoss', [], {
    owner,
    cortex,
    pool,
    position,
    custody,
    systemProgram: new PublicKey(SYSTEM_PROGRAM_ID),
  });

  const transactionBase64 = await serializeUnsignedTx(connection, owner, [ix]);

  // Pre-flight: check SOL for fees.
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

  return buildResult(transactionBase64, owner, ['cancelStopLoss'], position, balanceCheck, warning);
}

/**
 * @name buildCancelTakeProfit
 * @description Build an unsigned transaction to cancel take profit on a position.
 * @param connection — Solana RPC connection.
 * @param owner — Position owner and fee payer.
 * @param principalToken — Asset of the position.
 * @param side — Position side.
 * @returns Unsigned transaction result.
 */
export async function buildCancelTakeProfit(
  connection: Connection,
  owner: PublicKey,
  principalToken: string,
  side: PositionSide,
): Promise<UnsignedTransactionResult> {
  const program = createAdrenaProgram(connection);
  const pool = getPoolPublicKey('main-pool');
  const custody = getCustodyPublicKey(principalToken, 'main-pool');
  const cortex = deriveCortexPda();
  const position = derivePositionPda(owner, pool, custody, side);

  const ix = await buildInstruction(program, 'cancelTakeProfit', [], {
    owner,
    cortex,
    pool,
    position,
    custody,
    systemProgram: new PublicKey(SYSTEM_PROGRAM_ID),
  });

  const transactionBase64 = await serializeUnsignedTx(connection, owner, [ix]);

  // Pre-flight: check SOL for fees.
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

  return buildResult(transactionBase64, owner, ['cancelTakeProfit'], position, balanceCheck, warning);
}

// ─── Limit Order Builders ───────────────────────────────────────────────────────

/**
 * @name buildAddLimitOrder
 * @description Build an unsigned transaction to place a limit order on Adrena.
 *
 * @param connection — Solana RPC connection.
 * @param owner — Order owner and fee payer.
 * @param principalToken — Asset to trade.
 * @param collateralToken — Collateral token.
 * @param collateralAmount — Collateral amount in human-readable units.
 * @param leverage — Leverage multiplier.
 * @param side — Order side: long or short.
 * @param triggerPrice — Trigger price (scaled by 10^10).
 * @param limitPrice — Optional limit price (scaled by 10^10), null for market at fill.
 * @returns Unsigned transaction result.
 */
export async function buildAddLimitOrder(
  connection: Connection,
  owner: PublicKey,
  principalToken: string,
  collateralToken: string,
  collateralAmount: number,
  leverage: number,
  side: PositionSide,
  triggerPrice: bigint,
  limitPrice: bigint | null,
): Promise<UnsignedTransactionResult> {
  const program = createAdrenaProgram(connection);
  const pool = getPoolPublicKey('main-pool');
  const custody = getCustodyPublicKey(principalToken, 'main-pool');
  const collateralCustody = getCustodyPublicKey(collateralToken, 'main-pool');
  const cortex = deriveCortexPda();
  const transferAuthority = deriveTransferAuthorityPda();
  const limitOrderBook = deriveLimitOrderBookPda(owner, pool);
  const collateralEscrow = deriveCollateralEscrowPda(owner, pool, collateralCustody);
  const collateralCustodyMint = getMintPublicKey(collateralToken);
  const fundingAccount = deriveAta(owner, collateralCustodyMint);

  const amountRaw = BigInt(Math.floor(collateralAmount * Math.pow(10, ADRENA_CUSTODIES[collateralToken.toUpperCase() as keyof typeof ADRENA_CUSTODIES].decimals)));

  const ix = await buildInstruction(program, 'addLimitOrder', [
    {
      triggerPrice: toBN(triggerPrice),
      limitPrice: toBNOrNull(limitPrice),
      side: side === 'long' ? 0 : 1,
      amount: toBN(amountRaw),
      leverage,
    },
  ], {
    owner,
    fundingAccount,
    transferAuthority,
    cortex,
    pool,
    limitOrderBook,
    collateralEscrow,
    collateralCustodyMint,
    custody,
    collateralCustody,
    systemProgram: new PublicKey(SYSTEM_PROGRAM_ID),
    tokenProgram: new PublicKey(TOKEN_PROGRAM_ID),
    associatedTokenProgram: new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID),
  });

  const transactionBase64 = await serializeUnsignedTx(connection, owner, [ix]);

  // Pre-flight balance check.
  const balanceCheck = await checkSufficientBalance(connection, owner, collateralToken, collateralAmount);
  const warning = !balanceCheck.sufficient
    ? `Insufficient ${collateralToken.toUpperCase()} balance: need ${collateralAmount}, have ${balanceCheck.availableBalance} (shortfall: ${balanceCheck.shortfall}). The transaction will fail on-chain.`
    : !balanceCheck.solSufficientForFees
      ? `Insufficient SOL for transaction fees: have ${balanceCheck.solBalance} SOL, need ~0.005 SOL.`
      : undefined;

  return buildResult(transactionBase64, owner, ['addLimitOrder'], undefined, balanceCheck, warning);
}

/**
 * @name buildCancelLimitOrder
 * @description Build an unsigned transaction to cancel a limit order on Adrena.
 *
 * @param connection — Solana RPC connection.
 * @param owner — Order owner and fee payer.
 * @param collateralToken — Collateral token.
 * @param orderId — Limit order ID.
 * @returns Unsigned transaction result.
 */
export async function buildCancelLimitOrder(
  connection: Connection,
  owner: PublicKey,
  collateralToken: string,
  orderId: bigint,
): Promise<UnsignedTransactionResult> {
  const program = createAdrenaProgram(connection);
  const pool = getPoolPublicKey('main-pool');
  const collateralCustody = getCustodyPublicKey(collateralToken, 'main-pool');
  const cortex = deriveCortexPda();
  const transferAuthority = deriveTransferAuthorityPda();
  const limitOrderBook = deriveLimitOrderBookPda(owner, pool);
  const collateralEscrow = deriveCollateralEscrowPda(owner, pool, collateralCustody);
  const collateralCustodyMint = getMintPublicKey(collateralToken);
  const receivingAccount = deriveAta(owner, collateralCustodyMint);

  const ix = await buildInstruction(program, 'cancelLimitOrder', [
    {
      id: toBN(orderId),
    },
  ], {
    owner,
    receivingAccount,
    transferAuthority,
    cortex,
    pool,
    limitOrderBook,
    collateralEscrow,
    collateralCustodyMint,
    collateralCustody,
    systemProgram: new PublicKey(SYSTEM_PROGRAM_ID),
    tokenProgram: new PublicKey(TOKEN_PROGRAM_ID),
    associatedTokenProgram: new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID),
  });

  const transactionBase64 = await serializeUnsignedTx(connection, owner, [ix]);

  // Pre-flight: check SOL for fees.
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

  return buildResult(transactionBase64, owner, ['cancelLimitOrder'], undefined, balanceCheck, warning);
}