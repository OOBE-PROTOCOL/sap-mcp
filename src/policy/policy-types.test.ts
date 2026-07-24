import { describe, expect, it } from 'vitest';
import type { Policy, PolicyRule, PolicyResult, PolicyContext } from './policy-types.js';
import type { SapPermission, SapRiskLevel } from '../core/types.js';

describe('Policy type shapes', () => {
  // ── Policy ────────────────────────────────────────────────────────

  it('constructs a Policy with all required fields', () => {
    const policy: Policy = {
      id: 'test-policy',
      name: 'Test Policy',
      description: 'A test policy',
      rules: [],
      enabled: true,
    };
    expect(policy.id).toBe('test-policy');
    expect(policy.name).toBe('Test Policy');
    expect(policy.description).toBe('A test policy');
    expect(policy.rules).toEqual([]);
    expect(policy.enabled).toBe(true);
  });

  it('constructs a disabled Policy', () => {
    const policy: Policy = {
      id: 'disabled-policy',
      name: 'Disabled',
      description: 'Not active',
      rules: [],
      enabled: false,
    };
    expect(policy.enabled).toBe(false);
  });

  // ── PolicyRule ────────────────────────────────────────────────────

  it('constructs a PolicyRule with allow action', () => {
    const rule: PolicyRule = {
      id: 'allow-reads',
      condition: 'tool === "get_account_info"',
      action: 'allow',
    };
    expect(rule.action).toBe('allow');
  });

  it('constructs a PolicyRule with deny action', () => {
    const rule: PolicyRule = {
      id: 'deny-close',
      condition: 'action.includes("close")',
      action: 'deny',
    };
    expect(rule.action).toBe('deny');
  });

  it('constructs a PolicyRule with require_approval action', () => {
    const rule: PolicyRule = {
      id: 'approve-large',
      condition: 'amountSol > 5',
      action: 'require_approval',
    };
    expect(rule.action).toBe('require_approval');
  });

  it('constructs a PolicyRule with optional fields', () => {
    const rule: PolicyRule = {
      id: 'full-rule',
      condition: 'riskLevel === "high"',
      action: 'deny',
      tools: ['sap_sign_transaction', 'sap_submit_transaction'],
      permissions: ['transaction:submit', 'registry:write'],
      maxAmountSol: 10,
      riskLevel: 'high',
    };
    expect(rule.tools).toEqual(['sap_sign_transaction', 'sap_submit_transaction']);
    expect(rule.permissions).toContain('transaction:submit');
    expect(rule.maxAmountSol).toBe(10);
    // Verify optional fields are set correctly
    expect(rule.tools).toBeDefined();
    expect(rule.permissions).toBeDefined();
    expect(rule.maxAmountSol).toBe(10);
    expect(rule.riskLevel).toBe('high');
  });

  // ── PolicyResult ──────────────────────────────────────────────────

  it('constructs an allowed PolicyResult', () => {
    const result: PolicyResult = { allowed: true };
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.requiresApproval).toBeUndefined();
  });

  it('constructs a denied PolicyResult with reason', () => {
    const result: PolicyResult = {
      allowed: false,
      reason: 'Amount exceeds limit',
    };
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Amount exceeds limit');
  });

  it('constructs a PolicyResult requiring approval', () => {
    const result: PolicyResult = {
      allowed: false,
      requiresApproval: true,
      reason: 'Requires human approval',
      riskLevel: 'high',
    };
    expect(result.requiresApproval).toBe(true);
    expect(result.riskLevel).toBe('high');
  });

  // ── PolicyContext ─────────────────────────────────────────────────

  it('constructs a PolicyContext with required fields', () => {
    const ctx: PolicyContext = {
      toolName: 'get_balance',
      permission: 'config:read',
    };
    expect(ctx.toolName).toBe('get_balance');
    expect(ctx.permission).toBe('config:read');
    expect(ctx.amountSol).toBeUndefined();
  });

  it('constructs a PolicyContext with optional fields', () => {
    const ctx: PolicyContext = {
      toolName: 'sap_sign_transaction',
      permission: 'transaction:submit',
      amountSol: 2.5,
      riskLevel: 'high',
      sessionId: 'session-123',
    };
    expect(ctx.amountSol).toBe(2.5);
    expect(ctx.riskLevel).toBe('high');
    expect(ctx.sessionId).toBe('session-123');
  });

  // ── PolicyRule.action union ───────────────────────────────────────

  it('PolicyRule action accepts all three union members', () => {
    const actions: PolicyRule['action'][] = ['allow', 'deny', 'require_approval'];
    expect(actions).toHaveLength(3);
    expect(actions).toContain('allow');
    expect(actions).toContain('deny');
    expect(actions).toContain('require_approval');
  });

  // ── SapRiskLevel usage through policy types ───────────────────────

  it('PolicyRule riskLevel accepts all SapRiskLevel values', () => {
    const levels: SapRiskLevel[] = ['safe', 'low', 'medium', 'high', 'critical'];
    for (const level of levels) {
      const rule: PolicyRule = {
        id: `rule-${level}`,
        condition: `risk === "${level}"`,
        action: level === 'safe' ? 'allow' : 'deny',
        riskLevel: level,
      };
      expect(rule.riskLevel).toBe(level);
    }
  });

  // ── SapPermission usage through policy types ──────────────────────

  it('PolicyRule permissions accept valid SapPermission values', () => {
    const permissions: SapPermission[] = [
      'config:read',
      'config:write',
      'registry:read',
      'registry:write',
      'transaction:submit',
    ];
    const rule: PolicyRule = {
      id: 'perm-rule',
      condition: 'true',
      action: 'allow',
      permissions,
    };
    expect(rule.permissions).toHaveLength(5);
    expect(rule.permissions).toContain('transaction:submit');
  });
});