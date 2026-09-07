/**
 * @file premium-route-auth.test.ts
 * @description Regression tests for Bearer auth on premium delivery routes (Finding 2 — auth order).
 *
 * Solking disclosure 2026-09-07: tryPremiumRoute ran BEFORE the /mcp auth check
 * (server.ts request handler), so unauthenticated POST /premium/activate with a
 * fake receipt returned HTTP 200 + session active. Contract after the fix:
 * tryPremiumRoute receives the validated AuthResult and refuses every premium
 * route without a successful authentication.
 *
 * @module remote/premium-route-auth.test
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { tryPremiumRoute } from './premium-routes.js';

function mockReq(method: string, url: string, headers: Record<string, string> = {}): IncomingMessage {
  return {
    method,
    url,
    headers: { host: 'mcp.sap.oobeprotocol.ai', ...headers },
    on: vi.fn(),
  } as unknown as IncomingMessage;
}

interface CapturedResponse {
  status: number;
  headers: Record<string, unknown>;
  body: string;
}

function mockRes(): { res: ServerResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { status: 0, headers: {}, body: '' };
  const res = {
    writeHead: (status: number, headers: Record<string, unknown> = {}) => {
      captured.status = status;
      captured.headers = headers;
    },
    end: (body?: string) => {
      captured.body = body ?? '';
    },
    writableEnded: false,
  } as unknown as ServerResponse;
  return { res, captured };
}

describe('tryPremiumRoute — auth gate (Finding 2 regression)', () => {
  it('returns 401 for POST /premium/activate without auth', async () => {
    const { res, captured } = mockRes();
    const handled = await tryPremiumRoute(mockReq('POST', '/premium/activate'), res);
    expect(handled).toBe(true);
    expect(captured.status).toBe(401);
  });

  it('returns 401 for GET /premium/stream/:id without auth', async () => {
    const { res, captured } = mockRes();
    const handled = await tryPremiumRoute(mockReq('GET', '/premium/stream/sap-premium-x'), res);
    expect(handled).toBe(true);
    expect(captured.status).toBe(401);
  });

  it('returns 401 for POST /premium/webhook/register without auth', async () => {
    const { res, captured } = mockRes();
    const handled = await tryPremiumRoute(mockReq('POST', '/premium/webhook/register'), res);
    expect(handled).toBe(true);
    expect(captured.status).toBe(401);
  });

  it('returns 401 for GET /premium/webhook/:id/status without auth', async () => {
    const { res, captured } = mockRes();
    const handled = await tryPremiumRoute(mockReq('GET', '/premium/webhook/wh-x/status'), res);
    expect(handled).toBe(true);
    expect(captured.status).toBe(401);
  });

  it('returns 401 with WWW-Authenticate: Bearer challenge header', async () => {
    const { res, captured } = mockRes();
    await tryPremiumRoute(mockReq('POST', '/premium/activate'), res);
    expect(captured.headers['WWW-Authenticate']).toBe('Bearer');
  });

  it('returns 401 when auth result is unsuccessful', async () => {
    const { res, captured } = mockRes();
    const handled = await tryPremiumRoute(mockReq('POST', '/premium/activate'), res, { success: false, error: 'bad token' });
    expect(handled).toBe(true);
    expect(captured.status).toBe(401);
  });

  it('does NOT 401 an authenticated activation request (passes through to handler)', async () => {
    const { res, captured } = mockRes();
    const handled = await tryPremiumRoute(
      mockReq('POST', '/premium/activate'),
      res,
      { success: true, userId: 'tenant-1' },
    );
    expect(handled).toBe(true);
    // Activation without body fields → 400 missing_required_fields, NOT 401.
    expect(captured.status).toBe(400);
  });

  it('returns false for non-premium paths (route not consumed)', async () => {
    const { res } = mockRes();
    const handled = await tryPremiumRoute(mockReq('GET', '/health'), res);
    expect(handled).toBe(false);
  });

  it('returns false for POST /mcp (handled by the main transport path)', async () => {
    const { res } = mockRes();
    const handled = await tryPremiumRoute(mockReq('POST', '/mcp'), res);
    expect(handled).toBe(false);
  });
});