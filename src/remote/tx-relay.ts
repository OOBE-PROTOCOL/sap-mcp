/**
 * @name TxSubmitRelay
 * @description Hosted submit-only relay for already-signed Solana transactions.
 *   The relay never signs, never receives keypair bytes, and returns confirmation
 *   status, explorer URL, and retry guidance.
 */

import * as http from 'http';
import { Connection } from '@solana/web3.js';
import type { SapMcpConfig } from '../config/env.js';
import {
  decodeInputBytes,
  deserializeTransaction,
  type TransactionEncoding,
  type TransactionSubmitCommitment,
} from '../tools/transaction-tools.js';
import { parseJsonBody, readRequestBody } from '../payments/http-adapter.js';

export const TX_SUBMIT_PATH = '/tx/submit';
const TX_SUBMIT_MAX_BODY_BYTES = 512_000;
const TX_SUBMIT_DEFAULT_CONFIRMATION_TIMEOUT_MS = 90_000;
const TX_SUBMIT_MAX_CONFIRMATION_TIMEOUT_MS = 180_000;

export interface TxSubmitRelayInput {
  signedTransaction?: string;
  transaction?: string;
  encoding?: TransactionEncoding;
  skipPreflight?: boolean;
  maxRetries?: number;
  confirmationTimeoutMs?: number;
  commitment?: TransactionSubmitCommitment;
  intentId?: string;
}

export interface TxSubmitRelayResult {
  success: boolean;
  submitted: true;
  signature: string;
  confirmationStatus: string;
  retrySafe: boolean;
  slot?: number;
  explorerUrl: string;
  audit: {
    intentId: string;
    submittedVia: 'hosted-submit-relay';
    signerBoundary: 'already-signed-transaction-only';
    confirmationTimeoutMs: number;
    desiredCommitment: TransactionSubmitCommitment;
    retrySafe: boolean;
    secretMaterial: 'never-received';
    rule: string;
  };
}

export async function submitSignedTransactionFromHttp(
  req: http.IncomingMessage,
  config: SapMcpConfig,
): Promise<TxSubmitRelayResult> {
  const body = parseJsonBody(await readRequestBody(req, TX_SUBMIT_MAX_BODY_BYTES));
  const input = parseTxSubmitRelayInput(body);
  const encodedTransaction = input.signedTransaction ?? input.transaction;
  if (!encodedTransaction) {
    throw new Error('signedTransaction is required.');
  }

  const encoding = input.encoding ?? 'base64';
  const rawTransaction = decodeInputBytes(encodedTransaction, encoding);
  deserializeTransaction(encodedTransaction, encoding);

  const connection = new Connection(config.rpcUrl, config.commitment ?? 'confirmed');
  const signature = await connection.sendRawTransaction(rawTransaction, {
    skipPreflight: input.skipPreflight,
    maxRetries: input.maxRetries ?? config.maxRetries,
  });
  const confirmationTimeoutMs = boundTxSubmitConfirmationTimeout(input.confirmationTimeoutMs);
  const desiredCommitment = input.commitment ?? 'confirmed';
  const confirmation = await waitForTxSubmitSignatureStatus(
    connection,
    signature,
    confirmationTimeoutMs,
    desiredCommitment,
  );

  return {
    success: confirmation.success,
    submitted: true,
    signature,
    confirmationStatus: confirmation.status,
    retrySafe: confirmation.retrySafe,
    ...(confirmation.slot === undefined ? {} : { slot: confirmation.slot }),
    explorerUrl: `https://solscan.io/tx/${signature}`,
    audit: {
      intentId: input.intentId ?? `sap-tx-${Date.now()}`,
      submittedVia: 'hosted-submit-relay',
      signerBoundary: 'already-signed-transaction-only',
      confirmationTimeoutMs,
      desiredCommitment,
      retrySafe: confirmation.retrySafe,
      secretMaterial: 'never-received',
      rule: confirmation.success
        ? 'OOBE hosted relay submitted already-signed bytes and observed the transaction on-chain before returning success. The relay never signs and never receives keypair material.'
        : 'OOBE hosted relay submitted already-signed bytes but did not observe a successful requested confirmation state. Retry the same signed bytes only when retrySafe is true and the user confirms; failed_on_chain transactions require rebuilding a fresh transaction.',
    },
  };
}

export function parseTxSubmitRelayInput(value: unknown): TxSubmitRelayInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('JSON object body is required.');
  }
  const record = value as TxSubmitRelayInput;
  const commitment = record.commitment;
  if (commitment !== undefined && !['processed', 'confirmed', 'finalized'].includes(commitment)) {
    throw new Error('commitment must be processed, confirmed, or finalized.');
  }
  if (record.encoding !== undefined && !['base64', 'base58'].includes(record.encoding)) {
    throw new Error('encoding must be base64 or base58.');
  }
  return record;
}

async function waitForTxSubmitSignatureStatus(
  connection: Connection,
  signature: string,
  timeoutMs: number,
  desiredCommitment: TransactionSubmitCommitment,
): Promise<{ success: boolean; retrySafe: boolean; status: string; slot?: number }> {
  const startedAt = Date.now();
  let lastStatus = 'missing';
  let lastSlot: number | undefined;

  while (Date.now() - startedAt < timeoutMs) {
    const statuses = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
    const status = statuses.value[0];
    if (status?.err) {
      return {
        success: false,
        retrySafe: false,
        status: 'failed_on_chain',
        ...(status.slot === undefined ? {} : { slot: status.slot }),
      };
    }

    if (status) {
      lastStatus = status.confirmationStatus ?? 'processed';
      lastSlot = status.slot;
      if (txSubmitCommitmentReached(lastStatus, desiredCommitment)) {
        return {
          success: true,
          retrySafe: false,
          status: lastStatus,
          ...(lastSlot === undefined ? {} : { slot: lastSlot }),
        };
      }
    }

    await new Promise(resolve => setTimeout(resolve, 2_000));
  }

  return {
    success: false,
    retrySafe: lastStatus === 'missing',
    status: lastStatus === 'missing' ? 'expired_or_not_landed' : lastStatus,
    ...(lastSlot === undefined ? {} : { slot: lastSlot }),
  };
}

function txSubmitCommitmentReached(current: string, desired: TransactionSubmitCommitment): boolean {
  const rank: Record<string, number> = {
    processed: 1,
    confirmed: 2,
    finalized: 3,
  };
  return (rank[current] ?? 0) >= rank[desired];
}

function boundTxSubmitConfirmationTimeout(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return TX_SUBMIT_DEFAULT_CONFIRMATION_TIMEOUT_MS;
  }
  return Math.max(15_000, Math.min(Number(value), TX_SUBMIT_MAX_CONFIRMATION_TIMEOUT_MS));
}
