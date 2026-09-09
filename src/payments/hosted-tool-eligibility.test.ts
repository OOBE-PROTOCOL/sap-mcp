import { describe, expect, it } from 'vitest';
import { parseJsonRpcBody } from './json-rpc.js';
import {
  evaluateHostedToolEligibility,
  isHostedAccountlessBlockedTool,
  recommendedToolsForBlockedTools,
} from './hosted-tool-eligibility.js';

describe('hosted accountless tool eligibility', () => {
  it('blocks local-signer writes before x402 payment on hosted accountless servers', () => {
    for (const toolName of [
      'sap_register_agent',
      'sap_sns_register_agent_domain',
      'sap_sign_transaction',
      'jupiter_swap',
      'jupiter_executeOrder',
      'spl-token_transfer',
      'metaplex-nft_mintNFT',
      'bridging_bridgeWormhole',
      'raydium-pools_addLiquidity',
    ]) {
      expect(isHostedAccountlessBlockedTool(toolName), toolName).toBe(true);
    }
  });

  it('allows reads and hosted-safe unsigned builders', () => {
    for (const toolName of [
      'sap_sns_check_domain',
      'sol_get_balance',
      'spl-token_getTokenAccounts',
      'jupiter_getQuote',
      'jupiter_getOrder',
      'jupiter_swapInstructions',
      'magicblock_swap',
      'sap_sns_build_manage_record_transaction',
      'sap_escrow_build_create_transaction',
      'sap_escrow_build_deposit_transaction',
      'sap_escrow_build_settle_transaction',
      'sap_escrow_build_finalize_transaction',
      'sap_escrow_build_withdraw_transaction',
      'sap_escrow_build_close_transaction',
      'sap_submit_signed_transaction',
      'sap_build_agent_register_transaction',
      'sap_build_agent_update_transaction',
      'sap_build_agent_lifecycle_transaction',
    ]) {
      expect(isHostedAccountlessBlockedTool(toolName), toolName).toBe(false);
    }
  });

  it('returns a no-charge JSON-RPC error payload for blocked hosted tools', () => {
    const parsed = parseJsonRpcBody({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'sap_register_agent',
        arguments: { name: 'Solking' },
      },
    });

    const failure = evaluateHostedToolEligibility(parsed, {
      mode: 'hosted-api',
      walletPath: undefined,
      externalSignerUrl: undefined,
    });

    expect(failure?.message).toBe('hosted_local_signer_required');
    expect(failure?.data.paymentNotCharged).toBe(true);
    expect(failure?.data.blockedTools).toEqual(['sap_register_agent']);
  });

  it('routes registry-write failures to the hosted registry builders so hosted-only agents can complete registration', () => {
    const recommended = recommendedToolsForBlockedTools(['sap_register_agent']);

    expect(recommended).toEqual([
      'sap_build_agent_register_transaction',
      'sap_build_agent_update_transaction',
      'sap_build_agent_lifecycle_transaction',
      'sap_payments_finalize_transaction',
      'sap_submit_signed_transaction',
      'sap_agent_identity_plan',
      'sap_payments_readiness',
      'sap_payments_call_paid_tool',
    ]);
  });

  it('routes update-agent failures to the update builder first', () => {
    const recommended = recommendedToolsForBlockedTools(['sap_update_agent']);

    expect(recommended[0]).toBe('sap_build_agent_update_transaction');
    expect(recommended).toContain('sap_payments_finalize_transaction');
  });

  it('keeps the generic builder route for non-registry blocked tools', () => {
    const recommended = recommendedToolsForBlockedTools(['jupiter_swap']);

    expect(recommended).not.toContain('sap_build_agent_register_transaction');
    expect(recommended).toContain('sap_payments_finalize_transaction');
    expect(recommended).toContain('sap_payments_call_paid_tool');
  });

  it('mentions the hosted registry-builder flow in the error payload for sap_register_agent', () => {
    const parsed = parseJsonRpcBody({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'sap_register_agent',
        arguments: { name: 'Solking' },
      },
    });

    const failure = evaluateHostedToolEligibility(parsed, {
      mode: 'hosted-api',
      walletPath: undefined,
      externalSignerUrl: undefined,
    });

    expect(failure?.data.recommendedTools).toContain('sap_build_agent_register_transaction');
    expect(failure?.data.recommendedFlow).toContain('sap_build_agent_register_transaction');
  });
});