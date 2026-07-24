/**
 * @name premium/lowcap-discovery-capabilities
 * @description Built-in premium low-cap token discovery capabilities for Solana agents.
 *
 * Defines 3 premium low-cap discovery capabilities across 1 plugin:
 *
 *   1. `sap-premium-lowcap-discovery` — Low-cap gem scanner:
 *      - `lowcap.gem.scan`         — Scans tokens <$10M mcap with growth signals (stream)
 *      - `lowcap.early.entry`      — Early entry accumulation signal (webhook)
 *      - `lowcap.holder.analysis`  — Real-time holder distribution analysis (stream)
 *
 * These capabilities are contracts only — they become live when the corresponding
 * provider env vars are configured and a provider adapter is loaded from the
 * private subrepo.
 *
 * @flow
 *   1. Agent discovers low-cap discovery capabilities via `sap_premium_plugin_catalog`.
 *   2. Agent creates a session plan for a low-cap stream or webhook.
 *   3. Agent activates the session with x402/pay.sh receipt.
 *   4. Agent connects to `GET /premium/stream/:sessionId` for SSE streams.
 *   5. Agent registers webhooks for early entry signals via `POST /premium/webhook/register`.
 *   6. Provider adapter in the private subrepo feeds real low-cap data.
 *
 * @module premium/lowcap-discovery-capabilities
 */

import type { PremiumCapabilityDefinition, PremiumPluginManifest } from './types.js';

/* -------------------------------------------------------------------------- */
/* Shared schemas                                                             */
/* -------------------------------------------------------------------------- */

/**
 * @description Input schema for low-cap stream capabilities. Requires a
 * `subscriptionKey` for de-duplication and supports narrow filters for
 * mints, minimum liquidity, and minimum volume thresholds.
 */
const lowcapStreamInputSchema = {
  type: 'object',
  required: ['subscriptionKey'],
  properties: {
    subscriptionKey: {
      type: 'string',
      minLength: 3,
      description: 'Stable subscription key for de-duplication. Use a hash of mint + scan criteria.',
    },
    mints: {
      type: 'array',
      items: { type: 'string', minLength: 32, maxLength: 44 },
      description: 'Token mint addresses to scan. Empty = scan all low-cap tokens.',
    },
    minLiquidityUsd: {
      type: 'number',
      minimum: 0,
      description: 'Minimum pool liquidity in USD to include a token in the scan.',
    },
    minVolumeUsd: {
      type: 'number',
      minimum: 0,
      description: 'Minimum 24h volume in USD to include a token in the scan.',
    },
  },
  additionalProperties: false,
};

/**
 * @description Output schema for low-cap stream events. Each event carries
 * a signal type, token metadata, and growth/analysis data.
 */
const lowcapStreamOutputSchema = {
  type: 'object',
  required: ['eventId', 'eventType', 'observedAt', 'payload'],
  properties: {
    eventId: {
      type: 'string',
      description: 'Stable event id for idempotent execution and replay.',
    },
    eventType: {
      type: 'string',
      enum: [
        'gem.scan',
        'holder.analysis',
      ],
      description: 'Low-cap discovery event type determining the payload structure.',
    },
    observedAt: {
      type: 'string',
      format: 'date-time',
      description: 'ISO timestamp when the provider observed the token condition.',
    },
    payload: {
      type: 'object',
      required: ['mint', 'action', 'confidence'],
      properties: {
        mint: { type: 'string', description: 'Token mint address.' },
        action: {
          type: 'string',
          enum: ['buy', 'sell', 'monitor', 'alert', 'accumulate'],
          description: 'Recommended agent action.',
        },
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Signal confidence score (0-1).',
        },
        marketCapUsd: { type: 'number', description: 'Current market cap in USD.' },
        volume24hUsd: { type: 'number', description: '24-hour trading volume in USD.' },
        liquidityUsd: { type: 'number', description: 'Pool liquidity in USD.' },
        holderCount: { type: 'number', description: 'Total holder count.' },
        holderGrowthPct: { type: 'number', description: 'Holder growth percentage (24h).' },
        top10ConcentrationPct: { type: 'number', description: 'Top 10 holder concentration percentage.' },
        smartMoneyInflowUsd: { type: 'number', description: 'Smart money net inflow in USD.' },
        smartMoneyFlow: {
          type: 'string',
          enum: ['inflow', 'outflow', 'neutral'],
          description: 'Smart money flow direction.',
        },
        expiresAt: { type: 'string', format: 'date-time', description: 'Signal expiry timestamp.' },
      },
      additionalProperties: true,
    },
  },
  additionalProperties: false,
};

/**
 * @description Input schema for low-cap webhook capabilities. The buyer
 * provides an HTTPS endpoint and selects which event types to receive.
 */
const lowcapWebhookInputSchema = {
  type: 'object',
  required: ['targetUrl', 'events'],
  properties: {
    targetUrl: {
      type: 'string',
      format: 'uri',
      description: 'HTTPS webhook endpoint owned by the trading agent.',
    },
    events: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'string',
        enum: ['lowcap.early.entry'],
      },
      description: 'Event types to deliver to this webhook.',
    },
    minLiquidityUsd: {
      type: 'number',
      minimum: 0,
      description: 'Minimum liquidity in USD for early entry signals. Filters illiquid tokens.',
    },
    signingPublicKey: {
      type: 'string',
      description: 'Optional public key for webhook signature verification.',
    },
  },
  additionalProperties: false,
};

/**
 * @description Output schema for low-cap webhook deliveries.
 */
const lowcapWebhookOutputSchema = {
  type: 'object',
  required: ['deliveryId', 'eventType', 'deliveredAt', 'signature', 'payload'],
  properties: {
    deliveryId: { type: 'string', description: 'Idempotent delivery id.' },
    eventType: { type: 'string', description: 'Low-cap discovery event type.' },
    deliveredAt: { type: 'string', format: 'date-time', description: 'ISO delivery timestamp.' },
    signature: { type: 'string', description: 'HMAC-SHA256 signature.' },
    payload: {
      type: 'object',
      additionalProperties: true,
      description: 'Low-cap discovery payload with accumulation pattern, holder growth, and smart money signals.',
    },
  },
  additionalProperties: false,
};

/* -------------------------------------------------------------------------- */
/* Capability factory                                                         */
/* -------------------------------------------------------------------------- */

/**
 * @name lowcapStreamCapability
 * @description Factory for building a low-cap discovery stream capability definition.
 *
 * @param id           - Capability id (e.g. `lowcap.gem.scan`).
 * @param title        - Human-readable title.
 * @param description  - Agent-facing description.
 * @param events       - Event types this stream emits.
 * @param unitPriceUsd - Price per minute in USD.
 * @param providerEnv  - Required provider env vars.
 * @returns A `PremiumCapabilityDefinition` with type `stream`.
 *
 * @internal
 */
function lowcapStreamCapability(
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
    inputSchema: lowcapStreamInputSchema,
    outputSchema: lowcapStreamOutputSchema,
    pricing: {
      tier: 'premium-stream',
      model: 'x402-per-minute',
      unit: 'minute',
      unitPriceUsd,
      minUnits: 1,
      maxUnits: 480, // up to 8 hours of streaming
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
 * @name lowcapWebhookCapability
 * @description Factory for building a low-cap discovery webhook capability definition.
 *
 * @param id           - Capability id (e.g. `lowcap.early.entry`).
 * @param title        - Human-readable title.
 * @param description  - Agent-facing description.
 * @param events       - Event types this webhook delivers.
 * @param unitPriceUsd - Price per delivered event in USD.
 * @param providerEnv  - Required provider env vars.
 * @returns A `PremiumCapabilityDefinition` with type `webhook`.
 *
 * @internal
 */
function lowcapWebhookCapability(
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
    inputSchema: lowcapWebhookInputSchema,
    outputSchema: lowcapWebhookOutputSchema,
    pricing: {
      tier: 'premium-webhook',
      model: 'x402-per-event',
      unit: 'event',
      unitPriceUsd,
      minUnits: 5,
      maxUnits: 50_000,
      settlement: 'x402',
    },
    delivery: {
      transport: 'webhook-http',
      events,
      latencyTargetMs: 1_000,
      replayWindowSeconds: 600,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Plugin manifests                                                           */
/* -------------------------------------------------------------------------- */

/**
 * @name LOWCAP_DISCOVERY_PREMIUM_PLUGINS
 * @description Built-in premium low-cap discovery plugin manifests.
 *
 * One plugin covering 3 low-cap discovery capabilities:
 *   - `sap-premium-lowcap-discovery` — 1 webhook + 2 stream capabilities
 *
 * @usedBy `listPremiumPlugins()` — merged with the existing built-in plugins.
 */
export const LOWCAP_DISCOVERY_PREMIUM_PLUGINS: PremiumPluginManifest[] = [
  {
    id: 'sap-premium-lowcap-discovery',
    version: '0.1.0',
    title: 'SAP Premium Low-Cap Discovery',
    description:
      'Paid low-cap token discovery for Solana agents: gem scanning for tokens under $10M market cap with volume, liquidity, and holder growth analysis, early entry accumulation signals, and real-time holder distribution monitoring with smart money flow tracking. x402 metered delivery.',
    publisher: 'OOBE Protocol',
    visibility: 'public',
    capabilities: [
      lowcapStreamCapability(
        'lowcap.gem.scan',
        'Low-cap gem scanner',
        'Continuously scans Solana tokens with market cap under $10M for growth signals. Analyzes volume trends, liquidity depth, and holder growth to identify potential gems. Agents receive mint, market cap, volume, liquidity, holder growth percentage, and confidence score for each detected gem opportunity.',
        ['gem.scan'],
        0.03, // $0.03/min
        ['SAP_MCP_PREMIUM_BIRDEYE_API_URL'],
      ),
      lowcapWebhookCapability(
        'lowcap.early.entry',
        'Early entry accumulation signal',
        'Delivers signed webhook callbacks when a low-cap token shows an accumulation pattern — increasing holder count, rising volume, and smart money inflow. Signals include mint, accumulation strength, holder growth rate, volume trend, smart money flow direction, and suggested entry zone. Critical for agents seeking early positions before wider market awareness.',
        ['lowcap.early.entry'],
        0.005, // $0.005/event
        ['SAP_MCP_PREMIUM_BIRDEYE_API_URL', 'SAP_MCP_PREMIUM_WEBHOOK_SIGNER'],
      ),
      lowcapStreamCapability(
        'lowcap.holder.analysis',
        'Real-time holder distribution analysis',
        'Streams real-time holder distribution data for specified low-cap tokens. Monitors top 10 holder concentration, smart money wallet flows, and whale movements. Agents receive mint, holder count, top 10 concentration percentage, smart money inflow/outflow in USD, and flow direction for holder-based trading decisions.',
        ['holder.analysis'],
        0.02, // $0.02/min
        ['SAP_MCP_PREMIUM_BIRDEYE_API_URL'],
      ),
    ],
  },
];