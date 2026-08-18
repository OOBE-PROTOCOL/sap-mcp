/**
 * @name transports/index
 * @description Barrel export for the SAP MCP transport module.
 *
 * Re-exports stdio and HTTP transport startup functions.
 *
 * @module transports/index
 */

export { startStdioTransport } from './stdio.js';
export { startHttpTransport } from './http.js';