import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  CreateSessionRequest,
  SessionValidationResult,
  SessionUpdate,
} from './session-types.js';

describe('session type definitions', () => {
  describe('CreateSessionRequest', () => {
    it('can be constructed with all required fields', () => {
      const request: CreateSessionRequest = {
        agentId: 'agent-001',
        permissions: ['config:read', 'registry:write', 'transaction:submit'],
        spendingLimits: {
          maxPerTransactionSol: 0.5,
          maxPerDaySol: 5,
          maxPerSessionSol: 20,
        },
      };

      expect(request.agentId).toBe('agent-001');
      expect(request.permissions).toHaveLength(3);
      expect(request.spendingLimits.maxPerTransactionSol).toBe(0.5);
      expect(request.spendingLimits.maxPerDaySol).toBe(5);
      expect(request.spendingLimits.maxPerSessionSol).toBe(20);
    });

    it('supports optional expiresInSeconds', () => {
      const request: CreateSessionRequest = {
        agentId: 'agent-002',
        permissions: ['config:read'],
        spendingLimits: {
          maxPerTransactionSol: 0.1,
          maxPerDaySol: 1,
          maxPerSessionSol: 5,
        },
        expiresInSeconds: 3600,
      };

      expect(request.expiresInSeconds).toBe(3600);
    });

    it('has correct field types', () => {
      expectTypeOf<CreateSessionRequest>().toMatchTypeOf<{
        agentId: string;
        permissions: string[];
        spendingLimits: {
          maxPerTransactionSol: number;
          maxPerDaySol: number;
          maxPerSessionSol: number;
        };
        expiresInSeconds?: number;
      }>();
    });
  });

  describe('SessionValidationResult', () => {
    it('can be constructed as valid with a session', () => {
      const result: SessionValidationResult = {
        valid: true,
        session: {
          sessionId: 'sess-001',
          agentId: 'agent-001',
          permissions: ['config:read'],
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

      expect(result.valid).toBe(true);
      expect(result.session?.sessionId).toBe('sess-001');
      expect(result.error).toBeUndefined();
    });

    it('can be constructed as invalid with an error', () => {
      const result: SessionValidationResult = {
        valid: false,
        error: 'Session expired',
      };

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Session expired');
      expect(result.session).toBeUndefined();
    });

    it('has correct field types', () => {
      expectTypeOf<SessionValidationResult>().toMatchTypeOf<{
        valid: boolean;
        session?: unknown;
        error?: string;
      }>();
    });
  });

  describe('SessionUpdate', () => {
    it('can be constructed with remainingSessionSol only', () => {
      const update: SessionUpdate = {
        remainingSessionSol: 15.5,
      };

      expect(update.remainingSessionSol).toBe(15.5);
      expect(update.permissions).toBeUndefined();
    });

    it('can be constructed with permissions only', () => {
      const update: SessionUpdate = {
        permissions: ['config:read', 'config:write'],
      };

      expect(update.permissions).toHaveLength(2);
      expect(update.remainingSessionSol).toBeUndefined();
    });

    it('can be constructed with both fields', () => {
      const update: SessionUpdate = {
        remainingSessionSol: 10,
        permissions: ['registry:read'],
      };

      expect(update.remainingSessionSol).toBe(10);
      expect(update.permissions).toEqual(['registry:read']);
    });

    it('can be constructed as empty object', () => {
      const update: SessionUpdate = {};

      expect(update.remainingSessionSol).toBeUndefined();
      expect(update.permissions).toBeUndefined();
    });
  });
});