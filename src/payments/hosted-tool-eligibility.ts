/**
 * @name HostedToolEligibility
 * @description Guards hosted accountless SAP MCP from charging for tools it cannot execute.
 */

import type { SapMcpConfig } from '../config/env.js';
import type { ParsedMcpRequest } from './json-rpc.js';

export interface HostedToolEligibilityFailure {
  code: number;
  message: string;
  data: {
    reason: string;
    paymentNotCharged: true;
    blockedTools: string[];
    hostedMode: 'accountless-non-custodial';
    recommendedFlow: string;
    namespaceHint?: string;
    recommendedTools: string[];
  };
}

const LOCAL_SIGNER_ONLY_EXACT_TOOLS = new Set([
  '3land_buyNFT',
  '3land_cancelListing',
  '3land_createCollection',
  '3land_listForSale',
  '3land_mintAndList',
  'adrena_addCollateral',
  'adrena_closePosition',
  'adrena_openPosition',
  'adrena_removeCollateral',
  'alldomains_registerDomain',
  'blinks_confirmAction',
  'blinks_executeAction',
  'bridging_bridgeDeBridge',
  'bridging_bridgeWormhole',
  'drift_borrow',
  'drift_closePerpPosition',
  'drift_deposit',
  'drift_lend',
  'drift_openPerpPosition',
  'drift_withdraw',
  'gibwork_createBounty',
  'gibwork_submitWork',
  'jito_sendBundle',
  'jupiter_cancelDCA',
  'jupiter_cancelLimitOrder',
  'jupiter_cancelLimitOrders',
  'jupiter_createDCA',
  'jupiter_createLimitOrder',
  'jupiter_executeDCA',
  'jupiter_executeOrder',
  'jupiter_executeTrigger',
  'jupiter_smartSwap',
  'jupiter_swap',
  'lulo_deposit',
  'lulo_withdraw',
  'manifest_cancelOrder',
  'manifest_placeLimitOrder',
  'orca_closePosition',
  'orca_collectFees',
  'orca_openPosition',
  'orca_swap',
  'pump_launchToken',
  'pump_trade',
  'send-arcade_playGame',
  'sap_sign_transaction',
  'sap_register_agent',
  'sap_update_agent',
  'sap_deactivate_agent',
  'sap_reactivate_agent',
  'sap_close_agent',
  'sap_report_calls',
  'sap_update_reputation_metrics',
  'sap_sns_register_agent_domain',
  'spl-token_burn',
  'spl-token_closeAccount',
  'spl-token_deployToken',
  'spl-token_freezeAccount',
  'spl-token_mintTo',
  'spl-token_thawAccount',
  'spl-token_transfer',
  'spl-token_transferSol',
]);

const HOSTED_ACCOUNTLESS_UNAVAILABLE_EXACT_TOOLS = new Set([
  'sap_sns_build_set_primary_domain_transaction',
]);

const LOCAL_SIGNER_ONLY_PREFIXES = [
  'sap_create_',
  'sap_deposit_',
  'sap_withdraw_',
  'sap_settle_',
  'sap_finalize_',
  'sap_file_',
  'sap_fund_',
  'sap_cancel_',
  'sap_publish_',
  'sap_update_tool',
  'sap_deactivate_tool',
  'sap_reactivate_tool',
  'sap_give_',
  'sap_revoke_',
  'sap_init_',
  'sap_open_',
  'sap_inscribe_',
  'metaplex-nft_',
  'meteora_',
  'raydium-pools_',
  'staking_',
];

const HOSTED_SAFE_PREFIXES = [
  'sap_escrow_build_',
  'sap_sns_build_',
  'sap_x402_build_',
  'sap_x402_calculate_',
  'sap_x402_estimate_',
  'sap_x402_fetch_',
  'sap_x402_get_',
  'sap_x402_has_',
  'sap_payments_',
  'sap_preview_',
  'sap_decode_',
  'sap_skills_',
  'sap_runtime_',
  'sap_profile_',
  'sap_fetch_',
  'sap_find_',
  'sap_get_',
  'sap_list_',
  'sap_discover_',
  'sap_is_',
];

const HOSTED_SAFE_EXACT_TOOLS = new Set([
  'sap_submit_signed_transaction',
  'sap_sns_check_domain',
  'sap_sns_batch_check_domains',
  'sap_sns_validate_records',
  'sap_sns_resolve_domain',
  'sap_sns_resolve_wallet',
  'sap_sns_get_domain_records',
  'sap_sns_get_record',
  'sap_sns_check_ownership',
  'sap_sns_get_domain_pda',
  'sap_sns_get_record_pda',
  'staking_getStakeAccounts',
]);

export function evaluateHostedToolEligibility(
  parsedRequest: ParsedMcpRequest,
  config: Pick<SapMcpConfig, 'mode' | 'walletPath' | 'externalSignerUrl'>,
): HostedToolEligibilityFailure | undefined {
  if (config.mode !== 'hosted-api' || config.walletPath || config.externalSignerUrl) {
    return undefined;
  }

  const blockedTools = parsedRequest.toolCalls
    .map(toolCall => toolCall.toolName)
    .filter(isHostedAccountlessBlockedTool);

  if (blockedTools.length === 0) {
    return undefined;
  }

  return {
    code: -32011,
    message: 'hosted_local_signer_required',
    data: {
      reason: 'This hosted SAP MCP server is accountless and cannot sign user-owned Solana writes. No x402 payment was charged.',
      paymentNotCharged: true,
      blockedTools: [...new Set(blockedTools)],
      hostedMode: 'accountless-non-custodial',
      recommendedFlow: 'Use local sap_payments for paid hosted calls. For write operations, use hosted unsigned builders only when the tool returns a transaction, then finalize locally with sap_payments_finalize_transaction. If no builder exists, run the direct write on the local SAP MCP profile.',
      namespaceHint: 'sap_payments_* tools live on the sap_payments MCP server, not the sap server. Use mcp__sap_payments__ prefix (e.g. mcp__sap_payments__sap_payments_readiness, mcp__sap_payments__sap_payments_call_paid_tool). If the sap_payments server is not connected, run the SAP MCP wizard repair flow and restart the MCP client.',
      recommendedTools: [
        'sap_payments_readiness',
        'sap_payments_call_paid_tool',
        'sap_payments_finalize_transaction',
        'sap_escrow_build_create_transaction',
        'sap_escrow_build_settle_transaction',
        'sap_sns_build_manage_record_transaction',
      ],
    },
  };
}

export function isHostedAccountlessBlockedTool(toolName: string): boolean {
  if (HOSTED_ACCOUNTLESS_UNAVAILABLE_EXACT_TOOLS.has(toolName)) {
    return true;
  }

  if (HOSTED_SAFE_EXACT_TOOLS.has(toolName) || HOSTED_SAFE_PREFIXES.some(prefix => toolName.startsWith(prefix))) {
    return false;
  }

  return LOCAL_SIGNER_ONLY_EXACT_TOOLS.has(toolName)
    || LOCAL_SIGNER_ONLY_PREFIXES.some(prefix => toolName.startsWith(prefix));
}
