/**
 * @name tools/tool-pricing/policy
 * @description Per-module pricing policy contract.
 *
 * Each tool module CAN carry a {@link ModulePricingPolicy}: the module's
 * default tier plus explicit per-tool overrides. The pricing resolver walks
 * the policy chain (per-tool override → module default → platform fallback)
 * so a protocol family like Phoenix is fully priced by ITS OWN manifest —
 * never by name-grep in a central set file.
 *
 * Tiers are the payment tiers from `payments/pricing` (imported freely:
 * the pricing resolver in payments already imports tool-manifest code, and
 * tools already imports payments for classifyTool — no new cycle).
 *
 * @module tools/tool-pricing/policy
 */

import { z } from 'zod';

/** Mirror of payments/pricing PaymentTier — kept as a literal union so this schema has no runtime import from payments. */
export const PRICING_TIERS = [
  'free',
  'micro-read',
  'read-premium',
  'builder',
  'value-action',
] as const;

export const PricingTierSchema = z.enum(PRICING_TIERS);

export type PricingTier = (typeof PRICING_TIERS)[number];

/**
 * @name ModulePricingPolicy
 * @description Declares how tools owned by a tool module default to a tier.
 */
export const ModulePricingPolicySchema = z
  .object({
    /** Tier applied to every module tool that has no perTool override. */
    defaultTier: PricingTierSchema,
    /** Explicit per-tool overrides (MCP-safe tool name → tier). */
    perTool: z.record(z.string(), PricingTierSchema).optional(),
    /** Human-facing reason recorded in the registry (audit trail). */
    rationale: z.string().trim().max(400).optional(),
  })
  .strict();

export type ModulePricingPolicy = z.infer<typeof ModulePricingPolicySchema>;

/** Validates a policy payload; throws on shape drift (fail-fast at module definition time). */
export function parseModulePricingPolicy(input: unknown): ModulePricingPolicy {
  return ModulePricingPolicySchema.parse(input);
}