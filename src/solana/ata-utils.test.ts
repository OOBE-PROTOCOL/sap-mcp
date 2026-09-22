import { describe, expect, it } from 'vitest';
import { Keypair } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { createAtaIdempotentIx, deriveAtaAddress } from '../../packages/solana/src/ata-utils.js';

describe('ATA utilities', () => {
  it('derives distinct ATAs for legacy SPL and Token-2022 mints', () => {
    const owner = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;

    const legacyAta = deriveAtaAddress(owner, mint, TOKEN_PROGRAM_ID);
    const token2022Ata = deriveAtaAddress(owner, mint, TOKEN_2022_PROGRAM_ID);

    expect(token2022Ata.equals(legacyAta)).toBe(false);
  });

  it('builds the Token-2022 ATA instruction with Token-2022 in its account list', () => {
    const payer = Keypair.generate().publicKey;
    const owner = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;
    const instruction = createAtaIdempotentIx(payer, owner, mint, TOKEN_2022_PROGRAM_ID);

    expect(instruction.keys[1]?.pubkey.equals(deriveAtaAddress(owner, mint, TOKEN_2022_PROGRAM_ID))).toBe(true);
    expect(instruction.keys[5]?.pubkey.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
  });
});
