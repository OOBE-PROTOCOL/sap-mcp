/**
 * @name premium/plugin-validator
 * @description Strict structural validator for premium plugin manifests.
 *
 * Validates unknown JSON objects against the `PremiumPluginManifest` shape,
 * rejecting unknown fields (so private provider secrets or executable code
 * cannot leak through manifests), enforcing semver versions, JSON Schema
 * correctness, pricing bounds, and delivery contract constraints.
 *
 * Used by:
 *   - `private-manifest-loader.ts` → validates every `.json` file loaded from disk.
 *   - `premium-tools.ts` → MCP tool `sap_premium_validate_plugin_manifest`.
 *
 * @flow
 *   1. External manifest JSON arrives (filesystem or MCP tool argument).
 *   2. → `validatePremiumPluginManifest(manifest)` runs structural checks.
 *   3. Returns `PremiumValidationReport` with errors[] and warnings[].
 *   4. Caller decides: accept (valid=true) or reject with error details.
 *
 * @module premium/plugin-validator
 */

import type { PremiumCapabilityDefinition, PremiumPluginManifest, PremiumValidationIssue, PremiumValidationReport } from './types.js';

/* -------------------------------------------------------------------------- */
/* Validation regex patterns                                                  */
/* -------------------------------------------------------------------------- */

/** @description Plugin id: lowercase, starts with letter, dots/dashes allowed. */
const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9.-]{2,80}$/;
/** @description Capability id: lowercase, starts with letter, dots/colons/dashes allowed. */
const CAPABILITY_ID_PATTERN = /^[a-z][a-z0-9.:-]{2,96}$/;
/** @description Semver version: X.Y.Z with optional prerelease tag. */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/;
/** @description Env var name: uppercase, starts with letter, underscores allowed. */
const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]{2,120}$/;

/* -------------------------------------------------------------------------- */
/* Allowed key sets (reject unknown fields)                                   */
/* -------------------------------------------------------------------------- */

/** @description Top-level keys allowed on a `PremiumPluginManifest` object. */
const PLUGIN_KEYS = new Set(['id', 'version', 'title', 'description', 'publisher', 'visibility', 'capabilities']);
/** @description Keys allowed on a `PremiumCapabilityDefinition` object. */
const CAPABILITY_KEYS = new Set([
  'id',
  'type',
  'title',
  'description',
  'status',
  'requiresProvider',
  'providerEnv',
  'inputSchema',
  'outputSchema',
  'pricing',
  'delivery',
]);
/** @description Keys allowed on a `PremiumPricingPolicy` object. */
const PRICING_KEYS = new Set(['tier', 'model', 'unit', 'unitPriceUsd', 'minUnits', 'maxUnits', 'settlement']);
/** @description Keys allowed on a `PremiumDeliveryContract` object. */
const DELIVERY_KEYS = new Set(['transport', 'events', 'latencyTargetMs', 'replayWindowSeconds']);

/* -------------------------------------------------------------------------- */
/* Allowed enum values                                                        */
/* -------------------------------------------------------------------------- */

const PRICING_TIERS = new Set(['premium-stream', 'premium-webhook', 'premium-tool']);
const PRICING_MODELS = new Set(['x402-per-open', 'x402-per-minute', 'x402-per-event', 'x402-session']);
const PRICING_UNITS = new Set(['open', 'minute', 'event', 'session']);
const DELIVERY_TRANSPORTS = new Set(['mcp-streamable-http', 'webhook-http']);

/* -------------------------------------------------------------------------- */
/* Internal helpers                                                           */
/* -------------------------------------------------------------------------- */

/**
 * @name issue
 * @description Construct a `PremiumValidationIssue` with the given path, severity, and message.
 *
 * @param path      - JSON path to the offending field (e.g. `capabilities[0].pricing.tier`).
 * @param severity  - `error` or `warning`.
 * @param message   - Human-readable explanation.
 * @returns A `PremiumValidationIssue` object.
 *
 * @internal
 */
function issue(path: string, severity: 'error' | 'warning', message: string): PremiumValidationIssue {
  return { path, severity, message };
}

/**
 * @name isRecord
 * @description Type guard: is the value a plain object (not array, not null)?
 *
 * @param value - Unknown input to test.
 * @returns True if `value` is a non-null, non-array object.
 *
 * @internal
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @name pushUnknownKeyIssues
 * @description Detect and report any keys not in the allowed set.
 *
 * Unknown fields are rejected as errors so private provider secrets or
 * executable code cannot leak through manifests.
 *
 * @param issues      - Accumulating issue array (mutated in place).
 * @param value       - The object to check.
 * @param allowedKeys - Set of permitted key names.
 * @param path        - JSON path prefix for error reporting.
 *
 * @internal
 */
function pushUnknownKeyIssues(
  issues: PremiumValidationIssue[],
  value: Record<string, unknown>,
  allowedKeys: Set<string>,
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      issues.push(issue(path === '$' ? key : `${path}.${key}`, 'error', 'Unknown fields are rejected so private provider secrets or executable code cannot leak through manifests.'));
    }
  }
}

/**
 * @name pushSchemaIssues
 * @description Validate that a JSON Schema field meets strict requirements:
 * must be an object, root type must be `object`, must have a `properties`
 * object (warning), and must set `additionalProperties: false` (error).
 *
 * @param issues - Accumulating issue array (mutated in place).
 * @param schema - The schema value to check.
 * @param path   - JSON path to the schema field.
 *
 * @internal
 */
function pushSchemaIssues(issues: PremiumValidationIssue[], schema: unknown, path: string): void {
  if (!isRecord(schema)) {
    issues.push(issue(path, 'error', 'Schema must be a JSON object.'));
    return;
  }
  if (schema.type !== 'object') {
    issues.push(issue(path, 'error', 'Schema root must declare type: object so MCP clients can validate arguments.'));
  }
  if (!isRecord(schema.properties)) {
    issues.push(issue(path, 'warning', 'Schema should include a properties object with described fields.'));
  }
  if (schema.additionalProperties !== false) {
    issues.push(issue(path, 'error', 'Schema root must set additionalProperties: false for strict agent/runtime validation.'));
  }
}

/* -------------------------------------------------------------------------- */
/* Capability validation                                                      */
/* -------------------------------------------------------------------------- */

/**
 * @name validateCapability
 * @description Validate a single capability object within a manifest.
 *
 * Checks: id format, type, title, description length, status, requiresProvider
 * boolean, providerEnv array format + consistency, input/output schemas,
 * pricing policy (tier, model, unit, price bounds, settlement), and delivery
 * contract (transport, events, latency, replay window).
 *
 * @param capability - Unknown capability value to validate.
 * @param index      - Array index for error path reporting.
 * @returns Array of `PremiumValidationIssue` entries (may be empty if valid).
 *
 * @internal
 */
function validateCapability(capability: unknown, index: number): PremiumValidationIssue[] {
  const issues: PremiumValidationIssue[] = [];
  const base = `capabilities[${index}]`;

  if (!isRecord(capability)) {
    return [issue(base, 'error', 'Capability must be an object.')];
  }

  const candidate = capability as Partial<PremiumCapabilityDefinition>;

  // Reject unknown keys to prevent secret/code leakage.
  pushUnknownKeyIssues(issues, capability, CAPABILITY_KEYS, base);

  // Identity and type checks.
  if (typeof candidate.id !== 'string' || !CAPABILITY_ID_PATTERN.test(candidate.id)) {
    issues.push(issue(`${base}.id`, 'error', 'Capability id must be lowercase and may contain letters, numbers, dot, colon, or dash.'));
  }
  if (!['stream', 'webhook', 'tool'].includes(String(candidate.type))) {
    issues.push(issue(`${base}.type`, 'error', 'Capability type must be stream, webhook, or tool.'));
  }
  if (typeof candidate.title !== 'string' || candidate.title.length < 4) {
    issues.push(issue(`${base}.title`, 'error', 'Capability title must be a human-readable label.'));
  }
  if (typeof candidate.description !== 'string' || candidate.description.length < 40) {
    issues.push(issue(`${base}.description`, 'error', 'Capability description must explain the agent use case and payment boundary.'));
  }
  if (!['available', 'requires-provider', 'planned'].includes(String(candidate.status))) {
    issues.push(issue(`${base}.status`, 'error', 'Capability status must be available, requires-provider, or planned.'));
  }
  if (typeof candidate.requiresProvider !== 'boolean') {
    issues.push(issue(`${base}.requiresProvider`, 'error', 'requiresProvider must explicitly be true or false so runtimes know whether activation is possible.'));
  }

  // Provider env var validation: names must be uppercase env var patterns,
  // never secret values or URLs. If any env vars are declared, requiresProvider
  // must be true.
  if (!Array.isArray(candidate.providerEnv)) {
    issues.push(issue(`${base}.providerEnv`, 'error', 'providerEnv must be an array, empty when no external provider configuration is needed.'));
  } else {
    candidate.providerEnv.forEach((envName, envIndex) => {
      if (typeof envName !== 'string' || !ENV_NAME_PATTERN.test(envName)) {
        issues.push(issue(`${base}.providerEnv[${envIndex}]`, 'error', 'providerEnv entries must be uppercase environment variable names, never secret values or URLs.'));
      }
    });
    if (candidate.providerEnv.length > 0 && candidate.requiresProvider !== true) {
      issues.push(issue(`${base}.requiresProvider`, 'error', 'Capabilities with providerEnv entries must set requiresProvider:true.'));
    }
  }

  // Input/output JSON Schema validation.
  pushSchemaIssues(issues, candidate.inputSchema, `${base}.inputSchema`);
  pushSchemaIssues(issues, candidate.outputSchema, `${base}.outputSchema`);

  // Pricing policy validation.
  if (!isRecord(candidate.pricing)) {
    issues.push(issue(`${base}.pricing`, 'error', 'Pricing policy is required for x402/pay.sh metering.'));
  } else {
    pushUnknownKeyIssues(issues, candidate.pricing, PRICING_KEYS, `${base}.pricing`);
    if (!PRICING_TIERS.has(String(candidate.pricing.tier))) {
      issues.push(issue(`${base}.pricing.tier`, 'error', 'Pricing tier must be premium-stream, premium-webhook, or premium-tool.'));
    }
    if (!PRICING_MODELS.has(String(candidate.pricing.model))) {
      issues.push(issue(`${base}.pricing.model`, 'error', 'Pricing model must be x402-per-open, x402-per-minute, x402-per-event, or x402-session.'));
    }
    if (!PRICING_UNITS.has(String(candidate.pricing.unit))) {
      issues.push(issue(`${base}.pricing.unit`, 'error', 'Pricing unit must be open, minute, event, or session.'));
    }
    const unitPriceUsd = Number(candidate.pricing.unitPriceUsd);
    const minUnits = Number(candidate.pricing.minUnits);
    const maxUnits = Number(candidate.pricing.maxUnits);
    if (!Number.isFinite(unitPriceUsd) || unitPriceUsd <= 0) {
      issues.push(issue(`${base}.pricing.unitPriceUsd`, 'error', 'unitPriceUsd must be a positive number.'));
    }
    if (!Number.isInteger(minUnits) || minUnits < 1 || !Number.isInteger(maxUnits) || maxUnits < minUnits) {
      issues.push(issue(`${base}.pricing.units`, 'error', 'minUnits and maxUnits must be positive integers with maxUnits >= minUnits.'));
    }
    if (!['x402', 'pay.sh'].includes(String(candidate.pricing.settlement))) {
      issues.push(issue(`${base}.pricing.settlement`, 'error', 'settlement must be x402 or pay.sh.'));
    }
  }

  // Delivery contract validation.
  if (!isRecord(candidate.delivery)) {
    issues.push(issue(`${base}.delivery`, 'error', 'Delivery contract is required for stream/webhook capabilities.'));
  } else {
    pushUnknownKeyIssues(issues, candidate.delivery, DELIVERY_KEYS, `${base}.delivery`);
    if (!DELIVERY_TRANSPORTS.has(String(candidate.delivery.transport))) {
      issues.push(issue(`${base}.delivery.transport`, 'error', 'Delivery transport must be mcp-streamable-http or webhook-http.'));
    }
    if (!Array.isArray(candidate.delivery.events) || candidate.delivery.events.length === 0) {
      issues.push(issue(`${base}.delivery.events`, 'error', 'Delivery events must list at least one exact event id.'));
    } else {
      candidate.delivery.events.forEach((eventName, eventIndex) => {
        if (typeof eventName !== 'string' || eventName.trim().length < 3) {
          issues.push(issue(`${base}.delivery.events[${eventIndex}]`, 'error', 'Delivery event ids must be non-empty strings.'));
        }
      });
    }
    const latencyTargetMs = Number(candidate.delivery.latencyTargetMs);
    const replayWindowSeconds = Number(candidate.delivery.replayWindowSeconds);
    if (!Number.isInteger(latencyTargetMs) || latencyTargetMs < 100 || latencyTargetMs > 60_000) {
      issues.push(issue(`${base}.delivery.latencyTargetMs`, 'error', 'latencyTargetMs must be an integer between 100 and 60000.'));
    }
    if (!Number.isInteger(replayWindowSeconds) || replayWindowSeconds < 30 || replayWindowSeconds > 86_400) {
      issues.push(issue(`${base}.delivery.replayWindowSeconds`, 'error', 'replayWindowSeconds must be an integer between 30 and 86400.'));
    }
  }

  return issues;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * @name validatePremiumPluginManifest
 * @description Validate an unknown value as a `PremiumPluginManifest`.
 *
 * Top-level checks: object shape, id format, semver version, title, description
 * length, publisher, visibility enum, and at least one capability. Each
 * capability is then validated by `validateCapability`.
 *
 * @param manifest - Unknown JSON value (from filesystem or MCP tool argument).
 * @returns `PremiumValidationReport` with `valid`, `errors[]`, and `warnings[]`.
 *
 * @usedBy
 *   - `private-manifest-loader.ts` → validates each `.json` file from disk.
 *   - `premium-tools.ts` → MCP tool `sap_premium_validate_plugin_manifest`.
 */
export function validatePremiumPluginManifest(manifest: unknown): PremiumValidationReport {
  const issues: PremiumValidationIssue[] = [];

  if (!isRecord(manifest)) {
    return {
      valid: false,
      errors: [issue('$', 'error', 'Premium plugin manifest must be an object.')],
      warnings: [],
    };
  }

  const candidate = manifest as Partial<PremiumPluginManifest>;

  // Reject unknown top-level keys.
  pushUnknownKeyIssues(issues, manifest, PLUGIN_KEYS, '$');

  // Identity and metadata checks.
  if (typeof candidate.id !== 'string' || !PLUGIN_ID_PATTERN.test(candidate.id)) {
    issues.push(issue('id', 'error', 'Plugin id must be lowercase and may contain letters, numbers, dot, or dash.'));
  }
  if (typeof candidate.version !== 'string' || !SEMVER_PATTERN.test(candidate.version)) {
    issues.push(issue('version', 'error', 'Version must be semver, for example 1.0.0 or 1.0.0-rc.1.'));
  }
  if (typeof candidate.title !== 'string' || candidate.title.length < 4) {
    issues.push(issue('title', 'error', 'Title must be a human-readable plugin name.'));
  }
  if (typeof candidate.description !== 'string' || candidate.description.length < 60) {
    issues.push(issue('description', 'error', 'Description must explain what the plugin sells and which agents should use it.'));
  }
  if (typeof candidate.publisher !== 'string' || candidate.publisher.length < 2) {
    issues.push(issue('publisher', 'error', 'Publisher is required for registry and enterprise review.'));
  }
  if (!['public', 'private', 'enterprise'].includes(String(candidate.visibility))) {
    issues.push(issue('visibility', 'error', 'Visibility must be public, private, or enterprise.'));
  }

  // Capabilities array: must be non-empty, each entry validated individually.
  if (!Array.isArray(candidate.capabilities) || candidate.capabilities.length === 0) {
    issues.push(issue('capabilities', 'error', 'At least one premium capability is required.'));
  } else {
    candidate.capabilities.forEach((capability, index) => issues.push(...validateCapability(capability, index)));
  }

  return {
    valid: issues.every(candidateIssue => candidateIssue.severity !== 'error'),
    errors: issues.filter(candidateIssue => candidateIssue.severity === 'error'),
    warnings: issues.filter(candidateIssue => candidateIssue.severity === 'warning'),
  };
}