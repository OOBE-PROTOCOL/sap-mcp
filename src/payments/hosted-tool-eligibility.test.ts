import { describe, expect, it } from 'vitest';
import { parseJsonRpcBody } from './json-rpc.js';
import { evaluateHostedToolEligibility, isHostedAccountlessBlockedTool } from './hosted-tool-eligibility.js';

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
      'sap_submit_signed_transaction',
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
});
