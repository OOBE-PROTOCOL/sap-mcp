import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { logger } from '../core/logger.js';
import type { SapMcpContext } from '../core/types.js';
import { BUILTIN_TOOL_MODULES } from './builtin-tool-modules.js';
import { buildToolCatalog, summarizeToolCatalog } from './tool-catalog.js';
import { registerToolModules, type ToolModuleDefinition, type ToolModuleRegistrationSummary } from './module-registry.js';

export interface RegisterToolsOptions {
  readonly additionalModules?: readonly ToolModuleDefinition[];
}

/**
 * Register all tools with the MCP server.
 *
 * @name registerTools
 * @description Registers SAP SDK, Synapse Client SDK, network, and transaction tools before the server is exposed.
 * @param server - MCP server receiving tool definitions and handlers.
 * @param context - Shared runtime context with SAP client, signer, policy, and configuration.
 */
export async function registerTools(server: Server, context: SapMcpContext): Promise<void> {
  await registerToolsWithSummary(server, context);
}

export async function registerToolsWithSummary(
  server: Server,
  context: SapMcpContext,
  options: RegisterToolsOptions = {},
): Promise<ToolModuleRegistrationSummary> {
  logger.debug('Registering tools');
  const modules = [
    ...BUILTIN_TOOL_MODULES,
    ...(options.additionalModules ?? []),
  ];
  const summary = await registerToolModules(server, context, modules);
  context.toolCatalog = summarizeToolCatalog(buildToolCatalog(modules, context));

  logger.debug('Tools registered', {
    count: summary.totalTools,
    modules: summary.modules.map((module) => ({
      id: module.id,
      addedCount: module.addedCount,
    })),
  });

  return summary;
}
