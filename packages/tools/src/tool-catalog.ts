/**
 * @name tools/tool-catalog
 * @description Runtime read-model for SAP MCP tool modules and execution policy.
 *
 * This module gives UI, wizard, release checks, and agent bootstrap code a
 * single catalog shape that combines selected tool modules with pricing,
 * signer-boundary, permission, and routing metadata.
 *
 * @module tools/tool-catalog
 */

import type { SapMcpContext, SapMcpMode, SapMcpToolCatalogContext } from '@oobe-protocol-labs/sap-mcp-core/types';
import {
  selectToolModulesForContext,
  validateToolModules,
  type ToolModuleCategory,
  type ToolModuleDefinition,
  type ToolModuleMode,
} from './module-registry.js';
import {
  getToolExecutionMetadata,
  type ToolExecutionIntent,
  type ToolExecutionMetadata,
} from './tool-execution-metadata.js';

export interface ToolCatalogOptions {
  readonly profileId?: string;
  readonly profileDescription?: string;
  readonly paymentsBridgeOnly?: boolean;
}

export interface ToolCatalogRuntimeProfile extends ToolCatalogOptions {
  readonly id: string;
  readonly description: string;
  readonly context: SapMcpContext;
}

export interface ToolCatalogToolEntry {
  readonly moduleId: string;
  readonly moduleTitle: string;
  readonly moduleCategory: ToolModuleCategory;
  readonly toolName: string;
  readonly metadata: ToolExecutionMetadata;
}

export interface ToolCatalogModuleEntry {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: ToolModuleCategory;
  readonly order: number;
  readonly mode: ToolModuleMode;
  readonly requires: readonly string[];
  readonly namespace?: string;
  readonly packageName?: string;
  readonly version?: string;
  readonly expectedTools: readonly string[];
  readonly tools: readonly ToolCatalogToolEntry[];
}

export interface ToolCatalogCategorySummary {
  readonly category: ToolModuleCategory;
  readonly modules: number;
  readonly tools: number;
}

export interface ToolCatalogPolicySummary {
  readonly paymentTiers: Readonly<Record<string, number>>;
  readonly intents: Readonly<Record<ToolExecutionIntent, number>>;
  readonly hostedAccountlessBlockedTools: readonly string[];
  readonly localSignerTools: readonly string[];
}

export interface ToolCatalog {
  readonly profileId: string;
  readonly profileDescription: string;
  readonly runtimeMode: SapMcpMode;
  readonly paymentsBridgeOnly: boolean;
  readonly moduleCount: number;
  readonly toolCount: number;
  readonly categories: readonly ToolCatalogCategorySummary[];
  readonly policy: ToolCatalogPolicySummary;
  readonly modules: readonly ToolCatalogModuleEntry[];
  readonly tools: readonly ToolCatalogToolEntry[];
}

function withPaymentsBridgeMode<T>(enabled: boolean | undefined, fn: () => T): T {
  const previousValue = process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY;
  if (enabled === undefined) {
    delete process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY;
  } else {
    process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY = enabled ? 'true' : 'false';
  }

  try {
    return fn();
  } finally {
    if (previousValue === undefined) {
      delete process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY;
    } else {
      process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY = previousValue;
    }
  }
}

function incrementRecord<T extends string>(record: Partial<Record<T, number>>, key: T): void {
  record[key] = (record[key] ?? 0) + 1;
}

function buildCategorySummary(modules: readonly ToolCatalogModuleEntry[]): readonly ToolCatalogCategorySummary[] {
  const categories = new Map<ToolModuleCategory, ToolCatalogCategorySummary>();

  for (const module of modules) {
    const existing = categories.get(module.category);
    categories.set(module.category, {
      category: module.category,
      modules: (existing?.modules ?? 0) + 1,
      tools: (existing?.tools ?? 0) + module.tools.length,
    });
  }

  return [...categories.values()].sort((a, b) => a.category.localeCompare(b.category));
}

function buildPolicySummary(tools: readonly ToolCatalogToolEntry[]): ToolCatalogPolicySummary {
  const paymentTiers: Record<string, number> = {};
  const intents: Partial<Record<ToolExecutionIntent, number>> = {};
  const hostedAccountlessBlockedTools: string[] = [];
  const localSignerTools: string[] = [];

  for (const tool of tools) {
    incrementRecord(paymentTiers, tool.metadata.paymentTier);
    incrementRecord(intents, tool.metadata.intent);

    if (tool.metadata.hostedAccountlessBlocked) {
      hostedAccountlessBlockedTools.push(tool.toolName);
    }
    if (tool.metadata.localSignerEquivalent || tool.toolName.startsWith('sap_payments_')) {
      localSignerTools.push(tool.toolName);
    }
  }

  return {
    paymentTiers,
    intents: intents as Readonly<Record<ToolExecutionIntent, number>>,
    hostedAccountlessBlockedTools: [...new Set(hostedAccountlessBlockedTools)].sort(),
    localSignerTools: [...new Set(localSignerTools)].sort(),
  };
}

function moduleToCatalogEntry(module: ToolModuleDefinition): ToolCatalogModuleEntry {
  const expectedTools = [...(module.expectedTools ?? [])];
  const tools = expectedTools.map((toolName) => ({
    moduleId: module.id,
    moduleTitle: module.title,
    moduleCategory: module.category,
    toolName,
    metadata: getToolExecutionMetadata(toolName, toolName),
  }));

  return {
    id: module.id,
    title: module.title,
    description: module.description,
    category: module.category,
    order: module.order,
    mode: module.mode ?? 'default',
    requires: [...(module.requires ?? [])],
    namespace: module.namespace,
    packageName: module.packageName,
    version: module.version,
    expectedTools,
    tools,
  };
}

export function buildToolCatalog(
  modules: readonly ToolModuleDefinition[],
  context: SapMcpContext,
  options: ToolCatalogOptions = {},
): ToolCatalog {
  validateToolModules(modules);

  const selectedModules = withPaymentsBridgeMode(options.paymentsBridgeOnly, () => (
    selectToolModulesForContext(modules, context)
  ));
  const catalogModules = selectedModules.map(moduleToCatalogEntry);
  const tools = catalogModules.flatMap((module) => [...module.tools]);

  return {
    profileId: options.profileId ?? context.config.mode,
    profileDescription: options.profileDescription ?? `SAP MCP ${context.config.mode} runtime tool catalog.`,
    runtimeMode: context.config.mode,
    paymentsBridgeOnly: options.paymentsBridgeOnly ?? process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY === 'true',
    moduleCount: catalogModules.length,
    toolCount: tools.length,
    categories: buildCategorySummary(catalogModules),
    policy: buildPolicySummary(tools),
    modules: catalogModules,
    tools,
  };
}

export function buildToolCatalogForRuntimeProfiles(
  modules: readonly ToolModuleDefinition[],
  profiles: readonly ToolCatalogRuntimeProfile[],
): readonly ToolCatalog[] {
  return profiles.map((profile) => buildToolCatalog(modules, profile.context, {
    profileId: profile.id,
    profileDescription: profile.description,
    paymentsBridgeOnly: profile.paymentsBridgeOnly,
  }));
}

export function summarizeToolCatalog(catalog: ToolCatalog): SapMcpToolCatalogContext {
  return {
    profileId: catalog.profileId,
    profileDescription: catalog.profileDescription,
    runtimeMode: catalog.runtimeMode,
    paymentsBridgeOnly: catalog.paymentsBridgeOnly,
    moduleCount: catalog.moduleCount,
    toolCount: catalog.toolCount,
    categories: catalog.categories.map((category) => ({ ...category })),
    policy: {
      paymentTiers: { ...catalog.policy.paymentTiers },
      intents: { ...catalog.policy.intents },
      hostedAccountlessBlockedTools: [...catalog.policy.hostedAccountlessBlockedTools],
      localSignerTools: [...catalog.policy.localSignerTools],
    },
    modules: catalog.modules.map((module) => ({
      id: module.id,
      title: module.title,
      category: module.category,
      mode: module.mode,
      expectedTools: [...module.expectedTools],
    })),
  };
}
