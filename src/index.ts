/**
 * SAP MCP Server - Main Entry Point
 * 
 * Programmatic API for embedding SAP MCP server in other applications.
 * For CLI usage, see cli.ts
 */

export { createSapMcpServer } from './server/create-server.js';
export { SapMcpContext } from './core/types.js';
export type {
  SapMcpMode,
  SapMcpConfig,
  SapAgentSession,
  SapPermission,
  SapPolicy,
  SapTransactionPreview,
  SapToolResult,
  SapSignerMode,
  SapRiskLevel,
} from './core/types.js';

export { loadConfig } from './config/env.js';
export type { SapEnvConfig } from './config/env.js';

export { SapClientManager, getSapClient, isSapClientInitialized } from './sap/sap-client-manager.js';

export { resolveSigner } from './signer/signer-resolver.js';
export { PolicyEngine } from './policy/policy-engine.js';

export { registerTools } from './tools/register-tools.js';
export { registerResources } from './resources/register-resources.js';
export { registerPrompts } from './prompts/register-prompts.js';
