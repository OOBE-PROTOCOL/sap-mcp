/**
 * @name preflight-validation.test
 * @description Unit tests for pre-payment wallet parameter validation: malformed
 * addresses must be rejected before the x402 paywall charges the client.
 */

import { describe, expect, it } from 'vitest';
import { evaluatePrePaymentValidation } from './preflight-validation.js';
import type { ParsedMcpRequest } from './json-rpc.js';

const FULL_KEY = '4emrGb1fhQk8bQqheXhnFXxWT8XxwHCiC1zECc1FXVYD';

function makeRequest(
  toolName: string,
  args: Record<string, unknown>,
): ParsedMcpRequest {
  return {
    requests: [],
    toolCalls: [{ id: 1, toolName, arguments: args }],
    methods: ['tools/call'],
    isBatch: false,
  };
}

function firstInvalidReason(
  failure: ReturnType<typeof evaluatePrePaymentValidation>,
): string {
  return Object.values(failure?.data.invalidParams ?? {})[0] ?? '';
}

describe('evaluatePrePaymentValidation', () => {
  it('passes full base58 wallet addresses through without rejection', () => {
    const failure = evaluatePrePaymentValidation(
      makeRequest('sap_phoenix_build_register_trader', { authority: FULL_KEY, maxPositions: 8 }),
    );
    expect(failure).toBeUndefined();
  });

  it('rejects abbreviated dotted addresses before payment', () => {
    const failure = evaluatePrePaymentValidation(
      makeRequest('sap_phoenix_build_register_trader', { authority: '4emrGb...XVYD' }),
    );
    expect(failure).toBeDefined();
    expect(failure?.data.paymentNotCharged).toBe(true);
    expect(failure?.data.blockedTools).toContain('sap_phoenix_build_register_trader');
    expect(firstInvalidReason(failure)).toMatch(/dots/);
  });

  it('rejects undefined-string and wrong-length addresses', () => {
    const undefinedFailure = evaluatePrePaymentValidation(
      makeRequest('sap_phoenix_get_trader', { traderAddress: 'undefined' }),
    );
    expect(firstInvalidReason(undefinedFailure)).toMatch(/undefined/);
    const shortFailure = evaluatePrePaymentValidation(
      makeRequest('sap_phoenix_get_trader', { traderAddress: '4emrGb' }),
    );
    expect(shortFailure?.data.invalidParams['sap_phoenix_get_trader.traderAddress']).toMatch(/length/);
  });

  it('leaves non-wallet params and absent params untouched', () => {
    const failure = evaluatePrePaymentValidation(
      makeRequest('sap_phoenix_get_markets', {}),
    );
    expect(failure).toBeUndefined();
  });
});
