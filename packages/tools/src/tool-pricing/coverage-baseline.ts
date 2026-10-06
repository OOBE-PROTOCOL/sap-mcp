/**
 * @name tools/tool-pricing/coverage-baseline
 * @description Explicit allowlist of modules whose pricing stays at platform level.
 *
 * The coverage test requires every protocol-family module to carry its own
 * pricing policy. Kernel/control-plane modules are priced by the platform
 * sets in payments/pricing (FREE_TOOLS, BUILDER_TOOLS, ...) on purpose —
 * their tools are gateway plumbing, not protocol families. When a new
 * protocol-family module is added it must NOT be listed here; give it a
 * pricing policy in its manifest instead.
 *
 * The coverage test asserts no stale entries remain, so a module that grows
 * into protocol territory must be migrated visibly.
 *
 * @module tools/tool-pricing/coverage-baseline
 */

/**
 * Builtin module ids allowed to rely on platform-level pricing sets only.
 * Keep alphabetized; add a rationale comment per id.
 */
export const TOOL_MODULES_WITH_EXPLICIT_PRICING_FALLBACK_OK: ReadonlySet<string> = new Set([
  // Payments bridge + local x402 helpers — gateway plumbing, kernel-priced.
  'payments-bridge-only',
  // SAP on-chain SDK surface (92 tools) — kernel family, priced by tier sets.
  'sap-sdk',
  // SNS domain tools — legacy platform sets.
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
  // Premium delivery rail — kernel-priced control plane.
  'premium',
  // Perps analytics/risk/signals — platform sets (sprint 1-3 tools).
  'perps',
  'perps-risk',
  'perps-signals',
  'skills',
  'magicblock',
  // Local memory — all free by policy.
  'memory',
  // Web search lane + tool search retriever.
  'web-search',
  'tool-search',
]);