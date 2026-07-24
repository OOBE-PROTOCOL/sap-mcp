/**
 * @name premium/index
 * @description Barrel export for the SAP MCP Premium plugin subsystem.
 *
 * Re-exports every public module in the premium layer so external consumers
 * (MCP tools, remote server, tests) can import from a single entry point:
 *
 * ```ts
 * import {
 *   listPremiumPlugins,
 *   createPremiumSessionPlan,
 *   activatePremiumSession,
 *   startStream,
 *   streamEvents,
 *   registerWebhook,
 *   getPremiumMetrics,
 *   validatePremiumPluginManifest,
 *   type PremiumPluginManifest,
 * } from '../premium/index.js';
 * ```
 *
 * @flow
 *   Import order matters only for readability, not for runtime:
 *   1. `builtin-plugins`       — Built-in plugin definitions and discovery helpers.
 *   2. `manifest-builder`      — Template generation for custom plugin authors.
 *   3. `private-manifest-loader` — Filesystem loader for enterprise manifests.
 *   4. `plugin-validator`      — Manifest validation against strict schema rules.
 *   5. `session-manager`       — In-memory session plan lifecycle.
 *   6. `activation-manager`    — x402/pay.sh receipt binding and session activation.
 *   7. `event-store`           — Replay and idempotency store for delivered events.
 *   8. `provider-bridge`       — Dynamic loader for private provider adapters.
 *   9. `stream-broker`         — SSE stream delivery for premium real-time events.
 *  10. `webhook-engine`        — Signed webhook delivery for premium event callbacks.
 *  11. `metrics`               — Premium subsystem metrics snapshot.
 *  12. `types`                 — All TypeScript type declarations.
 *
 * @module premium/index
 */
export * from './builtin-plugins.js';
export * from './trading-capabilities.js';
export * from './meme-radar-capabilities.js';
export * from './lowcap-discovery-capabilities.js';
export * from './tech-fundamentals-capabilities.js';
export * from './manifest-builder.js';
export * from './private-manifest-loader.js';
export * from './plugin-validator.js';
export * from './session-manager.js';
export * from './activation-manager.js';
export * from './event-store.js';
export * from './provider-bridge.js';
export * from './stream-broker.js';
export * from './webhook-engine.js';
export * from './metrics.js';
export * from './types.js';