/**
 * @name premium/meme-radar-capabilities
 * @description Built-in premium meme radar capabilities for Solana meme token analysis.
 *
 * Defines 4 premium meme radar capabilities across 1 plugin:
 *
 *   1. `sap-premium-meme-radar` — Meme token intelligence:
 *      - `meme.newlisting.alert`  — New token listing alerts (webhook)
 *      - `meme.social.sentiment`  — Social sentiment stream (stream)
 *      - `meme.rugpull.detector`  — Rugpull risk monitoring (stream)
 *      - `meme.volume.spike`      — DEX volume anomaly detection (stream)
 *
 * These capabilities are contracts only — they become live when the corresponding
 * provider env vars are configured and a provider adapter is loaded from the
 * private subrepo.
 *
 * @flow
 *   1. Agent discovers meme radar capabilities via `sap_premium_plugin_catalog`.
 *   2. Agent creates a session plan for a meme stream or webhook.
 *   3. Agent activates the session with x402/pay.sh receipt.
 *   4. Agent connects to `GET /premium/stream/:sessionId` for SSE streams.
 *   5. Agent registers webhooks for listing alerts via `POST /premium/webhook/register`.
 *   6. Provider adapter in the private subrepo feeds real meme token data.
 *
 * @module premium/meme-radar-capabilities
 */

import type { PremiumCapabilityDefinition, PremiumPluginManifest } from './types.js';

/* -------------------------------------------------------------------------- */
/* Shared schemas                                                             */
/* -------------------------------------------------------------------------- */

/**
 * @description Input schema for meme stream capabilities. Requires a
 * `subscriptionKey` for de-duplication and supports narrow filters for
 * mints, minimum liquidity, and minimum volume thresholds.
 */
const memeStreamInputSchema = {
  type: 'object',
  required: ['subscriptionKey'],
  properties: {
    subscriptionKey: {
      type: 'string',
      minLength: 3,
      description: 'Stable subscription key for de-duplication. Use a hash of mint + strategy id.',
    },
    mints: {
      type: 'array',
      items: { type: 'string', minLength: 32, maxLength: 44 },
      description: 'Token mint addresses to watch. Empty = all tokens.',
    },
    minLiquidityUsd: {
      type: 'number',
      minimum: 0,
      description: 'Minimum pool liquidity in USD to emit an event. Filters low-liquidity noise.',
    },
    minVolumeUsd: {
      type: 'number',
      minimum: 0,
      description: 'Minimum 24h volume in USD to emit an event. Filters low-volume tokens.',
    },
  },
  additionalProperties: false,
};

/**
 * @description Output schema for meme stream events. Each event carries
 * a signal type, actionable data (sentiment, risk, volume), and metadata
 * for decision-making by the agent.
 */
const memeStreamOutputSchema = {
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
        'social.sentiment',
        'rugpull.risk',
        'volume.spike',
      ],
      description: 'Meme radar event type determining the payload structure.',
    },
    observedAt: {
      type: 'string',
      format: 'date-time',
      description: 'ISO timestamp when the provider observed the meme token condition.',
    },
    payload: {
      type: 'object',
      required: ['mint', 'action', 'confidence'],
      properties: {
        mint: { type: 'string', description: 'Token mint address.' },
        action: {
          type: 'string',
          enum: ['buy', 'sell', 'monitor', 'alert', 'avoid'],
          description: 'Recommended agent action.',
        },
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Signal confidence score (0-1).',
        },
        bullScore: { type: 'number', description: 'Bullish sentiment score (0-100).' },
        bearScore: { type: 'number', description: 'Bearish sentiment score (0-100).' },
        liquidityUsd: { type: 'number', description: 'Current pool liquidity in USD.' },
        volume24hUsd: { type: 'number', description: '24-hour trading volume in USD.' },
        volumeChangePct: { type: 'number', description: 'Volume change percentage vs baseline.' },
        devWalletHoldingPct: { type: 'number', description: 'Dev wallet holding percentage.' },
        mintAuthority: { type: 'boolean', description: 'Whether mint authority is still active.' },
        freezeAuthority: { type: 'boolean', description: 'Whether freeze authority is still active.' },
        honeypotRisk: { type: 'boolean', description: 'Whether honeypot risk was detected.' },
        riskLevel: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical'],
          description: 'Rugpull risk level.',
        },
        expiresAt: { type: 'string', format: 'date-time', description: 'Signal expiry timestamp.' },
      },
      additionalProperties: true,
    },
  },
  additionalProperties: false,
};

/**
 * @description Input schema for meme webhook capabilities. The buyer
 * provides an HTTPS endpoint and selects which event types to receive.
 */
const memeWebhookInputSchema = {
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
        enum: ['meme.newlisting.alert'],
      },
      description: 'Event types to deliver to this webhook.',
    },
    minLiquidityUsd: {
      type: 'number',
      minimum: 0,
      description: 'Minimum liquidity in USD for listing alerts. Filters low-liquidity tokens.',
    },
    honeypotCheck: {
      type: 'boolean',
      description: 'Whether to run honeypot scan on new listings. Default: true.',
    },
    devWalletCheck: {
      type: 'boolean',
      description: 'Whether to analyze dev wallet holdings and movements. Default: true.',
    },
    signingPublicKey: {
      type: 'string',
      description: 'Optional public key for webhook signature verification.',
    },
  },
  additionalProperties: false,
};

/**
 * @description Output schema for meme webhook deliveries.
 */
const memeWebhookOutputSchema = {
  type: 'object',
  required: ['deliveryId', 'eventType', 'deliveredAt', 'signature', 'payload'],
  properties: {
    deliveryId: { type: 'string', description: 'Idempotent delivery id.' },
    eventType: { type: 'string', description: 'Meme radar event type.' },
    deliveredAt: { type: 'string', format: 'date-time', description: 'ISO delivery timestamp.' },
    signature: { type: 'string', description: 'HMAC-SHA256 signature.' },
    payload: {
      type: 'object',
      additionalProperties: true,
      description: 'Meme radar payload with listing details, honeypot scan, and dev wallet analysis.',
    },
  },
  additionalProperties: false,
};

/* -------------------------------------------------------------------------- */
/* Capability factory                                                         */
/* -------------------------------------------------------------------------- */

/**
 * @name memeStreamCapability
 * @description Factory for building a meme radar stream capability definition.
 *
 * @param id           - Capability id (e.g. `meme.social.sentiment`).
 * @param title        - Human-readable title.
 * @param description  - Agent-facing description.
 * @param events       - Event types this stream emits.
 * @param unitPriceUsd - Price per minute in USD.
 * @param providerEnv  - Required provider env vars.
 * @returns A `PremiumCapabilityDefinition` with type `stream`.
 *
 * @internal
 */
function memeStreamCapability(
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
    inputSchema: memeStreamInputSchema,
    outputSchema: memeStreamOutputSchema,
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
      latencyTargetMs: 500,
      replayWindowSeconds: 180,
    },
  };
}

/**
 * @name memeWebhookCapability
 * @description Factory for building a meme radar webhook capability definition.
 *
 * @param id           - Capability id (e.g. `meme.newlisting.alert`).
 * @param title        - Human-readable title.
 * @param description  - Agent-facing description.
 * @param events       - Event types this webhook delivers.
 * @param unitPriceUsd - Price per delivered event in USD.
 * @param providerEnv  - Required provider env vars.
 * @returns A `PremiumCapabilityDefinition` with type `webhook`.
 *
 * @internal
 */
function memeWebhookCapability(
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
    inputSchema: memeWebhookInputSchema,
    outputSchema: memeWebhookOutputSchema,
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
      latencyTargetMs: 750,
      replayWindowSeconds: 300,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Plugin manifests                                                           */
/* -------------------------------------------------------------------------- */

/**
 * @name MEME_RADAR_PREMIUM_PLUGINS
 * @description Built-in premium meme radar plugin manifests.
 *
 * One plugin covering 4 meme radar capabilities:
 *   - `sap-premium-meme-radar` — 1 webhook + 3 stream capabilities
 *
 * @usedBy `listPremiumPlugins()` — merged with the existing built-in plugins.
 */
export const MEME_RADAR_PREMIUM_PLUGINS: PremiumPluginManifest[] = [
  {
    id: 'sap-premium-meme-radar',
    version: '0.1.0',
    title: 'SAP Premium Meme Radar',
    description:
      'Paid meme token intelligence for Solana agents: new listing alerts with honeypot and dev wallet analysis, social sentiment streams, rugpull risk monitoring, and DEX volume anomaly detection. Real-time delivery with x402 metering.',
    publisher: 'OOBE Protocol',
    visibility: 'public',
    capabilities: [
      memeWebhookCapability(
        'meme.newlisting.alert',
        'New token listing alerts',
        'Delivers signed webhook callbacks when new tokens are listed on Raydium, Orca, or Meteora. Uses DexScreener pairCreatedAt to detect tokens listed within the last 60 minutes. Each alert includes liquidity check results, initial volume, risk flags (low liquidity, low volume, high FDV), and recommended action for instant decision-making on new meme token opportunities.',
        ['meme.newlisting.alert'],
        0.0015, // $0.0015/event
        ['SAP_MCP_PREMIUM_DEXSCREENER_API_URL', 'SAP_MCP_PREMIUM_WEBHOOK_SIGNER'],
      ),
      memeStreamCapability(
        'meme.social.sentiment',
        'Market sentiment stream',
        'Streams real-time market sentiment scores for specified meme tokens. Derives bull/bear scores from DexScreener price momentum (1h, 6h, 24h changes) and volume acceleration as a free sentiment proxy — no paid social media API required. Agents receive mint, bull score, bear score, confidence, trend direction, and signal confidence for sentiment-driven trading decisions.',
        ['social.sentiment'],
        0.01, // $0.01/min
        ['SAP_MCP_PREMIUM_DEXSCREENER_API_URL'],
      ),
      memeStreamCapability(
        'meme.rugpull.detector',
        'Rugpull risk detector',
        'Continuously monitors pool liquidity changes via DexScreener and checks mint authority + freeze authority status via Solana RPC for specified meme tokens. Emits risk alerts when rugpull indicators are detected — liquidity drain (>30%), mint authority active, freeze authority active, or very low liquidity. Agents receive risk score (0-1), risk factors, affected mint, and recommended action (exit/monitor/caution).',
        ['rugpull.risk'],
        0.02, // $0.02/min
        ['SAP_MCP_PREMIUM_DEXSCREENER_API_URL', 'SAP_MCP_PREMIUM_SOLANA_RPC_URL'],
      ),
      memeStreamCapability(
        'meme.volume.spike',
        'DEX volume anomaly detector',
        'Monitors DEX trading volume for specified meme tokens and detects anomalous volume spikes that may indicate pump/dump activity. Uses statistical baselines to flag unusual volume patterns. Agents receive mint, volume change percentage, current vs baseline volume, and confidence score for volume-driven trading signals.',
        ['volume.spike'],
        0.0125, // $0.0125/min
        ['SAP_MCP_PREMIUM_DEXSCREENER_API_URL'],
      ),
    ],
  },
];