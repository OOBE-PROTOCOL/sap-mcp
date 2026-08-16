/**
 * @name premium/metrics
 * @description Metrics collector for the premium subsystem.
 *
 * Aggregates counts from the session manager, event store, stream broker,
 * webhook engine, and provider bridge into a single `PremiumMetricsSnapshot`.
 * Used by the health endpoint (`GET /premium/health.json`) and MCP monitoring
 * tools.
 *
 * @flow
 *   1. `remote/server.ts` → `GET /premium/health.json` → `getPremiumMetrics()`.
 *   2. `premium-tools.ts` → `sap_premium_metrics` → `getPremiumMetrics()`.
 *
 * @module premium/metrics
 */

import { listPremiumSessions } from './session-manager.js';
import { getEventCount } from './event-store.js';
import { getActiveStreamCount } from './stream-broker.js';
import { getActiveWebhookCount } from './webhook-engine.js';
import { getAllProviderHealth } from './provider-bridge.js';
import type { PremiumMetricsSnapshot } from './types.js';

/**
 * @name getPremiumMetrics
 * @description Collect a point-in-time metrics snapshot of the premium subsystem.
 *
 * @returns `PremiumMetricsSnapshot` with current counts and provider health.
 *
 * @usedBy `remote/server.ts` → `GET /premium/health.json`,
 *   `premium-tools.ts` → `sap_premium_metrics`
 */
export async function getPremiumMetrics(): Promise<PremiumMetricsSnapshot> {
  const sessions = listPremiumSessions();

  let activeSessions = 0;
  let pendingSessions = 0;
  let blockedSessions = 0;
  let totalRevenueUsd = 0;

  for (const session of sessions) {
    switch (session.status) {
      case 'active':
        activeSessions++;
        totalRevenueUsd += session.estimatedPriceUsd;
        break;
      case 'pending_payment':
        pendingSessions++;
        break;
      case 'blocked_requires_provider':
        blockedSessions++;
        break;
      default:
        break;
    }
  }

  const providerHealth = await getAllProviderHealth();

  return {
    activeSessions,
    pendingSessions,
    blockedSessions,
    totalSessionsCreated: sessions.length,
    totalEventsDelivered: getEventCount(),
    totalRevenueUsd: Number(totalRevenueUsd.toFixed(6)),
    activeStreams: getActiveStreamCount(),
    activeWebhooks: getActiveWebhookCount(),
    providerHealth,
  };
}