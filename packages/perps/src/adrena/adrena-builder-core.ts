/**
 * @name perps/adrena/adrena-builder-core
 * @description Shared types, helpers, and utilities for Adrena perps builders.
 *
 * This module contains the common infrastructure used by all builder modules:
 * types (PositionSide, AdrenaPool, TokenBalance, BalanceCheck, UnsignedTransactionResult),
 * IDL loading, and all helper functions.
 *
 * @module perps/adrena/adrena-builder-core
 */

import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  Connection,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import BN from 'bn.js';
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { logger } from '@oobe-protocol-labs/sap-mcp-core/logger';
import {
  ADRENA_PROGRAM_ID,
  ADRENA_MAIN_POOL_ADDRESS,
  ADRENA_DATA_API_BASE_URL,
  ADRENA_COMMODITIES_POOL_ADDRESS,
  ADRENA_CUSTODIES,
  ADRENA_DEFAULT_REFERRER_PROFILE,
  ADRENA_TOKEN_MINTS,
  SYSTEM_PROGRAM_ID,
} from './adrena-constants.js';
import { ADRENA_IDL } from './adrena-idl.js';
import {
  deriveCortexPda,
  deriveUserProfilePda,
} from './adrena-pda.js';

// ─── IDL Loading ──────────────────────────────────────────────────────────────

/** Cached parsed IDL object. */
let cachedIdl: Idl | null = null;

/**
 * Load the vendored Adrena IDL.
 * The IDL is embedded as a TypeScript module so `tsc` includes it in the
 * compiled output without requiring a separate file copy step.
 * @returns Parsed Anchor IDL.
 */
function loadAdrenaIdl(): Idl {
  if (cachedIdl) return cachedIdl;
  // The IDL is imported as a typed constant from adrena-idl.ts.
  cachedIdl = ADRENA_IDL as unknown as Idl;
  return cachedIdl;
}

// ─── Types ────────────────────────────────────────────────────────────────────

/** Side of a perp position. */
export type PositionSide = 'long' | 'short';

/** Pool identifier. */
export type AdrenaPool = 'main-pool' | 'commodities-pool';

/**
 * Token balance for a single token in the owner's wallet.
 * All amounts are in human-readable units (e.g. 1.5 USDC = 1.5).
 */
export interface TokenBalance {
  /** Token symbol (USDC, JITOSOL, WBTC, BONK, SOL). */
  symbol: string;
  /** Mint address. */
  mint: string;
  /** Human-readable balance (adjusted for decimals). */
  balance: number;
  /** Raw bigint balance (lamports/atoms). */
  balanceRaw: string;
  /** Token decimals. */
  decimals: number;
  /** ATA address (empty string if SOL). */
  ata: string;
  /** Whether the ATA exists on-chain. */
  ataExists: boolean;
}

/**
 * Pre-flight balance check result. Returned alongside the unsigned transaction
 * so the agent/user can see exactly what token balances are available and
 * whether the requested operation will succeed on-chain.
 */
export interface BalanceCheck {
  /** Wallet address that was checked. */
  wallet: string;
  /** All token balances fetched (USDC, JITOSOL, WBTC, BONK, SOL). */
  balances: TokenBalance[];
  /** The token symbol required as collateral/funding for this operation. */
  requiredToken: string;
  /** Human-readable amount required. */
  requiredAmount: number;
  /** Human-readable balance available. */
  availableBalance: number;
  /** True if available >= required. */
  sufficient: boolean;
  /** Human-readable shortfall (0 if sufficient). */
  shortfall: number;
  /** SOL balance for gas/fees. */
  solBalance: number;
  /** True if SOL balance is enough for transaction fees (~0.005 SOL minimum). */
  solSufficientForFees: boolean;
}

/**
 * Pool/custody metadata read from the on-chain custody account.
 * Included in UnsignedTransactionResult for open-position builders so the
 * agent/user can see leverage limits and open interest before signing.
 */
export interface PoolMetadata {
  /** Maximum initial leverage for new positions (human-readable, e.g. 100 = 100x). */
  maxInitialLeverage: number;
  /** Maximum leverage after position is open (human-readable, e.g. 150 = 150x). */
  maxLeverage: number;
  /** Maximum position size locked in USD (human-readable). */
  maxPositionLockedUsd: number;
  /** Current open interest on the long side in USD (human-readable). */
  openInterestLongUsd: number;
  /** Current open interest on the short side in USD (human-readable). */
  openInterestShortUsd: number;
}

/**
 * Encode a human leverage multiplier into Adrena's 1e4 BPS wire format.
 * Example: 3x => 30000, 100x => 1000000.
 */
export function encodeAdrenaLeverage(leverage: number): number {
  if (!Number.isFinite(leverage) || leverage <= 0) {
    throw new Error(`Invalid leverage ${leverage}; expected a positive finite multiplier such as 3 for 3x.`);
  }
  return Math.round(leverage * 10_000);
}

/**
 * Result of simulating a position open without building or serializing a transaction.
 * Free dry-run — no x402 charge, no transaction bytes returned.
 */
export interface SimulatePositionResult {
  /** Program simulation logs from the Adrena instruction. */
  simulationLogs: string[];
  /** Simulation error string if the transaction would fail on-chain. */
  simulationError?: string;
  /** Compute units consumed by the simulated instructions. */
  unitsConsumed?: number;
  /** True if the simulation succeeded (no error in simulation). */
  wouldSucceed: boolean;
  /** Pre-flight balance check for the collateral token. */
  balanceCheck: BalanceCheck;
}

/** Result of building an unsigned transaction. */
export interface UnsignedTransactionResult {
  /** Base64-serialized unsigned transaction. */
  transactionBase64: string;
  /** Transaction encoding. */
  encoding: 'base64';
  /** Fee payer public key. */
  feePayer: string;
  /** Description of the instructions included. */
  instructions: string[];
  /** The position PDA if relevant. */
  positionAddress?: string;
  /** Next tool to call for signing. */
  nextTool: 'sap_payments_finalize_transaction';
  /** Arguments to pass to the finalize tool. */
  finalizeArgs: {
    transactionBase64: string;
    submit: boolean;
  };
  /** Pre-flight balance check (present when the builder performed one). */
  balanceCheck?: BalanceCheck;
  /** Pool/custody metadata (present for open-position builders). */
  poolMetadata?: PoolMetadata;
  /** Requested leverage metadata for Adrena open-position builders. */
  requestedLeverage?: {
    multiplier: number;
    encodedBps: number;
    scale: 'adrena_bps_1e4';
  };
  /** Warning message if balance is insufficient or other pre-flight concern. */
  warning?: string;
  /** Pre-submit simulation logs from the builder (when available). */
  simulationLogs?: string[];
  /** Pre-submit simulation error (when simulation fails). */
  simulationError?: string;
  /** Compute units consumed (from simulation). */
  simulationUnitsConsumed?: number;
  /** Priority fee in micro-lamports applied to this transaction (0 = none). */
  priorityFeeMicroLamports?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a bigint to a BN instance for Anchor instruction encoding.
 * Anchor 0.30.x uses @coral-xyz/borsh which requires BN, not native BigInt.
 * @param value — bigint value.
 * @returns BN instance.
 */
export function toBN(value: bigint): BN {
  return new BN(value.toString());
}

/**
 * Convert a bigint or null to a BN or null for optional Anchor fields.
 * @param value — bigint or null.
 * @returns BN instance or null.
 */
export function toBNOrNull(value: bigint | null): BN | null {
  return value === null ? null : new BN(value.toString());
}

/**
 * Get pool public key by name.
 * @param poolName — Pool identifier.
 * @returns Pool public key.
 */
export function getPoolPublicKey(poolName: AdrenaPool): PublicKey {
  const addr = poolName === 'commodities-pool' ? ADRENA_COMMODITIES_POOL_ADDRESS : ADRENA_MAIN_POOL_ADDRESS;
  return new PublicKey(addr);
}

/**
 * Get custody public key by symbol.
 * @param symbol — Token symbol (e.g. "JITOSOL", "USDC").
 * @param poolName — Pool identifier.
 * @returns Custody public key.
 */
export function getCustodyPublicKey(symbol: string, poolName: AdrenaPool = 'main-pool'): PublicKey {
  const sym = symbol.toUpperCase();
  // Special case: USDC collateral in the commodities pool uses a different
  // custody address than main-pool USDC.
  if (sym === 'USDC' && poolName === 'commodities-pool') {
    const commoditiesUsdc = ADRENA_CUSTODIES['USDC_COMMODITIES' as keyof typeof ADRENA_CUSTODIES];
    if (commoditiesUsdc) return new PublicKey(commoditiesUsdc.address);
  }
  const custody = ADRENA_CUSTODIES[sym as keyof typeof ADRENA_CUSTODIES];
  if (!custody) {
    throw new Error(`Unknown custody symbol: ${symbol}. Supported: ${Object.keys(ADRENA_CUSTODIES).join(', ')}`);
  }
  if (poolName === 'commodities-pool' && custody.pool !== ADRENA_COMMODITIES_POOL_ADDRESS) {
    throw new Error(`Custody ${symbol} is not in the commodities pool`);
  }
  return new PublicKey(custody.address);
}

/**
 * Get token mint by symbol.
 * @param symbol — Token symbol.
 * @returns Mint public key.
 */
export function getMintPublicKey(symbol: string): PublicKey {
  const mint = ADRENA_TOKEN_MINTS[symbol.toUpperCase()];
  if (!mint) {
    throw new Error(`Unknown token mint: ${symbol}. Supported: ${Object.keys(ADRENA_TOKEN_MINTS).join(', ')}`);
  }
  return new PublicKey(mint);
}

/**
 * Build a CreateAssociatedTokenAccountIdempotent instruction using @solana/spl-token.
 * This instruction creates the ATA if it doesn't exist, and is a no-op if it does.
 *
 * @param owner — Wallet public key that will own the ATA.
 * @param mint — Token mint public key.
 * @param payer — Fee payer public key (usually the owner).
 * @returns TransactionInstruction for CreateAssociatedTokenAccountIdempotent.
 */
export function createAtaIdempotentIx(owner: PublicKey, mint: PublicKey, payer: PublicKey): TransactionInstruction {
  const ata = getAssociatedTokenAddressSync(mint, owner);
  return createAssociatedTokenAccountIdempotentInstruction(payer, ata, owner, mint);
}

/**
 * Fetch the current USD price for a token from the Adrena Data API.
 * Uses the same format as the Adrena SDK's DataApiClient.getLatestPrices():
 *   GET https://datapi.adrena.trade/last-trading-prices
 *   Response: { data: { autonom: { prices: [{ symbol, price, exponent }] } } }
 *
 * The price is a string at 10-decimal precision; adjust by exponent to get USD float.
 * Returns the price as a BigInt scaled by 10^10 (PRICE_DECIMALS).
 *
 * @param principalToken — Token symbol (SOL, BONK, BTC, etc.)
 *   JITOSOL maps to SOL (same as the SDK).
 * @returns Price as BigInt scaled by 10^10, or BigInt(0) if fetch fails.
 */
export async function fetchOraclePrice(principalToken: string, side?: 'long' | 'short'): Promise<bigint> {
  try {
    // JITOSOL uses SOL price (same as SDK: getPythPrice(principalToken === "JITOSOL" ? "SOL" : principalToken))
    const symbol = principalToken.toUpperCase() === 'JITOSOL' ? 'SOL' : principalToken.toUpperCase();
    const apiUrl = `${ADRENA_DATA_API_BASE_URL}/last-trading-prices`;
    const response = await fetch(apiUrl, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return BigInt(0);
    const json = await response.json() as {
      data?: {
        autonom?: {
          prices?: { symbol: string; price: string; exponent: number }[];
        };
      };
    };
    const prices = json?.data?.autonom?.prices;
    if (!prices?.length) return BigInt(0);

    // Find the price entry — symbols are like "SOLUSD", "BTCUSD", "BONKUSD"
    const priceEntry = prices.find(
      p => p.symbol.toUpperCase() === `${symbol}USD` || p.symbol.toUpperCase() === symbol,
    );
    if (!priceEntry) return BigInt(0);

    // price is at 10-decimal precision; adjust by exponent to get USD float
    const usdPrice = Number(priceEntry.price) * Math.pow(10, priceEntry.exponent ?? -10);
    if (usdPrice <= 0) return BigInt(0);

    // Scale to 10^10 (PRICE_DECIMALS) and apply 0.3% slippage
    // SDK uses: short → price * 0.997, long → price * 1.003
    const slippageMultiplier = side === 'short' ? 0.997 : side === 'long' ? 1.003 : 1.0;
    const scaled = Math.floor(usdPrice * slippageMultiplier * Math.pow(10, 10));
    return BigInt(scaled);
  } catch {
    // Data API unavailable — return 0
  }
  return BigInt(0);
}

/**
 * Read the collateral custody token account address from the on-chain custody account.
 * The custody account stores the tokenAccount at byte offset 80 (after the 8-byte
 * Anchor discriminator + 2 boolean flags + 1 decimal byte + 5 padding + 32 pool).
 *
 * This is more reliable than PDA derivation because the seed layout may differ
 * from what the IDL declares.
 *
 * @param connection — Solana RPC connection.
 * @param custodyAddress — The custody PDA public key.
 * @returns The token account public key stored in the custody account.
 */
export async function readCustodyTokenAccount(
  connection: Connection,
  custodyAddress: PublicKey,
): Promise<PublicKey> {
  const accountInfo = await connection.getAccountInfo(custodyAddress);
  if (!accountInfo || accountInfo.data.length < 112) {
    throw new Error(`Custody account ${custodyAddress.toBase58()} not found or too small`);
  }
  // tokenAccount is at offset 80 (32 bytes)
  return new PublicKey(accountInfo.data.subarray(80, 112));
}

/**
 * Read pool/custody metadata from the on-chain custody account.
 *
 * Fields and their byte offsets (all little-endian):
 *   - maxInitialLeverage: u32 at offset 176 (in BPS, 1000000 = 100x)
 *   - maxLeverage:        u32 at offset 180 (in BPS, 1000000 = 100x)
 *   - maxPositionLockedUsd: u128 at offset 184 (scaled by 1e6)
 *   - openInterestLongUsd:  u128 at offset 408 (scaled by 1e6)
 *   - openInterestShortUsd: u128 at offset 608 (scaled by 1e6)
 *
 * Leverage values are divided by 10000 for human-readable form.
 * USD values are divided by 1e6 for human-readable form.
 *
 * @param connection — Solana RPC connection.
 * @param custodyAddress — The custody PDA public key.
 * @returns PoolMetadata with human-readable values.
 */
export async function readCustodyMetadata(
  connection: Connection,
  custodyAddress: PublicKey,
): Promise<PoolMetadata> {
  const accountInfo = await connection.getAccountInfo(custodyAddress);
  if (!accountInfo || accountInfo.data.length < 624) {
    throw new Error(`Custody account ${custodyAddress.toBase58()} not found or too small for metadata (need >= 624 bytes, got ${accountInfo?.data.length ?? 0})`);
  }
  const data = accountInfo.data;

  // maxInitialLeverage: u32 LE at offset 176 (BPS)
  const maxInitialLeverageBps = data.readUInt32LE(176);
  // maxLeverage: u32 LE at offset 180 (BPS)
  const maxLeverageBps = data.readUInt32LE(180);

  // maxPositionLockedUsd: u128 LE at offset 184 (scaled by 1e6)
  // u128 = 16 bytes, read as two u64s (low, high) and combine
  const maxPositionLockedUsdRaw = data.readBigUInt64LE(184) | (data.readBigUInt64LE(192) << 64n);

  // openInterestLongUsd: u128 LE at offset 408 (scaled by 1e6)
  const openInterestLongUsdRaw = data.readBigUInt64LE(408) | (data.readBigUInt64LE(416) << 64n);

  // openInterestShortUsd: u128 LE at offset 608 (scaled by 1e6)
  const openInterestShortUsdRaw = data.readBigUInt64LE(608) | (data.readBigUInt64LE(616) << 64n);

  return {
    maxInitialLeverage: maxInitialLeverageBps / 10000,
    maxLeverage: maxLeverageBps / 10000,
    maxPositionLockedUsd: Number(maxPositionLockedUsdRaw) / 1e6,
    openInterestLongUsd: Number(openInterestLongUsdRaw) / 1e6,
    openInterestShortUsd: Number(openInterestShortUsdRaw) / 1e6,
  };
}

/**
 * Validate that the requested leverage does not exceed the custody's
 * maxInitialLeverage. Throws a clear error if it does.
 *
 * @param leverage — Requested leverage (human-readable, e.g. 3 = 3x).
 * @param maxInitialLeverageBps — Max initial leverage in BPS (e.g. 1000000 = 100x).
 * @param principalToken — Token symbol for the error message.
 */
export function validateLeverage(
  leverage: number,
  maxInitialLeverageBps: number,
  principalToken: string,
): void {
  const leverageBps = encodeAdrenaLeverage(leverage);
  if (leverageBps > maxInitialLeverageBps) {
    const maxLeverage = maxInitialLeverageBps / 10000;
    const suggested = Math.floor(maxLeverage * 100) / 100; // round down to 2 decimals
    throw new Error(
      `Leverage ${leverage} exceeds maxInitialLeverage ${maxLeverage} for ${principalToken}. Suggested leverage: ${suggested} or lower.`,
    );
  }
}

/**
 * Fetch all Adrena-relevant token balances for a wallet: USDC, JITOSOL, WBTC, BONK, and SOL.
 *
 * For SPL tokens, reads the Associated Token Account (ATA) balance via
 * `connection.getParsedTokenAccountsByOwner`. For SOL, reads lamports via
 * `connection.getBalance`.
 *
 * @param connection — Solana RPC connection.
 * @param owner — Wallet public key.
 * @returns Array of TokenBalance for each supported token (including zero balances).
 */
export async function getWalletTokenBalances(
  connection: Connection,
  owner: PublicKey,
): Promise<TokenBalance[]> {
  const balances: TokenBalance[] = [];
  const solBalanceLamports = await connection.getBalance(owner, 'confirmed');
  balances.push({
    symbol: 'SOL',
    mint: 'So11111111111111111111111111111111111111112',
    balance: solBalanceLamports / 1e9,
    balanceRaw: String(solBalanceLamports),
    decimals: 9,
    ata: '',
    ataExists: true,
  });

  for (const [symbol, mintStr] of Object.entries(ADRENA_TOKEN_MINTS)) {
    const mint = new PublicKey(mintStr);
    const ata = getAssociatedTokenAddressSync(mint, owner);
    const custodyInfo = ADRENA_CUSTODIES[symbol as keyof typeof ADRENA_CUSTODIES];
    const decimals = custodyInfo?.decimals ?? 6;

    try {
      const ataInfo = await connection.getAccountInfo(ata, 'confirmed');
      if (!ataInfo || !ataInfo.data || ataInfo.data.length < 64) {
        balances.push({
          symbol,
          mint: mintStr,
          balance: 0,
          balanceRaw: '0',
          decimals,
          ata: ata.toBase58(),
          ataExists: false,
        });
        continue;
      }
      // Token account layout: amount is at offset 64 (u64 LE), but we should use
      // getParsedAccountInfo for reliability.
      const parsed = await connection.getParsedAccountInfo(ata, 'confirmed');
      const parsedData = (parsed.value?.data as unknown as { parsed?: { info?: { tokenAmount?: { amount: string; decimals: number } } } } | undefined);
      const amountStr = parsedData?.parsed?.info?.tokenAmount?.amount ?? '0';
      const amount = Number(amountStr);
      const humanReadable = amount / Math.pow(10, decimals);
      balances.push({
        symbol,
        mint: mintStr,
        balance: humanReadable,
        balanceRaw: amountStr,
        decimals,
        ata: ata.toBase58(),
        ataExists: true,
      });
    } catch {
      balances.push({
        symbol,
        mint: mintStr,
        balance: 0,
        balanceRaw: '0',
        decimals,
        ata: ata.toBase58(),
        ataExists: false,
      });
    }
  }

  return balances;
}

/**
 * Pre-flight balance check: compare requested collateral/amount against the
 * wallet's actual token balance, and check SOL for fees.
 *
 * Returns a BalanceCheck object that can be embedded in the UnsignedTransactionResult
 * so the agent/user sees balances and warnings before signing.
 *
 * @param connection — Solana RPC connection.
 * @param owner — Wallet public key.
 * @param requiredToken — Token symbol required (e.g. "USDC", "JITOSOL").
 * @param requiredAmount — Human-readable amount required.
 * @returns BalanceCheck with all balances and sufficiency flags.
 */
export async function checkSufficientBalance(
  connection: Connection,
  owner: PublicKey,
  requiredToken: string,
  requiredAmount: number,
): Promise<BalanceCheck> {
  const balances = await getWalletTokenBalances(connection, owner);
  const required = requiredToken.toUpperCase();
  const requiredBalance = balances.find(b => b.symbol === required);
  const available = requiredBalance?.balance ?? 0;
  const solBalance = balances.find(b => b.symbol === 'SOL')?.balance ?? 0;
  const shortfall = Math.max(0, requiredAmount - available);

  return {
    wallet: owner.toBase58(),
    balances,
    requiredToken: required,
    requiredAmount,
    availableBalance: available,
    sufficient: available >= requiredAmount,
    shortfall,
    solBalance,
    solSufficientForFees: solBalance >= 0.005,
  };
}

/**
 * Check if a user profile PDA exists on-chain. If it doesn't, build an
 * init_user_profile instruction to create it before any Adrena position operation.
 *
 * @param connection — Solana RPC connection.
 * @param owner — Wallet public key that needs a user profile.
 * @returns Array of pre-instructions (empty if profile exists, or [initUserProfile] if not).
 */
export async function ensureUserProfileInstructions(
  connection: Connection,
  owner: PublicKey,
): Promise<TransactionInstruction[]> {
  const userProfile = deriveUserProfilePda(owner);
  try {
    const accountInfo = await connection.getAccountInfo(userProfile);
    if (accountInfo && accountInfo.data.length > 0) {
      return []; // Profile exists, no instruction needed.
    }
  } catch {
    // Account check failed — assume profile doesn't exist and try to init.
  }

  // Profile doesn't exist — build init_user_profile instruction.
  const program = createAdrenaProgram(connection);
  const cortex = deriveCortexPda();

  // user_nickname PDA: ['nickname', nickname_string]
  // Use a default nickname derived from the wallet address.
  const nickname = owner.toBase58().slice(0, 10);
  const [userNickname] = PublicKey.findProgramAddressSync(
    [Buffer.from('nickname'), Buffer.from(nickname)],
    new PublicKey(ADRENA_PROGRAM_ID),
  );

  // referrer_profile is optional in the IDL ("optional": true).
  // Anchor 0.30.x handles this by passing null — the instruction builder
  // omits the account and the program treats it as "no referrer".
  // Passing PublicKey.default or cortex doesn't work because the program
  // checks the account discriminator (AccountDiscriminatorMismatch).

  const ix = await buildInstruction(program, 'initUserProfile', [
    {
      nickname,
      profilePicture: 0,
      wallpaper: 0,
      title: 0,
      team: 0,
      continent: 0,
    },
  ], {
    user: owner,
    caller: owner,
    payer: owner,
    userProfile,
    userNickname,
    referrerProfile: null,
    cortex,
    systemProgram: new PublicKey(SYSTEM_PROGRAM_ID),
  });

  return [ix];
}

/**
 * Always return a CreateAssociatedTokenAccountIdempotent instruction.
 * The instruction is a no-op if the ATA already exists, so it's safe to always include.
 *
 * @param _connection — Unused (kept for API compatibility).
 * @param owner — Wallet public key.
 * @param mint — Token mint public key.
 * @param payer — Fee payer public key.
 * @returns Array with a single CreateAssociatedTokenAccountIdempotent instruction.
 */
export async function ensureAtaInstructions(
  _connection: Connection,
  owner: PublicKey,
  mint: PublicKey,
  payer: PublicKey,
): Promise<TransactionInstruction[]> {
  return [createAtaIdempotentIx(owner, mint, payer)];
}

interface AdrenaIdlAccountMeta {
  name: string;
  writable?: boolean;
  signer?: boolean;
  optional?: boolean;
}

interface AdrenaIdlInstructionMeta {
  name: string;
  accounts?: AdrenaIdlAccountMeta[];
}

function camelToSnake(value: string): string {
  return value.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function getIdlInstructionAccounts(program: Program, ixName: string): AdrenaIdlAccountMeta[] {
  const idl = (program as unknown as { idl?: { instructions?: AdrenaIdlInstructionMeta[] } }).idl;
  const snakeName = camelToSnake(ixName);
  const instruction = idl?.instructions?.find(candidate =>
    candidate.name === ixName || candidate.name === snakeName,
  );
  return instruction?.accounts ?? [];
}

const DEFAULT_REFERRER_PROFILE_PUBKEY = new PublicKey(ADRENA_DEFAULT_REFERRER_PROFILE);

function callerRequestedNullReferrer(accounts: Record<string, PublicKey | null>): boolean {
  return Object.prototype.hasOwnProperty.call(accounts, 'referrerProfile') && accounts['referrerProfile'] === null;
}

function getFinalIdlAccounts(
  idlAccounts: AdrenaIdlAccountMeta[],
  accounts: Record<string, PublicKey | null>,
): AdrenaIdlAccountMeta[] {
  return idlAccounts.filter(accountMeta => {
    if (!accountMeta.optional) {
      return true;
    }

    const camelName = snakeToCamel(accountMeta.name);
    return !(Object.prototype.hasOwnProperty.call(accounts, camelName) && accounts[camelName] === null);
  });
}

function normalizeAdrenaAccountMetas(
  ixName: string,
  idlAccounts: AdrenaIdlAccountMeta[],
  accounts: Record<string, PublicKey | null>,
  ix: TransactionInstruction,
): TransactionInstruction {
  const finalIdlAccounts = getFinalIdlAccounts(idlAccounts, accounts);
  const isOpenPositionInstruction =
    ixName === 'openOrIncreasePositionLong' || ixName === 'openOrIncreasePositionShort';

  if (finalIdlAccounts.length === 0 || finalIdlAccounts.length !== ix.keys.length) {
    if (!isOpenPositionInstruction) {
      return ix;
    }

    const keys = ix.keys.map(key => ({
      ...key,
      // Anchor can leave a trailing placeholder account for the omitted
      // optional referrer, which makes the concrete account list longer than
      // the filtered IDL account list. In open-position instructions any
      // remaining Dhz8... account is the cortex PDA, and Adrena's CPI path
      // requires it writable.
      isWritable: key.pubkey.equals(DEFAULT_REFERRER_PROFILE_PUBKEY) ? true : key.isWritable,
    }));

    return new TransactionInstruction({
      programId: ix.programId,
      keys,
      data: ix.data,
    });
  }

  const keys = ix.keys.map((key, index) => {
    const accountMeta = finalIdlAccounts[index];
    if (!accountMeta) {
      return key;
    }

    const openPositionNeedsWritableCortex =
      accountMeta.name === 'cortex' &&
      isOpenPositionInstruction;

    return {
      ...key,
      isSigner: accountMeta.signer === true,
      // Adrena's on-chain open-position path performs an internal CPI that
      // expects cortex to be writable even though the vendored IDL marks
      // cortex readonly for open_or_increase_position_{long,short}. If we
      // follow the IDL literally, simulation fails with:
      // "Dhz8Ta79... writable privilege escalated".
      isWritable: openPositionNeedsWritableCortex || accountMeta.writable === true,
    };
  });

  return new TransactionInstruction({
    programId: ix.programId,
    keys,
    data: ix.data,
  });
}

/**
 * Anchor 0.30 can still materialize optional accounts after a retry with
 * explicit nulls. For Adrena, a phantom referrer profile is worse than no
 * referrer: the on-chain program rejects open-position transactions with
 * privilege/escalation errors. If the caller intentionally passed
 * `referrerProfile: null`, remove the corresponding optional IDL account from
 * the final instruction before simulation/serialization.
 */
function sanitizeNullOptionalAdrenaAccounts(
  program: Program,
  ixName: string,
  accounts: Record<string, PublicKey | null>,
  ix: TransactionInstruction,
): TransactionInstruction {
  if (!callerRequestedNullReferrer(accounts)) {
    return ix;
  }

  const idlAccounts = getIdlInstructionAccounts(program, ixName);
  const removalIndexes = new Set<number>();

  const defaultReferrerIndexes = ix.keys
    .map((key, index) => ({ key, index }))
    .filter(({ key }) => key.pubkey.equals(DEFAULT_REFERRER_PROFILE_PUBKEY))
    .map(({ index }) => index);
  const idlHasCortexAccount = idlAccounts.some(accountMeta => accountMeta.name === 'cortex');

  for (const [index, accountMeta] of idlAccounts.entries()) {
    if (accountMeta.name !== 'referrer_profile' || accountMeta.optional !== true) {
      continue;
    }

    const camelName = snakeToCamel(accountMeta.name);
    const referrerWasExplicitlyNull =
      Object.prototype.hasOwnProperty.call(accounts, camelName) && accounts[camelName] === null;
    if (!referrerWasExplicitlyNull) {
      continue;
    }

    // Adrena's cortex PDA is the same public key as the default referrer
    // profile. Removing every matching pubkey corrupts the account order and
    // makes the program read the next account as `cortex` (Anchor 3002).
    // Only remove the default-referrer key when it is in the IDL referrer slot.
    if (ix.keys[index]?.pubkey.equals(DEFAULT_REFERRER_PROFILE_PUBKEY)) {
      removalIndexes.add(index);
    }
  }

  if (removalIndexes.size === 0 && defaultReferrerIndexes.length > 1) {
    // When Anchor returns a compact account list and cannot be aligned to the
    // full IDL index map, keep the first default-referrer pubkey as cortex and
    // remove later duplicate materializations as optional referrer accounts.
    for (const index of defaultReferrerIndexes.slice(1)) {
      removalIndexes.add(index);
    }
  } else if (removalIndexes.size === 0 && defaultReferrerIndexes.length === 1 && !idlHasCortexAccount) {
    removalIndexes.add(defaultReferrerIndexes[0]!);
  }

  if (removalIndexes.size === 0) {
    return normalizeAdrenaAccountMetas(ixName, idlAccounts, accounts, ix);
  }

  logger.debug('Removed null optional Adrena accounts from built instruction', {
    ixName,
    removedAccounts: Array.from(removalIndexes).map(index => idlAccounts[index]?.name ?? ix.keys[index]?.pubkey.toBase58() ?? `#${index}`),
  });

  const filteredIx = new TransactionInstruction({
    programId: ix.programId,
    keys: ix.keys.filter((_, index) => !removalIndexes.has(index)),
    data: ix.data,
  });

  return normalizeAdrenaAccountMetas(ixName, idlAccounts, accounts, filteredIx);
}

/**
 * Create an Anchor Program instance from the vendored IDL.
 * @param connection — Solana RPC connection.
 * @returns Anchor Program instance.
 */
export function createAdrenaProgram(connection: Connection): Program {
  const idl = loadAdrenaIdl();
  const provider = new AnchorProvider(connection, {} as never, { commitment: 'confirmed' });
  return new Program(idl, provider);
}

/**
 * Convert an Anchor instruction to a @solana/web3.js TransactionInstruction.
 * Anchor's `Instruction` namespace returns instructions with keys and data
 * that can be directly mapped to TransactionInstruction.
 * @param program — Anchor Program instance.
 * @param ixName — Instruction name (camelCase).
 * @param args — Instruction arguments.
 * @param accounts — Account public keys by name.
 * @returns web3.js TransactionInstruction.
 */
export async function buildInstruction(
  program: Program,
  ixName: string,
  args: unknown[],
  accounts: Record<string, PublicKey | null>,
): Promise<TransactionInstruction> {
  // Anchor v0.30 exposes methods via program.methods.
  // .instruction() is async and returns a Promise<TransactionInstruction>.
  // For optional accounts (null values), omit the key entirely so Anchor does
  // not include a placeholder account in the instruction. Passing null or
  // PublicKey.default for optional accounts without PDA seeds can make Anchor
  // resolve or pass a real account where Adrena expects "not provided".
  const methods = program.methods as unknown as Record<string, (...args: unknown[]) => {
    accounts: (accs: Record<string, unknown>) => { instruction: () => Promise<TransactionInstruction> };
    accountsPartial?: (accs: Record<string, unknown>) => { instruction: () => Promise<TransactionInstruction> };
  }>;

  const ixBuilder = methods[ixName];
  if (!ixBuilder) {
    throw new Error(`Adrena instruction not found in IDL: ${ixName}`);
  }

  // Strip null entries so Anchor omits optional accounts entirely.
  const filteredAccounts: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(accounts)) {
    if (value !== null) {
      filteredAccounts[key] = value;
    }
  }

  const ixWithArgs = ixBuilder(...args);
  const bindAccounts = ixWithArgs.accountsPartial ?? ixWithArgs.accounts;

  try {
    const ixWithAccounts = bindAccounts.call(ixWithArgs, filteredAccounts);
    const ix = await ixWithAccounts.instruction();
    return sanitizeNullOptionalAdrenaAccounts(program, ixName, accounts, ix);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes('not provided')) {
      throw error;
    }

    logger.debug('Retrying Adrena instruction build with explicit optional account nulls', {
      ixName,
      omittedAccounts: Object.entries(accounts)
        .filter(([, value]) => value === null)
        .map(([key]) => key),
      error: message,
    });

    const ixWithAccounts = ixWithArgs.accounts(accounts);
    const ix = await ixWithAccounts.instruction();
    return sanitizeNullOptionalAdrenaAccounts(program, ixName, accounts, ix);
  }
}

/**
 * Serialize an unsigned transaction with latest blockhash.
 * @param connection — Solana RPC connection.
 * @param feePayer — Fee payer public key.
 * @param instructions — Transaction instructions.
 * @returns Base64-serialized unsigned transaction.
 */
/** Result of serializeUnsignedTx — includes the base64 transaction and simulation metadata. */
export interface SerializeResult {
  transactionBase64: string;
  simulationLogs?: string[];
  simulationError?: string;
  simulationUnitsConsumed?: number;
  priorityFeeMicroLamports?: number;
}

export async function serializeUnsignedTx(
  connection: Connection,
  feePayer: PublicKey,
  instructions: TransactionInstruction[],
): Promise<SerializeResult> {
  const blockhash = await connection.getLatestBlockhash();

  // Priority fee: prepend ComputeBudgetProgram.setComputeUnitPrice when
  // SAP_MCP_PRIORITY_FEE_MICRO_LAMPORTS > 0. Default 0 = disabled.
  const PRIORITY_FEE_MICRO_LAMPORTS = Number(process.env['SAP_MCP_PRIORITY_FEE_MICRO_LAMPORTS'] ?? '0');
  const allInstructions = PRIORITY_FEE_MICRO_LAMPORTS > 0
    ? [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_FEE_MICRO_LAMPORTS }), ...instructions]
    : instructions;

  const tx = new Transaction({
    recentBlockhash: blockhash.blockhash,
    feePayer,
  });
  tx.add(...allInstructions);

  // Simulate the transaction to extract program logs before serializing.
  // This helps diagnose failures (e.g. InsufficientCollateral, MinLeverage)
  // without needing to sign and submit.
  let simulationLogs: string[] | undefined;
  let simulationError: string | undefined;
  let simulationUnitsConsumed: number | undefined;
  try {
    const simulation = await connection.simulateTransaction(tx);
    if (simulation.value.logs && simulation.value.logs.length > 0) {
      simulationLogs = simulation.value.logs;
      logger.debug('Adrena builder simulation logs', {
        logs: simulation.value.logs,
        unitsConsumed: simulation.value.unitsConsumed,
        err: simulation.value.err,
      });
    }
    if (simulation.value.err !== null && simulation.value.err !== undefined) {
      simulationError = JSON.stringify(simulation.value.err);
    }
    simulationUnitsConsumed = simulation.value.unitsConsumed ?? undefined;
  } catch {
    // Simulation is best-effort — don't fail the build if simulation fails.
  }

  return {
    transactionBase64: tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    }).toString('base64'),
    simulationLogs,
    simulationError,
    simulationUnitsConsumed,
    priorityFeeMicroLamports: PRIORITY_FEE_MICRO_LAMPORTS > 0 ? PRIORITY_FEE_MICRO_LAMPORTS : undefined,
  };
}

/**
 * Build the result object for a builder function.
 * @param transactionBase64 — Serialized unsigned transaction.
 * @param feePayer — Fee payer public key.
 * @param instructionNames — List of instruction names.
 * @param positionAddress — Optional position PDA.
 * @param balanceCheck — Optional pre-flight balance check result.
 * @param warning — Optional warning message (e.g. insufficient balance).
 * @param poolMetadata — Optional pool/custody metadata (for open-position builders).
 * @returns Unsigned transaction result.
 */
export function buildResult(
  transactionBase64: string,
  feePayer: PublicKey,
  instructionNames: string[],
  positionAddress?: PublicKey,
  balanceCheck?: BalanceCheck,
  warning?: string,
  poolMetadata?: PoolMetadata,
  requestedLeverage?: number,
): UnsignedTransactionResult {
  const encodedLeverageBps = requestedLeverage !== undefined
    ? encodeAdrenaLeverage(requestedLeverage)
    : undefined;

  return {
    transactionBase64,
    encoding: 'base64',
    feePayer: feePayer.toBase58(),
    instructions: instructionNames,
    ...(positionAddress ? { positionAddress: positionAddress.toBase58() } : {}),
    nextTool: 'sap_payments_finalize_transaction',
    finalizeArgs: {
      transactionBase64,
      submit: false,
    },
    ...(balanceCheck ? { balanceCheck } : {}),
    ...(poolMetadata ? { poolMetadata } : {}),
    ...(requestedLeverage !== undefined && encodedLeverageBps !== undefined ? {
      requestedLeverage: {
        multiplier: requestedLeverage,
        encodedBps: encodedLeverageBps,
        scale: 'adrena_bps_1e4' as const,
      },
    } : {}),
    ...(warning ? { warning } : {}),
  };
}

// ─── Re-exports ─────────────────────────────────────────────────────────────────

export {
  ADRENA_CUSTODIES,
  ADRENA_TOKEN_MINTS,
  ADRENA_PROGRAM_ID,
  ADRENA_MAIN_POOL_ADDRESS,
  ADRENA_COMMODITIES_POOL_ADDRESS,
} from './adrena-constants.js';

export {
  deriveCortexPda,
  deriveOraclePda,
  deriveTransferAuthorityPda,
  deriveUserProfilePda,
  derivePositionPda,
  deriveLimitOrderBookPda,
  deriveCollateralEscrowPda,
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
