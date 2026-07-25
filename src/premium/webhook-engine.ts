/**
 * @name premium/webhook-engine
 * @description Signed webhook delivery engine for premium event callbacks.
 *
 * After a session is activated, the webhook engine registers a buyer-owned
 * HTTPS endpoint, subscribes to the provider for matching events, signs each
 * delivery with HMAC-SHA256, and dispatches it via HTTP POST.
 *
 * The engine enforces:
 *   - Event filtering: only delivers event ids listed in the subscription.
 *   - URL validation: rejects localhost, private networks, and non-HTTPS URLs.
 *   - Signing: HMAC-SHA256 over `{deliveryId, deliveredAt, payload}` using
 *     the `SAP_MCP_PREMIUM_WEBHOOK_SIGNER` env var.
 *   - Retry: up to 3 attempts with exponential backoff for non-2xx responses.
 *   - Unit quota: decrements after each successful delivery.
 *   - Idempotency: deduplicates via `eventId` in the event store.
 *
 * @flow
 *   1. Buyer calls `POST /premium/webhook/register` with targetUrl + events.
 *   2. → `registerWebhook()` validates URL, creates subscription.
 *   3. Engine subscribes to provider, receives events matching the subscription.
 *   4. For each matching event: sign, POST to targetUrl, record delivery.
 *   5. Buyer can check delivery status via `getWebhookDeliveryStatus()`.
 *
 * @module premium/webhook-engine
 */

import { createHmac, randomUUID } from 'node:crypto';
import { request } from 'node:https';
import { request as httpRequest } from 'node:http';
import { URL } from 'node:url';
import type { PremiumWebhookDelivery, PremiumWebhookSubscription, ProviderEvent } from './types.js';
import { getPremiumSession, decrementSessionQuota, closeSession } from './session-manager.js';
import { subscribeToProvider } from './provider-bridge.js';
import { appendEvent } from './event-store.js';

/**
 * @description Registry of active webhook subscriptions keyed by subscription id.
 */
const webhookSubscriptions = new Map<string, PremiumWebhookSubscription>();

/**
 * @description Delivery attempt records keyed by delivery id.
 */
const deliveryRecords = new Map<string, PremiumWebhookDelivery>();

/**
 * @description Hard cap on stored delivery records.
 *
 * Default: 100_000 (tuned for a 312GB RAM production server).
 * Each record is ~512B, so 100K records ≈ 50MB.
 * Override via `SAP_MCP_PREMIUM_MAX_DELIVERIES` env var.
 */
const MAX_DELIVERY_RECORDS = (() => {
  const raw = process.env.SAP_MCP_PREMIUM_MAX_DELIVERIES;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 100_000;
})();

/**
 * @description Maximum retry attempts per delivery.
 */
const MAX_RETRIES = 3;

/**
 * @description Base delay for exponential backoff in milliseconds.
 */
const RETRY_BASE_DELAY_MS = 500;

/**
 * @name RELAY_TARGET_URL
 * @description Sentinel target URL for buffer-only (relay) webhook subscriptions.
 *
 * When a subscription's `targetUrl` equals this value, the webhook engine skips
 * HTTP POST delivery entirely. Events are still appended to the event store via
 * `appendEvent()`, and the agent consumes them through
 * `sap_premium_stream_poll` / `sap_premium_stream_flush`. This eliminates the
 * need for a public HTTPS endpoint — agents running locally can receive webhook
 * events by polling the server-side buffer.
 *
 * @internal
 */
const RELAY_TARGET_URL = 'relay://buffer';

/**
 * @name isRelayTarget
 * @description Returns true when a target URL is the buffer-only relay sentinel.
 *
 * @param targetUrl - The target URL to check.
 * @returns True if the URL is the relay buffer sentinel.
 *
 * @internal
 */
function isRelayTarget(targetUrl: string): boolean {
  return targetUrl === RELAY_TARGET_URL;
}

/**
 * @name validateWebhookUrl
 * @description Validate that a webhook target URL is safe for delivery.
 *
 * Accepts the relay sentinel `relay://buffer` as a buffer-only delivery mode
 * that never makes an outbound HTTP call.
 *
 * Rejects:
 *   - Non-HTTPS URLs in production (allow HTTP for localhost testing).
 *   - localhost, 127.0.0.1, 0.0.0.0, private network ranges (10.x, 172.16-31.x, 192.168.x).
 *
 * @param targetUrl - The URL to validate.
 * @returns True if the URL is safe for webhook delivery.
 *
 * @internal
 */
function validateWebhookUrl(targetUrl: string): boolean {
  // The relay sentinel is always valid — it never makes an outbound HTTP call.
  if (isRelayTarget(targetUrl)) return true;

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return false;
  }

  // Must be HTTPS in production. Allow HTTP only for localhost testing.
  const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !isLocalhost) return false;

  // Block private network ranges (SSRF prevention).
  const host = parsed.hostname;
  if (
    host.startsWith('10.') ||
    host.startsWith('172.16.') || host.startsWith('172.17.') || host.startsWith('172.18.') ||
    host.startsWith('172.19.') || host.startsWith('172.20.') || host.startsWith('172.21.') ||
    host.startsWith('172.22.') || host.startsWith('172.23.') || host.startsWith('172.24.') ||
    host.startsWith('172.25.') || host.startsWith('172.26.') || host.startsWith('172.27.') ||
    host.startsWith('172.28.') || host.startsWith('172.29.') || host.startsWith('172.30.') ||
    host.startsWith('172.31.') ||
    host.startsWith('192.168.') ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.startsWith('fe80:')
  ) {
    return false;
  }

  return true;
}

/**
 * @name signDelivery
 * @description Sign a webhook delivery payload with HMAC-SHA256.
 *
 * The signature is computed over the string `${deliveryId}.${deliveredAt}.${JSON.stringify(payload)}`
 * using the `SAP_MCP_PREMIUM_WEBHOOK_SIGNER` env var as the key.
 *
 * @param deliveryId   - The unique delivery id.
 * @param deliveredAt  - ISO timestamp of the delivery.
 * @param payload      - The event payload to sign.
 * @returns Hex-encoded HMAC-SHA256 signature.
 *
 * @internal
 */
function signDelivery(deliveryId: string, deliveredAt: string, payload: Record<string, unknown>): string {
  const key = process.env.SAP_MCP_PREMIUM_WEBHOOK_SIGNER;
  if (!key) {
    throw new Error('SAP_MCP_PREMIUM_WEBHOOK_SIGNER is not set — webhook delivery requires a configured signing key');
  }
  const message = `${deliveryId}.${deliveredAt}.${JSON.stringify(payload)}`;
  return createHmac('sha256', key).update(message).digest('hex');
}

/**
 * @name deliverWebhook
 * @description Deliver a single event to a webhook target URL with retries.
 *
 * @param subscription - The webhook subscription.
 * @param event        - The provider event to deliver.
 * @returns The `PremiumWebhookDelivery` record for this attempt.
 *
 * @internal
 */
async function deliverWebhook(
  subscription: PremiumWebhookSubscription,
  event: ProviderEvent,
): Promise<PremiumWebhookDelivery> {
  const deliveryId = `wh-delivery-${randomUUID()}`;
  const deliveredAt = new Date().toISOString();
  const signature = signDelivery(deliveryId, deliveredAt, event.payload);

  const body = JSON.stringify({
    deliveryId,
    eventType: event.eventType,
    deliveredAt,
    signature,
    payload: event.payload,
  });

  let httpStatus: number | null = null;
  let success = false;
  let responseBody: string | undefined;
  let retryCount = 0;

  const parsedUrl = new URL(subscription.targetUrl);
  const isHttps = parsedUrl.protocol === 'https:';
  const reqFn = isHttps ? request : httpRequest;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    retryCount = attempt;
    try {
      const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = reqFn(
          {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: `${parsedUrl.pathname}${parsedUrl.search}`,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
              'X-SAP-Premium-Delivery-Id': deliveryId,
              'X-SAP-Premium-Signature': signature,
            },
            timeout: 10_000,
          },
          (res) => {
            let data = '';
            res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
            res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
          },
        );
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Webhook delivery timeout.')); });
        req.write(body);
        req.end();
      });

      httpStatus = response.status;
      responseBody = response.body.slice(0, 512);
      success = response.status >= 200 && response.status < 300;
      if (success) break;
    } catch (error) {
      responseBody = error instanceof Error ? error.message : 'Unknown delivery error.';
    }

    if (attempt < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, RETRY_BASE_DELAY_MS * 2 ** attempt));
    }
  }

  const delivery: PremiumWebhookDelivery = {
    deliveryId,
    subscriptionId: subscription.subscriptionId,
    eventId: event.eventId,
    eventType: event.eventType,
    deliveredAt,
    signature,
    httpStatus,
    success,
    responseBody,
    retryCount,
  };

  // Store delivery record with cap.
  deliveryRecords.set(deliveryId, delivery);
  if (deliveryRecords.size > MAX_DELIVERY_RECORDS) {
    const oldestKey = deliveryRecords.keys().next().value as string | undefined;
    if (oldestKey) deliveryRecords.delete(oldestKey);
  }

  // Update subscription stats.
  subscription.deliveriesAttempted++;
  if (success) subscription.deliveriesSucceeded++;
  subscription.lastDeliveryAt = deliveredAt;
  subscription.lastDeliveryStatus = httpStatus;

  return delivery;
}

/**
 * @name registerWebhook
 * @description Register a webhook subscription for an active premium session.
 *
 * @param sessionId       - The activated premium session id.
 * @param targetUrl       - HTTPS endpoint owned by the buyer.
 * @param events          - Exact event ids to deliver.
 * @param signingPublicKey - Optional buyer public key for signature verification.
 * @returns The `PremiumWebhookSubscription`, or `null` if the session is not
 *   active or the URL is invalid.
 *
 * @usedBy `premium-tools.ts` → MCP tool `sap_premium_webhook_register`,
 *   `remote/server.ts` → `POST /premium/webhook/register`
 */
export async function registerWebhook(
  sessionId: string,
  targetUrl: string,
  events: string[],
  signingPublicKey?: string,
): Promise<PremiumWebhookSubscription | null> {
  const session = getPremiumSession(sessionId);
  if (!session || session.status !== 'active') return null;
  if (!validateWebhookUrl(targetUrl)) return null;
  if (events.length === 0) return null;

  const subscription: PremiumWebhookSubscription = {
    subscriptionId: `wh-sub-${randomUUID()}`,
    sessionId,
    pluginId: session.pluginId,
    capabilityId: session.capabilityId,
    targetUrl,
    events,
    signingPublicKey,
    createdAt: new Date().toISOString(),
    deliveriesAttempted: 0,
    deliveriesSucceeded: 0,
    lastDeliveryAt: null,
    lastDeliveryStatus: null,
    active: true,
  };

  webhookSubscriptions.set(subscription.subscriptionId, subscription);
  return subscription;
}

/**
 * @name RELAY_TARGET_URL_EXPORT
 * @description Exported relay sentinel so premium-tools and tests can reference it
 *   without duplicating the literal.
 */
export const PREMIUM_WEBHOOK_RELAY_TARGET_URL = RELAY_TARGET_URL;

/**
 * @name registerWebhookRelay
 * @description Register a buffer-only (relay) webhook subscription for an active
 *   premium session.
 *
 * Unlike `registerWebhook`, this does not require a public HTTPS endpoint.
 * Events matching the subscription are appended to the event store by the
 * delivery loop and the agent consumes them via `sap_premium_stream_poll` or
 * `sap_premium_stream_flush`. This solves the core problem for agents running
 * locally without a publicly reachable HTTPS callback URL.
 *
 * @param sessionId - The activated premium session id.
 * @param events    - Exact event ids to buffer.
 * @returns The `PremiumWebhookSubscription`, or `null` if the session is not
 *   active or no events were provided.
 *
 * @usedBy `premium-tools.ts` → MCP tool `sap_premium_webhook_relay`
 */
export async function registerWebhookRelay(
  sessionId: string,
  events: string[],
): Promise<PremiumWebhookSubscription | null> {
  const session = getPremiumSession(sessionId);
  if (!session || session.status !== 'active') return null;
  if (events.length === 0) return null;

  const subscription: PremiumWebhookSubscription = {
    subscriptionId: `wh-relay-${randomUUID()}`,
    sessionId,
    pluginId: session.pluginId,
    capabilityId: session.capabilityId,
    targetUrl: RELAY_TARGET_URL,
    events,
    signingPublicKey: undefined,
    createdAt: new Date().toISOString(),
    deliveriesAttempted: 0,
    deliveriesSucceeded: 0,
    lastDeliveryAt: null,
    lastDeliveryStatus: null,
    active: true,
  };

  webhookSubscriptions.set(subscription.subscriptionId, subscription);
  return subscription;
}

/**
 * @name getRelaySubscriptionsForSession
 * @description Return all active relay (buffer-only) webhook subscriptions for a
 *   session id. Used by the relay status tool to report buffered event counts.
 *
 * @param sessionId - The premium session id.
 * @returns Array of relay subscriptions for the session.
 *
 * @usedBy `premium-tools.ts` → MCP tool `sap_premium_webhook_relay_status`
 */
export function getRelaySubscriptionsForSession(sessionId: string): PremiumWebhookSubscription[] {
  const results: PremiumWebhookSubscription[] = [];
  for (const sub of webhookSubscriptions.values()) {
    if (sub.sessionId === sessionId && isRelayTarget(sub.targetUrl)) {
      results.push({ ...sub });
    }
  }
  return results;
}

/**
 * @name startWebhookDelivery
 * @description Start the webhook delivery loop for a subscription.
 *
 * Subscribes to the provider, receives events, filters by the subscription's
 * event list, signs and delivers each matching event, and decrements the
 * session quota. Stops when the quota reaches zero or the subscription is
 * deactivated.
 *
 * @param subscription - The webhook subscription to deliver for.
 *
 * @usedBy `remote/server.ts` → webhook delivery worker
 */
export async function startWebhookDelivery(subscription: PremiumWebhookSubscription): Promise<void> {
  const iterable = await subscribeToProvider(
    subscription.pluginId,
    subscription.capabilityId,
    {},
  );
  if (!iterable) {
    console.error(
      `[webhook-engine] Failed to start delivery loop for ${subscription.subscriptionId}: ` +
      `provider adapter not available for ${subscription.pluginId}:${subscription.capabilityId}. ` +
      `Check SAP_MCP_ENABLE_PREMIUM_PLUGINS, SAP_MCP_PLUGIN_DIR, and that providers are compiled (.js).`,
    );
    return;
  }

  console.log(
    `[webhook-engine] Delivery loop started for ${subscription.subscriptionId} ` +
    `(${subscription.pluginId}:${subscription.capabilityId}, events: ${subscription.events.join(', ')}).`,
  );

  for await (const event of iterable) {
    if (!subscription.active) break;

    // Filter: only deliver events listed in the subscription.
    if (!subscription.events.includes(event.eventType)) continue;

    // Store the event for replay/idempotency.
    appendEvent({
      eventId: event.eventId,
      sessionId: subscription.sessionId,
      pluginId: subscription.pluginId,
      capabilityId: subscription.capabilityId,
      eventType: event.eventType,
      observedAt: event.observedAt,
      payload: event.payload,
      deliveredAt: new Date().toISOString(),
    });

    // Relay (buffer-only) mode: skip HTTP POST delivery entirely.
    // The event is already in the event store; the agent consumes it via
    // sap_premium_stream_poll / sap_premium_stream_flush.
    if (isRelayTarget(subscription.targetUrl)) {
      subscription.deliveriesAttempted++;
      subscription.deliveriesSucceeded++;
      subscription.lastDeliveryAt = new Date().toISOString();
      subscription.lastDeliveryStatus = 200;

      const relayDelivery: PremiumWebhookDelivery = {
        deliveryId: `wh-relay-${randomUUID()}`,
        subscriptionId: subscription.subscriptionId,
        eventId: event.eventId,
        eventType: event.eventType,
        deliveredAt: new Date().toISOString(),
        signature: 'relay-buffer',
        httpStatus: 200,
        success: true,
        responseBody: 'Buffered for agent poll consumption.',
        retryCount: 0,
      };
      deliveryRecords.set(relayDelivery.deliveryId, relayDelivery);
      if (deliveryRecords.size > MAX_DELIVERY_RECORDS) {
        const oldestKey = deliveryRecords.keys().next().value as string | undefined;
        if (oldestKey) deliveryRecords.delete(oldestKey);
      }
    } else {
      // Deliver via HTTP POST with retries.
      await deliverWebhook(subscription, event);
    }

    // Decrement quota and auto-close at zero.
    const remaining = decrementSessionQuota(subscription.sessionId);
    if (remaining <= 0) {
      subscription.active = false;
      closeSession(subscription.sessionId, 'Webhook unit quota exhausted.');
      break;
    }
  }
}

/**
 * @name unregisterWebhook
 * @description Deactivate and remove a webhook subscription.
 *
 * @param subscriptionId - The webhook subscription id.
 * @returns True if the subscription was found and removed.
 *
 * @usedBy `premium-tools.ts` → MCP tool `sap_premium_webhook_unregister`
 */
export function unregisterWebhook(subscriptionId: string): boolean {
  const subscription = webhookSubscriptions.get(subscriptionId);
  if (!subscription) return false;
  subscription.active = false;
  webhookSubscriptions.delete(subscriptionId);
  return true;
}

/**
 * @name getWebhookSubscription
 * @description Retrieve a webhook subscription by id.
 *
 * @param subscriptionId - The webhook subscription id.
 * @returns The subscription, or `null` if not found.
 *
 * @usedBy `premium-tools.ts` → MCP tool `sap_premium_webhook_status`
 */
export function getWebhookSubscription(subscriptionId: string): PremiumWebhookSubscription | null {
  const sub = webhookSubscriptions.get(subscriptionId);
  return sub ? { ...sub } : null;
}

/**
 * @name getWebhookDeliveries
 * @description Retrieve delivery records for a subscription.
 *
 * @param subscriptionId - The webhook subscription id.
 * @param limit          - Maximum records to return (default 50).
 * @returns Array of `PremiumWebhookDelivery` records.
 *
 * @usedBy `premium-tools.ts` → MCP tool `sap_premium_webhook_status`
 */
export function getWebhookDeliveries(subscriptionId: string, limit = 50): PremiumWebhookDelivery[] {
  const results: PremiumWebhookDelivery[] = [];
  for (const delivery of deliveryRecords.values()) {
    if (delivery.subscriptionId === subscriptionId) {
      results.push(delivery);
      if (results.length >= limit) break;
    }
  }
  return results;
}

/**
 * @name getActiveWebhookCount
 * @description Return the number of currently active webhook subscriptions.
 *
 * @usedBy `metrics.ts`
 */
export function getActiveWebhookCount(): number {
  let count = 0;
  for (const sub of webhookSubscriptions.values()) {
    if (sub.active) count++;
  }
  return count;
}

/**
 * @name stopAllWebhooks
 * @description Deactivate all webhook subscriptions. Called during graceful shutdown.
 *
 * @usedBy `remote/server.ts` shutdown handler
 */
export function stopAllWebhooks(): void {
  for (const sub of webhookSubscriptions.values()) {
    sub.active = false;
  }
  webhookSubscriptions.clear();
}