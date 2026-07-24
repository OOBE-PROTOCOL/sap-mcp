/**
 * @name adapters/mcp/resource-response
 * @description Helper for constructing MCP resource responses.
 *
 * @module adapters/mcp/resource-response
 */

/**
 * @name createResourceResponse
 * @description Wraps a URI and text payload into an MCP resource response.
 *
 * @param uri  — The resource URI to return.
 * @param data — The text content to embed in the response.
 * @returns An MCP resource response with `uri` and `text` fields.
 *
 * @usedBy MCP resource handlers
 */
export function createResourceResponse(uri: string, data: string): { uri: string; text: string } {
  return { uri, text: data };
}
