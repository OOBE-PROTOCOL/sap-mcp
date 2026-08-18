import { describe, expect, it } from 'vitest';
import { BUILTIN_TOOL_MODULES } from './builtin-tool-modules.js';
import {
  buildToolModulePolicyCatalog,
  classifyToolIntent,
  getToolExecutionMetadata,
  localSignerEquivalent,
} from './tool-execution-metadata.js';

describe('tool execution metadata', () => {
  it('classifies local payment bridge, builders, writes, and reads', () => {
    expect(classifyToolIntent('sap_payments_call_paid_tool')).toBe('local-payment-bridge');
    expect(classifyToolIntent('sap_sns_build_manage_record_transaction')).toBe('unsigned-transaction-builder');
    expect(classifyToolIntent('sap_register_agent')).toBe('local-signer-write');
    expect(classifyToolIntent('sap_get_agent_profile')).toBe('read-discovery');
  });

  it('describes local signer equivalents and hosted blocking consistently', () => {
    const metadata = getToolExecutionMetadata('sap_sign_transaction', 'Sign Transaction');

    expect(metadata.paymentTier).toBe('value-action');
    expect(metadata.writeOperation).toBe(true);
    expect(metadata.hostedAccountlessBlocked).toBe(true);
    expect(metadata.localSignerEquivalent).toBe('sap_payments_finalize_transaction');
    expect(metadata.guidance.descriptionSuffix).toContain('hosted accountless write is blocked');
    expect(localSignerEquivalent('sap_escrow_build_create_transaction')).toBe('sap_payments_finalize_transaction');
  });

  it('builds policy metadata for every built-in expected tool sentinel', () => {
    const catalog = buildToolModulePolicyCatalog(BUILTIN_TOOL_MODULES);
    const expectedToolCount = BUILTIN_TOOL_MODULES.reduce((sum, module) => sum + (module.expectedTools?.length ?? 0), 0);

    expect(catalog).toHaveLength(expectedToolCount);
    expect(catalog).toEqual(expect.arrayContaining([
      expect.objectContaining({
        moduleId: 'payments-bridge-only',
        toolName: 'sap_payments_call_paid_tool',
        metadata: expect.objectContaining({
          intent: 'local-payment-bridge',
          paymentTier: 'free',
        }),
      }),
      expect.objectContaining({
        moduleId: 'sap-sdk',
        toolName: 'sap_register_agent',
        metadata: expect.objectContaining({
          hostedAccountlessBlocked: true,
          localSignerEquivalent: 'sap_payments_register_agent',
        }),
      }),
    ]));
  });
});
