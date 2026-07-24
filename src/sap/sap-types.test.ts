import { describe, expect, expectTypeOf, it } from 'vitest';
import type { PublicKey } from '@solana/web3.js';
import type {
  SapAgent,
  SapAgentStats,
  SapEscrow,
  SapVault,
  SapTool,
} from './sap-types.js';

describe('SAP type definitions', () => {
  describe('SapAgent', () => {
    it('can be constructed with all required fields', () => {
      const agent: SapAgent = {
        wallet: '5YZ52z7ZXPfKQpDtkkg8nMGvWtJywB7vANyAqrCwczs7' as unknown as PublicKey,
        pda: 'BPFa5a7TrVwZY9LTf8h2fA6q2rL3xZ7WdK4mNpQsR8vT1uYx' as unknown as PublicKey,
        name: 'test-agent',
        capabilities: ['registry:read', 'registry:write'],
        isActive: true,
        registeredAt: 1700000000,
      };

      expect(agent.name).toBe('test-agent');
      expect(agent.capabilities).toHaveLength(2);
      expect(agent.isActive).toBe(true);
      expect(agent.registeredAt).toBe(1700000000);
    });

    it('supports optional metadataUri and x402Endpoint', () => {
      const agent: SapAgent = {
        wallet: '5YZ52z7ZXPfKQpDtkkg8nMGvWtJywB7vANyAqrCwczs7' as unknown as PublicKey,
        pda: 'BPFa5a7TrVwZY9LTf8h2fA6q2rL3xZ7WdK4mNpQsR8vT1uYx' as unknown as PublicKey,
        name: 'full-agent',
        capabilities: [],
        metadataUri: 'https://example.com/metadata.json',
        x402Endpoint: 'https://example.com/x402',
        isActive: true,
        registeredAt: 1700000000,
      };

      expect(agent.metadataUri).toBe('https://example.com/metadata.json');
      expect(agent.x402Endpoint).toBe('https://example.com/x402');
    });

    it('has correct field types', () => {
      expectTypeOf<SapAgent>().toMatchTypeOf<{
        wallet: PublicKey;
        pda: PublicKey;
        name: string;
        capabilities: string[];
        isActive: boolean;
        registeredAt: number;
      }>();
    });
  });

  describe('SapAgentStats', () => {
    it('can be constructed with all fields', () => {
      const stats: SapAgentStats = {
        totalCalls: 100,
        totalEarnings: 5000,
        reputationScore: 4.8,
        feedbackCount: 25,
        averageRating: 4.7,
      };

      expect(stats.totalCalls).toBe(100);
      expect(stats.reputationScore).toBe(4.8);
      expect(stats.averageRating).toBe(4.7);
    });

    it('has correct field types', () => {
      expectTypeOf<SapAgentStats>().toMatchTypeOf<{
        totalCalls: number;
        totalEarnings: number;
        reputationScore: number;
        feedbackCount: number;
        averageRating: number;
      }>();
    });
  });

  describe('SapEscrow', () => {
    it('can be constructed with all fields', () => {
      const escrow: SapEscrow = {
        pda: 'BPFa5a7TrVwZY9LTf8h2fA6q2rL3xZ7WdK4mNpQsR8vT1uYx' as unknown as PublicKey,
        depositor: '5YZ52z7ZXPfKQpDtkkg8nMGvWtJywB7vANyAqrCwczs7' as unknown as PublicKey,
        agent: '11111111111111111111111111111111' as unknown as PublicKey,
        balance: 10000,
        pricePerCall: 100,
        maxCalls: 100,
        callsRemaining: 75,
        expiresAt: 1800000000,
        isActive: true,
      };

      expect(escrow.balance).toBe(10000);
      expect(escrow.callsRemaining).toBe(75);
      expect(escrow.isActive).toBe(true);
    });

    it('has correct field types', () => {
      expectTypeOf<SapEscrow>().toMatchTypeOf<{
        pda: PublicKey;
        depositor: PublicKey;
        agent: PublicKey;
        balance: number;
        pricePerCall: number;
        maxCalls: number;
        callsRemaining: number;
        expiresAt: number;
        isActive: boolean;
      }>();
    });
  });

  describe('SapVault', () => {
    it('can be constructed with all fields', () => {
      const vault: SapVault = {
        pda: 'BPFa5a7TrVwZY9LTf8h2fA6q2rL3xZ7WdK4mNpQsR8vT1uYx' as unknown as PublicKey,
        agent: '5YZ52z7ZXPfKQpDtkkg8nMGvWtJywB7vANyAqrCwczs7' as unknown as PublicKey,
        nonce: new Uint8Array([1, 2, 3]),
        totalInscriptions: 42,
        currentEpoch: 1,
      };

      expect(vault.totalInscriptions).toBe(42);
      expect(vault.nonce).toBeInstanceOf(Uint8Array);
    });
  });

  describe('SapTool', () => {
    it('can be constructed with all fields', () => {
      const tool: SapTool = {
        pda: 'BPFa5a7TrVwZY9LTf8h2fA6q2rL3xZ7WdK4mNpQsR8vT1uYx' as unknown as PublicKey,
        agent: '5YZ52z7ZXPfKQpDtkkg8nMGvWtJywB7vANyAqrCwczs7' as unknown as PublicKey,
        name: 'price_oracle',
        protocolHash: new Uint8Array(32),
        descriptionHash: new Uint8Array(32),
        inputSchemaHash: new Uint8Array(32),
        outputSchemaHash: new Uint8Array(32),
        httpMethod: 'GET',
        category: 1,
        paramsCount: 3,
        requiredParams: 2,
        isCompound: false,
      };

      expect(tool.name).toBe('price_oracle');
      expect(tool.httpMethod).toBe('GET');
      expect(tool.isCompound).toBe(false);
    });
  });
});