/**
 * @name perps/adrena/adrena-pda
 * @description PDA derivation helpers for the Adrena protocol on Solana.
 *
 * All PDAs are derived from the official Adrena release/39 ABI layout using
 * `@solana/web3.js` `PublicKey.findProgramAddressSync`.
 *
 * @module perps/adrena/adrena-pda
 */

import { PublicKey } from '@solana/web3.js';
import {
  ADRENA_PROGRAM_ID,
  CORTEX_SEED,
  POOL_SEED,
  CUSTODY_SEED,
  CUSTODY_TOKEN_ACCOUNT_SEED,
  ORACLE_SEED,
  TRANSFER_AUTHORITY_SEED,
  USER_PROFILE_SEED,
  LIMIT_ORDER_BOOK_SEED,
  ESCROW_ACCOUNT_SEED,
  LP_TOKEN_MINT_SEED,
  STAKING_SEED,
  USER_STAKING_SEED,
  GENESIS_LOCK_SEED,
  LM_TOKEN_TREASURY_SEED,
  LM_TOKEN_MINT_SEED,
  GOVERNANCE_TOKEN_MINT_SEED,
  STAKING_STAKED_TOKEN_VAULT_SEED,
  STAKING_REWARD_TOKEN_VAULT_SEED,
  STAKING_LM_REWARD_TOKEN_VAULT_SEED,
} from './adrena-constants.js';

/** Adrena program public key. */
const PROGRAM = new PublicKey(ADRENA_PROGRAM_ID);

/**
 * Derive the Cortex PDA: [Buffer.from("cortex")].
 * @returns Cortex public key.
 */
export function deriveCortexPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([CORTEX_SEED], PROGRAM);
  return pda;
}

/**
 * Derive a Pool PDA from a pool address: [Buffer.from("pool"), poolAddress].
 * Note: Adrena pools are existing accounts, not PDAs in most instructions.
 * The Pool PDA is used for named pools where the seed is the pool name.
 * @param poolName — Pool name bytes (e.g. "main-pool").
 * @returns Pool PDA public key.
 */
export function derivePoolPdaFromName(poolName: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([POOL_SEED, Buffer.from(poolName, 'utf8')], PROGRAM);
  return pda;
}

/**
 * Derive a Custody PDA: [Buffer.from("custody"), pool, seed].
 * @param pool — Pool public key.
 * @param seed — Custody seed (u32 little-endian, 4 bytes).
 * @returns Custody PDA public key.
 */
export function deriveCustodyPda(pool: PublicKey, seed: Buffer): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([CUSTODY_SEED, pool.toBuffer(), seed], PROGRAM);
  return pda;
}

/**
 * Derive a custody token account PDA: [Buffer.from("custody_token_account"), custody].
 * @param custody — Custody public key.
 * @returns Custody token account public key.
 */
export function deriveCustodyTokenAccountPda(custody: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([CUSTODY_TOKEN_ACCOUNT_SEED, custody.toBuffer()], PROGRAM);
  return pda;
}

/**
 * Derive the Oracle PDA: [Buffer.from("oracle")].
 * @returns Oracle public key.
 */
export function deriveOraclePda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([ORACLE_SEED], PROGRAM);
  return pda;
}

/**
 * Derive the transfer authority PDA: [Buffer.from("transfer_authority")].
 * @returns Transfer authority public key.
 */
export function deriveTransferAuthorityPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([TRANSFER_AUTHORITY_SEED], PROGRAM);
  return pda;
}

/**
 * Derive a user profile PDA: [Buffer.from("user_profile"), owner].
 * @param owner — Owner wallet public key.
 * @returns User profile PDA public key.
 */
export function deriveUserProfilePda(owner: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([USER_PROFILE_SEED, owner.toBuffer()], PROGRAM);
  return pda;
}

/**
 * Derive a Position PDA: [Buffer.from("position"), owner, pool, custody, side_byte].
 * Side enum: Long = 1, Short = 2 (NOT 0/1 — see Adrena types.rs Side enum).
 * @param owner — Owner wallet public key.
 * @param pool — Pool public key.
 * @param custody — Custody (principal) public key.
 * @param side — Position side: 'long' | 'short'.
 * @returns Position PDA public key.
 */
export function derivePositionPda(
  owner: PublicKey,
  pool: PublicKey,
  custody: PublicKey,
  side: 'long' | 'short',
): PublicKey {
  const sideByte = Buffer.from([side === 'long' ? 1 : 2]);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('position', 'ascii'), owner.toBuffer(), pool.toBuffer(), custody.toBuffer(), sideByte],
    PROGRAM,
  );
  return pda;
}

/**
 * Derive a limit order book PDA: [Buffer.from("limit_order_book"), owner, pool].
 * @param owner — Owner wallet public key.
 * @param pool — Pool public key.
 * @returns Limit order book PDA public key.
 */
export function deriveLimitOrderBookPda(owner: PublicKey, pool: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [LIMIT_ORDER_BOOK_SEED, owner.toBuffer(), pool.toBuffer()],
    PROGRAM,
  );
  return pda;
}

/**
 * Derive a collateral escrow PDA: [Buffer.from("escrow_account"), owner, pool, collateralCustody].
 * @param owner — Owner wallet public key.
 * @param pool — Pool public key.
 * @param collateralCustody — Collateral custody public key.
 * @returns Collateral escrow PDA public key.
 */
export function deriveCollateralEscrowPda(
  owner: PublicKey,
  pool: PublicKey,
  collateralCustody: PublicKey,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [ESCROW_ACCOUNT_SEED, owner.toBuffer(), pool.toBuffer(), collateralCustody.toBuffer()],
    PROGRAM,
  );
  return pda;
}

/**
 * Derive LP token mint PDA: [Buffer.from("lp_token_mint"), pool].
 * @param pool — Pool public key.
 * @returns LP token mint PDA public key.
 */
export function deriveLpTokenMintPda(pool: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([LP_TOKEN_MINT_SEED, pool.toBuffer()], PROGRAM);
  return pda;
}

/**
 * Derive staking PDA: [Buffer.from("staking"), stakingSeed].
 * The staking seed is the LP token mint for LP staking, or the governance token mint for ADX staking.
 * @param stakingSeed — Staking seed public key (e.g. LP token mint).
 * @returns Staking PDA public key.
 */
export function deriveStakingPda(stakingSeed: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([STAKING_SEED, stakingSeed.toBuffer()], PROGRAM);
  return pda;
}

/**
 * Derive user staking PDA: [Buffer.from("user_staking"), owner, staking].
 * @param owner — Owner wallet public key.
 * @param staking — Staking PDA public key.
 * @returns User staking PDA public key.
 */
export function deriveUserStakingPda(owner: PublicKey, staking: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [USER_STAKING_SEED, owner.toBuffer(), staking.toBuffer()],
    PROGRAM,
  );
  return pda;
}

/**
 * Derive genesis lock PDA: [Buffer.from("genesis_lock"), pool].
 * @param pool — Pool public key.
 * @returns Genesis lock PDA public key.
 */
export function deriveGenesisLockPda(pool: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([GENESIS_LOCK_SEED, pool.toBuffer()], PROGRAM);
  return pda;
}

/**
 * Derive LM token treasury PDA: [Buffer.from("lm_token_treasury"), cortex].
 * @param cortex — Cortex PDA public key.
 * @returns LM token treasury PDA public key.
 */
export function deriveLmTokenTreasuryPda(cortex: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([LM_TOKEN_TREASURY_SEED, cortex.toBuffer()], PROGRAM);
  return pda;
}

/**
 * Derive LM token mint PDA: [Buffer.from("lm_token_mint")].
 * @returns LM token mint PDA public key.
 */
export function deriveLmTokenMintPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([LM_TOKEN_MINT_SEED], PROGRAM);
  return pda;
}

/**
 * Derive governance token mint PDA: [Buffer.from("governance_token_mint")].
 * @returns Governance token mint PDA public key.
 */
export function deriveGovernanceTokenMintPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([GOVERNANCE_TOKEN_MINT_SEED], PROGRAM);
  return pda;
}

/**
 * Derive staking staked token vault PDA: [Buffer.from("staking_staked_token_vault"), staking].
 * @param staking — Staking PDA public key.
 * @returns Staking staked token vault PDA public key.
 */
export function deriveStakingStakedTokenVaultPda(staking: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [STAKING_STAKED_TOKEN_VAULT_SEED, staking.toBuffer()],
    PROGRAM,
  );
  return pda;
}

/**
 * Derive staking reward token vault PDA: [Buffer.from("staking_reward_token_vault"), staking].
 * @param staking — Staking PDA public key.
 * @returns Staking reward token vault PDA public key.
 */
export function deriveStakingRewardTokenVaultPda(staking: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [STAKING_REWARD_TOKEN_VAULT_SEED, staking.toBuffer()],
    PROGRAM,
  );
  return pda;
}

/**
 * Derive staking LM reward token vault PDA: [Buffer.from("staking_lm_reward_token_vault"), staking].
 * @param staking — Staking PDA public key.
 * @returns Staking LM reward token vault PDA public key.
 */
export function deriveStakingLmRewardTokenVaultPda(staking: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [STAKING_LM_REWARD_TOKEN_VAULT_SEED, staking.toBuffer()],
    PROGRAM,
  );
  return pda;
}

/**
 * Derive the associated token account address for a wallet and mint.
 * Re-exported from the shared `solana/ata-utils` module for backward compat.
 * New code should import from `solana/ata-utils.ts` directly.
 * @param owner — Wallet public key.
 * @param mint — Token mint public key.
 * @returns ATA public key.
 */
export { deriveAtaAddress as deriveAta } from '../../../solana/src/ata-utils.js';