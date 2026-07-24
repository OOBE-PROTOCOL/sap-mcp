/**
 * @name premium/manifest-builder
 * @description Template generator for custom premium plugin manifests.
 *
 * Produces a data-only `PremiumPluginManifest` from a simplified request,
 * filling in sensible defaults for pricing, delivery, and JSON schemas.
 * The generated template is meant to be customized by plugin authors before
 * production use — it never writes files, loads code, or embeds secrets.
 *
 * @flow
 *   1. MCP tool `sap_premium_build_manifest_template` receives a request
 *      with plugin id, capability id, type, and optional overrides.
 *   2. → `buildPremiumPluginManifestTemplate(request)` generates a full manifest
 *      with default pricing/delivery/schema based on capability type.
 *   3. The agent returns the manifest JSON to the caller for review/customization.
 *   4. The caller can then validate it with `validatePremiumPluginManifest`.
 *
 * @module premium/manifest-builder
 */

import type {
  PremiumCapabilityType,
  PremiumDeliveryContract,
  PremiumPluginManifest,
  PremiumPricingModel,
  PremiumPricingPolicy,
} from './types.js';

/* -------------------------------------------------------------------------- */
/* Request interface                                                          */
/* -------------------------------------------------------------------------- */

/**
 * @name PremiumManifestTemplateRequest
 * @description Simplified request for generating a premium plugin manifest template.
 *
 * Only `pluginId`, `capabilityId`, and `capabilityType` are required. All other
 * fields have sensible defaults and can be overridden by the caller.
 *
 * @property pluginId        - Unique plugin id (lowercase, dots/dashes allowed).
 * @property capabilityId    - Unique capability id within the plugin.
 * @property capabilityType  - `stream`, `webhook`, or `tool`.
 * @property title           - Optional human-readable label (defaults applied).
 * @property description     - Optional agent-facing description (defaults applied).
 * @property publisher       - Optional publisher name (defaults to 'Custom Publisher').
 * @property visibility       - Optional visibility (defaults to 'private').
 * @property unitPriceUsd    - Optional price per unit in USD (defaults to 0.01).
 * @property providerEnv     - Optional env var names for provider readiness.
 *
 * @usedBy `premium-tools.ts` → MCP tool `sap_premium_build_manifest_template`.
 */
export interface PremiumManifestTemplateRequest {
  pluginId: string;
  capabilityId: string;
  capabilityType: PremiumCapabilityType;
  title?: string;
  description?: string;
  publisher?: string;
  visibility?: 'public' | 'private' | 'enterprise';
  unitPriceUsd?: number;
  providerEnv?: string[];
}

/* -------------------------------------------------------------------------- */
/* Default JSON schemas                                                       */
/* -------------------------------------------------------------------------- */

/**
 * @description Default input schema for template-generated capabilities.
 * Requires a `requestId` for idempotency and allows free-form `filters`.
 */
const defaultInputSchema = {
  type: 'object',
  required: ['requestId'],
  properties: {
    requestId: {
      type: 'string',
      description: 'Caller-provided idempotency key binding planning, payment, delivery, and audit output.',
    },
    filters: {
      type: 'object',
      additionalProperties: true,
      description: 'Narrow capability-specific filters. Keep broad scans out of premium delivery paths.',
    },
  },
  additionalProperties: false,
};

/**
 * @description Default output schema for template-generated capabilities.
 * Returns a stable event id, ISO timestamp, and a versioned provider payload.
 * The `payload` field uses `additionalProperties: true` as a placeholder —
 * plugin authors should replace it with a strict object schema before production.
 */
const defaultOutputSchema = {
  type: 'object',
  required: ['eventId', 'observedAt', 'payload'],
  properties: {
    eventId: {
      type: 'string',
      description: 'Stable provider event id suitable for audit binding, replay protection, and de-duplication.',
    },
    observedAt: {
      type: 'string',
      format: 'date-time',
      description: 'ISO timestamp when the provider observed or delivered this premium result.',
    },
    payload: {
      type: 'object',
      additionalProperties: true,
      description: 'Provider-specific payload. Replace this with a strict object schema before production.',
    },
  },
  additionalProperties: false,
};

/* -------------------------------------------------------------------------- */
/* Default pricing & delivery factories                                       */
/* -------------------------------------------------------------------------- */

/**
 * @name defaultPricing
 * @description Generate a default `PremiumPricingPolicy` based on capability type.
 *
 * Maps each type to its canonical pricing model, unit, and tier:
 *   - `stream`  → `x402-per-minute`, `minute`, `premium-stream`, 1–120 units.
 *   - `webhook` → `x402-per-event`, `event`, `premium-webhook`, 10–100 000 units.
 *   - `tool`    → `x402-session`, `session`, `premium-tool`, 1–120 units.
 *
 * @param type          - The capability type to generate pricing for.
 * @param unitPriceUsd  - Price per unit in USD.
 * @returns A complete `PremiumPricingPolicy` with `x402` settlement.
 *
 * @internal
 */
function defaultPricing(type: PremiumCapabilityType, unitPriceUsd: number): PremiumPricingPolicy {
  const modelByType: Record<PremiumCapabilityType, PremiumPricingModel> = {
    stream: 'x402-per-minute',
    webhook: 'x402-per-event',
    tool: 'x402-session',
  };
  const unitByType: Record<PremiumCapabilityType, PremiumPricingPolicy['unit']> = {
    stream: 'minute',
    webhook: 'event',
    tool: 'session',
  };
  const tierByType: Record<PremiumCapabilityType, PremiumPricingPolicy['tier']> = {
    stream: 'premium-stream',
    webhook: 'premium-webhook',
    tool: 'premium-tool',
  };

  return {
    tier: tierByType[type],
    model: modelByType[type],
    unit: unitByType[type],
    unitPriceUsd,
    minUnits: type === 'webhook' ? 10 : 1,
    maxUnits: type === 'webhook' ? 100_000 : 120,
    settlement: 'x402',
  };
}

/**
 * @name defaultDelivery
 * @description Generate a default `PremiumDeliveryContract` based on capability type.
 *
 * Maps each type to its canonical transport, event id pattern, latency, and
 * replay window:
 *   - `stream`  → `mcp-streamable-http`, 750ms latency, 300s replay.
 *   - `webhook` → `webhook-http`, 1500ms latency, 900s replay.
 *   - `tool`    → `mcp-streamable-http`, 1500ms latency, 300s replay.
 *
 * @param type - The capability type to generate delivery for.
 * @returns A complete `PremiumDeliveryContract`.
 *
 * @internal
 */
function defaultDelivery(type: PremiumCapabilityType): PremiumDeliveryContract {
  return {
    transport: type === 'webhook' ? 'webhook-http' : 'mcp-streamable-http',
    events: type === 'tool' ? ['tool.completed'] : [`${type}.event`],
    latencyTargetMs: type === 'stream' ? 750 : 1_500,
    replayWindowSeconds: type === 'webhook' ? 900 : 300,
  };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * @name buildPremiumPluginManifestTemplate
 * @description Build a data-only premium plugin manifest template from a simplified request.
 *
 * It never writes files, loads code, or embeds provider secrets. The generated
 * manifest uses default schemas, pricing, and delivery contracts that are
 * sensible starting points but should be customized before production use.
 *
 * @param request - Template request with required plugin/capability ids and type.
 * @returns A complete `PremiumPluginManifest` with one capability.
 *
 * @usedBy `premium-tools.ts` → MCP tool `sap_premium_build_manifest_template`.
 */
export function buildPremiumPluginManifestTemplate(request: PremiumManifestTemplateRequest): PremiumPluginManifest {
  // Filter out empty/falsy env var names from the request.
  const providerEnv = request.providerEnv?.filter(Boolean) ?? [];
  return {
    id: request.pluginId,
    version: '0.1.0',
    title: request.title ?? 'Custom SAP MCP Premium Plugin',
    description: request.description
      ?? 'Custom premium SAP MCP capability contract for paid agent runtime delivery with strict schemas and x402/pay.sh settlement.',
    publisher: request.publisher ?? 'Custom Publisher',
    visibility: request.visibility ?? 'private',
    capabilities: [
      {
        id: request.capabilityId,
        type: request.capabilityType,
        title: request.title ?? 'Custom premium capability',
        description: request.description
          ?? 'Custom premium capability. Replace this description with a concrete agent use case, delivery boundary, provider dependency, and payment model before production.',
        status: providerEnv.length > 0 ? 'requires-provider' : 'planned',
        requiresProvider: providerEnv.length > 0,
        providerEnv,
        inputSchema: defaultInputSchema,
        outputSchema: defaultOutputSchema,
        pricing: defaultPricing(request.capabilityType, request.unitPriceUsd ?? 0.01),
        delivery: defaultDelivery(request.capabilityType),
      },
    ],
  };
}