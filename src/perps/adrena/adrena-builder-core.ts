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
} from '@solana/web3.js';
import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import BN from 'bn.js';
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { logger } from '../../core/logger.js';
import {
  ADRENA_PROGRAM_ID,
  ADRENA_MAIN_POOL_ADDRESS,
  ADRENA_DATA_API_BASE_URL,
  ADRENA_COMMODITIES_POOL_ADDRESS,
  ADRENA_CUSTODIES,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  /** Warning message if balance is insufficient or other pre-flight concern. */
  warning?: string;
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
  const custody = ADRENA_CUSTODIES[symbol.toUpperCase() as keyof typeof ADRENA_CUSTODIES];
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
  // For optional accounts (null values), Anchor handles them internally
  // when passed as null in the accounts object.
  const methods = program.methods as unknown as Record<string, (...args: unknown[]) => {
    accounts: (accs: Record<string, unknown>) => { instruction: () => Promise<TransactionInstruction> };
  }>;

  const ixBuilder = methods[ixName];
  if (!ixBuilder) {
    throw new Error(`Adrena instruction not found in IDL: ${ixName}`);
  }

  const ixWithArgs = ixBuilder(...args);
  const ixWithAccounts = ixWithArgs.accounts(accounts as Record<string, unknown>);
  return await ixWithAccounts.instruction();
}

/**
 * Serialize an unsigned transaction with latest blockhash.
 * @param connection — Solana RPC connection.
 * @param feePayer — Fee payer public key.
 * @param instructions — Transaction instructions.
 * @returns Base64-serialized unsigned transaction.
 */
export async function serializeUnsignedTx(
  connection: Connection,
  feePayer: PublicKey,
  instructions: TransactionInstruction[],
): Promise<string> {
  const blockhash = await connection.getLatestBlockhash();
  const tx = new Transaction({
    recentBlockhash: blockhash.blockhash,
    feePayer,
  });
  tx.add(...instructions);

  // Simulate the transaction to extract program logs before serializing.
  // This helps diagnose failures (e.g. InsufficientCollateral, MinLeverage)
  // without needing to sign and submit.
  try {
    const simulation = await connection.simulateTransaction(tx);
    if (simulation.value.logs && simulation.value.logs.length > 0) {
      logger.debug('Adrena builder simulation logs', {
        logs: simulation.value.logs,
        unitsConsumed: simulation.value.unitsConsumed,
        err: simulation.value.err,
      });
    }
  } catch {
    // Simulation is best-effort — don't fail the build if simulation fails.
  }

  return tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  }).toString('base64');
}

/**
 * Build the result object for a builder function.
 * @param transactionBase64 — Serialized unsigned transaction.
 * @param feePayer — Fee payer public key.
 * @param instructionNames — List of instruction names.
 * @param positionAddress — Optional position PDA.
 * @param balanceCheck — Optional pre-flight balance check result.
 * @param warning — Optional warning message (e.g. insufficient balance).
 * @returns Unsigned transaction result.
 */
export function buildResult(
  transactionBase64: string,
  feePayer: PublicKey,
  instructionNames: string[],
  positionAddress?: PublicKey,
  balanceCheck?: BalanceCheck,
  warning?: string,
): UnsignedTransactionResult {
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