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

import type { SapMcpContext, SapMcpMode, SapMcpToolCatalogContext } from '../../core/src/types.js';
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

export interface RuntimeToolDescriptor {
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
  readonly inputSchema?: unknown;
  readonly outputSchema?: unknown;
  readonly annotations?: unknown;
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
  readonly title?: string;
  readonly description?: string;
  readonly inputSchema?: unknown;
  readonly outputSchema?: unknown;
  readonly annotations?: unknown;
  readonly registered?: boolean;
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

function allowedToolNamesForContext(context: SapMcpContext): Set<string> | undefined {
  return context.config.allowedTools === 'all'
    ? undefined
    : new Set(context.config.allowedTools);
}

function runtimeToolToEntry(
  toolName: string,
  module: Pick<ToolCatalogModuleEntry, 'id' | 'title' | 'category'>,
  runtimeTool?: RuntimeToolDescriptor,
): ToolCatalogToolEntry {
  return {
    moduleId: module.id,
    moduleTitle: module.title,
    moduleCategory: module.category,
    toolName,
    ...(runtimeTool?.title ? { title: runtimeTool.title } : {}),
    ...(runtimeTool?.description ? { description: runtimeTool.description } : {}),
    ...(runtimeTool?.inputSchema ? { inputSchema: runtimeTool.inputSchema } : {}),
    ...(runtimeTool?.outputSchema ? { outputSchema: runtimeTool.outputSchema } : {}),
    ...(runtimeTool?.annotations ? { annotations: runtimeTool.annotations } : {}),
    ...(runtimeTool ? { registered: true } : {}),
    metadata: getToolExecutionMetadata(toolName, toolName),
  };
}

function moduleToCatalogEntry(
  module: ToolModuleDefinition,
  allowedTools: Set<string> | undefined,
  runtimeToolsByName?: ReadonlyMap<string, RuntimeToolDescriptor>,
): ToolCatalogModuleEntry {
  const expectedTools = [...(module.expectedTools ?? [])]
    .filter((toolName) => allowedTools?.has(toolName) ?? true)
    .filter((toolName) => runtimeToolsByName === undefined || runtimeToolsByName.has(toolName));
  const moduleRef = { id: module.id, title: module.title, category: module.category };
  const tools = expectedTools.map((toolName) => runtimeToolToEntry(toolName, moduleRef, runtimeToolsByName?.get(toolName)));

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

function runtimeNamespace(toolName: string): string {
  if (toolName.startsWith('sap_payments_') || toolName.startsWith('sap_x402_')) {
    return 'sap-payments-runtime';
  }
  if (toolName.startsWith('sap_adrena_') || toolName.startsWith('sap_perp_')) {
    return 'sap-perps-runtime';
  }
  if (toolName.startsWith('sap_skills_') || toolName === 'sap_skills_bundle') {
    return 'sap-skills-runtime';
  }
  if (toolName.startsWith('sap_memory_')) {
    return 'sap-memory-runtime';
  }
  if (toolName.startsWith('sol_') || toolName.startsWith('spl-token_')) {
    return 'solana-runtime';
  }
  if (/^(jupiter|orca|raydium|meteora|magicblock)_/.test(toolName)) {
    return 'solana-integration-runtime';
  }
  if (toolName.startsWith('sap_')) {
    return 'sap-protocol-runtime';
  }
  return 'integration-runtime';
}

function runtimeCategory(moduleId: string): ToolModuleCategory {
  if (moduleId.includes('payment')) return 'payments';
  if (moduleId.includes('perps')) return 'perps';
  if (moduleId.includes('skills')) return 'skills';
  if (moduleId.includes('memory')) return 'memory';
  if (moduleId.includes('solana')) return 'solana';
  if (moduleId.includes('sap-protocol')) return 'sap-protocol';
  return 'integration';
}

function runtimeTitle(moduleId: string): string {
  return moduleId
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildRuntimeRegisteredModules(
  runtimeTools: readonly RuntimeToolDescriptor[],
  knownToolNames: ReadonlySet<string>,
  allowedTools: Set<string> | undefined,
): readonly ToolCatalogModuleEntry[] {
  const grouped = new Map<string, RuntimeToolDescriptor[]>();
  for (const tool of runtimeTools) {
    if (knownToolNames.has(tool.name) || !(allowedTools?.has(tool.name) ?? true)) {
      continue;
    }
    const moduleId = runtimeNamespace(tool.name);
    grouped.set(moduleId, [...(grouped.get(moduleId) ?? []), tool]);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([moduleId, tools], index) => {
      const category = runtimeCategory(moduleId);
      const title = runtimeTitle(moduleId);
      const moduleRef = { id: moduleId, title, category };
      const sortedTools = [...tools].sort((left, right) => left.name.localeCompare(right.name));
      return {
        id: moduleId,
        title,
        description: 'Tools discovered from the live MCP registration store that are not yet represented by static module sentinels.',
        category,
        order: 9_000 + index,
        mode: 'default',
        requires: [],
        namespace: moduleId.replace(/-runtime$/, ''),
        expectedTools: sortedTools.map((tool) => tool.name),
        tools: sortedTools.map((tool) => runtimeToolToEntry(tool.name, moduleRef, tool)),
      };
    });
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
  const allowedTools = allowedToolNamesForContext(context);
  const catalogModules = selectedModules
    .map((module) => moduleToCatalogEntry(module, allowedTools))
    .filter((module) => allowedTools === undefined || module.tools.length > 0);
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

export function buildToolCatalogFromRuntimeTools(
  modules: readonly ToolModuleDefinition[],
  context: SapMcpContext,
  runtimeTools: readonly RuntimeToolDescriptor[],
  options: ToolCatalogOptions = {},
): ToolCatalog {
  validateToolModules(modules);

  const selectedModules = withPaymentsBridgeMode(options.paymentsBridgeOnly, () => (
    selectToolModulesForContext(modules, context)
  ));
  const allowedTools = allowedToolNamesForContext(context);
  const runtimeToolsByName = new Map<string, RuntimeToolDescriptor>();
  for (const tool of runtimeTools) {
    if (!tool.name || runtimeToolsByName.has(tool.name) || !(allowedTools?.has(tool.name) ?? true)) {
      continue;
    }
    runtimeToolsByName.set(tool.name, tool);
  }

  const catalogModules = selectedModules
    .map((module) => moduleToCatalogEntry(module, allowedTools, runtimeToolsByName))
    .filter((module) => module.tools.length > 0);
  const knownToolNames = new Set(catalogModules.flatMap((module) => module.tools.map((tool) => tool.toolName)));
  const runtimeModules = buildRuntimeRegisteredModules([...runtimeToolsByName.values()], knownToolNames, allowedTools);
  const allModules = [...catalogModules, ...runtimeModules];
  const tools = allModules.flatMap((module) => [...module.tools]);

  return {
    profileId: options.profileId ?? context.config.mode,
    profileDescription: options.profileDescription ?? `SAP MCP ${context.config.mode} runtime tool catalog.`,
    runtimeMode: context.config.mode,
    paymentsBridgeOnly: options.paymentsBridgeOnly ?? process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY === 'true',
    moduleCount: allModules.length,
    toolCount: tools.length,
    categories: buildCategorySummary(allModules),
    policy: buildPolicySummary(tools),
    modules: allModules,
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
