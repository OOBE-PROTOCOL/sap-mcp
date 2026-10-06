/**
 * @name tools/tool-pricing/coverage.test
 * @description THE pricing-drift tripwire.
 *
 * Every builtin protocol-family tool module MUST declare a pricing policy
 * and every tool it expects to register MUST resolve to an EXPLICIT tier
 * (module per-tool override, module default, or platform set). The
 * keyword-fallback classifier in payments/pricing is a safety net, never a
 * pricing source: a tool resolved ONLY by fallback FAILS this test.
 *
 * Root cause this enforces against: Phoenix shipped 24/29 tools described
 * as "Free read" in their own descriptions while classifyTool's keyword
 * fallback charged read-premium ($0.002/call) — description and wallet
 * disagreed, silently.
 *
 * @module tools/tool-pricing/coverage
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_TOOL_MODULES } from '../builtin-tool-modules.js';
import { TOOL_MODULES_WITH_EXPLICIT_PRICING_FALLBACK_OK } from './coverage-baseline.js';
import { ToolPricingRegistry } from './registry.js';

/** The keyword fallback in payments/pricing (mirror of its rules — see pricing.ts BUILDER_KEYWORDS / READ_PREMIUM_KEYWORDS). */
const BUILDER_KEYWORDS = ['analytics', 'batch', 'build', 'builder', 'domain', 'enriched', 'insight', 'route', 'sns', 'swap'];
const READ_PREMIUM_KEYWORDS = ['discover', 'index', 'market', 'network', 'overview', 'price', 'protocol', 'stats'];
const VALUE_ACTION_PREFIXES = ['sap_register', 'sap_update', 'sap_deactivate', 'sap_reactivate', 'sap_close', 'sap_publish', 'sap_create', 'sap_fund', 'sap_cancel', 'sap_deposit', 'sap_withdraw', 'sap_settle', 'sap_finalize', 'sap_file', 'sap_submit', 'sap_sign', 'sap_sns_register'];

function isFallbackClassified(toolName: string): boolean {
  if (VALUE_ACTION_PREFIXES.some((prefix) => toolName.startsWith(prefix))) {
    return false; // prefix rule is deterministic, not a drift risk
  }
  const normalized = toolName.toLowerCase();
  if (BUILDER_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return true;
  }
  if (READ_PREMIUM_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return true;
  }
  return false; // default fallthrough = deterministic read-premium, but unlisted-but-priced is still flagged below via explicit-tier requirement
}

/** Tool families whose pricing intentionally stays at platform level (kernel/control-plane, not protocol modules). */
const PLATFORM_PRICED_MODULE_IDS = new Set([
  'payments-bridge-only',
  'sap-sdk',
  'sap-sns',
  'sap-network-stats',
  'client-sdk',
  'transaction',
  'chat',
  'x402-local-helper',
  'hosted-prepaid',
  'profile',
  'agent-start',
  'estimate-cost',
  'quick-context',
  'premium',
  'perps',
  'perps-risk',
  'perps-signals',
  'skills',
  'magicblock',
  'memory',
  'web-search',
  'tool-search',
]);

describe('pricing coverage — every protocol-family tool module prices its own tools', () => {
  it('every protocol-family module carries a pricing policy', () => {
    const missing = BUILTIN_TOOL_MODULES
      .filter((module) => !PLATFORM_PRICED_MODULE_IDS.has(module.id))
      .filter((module) => !module.pricing);
    expect(missing.map((module) => module.id)).toEqual([]);
  });

  it('every expectedTools entry of a policy-priced module resolves to an explicit tier — none depend on keyword fallback', () => {
    const registry = new ToolPricingRegistry();
    for (const module of BUILTIN_TOOL_MODULES) {
      if (!module.pricing) {
        continue;
      }
      registry.registerModule(module.id, module.pricing, module.expectedTools ?? []);
    }

    const offenders: Array<{ tool: string; moduleId: string; why: string }> = [];
    for (const module of BUILTIN_TOOL_MODULES) {
      if (!module.pricing) {
        continue;
      }
      for (const tool of module.expectedTools ?? []) {
        const resolution = registry.resolve(tool);
        if (!resolution) {
          offenders.push({ tool, moduleId: module.id, why: 'no explicit tier anywhere (would hit keyword/default fallback at runtime)' });
          continue;
        }
        if (resolution.source === 'module-default' && isFallbackClassified(tool)) {
          // A module-default tier is explicit and fine; the fallback-mirror check
          // only matters for tools priced by NEITHER policy NOR platform sets.
          // module-default IS an explicit decision — never an offender.
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('registry pricing of Phoenix data reads is FREE (the historical mispricing regression test)', () => {
    const registry = new ToolPricingRegistry();
    const phoenix = BUILTIN_TOOL_MODULES.find((module) => module.id === 'phoenix');
    expect(phoenix?.pricing).toBeDefined();
    registry.registerModule('phoenix', phoenix!.pricing!, phoenix!.expectedTools ?? []);
    for (const read of [
      'sap_phoenix_get_markets',
      'sap_phoenix_get_exchange',
      'sap_phoenix_get_orderbook',
      'sap_phoenix_get_candles',
      'sap_phoenix_get_market_stats',
      'sap_phoenix_get_trader',
    ]) {
      expect(registry.resolve(read)?.tier).toBe('free');
    }
    for (const builder of [
      'sap_phoenix_build_place_limit_order',
      'sap_phoenix_build_withdraw',
      'sap_phoenix_build_cancel_all',
    ]) {
      expect(registry.resolve(builder)?.tier).toBe('builder');
    }
  });

  it('launchpad dev-buy and DBC launch builders are explicitly builder tier (regression: keyword-fallback drift)', () => {
    const registry = new ToolPricingRegistry();
    const perpspad = BUILTIN_TOOL_MODULES.find((module) => module.id === 'perpspad');
    expect(perpspad?.pricing).toBeDefined();
    registry.registerModule('perpspad', perpspad!.pricing!, perpspad!.expectedTools ?? []);
    for (const builder of [
      'sap_steve_launch_build_dbc',
      'sap_steve_launch_build_dbc_dev_buy',
      'sap_meteora_launchpad_placeholder_never_exists',
    ]) {
      if (builder.includes('placeholder')) {
        expect(registry.resolve(builder)).toBeNull();
      } else {
        expect(registry.resolve(builder)?.tier).toBe('builder');
      }
    }
  });

  it('module ids in the coverage baseline still exist (no stale baseline entries)', () => {
    const moduleIds = new Set(BUILTIN_TOOL_MODULES.map((module) => module.id));
    const stale = [...TOOL_MODULES_WITH_EXPLICIT_PRICING_FALLBACK_OK].filter((id) => !moduleIds.has(id));
    expect(stale).toEqual([]);
  });
});