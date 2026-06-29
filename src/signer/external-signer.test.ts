import { Keypair } from '@solana/web3.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExternalSigner } from './external-signer.js';

const originalExternalSignerAuthToken = process.env.SAP_EXTERNAL_SIGNER_AUTH_TOKEN;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalExternalSignerAuthToken === undefined) {
    delete process.env.SAP_EXTERNAL_SIGNER_AUTH_TOKEN;
  } else {
    process.env.SAP_EXTERNAL_SIGNER_AUTH_TOKEN = originalExternalSignerAuthToken;
  }
});

describe('external signer client', () => {
  it('sends bearer auth while fetching the signer public key', async () => {
    const publicKey = Keypair.generate().publicKey.toBase58();
    process.env.SAP_EXTERNAL_SIGNER_AUTH_TOKEN = 'local-token';

    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ publicKey }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const signer = await createExternalSigner('http://127.0.0.1:8765/sign/operator');

    expect(signer.publicKey.toBase58()).toBe(publicKey);
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8765/sign/operator', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer local-token',
      },
    });
  });
});
