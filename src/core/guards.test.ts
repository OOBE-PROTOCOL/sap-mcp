import { describe, expect, it } from 'vitest';
import {
  isValidMcpMode,
  isValidSignerMode,
  isValidRiskLevel,
  isValidPermission,
  isReadonlyMode,
  isWriteMode,
  requiresSigner,
  isDevMode,
  isProductionMode,
} from './guards.js';
import type { SapMcpConfig } from './types.js';

function makeConfig(mode: SapMcpConfig['mode']): SapMcpConfig {
  return {
    mode,
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    commitment: 'confirmed',
    programId: 'SAPpUhsWLJG1FkkGRcXagEDMrMsWGjbky9AyhGpFETZ',
    maxRetries: 3,
    retryDelayMs: 1000,
    walletEncrypted: false,
    externalSignerTimeoutMs: 30_000,
    enableHttp: false,
    httpPort: 8787,
    httpHost: '127.0.0.1',
    maxTxValueSol: 1,
    requireApprovalAboveSol: 0.5,
    dailyLimitSol: 100,
    allowedTools: 'all',
    logLevel: 'info',
    logFormat: 'json',
    enableMetrics: false,
    metricsPort: 9090,
    enableCache: false,
    cacheTtlSeconds: 300,
  } as unknown as SapMcpConfig;
}

describe('type guards', () => {
  describe('isValidMcpMode()', () => {
    it('returns true for every valid MCP mode', () => {
      const validModes = ['readonly', 'local-dev-keypair', 'external-signer', 'delegated-session', 'hosted-api'];
      for (const mode of validModes) {
        expect(isValidMcpMode(mode)).toBe(true);
      }
    });

    it('returns false for invalid mode strings', () => {
      expect(isValidMcpMode('read-only')).toBe(false);
      expect(isValidMcpMode('production')).toBe(false);
      expect(isValidMcpMode('LOCAL-DEV-KEYPAIR')).toBe(false);
    });

    it('returns false for empty string and whitespace', () => {
      expect(isValidMcpMode('')).toBe(false);
      expect(isValidMcpMode('  ')).toBe(false);
    });
  });

  describe('isValidSignerMode()', () => {
    it('returns true for every valid signer mode', () => {
      const validModes = ['none', 'local-keypair', 'external', 'delegated'];
      for (const mode of validModes) {
        expect(isValidSignerMode(mode)).toBe(true);
      }
    });

    it('returns false for invalid signer modes', () => {
      expect(isValidSignerMode('hardware')).toBe(false);
      expect(isValidSignerMode('local')).toBe(false);
      expect(isValidSignerMode('')).toBe(false);
    });
  });

  describe('isValidRiskLevel()', () => {
    it('returns true for every valid risk level', () => {
      const levels = ['safe', 'low', 'medium', 'high', 'critical'];
      for (const level of levels) {
        expect(isValidRiskLevel(level)).toBe(true);
      }
    });

    it('returns false for invalid risk levels', () => {
      expect(isValidRiskLevel('extreme')).toBe(false);
      expect(isValidRiskLevel('SAFE')).toBe(false);
      expect(isValidRiskLevel('')).toBe(false);
    });
  });

  describe('isValidPermission()', () => {
    it('returns true for every valid permission', () => {
      const permissions = [
        'registry:read', 'registry:write',
        'identity:read', 'identity:write',
        'reputation:read', 'reputation:write',
        'payments:read', 'payments:write',
        'settlement:read', 'settlement:write',
        'memory:read', 'memory:write',
        'transaction:submit',
      ];
      for (const perm of permissions) {
        expect(isValidPermission(perm)).toBe(true);
      }
    });

    it('returns false for invalid permissions', () => {
      expect(isValidPermission('config:read')).toBe(false);
      expect(isValidPermission('admin')).toBe(false);
      expect(isValidPermission('memory:delete')).toBe(false);
      expect(isValidPermission('')).toBe(false);
    });
  });

  describe('isReadonlyMode()', () => {
    it('returns true for readonly mode', () => {
      expect(isReadonlyMode(makeConfig('readonly'))).toBe(true);
    });

    it('returns true for hosted-api mode', () => {
      expect(isReadonlyMode(makeConfig('hosted-api'))).toBe(true);
    });

    it('returns false for write-capable modes', () => {
      expect(isReadonlyMode(makeConfig('local-dev-keypair'))).toBe(false);
      expect(isReadonlyMode(makeConfig('external-signer'))).toBe(false);
      expect(isReadonlyMode(makeConfig('delegated-session'))).toBe(false);
    });
  });

  describe('isWriteMode()', () => {
    it('returns true for write-capable modes', () => {
      expect(isWriteMode(makeConfig('local-dev-keypair'))).toBe(true);
      expect(isWriteMode(makeConfig('external-signer'))).toBe(true);
      expect(isWriteMode(makeConfig('delegated-session'))).toBe(true);
    });

    it('returns false for readonly and hosted-api', () => {
      expect(isWriteMode(makeConfig('readonly'))).toBe(false);
      expect(isWriteMode(makeConfig('hosted-api'))).toBe(false);
    });
  });

  describe('requiresSigner()', () => {
    it('returns true for local-dev-keypair and delegated-session', () => {
      expect(requiresSigner(makeConfig('local-dev-keypair'))).toBe(true);
      expect(requiresSigner(makeConfig('delegated-session'))).toBe(true);
    });

    it('returns false for readonly, external-signer, and hosted-api', () => {
      expect(requiresSigner(makeConfig('readonly'))).toBe(false);
      expect(requiresSigner(makeConfig('external-signer'))).toBe(false);
      expect(requiresSigner(makeConfig('hosted-api'))).toBe(false);
    });
  });

  describe('isDevMode()', () => {
    it('returns true only for local-dev-keypair', () => {
      expect(isDevMode(makeConfig('local-dev-keypair'))).toBe(true);
    });

    it('returns false for all other modes', () => {
      expect(isDevMode(makeConfig('readonly'))).toBe(false);
      expect(isDevMode(makeConfig('external-signer'))).toBe(false);
      expect(isDevMode(makeConfig('delegated-session'))).toBe(false);
      expect(isDevMode(makeConfig('hosted-api'))).toBe(false);
    });
  });

  describe('isProductionMode()', () => {
    it('returns true for hosted-api and external-signer', () => {
      expect(isProductionMode(makeConfig('hosted-api'))).toBe(true);
      expect(isProductionMode(makeConfig('external-signer'))).toBe(true);
    });

    it('returns false for other modes', () => {
      expect(isProductionMode(makeConfig('readonly'))).toBe(false);
      expect(isProductionMode(makeConfig('local-dev-keypair'))).toBe(false);
      expect(isProductionMode(makeConfig('delegated-session'))).toBe(false);
    });
  });
});