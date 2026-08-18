/**
 * @name server/index
 * @description Barrel export for the SAP MCP server module.
 *
 * Re-exports the server creation function, capability registration, and server metadata.
 *
 * @module server/index
 */

export { createSapMcpServer } from './create-server.js';
export { registerCapabilities } from './register-capabilities.js';
export { SERVER_METADATA, CAPABILITIES } from './server-metadata.js';