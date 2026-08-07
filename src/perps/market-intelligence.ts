/**
 * @name perps/market-intelligence
 * @description External market intelligence tools that complement on-chain data.
 *
 * Tools:
 *   - sap_perp_fear_greed: Fear & Greed index from alternative.me (free API)
 *
 * @module perps/market-intelligence
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../core/types.js';
import { createTextResponse } from '../adapters/mcp/tool-response.js';
import { registerTool } from '../adapters/mcp/sdk-compat.js';
import { logger } from '../core/logger.js';

// ─── Types ──────────────────────────────────────────────────────────────────

interface FearGreedResult {
  value: number;
  classification: string;
  timestamp: string;
  previousDay: { value: number; classification: string } | null;
  previousWeek: { value: number; classification: string } | null;
  previousMonth: { value: number; classification: string } | null;
  recommendation: 'risk_on' | 'risk_off' | 'neutral';
}

// ─── API ────────────────────────────────────────────────────────────────────

const FEAR_GREED_API_URL = 'https://api.alternative.me/fng/';
const FETCH_TIMEOUT_MS = 10_000;

async function fetchFearGreedHistory(): Promise<Array<{ value: string; value_classification: string; timestamp: string }> | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(`${FEAR_GREED_API_URL}?limit=31`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = (await response.json()) as { data: Array<{ value: string; value_classification: string; timestamp: string }> };
    return data.data ?? null;
  } catch {
    return null;
  }
}

function classifyRecommendation(value: number): 'risk_on' | 'risk_off' | 'neutral' {
  if (value <= 25) return 'risk_off'; // Extreme Fear — bearish sentiment
  if (value >= 75) return 'risk_on'; // Extreme Greed — bullish but caution
  return 'neutral';
}

// ─── Tool Registration ──────────────────────────────────────────────────────

/**
 * @name registerFearGreedTool
 * @description Register sap_perp_fear_greed.
 * @internal
 */
export function registerFearGreedTool(server: Server, _context: SapMcpContext): void {
  registerTool(
    server,
    'sap_perp_fear_greed',
    {
      title: 'Fear & Greed Index',
      description:
        'Fetch the Crypto Fear & Greed Index from alternative.me (free, no API key). Returns current value (0-100), classification (Extreme Fear to Extreme Greed), historical values (yesterday, last week, last month), and a risk_on/risk_off recommendation. Use this as a market sentiment overlay before opening positions. Extreme Fear (<25) can indicate capitulation (contrarian bullish). Extreme Greed (>75) can indicate euphoria (contrarian bearish).',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    async () => {
      try {
        const history = await fetchFearGreedHistory();
        if (!history || history.length === 0) {
          return createTextResponse(
            JSON.stringify({ error: 'Fear & Greed API unavailable' }),
            { isError: true },
          );
        }

        const current = history[0];
        if (!current) {
          return createTextResponse(
            JSON.stringify({ error: 'Fear & Greed API returned no data' }),
            { isError: true },
          );
        }

        const currentValue = parseInt(current.value, 10);
        const yesterday = history[1] ? { value: parseInt(history[1].value, 10), classification: history[1].value_classification } : null;
        const lastWeek = history[7] ? { value: parseInt(history[7].value, 10), classification: history[7].value_classification } : null;
        const lastMonth = history[30] ? { value: parseInt(history[30].value, 10), classification: history[30].value_classification } : null;

        const result: FearGreedResult = {
          value: currentValue,
          classification: current.value_classification,
          timestamp: new Date(parseInt(current.timestamp, 10) * 1000).toISOString(),
          previousDay: yesterday,
          previousWeek: lastWeek,
          previousMonth: lastMonth,
          recommendation: classifyRecommendation(currentValue),
        };

        logger.info('Fear & Greed index fetched', { value: result.value, classification: result.classification });

        return createTextResponse(JSON.stringify(result, null, 2));
      } catch (error) {
        logger.error('sap_perp_fear_greed failed', { error });
        return createTextResponse(
          `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { isError: true },
        );
      }
    },
  );
}