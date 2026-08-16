/**
 * @name perps/risk-engine
 * @description Dynamic risk management layer for Adrena perps trading.
 *
 * Extends the static policy engine with dynamic risk checks that read the
 * trade journal to compute daily P&L, drawdown, and cooldown status.
 *
 * Tools:
 *   - sap_perp_risk_check: pre-trade risk gate (daily loss, drawdown, cooldown)
 *
 * @module perps/risk-engine
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../../core/src/types.js';
import { createTextResponse } from '../../mcp-adapter/src/tool-response.js';
import { registerTool } from '../../mcp-adapter/src/sdk-compat.js';
import { logger } from '../../core/src/logger.js';
import { queryTradeJournal } from '../../strategies/src/trade-journal.js';

// ─── Constants ─────────────────────────────────────────────────────────────

/** Default daily loss limit in USD. Can be overridden via policy config. */
const DEFAULT_DAILY_LOSS_LIMIT_USD = 10;

/** Default max drawdown percentage before blocking new trades. */
const DEFAULT_MAX_DRAWDOWN_PCT = 30;

/** Default cooldown duration in minutes after a losing trade. */
const DEFAULT_COOLDOWN_MINUTES = 15;

// ─── Types ──────────────────────────────────────────────────────────────────

interface RiskCheckResult {
  allowed: boolean;
  riskScore: number;
  recommendation: 'PROCEED' | 'WAIT' | 'BLOCK';
  violations: string[];
  dailyLossUsd: number;
  dailyLossLimitUsd: number;
  drawdownPct: number;
  maxDrawdownPct: number;
  cooldownActive: boolean;
  cooldownRemainingMin: number;
  openPositionsCount: number;
  recentTrades: number;
  winRatePct: number;
}

// ─── Risk Calculation ───────────────────────────────────────────────────────

/**
 * Compute today's realized P&L from the trade journal.
 * Sums pnlUsd from all close/liquidation/sl_triggered entries today.
 */
function computeDailyPnl(): number {
  const today = new Date().toISOString().slice(0, 10);
  const result = queryTradeJournal({
    from: today,
    to: today,
    limit: 100,
  });

  let pnl = 0;
  for (const entry of result.entries) {
    if (entry.type === 'close' || entry.type === 'liquidation' || entry.type === 'sl_triggered' || entry.type === 'tp_triggered') {
      pnl += entry.pnlUsd ?? 0;
    }
  }
  return pnl;
}

/**
 * Compute drawdown percentage from recent trade history.
 * Uses the last 30 days of closed trades to compute peak-to-trough decline.
 */
function computeDrawdownPct(): number {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const fromDate = thirtyDaysAgo.toISOString().slice(0, 10);

  const result = queryTradeJournal({
    from: fromDate,
    limit: 500,
  });

  const closedTrades = result.entries.filter(
    (e) => e.type === 'close' || e.type === 'liquidation' || e.type === 'sl_triggered' || e.type === 'tp_triggered',
  );

  if (closedTrades.length === 0) return 0;

  // Compute cumulative P&L curve and find max drawdown.
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;

  for (const trade of closedTrades) {
    cumulative += trade.pnlUsd ?? 0;
    if (cumulative > peak) peak = cumulative;
    const drawdown = peak > 0 ? ((peak - cumulative) / Math.abs(peak)) * 100 : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  return maxDrawdown;
}

/**
 * Check if cooldown is active after a recent losing trade.
 * Returns remaining minutes if cooldown is active, 0 if not.
 */
function checkCooldown(cooldownMinutes: number): { active: boolean; remainingMin: number } {
  if (cooldownMinutes <= 0) return { active: false, remainingMin: 0 };

  const now = Date.now();
  const recentLosses = queryTradeJournal({ limit: 10 });

  for (const entry of recentLosses.entries) {
    if ((entry.type === 'close' || entry.type === 'liquidation' || entry.type === 'sl_triggered') && (entry.pnlUsd ?? 0) < 0) {
      const tradeTime = new Date(entry.timestamp).getTime();
      const minutesSince = (now - tradeTime) / 60_000;
      if (minutesSince < cooldownMinutes) {
        return { active: true, remainingMin: Math.ceil(cooldownMinutes - minutesSince) };
      }
      break; // Only check the most recent loss.
    }
  }

  return { active: false, remainingMin: 0 };
}

/**
 * Count currently open positions from the journal.
 */
function countOpenPositions(): number {
  const today = new Date().toISOString().slice(0, 10);
  const result = queryTradeJournal({ from: today, limit: 100 });

  let openCount = 0;
  for (const entry of result.entries) {
    if (entry.type === 'open' && entry.status === 'open') openCount++;
    if ((entry.type === 'close' || entry.type === 'liquidation') && entry.status === 'closed') {
      // Position was closed, don't count it.
    }
  }
  return openCount;
}

/**
 * Compute win rate from recent closed trades.
 */
function computeWinRate(): { winRatePct: number; recentTrades: number } {
  const result = queryTradeJournal({ limit: 50 });
  const closed = result.entries.filter(
    (e) => e.type === 'close' || e.type === 'tp_triggered' || e.type === 'sl_triggered' || e.type === 'liquidation',
  );

  if (closed.length === 0) return { winRatePct: 0, recentTrades: 0 };

  const wins = closed.filter((e) => (e.pnlUsd ?? 0) > 0).length;
  return { winRatePct: (wins / closed.length) * 100, recentTrades: closed.length };
}

// ─── Tool Registration ──────────────────────────────────────────────────────

/**
 * @name registerRiskCheckTool
 * @description Register sap_perp_risk_check.
 * @internal
 */
export function registerRiskCheckTool(server: Server, context: SapMcpContext): void {
  registerTool(
    server,
    'sap_perp_risk_check',
    {
      title: 'Perp Risk Check',
      description:
        'Pre-trade dynamic risk gate. Reads the trade journal to compute daily P&L, drawdown, and cooldown status. Returns allowed/disallowed with a risk score (0-1) and recommendation (PROCEED/WAIT/BLOCK). Call this before sap_adrena_build_open_long or sap_adrena_build_open_short. Combines with the static policy engine for full risk management.',
      inputSchema: {
        type: 'object',
        properties: {
          market: {
            type: 'string',
            description: 'Market symbol (e.g. BONK, JITOSOL, WBTC, XAU).',
          },
          side: {
            type: 'string',
            description: 'Position side.',
            enum: ['long', 'short'],
          },
          collateralUsd: {
            type: 'number',
            description: 'Collateral amount in USD.',
            minimum: 0,
          },
          leverage: {
            type: 'number',
            description: 'Leverage multiplier (e.g. 3 for 3x).',
            minimum: 1,
          },
        },
        required: ['market', 'side', 'collateralUsd', 'leverage'],
        additionalProperties: false,
      },
    },
    async (rawInput: unknown) => {
      try {
        const input = rawInput as Record<string, unknown>;
        const market = String(input['market'] ?? '').toUpperCase();
        const side = input['side'] === 'short' ? 'short' : 'long';
        const collateralUsd = Number(input['collateralUsd'] ?? 0);
        const leverage = Number(input['leverage'] ?? 1);

        if (!market || collateralUsd <= 0 || leverage <= 0) {
          return createTextResponse(
            JSON.stringify({ error: 'market, side, collateralUsd, and leverage are required and must be positive.' }),
            { isError: true },
          );
        }

        // Read dynamic risk config from policy or defaults.
        const policy = context.policyEngine.getTradingPolicy();
        const dailyLossLimitUsd = policy.dailyLossLimitUsd ?? DEFAULT_DAILY_LOSS_LIMIT_USD;
        const maxDrawdownPct = policy.maxDrawdownPct ?? DEFAULT_MAX_DRAWDOWN_PCT;
        const cooldownMinutes = policy.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES;

        // Compute dynamic risk metrics.
        const dailyPnl = computeDailyPnl();
        const dailyLossUsd = dailyPnl < 0 ? Math.abs(dailyPnl) : 0;
        const drawdownPct = computeDrawdownPct();
        const cooldown = checkCooldown(cooldownMinutes);
        const openPositions = countOpenPositions();
        const { winRatePct, recentTrades } = computeWinRate();

        // Evaluate violations.
        const violations: string[] = [];

        // Static policy check.
        const staticCheck = context.policyEngine.validateTradingPolicy({
          market,
          side,
          collateralUsd,
          leverage,
          hasStopLoss: false,
        });
        if (!staticCheck.allowed) {
          violations.push(staticCheck.message ?? staticCheck.violation ?? 'Policy violation');
        }

        // Dynamic: daily loss limit.
        if (dailyLossUsd >= dailyLossLimitUsd) {
          violations.push(`Daily loss limit reached: $${dailyLossUsd.toFixed(2)} lost today (limit: $${dailyLossLimitUsd}). New trades blocked until tomorrow.`);
        }

        // Dynamic: drawdown.
        if (drawdownPct >= maxDrawdownPct) {
          violations.push(`Max drawdown exceeded: ${drawdownPct.toFixed(1)}% (limit: ${maxDrawdownPct}%). New trades blocked.`);
        }

        // Dynamic: cooldown.
        if (cooldown.active) {
          violations.push(`Cooldown active after recent loss: ${cooldown.remainingMin} min remaining.`);
        }

        // Dynamic: max open positions.
        if (openPositions >= policy.maxOpenPositions) {
          violations.push(`Max open positions reached: ${openPositions} (limit: ${policy.maxOpenPositions}).`);
        }

        // Compute risk score (0 = safe, 1 = maximum risk).
        let riskScore = 0;
        riskScore += Math.min(dailyLossUsd / dailyLossLimitUsd, 1) * 0.3; // 30% weight: daily loss
        riskScore += Math.min(drawdownPct / maxDrawdownPct, 1) * 0.25; // 25% weight: drawdown
        riskScore += cooldown.active ? 0.15 : 0; // 15% weight: cooldown
        riskScore += (leverage / policy.maxLeverage) * 0.15; // 15% weight: leverage ratio
        riskScore += (collateralUsd / policy.maxCollateralUsdPerTrade) * 0.15; // 15% weight: collateral ratio

        // Recommendation.
        let recommendation: 'PROCEED' | 'WAIT' | 'BLOCK';
        if (violations.length > 0) {
          recommendation = 'BLOCK';
          riskScore = Math.max(riskScore, 0.8);
        } else if (riskScore >= 0.6) {
          recommendation = 'WAIT';
        } else {
          recommendation = 'PROCEED';
        }

        const result: RiskCheckResult = {
          allowed: violations.length === 0,
          riskScore: Math.round(riskScore * 100) / 100,
          recommendation,
          violations,
          dailyLossUsd: Math.round(dailyLossUsd * 100) / 100,
          dailyLossLimitUsd,
          drawdownPct: Math.round(drawdownPct * 10) / 10,
          maxDrawdownPct,
          cooldownActive: cooldown.active,
          cooldownRemainingMin: cooldown.remainingMin,
          openPositionsCount: openPositions,
          recentTrades,
          winRatePct: Math.round(winRatePct * 10) / 10,
        };

        logger.info('Risk check completed', {
          market,
          side,
          allowed: result.allowed,
          riskScore: result.riskScore,
          recommendation: result.recommendation,
        });

        return createTextResponse(JSON.stringify(result, null, 2));
      } catch (error) {
        logger.error('sap_perp_risk_check failed', { error });
        return createTextResponse(
          `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { isError: true },
        );
      }
    },
  );
}

// ─── Portfolio Risk Tool ────────────────────────────────────────────────────

interface PortfolioRiskResult {
  totalExposureUsd: number;
  totalCollateralUsd: number;
  weightedLeverage: number;
  maxDrawdownPct: number;
  dailyPnlUsd: number;
  openPositions: number;
  riskScore: number;
  recommendation: 'SAFE' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  diversificationScore: number;
  reasons: string[];
}

/**
 * @name registerPortfolioRiskTool
 * @description Register sap_perp_portfolio_risk.
 * @internal
 */
export function registerPortfolioRiskTool(server: Server, _context: SapMcpContext): void {
  registerTool(
    server,
    'sap_perp_portfolio_risk',
    {
      title: 'Portfolio Risk Score',
      description:
        'Compute an aggregate portfolio risk score from the trade journal and open positions. Returns total exposure, weighted leverage, diversification score, and a risk recommendation (SAFE/MODERATE/HIGH/CRITICAL). Use this to assess overall portfolio health before opening new positions or when monitoring existing ones.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    async () => {
      try {
        // Read today's open positions from journal.
        const today = new Date().toISOString().slice(0, 10);
        const journalResult = queryTradeJournal({ from: today, limit: 100 });

        const openEntries = journalResult.entries.filter((e) => e.type === 'open' && e.status === 'open');

        let totalCollateralUsd = 0;
        let totalExposureUsd = 0;
        let weightedLeverageSum = 0;
        const markets = new Set<string>();

        for (const entry of openEntries) {
          totalCollateralUsd += entry.collateralUsd;
          totalExposureUsd += entry.collateralUsd * entry.leverage;
          weightedLeverageSum += entry.leverage * entry.collateralUsd;
          markets.add(entry.market);
        }

        const weightedLeverage = totalCollateralUsd > 0 ? weightedLeverageSum / totalCollateralUsd : 0;
        const diversificationScore = markets.size > 0 ? Math.min(markets.size / 5, 1) : 0;

        // Compute daily P&L and drawdown.
        const dailyPnl = computeDailyPnl();
        const drawdownPct = computeDrawdownPct();

        // Compute portfolio risk score (0 = safe, 1 = critical).
        let riskScore = 0;
        const reasons: string[] = [];

        // Exposure weight (30%)
        const exposureWeight = Math.min(totalExposureUsd / 200, 1) * 0.3;
        riskScore += exposureWeight;
        if (totalExposureUsd > 100) {
          reasons.push(`Total exposure $${totalExposureUsd.toFixed(2)} is high`);
        }

        // Leverage weight (25%)
        const leverageWeight = Math.min(weightedLeverage / 50, 1) * 0.25;
        riskScore += leverageWeight;
        if (weightedLeverage > 20) {
          reasons.push(`Weighted leverage ${weightedLeverage.toFixed(1)}x is high`);
        }

        // Drawdown weight (20%)
        const drawdownWeight = Math.min(drawdownPct / 30, 1) * 0.2;
        riskScore += drawdownWeight;
        if (drawdownPct > 15) {
          reasons.push(`Drawdown ${drawdownPct.toFixed(1)}% is significant`);
        }

        // Diversification penalty (15%)
        const diversificationPenalty = (1 - diversificationScore) * 0.15;
        riskScore += diversificationPenalty;
        if (markets.size === 1 && openEntries.length > 0) {
          reasons.push(`All positions in single market ${Array.from(markets)[0]} — no diversification`);
        }

        // Daily loss weight (10%)
        if (dailyPnl < 0) {
          const dailyLossWeight = Math.min(Math.abs(dailyPnl) / 10, 1) * 0.1;
          riskScore += dailyLossWeight;
          reasons.push(`Daily P&L is negative: $${dailyPnl.toFixed(2)}`);
        }

        riskScore = Math.max(0, Math.min(1, Math.round(riskScore * 100) / 100));

        let recommendation: 'SAFE' | 'MODERATE' | 'HIGH' | 'CRITICAL';
        if (riskScore < 0.3) recommendation = 'SAFE';
        else if (riskScore < 0.6) recommendation = 'MODERATE';
        else if (riskScore < 0.85) recommendation = 'HIGH';
        else recommendation = 'CRITICAL';

        if (reasons.length === 0) {
          reasons.push('Portfolio risk within normal parameters');
        }

        const result: PortfolioRiskResult = {
          totalExposureUsd: Math.round(totalExposureUsd * 100) / 100,
          totalCollateralUsd: Math.round(totalCollateralUsd * 100) / 100,
          weightedLeverage: Math.round(weightedLeverage * 10) / 10,
          maxDrawdownPct: Math.round(drawdownPct * 10) / 10,
          dailyPnlUsd: Math.round(dailyPnl * 100) / 100,
          openPositions: openEntries.length,
          riskScore,
          recommendation,
          diversificationScore: Math.round(diversificationScore * 100) / 100,
          reasons,
        };

        logger.info('Portfolio risk computed', {
          riskScore: result.riskScore,
          recommendation: result.recommendation,
          openPositions: result.openPositions,
        });

        return createTextResponse(JSON.stringify(result, null, 2));
      } catch (error) {
        logger.error('sap_perp_portfolio_risk failed', { error });
        return createTextResponse(
          `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { isError: true },
        );
      }
    },
  );
}