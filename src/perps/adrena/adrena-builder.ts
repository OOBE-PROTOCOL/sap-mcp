/**
 * @name perps/adrena/adrena-builder
 * @description Local unsigned transaction builder for the Adrena perps protocol.
 *
 * Uses the vendored Adrena Anchor IDL (release/39) to build real on-chain
 * instructions via `@coral-xyz/anchor`, then wraps them in unsigned
 * `@solana/web3.js` transactions for local signing via
 * `sap_payments_finalize_transaction`.
 *
 * This module NEVER signs transactions. It only constructs unsigned
 * transactions and returns them as base64-serialized bytes.
 *
 * @module perps/adrena/adrena-builder
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
import {
  ADRENA_PROGRAM_ID,
  ADRENA_MAIN_POOL_ADDRESS,
  ADRENA_DATA_API_BASE_URL,
  ADRENA_COMMODITIES_POOL_ADDRESS,
  ADRENA_CUSTODIES,
  ADRENA_TOKEN_MINTS,
  TOKEN_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from './adrena-constants.js';
import { ADRENA_IDL } from './adrena-idl.js';
import {
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
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a bigint to a BN instance for Anchor instruction encoding.
 * Anchor 0.30.x uses @coral-xyz/borsh which requires BN, not native BigInt.
 * @param value — bigint value.
 * @returns BN instance.
 */
function toBN(value: bigint): BN {
  return new BN(value.toString());
}

/**
 * Convert a bigint or null to a BN or null for optional Anchor fields.
 * @param value — bigint or null.
 * @returns BN instance or null.
 */
function toBNOrNull(value: bigint | null): BN | null {
  return value === null ? null : new BN(value.toString());
}

/**
 * Get pool public key by name.
 * @param poolName — Pool identifier.
 * @returns Pool public key.
 */
function getPoolPublicKey(poolName: AdrenaPool): PublicKey {
  const addr = poolName === 'commodities-pool' ? ADRENA_COMMODITIES_POOL_ADDRESS : ADRENA_MAIN_POOL_ADDRESS;
  return new PublicKey(addr);
}

/**
 * Get custody public key by symbol.
 * @param symbol — Token symbol (e.g. "JITOSOL", "USDC").
 * @param poolName — Pool identifier.
 * @returns Custody public key.
 */
function getCustodyPublicKey(symbol: string, poolName: AdrenaPool = 'main-pool'): PublicKey {
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
function getMintPublicKey(symbol: string): PublicKey {
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
function createAtaIdempotentIx(owner: PublicKey, mint: PublicKey, payer: PublicKey): TransactionInstruction {
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
async function fetchOraclePrice(principalToken: string, side?: 'long' | 'short'): Promise<bigint> {
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
async function readCustodyTokenAccount(
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
 * Check if a user profile PDA exists on-chain. If it doesn't, build an
 * init_user_profile instruction to create it before any Adrena position operation.
 *
 * @param connection — Solana RPC connection.
 * @param owner — Wallet public key that needs a user profile.
 * @returns Array of pre-instructions (empty if profile exists, or [initUserProfile] if not).
 */
async function ensureUserProfileInstructions(
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
async function ensureAtaInstructions(
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
function createAdrenaProgram(connection: Connection): Program {
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
async function buildInstruction(
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
async function serializeUnsignedTx(
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
 * @returns Unsigned transaction result.
 */
function buildResult(
  transactionBase64: string,
  feePayer: PublicKey,
  instructionNames: string[],
  positionAddress?: PublicKey,
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
  };
}

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

  const transactionBase64 = await serializeUnsignedTx(connection, owner, [...allPreInstructions, ix]);
  return buildResult(transactionBase64, owner, ['openOrIncreasePositionLong'], position);
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

  const transactionBase64 = await serializeUnsignedTx(connection, owner, [...allPreInstructions, ix]);
  return buildResult(transactionBase64, owner, ['openOrIncreasePositionShort'], position);
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
  return buildResult(transactionBase64, owner, ['closePositionLong'], position);
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
  return buildResult(transactionBase64, owner, ['closePositionShort'], position);
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
  return buildResult(transactionBase64, owner, [ixName], position);
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
  return buildResult(transactionBase64, owner, [ixName], position);
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
  return buildResult(transactionBase64, owner, ['cancelStopLoss'], position);
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
  return buildResult(transactionBase64, owner, ['cancelTakeProfit'], position);
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
  return buildResult(transactionBase64, owner, ['addLimitOrder']);
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
  return buildResult(transactionBase64, owner, ['cancelLimitOrder']);
}

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

  const transactionBase64 = await serializeUnsignedTx(connection, owner, [ix]);
  return buildResult(transactionBase64, owner, ['addLiquidity']);
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

  const transactionBase64 = await serializeUnsignedTx(connection, owner, [ix]);
  return buildResult(transactionBase64, owner, ['removeLiquidity']);
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

  const transactionBase64 = await serializeUnsignedTx(connection, owner, [ix]);
  return buildResult(transactionBase64, owner, ['swap']);
}

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
  const feeRedistributionMint = new PublicKey('2zqtcQy7oc9Wf7TncsKQw1vq5gk6kG6r6wG6r6wG6r6');
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
  return buildResult(transactionBase64, owner, ['initUserStaking']);
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
  const feeRedistributionMint = new PublicKey('2zqtcQy7oc9Wf7TncsKQw1vq5gk6kG6r6wG6r6wG6r6');
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
  return buildResult(transactionBase64, owner, ['addLiquidStake']);
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
  const feeRedistributionMint = new PublicKey('2zqtcQy7oc9Wf7TncsKQw1vq5gk6kG6r6wG6r6wG6r6');
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
  return buildResult(transactionBase64, owner, ['removeLiquidStake']);
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
  const feeRedistributionMint = new PublicKey('2zqtcQy7oc9Wf7TncsKQw1vq5gk6kG6r6wG6r6wG6r6');
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
  return buildResult(transactionBase64, owner, ['addLockedStake']);
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
  const feeRedistributionMint = new PublicKey('2zqtcQy7oc9Wf7TncsKQw1vq5gk6kG6r6wG6r6wG6r6');
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
  return buildResult(transactionBase64, owner, ['claimStakes']);
}

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
  const leverageBps = Math.floor(leverage * 10000);

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

  const transactionBase64 = await serializeUnsignedTx(connection, owner, [...allPreInstructions, ix]);
  return buildResult(transactionBase64, owner, [ixName], position);
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

  const transactionBase64 = await serializeUnsignedTx(connection, owner, [...allPreInstructions, ix]);
  return buildResult(transactionBase64, owner, [ixName], position);
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