import { describe, expect, it } from 'vitest';
import { inspectX402Receipt } from './x402-paid-call.js';

describe('x402 paid-call helpers', () => {
  it('decodes base64 JSON payment receipts', () => {
    const receipt = {
      txSignature: '5Yx8receiptSignature',
      network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    };
    const header = Buffer.from(JSON.stringify(receipt), 'utf-8').toString('base64');

    expect(inspectX402Receipt(header)).toMatchObject({
      validJson: true,
      decoded: receipt,
      txSignature: receipt.txSignature,
      network: receipt.network,
    });
  });

  it('decodes raw JSON payment receipts', () => {
    const receipt = {
      signature: '4RawReceiptSignature',
      chain: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
    };

    expect(inspectX402Receipt(JSON.stringify(receipt))).toMatchObject({
      validJson: true,
      txSignature: receipt.signature,
      network: receipt.chain,
    });
  });

  it('marks non-JSON receipt headers as invalid instead of throwing', () => {
    expect(inspectX402Receipt('not-a-json-receipt')).toMatchObject({
      validJson: false,
      decoded: 'not-a-json-receipt',
      warning: expect.stringContaining('not JSON'),
    });
  });
});
