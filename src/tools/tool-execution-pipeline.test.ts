import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import type { SapMcpConfig, SapMcpContext } from '../core/types.js';
import { createToolExecutionResult, registerPipelineTool } from './tool-execution-pipeline.js';

interface RegisteredServerForTest extends Server {
  _requestHandlers?: Map<string, (request: unknown, extra: unknown) => Promise<unknown>>;
}

function context(): SapMcpContext {
  return {
    config: {
      mode: 'readonly',
      rpcUrl: 'https://api.devnet.solana.com',
      commitment: 'confirmed',
      programId: 'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ',
      maxRetries: 3,
      retryDelayMs: 1000,
      walletEncrypted: false,
      externalSignerTimeoutMs: 30000,
      enableHttp: false,
      httpPort: 8787,
      httpHost: '127.0.0.1',
      maxTxValueSol: 1,
      requireApprovalAboveSol: 1,
      dailyLimitSol: 10,
      allowedTools: 'all',
      logLevel: 'error',
      logFormat: 'pretty',
      enableMetrics: false,
      metricsPort: 9090,
      enableCache: true,
      cacheTtlSeconds: 300,
      enableRateLimit: true,
      rateLimitPerMinute: 60,
      jupiter: {
        apiBaseUrl: 'https://quote-api.jup.ag/v6',
        apiKeyConfigured: false,
        timeoutMs: 10000,
      },
      perps: {
        adrenaProgramId: '11111111111111111111111111111111',
        apiKeyConfigured: false,
        timeoutMs: 10000,
      },
      priorityFeeMicroLamports: 0,
      monetization: {
        enabled: false,
        provider: 'x402',
        maxTimeoutSeconds: 120,
        strictTools: false,
        prices: {
          microReadUsd: 0.001,
          readPremiumUsd: 0.002,
          builderUsd: 0.006,
          valueFixedUsd: 0.06,
          heavyValueUsd: 0.035,
          valueBps: 0,
          minUsd: 0.001,
          maxUsd: 100,
        },
      },
    } satisfies SapMcpConfig,
  } as SapMcpContext;
}

describe('tool execution pipeline', () => {
  it('parses input and returns a structured success envelope with execution metadata', async () => {
    const server = new Server(
      { name: 'sap-mcp-test', version: '0.0.0' },
      { capabilities: { tools: {} } },
    ) as RegisteredServerForTest;

    registerPipelineTool(server, context(), {
      name: 'sap_test_pipeline_read',
      title: 'SAP Test Pipeline Read',
      description: 'Test tool using the shared execution pipeline.',
      inputSchema: z.object({ subject: z.string().min(1) }),
      execute: async ({ input, metadata }) => createToolExecutionResult(
        {
          subject: input.subject,
          intent: metadata.intent,
        },
        {
          source: 'unit-test',
        },
      ),
    });

    const callTool = server._requestHandlers?.get('tools/call');
    const result = await callTool?.(
      {
        method: 'tools/call',
        params: {
          name: 'sap_test_pipeline_read',
          arguments: { subject: 'registry' },
        },
      },
      {},
    ) as { structuredContent?: Record<string, unknown>; isError?: boolean } | undefined;

    expect(result?.isError).toBeUndefined();
    expect(result?.structuredContent).toEqual(expect.objectContaining({
      success: true,
      toolName: 'sap_test_pipeline_read',
      data: {
        subject: 'registry',
        intent: 'sap-mcp-workflow',
      },
      metadata: expect.objectContaining({
        paymentTier: 'read-premium',
        source: 'unit-test',
      }),
    }));
  });

  it('returns a structured application error when input validation fails', async () => {
    const server = new Server(
      { name: 'sap-mcp-test', version: '0.0.0' },
      { capabilities: { tools: {} } },
    ) as RegisteredServerForTest;

    registerPipelineTool(server, context(), {
      name: 'sap_test_pipeline_error',
      title: 'SAP Test Pipeline Error',
      description: 'Test tool using shared input validation.',
      inputSchema: z.object({ subject: z.string().min(1) }),
      execute: async ({ input }) => ({ subject: input.subject }),
    });

    const callTool = server._requestHandlers?.get('tools/call');
    const result = await callTool?.(
      {
        method: 'tools/call',
        params: {
          name: 'sap_test_pipeline_error',
          arguments: { subject: '' },
        },
      },
      {},
    ) as { structuredContent?: Record<string, unknown>; isError?: boolean } | undefined;

    expect(result?.isError).toBe(true);
    expect(result?.structuredContent).toEqual(expect.objectContaining({
      success: false,
      toolName: 'sap_test_pipeline_error',
      error: expect.objectContaining({
        code: 'invalid_input',
      }),
    }));
  });

  it('can preserve direct data-shaped responses for existing client contracts', async () => {
    const server = new Server(
      { name: 'sap-mcp-test', version: '0.0.0' },
      { capabilities: { tools: {} } },
    ) as RegisteredServerForTest;

    registerPipelineTool(server, context(), {
      name: 'sap_test_pipeline_legacy_data',
      title: 'SAP Test Pipeline Legacy Data',
      description: 'Test tool preserving a legacy direct payload while using the pipeline.',
      responseMode: 'data',
      inputSchema: z.object({ subject: z.string().min(1) }),
      execute: async ({ input }) => ({
        success: true,
        subject: input.subject,
      }),
    });

    const callTool = server._requestHandlers?.get('tools/call');
    const result = await callTool?.(
      {
        method: 'tools/call',
        params: {
          name: 'sap_test_pipeline_legacy_data',
          arguments: { subject: 'quick-context' },
        },
      },
      {},
    ) as { structuredContent?: Record<string, unknown>; isError?: boolean } | undefined;

    expect(result?.isError).toBeUndefined();
    expect(result?.structuredContent).toEqual({
      success: true,
      subject: 'quick-context',
    });
  });

  it('does not unwrap compatible direct payloads that happen to have a data field', async () => {
    const server = new Server(
      { name: 'sap-mcp-test', version: '0.0.0' },
      { capabilities: { tools: {} } },
    ) as RegisteredServerForTest;

    registerPipelineTool(server, context(), {
      name: 'sap_test_pipeline_direct_data_field',
      title: 'SAP Test Pipeline Direct Data Field',
      description: 'Test tool preserving a legacy direct payload with a data property.',
      responseMode: 'data',
      inputSchema: z.object({ subject: z.string().min(1) }),
      execute: async ({ input }) => ({
        success: true,
        data: {
          subject: input.subject,
        },
      }),
    });

    const callTool = server._requestHandlers?.get('tools/call');
    const result = await callTool?.(
      {
        method: 'tools/call',
        params: {
          name: 'sap_test_pipeline_direct_data_field',
          arguments: { subject: 'legacy-payload' },
        },
      },
      {},
    ) as { structuredContent?: Record<string, unknown>; isError?: boolean } | undefined;

    expect(result?.isError).toBeUndefined();
    expect(result?.structuredContent).toEqual({
      success: true,
      data: {
        subject: 'legacy-payload',
      },
    });
  });

  it('can attach MCP Apps card resources to pipeline responses', async () => {
    const server = new Server(
      { name: 'sap-mcp-test', version: '0.0.0' },
      { capabilities: { tools: {} } },
    ) as RegisteredServerForTest;

    registerPipelineTool(server, context(), {
      name: 'sap_test_pipeline_card',
      title: 'SAP Test Pipeline Card',
      description: 'Test tool rendering a UI card through the shared pipeline.',
      responseMode: 'data',
      inputSchema: z.object({ toolName: z.string().min(1), priceUsd: z.number().nonnegative() }),
      execute: async ({ input }) => ({
        success: true,
        toolName: input.toolName,
        priceUsd: input.priceUsd,
      }),
      uiCard: (result) => ({
        kind: 'pricing',
        toolName: String(result.data.toolName),
        tier: 'read-premium',
        priceUsd: Number(result.data.priceUsd),
        recommendedMaxPriceUsd: Number(result.data.priceUsd) * 1.5,
        isFree: Number(result.data.priceUsd) === 0,
      }),
    });

    const callTool = server._requestHandlers?.get('tools/call');
    const result = await callTool?.(
      {
        method: 'tools/call',
        params: {
          name: 'sap_test_pipeline_card',
          arguments: { toolName: 'sap_paid_read', priceUsd: 0.002 },
        },
      },
      {},
    ) as {
      content?: Array<{ type?: string; resource?: { uri?: string } }>;
      structuredContent?: Record<string, unknown>;
      isError?: boolean;
    } | undefined;

    expect(result?.isError).toBeUndefined();
    expect(result?.structuredContent).toEqual({
      success: true,
      toolName: 'sap_paid_read',
      priceUsd: 0.002,
    });
    expect(result?.content?.[1]?.type).toBe('resource');
    expect(result?.content?.[1]?.resource?.uri).toBe('ui://sap/pricing-card');
  });
});
