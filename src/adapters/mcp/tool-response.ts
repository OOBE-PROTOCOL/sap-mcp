/**
 * @name adapters/mcp/tool-response
 * @description Helpers for constructing MCP tool call responses.
 *
 * Provides text, structured JSON, JSON, and error response builders that
 * conform to the MCP tool result shape.
 *
 * @module adapters/mcp/tool-response
 */

import type { UiCardContext } from '../../ui/ui-resources.js';
import { buildUiCardResource } from '../../ui/ui-resources.js';

/**
 * @name createTextResponse
 * @description Creates a simple text MCP tool response.
 *
 * @param text    — The text content to return.
 * @param options — Optional flags, e.g. `{ isError: true }` to mark the response as an error.
 * @returns An MCP tool result with a single text content block and optional `isError` flag.
 *
 * @usedBy MCP tool handlers, `adapters/mcp/index.ts`
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
 * @name createStructuredJsonResponse
 * @description Creates an MCP tool response with both text content and structured JSON content.
 *
 * @param data    — The structured data object to embed as `structuredContent`.
 * @param options — Optional flags, e.g. `{ isError: true }`.
 * @returns An MCP tool result with text content, `structuredContent`, and optional `isError` flag.
 *
 * @usedBy MCP tool handlers
 */
export function createStructuredJsonResponse<T extends Record<string, unknown>>(
  data: T,
  options?: { isError?: boolean },
): { content: Array<{ type: 'text'; text: string }>; structuredContent: T; isError?: boolean } {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
    isError: options?.isError,
  };
}

/**
 * @name createJsonResponse
 * @description Creates an MCP tool response by serializing data as pretty-printed JSON text.
 *
 * @param data — The value to serialize and return as JSON text.
 * @returns An MCP tool result with a single text content block containing the JSON string.
 *
 * @usedBy MCP tool handlers
 */
export function createJsonResponse(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * @name createErrorResponse
 * @description Creates an MCP tool error response with a prefixed error message.
 *
 * @param message — The error message text to include.
 * @returns An MCP tool result with `isError: true` and the message prefixed with `Error: `.
 *
 * @usedBy MCP tool handlers
 */
export function createErrorResponse(message: string): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}

/**
 * @name createUiCardResponse
 * @description Creates an MCP tool response with text content, structured JSON,
 * and an embedded `ui://` resource (MCP Apps extension). The MCP client renders
 * the embedded HTML card in a sandboxed iframe alongside the text/JSON output.
 *
 * @param data      — The structured data object to embed as `structuredContent`.
 * @param cardCtx   — The UI card context used to render the visual card.
 * @param options   — Optional flags, e.g. `{ isError: true }`.
 * @returns An MCP tool result with text content, an embedded `ui://` resource,
 *          `structuredContent`, and optional `isError` flag.
 */
export function createUiCardResponse<T extends Record<string, unknown>>(
  data: T,
  cardCtx: UiCardContext,
  options?: { isError?: boolean },
): {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'resource'; resource: { uri: string; mimeType: 'text/html'; text: string } }
  >;
  isError?: boolean;
} {
  const cardResource = buildUiCardResource(cardCtx);
  return {
    content: [
      { type: 'text', text: JSON.stringify(data, null, 2) },
      cardResource,
    ],
    isError: options?.isError,
  };
}
