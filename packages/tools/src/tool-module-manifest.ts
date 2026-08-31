/**
 * @name tools/tool-module-manifest
 * @description Validated manifest contract for first-party and plugin tool modules.
 *
 * The manifest is intentionally data-only. Executable registration code stays
 * in TypeScript modules that are explicitly imported by the host application.
 *
 * @module tools/tool-module-manifest
 */

import { z } from 'zod';

export const TOOL_MODULE_CATEGORIES = [
  'sap-protocol',
  'solana',
  'payments',
  'profile',
  'agent-runtime',
  'premium',
  'perps',
  'skills',
  'memory',
  'integration',
] as const;

export const TOOL_MODULE_MODES = [
  'default',
  'payments-bridge-only',
] as const;

export const ToolModuleIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'Use lowercase kebab-case, starting with a letter or number.');

export const ToolModuleToolNameSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{2,127}$/, 'Use MCP-safe snake_case tool names.');

export const ToolModuleCategorySchema = z.enum(TOOL_MODULE_CATEGORIES);
export const ToolModuleModeSchema = z.enum(TOOL_MODULE_MODES);

export const ToolModuleManifestSchema = z.object({
  id: ToolModuleIdSchema,
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().min(20).max(280),
  category: ToolModuleCategorySchema,
  order: z.number().int().nonnegative().max(10_000),
  requires: z.array(ToolModuleIdSchema).optional(),
  expectedTools: z.array(ToolModuleToolNameSchema).optional(),
  mode: ToolModuleModeSchema.optional(),
  namespace: z.string().trim().min(2).max(80).optional(),
  packageName: z.string().trim().min(1).max(160).optional(),
  version: z.string().trim().min(1).max(80).optional(),
}).strict();

export type ToolModuleCategory = z.infer<typeof ToolModuleCategorySchema>;
export type ToolModuleMode = z.infer<typeof ToolModuleModeSchema>;
export type ToolModuleManifest = z.infer<typeof ToolModuleManifestSchema>;

export function parseToolModuleManifest(input: unknown): ToolModuleManifest {
  return ToolModuleManifestSchema.parse(input);
}

// ─── Tool Module Definition (executable surface) ──────────────────────────────
// Moved here from module-registry.ts to break the circular dependency:
// sdk-compat → tool-execution-metadata → module-registry → sdk-compat.
// tool-execution-metadata now imports ToolModuleDefinition from this file
// instead of from module-registry.

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../../core/src/types.js';

export type ToolModuleRegister = (server: Server, context: SapMcpContext) => void | Promise<void>;

export interface ToolModuleLifecycleEvent {
  readonly module: ToolModuleManifest;
  readonly context: SapMcpContext;
  readonly beforeCount: number;
  readonly afterCount?: number;
  readonly addedCount?: number;
  readonly error?: unknown;
}

export interface ToolModuleLifecycleHooks {
  readonly beforeRegister?: (event: ToolModuleLifecycleEvent) => void | Promise<void>;
  readonly afterRegister?: (event: ToolModuleLifecycleEvent) => void | Promise<void>;
  readonly onRegisterError?: (event: ToolModuleLifecycleEvent) => void | Promise<void>;
}

export interface ToolModuleDefinition extends ToolModuleManifest {
  readonly register: ToolModuleRegister;
  readonly when?: (context: SapMcpContext) => boolean;
  readonly lifecycle?: ToolModuleLifecycleHooks;
}
