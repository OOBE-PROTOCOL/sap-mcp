/**
 * @name remote/premium-routes
 * @description HTTP route handlers for the premium delivery rail.
 *
 * This module owns the 4 premium delivery endpoints that the `RemoteMCPServer`
 * delegates to. Each handler is an async function that receives the raw
 * Node.js `IncomingMessage` / `ServerResponse` pair and returns nothing
 * (the response is written directly).
 *
 * Endpoints:
 *   POST   /premium/activate              — Activate a session with x402 receipt.
 *   GET    /premium/stream/:sessionId     — SSE stream for an active session.
 *   POST   /premium/webhook/register      — Register a webhook target.
 *   GET    /premium/webhook/:subId/status — Check webhook delivery status.
 *
 * Design principles:
 *   - Each handler is pure async — no shared mutable state outside the premium modules.
 *   - SSE streams use keep-alive with `X-Accel-Buffering: no` for nginx proxies.
 *   - Webhook delivery runs in the background via `setImmediate` to not block the
 *     HTTP response — the response returns the subscription immediately.
 *   - All errors return structured JSON with `error` and `message` fields.
 *
 * @module remote/premium-routes
 */

import * as http from 'node:http';
import { readRequestBody, parseJsonBody } from '@oobe-protocol-labs/sap-mcp-payments/http-adapter';
import {
  activatePremiumSession,
  startStream,
  streamEvents,
  replayEvents,
  stopStream,
  getPremiumSession,
  registerWebhook,
  startWebhookDelivery,
  getWebhookSubscription,
  getWebhookDeliveries,
} from '@oobe-protocol-labs/sap-mcp-premium';

/* -------------------------------------------------------------------------- */
/* Internal HTTP helpers                                                      */
/* -------------------------------------------------------------------------- */

/**
 * @name writeJsonResponse
 * @description Write a JSON HTTP response with standard headers.
 *
 * @param res     - The HTTP response object.
 * @param status  - HTTP status code.
 * @param body    - The response body (will be JSON-serialized).
 * @param headers - Optional additional headers.
 *
 * @internal
 */
function writeJsonResponse(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  headers: http.OutgoingHttpHeaders = {},
): void {
  const serialized = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(serialized),
    ...headers,
  });
  res.end(serialized);
}

/**
 * @name readJsonBody
 * @description Read and parse a JSON request body with bounds checking.
 *
 * @param req - The HTTP request object.
 * @returns Parsed JSON body, or `undefined` if the body is empty.
 * @throws {Error} If the body exceeds 256KB or is invalid JSON.
 *
 * @internal
 */
async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const raw = await readRequestBody(req);
  const parsed = parseJsonBody(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  return parsed as Record<string, unknown>;
}

/* -------------------------------------------------------------------------- */
/* 1. POST /premium/activate — Payment Gate                                   */
/* -------------------------------------------------------------------------- */

/**
 * @name handlePremiumActivation
 * @description Activate a pending premium session with a payment receipt.
 *
 * Expects a JSON body:
 *   { "sessionId": string, "paymentReceipt": string, "payerAddress"?: string }
 *
 * Returns:
 *   - 200 + `{ activation: PremiumActivationResult }` on success.
 *   - 400 if required fields are missing.
 *   - 402 if the session is not in `pending_payment` status.
 *
 * @param req - HTTP request.
 * @param res - HTTP response.
 */
export async function handlePremiumActivation(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    writeJsonResponse(res, 405, { error: 'method_not_allowed', message: 'Use POST.' });
    return;
  }

  let body: Record<string, unknown> | undefined;
  try {
    body = await readJsonBody(req);
  } catch {
    writeJsonResponse(res, 400, { error: 'invalid_body', message: 'Request body must be valid JSON under 256KB.' });
    return;
  }

  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
  const paymentReceipt = typeof body?.paymentReceipt === 'string' ? body.paymentReceipt.trim() : '';
  const payerAddress = typeof body?.payerAddress === 'string' ? body.payerAddress.trim() : undefined;

  if (!sessionId || !paymentReceipt) {
    writeJsonResponse(res, 400, {
      error: 'missing_required_fields',
      message: 'sessionId and paymentReceipt are required.',
    });
    return;
  }

  const activation = activatePremiumSession({
    sessionId,
    paymentReceipt,
    payerAddress: payerAddress || undefined,
  });

  const httpStatus = activation.status === 'active' ? 200 : 402;
  writeJsonResponse(res, httpStatus, { activation });
}

/* -------------------------------------------------------------------------- */
/* 2. GET /premium/stream/:sessionId — SSE Stream Broker                     */
/* -------------------------------------------------------------------------- */

/**
 * @name handlePremiumStream
 * @description Open an SSE stream for an active premium session.
 *
 * The client must send `Accept: text/event-stream`. The server:
 *   1. Validates the session is active.
 *   2. Replays past events within the replay window (if `since` query param is set).
 *   3. Opens a live provider subscription and streams events as SSE.
 *   4. Closes the stream when the client disconnects or the unit quota is exhausted.
 *
 * SSE format per event:
 *   event: <eventType>\n
 *   data: {<JSON payload>}\n\n
 *
 * @param req        - HTTP request.
 * @param res        - HTTP response.
 * @param sessionId  - The session id extracted from the URL path.
 */
export async function handlePremiumStream(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  sessionId: string,
): Promise<void> {
  if (req.method !== 'GET') {
    writeJsonResponse(res, 405, { error: 'method_not_allowed', message: 'Use GET with Accept: text/event-stream.' });
    return;
  }

  const accept = req.headers.accept ?? '';
  if (!accept.includes('text/event-stream')) {
    writeJsonResponse(res, 406, {
      error: 'not_acceptable',
      message: 'This endpoint requires Accept: text/event-stream.',
    });
    return;
  }

  const session = getPremiumSession(sessionId);
  if (!session || session.status !== 'active') {
    writeJsonResponse(res, 403, {
      error: 'session_not_active',
      message: 'Session not found or not activated. Call POST /premium/activate first.',
    });
    return;
  }

  // Parse subscription parameters from the query string.
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const subscriptionKey = url.searchParams.get('subscriptionKey') ?? sessionId;
  const since = url.searchParams.get('since') ?? undefined;

  const filters: Record<string, unknown> = {};
  for (const [key, value] of url.searchParams) {
    if (!['subscriptionKey', 'since'].includes(key)) {
      filters[key] = value;
    }
  }

  // Start the stream subscription.
  const subscription = await startStream(sessionId, subscriptionKey, filters);
  if (!subscription) {
    writeJsonResponse(res, 503, {
      error: 'stream_start_failed',
      message: 'Provider adapter not available or stream already active for this session.',
    });
    return;
  }

  // Write SSE headers — disable nginx/proxy buffering for real-time delivery.
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Replay past events within the replay window.
  for (const event of replayEvents(sessionId, since)) {
    res.write(`event: ${event.eventType}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  // Live stream — the async generator yields enriched events until quota or disconnect.
  try {
    for await (const event of streamEvents(sessionId)) {
      if (res.writableEnded) break;
      res.write(`event: ${event.eventType}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  } catch {
    // Provider errors are logged by the bridge — just end the stream cleanly.
  } finally {
    stopStream(sessionId);
    if (!res.writableEnded) {
      res.end();
    }
  }

  // Clean up on client disconnect.
  req.on('close', () => {
    stopStream(sessionId);
    if (!res.writableEnded) {
      res.end();
    }
  });
}

/* -------------------------------------------------------------------------- */
/* 3. POST /premium/webhook/register — Webhook Registration                   */
/* -------------------------------------------------------------------------- */

/**
 * @name handlePremiumWebhookRegister
 * @description Register an HTTPS webhook target for signed event delivery.
 *
 * Expects a JSON body:
 *   { "sessionId": string, "targetUrl": string, "events": string[],
 *     "signingPublicKey"?: string }
 *
 * Returns 201 with the subscription record. The delivery worker starts in the
 * background via `setImmediate` — the response does not wait for delivery.
 *
 * @param req - HTTP request.
 * @param res - HTTP response.
 */
export async function handlePremiumWebhookRegister(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    writeJsonResponse(res, 405, { error: 'method_not_allowed', message: 'Use POST.' });
    return;
  }

  let body: Record<string, unknown> | undefined;
  try {
    body = await readJsonBody(req);
  } catch {
    writeJsonResponse(res, 400, { error: 'invalid_body', message: 'Request body must be valid JSON under 256KB.' });
    return;
  }

  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
  const targetUrl = typeof body?.targetUrl === 'string' ? body.targetUrl.trim() : '';
  const events = Array.isArray(body?.events)
    ? body.events.filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
    : [];
  const signingPublicKey = typeof body?.signingPublicKey === 'string' ? body.signingPublicKey.trim() : undefined;

  if (!sessionId || !targetUrl || events.length === 0) {
    writeJsonResponse(res, 400, {
      error: 'missing_required_fields',
      message: 'sessionId, targetUrl, and a non-empty events array are required.',
    });
    return;
  }

  const subscription = await registerWebhook(sessionId, targetUrl, events, signingPublicKey || undefined);
  if (!subscription) {
    writeJsonResponse(res, 402, {
      error: 'webhook_registration_failed',
      message: 'Session not active, URL is invalid (HTTPS required, no private networks), or no matching events.',
    });
    return;
  }

  // Start the delivery worker in the background — fire-and-forget.
  // Errors are tracked in delivery records and don't crash the HTTP response.
  setImmediate(() => {
    void startWebhookDelivery(subscription).catch(error => {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[premium-routes] Webhook delivery error for ${subscription.subscriptionId}: ${msg}`);
    });
  });

  writeJsonResponse(res, 201, { subscription });
}

/* -------------------------------------------------------------------------- */
/* 4. GET /premium/webhook/:subId/status — Webhook Delivery Status            */
/* -------------------------------------------------------------------------- */

/**
 * @name handlePremiumWebhookStatus
 * @description Return the status of a webhook subscription with recent delivery records.
 *
 * @param req            - HTTP request.
 * @param res            - HTTP response.
 * @param subscriptionId - The subscription id extracted from the URL path.
 */
export async function handlePremiumWebhookStatus(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  subscriptionId: string,
): Promise<void> {
  if (req.method !== 'GET') {
    writeJsonResponse(res, 405, { error: 'method_not_allowed', message: 'Use GET.' });
    return;
  }

  const subscription = getWebhookSubscription(subscriptionId);
  if (!subscription) {
    writeJsonResponse(res, 404, { error: 'subscription_not_found' });
    return;
  }

  const deliveries = getWebhookDeliveries(subscriptionId);
  writeJsonResponse(res, 200, { subscription, deliveries });
}

/* -------------------------------------------------------------------------- */
/* Route matching helper                                                      */
/* -------------------------------------------------------------------------- */

/**
 * @name tryPremiumRoute
 * @description Check if a request targets a premium delivery endpoint and handle it.
 *
 * This is the single entry point called by the `RemoteMCPServer` request handler.
 * If the request matches a premium route, the handler runs and `true` is returned
 * (indicating the response was written). If no route matches, `false` is returned
 * and the caller continues to the next route handler.
 *
 * @param req - HTTP request.
 * @param res - HTTP response.
 * @returns `true` if a premium route handled the request, `false` otherwise.
 */
export async function tryPremiumRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const pathname = url.pathname;

  // POST /premium/activate
  if (req.method === 'POST' && pathname === '/premium/activate') {
    await handlePremiumActivation(req, res);
    return true;
  }

  // GET /premium/stream/:sessionId
  if (req.method === 'GET' && pathname.startsWith('/premium/stream/')) {
    const sessionId = pathname.slice('/premium/stream/'.length);
    if (sessionId.length > 0) {
      await handlePremiumStream(req, res, sessionId);
      return true;
    }
  }

  // POST /premium/webhook/register
  if (req.method === 'POST' && pathname === '/premium/webhook/register') {
    await handlePremiumWebhookRegister(req, res);
    return true;
  }

  // GET /premium/webhook/:subId/status
  if (req.method === 'GET' && pathname.startsWith('/premium/webhook/') && pathname.endsWith('/status')) {
    const subscriptionId = pathname.slice('/premium/webhook/'.length, -'/status'.length);
    if (subscriptionId.length > 0) {
      await handlePremiumWebhookStatus(req, res, subscriptionId);
      return true;
    }
  }

  return false;
}