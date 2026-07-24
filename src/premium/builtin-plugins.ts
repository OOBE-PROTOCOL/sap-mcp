/**
 * @name premium/builtin-plugins
 * @description Built-in premium plugin definitions and discovery helpers.
 *
 * Defines the core built-in public premium plugin shipped with SAP MCP:
 *   1. `sap-premium-market-data`  — Jupiter quotes, Pyth price ticks, threshold webhooks.
 *
 * Additional built-in plugin arrays are imported and merged by `listPremiumPlugins()`:
 *   - `TRADING_PREMIUM_PLUGINS`             — Trading streams.
 *   - `MEME_RADAR_PREMIUM_PLUGINS`          — Meme token listing, sentiment, rugpull, volume.
 *   - `TECH_FUNDAMENTALS_PREMIUM_PLUGINS`   — GitHub activity, TVL changes, tokenomics analysis.
 *
 * Also provides discovery helpers (`listPremiumPlugins`, `listPremiumCapabilities`,
 * `findPremiumCapability`) that merge built-in plugins with privately loaded
 * manifests, and status helpers (`publicPremiumProviderStatus`,
 * `premiumPrivatePluginSupport`) used by the remote server and MCP tools.
 *
 * @flow
 *   1. MCP tool `sap_premium_plugin_catalog` → `listPremiumPlugins()` →
 *      merges built-in + private manifests, filters by visibility, returns clones.
 *   2. MCP tool `sap_premium_create_session_plan` → `findPremiumCapability()` →
 *      resolves a specific plugin/capability pair for session planning.
 *   3. Remote server (`remote/server.ts`) → `publicPremiumProviderStatus()` →
 *      exposes which provider env vars are configured.
 *   4. Remote server → `premiumPrivatePluginSupport()` → reports private plugin
 *      loader configuration and safety contract.
 *
 * @module premium/builtin-plugins
 */

import type { PremiumCapabilityDefinition, PremiumCapabilityType, PremiumPluginManifest } from './types.js';
import {
  loadPrivatePremiumPluginManifests,
  loadPrivatePremiumPluginReport,
  premiumDiscoveryIncludesPrivate,
} from './private-manifest-loader.js';
import { TRADING_PREMIUM_PLUGINS } from './trading-capabilities.js';
import { MEME_RADAR_PREMIUM_PLUGINS } from './meme-radar-capabilities.js';
import { TECH_FUNDAMENTALS_PREMIUM_PLUGINS } from './tech-fundamentals-capabilities.js';

/* -------------------------------------------------------------------------- */
/* Shared JSON Schema fragments                                               */
/* -------------------------------------------------------------------------- */

/**
 * @description Reusable Solana address field schema. Enforces base58 length
 * bounds and explicitly forbids keypair bytes. Exported as `premiumAddressField`
 * for reuse by MCP tool definitions.
 */
const addressField = {
  type: 'string',
  minLength: 32,
  maxLength: 64,
  description: 'Solana wallet, mint, program, or account public key in base58 form. Do not pass keypair bytes.',
};

/**
 * @description Input schema for stream capabilities. Requires a stable
 * `subscriptionKey` for de-duplication and allows free-form `filters`.
 */
const streamInputSchema = {
  type: 'object',
  required: ['subscriptionKey'],
  properties: {
    subscriptionKey: {
      type: 'string',
      minLength: 3,
      description: 'Stable subscription key chosen by the agent runtime so duplicate opens can be de-duplicated.',
    },
    filters: {
      type: 'object',
      additionalProperties: true,
      description: 'Narrow filters such as mint, wallet, protocol, agentId, capability, priceFeedId, or threshold.',
    },
  },
  additionalProperties: false,
};

/**
 * @description Output schema for stream capabilities. Each event carries a
 * stable id, type, ISO timestamp, and a versioned provider-specific payload.
 */
const streamOutputSchema = {
  type: 'object',
  required: ['eventId', 'eventType', 'observedAt', 'payload'],
  properties: {
    eventId: {
      type: 'string',
      description: 'Stable event id suitable for idempotent processing and replay detection.',
    },
    eventType: {
      type: 'string',
      description: 'Premium stream event type emitted by this capability.',
    },
    observedAt: {
      type: 'string',
      format: 'date-time',
      description: 'ISO timestamp when SAP MCP observed or emitted the event.',
    },
    payload: {
      type: 'object',
      additionalProperties: true,
      description: 'Provider-specific event payload. Schemas are versioned per premium plugin manifest.',
    },
  },
  additionalProperties: false,
};

/**
 * @description Input schema for webhook capabilities. Requires an HTTPS
 * `targetUrl` (localhost/private networks rejected by providers) and a
 * non-empty `events` array. Optional `signingPublicKey` for signature verification.
 */
const webhookInputSchema = {
  type: 'object',
  required: ['targetUrl', 'events'],
  properties: {
    targetUrl: {
      type: 'string',
      format: 'uri',
      description: 'HTTPS webhook target owned by the buyer. Localhost and private network URLs are rejected by providers.',
    },
    events: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', description: 'Event id listed in the capability delivery contract.' },
      description: 'Exact event ids to deliver to this webhook subscription.',
    },
    signingPublicKey: {
      type: 'string',
      description: 'Optional public key used by the consumer to verify webhook signatures.',
    },
  },
  additionalProperties: false,
};

/**
 * @description Output schema for webhook deliveries. Includes a delivery id,
 * event type, timestamp, provider signature, and versioned payload.
 */
const webhookOutputSchema = {
  type: 'object',
  required: ['deliveryId', 'eventType', 'deliveredAt', 'signature', 'payload'],
  properties: {
    deliveryId: { type: 'string', description: 'Idempotent webhook delivery id.' },
    eventType: { type: 'string', description: 'Delivered premium event type.' },
    deliveredAt: { type: 'string', format: 'date-time', description: 'ISO timestamp for delivery attempt.' },
    signature: { type: 'string', description: 'Provider signature over deliveryId, deliveredAt, and payload.' },
    payload: { type: 'object', additionalProperties: true, description: 'Versioned event payload.' },
  },
  additionalProperties: false,
};

/* -------------------------------------------------------------------------- */
/* Capability factory helpers                                                 */
/* -------------------------------------------------------------------------- */

/**
 * @name streamCapability
 * @description Factory for building a `stream`-type premium capability definition.
 *
 * Sets status to `requires-provider` when any env vars are declared, otherwise
 * `planned`. Uses `x402-per-minute` pricing with 1–120 minute bounds and
 * MCP streamable HTTP transport with 750ms latency target and 300s replay window.
 *
 * @param id            - Capability id (e.g. `jupiter.quote.delta`).
 * @param title         - Human-readable label.
 * @param description   - Agent-facing description with payment boundary.
 * @param events        - Event ids this stream can emit.
 * @param unitPriceUsd  - Price per minute in USD.
 * @param providerEnv   - Env var names required for provider readiness.
 * @returns A complete `PremiumCapabilityDefinition` with type `stream`.
 *
 * @internal
 */
function streamCapability(
  id: string,
  title: string,
  description: string,
  events: string[],
  unitPriceUsd: number,
  providerEnv: string[],
): PremiumCapabilityDefinition {
  return {
    id,
    type: 'stream',
    title,
    description,
    status: providerEnv.length > 0 ? 'requires-provider' : 'planned',
    requiresProvider: providerEnv.length > 0,
    providerEnv,
    inputSchema: streamInputSchema,
    outputSchema: streamOutputSchema,
    pricing: {
      tier: 'premium-stream',
      model: 'x402-per-minute',
      unit: 'minute',
      unitPriceUsd,
      minUnits: 1,
      maxUnits: 120,
      settlement: 'x402',
    },
    delivery: {
      transport: 'mcp-streamable-http',
      events,
      latencyTargetMs: 750,
      replayWindowSeconds: 300,
    },
  };
}

/**
 * @name webhookCapability
 * @description Factory for building a `webhook`-type premium capability definition.
 *
 * Sets status to `requires-provider` when any env vars are declared, otherwise
 * `planned`. Uses `x402-per-event` pricing with 10–100 000 event bounds and
 * webhook HTTP transport with 1500ms latency target and 900s replay window.
 *
 * @param id            - Capability id (e.g. `price.threshold.crossed`).
 * @param title         - Human-readable label.
 * @param description   - Agent-facing description with payment boundary.
 * @param events        - Event ids this webhook can deliver.
 * @param unitPriceUsd  - Price per event in USD.
 * @param providerEnv   - Env var names required for provider readiness.
 * @returns A complete `PremiumCapabilityDefinition` with type `webhook`.
 *
 * @internal
 */
function webhookCapability(
  id: string,
  title: string,
  description: string,
  events: string[],
  unitPriceUsd: number,
  providerEnv: string[],
): PremiumCapabilityDefinition {
  return {
    id,
    type: 'webhook',
    title,
    description,
    status: providerEnv.length > 0 ? 'requires-provider' : 'planned',
    requiresProvider: providerEnv.length > 0,
    providerEnv,
    inputSchema: webhookInputSchema,
    outputSchema: webhookOutputSchema,
    pricing: {
      tier: 'premium-webhook',
      model: 'x402-per-event',
      unit: 'event',
      unitPriceUsd,
      minUnits: 10,
      maxUnits: 100_000,
      settlement: 'x402',
    },
    delivery: {
      transport: 'webhook-http',
      events,
      latencyTargetMs: 1_500,
      replayWindowSeconds: 900,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Built-in plugin catalog                                                    */
/* -------------------------------------------------------------------------- */

/**
 * @name BUILTIN_PREMIUM_PLUGINS
 * @description The built-in public premium plugins shipped with SAP MCP.
 *
 * These are always available (no env vars needed for discovery) and serve as
 * the reference implementations for the premium plugin manifest format.
 * Additional plugin arrays (`TRADING_PREMIUM_PLUGINS`,
 * `MEME_RADAR_PREMIUM_PLUGINS`, `TECH_FUNDAMENTALS_PREMIUM_PLUGINS`) are merged
 * in `listPremiumPlugins()`.
 *
 * @type {PremiumPluginManifest[]}
 *
 * @usedBy `listPremiumPlugins()` as the base catalog merged with private manifests.
 */
export const BUILTIN_PREMIUM_PLUGINS: PremiumPluginManifest[] = [
  {
    id: 'sap-premium-market-data',
    version: '0.1.0',
    title: 'SAP Premium Market Data',
    description: 'Paid low-latency market stream contracts for quotes, prices, route changes, and threshold events.',
    publisher: 'OOBE Protocol',
    visibility: 'public',
    capabilities: [
      streamCapability(
        'jupiter.quote.delta',
        'Jupiter quote delta stream',
        'Streams quote deltas for exact mints and amounts so agents can react without repeated broad polling.',
        ['quote.delta', 'route.changed', 'price.impact.changed'],
        0.02,
        ['SAP_MCP_PREMIUM_JUPITER_STREAM_URL'],
      ),
      streamCapability(
        'pyth.price.tick',
        'Pyth price tick stream',
        'Streams price ticks for explicit Pyth feed ids with bounded replay and x402 metering.',
        ['price.tick', 'confidence.changed', 'feed.stale'],
        0.015,
        ['SAP_MCP_PREMIUM_PYTH_STREAM_URL'],
      ),
      webhookCapability(
        'price.threshold.crossed',
        'Price threshold webhook',
        'Delivers signed HTTPS callbacks when configured mint/feed thresholds cross.',
        ['price.threshold.crossed'],
        0.001,
        ['SAP_MCP_PREMIUM_WEBHOOK_SIGNER'],
      ),
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Discovery helpers                                                          */
/* -------------------------------------------------------------------------- */

/**
 * @name PremiumPluginListOptions
 * @description Options controlling which plugins are included in discovery.
 *
 * @property includePrivate - When true, `private` and `enterprise` visibility
 *   plugins are included. Defaults to the value of
 *   `SAP_MCP_PREMIUM_EXPOSE_PRIVATE_DISCOVERY` env var.
 */
export interface PremiumPluginListOptions {
  includePrivate?: boolean;
}

/**
 * @name clonePlugin
 * @description Deep-clone a plugin manifest via JSON serialization.
 *
 * Ensures callers cannot mutate the internal built-in or loaded manifest objects.
 *
 * @param plugin - The manifest to clone.
 * @returns A deep copy of the manifest.
 *
 * @internal
 */
function clonePlugin(plugin: PremiumPluginManifest): PremiumPluginManifest {
  return JSON.parse(JSON.stringify(plugin)) as PremiumPluginManifest;
}

/**
 * @name listPremiumPlugins
 * @description Return all discoverable premium plugins (built-in + private).
 *
 * Merges `BUILTIN_PREMIUM_PLUGINS` with privately loaded manifests, filters by
 * visibility (public always; private/enterprise only when `includePrivate` is
 * true or `SAP_MCP_PREMIUM_EXPOSE_PRIVATE_DISCOVERY=true`), and returns deep
 * clones to prevent external mutation.
 *
 * @param options - Discovery options (see `PremiumPluginListOptions`).
 * @returns Array of `PremiumPluginManifest` clones.
 *
 * @usedBy
 *   - `premium-tools.ts` → MCP tool `sap_premium_plugin_catalog`.
 *   - `remote/server.ts` → landing page plugin listing.
 *   - `listPremiumCapabilities`, `findPremiumCapability` (internally).
 */
export function listPremiumPlugins(options: PremiumPluginListOptions = {}): PremiumPluginManifest[] {
  const includePrivate = options.includePrivate ?? premiumDiscoveryIncludesPrivate();
  const plugins = [
    ...BUILTIN_PREMIUM_PLUGINS,
    ...TRADING_PREMIUM_PLUGINS,
    ...MEME_RADAR_PREMIUM_PLUGINS,
    ...TECH_FUNDAMENTALS_PREMIUM_PLUGINS,
    ...loadPrivatePremiumPluginManifests(),
  ];
  return plugins
    .filter(plugin => plugin.visibility === 'public' || includePrivate)
    .map(clonePlugin);
}

/**
 * @name listPremiumCapabilities
 * @description Return all capabilities across all discoverable plugins,
 * optionally filtered by capability type.
 *
 * @param type    - Optional filter: `stream`, `webhook`, or `tool`.
 * @param options - Discovery options (see `PremiumPluginListOptions`).
 * @returns Array of `PremiumCapabilityDefinition` clones (shallow-copied).
 *
 * @usedBy `publicPremiumProviderStatus` (internally), MCP tools.
 */
export function listPremiumCapabilities(type?: PremiumCapabilityType, options: PremiumPluginListOptions = {}): PremiumCapabilityDefinition[] {
  return listPremiumPlugins(options).flatMap(plugin =>
    plugin.capabilities
      .filter(capability => !type || capability.type === type)
      .map(capability => ({ ...capability })),
  );
}

/**
 * @name findPremiumCapability
 * @description Resolve a specific plugin/capability pair by id.
 *
 * @param pluginId      - The plugin id to search for.
 * @param capabilityId  - The capability id within that plugin.
 * @param type          - Optional capability type filter.
 * @param options       - Discovery options (see `PremiumPluginListOptions`).
 * @returns `{ plugin, capability }` if found, otherwise `null`.
 *
 * @usedBy `session-manager.ts:createPremiumSessionPlan` → resolves the
 *   capability for pricing bounds and provider env checks.
 */
export function findPremiumCapability(
  pluginId: string,
  capabilityId: string,
  type?: PremiumCapabilityType,
  options: PremiumPluginListOptions = {},
): { plugin: PremiumPluginManifest; capability: PremiumCapabilityDefinition } | null {
  const plugin = listPremiumPlugins(options).find(candidate => candidate.id === pluginId);
  const capability = plugin?.capabilities.find(candidate => candidate.id === capabilityId && (!type || candidate.type === type));
  return plugin && capability ? { plugin, capability } : null;
}

/**
 * @name publicPremiumProviderStatus
 * @description Return a map of all provider env var names to their current
 * readiness state (true/false based on `process.env`).
 *
 * Used by the remote server to expose which premium providers are configured
 * without revealing secret values.
 *
 * @returns Record keyed by env var name, value is boolean readiness.
 *
 * @usedBy `remote/server.ts` → provider status endpoint.
 */
export function publicPremiumProviderStatus(): Record<string, boolean> {
  const envNames = new Set(listPremiumCapabilities().flatMap(capability => capability.providerEnv));
  return Object.fromEntries([...envNames].sort().map(name => [name, Boolean(process.env[name])]));
}

/**
 * @name premiumPrivatePluginSupport
 * @description Return a diagnostic object describing the private plugin
 * loader configuration, loaded/rejected manifest counts, and the safety contract.
 *
 * Used by the remote server and MCP tools to report private plugin support
 * status without exposing any enterprise code or secrets.
 *
 * @returns Object with `enabled`, `exposePrivateDiscovery`, `loadedManifestCount`,
 *   `rejectedManifestCount`, `loaderEnv`, `contract`, and `safety` fields.
 *
 * @usedBy `remote/server.ts`, `premium-tools.ts`.
 */
export function premiumPrivatePluginSupport(): Record<string, unknown> {
  const privateReport = loadPrivatePremiumPluginReport();
  return {
    enabled: process.env.SAP_MCP_ENABLE_PREMIUM_PLUGINS === 'true',
    exposePrivateDiscovery: premiumDiscoveryIncludesPrivate(),
    loadedManifestCount: privateReport.loadedManifests.length,
    rejectedManifestCount: privateReport.rejectedManifests.length,
    loaderEnv: ['SAP_MCP_ENABLE_PREMIUM_PLUGINS', 'SAP_MCP_PLUGIN_DIR', 'SAP_MCP_PREMIUM_EXPOSE_PRIVATE_DISCOVERY'],
    contract:
      'Private premium plugins must ship a manifest that passes sap_premium_validate_plugin_manifest. The public SAP MCP repo only exposes the contract; enterprise plugin code and provider secrets stay outside the open repo.',
    safety:
      'Plugin manifests are data only. SAP MCP does not execute plugin code from user input, and provider secrets are never exposed through public metadata.',
  };
}

/**
 * @name premiumAddressField
 * @description Re-exported reusable Solana address JSON Schema fragment.
 *
 * Used by MCP tool definitions that accept a Solana public key argument.
 */
export const premiumAddressField = addressField;