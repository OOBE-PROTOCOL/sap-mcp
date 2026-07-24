import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { PublicKey } from '@solana/web3.js';
import type {
  Signer,
  SignerMode,
  SignerConfig,
  SignerResult,
} from './signer-types.js';

describe('signer type definitions', () => {
  describe('SignerMode', () => {
    it('accepts all valid signer mode values', () => {
      const modes: SignerMode[] = ['none', 'local-keypair', 'external', 'delegated'];

      expect(modes).toHaveLength(4);
      expect(modes).toContain('none');
      expect(modes).toContain('local-keypair');
      expect(modes).toContain('external');
      expect(modes).toContain('delegated');
    });

    it('is a union of the four expected string literals', () => {
      expectTypeOf<SignerMode>().toEqualTypeOf<'none' | 'local-keypair' | 'external' | 'delegated'>();
    });
  });

  describe('SignerConfig', () => {
    it('can be constructed with mode only (none)', () => {
      const config: SignerConfig = { mode: 'none' };

      expect(config.mode).toBe('none');
      expect(config.walletPath).toBeUndefined();
      expect(config.externalSignerUrl).toBeUndefined();
      expect(config.delegatedSession).toBeUndefined();
    });

    it('can be constructed with mode and walletPath (local-keypair)', () => {
      const config: SignerConfig = {
        mode: 'local-keypair',
        walletPath: '/home/user/.config/solana/id.json',
      };

      expect(config.mode).toBe('local-keypair');
      expect(config.walletPath).toBe('/home/user/.config/solana/id.json');
    });

    it('can be constructed with mode and externalSignerUrl (external)', () => {
      const config: SignerConfig = {
        mode: 'external',
        externalSignerUrl: 'https://signer.example.com',
      };

      expect(config.mode).toBe('external');
      expect(config.externalSignerUrl).toBe('https://signer.example.com');
    });

    it('can be constructed with delegated session (delegated)', () => {
      const config: SignerConfig = {
        mode: 'delegated',
        delegatedSession: {
          sessionId: 'sess-001',
          agentId: 'agent-001',
          permissions: ['transaction:submit'],
          spendingLimits: {
            maxPerTransactionSol: 0.5,
            maxPerDaySol: 5,
            maxPerSessionSol: 20,
            remainingSessionSol: 19.5,
          },
          expiresAt: 1800000000,
          createdAt: 1700000000,
        },
      };

      expect(config.mode).toBe('delegated');
      expect(config.delegatedSession?.sessionId).toBe('sess-001');
    });

    it('has correct field types', () => {
      expectTypeOf<SignerConfig>().toMatchTypeOf<{
        mode: SignerMode;
        walletPath?: string;
        externalSignerUrl?: string;
      }>();
    });
  });

  describe('SignerResult', () => {
    it('can be constructed with mode only (no signer)', () => {
      const result: SignerResult = { mode: 'none' };

      expect(result.mode).toBe('none');
      expect(result.signer).toBeUndefined();
      expect(result.publicKey).toBeUndefined();
    });

    it('can be constructed with signer and publicKey', () => {
      const mockSigner: Signer = {
        publicKey: '5YZ52z7ZXPfKQpDtkkg8nMGvWtJywB7vANyAqrCwczs7' as unknown as PublicKey,
        signTransaction: vi.fn() as never,
        signAllTransactions: vi.fn() as never,
      };

      const result: SignerResult = {
        signer: mockSigner,
        mode: 'local-keypair',
        publicKey: '5YZ52z7ZXPfKQpDtkkg8nMGvWtJywB7vANyAqrCwczs7',
      };

      expect(result.mode).toBe('local-keypair');
      expect(result.publicKey).toBe('5YZ52z7ZXPfKQpDtkkg8nMGvWtJywB7vANyAqrCwczs7');
    });

    it('has correct field types', () => {
      expectTypeOf<SignerResult>().toMatchTypeOf<{
        signer?: Signer;
        mode: SignerMode;
        publicKey?: string;
      }>();
    });
  });

  describe('Signer', () => {
    it('has the correct interface shape', () => {
      expectTypeOf<Signer>().toMatchTypeOf<{
        publicKey: PublicKey;
        signTransaction: (tx: unknown) => Promise<unknown>;
        signAllTransactions: (txs: unknown[]) => Promise<unknown[]>;
      }>();
    });
  });
});