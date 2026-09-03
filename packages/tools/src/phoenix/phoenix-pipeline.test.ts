import { describe, expect, it } from 'vitest';
import {
  Keypair,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  TransactionMessage,
} from '@solana/web3.js';
import { compactPhoenixResponse } from './phoenix-pipeline.js';

/**
 * Regression tests for the Phoenix response compaction contract.
 *
 * compactPhoenixResponse exists to keep market-data payloads from exploding
 * MCP client context, but builder tools return unsigned Solana transactions
 * as their PRODUCT — truncating `transactionBase64` (compactValue's
 * 500-char cap did) breaks every browser finalize/preview flow: the client
 * rejects the "… (+492 chars)" string as an invalid transaction and users
 * see "Phoenix did not return an unsigned deposit transaction".
 */

/** Builds a REAL unsigned legacy transaction (like the builders return). */
function makeRealLegacyTransactionBase64(): string {
  const payer = Keypair.generate();
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: Keypair.generate().publicKey,
      lamports: 1_000,
    }),
  );
  tx.recentBlockhash = Keypair.generate().publicKey.toBase58(); // deterministic filler
  tx.feePayer = payer.publicKey;
  // Serialize WITHOUT signing: the wire shape builders emit.
  const serialized = tx.serializeMessage();
  return Buffer.from(serialized).toString('base64');
}

/** Builds a REAL unsigned v0 transaction (the modern builder shape). */
function makeRealVersionedTransactionBase64(): string {
  const payer = Keypair.generate();
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
    instructions: [
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: Keypair.generate().publicKey,
        lamports: 1_000,
      }),
    ],
  }).compileToV0Message();
  return Buffer.from(new VersionedTransaction(message).serialize()).toString('base64');
}

describe('compactPhoenixResponse — transaction preservation (regression)', () => {
  it('REGRESSION: a builder legacy transactionBase64 must survive compaction byte-for-byte', () => {
    const tx = makeRealLegacyTransactionBase64();
    const compacted = compactPhoenixResponse({
      transactionBase64: tx,
      finalizeArgs: { transactionBase64: tx, submit: true },
    });
    expect(compacted.transactionBase64).toBe(tx);
    const nested = compacted.finalizeArgs as { transactionBase64: string };
    expect(nested.transactionBase64).toBe(tx);
    expect(JSON.stringify(compacted)).not.toContain('… (+');
  });

  it('a real v0 transaction must survive compaction byte-for-byte', () => {
    const tx = makeRealVersionedTransactionBase64();
    const compacted = compactPhoenixResponse({ transactionBase64: tx });
    expect(compacted.transactionBase64).toBe(tx);
  });

  it('still truncates ordinary long strings (market data, logs)', () => {
    const longLog = 'x'.repeat(2_000);
    const compacted = compactPhoenixResponse({ someLog: longLog });
    expect(compacted.someLog).toBe(longLog.slice(0, 500) + `… (+${2_000 - 500} chars)`);
  });

  it('still truncates long base64 that is not a transaction', () => {
    const notATx = Buffer.from('hello world').toString('base64').repeat(80); // ~1160 chars
    const compacted = compactPhoenixResponse({ signature: notATx });
    expect(String(compacted.signature)).toContain('… (+');
  });

  it('keeps the 30k serialized hard cap marker for oversized market payloads', () => {
    // Array entries cap at 50, so exceed the serialized cap with many small
    // object fields instead (each stays under the 500-char string cap).
    const big = {
      markets: Array.from({ length: 50 }, (_, i) => ({
        symbol: `PERP-MKT-${i}`,
        book: {
          bids: 'y'.repeat(480),
          asks: 'y'.repeat(480),
          meta: 'z'.repeat(480),
        },
      })),
    };
    const compacted = compactPhoenixResponse(big);
    expect(compacted._truncated).toBe(true);
    expect(typeof compacted._note).toBe('string');
  });
});