import { describe, expect, it, beforeEach } from 'vitest';
import { BUILTIN_TOOL_MODULES } from '../builtin-tool-modules.js';
import { getToolPricingRegistry, resetToolPricingRegistry } from './registry.js';
import { classifyTool } from '../../../payments/src/pricing.js';

/**
 * E2E wiring test: the payments/pricing classifier resolves tool-module
 * policies registered from BUILTIN_TOOL_MODULES — proving the whole chain
 * (manifest → module-registry → tool-pricing singleton → payments
 * classifyTool) is live, not just unit-tested in pieces.
 */
describe('E2E: payments classifyTool resolves module pricing', () => {
  beforeEach(() => {
    resetToolPricingRegistry();
    for (const module of BUILTIN_TOOL_MODULES) {
      if (module.pricing) {
        getToolPricingRegistry().registerModule(module.id, module.pricing, module.expectedTools ?? []);
      }
    }
  });

  it('fixes the Phoenix historical mispricing: data reads FREE, builders BUILDER', () => {
    expect(classifyTool('sap_phoenix_get_markets')).toBe('free');
    expect(classifyTool('sap_phoenix_get_orderbook')).toBe('free');
    expect(classifyTool('sap_phoenix_get_market_stats')).toBe('free');
    expect(classifyTool('sap_phoenix_build_place_limit_order')).toBe('builder');
    expect(classifyTool('sap_phoenix_build_withdraw')).toBe('builder');
  });

  it('launchpad dev-buy + DBC launch builders are builder tier through the real classifier', () => {
    expect(classifyTool('sap_steve_launch_build_dbc_dev_buy')).toBe('builder');
    expect(classifyTool('sap_perpspad_build_escrow_launch')).toBe('builder');
  });

  it('adrena data micro-reads stay micro-read; platform-set tools still hit their set tier', () => {
    expect(classifyTool('sap_adrena_get_positions')).toBe('micro-read');
    expect(classifyTool('sap_estimate_tool_cost')).toBe('free');
    expect(classifyTool('jupiter_getQuote')).toBe('read-premium');
  });
});
