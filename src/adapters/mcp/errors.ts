/**
 * @name adapters/mcp/errors
 * @description Custom error class for MCP protocol-level failures.
 *
 * @module adapters/mcp/errors
 */

/**
 * @name McpError
 * @description Error thrown when an MCP protocol operation fails.
 *
 * Extends the native `Error` class with a fixed `name` property so that
 * consumers can distinguish MCP errors from other runtime errors.
 *
 * @usedBy `adapters/mcp/index.ts`, MCP tool handlers
 */
export class McpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpError';
  }
}
