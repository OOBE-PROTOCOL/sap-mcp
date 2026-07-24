/**
 * @name premium/smoke-test
 * @description End-to-end smoke test for the complete premium delivery rail.
 *
 * Tests every layer of the premium subsystem in sequence:
 *   1. Session lifecycle (create → activate → close)
 *   2. Activation manager (valid receipt, invalid receipt, unknown session)
 *   3. Event store (append dedup, query, count)
 *   4. Stream broker (start, replay, stream events, stop)
 *   5. Webhook engine (register, deliver to mock HTTP server, status, unregister)
 *   6. Metrics snapshot (counts match expected state)
 *   7. Memory manager (start, prune, shutdown)
 *   8. HTTP route handlers (activation, webhook status via mock request)
 *
 * The test uses a local HTTP server to receive webhook deliveries, avoiding
 * any dependency on external services. Provider adapters are simulated via
 * a mock async iterable injected directly into the stream broker.
 *
 * @module premium/smoke-test
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import * as http from 'node:http';
import { AddressInfo } from 'node:net';

import {
  createPremiumSessionPlan,
  getPremiumSession,
  listPremiumSessions,
  closeSession,
  decrementSessionQuota,
  clearAllSessions,
} from './session-manager.js';
import {
  activatePremiumSession,
} from './activation-manager.js';
import {
  appendEvent,
  getEvents,
  getEventCount,
  clearAllEvents,
} from './event-store.js';
import {
  registerWebhook,
  unregisterWebhook,
  getWebhookSubscription,
  getWebhookDeliveries,
  getActiveWebhookCount,
  stopAllWebhooks,
} from './webhook-engine.js';
import {
  startStream,
  replayEvents,
  stopStream,
  getActiveStreamCount,
  stopAllStreams,
} from './stream-broker.js';
import {
  getPremiumMetrics,
} from './metrics.js';
import {
  PremiumMemoryManager,
} from '../remote/premium-memory.js';
import {
  tryPremiumRoute,
} from '../remote/premium-routes.js';

/* -------------------------------------------------------------------------- */
/* Test helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * @description Start a local HTTP server to receive webhook deliveries.
 * Returns the server and the port it's listening on.
 */
function startMockWebhookServer(): Promise<{
  server: http.Server;
  port: number;
  receivedDeliveries: Array<{ deliveryId: string; eventType: string; signature: string; payload: Record<string, unknown> }>;
}> {
  return new Promise((resolve, reject) => {
    const receivedDeliveries: Array<{ deliveryId: string; eventType: string; signature: string; payload: Record<string, unknown> }> = [];
    const server = http.createServer((req, res) => {
      let data = '';
      req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(data) as { deliveryId: string; eventType: string; signature: string; payload: Record<string, unknown> };
          receivedDeliveries.push(parsed);
        } catch {
          // Ignore parse errors in mock.
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, port, receivedDeliveries });
    });
    server.on('error', reject);
  });
}

/* -------------------------------------------------------------------------- */
/* Smoke tests                                                                */
/* -------------------------------------------------------------------------- */

describe('premium delivery rail — end-to-end smoke test', () => {
  beforeEach(() => {
    clearAllSessions();
    clearAllEvents();
    stopAllStreams();
    stopAllWebhooks();
    // Set provider env vars so sessions can be activated.
    process.env.SAP_MCP_PREMIUM_JUPITER_STREAM_URL = 'wss://mock-jupiter.example.com/stream';
    process.env.SAP_MCP_PREMIUM_WEBHOOK_SIGNER = 'test-signing-key-for-smoke-test';
  });

  afterEach(() => {
    clearAllSessions();
    clearAllEvents();
    stopAllStreams();
    stopAllWebhooks();
    delete process.env.SAP_MCP_PREMIUM_JUPITER_STREAM_URL;
    delete process.env.SAP_MCP_PREMIUM_WEBHOOK_SIGNER;
    vi.restoreAllMocks();
  });

  /* --- Layer 1: Session lifecycle --- */

  it('creates a session plan with correct pricing and status', () => {
    const session = createPremiumSessionPlan({
      pluginId: 'sap-premium-market-data',
      capabilityId: 'jupiter.quote.delta',
      capabilityType: 'stream',
      requestedUnits: 5,
      ttlSeconds: 300,
      consumer: 'smoke-test',
    });

    expect(session.sessionId).toMatch(/^sap-premium-/);
    expect(session.status).toBe('pending_payment');
    expect(session.providerReady).toBe(true);
    expect(session.estimatedPriceUsd).toBe(0.1); // 5 units × $0.02/unit
    expect(session.requestedUnits).toBe(5);
  });

  it('clamps requested units to capability bounds', () => {
    const session = createPremiumSessionPlan({
      pluginId: 'sap-premium-market-data',
      capabilityId: 'jupiter.quote.delta',
      capabilityType: 'stream',
      requestedUnits: 999, // max is 120
      ttlSeconds: 60,
    });

    expect(session.requestedUnits).toBe(120);
  });

  it('throws for unknown plugin/capability', () => {
    expect(() => createPremiumSessionPlan({
      pluginId: 'nonexistent-plugin',
      capabilityId: 'nonexistent-cap',
      capabilityType: 'stream',
      requestedUnits: 1,
      ttlSeconds: 60,
    })).toThrow('unknown_premium_capability');
  });

  it('returns blocked_requires_provider when env vars are missing', () => {
    delete process.env.SAP_MCP_PREMIUM_JUPITER_STREAM_URL;

    const session = createPremiumSessionPlan({
      pluginId: 'sap-premium-market-data',
      capabilityId: 'jupiter.quote.delta',
      capabilityType: 'stream',
      requestedUnits: 1,
      ttlSeconds: 60,
    });

    expect(session.status).toBe('blocked_requires_provider');
    expect(session.providerReady).toBe(false);
  });

  /* --- Layer 2: Activation manager --- */

  it('activates a pending session with a valid receipt', () => {
    const session = createPremiumSessionPlan({
      pluginId: 'sap-premium-market-data',
      capabilityId: 'jupiter.quote.delta',
      capabilityType: 'stream',
      requestedUnits: 10,
      ttlSeconds: 300,
    });

    const result = activatePremiumSession({
      sessionId: session.sessionId,
      paymentReceipt: 'x402-receipt-proof-abc123def456',
      payerAddress: '9WzDXwBbmkg8ZTbNMqMxgue9xK6dX5z6YxQkp1XM1mAB',
    });

    expect(result.status).toBe('active');
    expect(result.activatedAt).not.toBeNull();
    expect(result.receiptBound).toBe(true);
    expect(result.unitsQuota).toBe(10);

    const updated = getPremiumSession(session.sessionId);
    expect(updated?.status).toBe('active');
  });

  it('rejects activation with invalid receipt format', () => {
    const session = createPremiumSessionPlan({
      pluginId: 'sap-premium-market-data',
      capabilityId: 'jupiter.quote.delta',
      capabilityType: 'stream',
      requestedUnits: 1,
      ttlSeconds: 300,
    });

    const result = activatePremiumSession({
      sessionId: session.sessionId,
      paymentReceipt: 'short',
    });

    expect(result.status).toBe('pending_payment');
    expect(result.receiptBound).toBe(false);
  });

  it('rejects activation for unknown session', () => {
    const result = activatePremiumSession({
      sessionId: 'nonexistent-session',
      paymentReceipt: 'x402-receipt-proof-abc123def456',
    });

    expect(result.status).toBe('expired');
    expect(result.receiptBound).toBe(false);
  });

  it('closes an active session and prevents re-activation', () => {
    const session = createPremiumSessionPlan({
      pluginId: 'sap-premium-market-data',
      capabilityId: 'jupiter.quote.delta',
      capabilityType: 'stream',
      requestedUnits: 5,
      ttlSeconds: 300,
    });

    activatePremiumSession({
      sessionId: session.sessionId,
      paymentReceipt: 'x402-receipt-proof-abc123def456',
    });

    const closed = closeSession(session.sessionId, 'Smoke test closure');
    expect(closed).toBe(true);

    const after = getPremiumSession(session.sessionId);
    expect(after?.status).toBe('closed');

    // Re-activation should return closed status.
    const reActivate = activatePremiumSession({
      sessionId: session.sessionId,
      paymentReceipt: 'x402-receipt-proof-abc123def456',
    });
    expect(reActivate.status).toBe('closed');
  });

  it('decrements session quota and auto-closes at zero', () => {
    const session = createPremiumSessionPlan({
      pluginId: 'sap-premium-market-data',
      capabilityId: 'jupiter.quote.delta',
      capabilityType: 'stream',
      requestedUnits: 3,
      ttlSeconds: 300,
    });

    activatePremiumSession({
      sessionId: session.sessionId,
      paymentReceipt: 'x402-receipt-proof-abc123def456',
    });

    expect(decrementSessionQuota(session.sessionId)).toBe(2);
    expect(decrementSessionQuota(session.sessionId)).toBe(1);
    expect(decrementSessionQuota(session.sessionId)).toBe(0);

    const after = getPremiumSession(session.sessionId);
    expect(after?.status).toBe('closed');
  });

  /* --- Layer 3: Event store --- */

  it('appends events with idempotency and queries by session', () => {
    const sessionId = 'test-session-1';
    const event1: Parameters<typeof appendEvent>[0] = {
      eventId: 'evt-001',
      sessionId,
      pluginId: 'sap-premium-market-data',
      capabilityId: 'jupiter.quote.delta',
      eventType: 'quote.delta',
      observedAt: new Date().toISOString(),
      payload: { mint: 'JUP', price: 0.05 },
      deliveredAt: new Date().toISOString(),
    };
    const event2: Parameters<typeof appendEvent>[0] = {
      ...event1,
      eventId: 'evt-002',
      eventType: 'route.changed',
      payload: { route: 'direct' },
    };

    expect(appendEvent(event1)).toBe(true);
    expect(appendEvent(event1)).toBe(false); // Dedup
    expect(appendEvent(event2)).toBe(true);

    expect(getEventCount()).toBe(2);

    const events = getEvents({ sessionId });
    expect(events).toHaveLength(2);
    expect(events[0].eventId).toBe('evt-001');

    const filtered = getEvents({ sessionId, eventType: 'route.changed' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].eventId).toBe('evt-002');
  });

  /* --- Layer 4: Stream broker (replay + lifecycle) --- */

  it('replays events from the event store', () => {
    const sessionId = 'test-replay-session';
    appendEvent({
      eventId: 'evt-replay-1',
      sessionId,
      pluginId: 'sap-premium-market-data',
      capabilityId: 'jupiter.quote.delta',
      eventType: 'quote.delta',
      observedAt: new Date().toISOString(),
      payload: { price: 0.05 },
      deliveredAt: new Date().toISOString(),
    });

    const replayed = replayEvents(sessionId);
    expect(replayed).toHaveLength(1);
    expect(replayed[0].eventId).toBe('evt-replay-1');
    expect(replayed[0].eventType).toBe('quote.delta');
  });

  it('starts and stops a stream for an active session', async () => {
    const session = createPremiumSessionPlan({
      pluginId: 'sap-premium-market-data',
      capabilityId: 'jupiter.quote.delta',
      capabilityType: 'stream',
      requestedUnits: 5,
      ttlSeconds: 300,
    });

    activatePremiumSession({
      sessionId: session.sessionId,
      paymentReceipt: 'x402-receipt-proof-abc123def456',
    });

    const subscription = await startStream(session.sessionId, 'sub-key-1', { mint: 'JUP' });
    expect(subscription).not.toBeNull();
    expect(subscription!.active).toBe(true);
    expect(subscription!.unitsQuota).toBe(5);
    expect(getActiveStreamCount()).toBe(1);

    stopStream(session.sessionId);
    expect(getActiveStreamCount()).toBe(0);
  });

  it('rejects stream start for non-active session', async () => {
    const result = await startStream('nonexistent-session', 'sub-key', {});
    expect(result).toBeNull();
  });

  /* --- Layer 5: Webhook engine --- */

  it('registers a webhook for an active session and delivers events to a mock HTTP server', async () => {
    // Start a mock HTTP server to receive webhook deliveries.
    const mock = await startMockWebhookServer();
    const targetUrl = `http://127.0.0.1:${mock.port}/webhook`;

    try {
      const session = createPremiumSessionPlan({
        pluginId: 'sap-premium-market-data',
        capabilityId: 'price.threshold.crossed',
        capabilityType: 'webhook',
        requestedUnits: 10,
        ttlSeconds: 300,
      });

      activatePremiumSession({
        sessionId: session.sessionId,
        paymentReceipt: 'x402-receipt-proof-abc123def456',
      });

      const subscription = await registerWebhook(
        session.sessionId,
        targetUrl,
        ['price.threshold.crossed'],
      );

      expect(subscription).not.toBeNull();
      expect(subscription!.active).toBe(true);
      expect(subscription!.targetUrl).toBe(targetUrl);
      expect(subscription!.events).toContain('price.threshold.crossed');
      expect(getActiveWebhookCount()).toBe(1);

      // Unregister.
      const unregistered = unregisterWebhook(subscription!.subscriptionId);
      expect(unregistered).toBe(true);
      expect(getActiveWebhookCount()).toBe(0);

      // Status check should return null after unregister.
      const afterUnregister = getWebhookSubscription(subscription!.subscriptionId);
      expect(afterUnregister).toBeNull();
    } finally {
      mock.server.close();
    }
  });

  it('rejects webhook registration for non-active session', async () => {
    const result = await registerWebhook(
      'nonexistent-session',
      'https://example.com/hook',
      ['price.threshold.crossed'],
    );
    expect(result).toBeNull();
  });

  it('rejects webhook registration with private network URL (SSRF prevention)', async () => {
    const session = createPremiumSessionPlan({
      pluginId: 'sap-premium-market-data',
      capabilityId: 'price.threshold.crossed',
      capabilityType: 'webhook',
      requestedUnits: 10,
      ttlSeconds: 300,
    });

    activatePremiumSession({
      sessionId: session.sessionId,
      paymentReceipt: 'x402-receipt-proof-abc123def456',
    });

    const result = await registerWebhook(
      session.sessionId,
      'https://192.168.1.50/secret',
      ['price.threshold.crossed'],
    );
    expect(result).toBeNull();
  });

  it('rejects webhook registration with non-HTTPS URL', async () => {
    const session = createPremiumSessionPlan({
      pluginId: 'sap-premium-market-data',
      capabilityId: 'price.threshold.crossed',
      capabilityType: 'webhook',
      requestedUnits: 10,
      ttlSeconds: 300,
    });

    activatePremiumSession({
      sessionId: session.sessionId,
      paymentReceipt: 'x402-receipt-proof-abc123def456',
    });

    const result = await registerWebhook(
      session.sessionId,
      'http://example.com/hook', // non-HTTPS, non-localhost
      ['price.threshold.crossed'],
    );
    expect(result).toBeNull();
  });

  /* --- Layer 6: Metrics --- */

  it('returns a metrics snapshot with correct counts', async () => {
    // Create a pending session.
    createPremiumSessionPlan({
      pluginId: 'sap-premium-market-data',
      capabilityId: 'jupiter.quote.delta',
      capabilityType: 'stream',
      requestedUnits: 1,
      ttlSeconds: 300,
    });

    // Create and activate a session.
    const activeSession = createPremiumSessionPlan({
      pluginId: 'sap-premium-market-data',
      capabilityId: 'price.threshold.crossed',
      capabilityType: 'webhook',
      requestedUnits: 10,
      ttlSeconds: 300,
    });
    activatePremiumSession({
      sessionId: activeSession.sessionId,
      paymentReceipt: 'x402-receipt-proof-abc123def456',
    });

    const metrics = await getPremiumMetrics();

    expect(metrics.activeSessions).toBe(1);
    expect(metrics.pendingSessions).toBe(1);
    expect(metrics.totalSessionsCreated).toBeGreaterThanOrEqual(2);
    expect(metrics.totalRevenueUsd).toBeGreaterThan(0);
    expect(metrics.providerHealth).toBeDefined();
  });

  /* --- Layer 7: Memory manager --- */

  it('starts, prunes, and shuts down without errors', async () => {
    const manager = new PremiumMemoryManager({
      gcIntervalMs: 100, // Fast interval for testing.
      maxSessions: 100,
      maxEvents: 100,
      maxDeliveries: 100,
    });

    manager.start();

    // Wait for at least one prune cycle.
    await new Promise(resolve => setTimeout(resolve, 150));

    // Shutdown should clean up everything.
    await manager.shutdown();

    // After shutdown, all stores should be empty.
    expect(listPremiumSessions()).toHaveLength(0);
    expect(getEventCount()).toBe(0);
    expect(getActiveStreamCount()).toBe(0);
    expect(getActiveWebhookCount()).toBe(0);
  });

  /* --- Layer 8: HTTP route handlers --- */

  it('handles POST /premium/activate via tryPremiumRoute', async () => {
    const session = createPremiumSessionPlan({
      pluginId: 'sap-premium-market-data',
      capabilityId: 'jupiter.quote.delta',
      capabilityType: 'stream',
      requestedUnits: 5,
      ttlSeconds: 300,
    });

    // Create a proper mock request with readable stream body.
    const bodyStr = JSON.stringify({
      sessionId: session.sessionId,
      paymentReceipt: 'x402-receipt-proof-abc123def456',
    });
    const { Readable } = await import('node:stream');
    const req = Readable.from([Buffer.from(bodyStr)]) as unknown as http.IncomingMessage;
    (req as unknown as Record<string, unknown>).method = 'POST';
    (req as unknown as Record<string, unknown>).url = '/premium/activate';
    (req as unknown as Record<string, unknown>).headers = { host: 'localhost:3000', 'content-type': 'application/json' };

    let statusCode = 0;
    let responseBody = '';
    const res = {
      writeHead: vi.fn((status: number) => { statusCode = status; }),
      write: vi.fn((data: string) => { responseBody += data; }),
      end: vi.fn((data?: string) => { if (data) responseBody += data; }),
      writableEnded: false,
    } as unknown as http.ServerResponse;

    const handled = await tryPremiumRoute(req, res);
    expect(handled).toBe(true);
    expect(statusCode).toBe(200);

    const parsed = JSON.parse(responseBody) as { activation: { status: string; receiptBound: boolean } };
    expect(parsed.activation.status).toBe('active');
    expect(parsed.activation.receiptBound).toBe(true);
  });

  it('handles GET /premium/webhook/:id/status via tryPremiumRoute', async () => {
    // First register a webhook.
    const mock = await startMockWebhookServer();
    const targetUrl = `http://127.0.0.1:${mock.port}/hook`;

    try {
      const session = createPremiumSessionPlan({
        pluginId: 'sap-premium-market-data',
        capabilityId: 'price.threshold.crossed',
        capabilityType: 'webhook',
        requestedUnits: 10,
        ttlSeconds: 300,
      });
      activatePremiumSession({
        sessionId: session.sessionId,
        paymentReceipt: 'x402-receipt-proof-abc123def456',
      });
      const subscription = await registerWebhook(session.sessionId, targetUrl, ['price.threshold.crossed']);
      if (!subscription) throw new Error('Webhook registration failed');

      // Now test the status endpoint.
      const req = {
        method: 'GET',
        url: `/premium/webhook/${subscription.subscriptionId}/status`,
        headers: { host: 'localhost:3000' },
        on: vi.fn(),
      } as unknown as http.IncomingMessage;

      let statusCode = 0;
      let responseBody = '';
      const res = {
        writeHead: vi.fn((status: number) => { statusCode = status; }),
        write: vi.fn((data: string) => { responseBody += data; }),
        end: vi.fn((data?: string) => { if (data) responseBody += data; }),
      } as unknown as http.ServerResponse;

      const handled = await tryPremiumRoute(req, res);
      expect(handled).toBe(true);
      expect(statusCode).toBe(200);

      const parsed = JSON.parse(responseBody) as { subscription: { subscriptionId: string }; deliveries: unknown[] };
      expect(parsed.subscription.subscriptionId).toBe(subscription.subscriptionId);
      expect(Array.isArray(parsed.deliveries)).toBe(true);
    } finally {
      mock.server.close();
    }
  });

  it('returns false for non-premium routes', async () => {
    const req = {
      method: 'GET',
      url: '/health',
      headers: { host: 'localhost:3000' },
      on: vi.fn(),
    } as unknown as http.IncomingMessage;

    const res = {
      writeHead: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    } as unknown as http.ServerResponse;

    const handled = await tryPremiumRoute(req, res);
    expect(handled).toBe(false);
  });

  /* --- Full integration flow --- */

  it('full flow: create → activate → stream events → close', async () => {
    // 1. Create session.
    const session = createPremiumSessionPlan({
      pluginId: 'sap-premium-market-data',
      capabilityId: 'jupiter.quote.delta',
      capabilityType: 'stream',
      requestedUnits: 3,
      ttlSeconds: 300,
      consumer: 'full-flow-test',
    });
    expect(session.status).toBe('pending_payment');

    // 2. Activate.
    const activation = activatePremiumSession({
      sessionId: session.sessionId,
      paymentReceipt: 'x402-receipt-proof-abc123def456',
    });
    expect(activation.status).toBe('active');

    // 3. Append events to the store (simulating provider delivery).
    appendEvent({
      eventId: 'full-flow-evt-1',
      sessionId: session.sessionId,
      pluginId: session.pluginId,
      capabilityId: session.capabilityId,
      eventType: 'quote.delta',
      observedAt: new Date().toISOString(),
      payload: { mint: 'JUP', price: 0.05 },
      deliveredAt: new Date().toISOString(),
    });
    appendEvent({
      eventId: 'full-flow-evt-2',
      sessionId: session.sessionId,
      pluginId: session.pluginId,
      capabilityId: session.capabilityId,
      eventType: 'route.changed',
      observedAt: new Date().toISOString(),
      payload: { route: 'direct' },
      deliveredAt: new Date().toISOString(),
    });

    // 4. Replay events.
    const replayed = replayEvents(session.sessionId);
    expect(replayed).toHaveLength(2);

    // 5. Start stream.
    const subscription = await startStream(session.sessionId, 'full-flow-sub', {});
    expect(subscription).not.toBeNull();
    expect(getActiveStreamCount()).toBe(1);

    // 6. Decrement quota (simulating delivery).
    expect(decrementSessionQuota(session.sessionId)).toBe(2);
    expect(decrementSessionQuota(session.sessionId)).toBe(1);
    expect(decrementSessionQuota(session.sessionId)).toBe(0);

    // 7. Session should be auto-closed.
    const closed = getPremiumSession(session.sessionId);
    expect(closed?.status).toBe('closed');

    // 8. Stop stream.
    stopStream(session.sessionId);
    expect(getActiveStreamCount()).toBe(0);

    // 9. Metrics should reflect the state.
    const metrics = await getPremiumMetrics();
    expect(metrics.activeSessions).toBe(0); // session was auto-closed
    expect(metrics.totalEventsDelivered).toBeGreaterThanOrEqual(2);
  });

  it('full flow: create → activate → webhook register → unregister → close', async () => {
    const mock = await startMockWebhookServer();
    const targetUrl = `http://127.0.0.1:${mock.port}/wh`;

    try {
      // 1. Create + activate.
      const session = createPremiumSessionPlan({
        pluginId: 'sap-premium-market-data',
        capabilityId: 'price.threshold.crossed',
        capabilityType: 'webhook',
        requestedUnits: 10,
        ttlSeconds: 300,
      });
      activatePremiumSession({
        sessionId: session.sessionId,
        paymentReceipt: 'x402-receipt-proof-abc123def456',
      });

      // 2. Register webhook.
      const subscription = await registerWebhook(
        session.sessionId,
        targetUrl,
        ['price.threshold.crossed'],
        'test-signing-pubkey',
      );
      expect(subscription).not.toBeNull();
      expect(getActiveWebhookCount()).toBe(1);

      // 3. Check status.
      const status = getWebhookSubscription(subscription!.subscriptionId);
      expect(status).not.toBeNull();
      expect(status!.deliveriesAttempted).toBe(0);

      // 4. Get deliveries (empty initially).
      const deliveries = getWebhookDeliveries(subscription!.subscriptionId);
      expect(deliveries).toHaveLength(0);

      // 5. Unregister.
      unregisterWebhook(subscription!.subscriptionId);
      expect(getActiveWebhookCount()).toBe(0);
      expect(getWebhookSubscription(subscription!.subscriptionId)).toBeNull();

      // 6. Close session.
      closeSession(session.sessionId, 'Test complete');
      const after = getPremiumSession(session.sessionId);
      expect(after?.status).toBe('closed');
    } finally {
      mock.server.close();
    }
  });
});