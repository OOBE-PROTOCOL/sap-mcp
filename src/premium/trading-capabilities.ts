/**
 * @name premium/trading-capabilities
 * @description Built-in premium trading capabilities for Solana real-time trading agents.
 *
 * Defines 3 premium trading capabilities across 1 plugin:
 *
 *   1. `sap-premium-trading-streams` — Real-time SSE streams for trading signals:
 *      - `jupiter.arbitrage.scan`   — Cross-DEX arbitrage opportunity scanner (stream)
 *      - `pyth.volatility.watch`    — Price volatility breakout detector (stream)
 *      - `jupiter.route.optimized`  — Optimized swap route with MEV protection (stream)
 *
 * These capabilities are contracts only — they become live when the corresponding
 * provider env vars are configured and a provider adapter is loaded from the
 * private subrepo.
 *
 * @flow
 *   1. Agent discovers trading capabilities via `sap_premium_plugin_catalog`.
 *   2. Agent creates a session plan for a trading stream.
 *   3. Agent activates the session with x402/pay.sh receipt.
 *   4. Agent connects to `GET /premium/stream/:sessionId` for SSE streams.
 *   5. Provider adapter in the private subrepo feeds real market data.
 *
 * @module premium/trading-capabilities
 */

import type { PremiumCapabilityDefinition, PremiumPluginManifest } from './types.js';

/* -------------------------------------------------------------------------- */
/* Shared schemas                                                             */
/* -------------------------------------------------------------------------- */

/**
 * @description Input schema for trading stream capabilities. Requires a
 * `subscriptionKey` for de-duplication and supports narrow filters for
 * mints, DEXes, size thresholds, and signal types.
 */
const tradingStreamInputSchema = {
  type: 'object',
  required: ['subscriptionKey'],
  properties: {
    subscriptionKey: {
      type: 'string',
      minLength: 3,
      description: 'Stable subscription key for de-duplication. Use a hash of mint pair + strategy id.',
    },
    mints: {
      type: 'array',
      items: { type: 'string', minLength: 32, maxLength: 44 },
      description: 'Token mint addresses to watch. Empty = all tokens.',
    },
    dexes: {
      type: 'array',
      items: { type: 'string', enum: ['jupiter', 'raydium', 'orca', 'drift', 'phoenix', 'meteora'] },
      description: 'DEX protocols to scan. Empty = all DEXes.',
    },
    minSizeUsd: {
      type: 'number',
      minimum: 0,
      description: 'Minimum trade size in USD to emit an event. Filters noise.',
    },
    maxLatencyMs: {
      type: 'number',
      minimum: 100,
      maximum: 10_000,
      description: 'Maximum acceptable data staleness in milliseconds.',
    },
  },
  additionalProperties: false,
};

/**
 * @description Output schema for trading stream events. Each event carries
 * a signal type, actionable data (entry/exit/SL/TP), and metadata for
 * execution by the agent.
 */
const tradingStreamOutputSchema = {
  type: 'object',
  required: ['eventId', 'signalType', 'observedAt', 'payload'],
  properties: {
    eventId: {
      type: 'string',
      description: 'Stable event id for idempotent execution and replay.',
    },
    signalType: {
      type: 'string',
      enum: [
        'arbitrage.opportunity',
        'volatility.breakout',
        'route.optimized',
      ],
      description: 'Trading signal type determining the payload structure.',
    },
    observedAt: {
      type: 'string',
      format: 'date-time',
      description: 'ISO timestamp when the provider observed the market condition.',
    },
    payload: {
      type: 'object',
      required: ['action', 'confidence'],
      properties: {
        action: {
          type: 'string',
          enum: ['buy', 'sell', 'swap', 'close', 'monitor', 'alert'],
          description: 'Recommended agent action.',
        },
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Signal confidence score (0-1). Above 0.7 = high conviction.',
        },
        inputMint: { type: 'string', description: 'Input token mint for swap execution.' },
        outputMint: { type: 'string', description: 'Output token mint for swap execution.' },
        amount: { type: 'string', description: 'Suggested amount in smallest unit.' },
        entryPrice: { type: 'number', description: 'Suggested entry price in USD.' },
        exitPrice: { type: 'number', description: 'Suggested take-profit price in USD.' },
        stopLoss: { type: 'number', description: 'Suggested stop-loss price in USD.' },
        sizeUsd: { type: 'number', description: 'Opportunity size in USD.' },
        expectedPnlUsd: { type: 'number', description: 'Expected profit in USD.' },
        route: {
          type: 'array',
          items: { type: 'string' },
          description: 'Ordered DEX route for optimal execution.',
        },
        priceImpactBps: { type: 'number', description: 'Expected price impact in basis points.' },
        mevProtected: { type: 'boolean', description: 'Whether the route is MEV-protected.' },
        expiresAt: { type: 'string', format: 'date-time', description: 'Signal expiry timestamp.' },
      },
      additionalProperties: true,
    },
  },
  additionalProperties: false,
};

/* -------------------------------------------------------------------------- */
/* Capability factory                                                         */
/* -------------------------------------------------------------------------- */

/**
 * @name tradingStreamCapability
 * @description Factory for building a trading stream capability definition.
 *
 * @param id           - Capability id (e.g. `jupiter.arbitrage.scan`).
 * @param title        - Human-readable title.
 * @param description  - Agent-facing description.
 * @param events       - Event types this stream emits.
 * @param unitPriceUsd - Price per minute in USD.
 * @param providerEnv  - Required provider env vars.
 * @returns A `PremiumCapabilityDefinition` with type `stream`.
 *
 * @internal
 */
function tradingStreamCapability(
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
    inputSchema: tradingStreamInputSchema,
    outputSchema: tradingStreamOutputSchema,
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
      latencyTargetMs: 250, // low latency for trading
      replayWindowSeconds: 120, // short replay for trading
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Plugin manifests                                                           */
/* -------------------------------------------------------------------------- */

/**
 * @name TRADING_PREMIUM_PLUGINS
 * @description Built-in premium trading plugin manifests.
 *
 * One plugin covering 3 trading stream capabilities:
 *   - `sap-premium-trading-streams` — 3 SSE stream capabilities
 *
 * @usedBy `listPremiumPlugins()` — merged with the other built-in plugins.
 */
export const TRADING_PREMIUM_PLUGINS: PremiumPluginManifest[] = [
  {
    id: 'sap-premium-trading-streams',
    version: '0.1.0',
    title: 'SAP Premium Trading Streams',
    description:
      'Paid real-time SSE trading streams for Solana agents: cross-DEX arbitrage scanning, volatility breakout detection, whale movement monitoring, and MEV-protected route optimization. Low-latency delivery with x402 per-minute metering.',
    publisher: 'OOBE Protocol',
    visibility: 'public',
    capabilities: [
      tradingStreamCapability(
        'jupiter.arbitrage.scan',
        'Jupiter cross-DEX arbitrage scanner',
        'Continuously scans Jupiter routes across connected DEXes for arbitrage opportunities. Emits events when profitable cross-DEX paths are found with expected PnL above the minimum threshold. Agents receive entry mints, output mints, route, expected PnL, and price impact for instant execution.',
        ['arbitrage.opportunity'],
        0.025, // $0.025/minute — premium for real-time arb scanning
        ['SAP_MCP_PREMIUM_JUPITER_STREAM_URL'],
      ),
      tradingStreamCapability(
        'pyth.volatility.watch',
        'Pyth volatility breakout detector',
        'Monitors Pyth price feeds for volatility breakouts using Bollinger Band width expansion and ATR spikes. Emits events when a token breaks out of its volatility envelope with confidence scoring. Agents receive entry price, stop-loss, take-profit, and confidence level for breakout trading.',
        ['volatility.breakout'],
        0.015, // $0.015/minute
        ['SAP_MCP_PREMIUM_PYTH_STREAM_URL'],
      ),
      tradingStreamCapability(
        'jupiter.route.optimized',
        'MEV-protected optimized route stream',
        'Continuously computes optimal Jupiter swap routes with MEV protection for specified mint pairs. Emits route updates when a better path is found (lower price impact, fewer hops, or better overall rate). Agents receive the full route, expected output, price impact in bps, and MEV protection status.',
        ['route.optimized'],
        0.0125, // $0.0125/minute
        ['SAP_MCP_PREMIUM_JUPITER_STREAM_URL'],
      ),
    ],
  },
];