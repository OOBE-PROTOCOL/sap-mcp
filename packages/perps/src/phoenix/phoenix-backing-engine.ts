/**
 * @name perps/phoenix/phoenix-backing-engine
 * @description Perp-backing keeper engine (PerpsPad model, Phoenix venue).
 *
 * Pure state machine `evaluateBackingTick` decides the next action for a
 * token's backing position from (policy, position, collateral, now).
 * 100% testable without chain access. The thin executor in the backing-tick
 * route translates decisions into the existing Phoenix builders
 * (buildRegisterTrader, buildDeposit, buildPlaceMarketOrder,
 * getTraderStateSnapshot).
 *
 * Policy model (mirrors perpspad.fun/whitepaper §6-8, adapted to our 70/30):
 * - open:        collateral >= OPEN_THRESHOLD_USD ($20) and no position
 * - top-up:      position open and collateral >= top-up step ($20 increments)
 * - take-profit: floating PnL >= takeProfitPct of collateral (realize partial)
 * - re-open:     after liquidation, cooldown 6h/12h/24h and leverage ×0.6
 *                (min 3x) — mirrors PerpsPad §8
 * - none:        otherwise
 *
 * @module perps/phoenix/phoenix-backing-engine
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BackingPolicy {
  /** Phoenix market symbol (e.g. SOL, BTC, TSLA). */
  underlying: string;
  /** Integer 1-10. */
  leverage: number;
  direction: 'long' | 'short';
  status: 'pending-keeper' | 'active' | 'paused';
}

export interface BackingPosition {
  /** Position exists (has been opened at least once). */
  exists: boolean;
  /** Current collateral in USDC (human units). */
  collateralUsdc: number;
  /** Floating (unrealized) PnL in USDC. */
  pnlUsdc: number;
  /** Current notional exposure in USDC. */
  notionalUsdc: number;
  /** Current effective leverage (0 if no position). */
  leverage: number;
  /** Liquidation occurred at this instant (epoch ms), or null. */
  lastLiquidationAt: number | null;
  /** Consecutive liquidation count (drives cooldown + de-leverage steps). */
  liquidationCount: number;
}

export interface BackingDecision {
  action: 'none' | 'open' | 'top-up' | 'take-profit' | 're-open';
  /** Reason — surfaced in keeper logs and the token page. */
  reason: string;
  /** USDC amount for the action (open/top-up: collateral to deploy; TP: notional to close). */
  amountUsdc: number;
  /** Leverage for the action (re-open may de-lever). */
  leverage: number;
  direction: 'long' | 'short';
  underlying: string;
}

/** Tunables — defaults mirror PerpsPad §6-8. */
export interface BackingEngineConfig {
  /** Collateral needed before the first open. */
  openThresholdUsdc: number;
  /** Collateral per top-up. */
  topUpStepUsdc: number;
  /** Floating PnL (fraction of collateral) that triggers a partial TP. */
  takeProfitPct: number;
  /** Fraction of the position closed on TP. */
  takeProfitCloseFraction: number;
  /** Liquidation cooldowns, in ms, indexed by (consecutive count - 1). */
  liquidationCooldownsMs: number[];
  /** Leverage multiplier applied per re-open after liquidation. */
  liquidationLeverageStep: number;
  /** Minimum leverage after de-leveraging. */
  minLeverage: number;
  /** Hard floor on deployed collateral per action (dust guard). */
  minActionUsdc: number;
}

export const DEFAULT_BACKING_ENGINE_CONFIG: BackingEngineConfig = {
  openThresholdUsdc: 20,
  topUpStepUsdc: 20,
  takeProfitPct: 0.25,
  takeProfitCloseFraction: 0.5,
  liquidationCooldownsMs: [6 * 3600_000, 12 * 3600_000, 24 * 3600_000],
  liquidationLeverageStep: 0.6,
  minLeverage: 3,
  minActionUsdc: 5,
};

// ─── Pure decision function ───────────────────────────────────────────────────

/**
 * Decide the next backing action. PURE — no chain, no clock, no side effects.
 * `now` is epoch ms (injected for testability).
 */
export function evaluateBackingTick(
  policy: BackingPolicy,
  position: BackingPosition,
  availableCollateralUsdc: number,
  now: number,
  config: BackingEngineConfig = DEFAULT_BACKING_ENGINE_CONFIG,
): BackingDecision {
  const base: Omit<BackingDecision, 'action' | 'reason'> = {
    amountUsdc: 0,
    leverage: policy.leverage,
    direction: policy.direction,
    underlying: policy.underlying,
  };

  // Policy paused → nothing to do.
  if (policy.status !== 'pending-keeper' && policy.status !== 'active') {
    return { ...base, action: 'none', reason: `backing policy status=${policy.status}` };
  }

  // ── Post-liquidation branch ────────────────────────────────────────────
  if (position.lastLiquidationAt !== null && position.liquidationCount > 0) {
    const idx = Math.min(position.liquidationCount - 1, config.liquidationCooldownsMs.length - 1);
    const cooldown = config.liquidationCooldownsMs[idx] ?? config.liquidationCooldownsMs[0] ?? 24 * 3600_000;
    const elapsed = now - position.lastLiquidationAt;
    if (elapsed < cooldown) {
      const hoursLeft = ((cooldown - elapsed) / 3600_000).toFixed(1);
      return { ...base, action: 'none', reason: `liquidation cooldown — ${hoursLeft}h remaining` };
    }
    // Re-open at reduced leverage (×0.6 per liquidation, floor 3x).
    const steps = position.liquidationCount;
    const steppedLeverage = Math.max(config.minLeverage, Math.round(policy.leverage * config.liquidationLeverageStep ** steps));
    if (availableCollateralUsdc < config.openThresholdUsdc) {
      return { ...base, action: 'none', reason: `cooldown elapsed — collecting fees for re-open ($${availableCollateralUsdc.toFixed(2)}/$${config.openThresholdUsdc})` };
    }
    return {
      ...base,
      action: 're-open',
      reason: `re-opening after liquidation #${steps} at ${steppedLeverage}x (was ${policy.leverage}x)`,
      amountUsdc: Math.min(availableCollateralUsdc, config.openThresholdUsdc),
      leverage: steppedLeverage,
    };
  }

  // ── No position yet → open at threshold ────────────────────────────────
  if (!position.exists) {
    if (availableCollateralUsdc < config.openThresholdUsdc) {
      return { ...base, action: 'none', reason: `accumulating fees — $${availableCollateralUsdc.toFixed(2)}/$${config.openThresholdUsdc} to open` };
    }
    return {
      ...base,
      action: 'open',
      reason: `fee threshold reached ($${availableCollateralUsdc.toFixed(2)}) — opening ${policy.direction} ${policy.leverage}x ${policy.underlying}`,
      amountUsdc: Math.min(availableCollateralUsdc, config.openThresholdUsdc),
    };
  }

  // ── Position exists ─────────────────────────────────────────────────────
  // Liquidated-but-not-flagged positions are handled by the venue; we treat
  // zero collateral + zero notional as an implicit liquidation.
  if (position.collateralUsdc <= 0 && position.notionalUsdc <= 0) {
    return {
      ...base,
      action: 'none',
      reason: 'position empty — awaiting liquidation bookkeeping',
    };
  }

  // Take-profit: floating PnL above the threshold (fraction of collateral).
  const tpTrigger = position.collateralUsdc * config.takeProfitPct;
  if (position.pnlUsdc >= tpTrigger && position.pnlUsdc > 0) {
    const closeNotional = position.notionalUsdc * config.takeProfitCloseFraction;
    return {
      ...base,
      action: 'take-profit',
      reason: `floating PnL $${position.pnlUsdc.toFixed(2)} ≥ ${Math.round(config.takeProfitPct * 100)}% of collateral — closing ${Math.round(config.takeProfitCloseFraction * 100)}%`,
      amountUsdc: closeNotional,
    };
  }

  // Top-up: deploy the next $20 step when available.
  if (availableCollateralUsdc >= config.topUpStepUsdc) {
    const step = Math.floor(availableCollateralUsdc / config.topUpStepUsdc) * config.topUpStepUsdc;
    return {
      ...base,
      action: 'top-up',
      reason: `top-up $${step.toFixed(2)} at ${policy.leverage}x`,
      amountUsdc: step,
    };
  }

  return { ...base, action: 'none', reason: `holding — $${availableCollateralUsdc.toFixed(2)} available (top-up at $${config.topUpStepUsdc})` };
}