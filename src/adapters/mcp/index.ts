/**
 * @name adapters/mcp/index
 * @description Barrel export for the MCP adapter subsystem.
 *
 * Re-exports tool response helpers, resource response helpers,
 * prompt response helpers, and the MCP error class.
 *
 * @module adapters/mcp/index
 */

export { createTextResponse, createJsonResponse, createErrorResponse } from './tool-response.js';
export { createResourceResponse } from './resource-response.js';
export { createPromptResponse } from './prompt-response.js';
export { McpError } from './errors.js';
