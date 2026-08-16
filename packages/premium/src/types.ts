/**
 * @name premium/types
 * @description Core type definitions for the SAP MCP Premium plugin subsystem.
 *
 * This module is the single source of truth for every shape that flows through
 * the premium layer: capability definitions, plugin manifests, pricing policies,
 * delivery contracts, validation reports, and session records.
 *
 * @flow
 *   1. `builtin-plugins.ts` and `private-manifest-loader.ts` use these types
 *      to construct/parse `PremiumPluginManifest` objects.
 *   2. `plugin-validator.ts` validates unknown manifests against the same shapes
 *      and emits `PremiumValidationReport`.
 *   3. `session-manager.ts` consumes `PremiumSessionRequest` and produces
 *      `PremiumSessionRecord` for the MCP tool layer (`premium-tools.ts`).
 *   4. `manifest-builder.ts` uses these types to generate template manifests
 *      for custom plugin authors.
 *   5. `index.ts` re-exports everything for external consumers.
 *
 * @module premium/types
 */

/* -------------------------------------------------------------------------- */
/* Capability type & status                                                   */
/* -------------------------------------------------------------------------- */

/**
 * @name PremiumCapabilityType
 * @description The kind of paid delivery a premium capability exposes.
 *
 * - `stream`  — Continuous low-latency event stream over MCP streamable HTTP.
 * - `webhook` — Signed HTTPS callbacks delivered to a buyer-owned endpoint.
 * - `tool`    — Synchronous paid tool call settled per session.
 *
 * @usedBy `PremiumCapabilityDefinition.type`, `PremiumSessionRequest.capabilityType`
 */
export type PremiumCapabilityType = 'stream' | 'webhook' | 'tool';

/**
 * @name PremiumCapabilityStatus
 * @description Lifecycle state of a premium capability.
 *
 * - `available`           — Provider is configured and the capability is ready.
 * - `requires-provider`   — At least one env var in `providerEnv` is not set.
 * - `planned`             — Capability is declared but not yet operational.
 *
 * @usedBy `PremiumCapabilityDefinition.status`
 */
export type PremiumCapabilityStatus = 'available' | 'requires-provider' | 'planned';

/* -------------------------------------------------------------------------- */
/* Pricing                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * @name PremiumPricingTier
 * @description High-level pricing tier label for catalog and billing grouping.
 *
 * @usedBy `PremiumPricingPolicy.tier`
 */
export type PremiumPricingTier = 'premium-stream' | 'premium-webhook' | 'premium-tool';

/**
 * @name PremiumPricingModel
 * @description x402/pay.sh metering model — how the buyer is charged per unit.
 *
 * - `x402-per-open`    — Charged once per stream open.
 * - `x402-per-minute`  — Charged per minute of stream uptime.
 * - `x402-per-event`   — Charged per delivered webhook event.
 * - `x402-session`     — Charged per tool session regardless of duration.
 *
 * @usedBy `PremiumPricingPolicy.model`
 */
export type PremiumPricingModel = 'x402-per-open' | 'x402-per-minute' | 'x402-per-event' | 'x402-session';

/**
 * @name PremiumPricingPolicy
 * @description Full pricing contract for a premium capability.
 *
 * Binds a capability to a specific x402/pay.sh metering model, unit price,
 * unit bounds, and settlement rail.
 *
 * @property tier         — Catalog grouping label.
 * @property model        — Metering model determining how units are counted.
 * @property unit         — The billable unit (open, minute, event, session).
 * @property unitPriceUsd — Price in USD per single unit.
 * @property minUnits     — Minimum units a buyer must purchase.
 * @property maxUnits     — Maximum units a buyer can purchase in one session.
 * @property settlement   — Settlement rail: `x402` or `pay.sh`.
 *
 * @usedBy `PremiumCapabilityDefinition.pricing`
 */
export interface PremiumPricingPolicy {
  tier: PremiumPricingTier;
  model: PremiumPricingModel;
  unit: 'open' | 'minute' | 'event' | 'session';
  unitPriceUsd: number;
  minUnits: number;
  maxUnits: number;
  settlement: 'x402' | 'pay.sh';
}

/* -------------------------------------------------------------------------- */
/* Delivery contract                                                          */
/* -------------------------------------------------------------------------- */

/**
 * @name PremiumDeliveryContract
 * @description Transport-level delivery guarantee for a stream or webhook capability.
 *
 * Declares which transport, which event ids, target latency, and replay window
 * the provider commits to when delivering paid events.
 *
 * @property transport            — MCP streamable HTTP or plain webhook HTTP.
 * @property events               — Exact event ids this capability can emit/deliver.
 * @property latencyTargetMs      — Target end-to-end latency in milliseconds.
 * @property replayWindowSeconds  — How long past events remain available for replay.
 *
 * @usedBy `PremiumCapabilityDefinition.delivery`
 */
export interface PremiumDeliveryContract {
  transport: 'mcp-streamable-http' | 'webhook-http';
  events: string[];
  latencyTargetMs: number;
  replayWindowSeconds: number;
}

/* -------------------------------------------------------------------------- */
/* Capability & manifest                                                      */
/* -------------------------------------------------------------------------- */

/**
 * @name PremiumCapabilityDefinition
 * @description A single paid capability inside a premium plugin manifest.
 *
 * Combines identity, type, human-readable docs, provider dependency,
 * JSON schemas for input/output, pricing policy, and delivery contract.
 *
 * @property id               — Unique capability id within the plugin.
 * @property type             — `stream`, `webhook`, or `tool`.
 * @property title            — Human-readable capability label.
 * @property description      — Agent-facing description with payment boundary.
 * @property status           — Lifecycle state.
 * @property requiresProvider — Whether external provider env vars are needed.
 * @property providerEnv      — Env var names the runtime must set (never secrets).
 * @property inputSchema      — JSON Schema for capability input arguments.
 * @property outputSchema     — JSON Schema for capability output events/results.
 * @property pricing          — Pricing policy for x402/pay.sh metering.
 * @property delivery         — Delivery contract for transport guarantees.
 *
 * @usedBy `PremiumPluginManifest.capabilities`, `findPremiumCapability`
 */
export interface PremiumCapabilityDefinition {
  id: string;
  type: PremiumCapabilityType;
  title: string;
  description: string;
  status: PremiumCapabilityStatus;
  requiresProvider: boolean;
  providerEnv: string[];
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  pricing: PremiumPricingPolicy;
  delivery: PremiumDeliveryContract;
}

/**
 * @name PremiumPluginManifest
 * @description Top-level manifest describing a premium plugin and its capabilities.
 *
 * This is the data-only contract that flows through validation, discovery,
 * session planning, and the MCP tool layer. It never contains executable code
 * or provider secrets.
 *
 * @property id           — Unique plugin id (lowercase, dots/dashes allowed).
 * @property version      — Semver version string.
 * @property title        — Human-readable plugin name.
 * @property description  — What the plugin sells and which agents should use it.
 * @property publisher    — Publisher identity for registry and enterprise review.
 * @property visibility    — `public`, `private`, or `enterprise`.
 * @property capabilities — Array of paid capability definitions.
 *
 * @usedBy `builtin-plugins.ts`, `private-manifest-loader.ts`, `plugin-validator.ts`, `manifest-builder.ts`
 */
export interface PremiumPluginManifest {
  id: string;
  version: string;
  title: string;
  description: string;
  publisher: string;
  visibility: 'public' | 'private' | 'enterprise';
  capabilities: PremiumCapabilityDefinition[];
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * @name PremiumValidationIssue
 * @description A single validation issue found in a manifest or capability.
 *
 * @property path      — JSON path to the offending field (e.g. `capabilities[0].pricing`).
 * @property severity  — `error` blocks acceptance; `warning` is informational.
 * @property message   — Human-readable explanation of the issue.
 *
 * @usedBy `PremiumValidationReport`, `plugin-validator.ts`
 */
export interface PremiumValidationIssue {
  path: string;
  severity: 'error' | 'warning';
  message: string;
}

/**
 * @name PremiumValidationReport
 * @description Result of validating a premium plugin manifest.
 *
 * @property valid    — True when no error-severity issues were found.
 * @property errors   — All error-severity issues (empty when valid).
 * @property warnings — All warning-severity issues.
 *
 * @usedBy `plugin-validator.ts:validatePremiumPluginManifest`, `private-manifest-loader.ts`
 */
export interface PremiumValidationReport {
  valid: boolean;
  errors: PremiumValidationIssue[];
  warnings: PremiumValidationIssue[];
}

/* -------------------------------------------------------------------------- */
/* Session planning                                                           */
/* -------------------------------------------------------------------------- */

/**
 * @name PremiumSessionRequest
 * @description Buyer-side request to create a premium session plan.
 *
 * Produced by the MCP tool layer (`premium-tools.ts`) when an agent calls
 * `sap_premium_create_session_plan`.
 *
 * @property pluginId        — Which premium plugin to activate.
 * @property capabilityId    — Which capability within that plugin.
 * @property capabilityType  — `stream`, `webhook`, or `tool`.
 * @property requestedUnits  — Number of billable units the buyer wants.
 * @property ttlSeconds      — Session validity window (clamped 60–3600).
 * @property maxPriceUsd     — Optional price ceiling; session rejected if exceeded.
 * @property consumer        — Optional consumer identity for audit trails.
 *
 * @usedBy `session-manager.ts:createPremiumSessionPlan`
 */
export interface PremiumSessionRequest {
  pluginId: string;
  capabilityId: string;
  capabilityType: PremiumCapabilityType;
  requestedUnits: number;
  ttlSeconds: number;
  maxPriceUsd?: number;
  consumer?: string;
}

/**
 * @name PremiumSessionRecord
 * @description Persistent session plan returned to the agent after creation.
 *
 * Extends `PremiumSessionRequest` with server-generated fields: session id,
 * resolved status, provider readiness, timestamps, estimated price, and the
 * next action the agent should take.
 *
 * @property sessionId        — Server-generated unique session id (`sap-premium-<uuid>`).
 * @property status           — `pending_payment`, `blocked_requires_provider`, or `expired`.
 * @property providerReady    — Whether all `providerEnv` vars are set in the process.
 * @property createdAt        — ISO timestamp of session creation.
 * @property expiresAt        — ISO timestamp after which the session is expired.
 * @property estimatedPriceUsd — Calculated price: `requestedUnits × unitPriceUsd`.
 * @property nextAction       — Human-readable instruction for the agent's next step.
 *
 * @usedBy `session-manager.ts`, `premium-tools.ts`
 */
export interface PremiumSessionRecord extends PremiumSessionRequest {
  sessionId: string;
  status: 'pending_payment' | 'blocked_requires_provider' | 'expired' | 'active' | 'closed';
  providerReady: boolean;
  createdAt: string;
  expiresAt: string;
  estimatedPriceUsd: number;
  nextAction: string;
}

/* -------------------------------------------------------------------------- */
/* Activation & receipt binding                                               */
/* -------------------------------------------------------------------------- */

/**
 * @name PremiumActivationRequest
 * @description Buyer request to activate a pending session plan with a payment receipt.
 *
 * After the buyer settles the x402/pay.sh challenge on the delivery rail, they
 * call the activation endpoint with the receipt proof. The activation manager
 * verifies the receipt and transitions the session from `pending_payment` to `active`.
 *
 * @property sessionId      — The session plan id returned by `createPremiumSessionPlan`.
 * @property paymentReceipt — Opaque payment receipt string from x402/pay.sh settlement.
 * @property payerAddress   — Optional Solana payer public key for audit binding.
 * @property signature      — Optional buyer signature over `sessionId` for auth.
 *
 * @usedBy `activation-manager.ts:activateSession`
 */
export interface PremiumActivationRequest {
  sessionId: string;
  paymentReceipt: string;
  payerAddress?: string;
  signature?: string;
}

/**
 * @name PremiumActivationResult
 * @description Result of a session activation attempt.
 *
 * @property sessionId   — The activated session id.
 * @property status      — `active` on success, or the blocking status on failure.
 * @property activatedAt — ISO timestamp of activation (set when status=active).
 * @property receiptBound — Whether the payment receipt was bound to the session.
 * @property unitsQuota  — Remaining billable units the session can deliver.
 * @property reason      — Human-readable explanation of the result.
 *
 * @usedBy `activation-manager.ts`, `premium-tools.ts`
 */
export interface PremiumActivationResult {
  sessionId: string;
  status: 'active' | 'closed' | 'pending_payment' | 'blocked_requires_provider' | 'expired';
  activatedAt: string | null;
  receiptBound: boolean;
  unitsQuota: number;
  reason: string;
}

/* -------------------------------------------------------------------------- */
/* Event store & replay                                                       */
/* -------------------------------------------------------------------------- */

/**
 * @name PremiumEventRecord
 * @description A single delivered premium event stored for replay and idempotency.
 *
 * @property eventId     — Stable provider event id (idempotency key).
 * @property sessionId   — Session that this event was delivered under.
 * @property pluginId    — Plugin that produced the event.
 * @property capabilityId — Capability that produced the event.
 * @property eventType   — Event type from the capability delivery contract.
 * @property observedAt  — ISO timestamp when the provider observed the event.
 * @property payload     — Provider-specific event payload.
 * @property deliveredAt — ISO timestamp when SAP MCP delivered the event to the buyer.
 * @property receiptRef  — Optional x402 receipt reference bound to this event.
 *
 * @usedBy `event-store.ts`, `stream-broker.ts`, `webhook-engine.ts`
 */
export interface PremiumEventRecord {
  eventId: string;
  sessionId: string;
  pluginId: string;
  capabilityId: string;
  eventType: string;
  observedAt: string;
  payload: Record<string, unknown>;
  deliveredAt: string;
  receiptRef?: string;
}

/**
 * @name PremiumEventQuery
 * @description Query filters for retrieving events from the event store.
 *
 * @property sessionId  — Filter by session id.
 * @property eventType  — Filter by event type.
 * @property since      — Only events after this ISO timestamp.
 * @property limit      — Maximum events to return.
 *
 * @usedBy `event-store.ts:getEvents`
 */
export interface PremiumEventQuery {
  sessionId?: string;
  eventType?: string;
  since?: string;
  limit?: number;
}

/* -------------------------------------------------------------------------- */
/* Provider bridge                                                            */
/* -------------------------------------------------------------------------- */

/**
 * @name ProviderEvent
 * @description Raw event emitted by a premium provider adapter.
 *
 * This is the provider-side shape before SAP MCP enriches it with session metadata.
 *
 * @property eventId    — Stable provider event id for idempotency.
 * @property eventType  — Event type matching the capability delivery contract.
 * @property observedAt — ISO timestamp when the provider observed the event.
 * @property payload    — Provider-specific event payload.
 *
 * @usedBy `provider-bridge.ts:PremiumProviderAdapter.subscribe`
 */
export interface ProviderEvent {
  eventId: string;
  eventType: string;
  observedAt: string;
  payload: Record<string, unknown>;
}

/**
 * @name ProviderHealth
 * @description Health status of a premium provider adapter.
 *
 * @property healthy   — Whether the provider is connected and emitting events.
 * @property latencyMs — Round-trip latency to the provider in milliseconds.
 * @property lastError — Last error message if the provider is unhealthy.
 * @property lastEventAt — ISO timestamp of the last received event.
 *
 * @usedBy `provider-bridge.ts:PremiumProviderAdapter.health`
 */
export interface ProviderHealth {
  healthy: boolean;
  latencyMs?: number;
  lastError?: string;
  lastEventAt?: string;
}

/**
 * @name PremiumProviderAdapter
 * @description Interface that every premium provider adapter must implement.
 *
 * Provider adapters live in the private subrepo (`sap-mcp-premium-private/providers/`).
 * The public server loads them dynamically only when `SAP_MCP_ENABLE_PREMIUM_PLUGINS=true`
 * and the corresponding env vars are configured.
 *
 * @method connect     — Establish connection to the provider backend.
 * @method subscribe   — Return an async iterable of events matching the given filters.
 * @method disconnect  — Close the provider connection gracefully.
 * @method health      — Return current health status.
 *
 * @usedBy `provider-bridge.ts:loadProviderAdapter`
 */
export interface PremiumProviderAdapter {
  readonly pluginId: string;
  readonly capabilityId: string;
  connect(): Promise<void>;
  subscribe(filters: Record<string, unknown>): AsyncIterable<ProviderEvent>;
  disconnect(): Promise<void>;
  health(): Promise<ProviderHealth>;
}

/* -------------------------------------------------------------------------- */
/* Stream broker                                                              */
/* -------------------------------------------------------------------------- */

/**
 * @name PremiumStreamSubscription
 * @description Active stream subscription backed by an SSE/MCP streamable connection.
 *
 * @property sessionId   — The activated premium session id.
 * @property pluginId    — Plugin producing the stream.
 * @property capabilityId — Capability producing the stream.
 * @property subscriptionKey — De-duplication key from the stream input schema.
 * @property filters     — Narrow filters applied to the provider subscription.
 * @property startedAt   — ISO timestamp when the stream started delivering.
 * @property unitsDelivered — Number of billable units delivered so far.
 * @property unitsQuota  — Maximum billable units allowed by the session.
 * @property active      — Whether the stream is currently delivering events.
 *
 * @usedBy `stream-broker.ts`
 */
export interface PremiumStreamSubscription {
  sessionId: string;
  pluginId: string;
  capabilityId: string;
  subscriptionKey: string;
  filters: Record<string, unknown>;
  startedAt: string;
  unitsDelivered: number;
  unitsQuota: number;
  active: boolean;
}

/* -------------------------------------------------------------------------- */
/* Webhook engine                                                             */
/* -------------------------------------------------------------------------- */

/**
 * @name PremiumWebhookSubscription
 * @description Registered webhook target for signed HTTPS callback delivery.
 *
 * @property subscriptionId    — Server-generated unique subscription id.
 * @property sessionId         — The activated premium session id.
 * @property pluginId          — Plugin producing the webhook events.
 * @property capabilityId      — Capability producing the webhook events.
 * @property targetUrl         — HTTPS endpoint owned by the buyer.
 * @property events            — Exact event ids to deliver.
 * @property signingPublicKey  — Optional buyer public key for signature verification.
 * @property createdAt         — ISO timestamp of registration.
 * @property deliveriesAttempted — Total delivery attempts made.
 * @property deliveriesSucceeded — Total successful deliveries.
 * @property lastDeliveryAt    — ISO timestamp of the last delivery attempt.
 * @property lastDeliveryStatus — HTTP status code of the last delivery attempt.
 * @property active            — Whether the subscription is accepting new events.
 *
 * @usedBy `webhook-engine.ts`
 */
export interface PremiumWebhookSubscription {
  subscriptionId: string;
  sessionId: string;
  pluginId: string;
  capabilityId: string;
  targetUrl: string;
  events: string[];
  signingPublicKey?: string;
  createdAt: string;
  deliveriesAttempted: number;
  deliveriesSucceeded: number;
  lastDeliveryAt: string | null;
  lastDeliveryStatus: number | null;
  active: boolean;
}

/**
 * @name PremiumWebhookDelivery
 * @description Record of a single webhook delivery attempt.
 *
 * @property deliveryId    — Idempotent delivery id.
 * @property subscriptionId — The webhook subscription id.
 * @property eventId       — The premium event id being delivered.
 * @property eventType     — The event type being delivered.
 * @property deliveredAt   — ISO timestamp of the delivery attempt.
 * @property signature     — HMAC-SHA256 signature over {deliveryId, deliveredAt, payload}.
 * @property httpStatus    — HTTP status code from the buyer's endpoint.
 * @property success       — Whether the delivery was successful (2xx response).
 * @property responseBody  — Optional response body snippet for debugging.
 * @property retryCount    — Number of retry attempts for this delivery.
 *
 * @usedBy `webhook-engine.ts`
 */
export interface PremiumWebhookDelivery {
  deliveryId: string;
  subscriptionId: string;
  eventId: string;
  eventType: string;
  deliveredAt: string;
  signature: string;
  httpStatus: number | null;
  success: boolean;
  responseBody?: string;
  retryCount: number;
}

/* -------------------------------------------------------------------------- */
/* Metrics                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * @name PremiumMetricsSnapshot
 * @description Point-in-time metrics for the premium subsystem.
 *
 * Used by the health endpoint and MCP monitoring tools.
 *
 * @property activeSessions     — Currently active (status=active) sessions.
 * @property pendingSessions    — Sessions waiting for payment (status=pending_payment).
 * @property blockedSessions    — Sessions blocked by missing provider (status=blocked_requires_provider).
 * @property totalSessionsCreated — Lifetime count of sessions created.
 * @property totalEventsDelivered — Lifetime count of events delivered (streams + webhooks).
 * @property totalRevenueUsd   — Estimated revenue in USD (sum of activated sessions' estimatedPriceUsd).
 * @property activeStreams      — Currently active stream subscriptions.
 * @property activeWebhooks     — Currently active webhook subscriptions.
 * @property providerHealth     — Map of provider env var → health status.
 *
 * @usedBy `metrics.ts:getPremiumMetrics`, `premium-tools.ts`
 */
export interface PremiumMetricsSnapshot {
  activeSessions: number;
  pendingSessions: number;
  blockedSessions: number;
  totalSessionsCreated: number;
  totalEventsDelivered: number;
  totalRevenueUsd: number;
  activeStreams: number;
  activeWebhooks: number;
  providerHealth: Record<string, ProviderHealth>;
}