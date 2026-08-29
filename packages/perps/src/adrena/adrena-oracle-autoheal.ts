/**
 * Auto-healing serialization for Adrena trade builders.
 *
 * When the pre-sign simulation fails with a multi-oracle error (6088
 * MissingOraclePrice, 6098 SwitchboardMissingAccounts, 6102 QuoteTooStale,
 * 6103 FeedMappingMissing), the trade can be made valid by refreshing the
 * Switchboard price feed on-chain and pulling it into the Adrena oracle PDA
 * right before the trade instruction:
 *
 *   [update_oracle (switchboard_oracle_prices + quote account remaining)]
 *   [original trade ix]
 *
 * @module perps/adrena/adrena-oracle-autoheal
 */

import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import {
  type SerializeResult,
  serializeUnsignedTx,
} from './adrena-builder-core.js';
import {
  buildAdrenaSbOracleRefresh,
  isOracleRecoverableError,
} from './adrena-oracle-relay.js';

/** Result of the auto-heal attempt. */
export interface AutoHealResult {
  /** True when the retry produced a passing simulation. */
  healed: boolean;
  /** Re-serialized transaction base64 (with the update_oracle prepended). */
  transactionBase64?: string;
  /** Updated simulation metadata. */
  serializeResult?: SerializeResult;
  /** True when TX A (Switchboard refresh) still needs to be signed+submitted
   * by the caller BEFORE the healed trade tx. */
  requiresOracleRefreshTx: boolean;
  /** The unsigned refresh transaction (sign+submit first) when required. */
  oracleRefreshTransactionBase64?: string;
  /** Canonical SB quote account updated by the refresh tx. */
  quoteAccount?: string;
  /** Failure description if healing was not possible. */
  failure?: string;
}

/** Check a SerializeResult for a recoverable multi-oracle failure. */
export function hasOracleRecoverableFailure(result: Pick<SerializeResult, 'simulationError' | 'simulationLogs'>): boolean {
  const searchable = `${result.simulationError ?? ''}\n${result.simulationLogs?.join('\n') ?? ''}`;
  return isOracleRecoverableError(searchable);
}

/**
 * Retry a failing trade-build with the Adrena Switchboard oracle refresh
 * prepended to the instruction list.
 *
 * NOTE: the update_oracle ix reads a Switchboard quote account that must be
 * refreshed on-chain first (TX A from buildAdrenaSbOracleRefresh). This
 * helper detects that case and returns `requiresOracleRefreshTx: true` with
 * the unsigned refresh transaction, so the caller can drive the two-step
 * sign+submit flow.
 *
 * @param connection — Solana RPC connection.
 * @param feePayer — Transaction fee payer.
 * @param instructions — The original (failing) trade instructions.
 * @param instructionNames — Instruction names for error messages.
 * @param failedSimulation — The failed serialize result that triggered healing.
 */
export async function serializeUnsignedTxWithOracleAutoHeal(
  connection: Connection,
  feePayer: PublicKey,
  instructions: readonly TransactionInstruction[],
  instructionNames: readonly string[],
  failedSimulation: Pick<SerializeResult, 'simulationError' | 'simulationLogs' | 'simulationUnitsConsumed'>,
): Promise<AutoHealResult> {
  void instructionNames;
  if (!hasOracleRecoverableFailure(failedSimulation)) {
    return { healed: false, requiresOracleRefreshTx: false, failure: 'not an oracle-recoverable failure' };
  }

  try {
    const plan = await buildAdrenaSbOracleRefresh(connection, feePayer);
    const healedInstructions = [plan.updateOracleInstruction, ...instructions];
    const retry = await serializeUnsignedTx(connection, feePayer, [...healedInstructions]);

    if (retry.simulationError) {
      // Still failing (e.g. 6102 quote stale — the refresh tx must land first).
      const stale = isOracleRecoverableError(`${retry.simulationError ?? ''}\n${retry.simulationLogs?.join('\n') ?? ''}`);
      return {
        healed: false,
        requiresOracleRefreshTx: stale,
        oracleRefreshTransactionBase64: stale ? plan.updateTransactionBase64 : undefined,
        quoteAccount: plan.quoteAccount,
        serializeResult: stale ? undefined : retry,
        failure: `oracle auto-heal incomplete: ${retry.simulationError}`,
      };
    }

    return {
      healed: true,
      transactionBase64: retry.transactionBase64,
      serializeResult: retry,
      requiresOracleRefreshTx: false,
    };
  } catch (error) {
    return {
      healed: false,
      requiresOracleRefreshTx: false,
      failure: `oracle auto-heal failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}