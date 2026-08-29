/**
 * Shared helper: serialize a trade tx with oracle auto-heal on failure.
 *
 * Flow:
 *  1. serializeUnsignedTx(preInstructions + ix) — normal path.
 *  2. If the simulation failed with a multi-oracle error (6088/6098/6102/6103)
 *     → retry with update_oracle prepended (adrena-oracle-autoheal).
 *  3. If the retry also fails because the SB quote is stale, return the
 *     unsigned oracle-refresh tx (TX A) so the caller can land it first.
 */
import { Connection, PublicKey } from '@solana/web3.js';
import {
  type SerializeResult,
  serializeUnsignedTx,
  assertAdrenaSimulationPassed,
} from './adrena-builder-core.js';
import {
  serializeUnsignedTxWithOracleAutoHeal,
  hasOracleRecoverableFailure,
  type AutoHealResult,
} from './adrena-oracle-autoheal.js';

export interface HealableSerializeOutcome {
  serializeResult: SerializeResult;
  /** Present when the normal path failed with an oracle error and healing
   * requires the caller to sign/submit the SB refresh tx first. */
  oracleRefresh?: {
    transactionBase64: string;
    quoteAccount: string;
    /** The update_oracle instruction already inside the healed trade tx. */
    updateOraclePrepended: boolean;
    /** 'land-refresh-first' → TX A must confirm before submitting the trade tx.
     * 'healed' → the healed trade sim passed and only needs signature. */
    status: 'land-refresh-first' | 'healed';
  };
}

export async function serializeUnsignedTxHealable(
  connection: Connection,
  owner: PublicKey,
  instructions: readonly import('@solana/web3.js').TransactionInstruction[],
  instructionNames: readonly string[],
): Promise<HealableSerializeOutcome> {
  const primary = await serializeUnsignedTx(connection, owner, [...instructions]);

  // Normal path passed — done.
  if (!primary.simulationError) {
    assertAdrenaSimulationPassed(primary, instructionNames);
    return { serializeResult: primary };
  }

  // Failed — is it an oracle failure we can heal?
  if (!hasOracleRecoverableFailure(primary)) {
    assertAdrenaSimulationPassed(primary, instructionNames); // throws with rich message
    return { serializeResult: primary };
  }

  const heal = await serializeUnsignedTxWithOracleAutoHeal(
    connection,
    owner,
    instructions,
    instructionNames,
    primary,
  );

  if (heal.healed && heal.serializeResult && heal.transactionBase64) {
    // Healed trade passes on its own (refresh tx still needed? If the healed
    // sim passed, the quote account must have been fresh — it is still safer
    // to ask the caller to land TX A first when 6102 appeared; treat
    // requiresOracleRefreshTx accordingly).
    if (heal.requiresOracleRefreshTx) {
      return {
        serializeResult: heal.serializeResult,
        oracleRefresh: {
          transactionBase64: heal.oracleRefreshTransactionBase64 ?? '',
          quoteAccount: heal.quoteAccount ?? '',
          updateOraclePrepended: true,
          status: 'land-refresh-first',
        },
      };
    }
    return { serializeResult: heal.serializeResult };
  }

  if (heal.requiresOracleRefreshTx && heal.oracleRefreshTransactionBase64) {
    return {
      serializeResult: primary,
      oracleRefresh: {
        transactionBase64: heal.oracleRefreshTransactionBase64,
        quoteAccount: heal.quoteAccount ?? '',
        updateOraclePrepended: false,
        status: 'land-refresh-first',
      },
    };
  }

  // Healing not possible — surface the original rich failure.
  assertAdrenaSimulationPassed(primary, instructionNames); // throws
  throw new Error(heal.failure ?? 'oracle auto-heal failed');
}

/** Convenience type re-exports. */
export type { SerializeResult, AutoHealResult };