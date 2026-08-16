/**
 * @name premium/session-manager
 * @description In-memory lifecycle manager for premium session plans.
 *
 * When an agent calls `sap_premium_create_session_plan` (via `premium-tools.ts`),
 * this module resolves the requested capability, clamps units/TTL to the
 * capability's pricing bounds, checks provider env readiness, calculates the
 * estimated USD price, and stores the resulting `PremiumSessionRecord` in an
 * in-memory `Map` keyed by session id.
 *
 * Session lifecycle states:
 *
 *   pending_payment → active → closed
 *   pending_payment → expired (if TTL passes before activation)
 *   blocked_requires_provider (if provider env vars are not set)
 *
 * Sessions auto-expire after their TTL and are pruned on every create/list
 * call. A hard cap of 1 000 concurrent session plans prevents unbounded growth.
 *
 * @flow
 *   1. MCP tool `sap_premium_session_start` → `createPremiumSessionPlan()`.
 *   2. MCP tool `sap_premium_activate_session` → `activateSession()`.
 *   3. MCP tool `sap_premium_close_session` → `closeSession()`.
 *   4. MCP tool `sap_premium_session_status` → `getPremiumSession()` / `listPremiumSessions()`.
 *
 * @module premium/session-manager
 */

import { randomUUID } from 'node:crypto';
import { findPremiumCapability, findPremiumCapabilityById } from './builtin-plugins.js';
import type { PremiumActivationResult, PremiumSessionRecord, PremiumSessionRequest } from './types.js';

/**
 * @description In-memory store of active session plans, keyed by session id.
 * Not exported — access is mediated through the public functions below.
 */
const sessions = new Map<string, PremiumSessionRecord>();

/**
 * @description Hard cap on concurrent session plans to prevent unbounded
 * memory growth in long-running MCP server processes.
 *
 * Default: 10_000 (tuned for a 312GB RAM production server).
 * Override via `SAP_MCP_PREMIUM_MAX_SESSIONS` env var.
 */
const MAX_PREMIUM_SESSION_PLANS = (() => {
  const raw = process.env.SAP_MCP_PREMIUM_MAX_SESSIONS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 10_000;
})();

/**
 * @name clampInteger
 * @description Safely clamp an arbitrary numeric value to an integer within [min, max].
 *
 * Non-finite values (NaN, Infinity) fall back to `min`. The value is truncated
 * to an integer before clamping.
 *
 * @param value - Raw input (may be float, NaN, or Infinity).
 * @param min   - Lower bound (inclusive).
 * @param max   - Upper bound (inclusive).
 * @returns Integer clamped to [min, max].
 *
 * @internal
 */
function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/**
 * @name pruneExpiredSessions
 * @description Remove all sessions whose `expiresAt` has passed, then evict
 * the oldest sessions if the store exceeds `MAX_PREMIUM_SESSION_PLANS`.
 *
 * Called on every `createPremiumSessionPlan` and `listPremiumSessions` call
 * to keep the store bounded without requiring a background timer.
 *
 * @internal
 */
function pruneExpiredSessions(): void {
  const now = Date.now();
  for (const [sessionId, record] of sessions.entries()) {
    if (record.status === 'active' || record.status === 'closed') continue;
    if (new Date(record.expiresAt).getTime() <= now) {
      sessions.delete(sessionId);
    }
  }

  // Evict oldest entries (Map preserves insertion order) if still over cap.
  while (sessions.size > MAX_PREMIUM_SESSION_PLANS) {
    const oldestSessionId = sessions.keys().next().value as string | undefined;
    if (!oldestSessionId) break;
    sessions.delete(oldestSessionId);
  }
}

/**
 * @name createPremiumSessionPlan
 * @description Create and store a premium session plan for a buyer request.
 *
 * Resolution steps:
 *   1. Prune expired/overflow sessions from the store.
 *   2. Look up the capability via `findPremiumCapability` (builtin + private).
 *   3. Clamp `requestedUnits` to [minUnits, maxUnits] and `ttlSeconds` to [60, 3600].
 *   4. Compute `estimatedPriceUsd = requestedUnits × unitPriceUsd`.
 *   5. Check whether all `providerEnv` vars are set in `process.env`.
 *   6. Set status to `blocked_requires_provider` if provider is not ready,
 *      otherwise `pending_payment`.
 *   7. Generate a `sap-premium-<uuid>` session id, store, and return the record.
 *
 * @param request - Buyer-provided session request (plugin, capability, units, TTL).
 * @returns The stored `PremiumSessionRecord` with server-generated fields.
 * @throws {Error} If the plugin/capability pair is not found in the catalog.
 *
 * @usedBy `premium-tools.ts` → MCP tool `sap_premium_session_start`
 */
export function createPremiumSessionPlan(request: PremiumSessionRequest): PremiumSessionRecord {
  pruneExpiredSessions();

  // Try exact plugin/capability match first, then fall back to auto-discovery
  // across all plugins. This eliminates the friction of needing to know the
  // exact pluginId for a capability.
  let resolved = findPremiumCapability(request.pluginId, request.capabilityId, request.capabilityType);
  if (!resolved) {
    // Auto-discover: search all plugins for the capability.
    resolved = findPremiumCapabilityById(request.capabilityId, request.capabilityType);
  }
  if (!resolved) {
    throw new Error(
      `unknown_premium_capability:${request.pluginId}/${request.capabilityId}. ` +
      `The capability was not found in any plugin. ` +
      `Use sap_premium_plugin_catalog to list all available capabilities and their plugin IDs.`,
    );
  }

  const { capability } = resolved;

  // Clamp buyer-requested values to the capability's allowed bounds.
  const requestedUnits = clampInteger(request.requestedUnits, capability.pricing.minUnits, capability.pricing.maxUnits);
  const ttlSeconds = clampInteger(request.ttlSeconds, 60, 3_600);

  // Calculate estimated price with 6 decimal places of precision.
  const estimatedPriceUsd = Number((requestedUnits * capability.pricing.unitPriceUsd).toFixed(6));

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  // Provider readiness: every declared env var must be truthy in process.env.
  const providerReady = capability.providerEnv.every(envName => Boolean(process.env[envName]));

  // Status depends on whether the capability needs an external provider.
  const status = capability.requiresProvider && !providerReady ? 'blocked_requires_provider' : 'pending_payment';

  // Next-action guidance is the only human-readable instruction the agent gets.
  const nextAction = capability.requiresProvider && !providerReady
    ? `Configure provider env vars first: ${capability.providerEnv.join(', ')}. No x402 payment should be attempted until the provider is ready.`
    : 'Activate this plan through the premium stream/webhook transport once the paid delivery endpoint is enabled. Keep payment receipts bound to this session id.';

  const record: PremiumSessionRecord = {
    ...request,
    requestedUnits,
    ttlSeconds,
    sessionId: `sap-premium-${randomUUID()}`,
    status,
    providerReady,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    estimatedPriceUsd,
    nextAction,
  };

  sessions.set(record.sessionId, record);
  return record;
}

/**
 * @name getPremiumSession
 * @description Retrieve a session plan by id, lazily marking it as expired.
 *
 * If the session's `expiresAt` has passed and it is not already marked
 * `expired`, the stored record is updated in place and the expired version
 * is returned. A shallow copy is always returned to prevent external mutation
 * of the internal store.
 *
 * @param sessionId - The session id returned by `createPremiumSessionPlan`.
 * @returns The session record, or `null` if not found.
 *
 * @usedBy `premium-tools.ts` → MCP tool `sap_premium_session_status`
 */
export function getPremiumSession(sessionId: string): PremiumSessionRecord | null {
  const record = sessions.get(sessionId);
  if (!record) return null;

  // Lazy expiration: update status in-place if TTL has passed.
  // Active sessions are not expired by TTL — they are closed by the delivery rail.
  if (record.status !== 'active' && record.status !== 'closed' && record.status !== 'expired') {
    if (new Date(record.expiresAt).getTime() <= Date.now()) {
      const expired = { ...record, status: 'expired' as const, nextAction: 'Create a fresh session plan before opening a paid stream or webhook.' };
      sessions.set(sessionId, expired);
      return expired;
    }
  }

  return { ...record };
}

/**
 * @name listPremiumSessions
 * @description List all non-null session plans after pruning expired entries.
 *
 * @returns Array of all current session records (including lazily-expired ones).
 *
 * @usedBy `premium-tools.ts` → MCP tool `sap_premium_session_status`
 */
export function listPremiumSessions(): PremiumSessionRecord[] {
  pruneExpiredSessions();
  return [...sessions.keys()].map(sessionId => getPremiumSession(sessionId)).filter((record): record is PremiumSessionRecord => record !== null);
}

/**
 * @name activateSession
 * @description Transition a session from `pending_payment` to `active`.
 *
 * Called by the activation manager after the x402/pay.sh receipt has been
 * verified. The session's `nextAction` is updated to reflect the active state.
 * If the session is not in `pending_payment` status, activation is rejected.
 *
 * @param sessionId - The session id to activate.
 * @returns The activation result with `status=active` on success, or the
 *   blocking status on failure.
 *
 * @usedBy `activation-manager.ts:activateSession`
 */
export function activateSession(sessionId: string): PremiumActivationResult {
  const record = sessions.get(sessionId);
  if (!record) {
    return {
      sessionId,
      status: 'expired',
      activatedAt: null,
      receiptBound: false,
      unitsQuota: 0,
      reason: 'Session not found. Create a fresh session plan before activation.',
    };
  }

  if (record.status === 'blocked_requires_provider') {
    return {
      sessionId,
      status: 'blocked_requires_provider',
      activatedAt: null,
      receiptBound: false,
      unitsQuota: 0,
      reason: 'Provider is not ready. Configure provider env vars before activating.',
    };
  }

  if (record.status === 'expired') {
    return {
      sessionId,
      status: 'expired',
      activatedAt: null,
      receiptBound: false,
      unitsQuota: 0,
      reason: 'Session has expired. Create a fresh session plan.',
    };
  }

  if (record.status === 'active') {
    return {
      sessionId,
      status: 'active',
      activatedAt: record.createdAt,
      receiptBound: true,
      unitsQuota: record.requestedUnits,
      reason: 'Session is already active.',
    };
  }

  if (record.status === 'closed') {
    return {
      sessionId,
      status: 'closed',
      activatedAt: null,
      receiptBound: false,
      unitsQuota: 0,
      reason: 'Session has been closed. Create a fresh session plan.',
    };
  }

  // Status is pending_payment — transition to active.
  const now = new Date().toISOString();
  const activated: PremiumSessionRecord = {
    ...record,
    status: 'active',
    nextAction: 'Session is active. Stream/webhook delivery is enabled. Units are metered until quota is reached or the session is closed.',
  };
  sessions.set(sessionId, activated);

  return {
    sessionId,
    status: 'active',
    activatedAt: now,
    receiptBound: true,
    unitsQuota: record.requestedUnits,
    reason: 'Session activated successfully. Delivery rail is enabled.',
  };
}

/**
 * @name closeSession
 * @description Transition an active session to `closed`.
 *
 * Called by the delivery rail when the unit quota is reached, when the buyer
 * explicitly closes the session, or when the server shuts down gracefully.
 *
 * @param sessionId - The session id to close.
 * @param reason    - Human-readable reason for closure.
 * @returns True if the session was closed, false if it was not found or not active.
 *
 * @usedBy `stream-broker.ts`, `webhook-engine.ts`, `premium-tools.ts`
 */
export function closeSession(sessionId: string, reason: string): boolean {
  const record = sessions.get(sessionId);
  if (!record || record.status !== 'active') return false;

  const closed: PremiumSessionRecord = {
    ...record,
    status: 'closed',
    nextAction: `Session closed: ${reason}. Create a fresh session plan to resume delivery.`,
  };
  sessions.set(sessionId, closed);
  return true;
}

/**
 * @name decrementSessionQuota
 * @description Decrement the remaining units quota for an active session.
 *
 * Called by the stream broker / webhook engine after each delivered event.
 * When the quota reaches zero, the session is automatically closed.
 *
 * @param sessionId - The active session id.
 * @returns The remaining units after decrement, or -1 if the session is not active.
 *
 * @usedBy `stream-broker.ts`, `webhook-engine.ts`
 */
export function decrementSessionQuota(sessionId: string): number {
  const record = sessions.get(sessionId);
  if (!record || record.status !== 'active') return -1;

  const remaining = Math.max(0, record.requestedUnits - 1);
  const updated: PremiumSessionRecord = {
    ...record,
    requestedUnits: remaining,
  };
  sessions.set(sessionId, updated);

  if (remaining === 0) {
    closeSession(sessionId, 'Unit quota exhausted.');
  }

  return remaining;
}

/**
 * @name clearAllSessions
 * @description Clear all sessions from the in-memory store.
 *
 * Used in tests and during graceful server shutdown.
 *
 * @internal
 */
export function clearAllSessions(): void {
  sessions.clear();
}