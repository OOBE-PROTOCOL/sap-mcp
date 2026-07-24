/**
 * @name premium/stream-broker
 * @description SSE stream broker for premium real-time event delivery.
 *
 * After a session is activated (`status=active`), the stream broker opens a
 * provider subscription, enriches each event with session metadata, stores it
 * in the event store for replay, and delivers it to the buyer via SSE
 * (Server-Sent Events) over the `/premium/stream/:sessionId` HTTP endpoint.
 *
 * The broker enforces:
 *   - Unit quota: stops delivery when `requestedUnits` reaches zero.
 *   - Session status: only delivers for `status=active` sessions.
 *   - Event idempotency: deduplicates via `eventId` in the event store.
 *   - Graceful shutdown: closes all active streams on disconnect.
 *
 * @flow
 *   1. Buyer calls `GET /premium/stream/:sessionId` with `Accept: text/event-stream`.
 *   2. → `startStream()` validates session is active, loads provider adapter.
 *   3. → Provider `subscribe()` returns async iterable of `ProviderEvent`.
 *   4. → For each event: enrich with session metadata, `appendEvent()`, write SSE.
 *   5. → `decrementSessionQuota()` after each event; auto-close at zero.
 *   6. Client disconnects or quota exhausted → `stopStream()`.
 *
 * @module premium/stream-broker
 */

import type { PremiumStreamSubscription, ProviderEvent } from './types.js';
import { getPremiumSession, decrementSessionQuota } from './session-manager.js';
import { subscribeToProvider } from './provider-bridge.js';
import { appendEvent, getEvents } from './event-store.js';

/**
 * @description Registry of active stream subscriptions keyed by session id.
 */
const activeStreams = new Map<string, PremiumStreamSubscription>();

/**
 * @description Abort controllers for active streams, keyed by session id.
 * Used to cancel the provider async iterable when the client disconnects.
 */
const streamControllers = new Map<string, AbortController>();

/**
 * @name startStream
 * @description Start a premium stream subscription for an active session.
 *
 * @param sessionId      - The activated premium session id.
 * @param subscriptionKey - De-duplication key from the stream input schema.
 * @param filters        - Narrow filters for the provider subscription.
 * @returns The `PremiumStreamSubscription` if successful, or `null` if the
 *   session is not active or the provider is not available.
 *
 * @usedBy `remote/server.ts` → `GET /premium/stream/:sessionId`
 */
export async function startStream(
  sessionId: string,
  subscriptionKey: string,
  filters: Record<string, unknown>,
): Promise<PremiumStreamSubscription | null> {
  const session = getPremiumSession(sessionId);
  if (!session || session.status !== 'active') return null;

  // Don't start a duplicate stream for the same session.
  if (activeStreams.has(sessionId)) return activeStreams.get(sessionId)!;

  const subscription: PremiumStreamSubscription = {
    sessionId,
    pluginId: session.pluginId,
    capabilityId: session.capabilityId,
    subscriptionKey,
    filters,
    startedAt: new Date().toISOString(),
    unitsDelivered: 0,
    unitsQuota: session.requestedUnits,
    active: true,
  };

  activeStreams.set(sessionId, subscription);
  return subscription;
}

/**
 * @name streamEvents
 * @description Async generator that yields enriched premium events for a session.
 *
 * This is the core delivery loop. It:
 *   1. Loads the provider adapter for the session's plugin/capability.
 *   2. Subscribes with the session's filters.
 *   3. For each provider event: enriches with session metadata, appends to the
 *      event store, decrements the unit quota, and yields the enriched event.
 *   4. Stops when the quota reaches zero, the provider iterable ends, or the
 *      stream is cancelled via `stopStream()`.
 *
 * @param sessionId - The active session id.
 * @returns Async generator yielding `ProviderEvent` enriched with session metadata.
 *
 * @usedBy `remote/server.ts` → SSE response writer
 */
export async function* streamEvents(sessionId: string): AsyncGenerator<ProviderEvent, void, unknown> {
  const subscription = activeStreams.get(sessionId);
  if (!subscription) return;

  const session = getPremiumSession(sessionId);
  if (!session || session.status !== 'active') return;

  const iterable = await subscribeToProvider(
    subscription.pluginId,
    subscription.capabilityId,
    subscription.filters,
  );
  if (!iterable) return;

  const controller = new AbortController();
  streamControllers.set(sessionId, controller);

  try {
    for await (const event of iterable) {
      if (controller.signal.aborted) break;
      if (!subscription.active) break;

      // Enrich and store the event.
      appendEvent({
        eventId: event.eventId,
        sessionId,
        pluginId: subscription.pluginId,
        capabilityId: subscription.capabilityId,
        eventType: event.eventType,
        observedAt: event.observedAt,
        payload: event.payload,
        deliveredAt: new Date().toISOString(),
      });

      subscription.unitsDelivered++;
      const remaining = decrementSessionQuota(sessionId);
      if (remaining <= 0) {
        subscription.active = false;
        yield event;
        break;
      }

      yield event;
    }
  } finally {
    streamControllers.delete(sessionId);
    if (subscription.active) {
      subscription.active = false;
    }
    activeStreams.delete(sessionId);
  }
}

/**
 * @name stopStream
 * @description Stop an active stream subscription.
 *
 * Aborts the provider async iterable and marks the subscription as inactive.
 * The session is not closed — the buyer can resume with a replay query.
 *
 * @param sessionId - The session id to stop streaming for.
 *
 * @usedBy `remote/server.ts` → client disconnect handler
 */
export function stopStream(sessionId: string): void {
  const controller = streamControllers.get(sessionId);
  if (controller) {
    controller.abort();
    streamControllers.delete(sessionId);
  }

  const subscription = activeStreams.get(sessionId);
  if (subscription) {
    subscription.active = false;
    activeStreams.delete(sessionId);
  }
}

/**
 * @name replayEvents
 * @description Replay past events for a session within the replay window.
 *
 * Used when a client reconnects and needs to catch up on events missed
 * during the disconnection period.
 *
 * @param sessionId - The session id to replay events for.
 * @param since     - Optional ISO timestamp; only events after this are returned.
 * @returns Array of `ProviderEvent` records from the event store.
 *
 * @usedBy `remote/server.ts` → SSE replay before live stream
 */
export function replayEvents(sessionId: string, since?: string): ProviderEvent[] {
  return getEvents({ sessionId, since }).map(record => ({
    eventId: record.eventId,
    eventType: record.eventType,
    observedAt: record.observedAt,
    payload: record.payload,
  }));
}

/**
 * @name getActiveStreamCount
 * @description Return the number of currently active stream subscriptions.
 *
 * @usedBy `metrics.ts`
 */
export function getActiveStreamCount(): number {
  return activeStreams.size;
}

/**
 * @name stopAllStreams
 * @description Stop all active streams. Called during graceful shutdown.
 *
 * @usedBy `remote/server.ts` shutdown handler
 */
export function stopAllStreams(): void {
  for (const sessionId of activeStreams.keys()) {
    stopStream(sessionId);
  }
}