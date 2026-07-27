/**
 * @name perps/adrena/adrena-builder-staking
 * @description Staking builders for the Adrena perps protocol.
 *
 * Contains builders for initializing user staking, adding/removing liquid stakes,
 * adding locked stakes, and claiming staking rewards.
 *
 * @module perps/adrena/adrena-builder-staking
 */

import {
  PublicKey,
  Connection,
} from '@solana/web3.js';
import {
  ADRENA_FEE_REDISTRIBUTION_MINT,
  ADRENA_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
} from './adrena-constants.js';
import {
  deriveCortexPda,
  deriveTransferAuthorityPda,
  deriveLpTokenMintPda,
  deriveStakingPda,
  deriveUserStakingPda,
  deriveGenesisLockPda,
  deriveLmTokenTreasuryPda,
  deriveLmTokenMintPda,
  deriveGovernanceTokenMintPda,
  deriveStakingStakedTokenVaultPda,
  deriveStakingRewardTokenVaultPda,
  deriveStakingLmRewardTokenVaultPda,
  deriveAta,
} from './adrena-pda.js';
import {
  type BalanceCheck,
  type UnsignedTransactionResult,
  toBN,
  getPoolPublicKey,
  getWalletTokenBalances,
  createAdrenaProgram,
  buildInstruction,
  serializeUnsignedTx,
  buildResult,
} from './adrena-builder-core.js';

// ─── Staking Builders ──────────────────────────────────────────────────────────

/**
 * @name buildInitUserStaking
 * @description Build an unsigned transaction to initialize user staking account.
 * @param connection — Solana RPC connection.
 * @param owner — Staker and fee payer.
 * @returns Unsigned transaction result.
 */
export async function buildInitUserStaking(
  connection: Connection,
  owner: PublicKey,
): Promise<UnsignedTransactionResult> {
  const program = createAdrenaProgram(connection);
  const pool = getPoolPublicKey('main-pool');
  const cortex = deriveCortexPda();
  const lpTokenMint = deriveLpTokenMintPda(pool);
  const staking = deriveStakingPda(lpTokenMint);
  const userStaking = deriveUserStakingPda(owner, staking);
  const lmTokenMint = deriveLmTokenMintPda();
  const feeRedistributionMint = new PublicKey(ADRENA_FEE_REDISTRIBUTION_MINT);
  const rewardTokenAccount = deriveAta(owner, feeRedistributionMint);
  const lmTokenAccount = deriveAta(owner, lmTokenMint);
  const stakingRewardTokenVault = deriveStakingRewardTokenVaultPda(staking);
  const stakingLmRewardTokenVault = deriveStakingLmRewardTokenVaultPda(staking);
  const transferAuthority = deriveTransferAuthorityPda();

  const ix = await buildInstruction(program, 'initUserStaking', [], {
    caller: owner,
    payer: owner,
    owner,
    rewardTokenAccount,
    lmTokenAccount,
    stakingRewardTokenVault,
    stakingLmRewardTokenVault,
    userStaking,
    transferAuthority,
    staking,
    cortex,
    pool,
    lmTokenMint,
    feeRedistributionMint,
    adrenaProgram: new PublicKey(ADRENA_PROGRAM_ID),
    systemProgram: new PublicKey(SYSTEM_PROGRAM_ID),
    tokenProgram: new PublicKey(TOKEN_PROGRAM_ID),
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

  return buildResult(transactionBase64, owner, ['initUserStaking'], undefined, balanceCheck, warning);
}

/**
 * @name buildAddLiquidStake
 * @description Build an unsigned transaction to add a liquid stake (LP tokens).
 * @param connection — Solana RPC connection.
 * @param owner — Staker and fee payer.
 * @param amount — Amount of LP tokens to stake (raw, 6 decimals).
 * @returns Unsigned transaction result.
 */
export async function buildAddLiquidStake(
  connection: Connection,
  owner: PublicKey,
  amount: bigint,
): Promise<UnsignedTransactionResult> {
  const program = createAdrenaProgram(connection);
  const pool = getPoolPublicKey('main-pool');
  const cortex = deriveCortexPda();
  const lpTokenMint = deriveLpTokenMintPda(pool);
  const staking = deriveStakingPda(lpTokenMint);
  const userStaking = deriveUserStakingPda(owner, staking);
  const genesisLock = deriveGenesisLockPda(pool);
  const lmTokenTreasury = deriveLmTokenTreasuryPda(cortex);
  const lmTokenMint = deriveLmTokenMintPda();
  const governanceTokenMint = deriveGovernanceTokenMintPda();
  const feeRedistributionMint = new PublicKey(ADRENA_FEE_REDISTRIBUTION_MINT);
  const transferAuthority = deriveTransferAuthorityPda();
  const fundingAccount = deriveAta(owner, lpTokenMint);
  const rewardTokenAccount = deriveAta(owner, feeRedistributionMint);
  const lmTokenAccount = deriveAta(owner, lmTokenMint);
  const stakingStakedTokenVault = deriveStakingStakedTokenVaultPda(staking);
  const stakingRewardTokenVault = deriveStakingRewardTokenVaultPda(staking);
  const stakingLmRewardTokenVault = deriveStakingLmRewardTokenVaultPda(staking);

  const ix = await buildInstruction(program, 'addLiquidStake', [
    { amount: toBN(amount) },
  ], {
    owner,
    fundingAccount,
    rewardTokenAccount,
    lmTokenAccount,
    stakingStakedTokenVault,
    stakingRewardTokenVault,
    stakingLmRewardTokenVault,
    transferAuthority,
    userStaking,
    staking,
    cortex,
    pool,
    genesisLock,
    lmTokenTreasury,
    governanceTokenMint,
    feeRedistributionMint,
    governanceRealm: PublicKey.default,
    governanceRealmConfig: PublicKey.default,
    governanceGoverningTokenHolding: PublicKey.default,
    governanceGoverningTokenOwnerRecord: PublicKey.default,
    governanceProgram: new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw'),
    adrenaProgram: new PublicKey(ADRENA_PROGRAM_ID),
    systemProgram: new PublicKey(SYSTEM_PROGRAM_ID),
    tokenProgram: new PublicKey(TOKEN_PROGRAM_ID),
  });

  const transactionBase64 = await serializeUnsignedTx(connection, owner, [ix]);

  // Pre-flight: check SOL for fees (LP token balance is not in standard token mints).
  const balances = await getWalletTokenBalances(connection, owner);
  const solBalance = balances.find(b => b.symbol === 'SOL')?.balance ?? 0;
  const warning = solBalance < 0.005
    ? `Insufficient SOL for transaction fees: have ${solBalance} SOL, need ~0.005 SOL.`
    : undefined;
  const balanceCheck: BalanceCheck = {
    wallet: owner.toBase58(),
    balances,
    requiredToken: 'LP',
    requiredAmount: Number(amount),
    availableBalance: 0,
    sufficient: true,
    shortfall: 0,
    solBalance,
    solSufficientForFees: solBalance >= 0.005,
  };

  return buildResult(transactionBase64, owner, ['addLiquidStake'], undefined, balanceCheck, warning);
}

/**
 * @name buildRemoveLiquidStake
 * @description Build an unsigned transaction to remove a liquid stake.
 * @param connection — Solana RPC connection.
 * @param owner — Staker and fee payer.
 * @param amount — Amount of staked LP tokens to withdraw (raw, 6 decimals).
 * @returns Unsigned transaction result.
 */
export async function buildRemoveLiquidStake(
  connection: Connection,
  owner: PublicKey,
  amount: bigint,
): Promise<UnsignedTransactionResult> {
  const program = createAdrenaProgram(connection);
  const pool = getPoolPublicKey('main-pool');
  const cortex = deriveCortexPda();
  const lpTokenMint = deriveLpTokenMintPda(pool);
  const staking = deriveStakingPda(lpTokenMint);
  const userStaking = deriveUserStakingPda(owner, staking);
  const genesisLock = deriveGenesisLockPda(pool);
  const lmTokenTreasury = deriveLmTokenTreasuryPda(cortex);
  const lmTokenMint = deriveLmTokenMintPda();
  const governanceTokenMint = deriveGovernanceTokenMintPda();
  const feeRedistributionMint = new PublicKey(ADRENA_FEE_REDISTRIBUTION_MINT);
  const transferAuthority = deriveTransferAuthorityPda();
  const stakedTokenAccount = deriveAta(owner, lpTokenMint);
  const lmTokenAccount = deriveAta(owner, lmTokenMint);
  const rewardTokenAccount = deriveAta(owner, feeRedistributionMint);
  const stakingStakedTokenVault = deriveStakingStakedTokenVaultPda(staking);
  const stakingRewardTokenVault = deriveStakingRewardTokenVaultPda(staking);
  const stakingLmRewardTokenVault = deriveStakingLmRewardTokenVaultPda(staking);

  const ix = await buildInstruction(program, 'removeLiquidStake', [
    { amount: toBN(amount) },
  ], {
    owner,
    stakedTokenAccount,
    lmTokenAccount,
    rewardTokenAccount,
    stakingStakedTokenVault,
    stakingRewardTokenVault,
    stakingLmRewardTokenVault,
    transferAuthority,
    userStaking,
    staking,
    cortex,
    pool,
    genesisLock,
    lmTokenTreasury,
    governanceTokenMint,
    feeRedistributionMint,
    governanceRealm: PublicKey.default,
    governanceRealmConfig: PublicKey.default,
    governanceGoverningTokenHolding: PublicKey.default,
    governanceGoverningTokenOwnerRecord: PublicKey.default,
    governanceProgram: new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw'),
    adrenaProgram: new PublicKey(ADRENA_PROGRAM_ID),
    systemProgram: new PublicKey(SYSTEM_PROGRAM_ID),
    tokenProgram: new PublicKey(TOKEN_PROGRAM_ID),
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
    requiredToken: 'LP',
    requiredAmount: Number(amount),
    availableBalance: 0,
    sufficient: true,
    shortfall: 0,
    solBalance,
    solSufficientForFees: solBalance >= 0.005,
  };

  return buildResult(transactionBase64, owner, ['removeLiquidStake'], undefined, balanceCheck, warning);
}

/**
 * @name buildAddLockedStake
 * @description Build an unsigned transaction to add a locked stake.
 * @param connection — Solana RPC connection.
 * @param owner — Staker and fee payer.
 * @param amount — Amount of LP tokens to lock (raw, 6 decimals).
 * @param lockedDays — Lock duration in days.
 * @returns Unsigned transaction result.
 */
export async function buildAddLockedStake(
  connection: Connection,
  owner: PublicKey,
  amount: bigint,
  lockedDays: number,
): Promise<UnsignedTransactionResult> {
  const program = createAdrenaProgram(connection);
  const pool = getPoolPublicKey('main-pool');
  const cortex = deriveCortexPda();
  const lpTokenMint = deriveLpTokenMintPda(pool);
  const staking = deriveStakingPda(lpTokenMint);
  const userStaking = deriveUserStakingPda(owner, staking);
  const lmTokenMint = deriveLmTokenMintPda();
  const governanceTokenMint = deriveGovernanceTokenMintPda();
  const feeRedistributionMint = new PublicKey(ADRENA_FEE_REDISTRIBUTION_MINT);
  const transferAuthority = deriveTransferAuthorityPda();
  const fundingAccount = deriveAta(owner, lpTokenMint);
  const rewardTokenAccount = deriveAta(owner, feeRedistributionMint);
  const stakingStakedTokenVault = deriveStakingStakedTokenVaultPda(staking);
  const stakingRewardTokenVault = deriveStakingRewardTokenVaultPda(staking);

  const ix = await buildInstruction(program, 'addLockedStake', [
    { amount: toBN(amount), lockedDays },
  ], {
    owner,
    fundingAccount,
    rewardTokenAccount,
    stakingStakedTokenVault,
    stakingRewardTokenVault,
    transferAuthority,
    userStaking,
    staking,
    cortex,
    lmTokenMint,
    governanceTokenMint,
    feeRedistributionMint,
    governanceRealm: PublicKey.default,
    governanceRealmConfig: PublicKey.default,
    governanceGoverningTokenHolding: PublicKey.default,
    governanceGoverningTokenOwnerRecord: PublicKey.default,
    governanceProgram: new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw'),
    adrenaProgram: new PublicKey(ADRENA_PROGRAM_ID),
    systemProgram: new PublicKey(SYSTEM_PROGRAM_ID),
    tokenProgram: new PublicKey(TOKEN_PROGRAM_ID),
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
    requiredToken: 'LP',
    requiredAmount: Number(amount),
    availableBalance: 0,
    sufficient: true,
    shortfall: 0,
    solBalance,
    solSufficientForFees: solBalance >= 0.005,
  };

  return buildResult(transactionBase64, owner, ['addLockedStake'], undefined, balanceCheck, warning);
}

/**
 * @name buildClaimStakes
 * @description Build an unsigned transaction to claim staking rewards.
 * @param connection — Solana RPC connection.
 * @param owner — Staker and fee payer.
 * @param lockedStakeIndexes — Optional array of locked stake indexes to claim.
 * @returns Unsigned transaction result.
 */
export async function buildClaimStakes(
  connection: Connection,
  owner: PublicKey,
  lockedStakeIndexes: number[] | null,
): Promise<UnsignedTransactionResult> {
  const program = createAdrenaProgram(connection);
  const pool = getPoolPublicKey('main-pool');
  const cortex = deriveCortexPda();
  const lpTokenMint = deriveLpTokenMintPda(pool);
  const staking = deriveStakingPda(lpTokenMint);
  const userStaking = deriveUserStakingPda(owner, staking);
  const genesisLock = deriveGenesisLockPda(pool);
  const lmTokenTreasury = deriveLmTokenTreasuryPda(cortex);
  const lmTokenMint = deriveLmTokenMintPda();
  const feeRedistributionMint = new PublicKey(ADRENA_FEE_REDISTRIBUTION_MINT);
  const transferAuthority = deriveTransferAuthorityPda();
  const rewardTokenAccount = deriveAta(owner, feeRedistributionMint);
  const lmTokenAccount = deriveAta(owner, lmTokenMint);
  const stakingRewardTokenVault = deriveStakingRewardTokenVaultPda(staking);
  const stakingLmRewardTokenVault = deriveStakingLmRewardTokenVaultPda(staking);

  const ix = await buildInstruction(program, 'claimStakes', [
    {
      lockedStakeIndexes: lockedStakeIndexes
        ? Buffer.from(lockedStakeIndexes.flatMap((i) => [i & 0xff, (i >> 8) & 0xff, (i >> 16) & 0xff, (i >> 24) & 0xff]))
        : null,
    },
  ], {
    caller: owner,
    payer: owner,
    owner,
    rewardTokenAccount,
    lmTokenAccount,
    stakingRewardTokenVault,
    stakingLmRewardTokenVault,
    transferAuthority,
    userStaking,
    staking,
    cortex,
    pool,
    genesisLock,
    lmTokenTreasury,
    feeRedistributionMint,
    adrenaProgram: new PublicKey(ADRENA_PROGRAM_ID),
    systemProgram: new PublicKey(SYSTEM_PROGRAM_ID),
    tokenProgram: new PublicKey(TOKEN_PROGRAM_ID),
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

  return buildResult(transactionBase64, owner, ['claimStakes'], undefined, balanceCheck, warning);
}