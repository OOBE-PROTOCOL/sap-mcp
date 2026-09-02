/**
 * @name phoenix-constants.test
 * @description Regression guard: the Phoenix program ID must be a real on-chain
 * base58 pubkey. A placeholder like 'PhoenixV1' made every Phoenix builder throw
 * "Invalid public key input" at new PublicKey(programId).
 */

import { describe, expect, it } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { PHOENIX_PROGRAM_ID } from './phoenix-constants.js';

describe('PHOENIX_PROGRAM_ID', () => {
  it('is a valid on-chain base58 public key', () => {
    expect(() => new PublicKey(PHOENIX_PROGRAM_ID)).not.toThrow();
    expect(PHOENIX_PROGRAM_ID).not.toBe('PhoenixV1');
  });
});
