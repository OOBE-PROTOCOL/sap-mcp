/**
 * @name payments/schema-validation
 * @description Pre-payment schema validation for x402 paid tool calls.
 *
 * Validates tool arguments against the local registration store's JSON Schema
 * BEFORE the x402 challenge is fetched and paid. This prevents wasted USDC
 * on calls with invalid schemas (e.g. wrong parameter names, missing required
 * fields).
 *
 * If the tool name is not found in the local registration store (hosted-only
 * tools), validation is skipped — we cannot validate what we don't have the
 * schema for. This is intentionally non-breaking: existing behavior is
 * preserved for unknown tools.
 *
 * @module payments/schema-validation
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { getRegisteredTools } from '../../mcp-adapter/src/sdk-compat.js';
import { logger } from '../../core/src/logger.js';

/** Module-level server reference set during tool registration. */
let validationServer: Server | null = null;

/**
 * Store the server reference for pre-payment schema validation.
 * Called once during registerX402PaidCallTool().
 * @param server — The MCP server instance with registered tools.
 */
export function setValidationServer(server: Server): void {
  validationServer = server;
}

/**
 * Validation result for a tool's input arguments.
 */
export interface SchemaValidationResult {
  /** True if arguments match the tool's schema. */
  valid: boolean;
  /** Human-readable validation errors (empty if valid). */
  errors: string[];
  /** True if validation was skipped (tool not found locally). */
  skipped: boolean;
  /** Tool name that was validated. */
  toolName: string;
}

/**
 * Validate tool arguments against the local registration store's JSON Schema.
 *
 * Uses simple runtime type checking against the JSON Schema properties —
 * checks required fields, enum values, and basic types. This is intentionally
 * lightweight (no ajv dependency) to keep the bridge fast and dependency-free.
 *
 * If the tool is not registered locally, returns `skipped: true` and
 * `valid: true` — the caller should proceed with the x402 flow as normal.
 *
 * @param toolName — Name of the tool to validate against.
 * @param args — Arguments to validate.
 * @returns SchemaValidationResult with validity and error details.
 */
export function validateToolArguments(
  toolName: string,
  args: unknown,
): SchemaValidationResult {
  if (!validationServer) {
    return { valid: true, errors: [], skipped: true, toolName };
  }

  const tools = getRegisteredTools(validationServer);
  const tool = tools.find((t) => t.name === toolName);
  if (!tool) {
    // Tool not registered locally — likely a hosted-only tool.
    // Skip validation: we don't have the schema.
    return { valid: true, errors: [], skipped: true, toolName };
  }

  const schema = tool.inputSchema as Record<string, unknown> | undefined;
  if (!schema || typeof schema !== 'object') {
    return { valid: true, errors: [], skipped: true, toolName };
  }

  const properties = schema['properties'] as Record<string, Record<string, unknown>> | undefined;
  const required = schema['required'] as string[] | undefined;
  const errors: string[] = [];

  // Check required fields
  if (required && Array.isArray(required)) {
    const record = (args ?? {}) as Record<string, unknown>;
    for (const field of required) {
      if (!(field in record) || record[field] === undefined) {
        errors.push(`Missing required parameter: "${field}"`);
      }
    }
  }

  // Check types and enums for provided fields
  if (properties && args && typeof args === 'object' && !Array.isArray(args)) {
    const record = args as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      if (value === undefined) continue;
      const propSchema = properties[key];
      if (!propSchema) continue; // extra fields are OK if additionalProperties is not false

      // Type check
      const expectedType = propSchema['type'] as string | undefined;
      if (expectedType) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (expectedType === 'integer' && typeof value === 'number') {
          // OK — integer is a subset of number
        } else if (actualType !== expectedType && !(expectedType === 'number' && typeof value === 'number')) {
          errors.push(`Parameter "${key}" expected type "${expectedType}", got "${actualType}"`);
          continue;
        }
      }

      // Enum check
      const enumValues = propSchema['enum'] as string[] | undefined;
      if (enumValues && Array.isArray(enumValues)) {
        const strValue = String(value).toUpperCase();
        const enumUpper = enumValues.map((v) => v.toUpperCase());
        if (!enumUpper.includes(strValue)) {
          errors.push(`Parameter "${key}" must be one of: ${enumValues.join(', ')}. Got: "${value}"`);
        }
      }
    }
  }

  if (errors.length > 0) {
    logger.warn('Pre-payment schema validation failed', { toolName, errors });
  }

  return {
    valid: errors.length === 0,
    errors,
    skipped: false,
    toolName,
  };
}