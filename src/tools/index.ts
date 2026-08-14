/**
 * @name tools/index
 * @description Barrel export for tool registration modules (SAP SDK, SNS, Client SDK)
 * @module tools/index
 */

/**
 * Tools module barrel export
 */

export { registerTools } from './register-tools.js';
export type { RegisterToolsOptions } from './register-tools.js';
export { registerToolsWithSummary } from './register-tools.js';
export {
  PLUGIN_TOOL_MODULE_ORDER_MAX,
  PLUGIN_TOOL_MODULE_ORDER_MIN,
  createToolModuleRegistrationPlan,
  createPluginToolModule,
  createToolModule,
  registerToolModules,
  resolveRequestedToolModuleMode,
  selectToolModulesForContext,
  validateToolModules,
} from './module-registry.js';
export type {
  ToolModuleCategory,
  ToolModuleDefinition,
  ToolModuleDependencyEdge,
  ToolModuleLifecycleEvent,
  ToolModuleLifecycleHooks,
  ToolModuleRegister,
  ToolModuleRegistrationPlan,
  ToolModuleRegistrationPlanEntry,
  ToolModuleRegistrationResult,
  ToolModuleRegistrationSummary,
} from './module-registry.js';
export {
  TOOL_MODULE_CATEGORIES,
  TOOL_MODULE_MODES,
  ToolModuleCategorySchema,
  ToolModuleIdSchema,
  ToolModuleManifestSchema,
  ToolModuleModeSchema,
  ToolModuleToolNameSchema,
  parseToolModuleManifest,
} from './tool-module-manifest.js';
export type {
  ToolModuleManifest,
  ToolModuleMode,
} from './tool-module-manifest.js';
export {
  assertToolModuleCatalogValid,
  validateToolModuleCatalog,
} from './tool-module-validation.js';
export type {
  ToolModuleRuntimeProfile,
  ToolModuleSelectionSummary,
  ToolModuleValidationIssue,
  ToolModuleValidationReport,
} from './tool-module-validation.js';
export {
  buildToolModulePolicyCatalog,
  classifyToolIntent,
  describeToolIntent,
  getToolExecutionMetadata,
  localSignerEquivalent,
  priceHintForTier,
} from './tool-execution-metadata.js';
export type {
  ToolExecutionGuidance,
  ToolExecutionIntent,
  ToolExecutionMetadata,
  ToolModulePolicyCatalogEntry,
} from './tool-execution-metadata.js';
export {
  createToolExecutionEnvelope,
  createToolExecutionErrorEnvelope,
  createToolExecutionResult,
  registerPipelineTool,
} from './tool-execution-pipeline.js';
export type {
  SafeParseFailure,
  SafeParseSuccess,
  ToolExecutionEnvelope,
  ToolExecutionPipelineDefinition,
  ToolExecutionPipelineInput,
  ToolExecutionPipelineResult,
  ToolInputParser,
} from './tool-execution-pipeline.js';
export {
  createStringToolPipelineResult,
  createToolFamilyPipelineResult,
  parseStringToolPayload,
  registerToolFamilyPipelineTool,
} from './tool-family-pipeline.js';
export type {
  ToolFamilyPipelineDefinition,
  ToolFamilyPipelineHandlerResult,
  ToolFamilyPipelineOptions,
  ToolFamilyPipelineResult,
} from './tool-family-pipeline.js';
export {
  buildToolCatalog,
  buildToolCatalogForRuntimeProfiles,
  summarizeToolCatalog,
} from './tool-catalog.js';
export type {
  ToolCatalog,
  ToolCatalogCategorySummary,
  ToolCatalogModuleEntry,
  ToolCatalogOptions,
  ToolCatalogPolicySummary,
  ToolCatalogRuntimeProfile,
  ToolCatalogToolEntry,
} from './tool-catalog.js';
export {
  BUILTIN_TOOL_MODULES,
  resolveBuiltinToolModulesForContext,
} from './builtin-tool-modules.js';

// REAL SAP SDK TOOLS (75 tools)
export { registerSapSdkTools } from './sap-sdk-tools.js';

// REAL SAP SNS TOOLS — SNS integration exported by synapse-sap-sdk v1.0.x
export { registerSapSnsTools } from './sap-sns-tools.js';

// REAL CLIENT SDK TOOLS — SynapseAgentKit plugin tools plus compatibility tools
export { registerClientSdkTools } from './client-sdk-tools.js';

// REAL TRANSACTION TOOLS — decode, preview, sign, and submit Solana transactions
export { registerTransactionTools } from './transaction-tools.js';

// REAL CHAT TOOLS — signed group rooms, manifests, chunked messages, history, and ciphertext transport
export { registerChatTools } from './chat-tools.js';

// REAL X402 HOSTED PAYMENT TOOL — local signer helper for paid remote MCP calls
export { registerX402PaidCallTool } from './x402-paid-call-tool.js';

// REAL PROFILE TOOLS — inspect and switch loaded SAP MCP profiles without exposing keypairs
export { registerProfileTools } from './profile-tools.js';

// REAL AGENT START TOOL — concise hosted SAP MCP bootstrap for agent runtimes
export { registerAgentStartTool } from './agent-start-tool.js';

// REAL PREMIUM RUNTIME TOOLS — typed plugin catalogs, stream/webhook contracts, and session planning
export { registerPremiumTools } from './premium-tools.js';

// REAL QUICK CONTEXT TOOL — single-call bootstrap aggregator (version, tools, pricing, premium, skills)
export { registerQuickContextTool } from './quick-context-tool.js';

// REAL SKILL TOOLS — list, bundle, and install SAP MCP agent skills
export { registerSkillsTools } from './skills-tools.js';

// REAL MAGICBLOCK TOOLS — 20 tools for ER Router, Private Payments, and VRF
export { registerMagicBlockTools } from './magicblock-tools.js';

// REAL MEMORY TOOLS — 15 free local tools for agent memory, strategies, streams, and audit
export { registerMemoryTools } from './memory-tools.js';
