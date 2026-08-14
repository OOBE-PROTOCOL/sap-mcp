import { describe, expect, it } from 'vitest';
import { calculateRiskLevel, requiresApproval } from './risk-level.js';
import type { SapRiskLevel } from '../core/types.js';

describe('calculateRiskLevel', () => {
  // ── Amount-based base risk ────────────────────────────────────────

  it('returns "safe" for zero amount', () => {
    expect(calculateRiskLevel({
      amountSol: 0,
      isWriteOperation: false,
      isKnownOperation: false,
      toolName: 'get_balance',
    })).toBe('safe');
  });

  it('returns "low" for amounts below 0.1 SOL', () => {
    expect(calculateRiskLevel({
      amountSol: 0.05,
      isWriteOperation: false,
      isKnownOperation: false,
      toolName: 'transfer',
    })).toBe('low');
  });

  it('returns "medium" for amounts between 0.1 and 1.0 SOL', () => {
    expect(calculateRiskLevel({
      amountSol: 0.5,
      isWriteOperation: false,
      isKnownOperation: false,
      toolName: 'transfer',
    })).toBe('medium');
  });

  it('returns "high" for amounts between 1.0 and 10.0 SOL', () => {
    expect(calculateRiskLevel({
      amountSol: 5,
      isWriteOperation: false,
      isKnownOperation: false,
      toolName: 'transfer',
    })).toBe('high');
  });

  it('returns "critical" for amounts >= 10.0 SOL', () => {
    expect(calculateRiskLevel({
      amountSol: 10,
      isWriteOperation: false,
      isKnownOperation: false,
      toolName: 'transfer',
    })).toBe('critical');
  });

  it('returns "critical" for very large amounts', () => {
    expect(calculateRiskLevel({
      amountSol: 1000,
      isWriteOperation: false,
      isKnownOperation: false,
      toolName: 'transfer',
    })).toBe('critical');
  });

  // ── Write operation elevation ─────────────────────────────────────

  it('elevates safe to low for write operations', () => {
    expect(calculateRiskLevel({
      amountSol: 0,
      isWriteOperation: true,
      isKnownOperation: false,
      toolName: 'create_transaction',
    })).toBe('low');
  });

  it('does not further elevate non-safe risk for write operations', () => {
    // Write only elevates 'safe' → 'low'. 'low' stays 'low'.
    expect(calculateRiskLevel({
      amountSol: 0.05,
      isWriteOperation: true,
      isKnownOperation: false,
      toolName: 'create_transaction',
    })).toBe('low');
  });

  // ── Known operation reduction ─────────────────────────────────────

  it('reduces risk by one tier for known operations', () => {
    // medium → low
    expect(calculateRiskLevel({
      amountSol: 0.5,
      isWriteOperation: false,
      isKnownOperation: true,
      toolName: 'transfer',
    })).toBe('low');
  });

  it('reduces high to medium for known operations', () => {
    expect(calculateRiskLevel({
      amountSol: 5,
      isWriteOperation: false,
      isKnownOperation: true,
      toolName: 'transfer',
    })).toBe('medium');
  });

  it('reduces critical to high for known operations', () => {
    expect(calculateRiskLevel({
      amountSol: 100,
      isWriteOperation: false,
      isKnownOperation: true,
      toolName: 'transfer',
    })).toBe('high');
  });

  it('does not reduce below safe for known operations', () => {
    // low → safe
    expect(calculateRiskLevel({
      amountSol: 0.05,
      isWriteOperation: false,
      isKnownOperation: true,
      toolName: 'transfer',
    })).toBe('safe');
  });

  it('keeps safe as safe for known operations', () => {
    expect(calculateRiskLevel({
      amountSol: 0,
      isWriteOperation: false,
      isKnownOperation: true,
      toolName: 'get_balance',
    })).toBe('safe');
  });

  // ── Combined write + known ────────────────────────────────────────

  it('elevates then reduces for write + known operations', () => {
    // amount=0 → safe → write elevates to low → known reduces to safe
    expect(calculateRiskLevel({
      amountSol: 0,
      isWriteOperation: true,
      isKnownOperation: true,
      toolName: 'create_transaction',
    })).toBe('safe');
  });

  it('elevates write then reduces known for medium amount', () => {
    // amount=0.5 → medium → write does not change (not safe) → known reduces to low
    expect(calculateRiskLevel({
      amountSol: 0.5,
      isWriteOperation: true,
      isKnownOperation: true,
      toolName: 'create_transaction',
    })).toBe('low');
  });

  // ── Edge cases ────────────────────────────────────────────────────

  it('handles very small non-zero amounts', () => {
    expect(calculateRiskLevel({
      amountSol: 0.001,
      isWriteOperation: false,
      isKnownOperation: false,
      toolName: 'transfer',
    })).toBe('low');
  });

  it('handles exactly 0.1 SOL (boundary)', () => {
    // 0.1 is not < 0.1, so it's medium
    expect(calculateRiskLevel({
      amountSol: 0.1,
      isWriteOperation: false,
      isKnownOperation: false,
      toolName: 'transfer',
    })).toBe('medium');
  });

  it('handles exactly 1.0 SOL (boundary)', () => {
    // 1.0 is not < 1.0, so it's high
    expect(calculateRiskLevel({
      amountSol: 1.0,
      isWriteOperation: false,
      isKnownOperation: false,
      toolName: 'transfer',
    })).toBe('high');
  });

  it('handles exactly 10.0 SOL (boundary)', () => {
    // 10.0 is not < 10.0, so it's critical
    expect(calculateRiskLevel({
      amountSol: 10.0,
      isWriteOperation: false,
      isKnownOperation: false,
      toolName: 'transfer',
    })).toBe('critical');
  });

  it('handles negative amounts as critical', () => {
    expect(calculateRiskLevel({
      amountSol: -1,
      isWriteOperation: false,
      isKnownOperation: false,
      toolName: 'transfer',
    })).toBe('critical');
  });

  it('handles non-finite amounts as critical', () => {
    expect(calculateRiskLevel({
      amountSol: Number.NaN,
      isWriteOperation: false,
      isKnownOperation: false,
      toolName: 'transfer',
    })).toBe('critical');
  });
});

describe('requiresApproval', () => {
  // ── Approval required ─────────────────────────────────────────────

  it('returns true for "high" risk', () => {
    expect(requiresApproval('high')).toBe(true);
  });

  it('returns true for "critical" risk', () => {
    expect(requiresApproval('critical')).toBe(true);
  });

  // ── No approval required ──────────────────────────────────────────

  it('returns false for "safe" risk', () => {
    expect(requiresApproval('safe')).toBe(false);
  });

  it('returns false for "low" risk', () => {
    expect(requiresApproval('low')).toBe(false);
  });

  it('returns false for "medium" risk', () => {
    expect(requiresApproval('medium')).toBe(false);
  });

  // ── All risk levels ───────────────────────────────────────────────

  it('correctly classifies all SapRiskLevel values', () => {
    const cases: { level: SapRiskLevel; expected: boolean }[] = [
      { level: 'safe', expected: false },
      { level: 'low', expected: false },
      { level: 'medium', expected: false },
      { level: 'high', expected: true },
      { level: 'critical', expected: true },
    ];
    for (const { level, expected } of cases) {
      expect(requiresApproval(level)).toBe(expected);
    }
  });
});
