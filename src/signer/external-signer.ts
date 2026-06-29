/**
 * External signer interface
 * 
 * For integrating with external signing services (Ledger, Fireblocks, etc.)
 */

import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { logger } from '../core/logger.js';
import type { Signer } from './signer-types.js';

interface ExternalSignerResponse {
  signedTransaction: string;
  publicKey?: string;
}

/**
 * @name isPlainObject
 * @description Checks whether a value is a plain JSON-compatible object.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @name serializeForExternalSigner
 * @description Serializes a Solana transaction for external signing.
 * @param tx - Transaction to send to the signing service.
 * @returns Base64 serialized transaction.
 */
function serializeForExternalSigner(tx: Transaction | VersionedTransaction): string {
  if (tx instanceof VersionedTransaction) {
    return Buffer.from(tx.serialize()).toString('base64');
  }

  return tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  }).toString('base64');
}

/**
 * @name isExternalSignerResponse
 * @description Validates the minimal response shape returned by an external signer service.
 * @param value - Parsed JSON response.
 * @returns True when the response contains a signed transaction.
 */
function isExternalSignerResponse(value: unknown): value is ExternalSignerResponse {
  return Boolean(value) && typeof value === 'object' && typeof (value as ExternalSignerResponse).signedTransaction === 'string';
}

/**
 * @name createExternalSignerHeaders
 * @description Builds HTTP headers for external signer requests without exposing bearer tokens in logs.
 */
function createExternalSignerHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const authToken = process.env.SAP_EXTERNAL_SIGNER_AUTH_TOKEN;
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  return headers;
}

/**
 * Create external signer
 *
 * Implements HTTP-based external signing service protocol.
 * The public key is fetched from the signer service at initialization time
 * via a GET request to the same endpoint. If the service does not support
 * key retrieval, the caller must provide it separately.
 */
export async function createExternalSigner(externalSignerUrl: string): Promise<Signer> {
  logger.info('Creating external signer', { url: externalSignerUrl });

  // Attempt to fetch the public key from the signer service
  let publicKey: PublicKey;
  try {
    const response = await fetch(externalSignerUrl, {
      method: 'GET',
      headers: createExternalSignerHeaders(),
    });

    if (response.ok) {
      const result: unknown = await response.json();
      if (isPlainObject(result) && typeof result.publicKey === 'string') {
        publicKey = new PublicKey(result.publicKey);
        logger.info('External signer public key fetched', { publicKey: publicKey.toBase58() });
      } else {
        throw new Error('External signer did not return a valid publicKey field');
      }
    } else {
      throw new Error(`External signer key retrieval failed: ${response.status} ${await response.text()}`);
    }
  } catch (error) {
    logger.error('Failed to fetch external signer public key', { error });
    throw new Error(
      `Cannot initialize external signer: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
      'The signer service must respond to GET with a JSON body containing "publicKey".'
    );
  }

  const signer: Signer = {
    publicKey,
    
    async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
      logger.debug('Signing transaction via external signer', { url: externalSignerUrl });
      
      // Call external signing service
      const response = await fetch(externalSignerUrl, {
        method: 'POST',
        headers: createExternalSignerHeaders(),
        body: JSON.stringify({
          action: 'signTransaction',
          transaction: serializeForExternalSigner(tx),
        }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        logger.error('External signer failed', { status: response.status, error });
        throw new Error(`External signer failed: ${error}`);
      }
      
      const result: unknown = await response.json();
      if (!isExternalSignerResponse(result)) {
        throw new Error('External signer returned an invalid response');
      }
      
      // Parse signed transaction
      const signedBytes = Buffer.from(result.signedTransaction, 'base64');
      const signedTx = tx.constructor.name === 'Transaction' 
        ? Transaction.from(signedBytes) as T
        : VersionedTransaction.deserialize(signedBytes) as T;

      return signedTx;
    },
    
    async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
      logger.debug('Signing all transactions via external signer', { count: txs.length });

      const signed: T[] = [];
      for (const tx of txs) {
        const signedTx = await this.signTransaction(tx);
        signed.push(signedTx);
      }
      return signed;
    },
  };

  return signer;
}
