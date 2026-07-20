import { describe, expect, it } from 'vitest';
import type { SapMcpConfig, SapMcpMonetizationConfig } from '../config/env.js';
import { parseJsonRpcBody } from './json-rpc.js';
import { buildPaidVirtualPath } from './monetization-gate.js';
import { generatePayShProviderYaml, resolvePayShNetwork } from './pay-sh-spec.js';
import { buildPricingCatalog, classifyTool, resolvePaymentDecision } from './pricing.js';

const monetizationConfig: SapMcpMonetizationConfig = {
  enabled: true,
  provider: 'x402',
  payTo: '11111111111111111111111111111111',
  facilitatorUrl: 'https://x402.oobeprotocol.ai/facilitator',
  maxTimeoutSeconds: 120,
  strictTools: false,
  prices: {
    readPremiumUsd: 0.001,
    builderUsd: 0.008,
    valueFixedUsd: 0.2,
    valueBps: 50,
    minUsd: 0.001,
    maxUsd: 100,
  },
};

const sapConfig: SapMcpConfig = {
  mode: 'hosted-api',
  rpcUrl: 'https://api.devnet.solana.com',
  commitment: 'confirmed',
  programId: 'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ',
  maxRetries: 3,
  retryDelayMs: 1000,
  walletEncrypted: false,
  externalSignerTimeoutMs: 30000,
  enableHttp: true,
  httpPort: 8787,
  httpHost: '127.0.0.1',
  maxTxValueSol: 1,
  requireApprovalAboveSol: 1,
  dailyLimitSol: 10,
  allowedTools: 'all',
  logLevel: 'info',
  logFormat: 'pretty',
  enableMetrics: false,
  metricsPort: 9090,
  enableCache: true,
  cacheTtlSeconds: 300,
  enableRateLimit: true,
  rateLimitPerMinute: 60,
  monetization: monetizationConfig,
};

describe('SAP MCP monetization pricing', () => {
  it('keeps MCP discovery methods free', () => {
    const parsed = parseJsonRpcBody({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });

    const decision = resolvePaymentDecision(parsed, monetizationConfig);

    expect(decision.required).toBe(false);
  });

  it('keeps the current profile tool free', () => {
    expect(classifyTool('sap_profile_current')).toBe('free');
  });

  it('keeps SAP protocol invariants and agent identity planning free', () => {
    expect(classifyTool('sap_protocol_invariants')).toBe('free');
    expect(classifyTool('sap_protocol_invariants', { strictTools: true })).toBe('free');
    expect(classifyTool('sap_agent_identity_plan')).toBe('free');
    expect(classifyTool('sap_agent_identity_plan', { strictTools: true })).toBe('free');
  });

  it('keeps SAP MCP skill bootstrap tools free', () => {
    expect(classifyTool('sap_agent_start')).toBe('free');
    expect(classifyTool('sap_agent_runtime_status')).toBe('free');
    expect(classifyTool('sap_pricing_catalog')).toBe('free');
    expect(classifyTool('sap_skills_list')).toBe('free');
    expect(classifyTool('sap_skills_bundle')).toBe('free');
    expect(classifyTool('sap_skills_install')).toBe('free');
    expect(classifyTool('sap_skills_upgrade_plan')).toBe('free');
    expect(classifyTool('sap_runtime_repair_plan')).toBe('free');
  });

  it('canonicalizes client-normalized tool aliases before pricing', () => {
    const splParsed = parseJsonRpcBody({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'spl_token_getTokenAccounts',
        arguments: { owner: '28VEsvJpLodUaUReU6t2NFD2uWnqydi2vx2AMfa1HCQP' },
      },
    });

    const solParsed = parseJsonRpcBody({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'sol_getBalance',
        arguments: { wallet: '28VEsvJpLodUaUReU6t2NFD2uWnqydi2vx2AMfa1HCQP' },
      },
    });

    expect(splParsed.toolCalls[0]?.toolName).toBe('spl-token_getTokenAccounts');
    expect(solParsed.toolCalls[0]?.toolName).toBe('sol_get_balance');
  });

  it('keeps basic SOL and SPL balance reads free', () => {
    expect(classifyTool('sol_get_balance')).toBe('free');
    expect(resolvePaymentDecision(parseJsonRpcBody({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'sol_getBalance',
        arguments: { wallet: '28VEsvJpLodUaUReU6t2NFD2uWnqydi2vx2AMfa1HCQP' },
      },
    }), monetizationConfig).required).toBe(false);
    expect(classifyTool('spl-token_getBalance')).toBe('free');
    expect(classifyTool('spl-token_getTokenAccounts')).toBe('free');

    const parsed = parseJsonRpcBody({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'spl_token_getTokenAccounts',
        arguments: { owner: '28VEsvJpLodUaUReU6t2NFD2uWnqydi2vx2AMfa1HCQP' },
      },
    });

    const decision = resolvePaymentDecision(parsed, monetizationConfig);

    expect(decision.required).toBe(false);
  });

  it('keeps single SNS availability checks free in default and strict mode', () => {
    expect(classifyTool('sap_sns_check_domain')).toBe('free');
    expect(classifyTool('sap_sns_check_domain', { strictTools: true })).toBe('free');

    const parsed = parseJsonRpcBody({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'sap_sns_check_domain',
        arguments: { domain: 'solkingchad.sol' },
      },
    });

    expect(resolvePaymentDecision(parsed, monetizationConfig).required).toBe(false);
    expect(resolvePaymentDecision(parsed, {
      ...monetizationConfig,
      strictTools: true,
    }).required).toBe(false);
  });

  it('can price basic balance reads in strict hosted mode', () => {
    expect(classifyTool('sol_get_balance', { strictTools: true })).toBe('read-premium');
    expect(classifyTool('spl-token_getTokenAccounts', { strictTools: true })).toBe('read-premium');
    expect(classifyTool('sap_agent_start', { strictTools: true })).toBe('free');
    expect(classifyTool('sap_agent_runtime_status', { strictTools: true })).toBe('free');
    expect(classifyTool('sap_pricing_catalog', { strictTools: true })).toBe('free');
    expect(classifyTool('sap_profile_current', { strictTools: true })).toBe('free');
    expect(classifyTool('sap_skills_upgrade_plan', { strictTools: true })).toBe('free');
    expect(classifyTool('sap_runtime_repair_plan', { strictTools: true })).toBe('free');

    const parsed = parseJsonRpcBody({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'sol_get_balance',
        arguments: { address: '28VEsvJpLodUaUReU6t2NFD2uWnqydi2vx2AMfa1HCQP' },
      },
    });

    const decision = resolvePaymentDecision(parsed, {
      ...monetizationConfig,
      strictTools: true,
    });

    expect(decision.required).toBe(true);
  });

  it('prices enriched discovery as read premium', () => {
    const parsed = parseJsonRpcBody({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'sap_list_all_agents',
        arguments: {},
      },
    });

    const decision = resolvePaymentDecision(parsed, monetizationConfig);

    expect(decision.required).toBe(true);
    if (decision.required) {
      expect(decision.tier).toBe('read-premium');
      expect(decision.price).toBe('$0.001');
    }
  });

  it('prices live quotes as lightweight reads instead of builder calls', () => {
    for (const toolName of ['jupiter_getQuote', 'magicblock_swapQuote']) {
      const parsed = parseJsonRpcBody({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: { inputMint: 'So11111111111111111111111111111111111111112' },
        },
      });

      const decision = resolvePaymentDecision(parsed, monetizationConfig);

      expect(decision.required).toBe(true);
      if (decision.required) {
        expect(decision.tier).toBe('read-premium');
        expect(decision.price).toBe('$0.001');
      }
    }
  });

  it('keeps SAP payment readiness and transaction preflight free', () => {
    expect(classifyTool('sap_x402_estimate_cost')).toBe('free');
    expect(classifyTool('sap_payments_readiness')).toBe('free');
    expect(classifyTool('sap_payments_register_agent')).toBe('free');
    expect(classifyTool('sap_payments_update_agent')).toBe('free');
    expect(classifyTool('sap_decode_transaction')).toBe('free');
    expect(classifyTool('sap_preview_transaction')).toBe('free');
  });

  it('prices SNS batch checks as builder calls', () => {
    const parsed = parseJsonRpcBody({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'sap_sns_batch_check_domains',
        arguments: { domains: ['oobe.sol', 'sap.sol'] },
      },
    });

    const decision = resolvePaymentDecision(parsed, monetizationConfig);

    expect(decision.required).toBe(true);
    if (decision.required) {
      expect(decision.tier).toBe('builder');
      expect(decision.price).toBe('$0.008');
    }
  });

  it('prices swap transaction builders as value actions', () => {
    for (const toolName of ['jupiter_getOrder', 'jupiter_smartSwap', 'magicblock_swap']) {
      expect(classifyTool(toolName)).toBe('value-action');
    }
  });

  it('prices hosted Escrow V2 unsigned builders as builder calls', () => {
    for (const toolName of [
      'sap_escrow_build_create_transaction',
      'sap_escrow_build_deposit_transaction',
      'sap_escrow_build_settle_transaction',
      'sap_escrow_build_finalize_transaction',
      'sap_escrow_build_withdraw_transaction',
      'sap_escrow_build_close_transaction',
    ]) {
      expect(classifyTool(toolName)).toBe('builder');
    }
  });

  it('builds a machine-readable pricing catalog from the same registry', () => {
    const catalog = buildPricingCatalog(monetizationConfig);

    expect(catalog.source).toBe('sap-mcp-pricing-registry');
    expect(catalog.tiers.free.paymentRequired).toBe(false);
    expect(catalog.tiers['read-premium'].priceUsd).toBe(0.001);
    expect(catalog.tiers.builder.priceUsd).toBe(0.008);
    expect(catalog.toolSets.free).toContain('sap_agent_runtime_status');
    expect(catalog.toolSets.free).toContain('sap_pricing_catalog');
    expect(catalog.toolSets.builders).toContain('sap_escrow_build_create_transaction');
    expect(catalog.runtimeRules.join(' ')).toContain('sap_payments_finalize_transaction');
  });

  it('applies fixed plus basis-points fee to value-changing actions with USD notional', () => {
    const parsed = parseJsonRpcBody({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'sap_create_escrow_v2',
        arguments: { payment: { amountUsd: 10 } },
      },
    });

    const decision = resolvePaymentDecision(parsed, monetizationConfig);

    expect(decision.required).toBe(true);
    if (decision.required) {
      expect(decision.tier).toBe('value-action');
      expect(decision.price).toBe('$0.25');
    }
  });

  it('sums paid calls in a JSON-RPC batch', () => {
    const parsed = parseJsonRpcBody([
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'sap_list_all_agents', arguments: {} },
      },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'sap_sns_batch_check_domains', arguments: { domains: ['x.sol'] } },
      },
    ]);

    const decision = resolvePaymentDecision(parsed, monetizationConfig);

    expect(decision.required).toBe(true);
    if (decision.required) {
      expect(decision.tier).toBe('batch');
      expect(decision.price).toBe('$0.009');
    }
  });

  it('binds the paid x402 virtual route to the exact request hash', () => {
    const parsed = parseJsonRpcBody({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'sap_list_all_agents', arguments: {} },
    });
    const decision = resolvePaymentDecision(parsed, monetizationConfig);

    expect(decision.required).toBe(true);
    if (decision.required) {
      expect(buildPaidVirtualPath(decision, 'abc123')).toBe('/mcp/paid/read-premium/abc123/sap_list_all_agents');
    }
  });

  it('generates a valid pay.sh provider YAML for the hosted MCP route', () => {
    const yaml = generatePayShProviderYaml(sapConfig, {
      upstreamUrl: 'https://mcp.sap.oobeprotocol.ai',
      signerPath: '/etc/oobe/pay/operator.json',
    });

    expect(yaml).toContain("name: 'oobe-sap-mcp'");
    expect(yaml).toContain('routing:\n  type: proxy');
    expect(yaml).toContain("url: 'https://mcp.sap.oobeprotocol.ai/'");
    expect(yaml).toContain("path: 'mcp'");
    expect(yaml).toContain('price_usd: 0.001');
    expect(yaml).toContain("signer: { type: file, path: '/etc/oobe/pay/operator.json' }");
  });

  it('maps Solana CAIP-2 mainnet to the pay.sh mainnet alias', () => {
    expect(resolvePayShNetwork({
      ...sapConfig,
      monetization: {
        ...monetizationConfig,
        network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      },
    })).toBe('mainnet');
  });
});
