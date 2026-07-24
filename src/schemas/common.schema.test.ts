import { describe, expect, it } from 'vitest';
import {
  WalletSchema,
  PublicKeySchema,
  SignatureSchema,
  PdaSchema,
  PaginationSchema,
  AmountSchema,
  SolAmountSchema,
} from './common.schema.js';

describe('common Zod schemas', () => {
  describe('WalletSchema', () => {
    it('accepts valid base58 strings', () => {
      expect(WalletSchema.parse('5YZ52z7ZXPfKQpDtkkg8nMGvWtJywB7vANyAqrCwczs7')).toBe(
        '5YZ52z7ZXPfKQpDtkkg8nMGvWtJywB7vANyAqrCwczs7',
      );
    });

    it('rejects non-string values', () => {
      expect(() => WalletSchema.parse(123)).toThrow();
    });
  });

  describe('PublicKeySchema', () => {
    it('accepts valid base58 strings', () => {
      expect(PublicKeySchema.parse('11111111111111111111111111111111')).toBe(
        '11111111111111111111111111111111',
      );
    });

    it('rejects non-string values', () => {
      expect(() => PublicKeySchema.parse(null)).toThrow();
    });
  });

  describe('SignatureSchema', () => {
    it('accepts valid base58 strings', () => {
      const sig = '2q2PjMq5kQxv3R8NwYpL6vZ1tHfJ4dEsCgUbWiNmVeYkAjXrZ7Mq5pSo9y3VnW8L1aRbFcHdG';
      expect(SignatureSchema.parse(sig)).toBe(sig);
    });

    it('rejects non-string values', () => {
      expect(() => SignatureSchema.parse(true)).toThrow();
    });
  });

  describe('PdaSchema', () => {
    it('accepts valid base58 strings', () => {
      const pda = 'BPFa5a7TrVwZY9LTf8h2fA6q2rL3xZ7WdK4mNpQsR8vT1uYx';
      expect(PdaSchema.parse(pda)).toBe(pda);
    });

    it('rejects non-string values', () => {
      expect(() => PdaSchema.parse([])).toThrow();
    });
  });

  describe('PaginationSchema', () => {
    it('provides defaults (limit=50, offset=0)', () => {
      expect(PaginationSchema.parse({})).toEqual({ limit: 50, offset: 0 });
    });

    it('accepts explicit limit and offset', () => {
      expect(PaginationSchema.parse({ limit: 10, offset: 20 })).toEqual({ limit: 10, offset: 20 });
    });

    it('rejects non-number limit', () => {
      expect(() => PaginationSchema.parse({ limit: 'abc' })).toThrow();
    });
  });

  describe('AmountSchema', () => {
    it('accepts positive amounts', () => {
      expect(AmountSchema.parse(1000)).toBe(1000);
      expect(AmountSchema.parse(0.5)).toBe(0.5);
    });

    it('rejects zero', () => {
      expect(() => AmountSchema.parse(0)).toThrow();
    });

    it('rejects negative amounts', () => {
      expect(() => AmountSchema.parse(-1)).toThrow();
    });
  });

  describe('SolAmountSchema', () => {
    it('accepts positive amounts', () => {
      expect(SolAmountSchema.parse(1.5)).toBe(1.5);
    });

    it('accepts zero', () => {
      expect(SolAmountSchema.parse(0)).toBe(0);
    });

    it('rejects negative amounts', () => {
      expect(() => SolAmountSchema.parse(-0.5)).toThrow();
    });
  });
});