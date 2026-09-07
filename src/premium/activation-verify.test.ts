/**
 * @file activation-verify.test.ts
 * @description Regression tests for on-chain receipt verification at activation (Finding 2 — fake receipts).
 *
 * Solking disclosure 2026-09-07: unauthenticated POST /premium/activate with
 * paymentReceipt "aaaaaaaa" returned HTTP 200 + session active because the
 * activation manager only length-checked the receipt string. Contract after
 * the fix: activation requires an injected ReceiptVerifier and FAILS CLOSED
 * when no verifier is configured (with an explicit dev escape hatch).
 *
 * @module premium/activation-verify.test
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  activatePremiumSession,
  type ReceiptVerifier,
} from '../../packages/premium/src/activation-manager.js';
import { clearAllSessions, createPremiumSessionPlan } from '../../packages/premium/src/session-manager.js';
import type { PremiumSessionRequest } from '../../packages/premium/src/types.js';

const JUPITER_ENV = 'SAP_MCP_PREMIUM_JUPITER_STREAM_URL';

function validRequest(overrides: Partial<PremiumSessionRequest> = {}): PremiumSessionRequest {
  return {
    pluginId: 'sap-premium-market-data',
    capabilityId: 'jupiter.quote.delta',
    capabilityType: 'stream',
    requestedUnits: 2,
    ttlSeconds: 120,
    ...overrides,
  };
}

function txSignature(): string {
  // 88-char base58-shaped string (real Solana signature length).
  return '4'.repeat(87) + 'A';
}

function verifier(overrides: Partial<{ valid: boolean; payer?: string; reason?: string }> = {}): ReceiptVerifier {
  return {
    verify: async () => ({ valid: overrides.valid ?? true, payer: overrides.payer ?? 'PayerVVV', reason: overrides.reason }),
  };
}

describe('activatePremiumSession — receipt verification (Finding 2 regression)', () => {
  let originalJupiterEnv: string | undefined;
  let originalEscapeHatch: string | undefined;

  beforeEach(() => {
    originalJupiterEnv = process.env[JUPITER_ENV];
    // Provider must be ready so the plan lands in pending_payment (activation path).
    process.env[JUPITER_ENV] = 'https://smoke-test-stream.example/local';
    originalEscapeHatch = process.env['SAP_MCP_ALLOW_UNVERIFIED_ACTIVATION'];
    delete process.env['SAP_MCP_ALLOW_UNVERIFIED_ACTIVATION'];
  });

  afterEach(() => {
    if (originalJupiterEnv === undefined) delete process.env[JUPITER_ENV];
    else process.env[JUPITER_ENV] = originalJupiterEnv;
    if (originalEscapeHatch === undefined) delete process.env['SAP_MCP_ALLOW_UNVERIFIED_ACTIVATION'];
    else process.env['SAP_MCP_ALLOW_UNVERIFIED_ACTIVATION'] = originalEscapeHatch;
    clearAllSessions();
  });

  it('rejects the "aaaaaaaa" fake receipt when the verifier says invalid', async () => {
    const plan = createPremiumSessionPlan(validRequest({ ttlSeconds: 3600 }));
    const result = await activatePremiumSession({
      sessionId: plan.sessionId,
      paymentReceipt: 'aaaaaaaa',
      payerAddress: 'PayerAAA',
      receiptVerifier: verifier({ valid: false, reason: 'signature_not_found_on_chain' }),
    });
    expect(result.status).toBe('rejected');
    expect(result.receiptBound).toBe(false);
    expect(result.reason).toContain('signature_not_found_on_chain');
  });

  it('fails closed when no verifier is configured', async () => {
    const plan = createPremiumSessionPlan(validRequest({ ttlSeconds: 3600 }));
    const result = await activatePremiumSession({
      sessionId: plan.sessionId,
      paymentReceipt: txSignature(),
      payerAddress: 'PayerAAA',
    });
    expect(result.status).toBe('rejected');
    expect(result.reason).toContain('receipt_verification_unavailable');
  });

  it('activates when the verifier confirms a valid settlement', async () => {
    const plan = createPremiumSessionPlan(validRequest({ ttlSeconds: 3600 }));
    const result = await activatePremiumSession({
      sessionId: plan.sessionId,
      paymentReceipt: txSignature(),
      payerAddress: 'PayerGoodWallet99999999999999999999999999',
      receiptVerifier: verifier({ valid: true, payer: 'PayerGoodWallet99999999999999999999999999' }),
    });
    expect(result.status).toBe('active');
    expect(result.receiptBound).toBe(true);
    expect(result.unitsQuota).toBe(2);
  });

  it('dev escape hatch explicitly activates without verification (logged, opt-in only)', async () => {
    process.env['SAP_MCP_ALLOW_UNVERIFIED_ACTIVATION'] = 'true';
    const plan = createPremiumSessionPlan(validRequest({ ttlSeconds: 3600 }));
    const result = await activatePremiumSession({
      sessionId: plan.sessionId,
      paymentReceipt: txSignature(),
      payerAddress: 'PayerAAA',
    });
    expect(result.status).toBe('active');
    expect(result.receiptBound).toBe(true);
  });

  it('returns rejected when the verifier throws', async () => {
    const plan = createPremiumSessionPlan(validRequest({ ttlSeconds: 3600 }));
    const result = await activatePremiumSession({
      sessionId: plan.sessionId,
      paymentReceipt: txSignature(),
      payerAddress: 'PayerAAA',
      receiptVerifier: {
        verify: async () => { throw new Error('rpc unavailable'); },
      },
    });
    expect(result.status).toBe('rejected');
    expect(result.reason).toContain('receipt_verification_error');
  });

  it('still rejects structurally invalid receipts before calling the verifier', async () => {
    let verifierCalled = false;
    const plan = createPremiumSessionPlan(validRequest({ ttlSeconds: 3600 }));
    const result = await activatePremiumSession({
      sessionId: plan.sessionId,
      paymentReceipt: 'short',
      payerAddress: 'PayerAAA',
      receiptVerifier: { verify: async () => { verifierCalled = true; return { valid: true }; } },
    });
    expect(result.status).toBe('rejected');
    expect(verifierCalled).toBe(false);
  });

  it('still refuses activation of a non-pending session (already active)', async () => {
    const plan = createPremiumSessionPlan(validRequest({ ttlSeconds: 3600 }));
    const first = await activatePremiumSession({
      sessionId: plan.sessionId,
      paymentReceipt: txSignature(),
      receiptVerifier: verifier({ valid: true }),
    });
    expect(first.status).toBe('active');

    const again = await activatePremiumSession({
      sessionId: plan.sessionId,
      paymentReceipt: txSignature(),
      receiptVerifier: verifier({ valid: true }),
    });
    expect(again.status).toBe('active');
    expect(again.reason).toContain('already active');
  });
});