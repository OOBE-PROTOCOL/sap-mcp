/**
 * @module transaction-tools
 * @description MCP tools for decoding, previewing, signing, and submitting Solana transactions.
 */

import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { registerTool } from '../adapters/mcp/sdk-compat.js';
import { createTextResponse } from '../adapters/mcp/tool-response.js';
import type { SapMcpContext } from '../core/types.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

type TransactionEncoding = 'base64' | 'base58';
type SolanaTransaction = Transaction | VersionedTransaction;

interface TransactionInput {
  transaction?: string;
  signedTransaction?: string;
  encoding?: TransactionEncoding;
  skipPreflight?: boolean;
  maxRetries?: number;
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

const SYSTEM_TRANSFER_INSTRUCTION_INDEX = 2;
const SYSTEM_TRANSFER_LAYOUT_BYTES = 12;

/**
 * @name decodeInputBytes
 * @description Decodes base64/base58 transaction text into raw bytes.
 * @param value - Encoded transaction string.
 * @param encoding - Encoding used by the incoming transaction.
 * @returns Raw serialized transaction bytes.
 */
function decodeInputBytes(value: string, encoding: TransactionEncoding = 'base64'): Buffer {
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
function deserializeTransaction(value: string, encoding?: TransactionEncoding): SolanaTransaction {
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
async function assertTransactionPolicy(
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
function serializeTransaction(transaction: SolanaTransaction): string {
  if (transaction instanceof VersionedTransaction) {
    return Buffer.from(transaction.serialize()).toString('base64');
  }

  return transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  }).toString('base64');
}

/**
 * @name describeTransaction
 * @description Builds a stable JSON preview from a Solana transaction.
 * @param transaction - Deserialized transaction.
 * @returns Transaction metadata safe to expose to MCP clients.
 */
function describeTransaction(transaction: SolanaTransaction, context?: SapMcpContext): DecodedTransaction {
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
      },
    },
    async (input: TransactionInput) => {
      try {
        if (!input.signedTransaction) {
          throw new Error('signedTransaction is required');
        }

        const rawTransaction = decodeInputBytes(input.signedTransaction, input.encoding);
        await assertTransactionPolicy(
          context,
          deserializeTransaction(input.signedTransaction, input.encoding)
        );
        const signature = await context.connection.sendRawTransaction(rawTransaction, {
          skipPreflight: input.skipPreflight,
          maxRetries: input.maxRetries,
        });

        return createTextResponse(JSON.stringify({
          success: true,
          signature,
        }, null, 2));
      } catch (error) {
        return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
      }
    }
  );
}
