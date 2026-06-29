/**
 * MCP tool response helpers
 */

export function createTextResponse(
  text: string,
  options?: { isError?: boolean }
): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
  return {
    content: [{ type: 'text', text }],
    isError: options?.isError,
  };
}

/**
 * Executes the create json response operation.
 */
export function createJsonResponse(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Executes the create error response operation.
 */
export function createErrorResponse(message: string): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}
