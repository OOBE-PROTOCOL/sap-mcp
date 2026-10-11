/**
 * @name tools/tool-pricing/registry.test
 * @description Unit tests for the module pricing policy registry.
 *
 * @module tools/tool-pricing
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { ToolPricingRegistry, resetToolPricingRegistry, getToolPricingRegistry } from './registry.js';
import { ModulePricingPolicySchema, parseModulePricingPolicy } from './policy.js';

describe('tool-pricing policy schema', () => {
  it('accepts a minimal default-only policy', () => {
    const policy = parseModulePricingPolicy({ defaultTier: 'free' });
    expect(policy.defaultTier).toBe('free');
    expect(policy.perTool).toBeUndefined();
  });

  it('accepts per-tool overrides and a rationale', () => {
    const policy = parseModulePricingPolicy({
      defaultTier: 'read-premium',
      perTool: {
        sap_x_build_swap: 'builder',
        sap_x_get_state: 'free',
      },
      rationale: 'test rationale',
    });
    expect(policy.perTool?.sap_x_build_swap).toBe('builder');
  });

  it('rejects unknown tier names (strict enum — fail-fast at module definition)', () => {
    expect(() => parseModulePricingPolicy({ defaultTier: 'ultra-premium' })).toThrow();
  });

  it('rejects extra fields (strict object)', () => {
    expect(() => parseModulePricingPolicy({ defaultTier: 'free', priceUsd: 5 })).toThrow();
  });
});

describe('ToolPricingRegistry', () => {
  beforeEach(() => {
    resetToolPricingRegistry();
  });

  it('resolves per-tool overrides ahead of the module default', () => {
    const registry = new ToolPricingRegistry();
    registry.registerModule('phoenix', {
      defaultTier: 'free',
      perTool: { sap_phoenix_build_deposit: 'builder' },
    }, ['sap_phoenix_get_markets']);
    expect(registry.resolve('sap_phoenix_build_deposit')).toEqual({
      tier: 'builder',
      source: 'module-per-tool',
      moduleId: 'phoenix',
    });
    expect(registry.resolve('sap_phoenix_get_markets')).toEqual({
      tier: 'free',
      source: 'module-default',
      moduleId: 'phoenix',
    });
  });

  it('returns null for unpriced tools (resolver falls through to platform sets)', () => {
    const registry = new ToolPricingRegistry();
    expect(registry.resolve('sap_unknown_tool')).toBeNull();
    expect(registry.has('sap_unknown_tool')).toBe(false);
  });

  it('throws on conflicting explicit pricing for the same tool', () => {
    const registry = new ToolPricingRegistry();
    registry.registerModule('phoenix', {
      defaultTier: 'free',
      perTool: { sap_x_build_swap: 'builder' },
    });
    expect(() =>
      registry.registerModule('adrena', {
        defaultTier: 'free',
        perTool: { sap_x_build_swap: 'free' },
      }),
    ).toThrow(/pricing conflict/);
  });

  it('same tool explicitly priced identically by two modules is allowed (shared surfaces)', () => {
    const registry = new ToolPricingRegistry();
    registry.registerModule('phoenix', {
      defaultTier: 'free',
      perTool: { sap_x_build_swap: 'builder' },
    });
    expect(() =>
      registry.registerModule('adrena', {
        defaultTier: 'free',
        perTool: { sap_x_build_swap: 'builder' },
      }),
    ).not.toThrow();
  });

  it('module default covers expectedTools without explicit overrides', () => {
    const registry = new ToolPricingRegistry();
    registry.registerModule('phoenix', { defaultTier: 'free' }, ['sap_phoenix_get_markets']);
    expect(registry.resolve('sap_phoenix_get_markets')).toEqual({
      tier: 'free',
      source: 'module-default',
      moduleId: 'phoenix',
    });
    expect(registry.size()).toBe(1);
  });

  it('singleton is stable and resettable', () => {
    const a = getToolPricingRegistry();
    expect(getToolPricingRegistry()).toBe(a);
    resetToolPricingRegistry();
    expect(getToolPricingRegistry()).not.toBe(a);
  });

  it('pricedToolNames is sorted and complete', () => {
    const registry = new ToolPricingRegistry();
    registry.registerModule('m', {
      defaultTier: 'free',
      perTool: { sap_m_z: 'builder', sap_m_a: 'builder' },
    });
    expect(registry.pricedToolNames()).toEqual(['sap_m_a', 'sap_m_z']);
  });
});

describe('module manifest pricing field wiring', () => {
  it('a module manifest with pricing validates through the manifest schema', async () => {
    const { ToolModuleManifestSchema } = await import('../tool-module-manifest.js');
    const manifest = ToolModuleManifestSchema.parse({
      id: 'test-module',
      title: 'Test Module',
      description: 'A test module description long enough for the schema.',
      category: 'integration',
      order: 400,
      pricing: { defaultTier: 'free', perTool: { sap_test_build: 'builder' } },
    });
    expect(manifest.pricing?.defaultTier).toBe('free');
  });
});