/**
 * @file session-manager.test.ts
 * @description Vitest suite for the premium session-manager module.
 *
 * Verifies that `createPremiumSessionPlan`, `getPremiumSession`, and
 * `listPremiumSessions` behave correctly across valid requests, unknown
 * capabilities, clamping bounds, provider-readiness gating, expiration,
 * and pruning.
 *
 * @module premium/session-manager.test
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  createPremiumSessionPlan,
  getPremiumSession,
  listPremiumSessions,
} from './session-manager.js';
import type { PremiumSessionRequest } from './types.js';

const JUPITER_ENV = 'SAP_MCP_PREMIUM_JUPITER_STREAM_URL';

function validRequest(overrides: Partial<PremiumSessionRequest> = {}): PremiumSessionRequest {
  return {
    pluginId: 'sap-premium-market-data',
    capabilityId: 'jupiter.quote.delta',
    capabilityType: 'stream',
    requestedUnits: 2,
    ttlSeconds: 120,
    ...overrides,
  };
}

describe('premium session-manager', () => {
  let originalJupiterEnv: string | undefined;

  beforeEach(() => {
    originalJupiterEnv = process.env[JUPITER_ENV];
    delete process.env[JUPITER_ENV];
  });

  afterEach(() => {
    if (originalJupiterEnv === undefined) {
      delete process.env[JUPITER_ENV];
    } else {
      process.env[JUPITER_ENV] = originalJupiterEnv;
    }
  });

  it('creates a session plan with sessionId, status, and estimatedPriceUsd for a valid request', () => {
    const record = createPremiumSessionPlan(validRequest());

    expect(record.sessionId).toMatch(/^sap-premium-/);
    expect(record.status).toBe('blocked_requires_provider');
    expect(record.estimatedPriceUsd).toBe(0.04);
    expect(record.providerReady).toBe(false);
    expect(record.createdAt).toBeTruthy();
    expect(record.expiresAt).toBeTruthy();
    expect(record.nextAction).toBeTruthy();
  });

  it('throws when the plugin id is unknown', () => {
    expect(() =>
      createPremiumSessionPlan(validRequest({ pluginId: 'nonexistent-plugin' })),
    ).toThrow();
  });

  it('throws when the capability id is unknown', () => {
    expect(() =>
      createPremiumSessionPlan(validRequest({ capabilityId: 'nonexistent.capability' })),
    ).toThrow();
  });

  it('clamps requestedUnits to the capability minUnits/maxUnits bounds', () => {
    const low = createPremiumSessionPlan(validRequest({ requestedUnits: -5 }));
    const high = createPremiumSessionPlan(validRequest({ requestedUnits: 999_999 }));

    // streamCapability jupiter.quote.delta has minUnits=1, maxUnits=120
    expect(low.requestedUnits).toBe(1);
    expect(high.requestedUnits).toBe(120);
  });

  it('clamps ttlSeconds to [60, 3600]', () => {
    const tooShort = createPremiumSessionPlan(validRequest({ ttlSeconds: 1 }));
    const tooLong = createPremiumSessionPlan(validRequest({ ttlSeconds: 100_000 }));

    expect(tooShort.ttlSeconds).toBe(60);
    expect(tooLong.ttlSeconds).toBe(3_600);
  });

  it('sets status=blocked_requires_provider when provider env vars are missing', () => {
    delete process.env[JUPITER_ENV];

    const record = createPremiumSessionPlan(validRequest());

    expect(record.providerReady).toBe(false);
    expect(record.status).toBe('blocked_requires_provider');
    expect(record.nextAction).toContain('Configure provider env vars first');
  });

  it('sets status=pending_payment when provider env vars are set', () => {
    process.env[JUPITER_ENV] = 'https://premium.example.invalid/stream';

    const record = createPremiumSessionPlan(validRequest());

    expect(record.providerReady).toBe(true);
    expect(record.status).toBe('pending_payment');
    expect(record.estimatedPriceUsd).toBe(0.04);
  });

  it('returns null from getPremiumSession for an unknown session id', () => {
    expect(getPremiumSession('sap-premium-nonexistent-uuid')).toBeNull();
  });

  it('returns a non-expired session from getPremiumSession before TTL', () => {
    const record = createPremiumSessionPlan(validRequest({ ttlSeconds: 60 }));
    const fetched = getPremiumSession(record.sessionId);
    expect(fetched).not.toBeNull();
    expect(fetched?.status).not.toBe('expired');
  });

  it('marks a session as expired when getPremiumSession is called after TTL expiry', () => {
    vi.useFakeTimers();
    try {
      const record = createPremiumSessionPlan(validRequest({ ttlSeconds: 60 }));
      // Advance 61 seconds to exceed the TTL.
      vi.advanceTimersByTime(61_000);

      const fetched = getPremiumSession(record.sessionId);
      expect(fetched).not.toBeNull();
      expect(fetched?.status).toBe('expired');
      expect(fetched?.nextAction).toContain('Create a fresh session plan');
    } finally {
      vi.useRealTimers();
    }
  });

  it('prunes expired sessions from listPremiumSessions', () => {
    vi.useFakeTimers();
    try {
      const record = createPremiumSessionPlan(validRequest({ ttlSeconds: 60 }));
      const sessionId = record.sessionId;
      // Advance 61 seconds to exceed the TTL.
      vi.advanceTimersByTime(61_000);

      const sessions = listPremiumSessions();
      // pruneExpiredSessions removes entries whose expiresAt has passed.
      // The specific session should no longer appear in the list.
      expect(sessions.map(s => s.sessionId)).not.toContain(sessionId);
      expect(getPremiumSession(sessionId)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('listPremiumSessions returns all active sessions', () => {
    const record1 = createPremiumSessionPlan(validRequest());
    const record2 = createPremiumSessionPlan(
      validRequest({
        capabilityId: 'pyth.price.tick',
        pluginId: 'sap-premium-market-data',
      }),
    );

    const sessions = listPremiumSessions();
    const sessionIds = sessions.map(s => s.sessionId);

    expect(sessionIds).toContain(record1.sessionId);
    expect(sessionIds).toContain(record2.sessionId);
  });
});