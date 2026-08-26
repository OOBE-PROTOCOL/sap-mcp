import { describe, expect, it } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CATALOG_READONLY_TOOL_ALLOWLIST } from '../../core/constants.js';
import type { SapMcpContext } from '../../core/types.js';
import { createTextResponse, createUiCardResponse } from './tool-response.js';
import { matchResourceTemplateUri, registerTool, setToolExecutionContext } from './sdk-compat.js';

interface RegisteredServerForTest extends Server {
  _requestHandlers?: Map<string, (request: unknown, extra: unknown) => Promise<unknown>>;
}

describe('MCP SDK compatibility resource templates', () => {
  it('matches template placeholders and extracts path-segment arguments', () => {
    expect(matchResourceTemplateUri('sap://agent/{wallet}/profile', 'sap://agent/28VE/profile')).toEqual({
      args: {
        wallet: '28VE',
      },
    });
  });

  it('treats template literal regex characters as plain text', () => {
    expect(matchResourceTemplateUri('sap://agent.v1/{wallet}', 'sap://agent.v1/28VE')).toEqual({
      args: {
        wallet: '28VE',
      },
    });
    expect(matchResourceTemplateUri('sap://agent.v1/{wallet}', 'sap://agentXv1/28VE')).toBeUndefined();
  });

  it('does not let placeholder values span path separators', () => {
    expect(matchResourceTemplateUri('sap://agent/{wallet}', 'sap://agent/28VE/profile')).toBeUndefined();
  });

  it('sanitizes catalog read-only tools/list metadata', async () => {
    const server = new Server(
      { name: 'oobe-protocol-test', version: '0.0.0' },
      { capabilities: { tools: {} } },
    ) as RegisteredServerForTest;

    setToolExecutionContext(server, {
      config: {
        allowedTools: [...CATALOG_READONLY_TOOL_ALLOWLIST],
      },
    } as SapMcpContext);

    registerTool(
      server,
      'sap_agent_start',
      {
        title: 'Start SAP MCP Agent Mode',
        description: 'Paid x402 helper. Call sap_payments_call_paid_tool and use signer builders for transaction workflows.',
        inputSchema: {
          type: 'object',
          description: 'Pricing: paid x402. Signer boundary applies to builder and payment flows.',
          properties: {
            goal: {
              type: 'string',
              description: 'Goal for write, payment, or transaction routing.',
            },
          },
        },
      },
      async () => createTextResponse('ok'),
    );

    registerTool(
      server,
      'sap_submit_signed_transaction',
      {
        title: 'Submit Signed Transaction',
        description: 'Hidden value-moving tool.',
        inputSchema: {},
      },
      async () => createTextResponse('hidden'),
    );

    const listTools = server._requestHandlers?.get('tools/list');
    const result = await listTools?.({ method: 'tools/list', params: {} }, {}) as {
      tools?: Array<{ name: string; title?: string; description?: string }>;
    } | undefined;
    const serialized = JSON.stringify(result);

    expect(result?.tools?.map((tool) => tool.name)).toEqual(['sap_agent_start']);
    expect(result?.tools?.[0]).toMatchObject({
      title: 'OOBE Protocol Catalog: Agent Start',
      description: 'OOBE Protocol Catalog: Agent Start is a read-only public OOBE Protocol catalog tool for discovery, status, and metadata lookup.',
    });
    expect(serialized).not.toMatch(/x402|sap_payments|signer|builder|paid|payment|transaction|write/i);
  });

  it('does not synthesize invalid structuredContent for explicit-schema error text', async () => {
    const server = new Server(
      { name: 'sap-mcp-test', version: '0.0.0' },
      { capabilities: { tools: {} } },
    ) as RegisteredServerForTest;

    registerTool(
      server,
      'sap_test_explicit_error',
      {
        title: 'SAP Test Explicit Error',
        description: 'Test tool used to verify explicit output schema error handling.',
        inputSchema: {},
        outputSchema: {
          type: 'object',
          properties: {
            success: { type: 'boolean', description: 'Whether the operation succeeded.' },
          },
          required: ['success'],
        },
      },
      async () => createTextResponse('Error: local registry write failed', { isError: true }),
    );

    const callTool = server._requestHandlers?.get('tools/call');
    const result = await callTool?.(
      {
        method: 'tools/call',
        params: {
          name: 'sap_test_explicit_error',
          arguments: {},
        },
      },
      {},
    ) as { content?: Array<{ text?: string }>; structuredContent?: unknown; isError?: boolean } | undefined;

    expect(result?.isError).toBe(true);
    expect(result?.content?.[0]?.text).toContain('local registry write failed');
    expect(result).not.toHaveProperty('structuredContent');
  });

  it('accepts embedded ui resources and infers structuredContent from JSON text', async () => {
    const server = new Server(
      { name: 'sap-mcp-test', version: '0.0.0' },
      { capabilities: { tools: {} } },
    ) as RegisteredServerForTest;

    registerTool(
      server,
      'sap_test_ui_card',
      {
        title: 'SAP Test UI Card',
        description: 'Test tool used to verify MCP Apps resource responses.',
        inputSchema: {},
        outputSchema: {
          type: 'object',
          properties: {
            success: { type: 'boolean', description: 'Whether the operation succeeded.' },
            priceUsd: { type: 'number', description: 'Quoted price.' },
          },
          required: ['success', 'priceUsd'],
        },
      },
      async () => createUiCardResponse(
        { success: true, priceUsd: 0.01 },
        {
          kind: 'pricing',
          toolName: 'sap_test_ui_card',
          tier: 'micro',
          priceUsd: 0.01,
          recommendedMaxPriceUsd: 0.02,
          isFree: false,
        },
      ),
    );

    const callTool = server._requestHandlers?.get('tools/call');
    const result = await callTool?.(
      {
        method: 'tools/call',
        params: {
          name: 'sap_test_ui_card',
          arguments: {},
        },
      },
      {},
    ) as {
      content?: Array<{ type?: string; text?: string; resource?: { uri?: string; text?: string } }>;
      structuredContent?: unknown;
      isError?: boolean;
    } | undefined;

    expect(result?.isError).toBeUndefined();
    expect(result?.content).toHaveLength(2);
    expect(result?.content?.[1]?.type).toBe('resource');
    expect(result?.content?.[1]?.resource?.uri).toBe('ui://sap/pricing-card');
    expect(result?.structuredContent).toEqual({ success: true, priceUsd: 0.01 });
  });

  it('preserves explicit structuredContent from embedded ui resources without an output schema', async () => {
    const server = new Server(
      { name: 'sap-mcp-test', version: '0.0.0' },
      { capabilities: { tools: {} } },
    ) as RegisteredServerForTest;

    registerTool(
      server,
      'sap_test_ui_card_without_schema',
      {
        title: 'SAP Test UI Card Without Schema',
        description: 'Test tool used to verify MCP Apps resource responses without explicit outputSchema.',
        inputSchema: {},
      },
      async () => createUiCardResponse(
        { success: true, status: 'ready' },
        {
          kind: 'readiness',
          status: 'ready',
          profile: 'default',
          canPayX402: true,
          canExecuteWriteTools: true,
          issues: [],
        },
      ),
    );

    const callTool = server._requestHandlers?.get('tools/call');
    const result = await callTool?.(
      {
        method: 'tools/call',
        params: {
          name: 'sap_test_ui_card_without_schema',
          arguments: {},
        },
      },
      {},
    ) as { structuredContent?: unknown } | undefined;

    expect(result?.structuredContent).toEqual({ success: true, status: 'ready' });
  });
});
