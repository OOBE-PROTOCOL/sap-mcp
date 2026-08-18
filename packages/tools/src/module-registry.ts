/**
 * @name tools/module-registry
 * @description Plugin-ready registry primitives for SAP MCP tool modules.
 *
 * Tool modules provide a small manifest plus a registration callback. The
 * manifest is validated before registration so new tool families can be added
 * without turning `registerTools` into an unstructured list.
 *
 * @module tools/module-registry
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '@oobe-protocol-labs/sap-mcp-core/types';
import { getRegisteredTools } from '@oobe-protocol-labs/sap-mcp-mcp-adapter/sdk-compat';
import { ToolModuleIdSchema, parseToolModuleManifest, type ToolModuleCategory, type ToolModuleManifest, type ToolModuleMode } from './tool-module-manifest.js';
export type { ToolModuleCategory, ToolModuleMode } from './tool-module-manifest.js';

export const PLUGIN_TOOL_MODULE_ORDER_MIN = 5_000;
export const PLUGIN_TOOL_MODULE_ORDER_MAX = 8_999;

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

export interface PluginToolModuleOptions {
  readonly namespace: string;
  readonly packageName?: string;
  readonly version?: string;
}

function pluginToolNamePrefix(namespace: string): string {
  return `${namespace.replace(/-/g, '_')}_`;
}

function validatePluginToolModuleDefinition(
  definition: ToolModuleDefinition,
  options: PluginToolModuleOptions,
): void {
  const packageName = definition.packageName ?? options.packageName;
  const version = definition.version ?? options.version;

  if (!ToolModuleIdSchema.safeParse(options.namespace).success) {
    throw new Error(`Plugin namespace ${options.namespace} must use lowercase kebab-case`);
  }
  if (!definition.id.startsWith(`${options.namespace}-`)) {
    throw new Error(`Plugin tool module ${definition.id} must use namespace prefix ${options.namespace}-`);
  }
  if (definition.order < PLUGIN_TOOL_MODULE_ORDER_MIN || definition.order > PLUGIN_TOOL_MODULE_ORDER_MAX) {
    throw new Error(`Plugin tool module ${definition.id} must use order ${PLUGIN_TOOL_MODULE_ORDER_MIN}-${PLUGIN_TOOL_MODULE_ORDER_MAX}`);
  }
  if (!packageName) {
    throw new Error(`Plugin tool module ${definition.id} must declare packageName provenance`);
  }
  if (!version) {
    throw new Error(`Plugin tool module ${definition.id} must declare version provenance`);
  }

  const expectedTools = definition.expectedTools ?? [];
  if (expectedTools.length === 0) {
    throw new Error(`Plugin tool module ${definition.id} must declare expectedTools sentinels`);
  }

  const expectedToolPrefix = pluginToolNamePrefix(options.namespace);
  const invalidExpectedTool = expectedTools.find((toolName) => !toolName.startsWith(expectedToolPrefix));
  if (invalidExpectedTool) {
    throw new Error(`Plugin tool module ${definition.id} expected tool ${invalidExpectedTool} must use namespace prefix ${expectedToolPrefix}`);
  }
}

function parseDefinitionManifest(definition: ToolModuleDefinition): ToolModuleManifest {
  return parseToolModuleManifest({
    id: definition.id,
    title: definition.title,
    description: definition.description,
    category: definition.category,
    order: definition.order,
    requires: definition.requires,
    expectedTools: definition.expectedTools,
    mode: definition.mode,
    namespace: definition.namespace,
    packageName: definition.packageName,
    version: definition.version,
  });
}

export interface ToolModuleRegistrationResult {
  readonly id: string;
  readonly title: string;
  readonly category: ToolModuleCategory;
  readonly beforeCount: number;
  readonly afterCount: number;
  readonly addedCount: number;
}

export interface ToolModuleRegistrationSummary {
  readonly modules: readonly ToolModuleRegistrationResult[];
  readonly totalTools: number;
}

export interface ToolModuleDependencyEdge {
  readonly from: string;
  readonly to: string;
}

export interface ToolModuleRegistrationPlanEntry extends ToolModuleManifest {
  readonly selected: boolean;
  readonly skipReason?: 'mode-mismatch' | 'runtime-predicate';
}

export interface ToolModuleRegistrationPlan {
  readonly requestedMode: ToolModuleMode;
  readonly entries: readonly ToolModuleRegistrationPlanEntry[];
  readonly selectedModuleIds: readonly string[];
  readonly skippedModuleIds: readonly string[];
  readonly expectedTools: readonly string[];
  readonly dependencyEdges: readonly ToolModuleDependencyEdge[];
}

export function createToolModule(definition: ToolModuleDefinition): ToolModuleDefinition {
  const manifest = parseDefinitionManifest(definition);

  return {
    ...manifest,
    register: definition.register,
    when: definition.when,
    lifecycle: definition.lifecycle,
  };
}

export function createPluginToolModule(
  definition: ToolModuleDefinition,
  options: PluginToolModuleOptions,
): ToolModuleDefinition {
  validatePluginToolModuleDefinition(definition, options);

  return createToolModule({
    ...definition,
    namespace: definition.namespace ?? options.namespace,
    packageName: definition.packageName ?? options.packageName,
    version: definition.version ?? options.version,
  });
}

export function validateToolModules(modules: readonly ToolModuleDefinition[]): void {
  const ids = new Set<string>();
  const orders = new Map<number, string>();

  for (const module of modules) {
    parseDefinitionManifest(module);

    if (ids.has(module.id)) {
      throw new Error(`Duplicate tool module id: ${module.id}`);
    }
    ids.add(module.id);

    const orderOwner = orders.get(module.order);
    if (orderOwner) {
      throw new Error(`Duplicate tool module order ${module.order}: ${orderOwner}, ${module.id}`);
    }
    orders.set(module.order, module.id);

    for (const dependency of module.requires ?? []) {
      if (!modules.some((candidate) => candidate.id === dependency)) {
        throw new Error(`Tool module ${module.id} requires unknown module ${dependency}`);
      }
    }
  }
}

export function resolveRequestedToolModuleMode(): ToolModuleMode {
  return process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY === 'true'
    ? 'payments-bridge-only'
    : 'default';
}

export function selectToolModulesForContext(
  modules: readonly ToolModuleDefinition[],
  context: SapMcpContext,
): readonly ToolModuleDefinition[] {
  const requestedMode = resolveRequestedToolModuleMode();

  return modules
    .filter((module) => (module.mode ?? 'default') === requestedMode)
    .filter((module) => module.when?.(context) ?? true)
    .sort((a, b) => a.order - b.order);
}

export function createToolModuleRegistrationPlan(
  modules: readonly ToolModuleDefinition[],
  context: SapMcpContext,
): ToolModuleRegistrationPlan {
  validateToolModules(modules);

  const requestedMode = resolveRequestedToolModuleMode();
  const entries = modules
    .map((module): ToolModuleRegistrationPlanEntry => {
      const manifest = parseDefinitionManifest(module);
      const modeMatches = (manifest.mode ?? 'default') === requestedMode;
      const runtimePredicateMatches = modeMatches ? (module.when?.(context) ?? true) : false;
      const selected = modeMatches && runtimePredicateMatches;
      const skipReason = selected
        ? undefined
        : modeMatches ? 'runtime-predicate' : 'mode-mismatch';

      return {
        ...manifest,
        selected,
        ...(skipReason ? { skipReason } : {}),
      };
    })
    .sort((a, b) => a.order - b.order);
  const selectedEntries = entries.filter((entry) => entry.selected);

  return {
    requestedMode,
    entries,
    selectedModuleIds: selectedEntries.map((entry) => entry.id),
    skippedModuleIds: entries.filter((entry) => !entry.selected).map((entry) => entry.id),
    expectedTools: selectedEntries.flatMap((entry) => [...(entry.expectedTools ?? [])]),
    dependencyEdges: entries.flatMap((entry) => (
      (entry.requires ?? []).map((dependency) => ({
        from: entry.id,
        to: dependency,
      }))
    )),
  };
}

export async function registerToolModules(
  server: Server,
  context: SapMcpContext,
  modules: readonly ToolModuleDefinition[],
): Promise<ToolModuleRegistrationSummary> {
  validateToolModules(modules);
  const selectedModules = selectToolModulesForContext(modules, context);
  const selectedIds = new Set(selectedModules.map((module) => module.id));
  const results: ToolModuleRegistrationResult[] = [];

  for (const module of selectedModules) {
    for (const dependency of module.requires ?? []) {
      if (!selectedIds.has(dependency)) {
        throw new Error(`Tool module ${module.id} requires disabled module ${dependency}`);
      }
    }

    const beforeCount = getRegisteredTools(server).length;
    const manifest = parseDefinitionManifest(module);
    await module.lifecycle?.beforeRegister?.({ module: manifest, context, beforeCount });

    try {
      await module.register(server, context);
      const afterCount = getRegisteredTools(server).length;
      const registeredToolNames = new Set(getRegisteredTools(server).map((tool) => tool.name));

      for (const expectedTool of module.expectedTools ?? []) {
        if (!registeredToolNames.has(expectedTool)) {
          throw new Error(`Tool module ${module.id} did not register expected tool ${expectedTool}`);
        }
      }

      const result = {
        id: module.id,
        title: module.title,
        category: module.category,
        beforeCount,
        afterCount,
        addedCount: afterCount - beforeCount,
      };
      await module.lifecycle?.afterRegister?.({
        module: manifest,
        context,
        beforeCount,
        afterCount,
        addedCount: result.addedCount,
      });
      results.push(result);
    } catch (error) {
      await module.lifecycle?.onRegisterError?.({
        module: manifest,
        context,
        beforeCount,
        afterCount: getRegisteredTools(server).length,
        error,
      });
      throw error;
    }
  }

  return {
    modules: results,
    totalTools: getRegisteredTools(server).length,
  };
}
