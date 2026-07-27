/**
 * @module transaction-tools
 * @description MCP tools for decoding, previewing, signing, and submitting Solana transactions.
 */

import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { registerTool } from '../adapters/mcp/sdk-compat.js';
import { createTextResponse } from '../adapters/mcp/tool-response.js';
import { logger } from '../core/logger.js';
import type { SapMcpContext } from '../core/types.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

export type TransactionEncoding = 'base64' | 'base58';
type SolanaTransaction = Transaction | VersionedTransaction;

interface TransactionInput {
  transaction?: string;
  signedTransaction?: string;
  encoding?: TransactionEncoding;
  skipPreflight?: boolean;
  maxRetries?: number;
  confirmationTimeoutMs?: number;
  commitment?: TransactionSubmitCommitment;
  submitViaRelay?: boolean;
  submitRelayUrl?: string;
  intentId?: string;
}

interface DecodedTransaction {
  kind: 'legacy' | 'versioned';
  signatureCount: number;
  readonlySignedAccounts: number;
  readonlyUnsignedAccounts: number;
  requiredSignatures: number;
  instructionCount: number;
  accountKeys: string[];
  recentBlockhash: string;
  feePayer?: string;
  nativeTransferSol: number;
  policyAllowed?: boolean;
  policyReason?: string;
}

interface NativeTransferEstimate {
  lamports: bigint;
  sol: number;
}

export interface FinalizeTransactionInput {
  transaction?: string;
  transactionBase64?: string;
  encoding?: TransactionEncoding;
  submit?: boolean;
  skipPreflight?: boolean;
  maxRetries?: number;
  confirmationTimeoutMs?: number;
  commitment?: TransactionSubmitCommitment;
  submitViaRelay?: boolean;
  submitRelayUrl?: string;
  confirm?: boolean;
  signerProfile?: string;
  intentId?: string;
}

const SYSTEM_TRANSFER_INSTRUCTION_INDEX = 2;
const SYSTEM_TRANSFER_LAYOUT_BYTES = 12;
const DEFAULT_CONFIRMATION_TIMEOUT_MS = 90_000;
const MAX_CONFIRMATION_TIMEOUT_MS = 180_000;
const DEFAULT_TX_SUBMIT_RELAY_URL = 'https://mcp.sap.oobeprotocol.ai/tx/submit';

export type TransactionSubmitCommitment = 'processed' | 'confirmed' | 'finalized';

export interface TransactionSubmitLifecycleInput {
  signedTransaction: string;
  encoding?: TransactionEncoding;
  skipPreflight?: boolean;
  maxRetries?: number;
  confirmationTimeoutMs?: number;
  commitment?: TransactionSubmitCommitment;
  intentId?: string;
}

export interface TransactionSubmitLifecycleResult {
  success: boolean;
  submitted: true;
  signature: string;
  confirmationStatus: string;
  retrySafe: boolean;
  slot?: number;
  explorerUrl: string;
  audit: {
    intentId: string;
    submittedVia: 'local-rpc';
    confirmationTimeoutMs: number;
    desiredCommitment: TransactionSubmitCommitment;
    retrySafe: boolean;
    rule: string;
  };
}

interface RelaySubmitInput extends TransactionSubmitLifecycleInput {
  submitRelayUrl?: string;
}

type RelaySubmitResult = Omit<TransactionSubmitLifecycleResult, 'audit'> & {
  audit: Omit<TransactionSubmitLifecycleResult['audit'], 'submittedVia'> & {
    submittedVia: 'hosted-submit-relay';
    relayUrl: string;
    signerBoundary: 'local-signer-remote-submit-only';
  };
};

/**
 * @name decodeInputBytes
 * @description Decodes base64/base58 transaction text into raw bytes.
 * @param value - Encoded transaction string.
 * @param encoding - Encoding used by the incoming transaction.
 * @returns Raw serialized transaction bytes.
 */
export function decodeInputBytes(value: string, encoding: TransactionEncoding = 'base64'): Buffer {
  if (encoding === 'base64') {
    return Buffer.from(value, 'base64');
  }

  if (encoding === 'base58') {
    return Buffer.from(bs58.decode(value));
  }

  throw new Error(`Unsupported transaction encoding: ${encoding}`);
}

/**
 * @name deserializeTransaction
 * @description Deserializes a Solana transaction, preferring v0/versioned format before legacy fallback.
 * @param value - Encoded transaction string.
 * @param encoding - Encoding used by the incoming transaction.
 * @returns Deserialized Solana transaction.
 */
export function deserializeTransaction(value: string, encoding?: TransactionEncoding): SolanaTransaction {
  const bytes = decodeInputBytes(value, encoding);

  try {
    return VersionedTransaction.deserialize(bytes);
  } catch {
    return Transaction.from(bytes);
  }
}

/**
 * @name parseSystemTransferLamports
 * @description Reads lamports from a native System Program transfer instruction.
 * @param data - Compiled instruction data.
 * @returns Lamports for transfer instructions, otherwise zero.
 */
function parseSystemTransferLamports(data: Uint8Array): bigint {
  if (data.byteLength < SYSTEM_TRANSFER_LAYOUT_BYTES) {
    return 0n;
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const instructionIndex = view.getUint32(0, true);
  if (instructionIndex !== SYSTEM_TRANSFER_INSTRUCTION_INDEX) {
    return 0n;
  }

  return view.getBigUint64(4, true);
}

/**
 * @name estimateNativeTransfer
 * @description Estimates native SOL leaving the signer, or all native SOL transfers when no signer filter is supplied.
 * @param transaction - Deserialized Solana transaction.
 * @param signer - Optional signer to filter outgoing transfers.
 * @returns Native transfer estimate in lamports and SOL.
 */
function estimateNativeTransfer(transaction: SolanaTransaction, signer?: PublicKey): NativeTransferEstimate {
  let lamports = 0n;

  if (transaction instanceof VersionedTransaction) {
    const keys = transaction.message.staticAccountKeys;

    for (const instruction of transaction.message.compiledInstructions) {
      const programId = keys[instruction.programIdIndex];
      if (!programId?.equals(SystemProgram.programId)) {
        continue;
      }

      const fromIndex = instruction.accountKeyIndexes[0];
      const from = fromIndex === undefined ? undefined : keys[fromIndex];
      if (signer && !from?.equals(signer)) {
        continue;
      }

      lamports += parseSystemTransferLamports(instruction.data);
    }
  } else {
    for (const instruction of transaction.instructions) {
      if (!instruction.programId.equals(SystemProgram.programId)) {
        continue;
      }

      const from = instruction.keys[0]?.pubkey;
      if (signer && !from?.equals(signer)) {
        continue;
      }

      lamports += parseSystemTransferLamports(instruction.data);
    }
  }

  return {
    lamports,
    sol: Number(lamports) / LAMPORTS_PER_SOL,
  };
}

/**
 * @name assertTransactionPolicy
 * @description Enforces configured transaction value policy before signing or submitting a transaction.
 * @param context - Shared MCP runtime context.
 * @param transaction - Deserialized transaction to check.
 * @param signer - Optional signer filter for signing checks.
 */
export async function assertTransactionPolicy(
  context: SapMcpContext,
  transaction: SolanaTransaction,
  signer?: PublicKey
): Promise<NativeTransferEstimate> {
  const nativeTransfer = estimateNativeTransfer(transaction, signer);
  if (nativeTransfer.sol <= 0) {
    return nativeTransfer;
  }

  const policy = await context.policyEngine.checkPermission('transaction:submit', {
    amountSol: nativeTransfer.sol,
    toolName: 'sap_sign_transaction',
  });

  if (!policy.allowed) {
    throw new Error(policy.reason || `Native transfer of ${nativeTransfer.sol} SOL is blocked by policy`);
  }

  return nativeTransfer;
}

/**
 * @name serializeTransaction
 * @description Serializes a legacy or versioned transaction as base64.
 * @param transaction - Transaction to serialize.
 * @returns Base64 encoded transaction bytes.
 */
export function serializeTransaction(transaction: SolanaTransaction): string {
  if (transaction instanceof VersionedTransaction) {
    return Buffer.from(transaction.serialize()).toString('base64');
  }

  return transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  }).toString('base64');
}

/**
 * @name submitSignedTransactionWithLifecycle
 * @description Submits a signed transaction through the configured local RPC and waits for a bounded confirmation result.
 * @param context - Shared MCP runtime context.
 * @param input - Signed transaction plus send/confirmation options.
 * @returns Submission lifecycle result with retry guidance.
 */
export async function submitSignedTransactionWithLifecycle(
  context: SapMcpContext,
  input: TransactionSubmitLifecycleInput,
): Promise<TransactionSubmitLifecycleResult> {
  const signedTransaction = input.signedTransaction;
  const encoding = input.encoding ?? 'base64';
  const rawTransaction = decodeInputBytes(signedTransaction, encoding);

  await assertTransactionPolicy(context, deserializeTransaction(signedTransaction, encoding));

  const signature = await context.connection.sendRawTransaction(rawTransaction, {
    skipPreflight: input.skipPreflight,
    maxRetries: input.maxRetries ?? context.config.maxRetries ?? 3,
    preflightCommitment: 'confirmed',
  });
  const confirmationTimeoutMs = boundConfirmationTimeout(input.confirmationTimeoutMs);
  const desiredCommitment = input.commitment ?? 'confirmed';
  let confirmation = await waitForSignatureStatus(
    context,
    signature,
    confirmationTimeoutMs,
    desiredCommitment,
  );

  // If the transaction expired or didn't land (common with heavy Adrena txs on
  // public RPC), re-submit once with the same signed bytes. Validators may
  // accept it if the blockhash is still valid. This helps with transactions
  // that are too large for a single slot but valid.
  if (!confirmation.success && confirmation.retrySafe) {
    logger.debug('Transaction expired, re-submitting', { signature });
    try {
      await context.connection.sendRawTransaction(rawTransaction, {
        skipPreflight: true,
        maxRetries: 3,
        preflightCommitment: 'confirmed',
      });
      confirmation = await waitForSignatureStatus(
        context,
        signature,
        Math.min(confirmationTimeoutMs, 60_000),
        desiredCommitment,
      );
    } catch {
      // Re-submit failed — keep original confirmation result.
    }
  }

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
      submittedVia: 'local-rpc',
      confirmationTimeoutMs,
      desiredCommitment,
      retrySafe: confirmation.retrySafe,
      rule: confirmation.success
        ? 'The signed transaction was submitted and observed on-chain before returning success.'
        : 'The signed transaction was submitted but did not reach the requested confirmation state before timeout; retry only when retrySafe is true and the user confirms.',
    },
  };
}

/**
 * @name submitSignedTransactionViaRelay
 * @description Submits a signed transaction to the hosted OOBE submit relay. The relay never signs; it only broadcasts and confirms already-signed bytes.
 * @param input - Signed transaction plus send/confirmation options.
 * @returns Relay lifecycle result with retry guidance.
 */
export async function submitSignedTransactionViaRelay(input: RelaySubmitInput): Promise<RelaySubmitResult> {
  const relayUrl = input.submitRelayUrl ?? process.env.SAP_MCP_TX_SUBMIT_RELAY_URL ?? DEFAULT_TX_SUBMIT_RELAY_URL;
  validateRelayUrl(relayUrl);

  const response = await fetch(relayUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      signedTransaction: input.signedTransaction,
      encoding: input.encoding ?? 'base64',
      skipPreflight: input.skipPreflight,
      maxRetries: input.maxRetries,
      confirmationTimeoutMs: input.confirmationTimeoutMs,
      commitment: input.commitment,
      intentId: input.intentId,
    }),
  });

  const body = await response.json().catch(() => undefined) as unknown;
  if (!response.ok) {
    const message = typeof body === 'object' && body && 'error' in body
      ? String((body as { error: unknown }).error)
      : `submit relay returned HTTP ${response.status}`;
    throw new Error(message);
  }

  if (!isRelaySubmitResult(body)) {
    throw new Error('submit relay returned an invalid transaction lifecycle response.');
  }

  return {
    ...body,
    audit: {
      ...body.audit,
      submittedVia: 'hosted-submit-relay',
      relayUrl,
      signerBoundary: 'local-signer-remote-submit-only',
    },
  };
}

async function waitForSignatureStatus(
  context: SapMcpContext,
  signature: string,
  timeoutMs: number,
  desiredCommitment: TransactionSubmitCommitment,
): Promise<{ success: boolean; retrySafe: boolean; status: string; slot?: number }> {
  const startedAt = Date.now();
  let lastStatus = 'missing';
  let lastSlot: number | undefined;

  while (Date.now() - startedAt < timeoutMs) {
    const statuses = await context.connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
    const status = statuses.value[0];
    if (status?.err) {
      return {
        success: false,
        retrySafe: true,
        status: 'failed',
        ...(status.slot === undefined ? {} : { slot: status.slot }),
      };
    }

    if (status) {
      lastStatus = status.confirmationStatus ?? 'processed';
      lastSlot = status.slot;
      if (commitmentReached(lastStatus, desiredCommitment)) {
        return {
          success: true,
          retrySafe: false,
          status: lastStatus,
          ...(lastSlot === undefined ? {} : { slot: lastSlot }),
        };
      }
    }

    await sleep(2_000);
  }

  return {
    success: false,
    retrySafe: lastStatus === 'missing',
    status: lastStatus === 'missing' ? 'expired_or_not_landed' : lastStatus,
    ...(lastSlot === undefined ? {} : { slot: lastSlot }),
  };
}

function commitmentReached(current: string, desired: TransactionSubmitCommitment): boolean {
  const rank: Record<string, number> = {
    processed: 1,
    confirmed: 2,
    finalized: 3,
  };
  return (rank[current] ?? 0) >= rank[desired];
}

function boundConfirmationTimeout(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_CONFIRMATION_TIMEOUT_MS;
  }
  return Math.max(15_000, Math.min(Number(value), MAX_CONFIRMATION_TIMEOUT_MS));
}

function validateRelayUrl(value: string): void {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    throw new Error('submitRelayUrl must use https, localhost, or 127.0.0.1.');
  }
}

function isRelaySubmitResult(value: unknown): value is RelaySubmitResult {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Partial<RelaySubmitResult>;
  return typeof record.success === 'boolean'
    && record.submitted === true
    && typeof record.signature === 'string'
    && typeof record.confirmationStatus === 'string'
    && typeof record.retrySafe === 'boolean'
    && typeof record.explorerUrl === 'string'
    && typeof record.audit === 'object';
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * @name describeTransaction
 * @description Builds a stable JSON preview from a Solana transaction.
 * @param transaction - Deserialized transaction.
 * @returns Transaction metadata safe to expose to MCP clients.
 */
export function describeTransaction(transaction: SolanaTransaction, context?: SapMcpContext): DecodedTransaction {
  const nativeTransfer = estimateNativeTransfer(transaction);
  const maxTxValueSol = context?.config.maxTxValueSol;
  const policyAllowed = context
    ? nativeTransfer.sol <= context.config.requireApprovalAboveSol
      && nativeTransfer.sol <= context.config.maxTxValueSol
    : undefined;
  const policyReason = context && !policyAllowed
    ? maxTxValueSol !== undefined && nativeTransfer.sol > maxTxValueSol
      ? `Native transfer ${nativeTransfer.sol} SOL exceeds max ${maxTxValueSol} SOL`
      : `Native transfer ${nativeTransfer.sol} SOL requires approval above ${context.config.requireApprovalAboveSol} SOL`
    : undefined;

  if (transaction instanceof VersionedTransaction) {
    const header = transaction.message.header;
    const accountKeys = transaction.message.staticAccountKeys.map((key) => key.toBase58());
    return {
      kind: 'versioned',
      signatureCount: transaction.signatures.length,
      readonlySignedAccounts: header.numReadonlySignedAccounts,
      readonlyUnsignedAccounts: header.numReadonlyUnsignedAccounts,
      requiredSignatures: header.numRequiredSignatures,
      instructionCount: transaction.message.compiledInstructions.length,
      accountKeys,
      recentBlockhash: transaction.message.recentBlockhash,
      feePayer: accountKeys[0],
      nativeTransferSol: nativeTransfer.sol,
      policyAllowed,
      policyReason,
    };
  }

  return {
    kind: 'legacy',
    signatureCount: transaction.signatures.length,
    readonlySignedAccounts: 0,
    readonlyUnsignedAccounts: 0,
    requiredSignatures: transaction.signatures.length,
    instructionCount: transaction.instructions.length,
    accountKeys: transaction.instructions.flatMap((instruction) => instruction.keys.map((key) => key.pubkey.toBase58())),
    recentBlockhash: transaction.recentBlockhash ?? '',
    feePayer: transaction.feePayer?.toBase58(),
    nativeTransferSol: nativeTransfer.sol,
    policyAllowed,
    policyReason,
  };
}

/**
 * @name finalizeTransactionWithLocalSigner
 * @description Preview, sign, and optionally submit a transaction with the local SAP MCP signer.
 * @param context - Shared MCP runtime context containing signer, policy, and RPC connection.
 * @param input - Transaction finalization request.
 * @returns Agent-readable finalization result without secret material.
 */
export async function finalizeTransactionWithLocalSigner(
  context: SapMcpContext,
  input: FinalizeTransactionInput,
): Promise<Record<string, unknown>> {
  if (input.confirm !== true) {
    throw new Error('confirm: true is required before the local SAP MCP signer can finalize a transaction.');
  }

  const transactionText = input.transaction ?? input.transactionBase64;
  if (!transactionText) {
    throw new Error('transaction or transactionBase64 is required.');
  }

  // Resolve signer: use signerProfile if provided, otherwise fall back to the
  // active context signer. This eliminates the need to switch .active-profile
  // manually — multiple profiles can coexist in the same session.
  let signer = context.signer;
  let signerProfileName: string | undefined;

  if (input.signerProfile) {
    const { loadProfileConfig } = await import('../config/profiles.js');
    const { resolveSigner } = await import('../signer/signer-resolver.js');
    const profileConfig = loadProfileConfig(input.signerProfile);
    if (!profileConfig) {
      throw new Error(
        `signerProfile "${input.signerProfile}" not found. ` +
        `Available profiles can be listed with sap_profile_list (local mode) or by checking ~/.config/mcp-sap/config-*.json files. ` +
        `If the hosted server is accountless, use the local sap_payments bridge to inspect profiles.`,
      );
    }
    // FullConfig does not include monetization — merge with the active context
    // config to provide the required SapMcpConfig shape for resolveSigner.
    const mergedConfig = { ...context.config, ...profileConfig };
    const signerResult = await resolveSigner(mergedConfig);
    if (!signerResult.signer) {
      throw new Error(
        `signerProfile "${input.signerProfile}" has no signer configured. ` +
        `Ensure the profile config has a walletPath or externalSignerUrl set. ` +
        `Run: sap-mcp-config wizard --profile ${input.signerProfile} to configure.`,
      );
    }
    signer = signerResult.signer;
    signerProfileName = input.signerProfile;
  }

  if (!signer) {
    throw new Error('No local signer configured. Run the SAP MCP wizard full setup or repair the local sap_payments bridge, then restart the agent runtime.');
  }

  const encoding = input.encoding ?? 'base64';
  const transaction = deserializeTransaction(transactionText, encoding);

  // Refresh the blockhash before signing. The unsigned transaction may have
  // been built minutes ago — the blockhash inside it can be stale by the time
  // the agent calls finalize. We fetch a fresh blockhash and replace it so
  // the signed transaction has the maximum possible window to land on-chain.
  if (transaction instanceof Transaction && transaction.feePayer) {
    try {
      const freshBlockhash = await context.connection.getLatestBlockhash({
        commitment: 'confirmed',
      });
      transaction.recentBlockhash = freshBlockhash.blockhash;
      // Keep the existing feePayer — it was set by the builder.
    } catch {
      // If the RPC call fails, keep the original blockhash — better than crashing.
    }
  }

  const preview = describeTransaction(transaction, context);
  const nativeTransfer = await assertTransactionPolicy(context, transaction, signer.publicKey);
  const signedTransaction = await signer.signTransaction(transaction);
  const signedTransactionBase64 = serializeTransaction(signedTransaction);

  const result: Record<string, unknown> = {
    success: true,
    action: input.submit === true ? 'preview-sign-submit' : 'preview-sign',
    submitted: false,
    signerPublicKey: signer.publicKey.toBase58(),
    signerProfile: signerProfileName ?? null,
    nativeTransferSol: nativeTransfer.sol,
    preview: {
      ...preview,
      canSign: true,
      signer: signer.publicKey.toBase58(),
      signerProfile: signerProfileName ?? null,
    },
    signedTransaction: signedTransactionBase64,
    encoding: 'base64',
    audit: {
      intentId: input.intentId ?? `sap-tx-${Date.now()}`,
      profileMode: context.config.mode,
      signerProfile: signerProfileName ?? null,
      signerPublicKey: signer.publicKey.toBase58(),
      previewed: true,
      signedLocally: true,
      submitted: false,
      secretMaterial: 'keypair-bytes-never-returned',
      rule: 'Finalized by SAP MCP local signer. No temporary scripts, raw keypair reads, or exported secret bytes were used.',
    },
  };

  if (input.submit === true) {
    const submitResult = input.submitViaRelay === false
      ? await submitSignedTransactionWithLifecycle(context, {
        signedTransaction: signedTransactionBase64,
        encoding: 'base64',
        skipPreflight: input.skipPreflight,
        maxRetries: input.maxRetries,
        confirmationTimeoutMs: input.confirmationTimeoutMs,
        commitment: input.commitment,
        intentId: input.intentId,
      })
      : await submitSignedTransactionViaRelay({
        signedTransaction: signedTransactionBase64,
        encoding: 'base64',
        skipPreflight: input.skipPreflight,
        maxRetries: input.maxRetries,
        confirmationTimeoutMs: input.confirmationTimeoutMs,
        commitment: input.commitment,
        submitRelayUrl: input.submitRelayUrl,
        intentId: input.intentId,
      });

    result.success = submitResult.success;
    result.submitted = submitResult.submitted;
    result.signature = submitResult.signature;
    result.confirmationStatus = submitResult.confirmationStatus;
    result.retrySafe = submitResult.retrySafe;
    result.explorerUrl = submitResult.explorerUrl;
    result.audit = {
      ...(result.audit as Record<string, unknown>),
      ...submitResult.audit,
      submitted: submitResult.submitted,
      signature: submitResult.signature,
      transactionLanded: submitResult.success,
    };
  }

  return result;
}

/**
 * @name registerTransactionTools
 * @description Registers real transaction decode, preview, signing, and submission tools.
 * @param server - MCP server receiving the tool registrations.
 * @param context - Runtime context containing Solana connection and optional signer.
 */
export function registerTransactionTools(server: Server, context: SapMcpContext): void {
  registerTool(
    server,
    'sap_decode_transaction',
    {
      title: 'Decode Transaction',
      description: 'Decode a serialized Solana transaction and return stable transaction metadata. Use this before signing when a SAP MCP, Jupiter, MagicBlock, SNS, Metaplex, or DeFi tool returns transactionBase64 or an unsigned transaction.',
      inputSchema: {
        transaction: { type: 'string', description: 'Serialized transaction' },
        encoding: { type: 'string', enum: ['base64', 'base58'], description: 'Input encoding' },
      },
    },
    async (input: TransactionInput) => {
      try {
        if (!input.transaction) {
          throw new Error('transaction is required');
        }

        return createTextResponse(JSON.stringify(describeTransaction(deserializeTransaction(input.transaction, input.encoding), context), null, 2));
      } catch (error) {
        return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
      }
    }
  );

  registerTool(
    server,
    'sap_preview_transaction',
    {
      title: 'Preview Transaction',
      description: 'Preview a Solana transaction before signing or submission. This is the required preflight step for agent workflows; do not create local signing scripts or read keypair files.',
      inputSchema: {
        transaction: { type: 'string', description: 'Serialized transaction' },
        encoding: { type: 'string', enum: ['base64', 'base58'], description: 'Input encoding' },
      },
    },
    async (input: TransactionInput) => {
      try {
        if (!input.transaction) {
          throw new Error('transaction is required');
        }

        const transaction = deserializeTransaction(input.transaction, input.encoding);
        const preview = describeTransaction(transaction, context);
        return createTextResponse(JSON.stringify({
          ...preview,
          canSign: Boolean(context.signer),
          signer: context.signer?.publicKey.toBase58(),
        }, null, 2));
      } catch (error) {
        return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
      }
    }
  );

  registerTool(
    server,
    'sap_sign_transaction',
    {
      title: 'Sign Transaction',
      description: 'Sign a serialized Solana transaction with the configured SAP MCP signer after sap_preview_transaction. This is the supported non-custodial signing path for agents; never read keypair JSON or sign raw message bytes in temporary scripts.',
      inputSchema: {
        transaction: { type: 'string', description: 'Unsigned or partially signed transaction' },
        encoding: { type: 'string', enum: ['base64', 'base58'], description: 'Input encoding' },
      },
    },
    async (input: TransactionInput) => {
      try {
        if (!context.signer) {
          throw new Error('No signer configured. Use local-dev-keypair or external-signer mode.');
        }
        if (!input.transaction) {
          throw new Error('transaction is required');
        }

        const transaction = deserializeTransaction(input.transaction, input.encoding);

        // Refresh the blockhash before signing — the transaction may have been
        // built earlier with a now-stale blockhash.
        if (transaction instanceof Transaction && transaction.feePayer) {
          try {
            const freshBlockhash = await context.connection.getLatestBlockhash({
              commitment: 'confirmed',
            });
            transaction.recentBlockhash = freshBlockhash.blockhash;
          } catch {
            // Keep original blockhash if RPC fails.
          }
        }

        const nativeTransfer = await assertTransactionPolicy(context, transaction, context.signer.publicKey);
        const signedTransaction = await context.signer.signTransaction(transaction);
        return createTextResponse(JSON.stringify({
          success: true,
          publicKey: context.signer.publicKey.toBase58(),
          nativeTransferSol: nativeTransfer.sol,
          transaction: serializeTransaction(signedTransaction),
          encoding: 'base64',
        }, null, 2));
      } catch (error) {
        return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
      }
    }
  );

  registerTool(
    server,
    'sap_submit_signed_transaction',
    {
      title: 'Submit Signed Transaction',
      description: 'Submit a signed Solana transaction produced by sap_sign_transaction through the configured RPC endpoint. Use this instead of custom sendRawTransaction scripts so policy, retries, and audit stay inside SAP MCP.',
      inputSchema: {
        signedTransaction: { type: 'string', description: 'Signed serialized transaction' },
        encoding: { type: 'string', enum: ['base64', 'base58'], description: 'Input encoding' },
        skipPreflight: { type: 'boolean', description: 'Skip RPC preflight checks' },
        maxRetries: { type: 'number', description: 'Maximum RPC send retries' },
        confirmationTimeoutMs: { type: 'number', description: 'Bounded confirmation wait in milliseconds. Defaults to 90000; maximum 180000.' },
        commitment: { type: 'string', enum: ['processed', 'confirmed', 'finalized'], description: 'Desired confirmation status before returning success. Defaults to confirmed.' },
        submitViaRelay: { type: 'boolean', description: 'When true, submit through the hosted OOBE relay. The relay only broadcasts already-signed bytes and never signs. Defaults to false for this local tool.' },
        submitRelayUrl: { type: 'string', description: 'Optional submit relay URL. Must be HTTPS, localhost, or 127.0.0.1.' },
        intentId: { type: 'string', description: 'Optional caller-provided id binding submission, confirmation, and audit output.' },
      },
    },
    async (input: TransactionInput) => {
      try {
        if (!input.signedTransaction) {
          throw new Error('signedTransaction is required');
        }

        const result = input.submitViaRelay === true
          ? await submitSignedTransactionViaRelay({
            signedTransaction: input.signedTransaction,
            encoding: input.encoding,
            skipPreflight: input.skipPreflight,
            maxRetries: input.maxRetries,
            confirmationTimeoutMs: input.confirmationTimeoutMs,
            commitment: input.commitment,
            submitRelayUrl: input.submitRelayUrl,
            intentId: input.intentId,
          })
          : await submitSignedTransactionWithLifecycle(context, {
            signedTransaction: input.signedTransaction,
            encoding: input.encoding,
            skipPreflight: input.skipPreflight,
            maxRetries: input.maxRetries,
            confirmationTimeoutMs: input.confirmationTimeoutMs,
            commitment: input.commitment,
            intentId: input.intentId,
          });

        return createTextResponse(JSON.stringify(result, null, 2), { isError: !result.success });
      } catch (error) {
        return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
      }
    }
  );

  // ── Native SOL Transfer Builder ───────────────────────────────────────────
  //
  // There is no hosted builder for native SOL transfers — `spl-token_transferSol`
  // is local-signer-only and cannot run on the hosted accountless server. This
  // builder creates an unsigned SystemProgram.transfer transaction that the
  // agent signs locally via sap_payments_finalize_transaction or
  // sap_sign_transaction → sap_submit_signed_transaction.
  //
  registerTool(
    server,
    'sap_build_sol_transfer',
    {
      title: 'Build Native SOL Transfer Transaction',
      description:
        'Build an unsigned native SOL transfer transaction using SystemProgram.transfer. Returns serialized base64 transaction for the agent to sign locally with sap_payments_finalize_transaction or sap_sign_transaction → sap_submit_signed_transaction. This is the hosted-safe equivalent of spl-token_transferSol (which is local-signer-only and cannot run on the hosted accountless server). Builder fee applies.',
      inputSchema: {
        fromPubkey: {
          type: 'string',
          description: 'Sender public key in base58. This is the fee payer and must sign the transaction locally.',
        },
        toPubkey: {
          type: 'string',
          description: 'Recipient public key in base58.',
        },
        lamports: {
          type: 'number',
          description: 'Amount in lamports (1 SOL = 1,000,000,000 lamports). Use sap_estimate_tool_cost to check the builder fee before calling.',
        },
      },
    },
    async (input: unknown) => {
      try {
        const raw = input as Record<string, unknown>;
        const fromPubkey = typeof raw['fromPubkey'] === 'string' ? raw['fromPubkey'] : undefined;
        const toPubkey = typeof raw['toPubkey'] === 'string' ? raw['toPubkey'] : undefined;
        const lamports = typeof raw['lamports'] === 'number' ? raw['lamports'] : undefined;

        if (!fromPubkey || !toPubkey || lamports === undefined) {
          throw new Error('fromPubkey, toPubkey, and lamports are required.');
        }

        // Validate public keys.
        const fromKey = new PublicKey(fromPubkey);
        const toKey = new PublicKey(toPubkey);

        if (lamports <= 0) {
          throw new Error('lamports must be a positive number.');
        }

        // Build the SystemProgram.transfer instruction.
        const instruction = SystemProgram.transfer({
          fromPubkey: fromKey,
          toPubkey: toKey,
          lamports,
        });

        // Create a legacy transaction with the transfer instruction.
        // The latest blockhash is fetched from the configured RPC.
        const connection = context.connection;
        const blockhash = await connection.getLatestBlockhash();

        const transaction = new Transaction({
          recentBlockhash: blockhash.blockhash,
          feePayer: fromKey,
        });
        transaction.add(instruction);

        // Serialize as base64 for the agent to sign locally.
        const serialized = transaction.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        });
        const transactionBase64 = serialized.toString('base64');

        return createTextResponse(JSON.stringify({
          success: true,
          transactionBase64,
          encoding: 'base64',
          instructions: [
            {
              program: 'SystemProgram',
              type: 'Transfer',
              from: fromPubkey,
              to: toPubkey,
              lamports,
              solAmount: (lamports / LAMPORTS_PER_SOL).toFixed(9),
            },
          ],
          feePayer: fromPubkey,
          unsigned: true,
          nextSteps: 'Sign locally with sap_payments_finalize_transaction (hosted mode) or sap_sign_transaction → sap_submit_signed_transaction (local mode). Do not create temporary signing scripts or read keypair JSON.',
        }, null, 2));
      } catch (error) {
        return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
      }
    }
  );

  // ── SPL Token Transfer Builder ─────────────────────────────────────────────
  //
  // `spl-token_transfer` is local-signer-only and cannot run on the hosted
  // accountless server. This builder creates an unsigned SPL token transfer
  // transaction that the agent signs locally via sap_payments_finalize_transaction.
  //
  registerTool(
    server,
    'sap_build_spl_transfer',
    {
      title: 'Build SPL Token Transfer Transaction',
      description:
        'Build an unsigned SPL token transfer transaction. Returns serialized base64 transaction for the agent to sign locally with sap_payments_finalize_transaction or sap_sign_transaction → sap_submit_signed_transaction. This is the hosted-safe equivalent of spl-token_transfer (which is local-signer-only and cannot run on the hosted accountless server). Builder fee applies.',
      inputSchema: {
        sourceOwner: {
          type: 'string',
          description: 'Source token account owner public key in base58. This is the fee payer and must sign the transaction locally.',
        },
        destinationOwner: {
          type: 'string',
          description: 'Destination wallet public key in base58. The destination ATA will be created if it does not exist.',
        },
        mint: {
          type: 'string',
          description: 'SPL token mint address in base58.',
        },
        amount: {
          type: 'number',
          description: 'Amount of tokens to transfer in base units (respect the mint decimals).',
        },
        decimals: {
          type: 'number',
          description: 'Token decimals for the mint. Used for display purposes only — the on-chain amount is in base units.',
        },
      },
    },
    async (input: unknown) => {
      try {
        const raw = input as Record<string, unknown>;
        const sourceOwner = typeof raw['sourceOwner'] === 'string' ? raw['sourceOwner'] : undefined;
        const destinationOwner = typeof raw['destinationOwner'] === 'string' ? raw['destinationOwner'] : undefined;
        const mint = typeof raw['mint'] === 'string' ? raw['mint'] : undefined;
        const amount = typeof raw['amount'] === 'number' ? raw['amount'] : undefined;
        const decimals = typeof raw['decimals'] === 'number' ? raw['decimals'] : undefined;

        if (!sourceOwner || !destinationOwner || !mint || amount === undefined) {
          throw new Error('sourceOwner, destinationOwner, mint, and amount are required.');
        }
        if (amount <= 0) {
          throw new Error('amount must be a positive number.');
        }

        // Build SPL token transfer instructions using @solana/web3.js only.
        // We construct the raw instruction data manually to avoid depending on
        // @solana/spl-token (not in package.json).
        const sourceOwnerKey = new PublicKey(sourceOwner);
        const destOwnerKey = new PublicKey(destinationOwner);
        const mintKey = new PublicKey(mint);

        // Derive Associated Token Account addresses using the standard SPL
        // seed layout: [owner, TOKEN_PROGRAM_ID, mint] — NO string prefix.
        // The Associated Token Account program does NOT use a "AssociatedTokenAddress"
        // prefix in its PDA seeds. Using one produces a wrong ATA address.
        const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
        const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

        const [sourceAta] = PublicKey.findProgramAddressSync(
          [sourceOwnerKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mintKey.toBuffer()],
          ASSOCIATED_TOKEN_PROGRAM_ID,
        );
        const [destAta] = PublicKey.findProgramAddressSync(
          [destOwnerKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mintKey.toBuffer()],
          ASSOCIATED_TOKEN_PROGRAM_ID,
        );

        // CreateAssociatedTokenAccountIdempotent instruction (index 1).
        const createAtaInstruction = new TransactionInstruction({
          programId: ASSOCIATED_TOKEN_PROGRAM_ID,
          keys: [
            { pubkey: sourceOwnerKey, isSigner: true, isWritable: true },
            { pubkey: destAta, isSigner: false, isWritable: true },
            { pubkey: destOwnerKey, isSigner: false, isWritable: false },
            { pubkey: mintKey, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          ],
          data: Buffer.from([0x01]), // CreateAssociatedTokenAccountIdempotent instruction index = 1
        });

        // Token Transfer instruction (0x03 + 64-bit amount in little-endian).
        const transferData = Buffer.alloc(9);
        transferData.writeUInt8(3, 0); // Transfer instruction discriminator
        transferData.writeBigUInt64LE(BigInt(amount), 1);

        const transferInstruction = new TransactionInstruction({
          programId: TOKEN_PROGRAM_ID,
          keys: [
            { pubkey: sourceAta, isSigner: false, isWritable: true },
            { pubkey: destAta, isSigner: false, isWritable: true },
            { pubkey: sourceOwnerKey, isSigner: true, isWritable: false },
          ],
          data: transferData,
        });

        // Fetch latest blockhash and build transaction.
        const connection = context.connection;
        const blockhash = await connection.getLatestBlockhash();

        const transaction = new Transaction({
          recentBlockhash: blockhash.blockhash,
          feePayer: sourceOwnerKey,
        });
        transaction.add(createAtaInstruction);
        transaction.add(transferInstruction);

        const serialized = transaction.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        });
        const transactionBase64 = serialized.toString('base64');

        return createTextResponse(JSON.stringify({
          success: true,
          transactionBase64,
          encoding: 'base64',
          instructions: [
            {
              program: 'SPL Token',
              type: 'CreateAssociatedTokenAccountIdempotent',
              destinationAta: destAta.toBase58(),
            },
            {
              program: 'SPL Token',
              type: 'Transfer',
              sourceAta: sourceAta.toBase58(),
              destinationAta: destAta.toBase58(),
              mint,
              amount,
              decimals: decimals ?? undefined,
            },
          ],
          feePayer: sourceOwner,
          unsigned: true,
          nextSteps: 'Sign locally with sap_payments_finalize_transaction (hosted mode) or sap_sign_transaction → sap_submit_signed_transaction (local mode). Do not create temporary signing scripts or read keypair JSON.',
        }, null, 2));
      } catch (error) {
        return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
      }
    }
  );
}
