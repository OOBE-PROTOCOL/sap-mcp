/**
 * @name perps/phoenix/phoenix-constants
 * @description Canonical constants for the Phoenix.trade perp DEX on Solana mainnet.
 *
 * All values are pinned to the official Phoenix perp API at perp-api.phoenix.trade
 * and the on-chain program.
 *
 * @module perps/phoenix/phoenix-constants
 */

/** Phoenix perp API base URL (HTTP data API). */
export const PHOENIX_DATA_API_BASE_URL = 'https://perp-api.phoenix.trade';

/** Phoenix program ID on Solana mainnet. */
export const PHOENIX_PROGRAM_ID = 'PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY';

/** Phoenix global configuration address on Solana mainnet. */
export const PHOENIX_GLOBAL_CONFIGURATION_ADDRESS = 'Gcs8Kk5u5N6LpNgq8Q3FGhnTfW6Ac9pNUk3V4VxLgMxg';

/** Phoenix log authority address. */
export const PHOENIX_LOG_AUTHORITY_ADDRESS = '5bCvY5xG6pJSgKJ6K6XqZm2oqYwQxT8p2tZxKqLm2mZx';

/** USDC mint on Solana mainnet (Phoenix settlement currency). */
export const PHOENIX_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/** Solana Token Program ID. */
export const PHOENIX_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

/** Solana System Program ID. */
export const PHOENIX_SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';

/** Solana Associated Token Program ID. */
export const PHOENIX_ASSOCIATED_TOKEN_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

/** USDC decimals on Phoenix. */
export const PHOENIX_USDC_DECIMALS = 6;

/** Default market symbols available on Phoenix perp. */
export const PHOENIX_DEFAULT_SYMBOLS = [
  'SOL-PERP',
  'BTC-PERP',
  'ETH-PERP',
  'WIF-PERP',
  'BONK-PERP',
  'JUP-PERP',
  'PYTH-PERP',
  'TNSR-PERP',
  'JTO-PERP',
  'RNDR-PERP',
  'W-PERP',
  'BOME-PERP',
] as const;

/** Default candle resolution for Phoenix API. */
export const PHOENIX_DEFAULT_CANDLE_RESOLUTION = '1h';