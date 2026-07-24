/**
 * @name adapters/index
 * @description Barrel export for all SAP MCP adapter modules (MCP and Solana).
 *
 * Re-exports the MCP response helpers and Solana connection utilities so that
 * the rest of the server can import them from a single entry point.
 *
 * @module adapters/index
 */

export * from './mcp/index.js';
export * from './solana/index.js';
