/**
 * @name sap/index
 * @description Barrel export for the SAP MCP SAP client module.
 *
 * Re-exports the `SapClientManager` singleton, client factory functions, error
 * mapping utilities, and SAP on-chain type definitions.
 *
 * @module sap/index
 */

export { SapClientManager, getSapClient, isSapClientInitialized } from './sap-client-manager.js';
export { mapSapError, isSapError } from './sap-errors.js';
export type {
  SapAgent,
  SapAgentStats,
  SapEscrow,
  SapVault,
  SapTool,
} from './sap-types.js';