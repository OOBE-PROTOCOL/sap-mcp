/**
 * @name perps/adrena/adrena-constants
 * @description Canonical constants for the Adrena protocol on Solana mainnet.
 *
 * All values are pinned to the official Adrena release/39 ABI and the on-chain
 * program at `13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet`.
 *
 * @module perps/adrena/adrena-constants
 */

/** Adrena program ID on Solana mainnet. */
export const ADRENA_PROGRAM_ID = '13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet';

/** Adrena Cortex PDA seed. */
export const CORTEX_SEED = Buffer.from('cortex', 'ascii');

/** Adrena Pool PDA seed. */
export const POOL_SEED = Buffer.from('pool', 'ascii');

/** Adrena Custody PDA seed. */
export const CUSTODY_SEED = Buffer.from('custody', 'ascii');

/** Adrena custody token account PDA seed. */
export const CUSTODY_TOKEN_ACCOUNT_SEED = Buffer.from('custody_token_account', 'ascii');

/** Adrena Oracle PDA seed. */
export const ORACLE_SEED = Buffer.from('oracle', 'ascii');

/** Adrena transfer authority PDA seed. */
export const TRANSFER_AUTHORITY_SEED = Buffer.from('transfer_authority', 'ascii');

/** Adrena user profile PDA seed. */
export const USER_PROFILE_SEED = Buffer.from('user_profile', 'ascii');

/** Adrena limit order book PDA seed. */
export const LIMIT_ORDER_BOOK_SEED = Buffer.from('limit_order_book', 'ascii');

/** Adrena collateral escrow PDA seed. */
export const ESCROW_ACCOUNT_SEED = Buffer.from('escrow_account', 'ascii');

/** Adrena LP token mint PDA seed. */
export const LP_TOKEN_MINT_SEED = Buffer.from('lp_token_mint', 'ascii');

/** Adrena staking PDA seed. */
export const STAKING_SEED = Buffer.from('staking', 'ascii');

/** Adrena user staking PDA seed. */
export const USER_STAKING_SEED = Buffer.from('user_staking', 'ascii');

/** Adrena genesis lock PDA seed. */
export const GENESIS_LOCK_SEED = Buffer.from('genesis_lock', 'ascii');

/** Adrena LM token treasury PDA seed. */
export const LM_TOKEN_TREASURY_SEED = Buffer.from('lm_token_treasury', 'ascii');

/** Adrena LM token mint PDA seed. */
export const LM_TOKEN_MINT_SEED = Buffer.from('lm_token_mint', 'ascii');

/** Adrena governance token mint PDA seed. */
export const GOVERNANCE_TOKEN_MINT_SEED = Buffer.from('governance_token_mint', 'ascii');

/** Adrena staking staked token vault PDA seed. */
export const STAKING_STAKED_TOKEN_VAULT_SEED = Buffer.from('staking_staked_token_vault', 'ascii');

/** Adrena staking reward token vault PDA seed. */
export const STAKING_REWARD_TOKEN_VAULT_SEED = Buffer.from('staking_reward_token_vault', 'ascii');

/** Adrena staking LM reward token vault PDA seed. */
export const STAKING_LM_REWARD_TOKEN_VAULT_SEED = Buffer.from('staking_lm_reward_token_vault', 'ascii');

/** Solana Token Program ID. */
export const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

/** Solana System Program ID. */
export const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';

/** Solana Associated Token Program ID. */
export const ASSOCIATED_TOKEN_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

/** Solana Governance Program ID (Adrena uses SPL Governance). */
export const GOVERNANCE_PROGRAM_ID = 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw';

/** Adrena main pool address on Solana mainnet. */
export const ADRENA_MAIN_POOL_ADDRESS = '4bQRutgDJs6vuh6ZcWaPVXiQaBzbHketjbCDjL4oRN34';

/** Adrena main pool name (used in Pool PDA derivation for named pools). */
export const ADRENA_MAIN_POOL_NAME = 'main-pool';

/** Adrena commodities pool address on Solana mainnet. */
export const ADRENA_COMMODITIES_POOL_ADDRESS = 'GN2hyBVHcUitWETeDfAoeXDMqow1x8StqdRFnGaUB2vb';

/** Adrena commodities pool name. */
export const ADRENA_COMMODITIES_POOL_NAME = 'commodities-pool';

/** Adrena USD decimals (used for size/collateral USD values). */
export const ADRENA_USD_DECIMALS = 6;

/** Adrena price decimals (used for oracle prices). */
export const ADRENA_PRICE_DECIMALS = 10;

/** Adrena BPS decimals. */
export const ADRENA_BPS_DECIMALS = 4;

/**
 * Adrena mainnet custody addresses by token symbol.
 * Each custody is a PDA derived from [CUSTODY_SEED, pool, seed].
 */
export const ADRENA_CUSTODIES = {
  // Main pool custodies
  USDC: { address: 'Dk523LZeDQbZtUwPEBjFXCd2Au1tD7mWZBJJmcgHktNk', pool: ADRENA_MAIN_POOL_ADDRESS, symbol: 'USDC', decimals: 6, kind: 'collateral' },
  JITOSOL: { address: 'GZ9XfWwgTRhkma2Y91Q9r1XKotNXYjBnKKabj19rhT71', pool: ADRENA_MAIN_POOL_ADDRESS, symbol: 'JITOSOL', decimals: 9, kind: 'perp' },
  WBTC: { address: 'GFu3qS22mo6bAjg4Lr5R7L8pPgHq6GvbjJPKEHkbbs2c', pool: ADRENA_MAIN_POOL_ADDRESS, symbol: 'WBTC', decimals: 8, kind: 'perp' },
  BONK: { address: '8aJuzsgjxBnvRhDcfQBD7z4CUj7QoPEpaNwVd7KqsSk5', pool: ADRENA_MAIN_POOL_ADDRESS, symbol: 'BONK', decimals: 5, kind: 'perp' },
  // Commodities pool custodies
  XAU: { address: 'JB86ouHXGYgF4UbPs8yxYdaHudrdsintf5EbBfMydzYt', pool: ADRENA_COMMODITIES_POOL_ADDRESS, symbol: 'XAU', decimals: 6, kind: 'synthetic-perp' },
  XAG: { address: 'PexsCkkxpVmY4HNxUjT3U9PEg69kYScc8GukUwn6Q3Q', pool: ADRENA_COMMODITIES_POOL_ADDRESS, symbol: 'XAG', decimals: 6, kind: 'synthetic-perp' },
  WTI: { address: 'De21TFyUPHkvFsWAt6xJLBBXGp636VuL5cKk2DvfbHiR', pool: ADRENA_COMMODITIES_POOL_ADDRESS, symbol: 'WTI', decimals: 6, kind: 'synthetic-perp' },
} as const;

/** Adrena token mint addresses by symbol. */
export const ADRENA_TOKEN_MINTS: Record<string, string> = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  JITOSOL: 'J1toso1uCk3RLmjorhT3VnYEXW1yC7KqkKJZkFJQqLp',
  WBTC: '3NZ9JMVBm1E9dBE3leTet7Lkf3M2kKq3xZ2nEF3fGwxb',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
};

/** Adrena fee redistribution mint (ADX). */
export const ADRENA_FEE_REDISTRIBUTION_MINT = '2zqtcQy7oc9Wf7TncsKQw1vq5gk6kG6r6wG6r6wG6r6';

/** Adrena Data API base URL. */
export const ADRENA_DATA_API_BASE_URL = 'https://datapi.adrena.trade';

/** Adrena lookup table address (for Jito bundles — not required for unsigned tx building). */
export const ADRENA_LOOKUP_TABLE_ADDRESS = 'AuY9PZk8k2y7Fw3k4LqM3vN8o1xJ5rW2hY6tZ9bC4sD';