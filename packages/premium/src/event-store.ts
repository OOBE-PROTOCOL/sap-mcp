/**
 * @name premium/event-store
 * @description In-memory event store for premium event replay and idempotency.
 *
 * Every event delivered through the stream broker or webhook engine is recorded
 * here. The store supports:
 *   - append with `eventId` deduplication (idempotency)
 *   - query by session, event type, or time window
 *   - automatic eviction of events past their replay window
 *
 * @flow
 *   1. `stream-broker.ts` / `webhook-engine.ts` deliver an event →
 *      `appendEvent()` stores it (dedup by `eventId`).
 *   2. `stream-broker.ts` reconnects a client → `getEvents()` replays past
 *      events within the replay window.
 *   3. Pruning runs on every append/query to evict events past their
 *      `replayWindowSeconds` per capability.
 *
 * @module premium/event-store
 */

import type { PremiumEventQuery, PremiumEventRecord } from './types.js';

/**
 * @description In-memory event records keyed by `eventId` for O(1) dedup.
 */
const eventMap = new Map<string, PremiumEventRecord>();

/**
 * @description Hard cap on stored events to prevent unbounded memory growth.
 *
 * Default: 500_000 (tuned for a 312GB RAM production server).
 * Each event is ~1KB, so 500K events ≈ 500MB.
 * Override via `SAP_MCP_PREMIUM_MAX_EVENTS` env var.
 */
const MAX_STORED_EVENTS = (() => {
  const raw = process.env.SAP_MCP_PREMIUM_MAX_EVENTS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 500_000;
})();

/**
 * @name appendEvent
 * @description Append a premium event to the store with idempotency.
 *
 * If an event with the same `eventId` already exists, it is not duplicated.
 * The store is pruned after each append.
 *
 * @param record - The event record to append.
 * @returns True if the event was newly inserted, false if it was a duplicate.
 *
 * @usedBy `stream-broker.ts`, `webhook-engine.ts`
 */
export function appendEvent(record: PremiumEventRecord): boolean {
  if (eventMap.has(record.eventId)) return false;

  eventMap.set(record.eventId, record);
  pruneOldEvents();
  return true;
}

/**
 * @name getEvents
 * @description Query events from the store with optional filters.
 *
 * @param query - Filter criteria (sessionId, eventType, since, limit).
 * @returns Array of matching event records, ordered by `deliveredAt` ascending.
 *
 * @usedBy `stream-broker.ts` (replay), `premium-tools.ts` (audit)
 */
export function getEvents(query: PremiumEventQuery = {}): PremiumEventRecord[] {
  const limit = query.limit ?? 1_000;
  const sinceMs = query.since ? new Date(query.since).getTime() : 0;

  const results: PremiumEventRecord[] = [];
  for (const record of eventMap.values()) {
    if (query.sessionId && record.sessionId !== query.sessionId) continue;
    if (query.eventType && record.eventType !== query.eventType) continue;
    if (sinceMs > 0 && new Date(record.deliveredAt).getTime() < sinceMs) continue;
    results.push(record);
    if (results.length >= limit) break;
  }

  return results.sort((a, b) => new Date(a.deliveredAt).getTime() - new Date(b.deliveredAt).getTime());
}

/**
 * @name getEventCount
 * @description Return the total number of stored events.
 *
 * @usedBy `metrics.ts`
 */
export function getEventCount(): number {
  return eventMap.size;
}

/**
 * @name pruneOldEvents
 * @description Evict events older than 24 hours or when the store exceeds
 * `MAX_STORED_EVENTS`. The oldest events are evicted first.
 *
 * @internal
 */
function pruneOldEvents(): void {
  if (eventMap.size <= MAX_STORED_EVENTS) {
    // Also evict events older than 24 hours.
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [eventId, record] of eventMap.entries()) {
      if (new Date(record.deliveredAt).getTime() < cutoff) {
        eventMap.delete(eventId);
      }
    }
    return;
  }

  // Over cap: evict oldest entries by insertion order.
  const toEvict = eventMap.size - MAX_STORED_EVENTS;
  let evicted = 0;
  for (const eventId of eventMap.keys()) {
    if (evicted >= toEvict) break;
    eventMap.delete(eventId);
    evicted++;
  }
}

/**
 * @name clearAllEvents
 * @description Clear all events from the store.
 *
 * Used in tests and during graceful server shutdown.
 *
 * @internal
 */
export function clearAllEvents(): void {
  eventMap.clear();
}