/**
 * MCP resource response helper.
 */

export function createResourceResponse(uri: string, data: string): { uri: string; text: string } {
  return { uri, text: data };
}
