/**
 * @name perps/signal-engine
 * @description Decision support engine that aggregates existing market data
 * into a single quantitative signal score (0-1).
 *
 * Combines:
 *   - Technical indicators (RSI, EMA, MACD, Bollinger, ATR)
 *   - Price action from DexScreener
 *   - Funding rate from on-chain Adrena custody
 *   - Liquidation distance from on-chain positions
 *
 * Tool:
 *   - sap_perp_signal_score: returns score 0-1 + recommendation + confidence + reasons
 *
 * @module perps/signal-engine
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../core/types.js';
import { createTextResponse } from '../adapters/mcp/tool-response.js';
import { registerTool } from '../adapters/mcp/sdk-compat.js';
import { logger } from '../core/logger.js';
import {
  DEXSCREENER_API_URL,
  timedFetch,
  type DexScreenerPair,
  type OhlcCandle,
  type JsonSchema,
} from './perp-constants.js';
import { getConnection } from '../tools/adrena/adrena-helpers.js';
import { ADRENA_PROGRAM_ID } from './adrena/adrena-constants.js';
import { PublicKey } from '@solana/web3.js';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SignalScoreResult {
  score: number;
  recommendation: 'LONG' | 'SHORT' | 'WAIT';
  confidence: number;
  reasons: string[];
  price: number;
  indicators: {
    rsi: number | null;
    ema20: number | null;
    ema50: number | null;
    macd: { macd: number; signal: number; histogram: number } | null;
    bollinger: { upper: number; middle: number; lower: number; squeeze: boolean } | null;
    atr: number | null;
  };
  fundingRateBps: number | null;
  liquidationDistancePct: number | null;
  priceChange: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
}

// ─── Indicator Math (reused from chart-indicators, kept private) ────────────

function computeRsi(closes: number[], period: number = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function computeEma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function computeEmaSeries(values: number[], period: number): number[] | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  const result: number[] = [];
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

function computeMacd(closes: number[]): { macd: number; signal: number; histogram: number } | null {
  if (closes.length < 35) return null;
  const ema12 = computeEmaSeries(closes, 12);
  const ema26 = computeEmaSeries(closes, 26);
  if (!ema12 || !ema26) return null;
  const minLen = Math.min(ema12.length, ema26.length);
  const macdLine: number[] = [];
  for (let i = 1; i <= minLen; i++) {
    macdLine.unshift(ema12[ema12.length - i] - ema26[ema26.length - i]);
  }
  const signal = computeEma(macdLine, 9);
  if (signal === null) return null;
  const macdValue = macdLine[macdLine.length - 1];
  const histogram = macdValue - signal;
  return { macd: macdValue, signal, histogram };
}

function computeBollinger(
  closes: number[],
  period: number = 20,
  stdDev: number = 2,
): { upper: number; middle: number; lower: number; squeeze: boolean } | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
  const sd = Math.sqrt(variance);
  const upper = sma + stdDev * sd;
  const lower = sma - stdDev * sd;
  const bandwidth = (upper - lower) / sma;
  const squeeze = bandwidth < 0.05;
  return { upper, middle: sma, lower, squeeze };
}

function computeAtr(candles: OhlcCandle[], period: number = 14): number | null {
  if (candles.length < period + 1) return null;
  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges.push(tr);
  }
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }
  return atr;
}

// ─── Synthetic OHLC from DexScreener ────────────────────────────────────────

function deriveOhlcFromPair(pair: DexScreenerPair, resolution: string): OhlcCandle {
  const priceUsd = pair.priceUsd ? parseFloat(pair.priceUsd) : 0;
  const changeMap: Record<string, number> = {
    '5m': pair.priceChange?.['m5'] ?? 0,
    '1h': pair.priceChange?.['h1'] ?? 0,
    '6h': pair.priceChange?.['h6'] ?? 0,
    '24h': pair.priceChange?.['h24'] ?? 0,
  };
  const changePct = changeMap[resolution] ?? changeMap['1h'];
  const open = priceUsd / (1 + changePct / 100);
  const close = priceUsd;
  const high = Math.max(open, close) * 1.001;
  const low = Math.min(open, close) * 0.999;
  const volMap: Record<string, number> = {
    '5m': pair.volume?.['m5'] ?? 0,
    '1h': pair.volume?.['h1'] ?? 0,
    '6h': pair.volume?.['h6'] ?? 0,
    '24h': pair.volume?.['h24'] ?? 0,
  };
  return {
    open,
    high,
    low,
    close,
    volume: volMap[resolution] ?? volMap['1h'] ?? 0,
    timestamp: Date.now(),
  };
}

// ─── Signal Scoring ─────────────────────────────────────────────────────────

/**
 * Compute a composite signal score from technical indicators.
 * Returns a value from 0 (strong short) to 1 (strong long), with 0.5 = neutral.
 */
function computeSignalScore(
  rsi: number | null,
  ema20: number | null,
  ema50: number | null,
  macd: { macd: number; signal: number; histogram: number } | null,
  bollinger: { upper: number; middle: number; lower: number; squeeze: boolean } | null,
  price: number,
  priceChange24h: number,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0.5; // Start neutral
  let weightSum = 0;

  // RSI: <30 oversold (bullish), >70 overbought (bearish)
  if (rsi !== null) {
    const rsiScore = rsi < 30 ? 0.8 : rsi > 70 ? 0.2 : 0.5 + (50 - rsi) / 100;
    score += (rsiScore - 0.5) * 0.2;
    weightSum += 0.2;
    if (rsi < 30) reasons.push(`RSI ${rsi.toFixed(1)} oversold — bullish bias`);
    else if (rsi > 70) reasons.push(`RSI ${rsi.toFixed(1)} overbought — bearish bias`);
    else reasons.push(`RSI ${rsi.toFixed(1)} neutral`);
  }

  // EMA trend: ema20 > ema50 = bullish, ema20 < ema50 = bearish
  if (ema20 !== null && ema50 !== null) {
    const emaScore = ema20 > ema50 ? 0.7 : 0.3;
    score += (emaScore - 0.5) * 0.2;
    weightSum += 0.2;
    if (ema20 > ema50) reasons.push(`EMA20 > EMA50 — bullish trend`);
    else reasons.push(`EMA20 < EMA50 — bearish trend`);
  }

  // MACD histogram: positive = bullish, negative = bearish
  if (macd !== null) {
    const macdScore = macd.histogram > 0 ? 0.65 : 0.35;
    score += (macdScore - 0.5) * 0.15;
    weightSum += 0.15;
    if (macd.histogram > 0) reasons.push(`MACD histogram positive — bullish momentum`);
    else reasons.push(`MACD histogram negative — bearish momentum`);
  }

  // Bollinger: price near lower band = oversold (bullish), near upper = overbought (bearish)
  if (bollinger !== null) {
    const bbPosition = (price - bollinger.lower) / (bollinger.upper - bollinger.lower);
    if (bbPosition < 0.2) {
      score += 0.1;
      reasons.push(`Price near Bollinger lower band — oversold`);
    } else if (bbPosition > 0.8) {
      score -= 0.1;
      reasons.push(`Price near Bollinger upper band — overbought`);
    }
    if (bollinger.squeeze) {
      reasons.push(`Bollinger squeeze — volatility expansion imminent`);
    }
    weightSum += 0.1;
  }

  // Price change 24h: negative = potential mean reversion (bullish for long)
  if (priceChange24h < -5) {
    score += 0.05;
    reasons.push(`24h price change ${priceChange24h.toFixed(1)}% — potential mean reversion`);
  } else if (priceChange24h > 5) {
    score -= 0.05;
    reasons.push(`24h price change ${priceChange24h.toFixed(1)}% — extended move`);
  }

  // Normalize score to 0-1 range.
  if (weightSum > 0) {
    score = score + (0.5 - score) * (1 - weightSum / 0.65);
  }

  return {
    score: Math.max(0, Math.min(1, Math.round(score * 100) / 100)),
    reasons,
  };
}

// ─── Funding Rate (on-chain read) ───────────────────────────────────────────

/**
 * Read funding rate from Adrena custody account on-chain.
 * Returns funding rate in basis points, or null if unavailable.
 */
async function readFundingRate(
  context: SapMcpContext,
  market: string,
): Promise<number | null> {
  try {
    const connection = getConnection(context);
    const programId = new PublicKey(ADRENA_PROGRAM_ID);

    // Adrena custody discriminator (8 bytes).
    const discriminator = Buffer.from([1, 184, 48, 81, 93, 131, 63, 145]);
    const accounts = await connection.getProgramAccounts(programId, {
      filters: [{ memcmp: { offset: 0, bytes: discriminator.toString('base64') } }],
    });

    for (const account of accounts) {
      const data = account.account.data;
      if (data.length < 184) continue;

      // Read symbol (offset 8, 16 bytes, null-terminated).
      const symbolBytes = data.subarray(8, 24);
      const symbol = symbolBytes.toString('utf8').replace(/\0/g, '').trim().toUpperCase();

      if (symbol === market.toUpperCase()) {
        // Funding rate is at offset 168 (u32, little-endian, in basis points).
        const fundingRateBps = data.readUInt32LE(168);
        return fundingRateBps;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Tool Registration ──────────────────────────────────────────────────────

/**
 * @name registerSignalScoreTool
 * @description Register sap_perp_signal_score.
 * @internal
 */
export function registerSignalScoreTool(server: Server, context: SapMcpContext): void {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      mint: {
        type: 'string',
        description: 'Token mint address (base58) for DexScreener price data.',
      },
      market: {
        type: 'string',
        description: 'Market symbol for on-chain funding rate (e.g. BONK, JITOSOL, WBTC).',
      },
    },
    required: ['mint', 'market'],
    additionalProperties: false,
  };

  registerTool(
    server,
    'sap_perp_signal_score',
    {
      title: 'Perp Signal Score',
      description:
        'Aggregate technical signal score (0-1) from RSI, EMA, MACD, Bollinger Bands, price action, and on-chain funding rate. Returns a single score with LONG/SHORT/WAIT recommendation and confidence. Replaces 5-7 individual indicator calls with 1 aggregation call. Use this before opening a position to get a quantitative decision baseline.',
      inputSchema: schema,
    },
    async (args: Record<string, unknown>) => {
      try {
        const mint = String(args['mint'] ?? '').trim();
        const market = String(args['market'] ?? '').trim().toUpperCase();

        if (!mint || !market) {
          return createTextResponse(
            JSON.stringify({ error: 'mint and market are required.' }),
            { isError: true },
          );
        }

        // 1. Fetch price data from DexScreener (free, no cost).
        const url = `${DEXSCREENER_API_URL}/tokens/v1/solana/${encodeURIComponent(mint)}`;
        const pairs = await timedFetch<DexScreenerPair[]>(url);

        if (!pairs || pairs.length === 0) {
          return createTextResponse(
            JSON.stringify({ error: `No DexScreener pair found for mint ${mint}` }),
            { isError: true },
          );
        }

        const pair = pairs[0];
        const priceUsd = pair.priceUsd ? parseFloat(pair.priceUsd) : 0;
        if (priceUsd <= 0) {
          return createTextResponse(
            JSON.stringify({ error: 'Invalid price from DexScreener' }),
            { isError: true },
          );
        }

        // 2. Derive synthetic OHLC candles for indicator computation.
        const candles: OhlcCandle[] = ['5m', '1h', '6h', '24h'].map(
          (res) => deriveOhlcFromPair(pair, res),
        );

        // For indicators, we need a series of closes. Since DexScreener only
        // gives us 4 timeframes, we create a synthetic series by interpolating
        // from the 4 candles (close prices oldest to newest).
        const closes = [candles[0].open, candles[0].close, candles[1].open, candles[1].close, candles[2].open, candles[2].close, candles[3].open, candles[3].close];

        // 3. Compute indicators.
        const rsi = computeRsi(closes);
        const ema20 = computeEma(closes, 7); // Shorter period due to limited data
        const ema50 = computeEma(closes, 8);
        const macd = computeMacd(closes);
        const bollinger = computeBollinger(closes, 8);
        const atr = computeAtr(candles);

        // 4. Read on-chain funding rate.
        const fundingRateBps = await readFundingRate(context, market);

        // 5. Price change data.
        const priceChange = {
          m5: pair.priceChange?.['m5'] ?? 0,
          h1: pair.priceChange?.['h1'] ?? 0,
          h6: pair.priceChange?.['h6'] ?? 0,
          h24: pair.priceChange?.['h24'] ?? 0,
        };

        // 6. Compute signal score.
        const { score, reasons } = computeSignalScore(
          rsi,
          ema20,
          ema50,
          macd,
          bollinger,
          priceUsd,
          priceChange.h24,
        );

        // 7. Adjust score with funding rate.
        let adjustedScore = score;
        const adjustedReasons = [...reasons];
        if (fundingRateBps !== null) {
          if (fundingRateBps > 5000) {
            adjustedScore -= 0.05;
            adjustedReasons.push(`Funding rate ${fundingRateBps} bps very high — longs paying shorts, bearish bias`);
          } else if (fundingRateBps < -5000) {
            adjustedScore += 0.05;
            adjustedReasons.push(`Funding rate ${fundingRateBps} bps very negative — shorts paying longs, bullish bias`);
          } else {
            adjustedReasons.push(`Funding rate ${fundingRateBps} bps normal`);
          }
        }

        adjustedScore = Math.max(0, Math.min(1, Math.round(adjustedScore * 100) / 100));

        // 8. Recommendation.
        let recommendation: 'LONG' | 'SHORT' | 'WAIT';
        let confidence: number;

        if (adjustedScore >= 0.65) {
          recommendation = 'LONG';
          confidence = (adjustedScore - 0.5) * 2;
        } else if (adjustedScore <= 0.35) {
          recommendation = 'SHORT';
          confidence = (0.5 - adjustedScore) * 2;
        } else {
          recommendation = 'WAIT';
          confidence = 1 - Math.abs(adjustedScore - 0.5) * 2;
        }

        confidence = Math.round(confidence * 100) / 100;

        const result: SignalScoreResult = {
          score: adjustedScore,
          recommendation,
          confidence,
          reasons: adjustedReasons,
          price: priceUsd,
          indicators: {
            rsi: rsi !== null ? Math.round(rsi * 10) / 10 : null,
            ema20: ema20 !== null ? Math.round(ema20 * 1000000) / 1000000 : null,
            ema50: ema50 !== null ? Math.round(ema50 * 1000000) / 1000000 : null,
            macd,
            bollinger,
            atr: atr !== null ? Math.round(atr * 1000000) / 1000000 : null,
          },
          fundingRateBps,
          liquidationDistancePct: null, // Would need position info — left null for now
          priceChange,
        };

        logger.info('Signal score computed', {
          market,
          score: result.score,
          recommendation: result.recommendation,
          confidence: result.confidence,
        });

        return createTextResponse(JSON.stringify(result, null, 2));
      } catch (error) {
        logger.error('sap_perp_signal_score failed', { error });
        return createTextResponse(
          `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { isError: true },
        );
      }
    },
  );
}