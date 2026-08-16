/**
 * @name perps/adrena/adrena-builder-liquidity
 * @description Liquidity and swap builders for the Adrena perps protocol.
 *
 * Contains builders for adding liquidity, removing liquidity, and swapping tokens.
 *
 * @module perps/adrena/adrena-builder-liquidity
 */

import {
  PublicKey,
  Connection,
} from '@solana/web3.js';
import {
  ADRENA_CUSTODIES,
  ADRENA_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from './adrena-constants.js';
import {
  deriveCortexPda,
  deriveOraclePda,
  deriveTransferAuthorityPda,
  deriveLpTokenMintPda,
  deriveStakingPda,
  deriveAta,
} from './adrena-pda.js';
import {
  type AdrenaPool,
  type BalanceCheck,
  type UnsignedTransactionResult,
  toBN,
  getPoolPublicKey,
  getCustodyPublicKey,
  getMintPublicKey,
  readCustodyTokenAccount,
  getWalletTokenBalances,
  checkSufficientBalance,
  createAdrenaProgram,
  buildInstruction,
  serializeUnsignedTx,
  buildResult,
} from './adrena-builder-core.js';

// ─── Liquidity & Swap Builders ──────────────────────────────────────────────────

/**
 * @name buildAddLiquidity
 * @description Build an unsigned transaction to add liquidity to an Adrena pool.
 *
 * @param connection — Solana RPC connection.
 * @param owner — Liquidity provider and fee payer.
 * @param collateralToken — Collateral token to deposit.
 * @param amountIn — Amount in human-readable units.
 * @param minLpAmountOut — Minimum LP tokens to receive (0 for no slippage protection).
 * @param poolName — Pool to add liquidity to.
 * @returns Unsigned transaction result.
 */
export async function buildAddLiquidity(
  connection: Connection,
  owner: PublicKey,
  collateralToken: string,
  amountIn: number,
  minLpAmountOut: bigint = 0n,
  poolName: AdrenaPool = 'main-pool',
): Promise<UnsignedTransactionResult> {
  const program = createAdrenaProgram(connection);
  const pool = getPoolPublicKey(poolName);
  const custody = getCustodyPublicKey(collateralToken, poolName);
  const cortex = deriveCortexPda();
  const oracle = deriveOraclePda();
  const transferAuthority = deriveTransferAuthorityPda();
  const lpTokenMint = deriveLpTokenMintPda(pool);
  const lpStaking = deriveStakingPda(lpTokenMint);
  const custodyTokenAccount = await readCustodyTokenAccount(connection, custody);
  const lpTokenAccount = deriveAta(owner, lpTokenMint);
  const fundingAccount = deriveAta(owner, getMintPublicKey(collateralToken));

  const amountRaw = BigInt(Math.floor(amountIn * Math.pow(10, ADRENA_CUSTODIES[collateralToken.toUpperCase() as keyof typeof ADRENA_CUSTODIES].decimals)));

  const ix = await buildInstruction(program, 'addLiquidity', [
    {
      amountIn: toBN(amountRaw),
      minLpAmountOut: toBN(minLpAmountOut),
      oraclePrices: null,
      multiOraclePrices: null,
    },
  ], {
    owner,
    fundingAccount,
    lpTokenAccount,
    transferAuthority,
    lpStaking,
    cortex,
    pool,
    custody,
    oracle,
    custodyTokenAccount,
    lpTokenMint,
    tokenProgram: new PublicKey(TOKEN_PROGRAM_ID),
    adrenaProgram: new PublicKey(ADRENA_PROGRAM_ID),
  });

  const _serializeResult = await serializeUnsignedTx(connection, owner, [ix]);
  const transactionBase64 = _serializeResult.transactionBase64;

  // Pre-flight balance check.
  const balanceCheck = await checkSufficientBalance(connection, owner, collateralToken, amountIn);
  const warning = !balanceCheck.sufficient
    ? `Insufficient ${collateralToken.toUpperCase()} balance: need ${amountIn}, have ${balanceCheck.availableBalance} (shortfall: ${balanceCheck.shortfall}). The transaction will fail on-chain.`
    : !balanceCheck.solSufficientForFees
      ? `Insufficient SOL for transaction fees: have ${balanceCheck.solBalance} SOL, need ~0.005 SOL.`
      : undefined;

  return buildResult(transactionBase64, owner, ['addLiquidity'], undefined, balanceCheck, warning);
}

/**
 * @name buildRemoveLiquidity
 * @description Build an unsigned transaction to remove liquidity from an Adrena pool.
 *
 * @param connection — Solana RPC connection.
 * @param owner — Liquidity provider and fee payer.
 * @param collateralToken — Collateral token to receive.
 * @param lpAmountIn — LP tokens to burn (raw, 6 decimals).
 * @param minAmountOut — Minimum collateral to receive (raw, 0 for no slippage protection).
 * @param poolName — Pool to remove liquidity from.
 * @returns Unsigned transaction result.
 */
export async function buildRemoveLiquidity(
  connection: Connection,
  owner: PublicKey,
  collateralToken: string,
  lpAmountIn: bigint,
  minAmountOut: bigint = 0n,
  poolName: AdrenaPool = 'main-pool',
): Promise<UnsignedTransactionResult> {
  const program = createAdrenaProgram(connection);
  const pool = getPoolPublicKey(poolName);
  const custody = getCustodyPublicKey(collateralToken, poolName);
  const cortex = deriveCortexPda();
  const oracle = deriveOraclePda();
  const transferAuthority = deriveTransferAuthorityPda();
  const lpTokenMint = deriveLpTokenMintPda(pool);
  const custodyTokenAccount = await readCustodyTokenAccount(connection, custody);
  const lpTokenAccount = deriveAta(owner, lpTokenMint);
  const receivingAccount = deriveAta(owner, getMintPublicKey(collateralToken));

  const ix = await buildInstruction(program, 'removeLiquidity', [
    {
      lpAmountIn: toBN(lpAmountIn),
      minAmountOut: toBN(minAmountOut),
      oraclePrices: null,
      multiOraclePrices: null,
    },
  ], {
    owner,
    receivingAccount,
    lpTokenAccount,
    transferAuthority,
    cortex,
    pool,
    custody,
    oracle,
    custodyTokenAccount,
    lpTokenMint,
    tokenProgram: new PublicKey(TOKEN_PROGRAM_ID),
    adrenaProgram: new PublicKey(ADRENA_PROGRAM_ID),
  });

  const _serializeResult = await serializeUnsignedTx(connection, owner, [ix]);
  const transactionBase64 = _serializeResult.transactionBase64;

  // Pre-flight: show balances and check SOL for fees (removeLiquidity burns LP tokens).
  const balances = await getWalletTokenBalances(connection, owner);
  const solBalance = balances.find(b => b.symbol === 'SOL')?.balance ?? 0;
  const warning = solBalance < 0.005
    ? `Insufficient SOL for transaction fees: have ${solBalance} SOL, need ~0.005 SOL.`
    : undefined;
  const balanceCheck: BalanceCheck = {
    wallet: owner.toBase58(),
    balances,
    requiredToken: 'LP',
    requiredAmount: Number(lpAmountIn),
    availableBalance: 0,
    sufficient: true,
    shortfall: 0,
    solBalance,
    solSufficientForFees: solBalance >= 0.005,
  };

  return buildResult(transactionBase64, owner, ['removeLiquidity'], undefined, balanceCheck, warning);
}

/**
 * @name buildSwap
 * @description Build an unsigned transaction to swap tokens through an Adrena pool.
 *
 * @param connection — Solana RPC connection.
 * @param owner — Swapper and fee payer.
 * @param fromToken — Token to swap from.
 * @param toToken — Token to swap to.
 * @param amountIn — Amount in human-readable units.
 * @param minAmountOut — Minimum amount to receive (raw, 0 for no slippage protection).
 * @returns Unsigned transaction result.
 */
export async function buildSwap(
  connection: Connection,
  owner: PublicKey,
  fromToken: string,
  toToken: string,
  amountIn: number,
  minAmountOut: bigint = 0n,
): Promise<UnsignedTransactionResult> {
  const program = createAdrenaProgram(connection);
  const pool = getPoolPublicKey('main-pool');
  const dispensingCustody = getCustodyPublicKey(fromToken, 'main-pool');
  const receivingCustody = getCustodyPublicKey(toToken, 'main-pool');
  const cortex = deriveCortexPda();
  const oracle = deriveOraclePda();
  const transferAuthority = deriveTransferAuthorityPda();
  const receivingCustodyTokenAccount = await readCustodyTokenAccount(connection, receivingCustody);
  const dispensingCustodyTokenAccount = await readCustodyTokenAccount(connection, dispensingCustody);
  const fundingAccount = deriveAta(owner, getMintPublicKey(fromToken));
  const receivingAccount = deriveAta(owner, getMintPublicKey(toToken));

  const amountRaw = BigInt(Math.floor(amountIn * Math.pow(10, ADRENA_CUSTODIES[fromToken.toUpperCase() as keyof typeof ADRENA_CUSTODIES].decimals)));

  const ix = await buildInstruction(program, 'swap', [
    {
      amountIn: toBN(amountRaw),
      minAmountOut: toBN(minAmountOut),
      oraclePrices: null,
      multiOraclePrices: null,
    },
  ], {
    caller: owner,
    owner,
    fundingAccount,
    receivingAccount,
    transferAuthority,
    cortex,
    pool,
    receivingCustody,
    oracle,
    receivingCustodyTokenAccount,
    dispensingCustody,
    dispensingCustodyTokenAccount,
    tokenProgram: new PublicKey(TOKEN_PROGRAM_ID),
    adrenaProgram: new PublicKey(ADRENA_PROGRAM_ID),
  });

  const _serializeResult = await serializeUnsignedTx(connection, owner, [ix]);
  const transactionBase64 = _serializeResult.transactionBase64;

  // Pre-flight balance check.
  const balanceCheck = await checkSufficientBalance(connection, owner, fromToken, amountIn);
  const warning = !balanceCheck.sufficient
    ? `Insufficient ${fromToken.toUpperCase()} balance: need ${amountIn}, have ${balanceCheck.availableBalance} (shortfall: ${balanceCheck.shortfall}). The transaction will fail on-chain.`
    : !balanceCheck.solSufficientForFees
      ? `Insufficient SOL for transaction fees: have ${balanceCheck.solBalance} SOL, need ~0.005 SOL.`
      : undefined;

  return buildResult(transactionBase64, owner, ['swap'], undefined, balanceCheck, warning);
}