import { describe, expect, it } from 'vitest';
import type { SapMcpConfig, SapMcpMonetizationConfig } from '../config/env.js';
import { parseJsonRpcBody } from './json-rpc.js';
import { buildPaidVirtualPath } from './monetization-gate.js';
import { generatePayShProviderYaml, resolvePayShNetwork } from './pay-sh-spec.js';
import { classifyTool, resolvePaymentDecision } from './pricing.js';

const monetizationConfig: SapMcpMonetizationConfig = {
  enabled: true,
  provider: 'x402',
  payTo: '11111111111111111111111111111111',
  facilitatorUrl: 'https://x402.oobeprotocol.ai/facilitator',
  maxTimeoutSeconds: 120,
  prices: {
    readPremiumUsd: 0.008,
    builderUsd: 0.05,
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

  it('keeps SAP MCP skill bootstrap tools free', () => {
    expect(classifyTool('sap_skills_list')).toBe('free');
    expect(classifyTool('sap_skills_bundle')).toBe('free');
    expect(classifyTool('sap_skills_install')).toBe('free');
  });

  it('canonicalizes client-normalized tool aliases before pricing', () => {
    const parsed = parseJsonRpcBody({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'spl_token_getTokenAccounts',
        arguments: { owner: '28VEsvJpLodUaUReU6t2NFD2uWnqydi2vx2AMfa1HCQP' },
      },
    });

    expect(parsed.toolCalls[0]?.toolName).toBe('spl-token_getTokenAccounts');
  });

  it('keeps basic SOL and SPL balance reads free', () => {
    expect(classifyTool('sol_get_balance')).toBe('free');
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
      expect(decision.price).toBe('$0.008');
    }
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
      expect(decision.price).toBe('$0.05');
    }
  });

  it('applies fixed plus basis-points fee to value-changing actions with USD notional', () => {
    const parsed = parseJsonRpcBody({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'sap_create_escrow',
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
      expect(decision.price).toBe('$0.058');
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
    expect(yaml).toContain('price_usd: 0.008');
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
