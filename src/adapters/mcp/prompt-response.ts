/**
 * @name adapters/mcp/prompt-response
 * @description Helper for constructing MCP prompt responses.
 *
 * @module adapters/mcp/prompt-response
 */

/**
 * @name createPromptResponse
 * @description Wraps an array of role/content message objects into an MCP prompt response.
 *
 * @param messages — Array of message objects with `role` and `content` string fields.
 * @returns An MCP prompt response containing the provided messages.
 *
 * @usedBy MCP prompt handlers
 */
export function createPromptResponse(messages: Array<{ role: string; content: string }>): { messages: Array<{ role: string; content: string }> } {
  return { messages };
}
