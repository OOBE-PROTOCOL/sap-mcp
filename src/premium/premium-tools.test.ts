/**
 * @file premium-tools.test.ts
 * @description Vitest suite for the premium MCP tools registered by
 * `registerPremiumTools` on the SAP MCP server.
 *
 * Verifies that all 7 premium tool names are present in the server tool
 * surface, and that calling `sap_premium_plugin_catalog`, `sap_premium_plugin_template`,
 * and `sap_premium_validate_plugin_manifest` returns the expected structured content.
 *
 * @module premium/premium-tools.test
 */

import { describe, expect, it } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createSapMcpServer } from '../server/create-server.js';
import type { SapMcpConfig } from '../core/types.js';

interface ToolDefinitionForTest {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: unknown;
  annotations?: Record<string, unknown>;
}

interface ToolResponseForTest {
  content: Array<{ text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

type ToolHandlerForTest = (input: Record<string, unknown>) => Promise<ToolResponseForTest>;

interface RegisteredServerForTest extends Server {
  tools?: ToolDefinitionForTest[];
  toolHandlers?: Record<string, ToolHandlerForTest>;
}

function baseConfig(overrides: Partial<SapMcpConfig> = {}): SapMcpConfig {
  return {
    mode: 'readonly',
    rpcUrl: 'https://api.devnet.solana.com',
    commitment: 'confirmed',
    programId: 'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ',
    enableHttp: false,
    httpPort: 8787,
    httpHost: '127.0.0.1',
    logLevel: 'error',
    maxTxValueSol: 10,
    requireApprovalAboveSol: 1,
    dailyLimitSol: 100,
    allowedTools: 'all',
    externalSignerTimeoutMs: 30000,
    ...overrides,
  };
}

function registeredServer(server: Server): RegisteredServerForTest {
  return server as RegisteredServerForTest;
}

const PREMIUM_TOOL_NAMES = [
  'sap_premium_plugin_catalog',
  'sap_stream_catalog',
  'sap_webhook_catalog',
  'sap_premium_validate_plugin_manifest',
  'sap_premium_plugin_template',
  'sap_premium_session_start',
  'sap_premium_session_status',
  'sap_premium_webhook_relay',
  'sap_premium_webhook_relay_status',
] as const;

describe('premium MCP tools', () => {
  it('registers all expected premium tool names', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig()));
    const names = (server.tools ?? []).map(tool => tool.name);

    for (const expectedName of PREMIUM_TOOL_NAMES) {
      expect(names).toContain(expectedName);
    }
  });

  it('does not register duplicate premium tools', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig()));
    const names = (server.tools ?? []).map(tool => tool.name);
    const premiumNames = names.filter(name => name.startsWith('sap_premium_') || name.startsWith('sap_stream_') || name.startsWith('sap_webhook_'));

    expect(new Set(premiumNames).size).toBe(premiumNames.length);
  });

  it('sap_premium_plugin_catalog returns plugins in structured content', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig()));
    const response = await server.toolHandlers?.sap_premium_plugin_catalog?.({ includeSchemas: true });

    expect(response?.structuredContent?.plugins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'sap-premium-market-data',
          capabilities: expect.arrayContaining([
            expect.objectContaining({
              id: 'jupiter.quote.delta',
            }),
          ]),
        }),
      ]),
    );
  });

  it('sap_premium_plugin_template returns a valid manifest and validation report', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig()));
    const response = await server.toolHandlers?.sap_premium_plugin_template?.({
      pluginId: 'sap-premium-custom-alpha',
      capabilityId: 'custom.signal.stream',
      capabilityType: 'stream',
      title: 'Custom Signal Stream',
      description:
        'Custom private stream contract for paid signal delivery with x402 metering, provider readiness, and strict audit binding.',
      publisher: 'OOBE Labs',
      providerEnv: ['SAP_MCP_PREMIUM_CUSTOM_STREAM_URL'],
    });

    expect(response?.structuredContent?.manifest).toEqual(
      expect.objectContaining({
        id: 'sap-premium-custom-alpha',
        visibility: 'private',
      }),
    );
    expect(response?.structuredContent?.validation).toEqual(
      expect.objectContaining({
        valid: true,
      }),
    );
  });

  it('sap_premium_validate_plugin_manifest returns valid=false for an invalid manifest', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig()));
    const response = await server.toolHandlers?.sap_premium_validate_plugin_manifest?.({
      manifest: {
        id: 'Bad Plugin',
        version: 'next',
        title: 'Bad',
        description: 'too short',
        publisher: '',
        visibility: 'public',
        capabilities: [],
      },
    });

    expect(response?.structuredContent?.valid).toBe(false);
    expect(response?.structuredContent?.errors).toBeDefined();
    const errors = response?.structuredContent?.errors as Array<{ path: string }>;
    expect(errors.length).toBeGreaterThan(0);
  });

  it('sap_premium_session_start returns a session plan with blocked_requires_provider status', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig()));
    const response = await server.toolHandlers?.sap_premium_session_start?.({
      pluginId: 'sap-premium-market-data',
      capabilityId: 'jupiter.quote.delta',
      capabilityType: 'stream',
      requestedUnits: 3,
      ttlSeconds: 120,
      maxPriceUsd: 1,
      consumer: 'vitest',
    });

    expect(response?.structuredContent?.session).toEqual(
      expect.objectContaining({
        pluginId: 'sap-premium-market-data',
        capabilityId: 'jupiter.quote.delta',
        status: 'blocked_requires_provider',
      }),
    );
    expect(response?.structuredContent?.monetization).toEqual(
      expect.objectContaining({
        paymentRequired: false,
      }),
    );
  });

  it('sap_premium_session_status returns session info or empty list', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig()));

    // Create a session first so there's something to query.
    await server.toolHandlers?.sap_premium_session_start?.({
      pluginId: 'sap-premium-market-data',
      capabilityId: 'jupiter.quote.delta',
      capabilityType: 'stream',
      requestedUnits: 2,
      ttlSeconds: 120,
      consumer: 'vitest',
    });

    const response = await server.toolHandlers?.sap_premium_session_status?.({});

    // The response should have structured content with sessions array.
    expect(response?.structuredContent).toBeDefined();
    const sessions = (response?.structuredContent?.sessions ?? []) as Array<Record<string, unknown>>;
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    expect(sessions[0]).toHaveProperty('sessionId');
    expect(sessions[0]).toHaveProperty('status');
  });

  it('sap_premium_webhook_relay_status returns not_found for an unknown session', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig()));

    const response = await server.toolHandlers?.sap_premium_webhook_relay_status?.({
      sessionId: 'nonexistent-relay-session',
    });

    expect(response?.structuredContent).toBeDefined();
    expect(response?.structuredContent?.sessionStatus).toBe('not_found');
    expect(response?.structuredContent?.bufferedEventCount).toBe(0);
    expect(response?.structuredContent?.relaySubscriptions).toEqual([]);
  });

  it('sap_premium_webhook_relay rejects missing sessionId or events', async () => {
    const server = registeredServer(await createSapMcpServer(baseConfig()));

    const noSession = await server.toolHandlers?.sap_premium_webhook_relay?.({
      events: ['jupiter.quote.delta'],
    });
    expect(noSession?.structuredContent?.subscription).toBeNull();
    expect(noSession?.isError).toBe(true);

    const noEvents = await server.toolHandlers?.sap_premium_webhook_relay?.({
      sessionId: 'some-session',
    });
    expect(noEvents?.structuredContent?.subscription).toBeNull();
    expect(noEvents?.isError).toBe(true);
  });
});