import { mkdtempSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  createFacilitatorSigner,
  getFacilitatorSignerPublicKey,
  type OobeFacilitatorConfig,
  validateFacilitatorConfig,
} from './oobe-facilitator-server.js';

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
      expect(statSync(signerPath).mode & 0o777).toBe(0o600);
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
});
