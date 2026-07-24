/**
 * @name premium/tech-fundamentals-capabilities
 * @description Built-in premium tech fundamentals capabilities for Solana project analysis.
 *
 * Defines 3 premium tech fundamentals capabilities across 1 plugin:
 *
 *   1. `sap-premium-tech-fundamentals` — Technical & fundamental analysis:
 *      - `tech.github.activity`     — GitHub activity spike alerts (webhook)
 *      - `tech.tvl.change`          — Real-time TVL changes for Solana DeFi (stream)
 *      - `tech.tokenomics.analysis` — On-demand tokenomics analysis (webhook)
 *
 * These capabilities are contracts only — they become live when the corresponding
 * provider env vars are configured and a provider adapter is loaded from the
 * private subrepo.
 *
 * @flow
 *   1. Agent discovers tech fundamentals capabilities via `sap_premium_plugin_catalog`.
 *   2. Agent creates a session plan for a tech stream or webhook.
 *   3. Agent activates the session with x402/pay.sh receipt.
 *   4. Agent connects to `GET /premium/stream/:sessionId` for SSE streams.
 *   5. Agent registers webhooks for GitHub activity and tokenomics alerts via `POST /premium/webhook/register`.
 *   6. Provider adapter in the private subrepo feeds real tech fundamentals data.
 *
 * @module premium/tech-fundamentals-capabilities
 */

import type { PremiumCapabilityDefinition, PremiumPluginManifest } from './types.js';

/* -------------------------------------------------------------------------- */
/* Shared schemas                                                             */
/* -------------------------------------------------------------------------- */

/**
 * @description Input schema for tech fundamentals stream capabilities.
 * Requires a `subscriptionKey` for de-duplication and supports narrow
 * filters for mints and minimum liquidity/volume thresholds.
 */
const techStreamInputSchema = {
  type: 'object',
  required: ['subscriptionKey'],
  properties: {
    subscriptionKey: {
      type: 'string',
      minLength: 3,
      description: 'Stable subscription key for de-duplication. Use a hash of protocol + metric id.',
    },
    mints: {
      type: 'array',
      items: { type: 'string', minLength: 32, maxLength: 44 },
      description: 'Token mint addresses to watch. Empty = all Solana DeFi protocols.',
    },
    minLiquidityUsd: {
      type: 'number',
      minimum: 0,
      description: 'Minimum TVL/liquidity in USD to emit an event. Filters small protocols.',
    },
    minVolumeUsd: {
      type: 'number',
      minimum: 0,
      description: 'Minimum 24h volume in USD to emit an event.',
    },
  },
  additionalProperties: false,
};

/**
 * @description Output schema for tech fundamentals stream events. Each event
 * carries a signal type, protocol metadata, and TVL/change data.
 */
const techStreamOutputSchema = {
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
        'tvl.change',
      ],
      description: 'Tech fundamentals event type determining the payload structure.',
    },
    observedAt: {
      type: 'string',
      format: 'date-time',
      description: 'ISO timestamp when the provider observed the protocol condition.',
    },
    payload: {
      type: 'object',
      required: ['protocol', 'action', 'confidence'],
      properties: {
        protocol: { type: 'string', description: 'Protocol name (e.g. "Jupiter", "Raydium").' },
        mint: { type: 'string', description: 'Associated token mint address.' },
        action: {
          type: 'string',
          enum: ['buy', 'sell', 'monitor', 'alert'],
          description: 'Recommended agent action.',
        },
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Signal confidence score (0-1).',
        },
        tvlUsd: { type: 'number', description: 'Current TVL in USD.' },
        tvlChangePct: { type: 'number', description: 'TVL change percentage (24h).' },
        tvlChangeUsd: { type: 'number', description: 'TVL change in USD (24h).' },
        rank: { type: 'number', description: 'Protocol TVL rank on Solana.' },
        expiresAt: { type: 'string', format: 'date-time', description: 'Signal expiry timestamp.' },
      },
      additionalProperties: true,
    },
  },
  additionalProperties: false,
};

/**
 * @description Input schema for tech fundamentals webhook capabilities. The
 * buyer provides an HTTPS endpoint and selects which event types to receive.
 */
const techWebhookInputSchema = {
  type: 'object',
  required: ['targetUrl', 'events'],
  properties: {
    targetUrl: {
      type: 'string',
      format: 'uri',
      description: 'HTTPS webhook endpoint owned by the agent.',
    },
    events: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'string',
        enum: ['tech.github.activity', 'tech.tokenomics.analysis'],
      },
      description: 'Event types to deliver to this webhook.',
    },
    minLiquidityUsd: {
      type: 'number',
      minimum: 0,
      description: 'Minimum liquidity/TVL in USD for alerts. Filters small protocols.',
    },
    signingPublicKey: {
      type: 'string',
      description: 'Optional public key for webhook signature verification.',
    },
  },
  additionalProperties: false,
};

/**
 * @description Output schema for tech fundamentals webhook deliveries.
 */
const techWebhookOutputSchema = {
  type: 'object',
  required: ['deliveryId', 'eventType', 'deliveredAt', 'signature', 'payload'],
  properties: {
    deliveryId: { type: 'string', description: 'Idempotent delivery id.' },
    eventType: { type: 'string', description: 'Tech fundamentals event type.' },
    deliveredAt: { type: 'string', format: 'date-time', description: 'ISO delivery timestamp.' },
    signature: { type: 'string', description: 'HMAC-SHA256 signature.' },
    payload: {
      type: 'object',
      additionalProperties: true,
      description: 'Tech fundamentals payload with GitHub activity, TVL, or tokenomics analysis data.',
    },
  },
  additionalProperties: false,
};

/* -------------------------------------------------------------------------- */
/* Capability factory                                                         */
/* -------------------------------------------------------------------------- */

/**
 * @name techStreamCapability
 * @description Factory for building a tech fundamentals stream capability definition.
 *
 * @param id           - Capability id (e.g. `tech.tvl.change`).
 * @param title        - Human-readable title.
 * @param description  - Agent-facing description.
 * @param events       - Event types this stream emits.
 * @param unitPriceUsd - Price per minute in USD.
 * @param providerEnv  - Required provider env vars.
 * @returns A `PremiumCapabilityDefinition` with type `stream`.
 *
 * @internal
 */
function techStreamCapability(
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
    inputSchema: techStreamInputSchema,
    outputSchema: techStreamOutputSchema,
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
      latencyTargetMs: 1000,
      replayWindowSeconds: 600,
    },
  };
}

/**
 * @name techWebhookCapability
 * @description Factory for building a tech fundamentals webhook capability definition.
 *
 * @param id           - Capability id (e.g. `tech.github.activity`).
 * @param title        - Human-readable title.
 * @param description  - Agent-facing description.
 * @param events       - Event types this webhook delivers.
 * @param unitPriceUsd - Price per delivered event in USD.
 * @param providerEnv  - Required provider env vars.
 * @returns A `PremiumCapabilityDefinition` with type `webhook`.
 *
 * @internal
 */
function techWebhookCapability(
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
    inputSchema: techWebhookInputSchema,
    outputSchema: techWebhookOutputSchema,
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
      latencyTargetMs: 1_500,
      replayWindowSeconds: 900,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Plugin manifests                                                           */
/* -------------------------------------------------------------------------- */

/**
 * @name TECH_FUNDAMENTALS_PREMIUM_PLUGINS
 * @description Built-in premium tech fundamentals plugin manifests.
 *
 * One plugin covering 3 tech fundamentals capabilities:
 *   - `sap-premium-tech-fundamentals` — 2 webhook + 1 stream capability
 *
 * @usedBy `listPremiumPlugins()` — merged with the existing built-in plugins.
 */
export const TECH_FUNDAMENTALS_PREMIUM_PLUGINS: PremiumPluginManifest[] = [
  {
    id: 'sap-premium-tech-fundamentals',
    version: '0.1.0',
    title: 'SAP Premium Tech Fundamentals',
    description:
      'Paid technical and fundamental analysis for Solana agents: GitHub activity spike alerts for Solana projects, real-time TVL change monitoring for DeFi protocols, and on-demand tokenomics analysis with supply distribution, vesting schedules, and unlock calendars. x402 metered delivery.',
    publisher: 'OOBE Protocol',
    visibility: 'public',
    capabilities: [
      techWebhookCapability(
        'tech.github.activity',
        'GitHub activity spike alerts',
        'Delivers signed webhook callbacks when GitHub activity spikes are detected for Solana projects. Monitors commit frequency, PR count, issue activity, and contributor changes. Agents receive project name, repo URL, activity spike type (commits, PRs, issues), spike magnitude, and historical comparison for development-driven investment signals.',
        ['tech.github.activity'],
        0.002, // $0.002/event
        ['SAP_MCP_PREMIUM_GITHUB_API_URL', 'SAP_MCP_PREMIUM_WEBHOOK_SIGNER'],
      ),
      techStreamCapability(
        'tech.tvl.change',
        'Real-time TVL change stream',
        'Streams real-time TVL changes for Solana DeFi protocols. Monitors total value locked across lending, DEX, staking, and yield protocols. Emits events when TVL changes by a configurable threshold. Agents receive protocol name, current TVL, change percentage, change in USD, and protocol rank for TVL-driven investment decisions.',
        ['tvl.change'],
        0.02, // $0.02/min
        ['SAP_MCP_PREMIUM_DEFILAMA_API_URL'],
      ),
      techWebhookCapability(
        'tech.tokenomics.analysis',
        'On-demand tokenomics analysis',
        'Delivers signed webhook callbacks with on-demand tokenomics analysis for Solana projects. Analyzes supply distribution, vesting schedules, token unlock calendars, and team/advisor allocations. Agents receive mint, circulating supply, total supply, unlock dates, vesting breakdown, concentration risk, and recommended action for tokenomics-aware investment decisions.',
        ['tech.tokenomics.analysis'],
        0.004, // $0.004/event
        ['SAP_MCP_PREMIUM_GITHUB_API_URL', 'SAP_MCP_PREMIUM_WEBHOOK_SIGNER'],
      ),
    ],
  },
];