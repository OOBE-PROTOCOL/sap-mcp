import { mkdtempSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import type { PaymentRequirements } from '@x402/core/types';
import {
  buildFacilitatorRpcUrls,
  createFacilitatorSigner,
  getFacilitatorSignerPublicKey,
  normalizeLegacySvmPaymentRequirements,
  type OobeFacilitatorConfig,
  validateFacilitatorConfig,
} from './oobe-facilitator-server.js';
import {
  isTransientRpcError,
  parseRpcFallbackUrls,
} from './facilitator-rpc-fallback.js';

const DEVNET = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';

function tempPath(): string {
  return mkdtempSync(join(tmpdir(), 'sap-mcp-facilitator-test-'));
}

function configWith(path: string, overrides: Partial<OobeFacilitatorConfig> = {}): OobeFacilitatorConfig {
  return {
    host: '127.0.0.1',
    port: 8788,
    pathPrefix: '/facilitator',
    networks: [DEVNET],
    signerPath: path,
    rpcFallbackUrls: [],
    ...overrides,
  };
}

describe('OOBE x402 facilitator configuration', () => {
  it('creates a dedicated facilitator signer with private file permissions', () => {
    const directory = tempPath();
    const signerPath = join(directory, 'facilitator.json');

    try {
      const signer = createFacilitatorSigner(signerPath);

      expect(signer.created).toBe(true);
      expect(signer.path).toBe(signerPath);
      expect(signer.publicKey).toBe(getFacilitatorSignerPublicKey(signerPath));
      if (process.platform !== 'win32') {
        expect(statSync(signerPath).mode & 0o777).toBe(0o600);
      }
      expect(() => validateFacilitatorConfig(configWith(signerPath))).not.toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('requires bearer auth for non-loopback facilitator hosts', () => {
    const directory = tempPath();
    const signerPath = join(directory, 'facilitator.json');

    try {
      createFacilitatorSigner(signerPath);

      expect(() => validateFacilitatorConfig(configWith(signerPath, {
        host: '0.0.0.0',
      }))).toThrow(/AUTH_TOKEN/);

      expect(() => validateFacilitatorConfig(configWith(signerPath, {
        host: '0.0.0.0',
        authToken: 'strong-token',
      }))).not.toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('adds the legacy SVM maxAmountRequired alias for x402 V2 requirements', () => {
    const requirements: PaymentRequirements = {
      scheme: 'exact',
      network: DEVNET,
      asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      amount: '50000',
      payTo: '11111111111111111111111111111111',
      maxTimeoutSeconds: 120,
      extra: {},
    };

    const normalized = normalizeLegacySvmPaymentRequirements(requirements) as PaymentRequirements & {
      maxAmountRequired?: string;
    };

    expect(normalized.amount).toBe('50000');
    expect(normalized.maxAmountRequired).toBe('50000');
  });

  it('builds facilitator RPC fallback URLs with primary, configured fallbacks, and network defaults', () => {
    const urls = buildFacilitatorRpcUrls({
      networks: [DEVNET],
      rpcUrl: 'https://rpc.primary.example',
      rpcFallbackUrls: [
        'https://rpc.backup.example',
        'https://rpc.primary.example',
      ],
    });

    expect(urls).toEqual([
      'https://rpc.primary.example',
      'https://rpc.backup.example',
      'https://api.devnet.solana.com',
    ]);
  });

  it('parses fallback URLs and classifies only transient RPC errors as retryable', () => {
    expect(parseRpcFallbackUrls('https://a.example, https://b.example,https://a.example')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);

    expect(isTransientRpcError(new Error('fetch failed'))).toBe(true);
    expect(isTransientRpcError(new Error('Node is behind by 48 slots'))).toBe(true);
    expect(isTransientRpcError(new Error('Simulation failed: {"InstructionError":[1,{"Custom":1}]}'))).toBe(false);
  });
});
