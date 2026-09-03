import { describe, expect, it } from 'vitest';

/**
 * Regression tests for the Phoenix onboarding builder contract.
 *
 * RegisterTrader alone leaves the trader FROZEN with flags=6 (limit+market
 * only) — deposit simulates CapabilityDenied. Activation requires the
 * delegated onboarding flow whose instructions come from Phoenix's API and
 * whose submission MUST go through send-register-ixs (Phoenix co-signs with
 * its onboarder). These tests pin the request/response contract against the
 * live API shapes observed on perp-api.phoenix.trade.
 */

// Fetch stubs below return plain literals matching the Response subset used.

const LIVE_BUILD_RESPONSE = {
  instructions: [
    {
      programId: 'EtrnLzgbS7nMMy5fbD42kXiUzGg8XQzJ972Xtk1cjWih',
      keys: [
        { pubkey: 'EzkM8YbCkBLaCqX2cdxtMyxfTLpKui3mWQWnhe5w2P4Z', isSigner: true, isWritable: false },
        { pubkey: '5vPU3rVCMRq8qjv5teTaveFnHZcBp5VACFXYhtGVLZwB', isSigner: false, isWritable: true },
      ],
      data: [207, 170, 17, 21, 53, 35, 88, 151, 6, 0, 0, 0, 0, 1, 1, 1, 3, 1, 2, 1, 4, 1, 5, 1],
    },
  ],
  traderPda: '5vPU3rVCMRq8qjv5teTaveFnHZcBp5VACFXYhtGVLZwB',
  traderOnboarder: 'EzkM8YbCkBLaCqX2cdxtMyxfTLpKui3mWQWnhe5w2P4Z',
  txFeePayer: '4emrGb1fhQk8bQqheXhnFXxWT8XxwHCiC1zECc1FXVYD',
  maxPositions: 128,
  includeRegisterTrader: false,
};

const AUTHORITY = '4emrGb1fhQk8bQqheXhnFXxWT8XxwHCiC1zECc1FXVYD';

async function withFetch(stub: FetchFetch, fn: () => Promise<unknown>): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = stub as unknown as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
  }
}
type FetchFetch = FetchFetchAlias;
type FetchFetchAlias = FetchFetchBase;
interface FetchFetchBase {
  (url: string, init?: { method?: string; body?: string }): Promise<{
    ok: boolean;
    status: number;
    text: () => Promise<string>;
    json: () => Promise<unknown>;
  }>;
}

describe('Phoenix onboarding builders (regression)', () => {
  it('build forwards authority+feePayer to build-register-ixs and echoes activation gates', async () => {
    const { buildOnboardInstructions } = await import('./phoenix-builder-onboarding.js');
    const calls: Array<{ url: string; body: unknown }> = [];
    await withFetch(async (url, init) => {
      calls.push({ url, body: JSON.parse(init?.body ?? '{}') });
      return { ok: true, status: 200, text: async () => '', json: async () => LIVE_BUILD_RESPONSE };
    }, async () => {
      const result = await buildOnboardInstructions({
        traderAuthority: AUTHORITY,
        txFeePayer: AUTHORITY,
        maxPositions: 128,
      });
      expect(result.traderPda).toBe(LIVE_BUILD_RESPONSE.traderPda);
      expect(result.traderOnboarder).toBe(LIVE_BUILD_RESPONSE.traderOnboarder);
      expect(result.includeRegisterTrader).toBe(false);
      // The response MUST carry the co-sign gating markers.
      expect(result.requiresPhoenixApiSubmit).toBe(true);
      expect(result.nextTool).toBe('sap_phoenix_submit_onboard_trader');
      expect(result.safeToApprove).toBe(true);
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/v1/exchange/build-register-ixs');
    expect(calls[0].body).toEqual({ traderAuthority: AUTHORITY, txFeePayer: AUTHORITY, maxPositions: 128 });
  });

  it('build rejects abbreviated addresses before any network call', async () => {
    const { buildOnboardInstructions } = await import('./phoenix-builder-onboarding.js');
    await expect(buildOnboardInstructions({
      traderAuthority: '4emrGb...XVYD',
      txFeePayer: AUTHORITY,
    })).rejects.toThrow(/dots|FULL/);
  });

  it('build rejects maxPositions outside 32-128', async () => {
    const { buildOnboardInstructions } = await import('./phoenix-builder-onboarding.js');
    await expect(buildOnboardInstructions({
      traderAuthority: AUTHORITY,
      txFeePayer: AUTHORITY,
      maxPositions: 8,
    })).rejects.toThrow(/between 32 and 128/);
  });

  it('submit proxies the signed transaction to send-register-ixs and returns the signature', async () => {
    const { submitOnboardTransaction } = await import('./phoenix-builder-onboarding.js');
    const calls: Array<{ url: string; body: unknown }> = [];
    await withFetch(async (url, init) => {
      calls.push({ url, body: JSON.parse(init?.body ?? '{}') });
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ signature: '5T9x…sig', traderPda: LIVE_BUILD_RESPONSE.traderPda, includeRegisterTrader: false }),
      };
    }, async () => {
      const result = await submitOnboardTransaction({
        transaction: 'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAIAAAQ',
        traderAuthority: AUTHORITY,
        txFeePayer: AUTHORITY,
      });
      expect(result.success).toBe(true);
      expect(result.signature).toBeTruthy();
      expect(result.verification).toContain('sap_phoenix_get_trader_state');
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/v1/exchange/send-register-ixs');
    expect((calls[0].body as Record<string, unknown>).traderAuthority).toBe(AUTHORITY);
  });

  it('submit surfaces Phoenix API errors with status and body', async () => {
    const { submitOnboardTransaction } = await import('./phoenix-builder-onboarding.js');
    await withFetch(async () => ({
      ok: false,
      status: 400,
      text: async () => '{"error":"invalid transaction"}',
      json: async () => ({}),
    }), async () => {
      await expect(submitOnboardTransaction({
        transaction: 'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAIAAAQ',
        traderAuthority: AUTHORITY,
        txFeePayer: AUTHORITY,
      })).rejects.toThrow(/400.*invalid transaction/);
    });
  });

  it('submit rejects empty and truncated transaction payloads', async () => {
    const { submitOnboardTransaction } = await import('./phoenix-builder-onboarding.js');
    await expect(submitOnboardTransaction({
      transaction: '',
      traderAuthority: AUTHORITY,
      txFeePayer: AUTHORITY,
    })).rejects.toThrow(/transaction is required/);
    await expect(submitOnboardTransaction({
      transaction: 'AQAA… (+492 chars)',
      traderAuthority: AUTHORITY,
      txFeePayer: AUTHORITY,
    })).rejects.toThrow(/truncated/);
  });
});