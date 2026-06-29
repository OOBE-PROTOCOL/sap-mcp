/**
 * MCP prompt response helper.
 */

export function createPromptResponse(messages: Array<{ role: string; content: string }>): { messages: Array<{ role: string; content: string }> } {
  return { messages };
}
