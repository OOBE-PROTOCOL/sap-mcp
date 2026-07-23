import { describe, expect, it } from 'vitest';
import { privateKeyGuard } from './private-key-guard.js';

describe('privateKeyGuard', () => {
  // ── Safe payloads ─────────────────────────────────────────────────

  it('allows normal transaction data', () => {
    const result = privateKeyGuard({
      to: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA3i5k3oZq2vAES',
      amount: 1_000_000_000,
      programId: '11111111111111111111111111111111',
    });
    expect(result.safe).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('allows strings without key patterns', () => {
    const result = privateKeyGuard('transfer 1 SOL to recipient');
    expect(result.safe).toBe(true);
  });

  it('allows empty objects', () => {
    const result = privateKeyGuard({});
    expect(result.safe).toBe(true);
  });

  it('allows null', () => {
    const result = privateKeyGuard(null);
    expect(result.safe).toBe(true);
  });

  it('allows arrays of public keys', () => {
    const result = privateKeyGuard([
      '7xKXtg2CW87d97TXJSDpbD5jBkheTqA3i5k3oZq2vAES',
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    ]);
    expect(result.safe).toBe(true);
  });

  // ── secret_key ────────────────────────────────────────────────────

  it('blocks payload containing secret_key field', () => {
    const result = privateKeyGuard({
      secret_key: 'somevalue',
    });
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('private key');
  });

  it('blocks payload containing secretKey field (camelCase)', () => {
    const result = privateKeyGuard({
      secretKey: 'somevalue',
    });
    expect(result.safe).toBe(false);
  });

  it('blocks payload containing secret-key field (kebab-case)', () => {
    const result = privateKeyGuard({
      'secret-key': 'somevalue',
    });
    expect(result.safe).toBe(false);
  });

  // ── private_key ───────────────────────────────────────────────────

  it('blocks payload containing private_key field', () => {
    const result = privateKeyGuard({
      private_key: '5oBz2f4n3kz...',
    });
    expect(result.safe).toBe(false);
  });

  it('blocks payload containing privateKey field (camelCase)', () => {
    const result = privateKeyGuard({
      privateKey: '5oBz2f4n3kz...',
    });
    expect(result.safe).toBe(false);
  });

  // ── mnemonic / seed phrase ────────────────────────────────────────

  it('blocks payload containing mnemonic field', () => {
    const result = privateKeyGuard({
      mnemonic: 'abandon abandon abandon abandon abandon abandon',
    });
    expect(result.safe).toBe(false);
  });

  it('blocks payload containing seed_phrase field', () => {
    const result = privateKeyGuard({
      seed_phrase: 'abandon abandon abandon abandon',
    });
    expect(result.safe).toBe(false);
  });

  it('blocks payload containing seedPhrase field (camelCase)', () => {
    const result = privateKeyGuard({
      seedPhrase: 'abandon abandon abandon',
    });
    expect(result.safe).toBe(false);
  });

  // ── Nested objects ────────────────────────────────────────────────

  it('blocks nested objects containing private_key', () => {
    const result = privateKeyGuard({
      transaction: {
        instructions: [
          { programId: '11111111111111111111111111111111' },
          { private_key: 'leaked' },
        ],
      },
    });
    expect(result.safe).toBe(false);
  });

  it('blocks deeply nested mnemonic', () => {
    const result = privateKeyGuard({
      level1: {
        level2: {
          level3: {
            mnemonic: 'secret words here',
          },
        },
      },
    });
    expect(result.safe).toBe(false);
  });

  // ── Arrays containing key material ────────────────────────────────

  it('blocks arrays containing objects with secret_key', () => {
    const result = privateKeyGuard([
      { address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA3i5k3oZq2vAES' },
      { secret_key: 'exposed' },
    ]);
    expect(result.safe).toBe(false);
  });

  // ── Edge cases ────────────────────────────────────────────────────

  it('allows numbers', () => {
    const result = privateKeyGuard(42);
    expect(result.safe).toBe(true);
  });

  it('allows booleans', () => {
    const result = privateKeyGuard(true);
    expect(result.safe).toBe(true);
  });

  it('allows undefined', () => {
    const result = privateKeyGuard(undefined);
    expect(result.safe).toBe(true);
  });

  it('blocks string containing "private_key" substring', () => {
    const result = privateKeyGuard('user_private_key_backup');
    expect(result.safe).toBe(false);
  });

  it('blocks string containing "mnemonic" substring', () => {
    const result = privateKeyGuard('my_mnemonic_for_wallet');
    expect(result.safe).toBe(false);
  });
});