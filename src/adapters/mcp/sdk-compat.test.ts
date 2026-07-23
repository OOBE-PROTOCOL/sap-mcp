import { describe, expect, it } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createTextResponse } from './tool-response.js';
import { matchResourceTemplateUri, registerTool } from './sdk-compat.js';

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
});
