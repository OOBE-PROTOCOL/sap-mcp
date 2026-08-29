/**
 * @name perps/adrena/adrena-oracle-relay
 * @description Switchboard On-Demand oracle relay for Adrena perp trading.
 *
 * Adrena's multi-oracle config (main-pool) requires `minAgree = 2` fresh
 * provider prices (staleness 15s) at trade time. Since 2026-08-29 only the
 * Autonom provider is fresh in the oracle PDA (Switchboard stopped cranking),
 * so every trade fails with error 6088 MissingOraclePrice.
 *
 * This module implements the same refresh pattern the Adrena frontend uses:
 *
 *   TX A  [Ed25519 verify] + [SB quote verified_update]
 *         — writes fresh signed prices into the canonical quote account
 *   TX B  [Adrena update_oracle (switchboard_oracle_prices)] + [trade ix]
 *         — pulls the fresh quote into the Adrena oracle PDA, then trades
 *
 * Both builder outputs return unsigned transactions; the caller signs and
 * submits them in order (TX A must land before TX B).
 *
 * @module perps/adrena/adrena-oracle-relay
 */

import { Buffer } from 'node:buffer';
import {
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type TransactionSignature,
} from '@solana/web3.js';
import { createRequire } from 'node:module';
import { logger } from '../../../core/src/logger.js';
import { ADRENA_PROGRAM_ID } from './adrena-constants.js';
import { deriveCortexPda, deriveOraclePda } from './adrena-pda.js';

/** Adrena main-pool Switchboard feed hashes, in custody feed-id order 142..147. */
const SB_FEED_MAP: readonly { feedId: number; hash: string; symbol: string }[] = [
  { feedId: 142, hash: '0x8f4f7b277e2593bdf04c5adba0b2a302793645de9326a7dcd6c332070846d52b', symbol: 'SOL' },
  { feedId: 143, hash: '0xd8c69f6959d732c6f3a231e1bd8d4c1e693b92086db38eb46de8e02537d5ac67', symbol: 'JITOSOL' },
  { feedId: 144, hash: '0x45bd1d1666cf259c85e890f59b4abb64504567d2d4d973ca417554a9aa5feb38', symbol: 'BTC' },
  { feedId: 145, hash: '0xfa5702e1517843e073f324a5f71350ff4cdf773f5fba01cde62a2ae254361b79', symbol: 'WBTC' },
  { feedId: 146, hash: '0x71e4615ff86c030d71288a8ea1cb9448773da5ba5d7bce2477cd5cc96efba26c', symbol: 'BONK' },
  { feedId: 147, hash: '0x6795044f45a4f3089f90fc79bd27bb29b3102760519640139df1473ad4f7791e', symbol: 'USDC' },
];
/** Adrena main-pool Address Lookup Table (compresses tx under 1232B). */
const ADRENA_LUT = '4PZaPEXPzMLuBSKgZUvpzLi3zGXJ1pSz6NTKrtoXUd4q';
/** update_oracle instruction discriminator (canonical v2.1.5 IDL). */
const UPDATE_ORACLE_DISC = Buffer.from([112, 41, 209, 18, 248, 226, 252, 188]);

const require_ = createRequire(import.meta.url);

/** Local paths for the ESM-only Switchboard stack (resolved at import time). */
function resolveSbModuleUrl(): string {
  // on-demand's CJS entry works from npm (dist/cjs); anchor-31 ships nested.
  return '@switchboard-xyz/on-demand';
}

/** Resolve the anchor-31 copy bundled inside @switchboard-xyz/on-demand. */
function resolveAnchor31(): string {
  const onDemandPath = require_.resolve('@switchboard-xyz/on-demand');
  // pnpm: on-demand's own node_modules contains @coral-xyz/anchor-31
  const candidates = [
    onDemandPath.replace(/dist[\\/]cjs[\\/]index\.js$/, 'node_modules/@coral-xyz/anchor-31/dist/cjs/index.js'),
  ];
  for (const candidate of candidates) {
    try {
      return require_.resolve(candidate);
    } catch {
      // try next
    }
  }
  return '@coral-xyz/anchor';
}

/** Resolve the ESM-only @switchboard-xyz/common CrossbarClient. */
function resolveCommon(): string {
  return '@switchboard-xyz/common';
}

/** Lazily-loaded switchboard + anchor-31 modules (ESM dynamic imports). */
interface SbModules {
  sb: Record<string, unknown>;
  common: Record<string, unknown>;
  anchor31: Record<string, unknown>;
}
let sbModules: SbModules | null = null;

async function loadSbModules(): Promise<SbModules> {
  if (sbModules) return sbModules;
  const [sb, common, anchor31] = await Promise.all([
    import(resolveSbModuleUrl()) as Promise<Record<string, unknown>>,
    import(resolveCommon()) as Promise<Record<string, unknown>>,
    // anchor-31 ships its own web3 1.98 — used only for relay tx building.
    import(resolveAnchor31()) as Promise<Record<string, unknown>>,
  ]);
  sbModules = { sb, common, anchor31 };
  return sbModules;
}

/**
 * Deep-convert any TransactionInstruction (possibly from a different web3
 * copy) into a REPO-web3 TransactionInstruction.
 */
function reIx(ix: unknown): TransactionInstruction {
  const i = ix as {
    programId: { toBytes(): Uint8Array };
    keys: { pubkey: { toBytes(): Uint8Array }; isSigner: boolean; isWritable: boolean }[];
    data: Uint8Array;
  };
  return new TransactionInstruction({
    programId: new PublicKey(Buffer.from(i.programId.toBytes())),
    keys: i.keys.map(k => ({
      pubkey: new PublicKey(Buffer.from(k.pubkey.toBytes())),
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    })),
    data: Buffer.from(i.data),
  });
}

/** The canonical SB quote account that verified_update writes to. */
export interface AdrenaOracleRefreshPlan {
  /** Unsigned TX A: [Ed25519 verify, verified_update]. Sign + submit first. */
  updateTransactionBase64: string;
  /** Base58 of the canonical quote account updated by TX A. */
  quoteAccount: string;
  /** The pre-built update_oracle instruction to prepend to the trade tx. */
  updateOracleInstruction: TransactionInstruction;
  /** Feed map entries included (for logging/telemetry). */
  feedIds: number[];
  /** Max age slots passed to update_oracle. */
  maxAgeSlots: number;
}

/**
 * Build the Switchboard oracle refresh bundle for the Adrena main pool:
 * an unsigned TX A that refreshes the canonical quote account, plus the
 * `update_oracle` instruction to prepend to the trade transaction.
 *
 * The caller must:
 *  1. Sign + submit TX A (`updateTransactionBase64`) and wait for confirmation.
 *  2. Prepend `updateOracleInstruction` to the trade tx instructions.
 *
 * @param connection — Solana RPC connection (any version; objects are converted).
 * @param feePayer — Transaction fee payer (must be writable on SB quote create).
 */
export async function buildAdrenaSbOracleRefresh(
  connection: Connection,
  feePayer: PublicKey,
  maxAgeSlots = 60,
): Promise<AdrenaOracleRefreshPlan> {
  const { sb, common, anchor31 } = await loadSbModules();
  const web3 = (anchor31 as { web3: typeof import('@solana/web3.js') }).web3;
  const Pk = web3.PublicKey;

  const rpcEndpoint = typeof connection.rpcEndpoint === 'string' ? connection.rpcEndpoint : 'https://api.mainnet-beta.solana.com';
  const localConn = new web3.Connection(rpcEndpoint, 'confirmed');
  const feePayer31 = new Pk(feePayer.toBytes());
  const provider = new (anchor31 as { AnchorProvider: new (c: unknown, w: unknown, o: object) => unknown }).AnchorProvider(
    localConn,
    // AnchorProvider wallet interface: { publicKey } — not a Keypair (read-only ops only).
    { publicKey: feePayer31 },
    { commitment: 'confirmed' },
  );
  const sbProgram = await (sb as { AnchorUtils: { loadProgramFromProvider(p: unknown): Promise<unknown> } })
    .AnchorUtils.loadProgramFromProvider(provider);
  const queue = await (sb as { Queue: { loadDefault(p: unknown): Promise<{ fetchManagedUpdateIxs: (cb: unknown, feeds: string[], cfg: object) => Promise<unknown[]> }> } })
    .Queue.loadDefault(sbProgram);
  const CrossbarClient = (common as { CrossbarClient: new (url: string) => { fetchGateway(): Promise<unknown> } }).CrossbarClient;
  const crossbar = new CrossbarClient('https://crossbar.switchboard.xyz');

  const feedHashes = SB_FEED_MAP.map(f => f.hash);
  const ixs = await queue.fetchManagedUpdateIxs(crossbar, feedHashes, {
    numSignatures: 1,
    payer: feePayer31,
  });

  // ── Build + serialize in the REPO web3 namespace (proven in production) ──
  // The anchor-31 message path has internal base58/type quirks; the repo
  // web3 serializes v0 messages correctly (same path as serializeUnsignedTx).
  // Convert the SB instructions into REPO classes (reIx) and derive the
  // quote account from the converted keys.
  const edRepo = reIx(ixs[0]);
  const quoteIxRepo = reIx(ixs[1]);

  // Resolve the 65535 current-instruction sentinel → absolute ed25519 index 0.
  const sigCount = edRepo.data[0];
  for (let i = 0; i < sigCount; i++) {
    const recordOffset = 2 + i * 14;
    edRepo.data.writeUInt16LE(0, recordOffset + 2);
    edRepo.data.writeUInt16LE(0, recordOffset + 6);
    edRepo.data.writeUInt16LE(0, recordOffset + 12);
  }
  quoteIxRepo.data.writeUInt16LE(0, 1);
  const quoteAccount = quoteIxRepo.keys[1]!.pubkey;

  const lutResponse = await connection.getAddressLookupTable(new PublicKey(ADRENA_LUT));
  const lut = lutResponse.value;
  if (!lut) {
    throw new Error(`Adrena LUT ${ADRENA_LUT} not found on-chain`);
  }
  const { blockhash: bh } = await connection.getLatestBlockhash();
  const messageV0 = new TransactionMessage({
    payerKey: feePayer,
    recentBlockhash: bh,
    instructions: [edRepo, quoteIxRepo],
  }).compileToV0Message([lut]);
  // web3 1.98.4 note: the compiled MessageV0's recentBlockhash getter is
  // broken when a LUT is passed (returns undefined; plain assignment is
  // absorbed by the getter). Force-define the field, then let the library
  // serialize.
  const compiled = messageV0 as unknown as Record<string, unknown> & { serialize(): Buffer };
  Object.defineProperty(compiled, 'recentBlockhash', {
    value: bh,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  const vtx = new VersionedTransaction(messageV0 as never);
  const updateTransactionBase64 = Buffer.from(vtx.serialize()).toString('base64');

  // Pre-build the Adrena update_oracle instruction (to prepend to trade tx).
  const updateOracleInstruction = buildUpdateOracleInstruction(quoteAccount, maxAgeSlots);

  return {
    updateTransactionBase64,
    quoteAccount: quoteAccount.toBase58(),
    updateOracleInstruction,
    feedIds: SB_FEED_MAP.map(f => f.feedId),
    maxAgeSlots,
  };
}

/**
 * Build the Adrena `update_oracle` instruction with
 * `switchboard_oracle_prices = Some({ max_age_slots, feed_map })` and the
 * canonical quote account as the first remaining account.
 *
 * UpdateOracleParams borsh layout (3 options):
 *   [0] oracle_prices = None           → 0x00
 *   [0] multi_oracle_prices = None     → 0x00
 *   [1] switchboard_oracle_prices = Some({
 *         max_age_slots: u64,
 *         feed_map: Vec<{ adrena_feed_id: u8, switchboard_feed_hash: [u8;32] }>,
 *       })
 * Remaining accounts: [canonical quote account (writable)].
 */
export function buildUpdateOracleInstruction(
  quoteAccount: PublicKey,
  maxAgeSlots = 60,
): TransactionInstruction {
  const oracle = deriveOraclePda();
  const cortex = deriveCortexPda();
  const programId = new PublicKey(ADRENA_PROGRAM_ID);

  const feedMap = Buffer.concat(
    SB_FEED_MAP.map(entry => Buffer.concat([
      Buffer.from([entry.feedId]),
      Buffer.from(entry.hash.replace(/^0x/, ''), 'hex'),
    ])),
  );
  const vecLen = Buffer.alloc(4);
  vecLen.writeUInt32LE(SB_FEED_MAP.length);
  const maxAge = Buffer.alloc(8);
  maxAge.writeBigUInt64LE(BigInt(maxAgeSlots));

  const params = Buffer.concat([
    Buffer.from([0]),  // oracle_prices = None
    Buffer.from([0]),  // multi_oracle_prices = None
    Buffer.from([1]),  // switchboard_oracle_prices = Some
    maxAge,
    vecLen,
    feedMap,
  ]);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: cortex, isSigner: false, isWritable: false },      // #1 cortex
      { pubkey: oracle, isSigner: false, isWritable: true },       // #2 oracle
      { pubkey: quoteAccount, isSigner: false, isWritable: true }, // remaining: SB quote
    ],
    data: Buffer.concat([UPDATE_ORACLE_DISC, params]),
  });
}

/**
 * End-to-end oracle refresh: submit TX A (SB update) and confirm, returning
 * the instruction to prepend to the trade transaction. Used by the
 * auto-healing path in the builders when simulation returns oracle errors.
 *
 * @returns The update_oracle instruction, ready to prepend.
 */
export async function refreshAdrenaSwitchboardOracle(
  connection: Connection,
  feePayer: PublicKey,
  signAndSubmit: (base64Tx: string) => Promise<TransactionSignature>,
  maxAgeSlots = 60,
): Promise<TransactionInstruction> {
  const plan = await buildAdrenaSbOracleRefresh(connection, feePayer, maxAgeSlots);
  logger.info('Adrena oracle relay: submitting Switchboard update tx', {
    quoteAccount: plan.quoteAccount,
    feedIds: plan.feedIds,
  });
  const signature = await signAndSubmit(plan.updateTransactionBase64);
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latest }, 'confirmed');
  logger.info('Adrena oracle relay: Switchboard quote refreshed', { signature });
  return plan.updateOracleInstruction;
}

/** Detect oracle-related Adrena errors that the relay can auto-heal. */
export function isOracleRecoverableError(errorMessage: string | undefined): boolean {
  if (!errorMessage) return false;
  return /6088|6098|6102|6103/.test(errorMessage);
}