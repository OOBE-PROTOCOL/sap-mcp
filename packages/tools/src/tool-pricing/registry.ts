/**
 * @name tools/tool-pricing/registry
 * @description Pricing policy registry fed by tool module manifests.
 *
 * The registry is filled at module-registration time: every
 * `ToolModuleDefinition` that carries a `pricing` policy registers its
 * default tier for every tool it owns (expectedTools) plus its explicit
 * per-tool overrides. The payments/pricing resolver then asks THIS registry
 * first, keeping the single source of pricing truth inside the module that
 * owns the tools.
 *
 * @module tools/tool-pricing/registry
 */

import { type ModulePricingPolicy, type PricingTier } from './policy.js';

export type { PricingTier } from './policy.js';

interface RegistryEntry {
  readonly moduleId: string;
  readonly tier: PricingTier;
  readonly source: 'module-per-tool' | 'module-default';
}

/** Result of a registry lookup, with provenance for audit + catalog. */
export interface PricingResolution {
  readonly tier: PricingTier;
  readonly source: 'module-per-tool' | 'module-default';
  readonly moduleId: string;
}

export class ToolPricingRegistry {
  private readonly byTool = new Map<string, RegistryEntry>();

  /**
   * Registers one module's policy. `moduleToolNames` are the tools the module
   * owns (its expectedTools): each receives the module default tier unless a
   * perTool override says otherwise. A tool owned by TWO modules with the same
   * tier is fine; conflicting tiers are a registration error.
   */
  registerModule(moduleId: string, policy: ModulePricingPolicy, moduleToolNames: readonly string[] = []): void {
    for (const [toolName, tier] of Object.entries(policy.perTool ?? {})) {
      this.assertNoConflict(toolName, tier, moduleId);
      this.byTool.set(toolName, { moduleId, tier, source: 'module-per-tool' });
    }

    for (const toolName of moduleToolNames) {
      if (this.byTool.has(toolName)) {
        continue; // explicit override or earlier owner already priced it
      }
      this.byTool.set(toolName, { moduleId, tier: policy.defaultTier, source: 'module-default' });
    }
  }

  private assertNoConflict(toolName: string, tier: PricingTier, moduleId: string): void {
    const existing = this.byTool.get(toolName);
    if (existing && existing.tier !== tier) {
      throw new Error(
        `Tool pricing conflict: ${toolName} is priced ${existing.tier} by ${existing.moduleId} but ${tier} by ${moduleId}`,
      );
    }
  }

  /** True when the given tool has an explicit module-priced tier. */
  has(toolName: string): boolean {
    return this.byTool.has(toolName);
  }

  resolve(toolName: string): PricingResolution | null {
    const entry = this.byTool.get(toolName);
    if (!entry) {
      return null;
    }
    return { tier: entry.tier, source: entry.source, moduleId: entry.moduleId };
  }

  /** All tool names explicitly priced (coverage test + catalog generation). */
  pricedToolNames(): readonly string[] {
    return [...this.byTool.keys()].sort();
  }

  size(): number {
    return this.byTool.size;
  }
}

/** Process-wide singleton — populated during registerToolModules, read by payments/pricing. */
let singleton: ToolPricingRegistry | null = null;

export function getToolPricingRegistry(): ToolPricingRegistry {
  if (!singleton) {
    singleton = new ToolPricingRegistry();
  }
  return singleton;
}

/** Test/lifecycle hook: resets the singleton (vitest isolation). */
export function resetToolPricingRegistry(): void {
  singleton = null;
}