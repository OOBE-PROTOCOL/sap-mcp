/**
 * @name perps/phoenix/phoenix-builder-core
 * @description Shared types and helpers for Phoenix perps instruction builders.
 *
 * Provides UnsignedTransactionResult and helpers to convert @ellipsis-labs/rise
 * instruction objects (InstructionsWithAccountsAndData) into base64-serialized
 * unsigned @solana/web3.js Transactions.
 *
 * @module perps/phoenix/phoenix-builder-core
 */

import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  type Connection,
  ComputeBudgetProgram,
} from '@solana/web3.js';

import { logger } from '../../../core/src/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Side of a Phoenix order. */
export type PhoenixSide = 'bid' | 'ask';

/** Direction for conditional/trigger orders. */
export type PhoenixDirection = 'greater-than' | 'less-than';

/** Stop loss order kind. */
export type PhoenixStopLossOrderKind = 'ioc' | 'limit';

/**
 * Result of building an unsigned Phoenix transaction.
 * Mirrors the Adrena UnsignedTransactionResult pattern.
 * All builders return this — NO signing happens server-side.
 */
export interface UnsignedTransactionResult {
  /** Base64-serialized unsigned transaction. */
  transactionBase64: string;
  /** Transaction encoding. */
  encoding: 'base64';
  /** Machine-readable approval gate. UIs may show signing controls only when true. */
  safeToApprove: true;
  /** Machine-readable negative approval gate. Successful builder results keep this false. */
  approvalBlocked: false;
  /** Fee payer public key. */
  feePayer: string;
  /** Description of the instructions included. */
  instructions: string[];
  /** Next tool to call for signing. */
  nextTool: 'sap_payments_finalize_transaction';
  /** Arguments to pass to the finalize tool. */
  finalizeArgs: {
    transactionBase64: string;
    submit: boolean;
  };
  /** Builder-side simulation error for this exact unsigned transaction, if any. */
  simulationError?: string;
  /** Program logs captured during the best-effort simulation. */
  simulationLogs?: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Phoenix instruction shape from @ellipsis-labs/rise SDK.
 * InstructionsWithAccountsAndData has `accounts` (AccountMeta[]) and `data` (Uint8Array).
 */
interface PhoenixInstruction {
  readonly accounts: readonly PhoenixAccountMeta[];
  readonly data: ReadonlyUint8Array;
}

/** AccountMeta from @solana/kit — has address, role, isSigner, isWritable. */
interface PhoenixAccountMeta {
  readonly address: unknown;
  readonly role: number;
  readonly isSigner: boolean;
  readonly isWritable: boolean;
}

/** ReadonlyUint8Array type from @solana/kit. */
type ReadonlyUint8Array = Uint8Array;

/**
 * Convert a Phoenix SDK instruction (InstructionsWithAccountsAndData) to a
 * @solana/web3.js TransactionInstruction.
 *
 * @param ix — Phoenix instruction with accounts and data.
 * @param programId — Phoenix program ID.
 * @returns TransactionInstruction compatible with @solana/web3.js Transaction.
 */
export function phoenixIxToTransactionInstruction(
  ix: PhoenixInstruction,
  programId: string,
): TransactionInstruction {
  const keys = ix.accounts.map((meta) => {
    // The SDK uses AccountRole enum: 0=READONLY, 1=WRITABLE, 2=READONLY_SIGNER, 3=WRITABLE_SIGNER
    // Some SDK versions also include isSigner/isWritable booleans — prefer those if present
    const role = meta.role as number;
    const isSigner = meta.isSigner ?? (role === 2 || role === 3);
    const isWritable = meta.isWritable ?? (role === 1 || role === 3);
    return {
      pubkey: new PublicKey(meta.address as string),
      isSigner,
      isWritable,
    };
  });

  // The SDK reports the correct on-chain program for each instruction
  // (programAddress). Prefer it over the provided fallback so perps
  // instructions are never routed to the Phoenix spot AMM program.
  const resolvedProgramId = (ix as { programAddress?: string }).programAddress ?? programId;

  return new TransactionInstruction({
    programId: new PublicKey(resolvedProgramId),
    keys,
    data: Buffer.from(ix.data),
  });
}

/**
 * Convert multiple Phoenix SDK instructions to @solana/web3.js TransactionInstructions.
 * @param ixs — Array of Phoenix instructions.
 * @param programId — Phoenix program ID.
 * @returns Array of TransactionInstructions.
 */
export function phoenixIxsToTransactionInstructions(
  ixs: readonly unknown[],
  programId: string,
): TransactionInstruction[] {
  return ixs.map((ix) => phoenixIxToTransactionInstruction(ix as PhoenixInstruction, programId));
}

/**
 * Serialize an unsigned transaction to base64.
 *
 * Fetches a recent blockhash, constructs a Transaction with the given instructions,
 * optionally simulates it, and returns the base64-serialized unsigned transaction.
 *
 * @param connection — Solana RPC connection.
 * @param feePayer — Fee payer public key.
 * @param instructions — Array of TransactionInstructions to include.
 * @param programId — Phoenix program ID (for instruction conversion if needed).
 * @returns Object with transactionBase64 and optional simulation data.
 */
export async function serializeUnsignedPhoenixTx(
  connection: Connection,
  feePayer: PublicKey,
  instructions: TransactionInstruction[],
): Promise<{
  transactionBase64: string;
  simulationLogs?: string[];
  simulationError?: string;
  simulationUnitsConsumed?: number;
}> {
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

  // Best-effort simulation for diagnostics.
  let simulationLogs: string[] | undefined;
  let simulationError: string | undefined;
  let simulationUnitsConsumed: number | undefined;
  try {
    const simulation = await connection.simulateTransaction(tx);
    if (simulation.value.logs && simulation.value.logs.length > 0) {
      simulationLogs = simulation.value.logs;
      logger.debug('Phoenix builder simulation logs', {
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

  const transactionBase64 = tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  }).toString('base64');

  return {
    transactionBase64,
    simulationLogs,
    simulationError,
    simulationUnitsConsumed,
  };
}

/**
 * Build a standard UnsignedTransactionResult from a serialized transaction.
 *
 * @param transactionBase64 — Base64-serialized unsigned transaction.
 * @param feePayer — Fee payer public key.
 * @param instructionNames — List of instruction names for the `instructions` field.
 * @returns UnsignedTransactionResult.
 */
export function buildPhoenixResult(
  transactionBase64: string,
  feePayer: PublicKey,
  instructionNames: string[],
  simulation?: {
    simulationError?: string;
    simulationLogs?: string[];
  },
): UnsignedTransactionResult {
  return {
    transactionBase64,
    encoding: 'base64',
    safeToApprove: true,
    approvalBlocked: false,
    feePayer: feePayer.toBase58(),
    instructions: instructionNames,
    nextTool: 'sap_payments_finalize_transaction',
    finalizeArgs: {
      transactionBase64,
      submit: true,
    },
    ...(simulation?.simulationError ? { simulationError: simulation.simulationError } : {}),
    ...(simulation?.simulationLogs?.length ? { simulationLogs: simulation.simulationLogs } : {}),
  };
}

/**
 * Convert a Phoenix SDK instruction result (single ix) to an unsigned transaction.
 *
 * @param connection — Solana RPC connection.
 * @param feePayer — Fee payer public key.
 * @param phoenixIx — Phoenix instruction (InstructionsWithAccountsAndData).
 * @param programId — Phoenix program ID.
 * @param instructionName — Name for the instructions field.
 * @returns UnsignedTransactionResult.
 */
export async function buildFromPhoenixIx(
  connection: Connection,
  feePayer: PublicKey,
  phoenixIx: unknown,
  programId: string,
  instructionName: string,
): Promise<UnsignedTransactionResult> {
  const ix = phoenixIxToTransactionInstruction(phoenixIx as PhoenixInstruction, programId);
  const serialized = await serializeUnsignedPhoenixTx(connection, feePayer, [ix]);
  return buildPhoenixResult(serialized.transactionBase64, feePayer, [instructionName], {
    simulationError: serialized.simulationError,
    simulationLogs: serialized.simulationLogs,
  });
}

/**
 * Convert multiple Phoenix SDK instructions to an unsigned transaction.
 *
 * @param connection — Solana RPC connection.
 * @param feePayer — Fee payer public key.
 * @param phoenixIxs — Array of Phoenix instructions.
 * @param programId — Phoenix program ID.
 * @param instructionNames — Names for the instructions field.
 * @returns UnsignedTransactionResult.
 */
export async function buildFromPhoenixIxs(
  connection: Connection,
  feePayer: PublicKey,
  phoenixIxs: readonly unknown[],
  programId: string,
  instructionNames: string[],
): Promise<UnsignedTransactionResult> {
  const ixs = phoenixIxsToTransactionInstructions(phoenixIxs, programId);
  const serialized = await serializeUnsignedPhoenixTx(connection, feePayer, ixs);
  return buildPhoenixResult(serialized.transactionBase64, feePayer, instructionNames, {
    simulationError: serialized.simulationError,
    simulationLogs: serialized.simulationLogs,
  });
}