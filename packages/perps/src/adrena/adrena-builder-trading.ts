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
  Transaction,
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
  type PoolMetadata,
  type SimulatePositionResult,
  type AdrenaPool,
  toBN,
  toBNOrNull,
  getPoolPublicKey,
  getCustodyPublicKey,
  getMintPublicKey,
  fetchOraclePrice,
  readCustodyTokenAccount,
  readCustodyMetadata,
  validateLeverage,
  getWalletTokenBalances,
  checkSufficientBalance,
  encodeAdrenaLeverage,
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
export async function buildSimulatePosition(
  connection: Connection,
  owner: PublicKey,
  principalToken: string,
  collateralToken: string,
  collateralAmount: number,
  leverage: number,
  side: PositionSide,
  poolName: AdrenaPool,
  price: bigint | null = null,
): Promise<SimulatePositionResult> {
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

  const ixName = side === 'long' ? 'openOrIncreasePositionLong' : 'openOrIncreasePositionShort';

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

  // Build the transaction for simulation — no serialization needed.
  const blockhash = await connection.getLatestBlockhash();
  const tx = new Transaction({
    recentBlockhash: blockhash.blockhash,
    feePayer: owner,
  });
  tx.add(...allPreInstructions, ix);

  // Simulate the transaction to extract program logs and compute units.
  const simulation = await connection.simulateTransaction(tx);
  const simulationLogs = simulation.value.logs ?? [];
  const simulationError = simulation.value.err
    ? (typeof simulation.value.err === 'string'
        ? simulation.value.err
        : JSON.stringify(simulation.value.err))
    : undefined;
  const unitsConsumed = simulation.value.unitsConsumed;
  const wouldSucceed = simulation.value.err === null;

  // Pre-flight balance check.
  const balanceCheck = await checkSufficientBalance(connection, owner, collateralToken, collateralAmount);

  return {
    simulationLogs,
    ...(simulationError ? { simulationError } : {}),
    ...(unitsConsumed !== undefined ? { unitsConsumed } : {}),
    wouldSucceed,
    balanceCheck,
  };
}

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

  // Read custody metadata for leverage pre-validation and poolMetadata.
  const poolMetadata: PoolMetadata = await readCustodyMetadata(connection, custody);
  validateLeverage(leverage, Math.floor(poolMetadata.maxInitialLeverage * 10000), principalToken);

  const collateralRaw = BigInt(Math.floor(collateralAmount * Math.pow(10, ADRENA_CUSTODIES[collateralToken.toUpperCase() as keyof typeof ADRENA_CUSTODIES].decimals)));
  const priceRaw = price ?? await fetchOraclePrice(principalToken, 'long');

  // Ensure the funding ATA exists before the Adrena instruction.
  const collateralMint = getMintPublicKey(collateralToken);
  const preInstructions = await ensureAtaInstructions(connection, owner, collateralMint, owner);

  // Ensure user profile exists — Adrena requires it before opening positions.
  const profileInstructions = await ensureUserProfileInstructions(connection, owner);
  const allPreInstructions = [...preInstructions, ...profileInstructions];

  // Leverage is passed as BPS (basis points) to Adrena: 3x = 30000 BPS.
  const leverageBps = encodeAdrenaLeverage(leverage);

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

  const _serializeResult = await serializeUnsignedTx(connection, owner, [...allPreInstructions, ix]);
  const transactionBase64 = _serializeResult.transactionBase64;
  return buildResult(transactionBase64, owner, ['openOrIncreasePositionLong'], position, balanceCheck, warning, poolMetadata, leverage);
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

  // Read custody metadata for leverage pre-validation and poolMetadata.
  const poolMetadata: PoolMetadata = await readCustodyMetadata(connection, custody);
  validateLeverage(leverage, Math.floor(poolMetadata.maxInitialLeverage * 10000), principalToken);

  const collateralRaw = BigInt(Math.floor(collateralAmount * Math.pow(10, ADRENA_CUSTODIES[collateralToken.toUpperCase() as keyof typeof ADRENA_CUSTODIES].decimals)));
  const priceRaw = price ?? await fetchOraclePrice(principalToken, 'short');

  // Ensure the funding ATA exists before the Adrena instruction.
  const collateralMint = getMintPublicKey(collateralToken);
  const preInstructions = await ensureAtaInstructions(connection, owner, collateralMint, owner);

  // Ensure user profile exists — Adrena requires it before opening positions.
  const profileInstructions = await ensureUserProfileInstructions(connection, owner);
  const allPreInstructions = [...preInstructions, ...profileInstructions];

  // Leverage is passed as BPS (basis points) to Adrena: 3x = 30000 BPS.
  const leverageBps = encodeAdrenaLeverage(leverage);

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

  const _serializeResult = await serializeUnsignedTx(connection, owner, [...allPreInstructions, ix]);
  const transactionBase64 = _serializeResult.transactionBase64;
  return buildResult(transactionBase64, owner, ['openOrIncreasePositionShort'], position, balanceCheck, warning, poolMetadata, leverage);
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

  const _serializeResult = await serializeUnsignedTx(connection, owner, [...allPreInstructions, ix]);
  const transactionBase64 = _serializeResult.transactionBase64;

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

  const _serializeResult = await serializeUnsignedTx(connection, owner, [...allPreInstructions, ix]);
  const transactionBase64 = _serializeResult.transactionBase64;

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

  const _serializeResult = await serializeUnsignedTx(connection, owner, [ix]);
  const transactionBase64 = _serializeResult.transactionBase64;

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

  const _serializeResult = await serializeUnsignedTx(connection, owner, [ix]);
  const transactionBase64 = _serializeResult.transactionBase64;

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

  const _serializeResult = await serializeUnsignedTx(connection, owner, [ix]);
  const transactionBase64 = _serializeResult.transactionBase64;

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

  const _serializeResult = await serializeUnsignedTx(connection, owner, [ix]);
  const transactionBase64 = _serializeResult.transactionBase64;

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

  const _serializeResult = await serializeUnsignedTx(connection, owner, [ix]);
  const transactionBase64 = _serializeResult.transactionBase64;

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

  const _serializeResult = await serializeUnsignedTx(connection, owner, [ix]);
  const transactionBase64 = _serializeResult.transactionBase64;

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

// ─── Batch Position Package Builder ────────────────────────────────────────────

/**
 * @name buildPositionPackage
 * @description Build a single unsigned transaction that atomically opens a
 * position AND sets stop loss AND take profit. This combines 3 separate
 * builder calls into 1 transaction — 1 payment, 1 signing, 1 submit.
 *
 * If stopLossPriceUsd or takeProfitPriceUsd is null, that instruction is
 * omitted (e.g. you can open + SL without TP).
 *
 * @param connection — Solana RPC connection.
 * @param owner — Position owner and fee payer.
 * @param principalToken — Asset to trade (e.g. "BONK").
 * @param collateralToken — Collateral token (USDC for shorts, match principal for longs).
 * @param collateralAmount — Collateral amount in human-readable units.
 * @param leverage — Leverage multiplier (e.g. 3 = 3x).
 * @param side — Position side: 'long' or 'short'.
 * @param stopLossPriceUsd — Stop loss trigger price in USD, or null to skip.
 * @param takeProfitPriceUsd — Take profit trigger price in USD, or null to skip.
 * @param price — Optional limit price in USD (scaled by 10^10), null for market.
 * @returns Unsigned transaction result with all instructions combined.
 */
export async function buildPositionPackage(
  connection: Connection,
  owner: PublicKey,
  principalToken: string,
  collateralToken: string,
  collateralAmount: number,
  leverage: number,
  side: PositionSide,
  stopLossPriceUsd: number | null,
  takeProfitPriceUsd: number | null,
  price: bigint | null = null,
): Promise<UnsignedTransactionResult> {
  const program = createAdrenaProgram(connection);
  const pool = getPoolPublicKey('main-pool');
  const custody = getCustodyPublicKey(principalToken, 'main-pool');
  const collateralCustody = getCustodyPublicKey(collateralToken, 'main-pool');
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
  const leverageBps = encodeAdrenaLeverage(leverage);

  // Pre-instructions: ATA + user profile
  const collateralMint = getMintPublicKey(collateralToken);
  const preInstructions = await ensureAtaInstructions(connection, owner, collateralMint, owner);
  const profileInstructions = await ensureUserProfileInstructions(connection, owner);
  const allPreInstructions = [...preInstructions, ...profileInstructions];

  // 1. Open position instruction
  const ixName = side === 'long' ? 'openOrIncreasePositionLong' : 'openOrIncreasePositionShort';
  const openIx = await buildInstruction(program, ixName, [
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

  const instructions = [...allPreInstructions, openIx];
  const instructionNames = [ixName];

  // 2. Stop loss instruction (optional)
  if (stopLossPriceUsd !== null) {
    const slLimitPrice = BigInt(Math.floor(stopLossPriceUsd * Math.pow(10, 10)));
    const slIxName = side === 'long' ? 'setStopLossLong' : 'setStopLossShort';
    const slIx = await buildInstruction(program, slIxName, [
      {
        stopLossLimitPrice: toBN(slLimitPrice),
        closePositionPrice: toBNOrNull(null),
      },
    ], {
      owner,
      cortex,
      pool,
      position,
      custody,
      systemProgram: new PublicKey(SYSTEM_PROGRAM_ID),
    });
    instructions.push(slIx);
    instructionNames.push(slIxName);
  }

  // 3. Take profit instruction (optional)
  if (takeProfitPriceUsd !== null) {
    const tpLimitPrice = BigInt(Math.floor(takeProfitPriceUsd * Math.pow(10, 10)));
    const tpIxName = side === 'long' ? 'setTakeProfitLong' : 'setTakeProfitShort';
    const tpIx = await buildInstruction(program, tpIxName, [
      {
        takeProfitLimitPrice: toBN(tpLimitPrice),
      },
    ], {
      owner,
      cortex,
      pool,
      position,
      custody,
      systemProgram: new PublicKey(SYSTEM_PROGRAM_ID),
    });
    instructions.push(tpIx);
    instructionNames.push(tpIxName);
  }

  // Balance check
  const balanceCheck = await checkSufficientBalance(connection, owner, collateralToken, collateralAmount);
  const warning = !balanceCheck.sufficient
    ? `Insufficient ${collateralToken.toUpperCase()} balance: need ${collateralAmount}, have ${balanceCheck.availableBalance} (shortfall: ${balanceCheck.shortfall}). The transaction will fail on-chain.`
    : !balanceCheck.solSufficientForFees
      ? `Insufficient SOL for transaction fees: have ${balanceCheck.solBalance} SOL, need ~0.005 SOL.`
      : undefined;

  const _serializeResult = await serializeUnsignedTx(connection, owner, instructions);
  const transactionBase64 = _serializeResult.transactionBase64;
  return buildResult(transactionBase64, owner, instructionNames, position, balanceCheck, warning, undefined, leverage);
}
