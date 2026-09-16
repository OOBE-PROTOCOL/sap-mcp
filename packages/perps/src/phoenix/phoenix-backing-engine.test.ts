// Unit tests for the Phoenix backing keeper state machine (pure — no chain).
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BACKING_ENGINE_CONFIG,
  evaluateBackingTick,
  type BackingPolicy,
  type BackingPosition,
} from './phoenix-backing-engine.js';

const NOW = 1_700_000_000_000;
const policy = (overrides: Partial<BackingPolicy> = {}): BackingPolicy => ({
  underlying: 'SOL',
  leverage: 5,
  direction: 'long',
  status: 'active',
  ...overrides,
});
const position = (overrides: Partial<BackingPosition> = {}): BackingPosition => ({
  exists: false,
  collateralUsdc: 0,
  pnlUsdc: 0,
  notionalUsdc: 0,
  leverage: 0,
  lastLiquidationAt: null,
  liquidationCount: 0,
  ...overrides,
});

describe('evaluateBackingTick — open', () => {
  it('opens when fees reach the $20 threshold', () => {
    const d = evaluateBackingTick(policy(), position(), 23.5, NOW);
    expect(d.action).toBe('open');
    expect(d.amountUsdc).toBe(20);
    expect(d.leverage).toBe(5);
    expect(d.direction).toBe('long');
  });

  it('waits below the threshold', () => {
    const d = evaluateBackingTick(policy(), position(), 12, NOW);
    expect(d.action).toBe('none');
    expect(d.reason).toMatch(/accumulating/);
  });
});

describe('evaluateBackingTick — top-up', () => {
  it('tops up in $20 steps when collateral is available', () => {
    const d = evaluateBackingTick(policy(), position({ exists: true, collateralUsdc: 40, notionalUsdc: 200 }), 47, NOW);
    expect(d.action).toBe('top-up');
    expect(d.amountUsdc).toBe(40); // floor(47/20)*20
    expect(d.reason).toMatch(/top-up/);
  });

  it('holds when below the top-up step', () => {
    const d = evaluateBackingTick(policy(), position({ exists: true, collateralUsdc: 40, notionalUsdc: 200 }), 15, NOW);
    expect(d.action).toBe('none');
    expect(d.reason).toMatch(/holding/);
  });
});

describe('evaluateBackingTick — take-profit', () => {
  it('triggers a partial close when PnL ≥ 25% of collateral', () => {
    const d = evaluateBackingTick(
      policy(),
      position({ exists: true, collateralUsdc: 40, notionalUsdc: 200, pnlUsdc: 12 }),
      0,
      NOW,
    );
    expect(d.action).toBe('take-profit');
    expect(d.amountUsdc).toBe(100); // 50% of notional
  });

  it('does not take profit below the threshold', () => {
    const d = evaluateBackingTick(
      policy(),
      position({ exists: true, collateralUsdc: 40, notionalUsdc: 200, pnlUsdc: 5 }),
      0,
      NOW,
    );
    expect(d.action).toBe('none');
  });

  it('take-profit wins over top-up', () => {
    const d = evaluateBackingTick(
      policy(),
      position({ exists: true, collateralUsdc: 40, notionalUsdc: 200, pnlUsdc: 12 }),
      50,
      NOW,
    );
    expect(d.action).toBe('take-profit');
  });
});

describe('evaluateBackingTick — liquidation & re-open', () => {
  it('respects the first cooldown (6h)', () => {
    const d = evaluateBackingTick(
      policy({ leverage: 5 }),
      position({ exists: true, lastLiquidationAt: NOW - 2 * 3600_000, liquidationCount: 1 }),
      100,
      NOW,
    );
    expect(d.action).toBe('none');
    expect(d.reason).toMatch(/cooldown/);
  });

  it('re-opens at ×0.6 leverage after the cooldown (floor 3x)', () => {
    const d = evaluateBackingTick(
      policy({ leverage: 5 }),
      position({ exists: true, lastLiquidationAt: NOW - 7 * 3600_000, liquidationCount: 1 }),
      100,
      NOW,
    );
    expect(d.action).toBe('re-open');
    expect(d.leverage).toBe(3); // round(5 * 0.6) = 3
    expect(d.amountUsdc).toBe(20);
  });

  it('floors at minLeverage 3x and extends cooldown for repeat liquidations', () => {
    // 3rd liquidation: cooldown index 2 = 24h — still cooling at 23h
    const d = evaluateBackingTick(
      policy({ leverage: 10 }),
      position({ exists: true, lastLiquidationAt: NOW - 23 * 3600_000, liquidationCount: 3 }),
      100,
      NOW,
    );
    expect(d.action).toBe('none');
    // after 25h: re-open at max(3, round(5 * 0.6^3)) = max(3, 1) = 3
    const d2 = evaluateBackingTick(
      policy({ leverage: 5 }),
      position({ exists: true, lastLiquidationAt: NOW - 25 * 3600_000, liquidationCount: 3 }),
      100,
      NOW,
    );
    expect(d2.action).toBe('re-open');
    expect(d2.leverage).toBe(3);
  });
});

describe('evaluateBackingTick — guards', () => {
  it('does nothing when the policy is paused', () => {
    const d = evaluateBackingTick(policy({ status: 'paused' }), position(), 100, NOW);
    expect(d.action).toBe('none');
    expect(d.reason).toMatch(/paused/);
  });

  it('treats an empty position as awaiting bookkeeping', () => {
    const d = evaluateBackingTick(policy(), position({ exists: true, collateralUsdc: 0, notionalUsdc: 0 }), 100, NOW);
    expect(d.action).toBe('none');
    expect(d.reason).toMatch(/bookkeeping/);
  });

  it('config is injectable (thresholds overridable)', () => {
    const d = evaluateBackingTick(policy(), position(), 10, NOW, {
      ...DEFAULT_BACKING_ENGINE_CONFIG,
      openThresholdUsdc: 8,
    });
    expect(d.action).toBe('open');
  });
});