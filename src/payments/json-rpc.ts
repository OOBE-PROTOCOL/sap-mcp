/**
 * @name JsonRpcPaymentIntrospection
 * @description Small JSON-RPC helpers used by the remote monetization gate without coupling payment logic to MCP tools.
 */

/**
 * @name JsonRpcId
 * @description JSON-RPC request identifier shape accepted by MCP clients.
 */
export type JsonRpcId = string | number | null;

/**
 * @name JsonRpcRequest
 * @description Minimal JSON-RPC request shape needed to inspect MCP method and tool names.
 */
export interface JsonRpcRequest {
  jsonrpc?: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

/**
 * @name McpToolCall
 * @description Tool invocation extracted from a JSON-RPC `tools/call` request.
 */
export interface McpToolCall {
  id?: JsonRpcId;
  toolName: string;
  arguments?: unknown;
}

/**
 * @name ParsedMcpRequest
 * @description Parsed MCP request metadata relevant to payment decisions.
 */
export interface ParsedMcpRequest {
  requests: JsonRpcRequest[];
  toolCalls: McpToolCall[];
  methods: string[];
  isBatch: boolean;
}

/**
 * @name isRecord
 * @description Checks whether a value can be treated as a plain object for protocol introspection.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @name parseJsonRpcBody
 * @description Parses a JSON-RPC request or batch and extracts MCP tool-call metadata.
 */
export function parseJsonRpcBody(body: unknown): ParsedMcpRequest {
  const rawRequests = Array.isArray(body) ? body : [body];
  const requests: JsonRpcRequest[] = [];
  const toolCalls: McpToolCall[] = [];

  for (const rawRequest of rawRequests) {
    if (!isRecord(rawRequest) || typeof rawRequest.method !== 'string') {
      continue;
    }

    const request: JsonRpcRequest = {
      jsonrpc: rawRequest.jsonrpc === '2.0' ? '2.0' : undefined,
      id: typeof rawRequest.id === 'string' || typeof rawRequest.id === 'number' || rawRequest.id === null
        ? rawRequest.id
        : undefined,
      method: rawRequest.method,
      params: rawRequest.params,
    };
    requests.push(request);

    if (request.method !== 'tools/call' || !isRecord(request.params)) {
      continue;
    }

    const toolName = request.params.name;
    if (typeof toolName !== 'string' || toolName.length === 0) {
      continue;
    }

    toolCalls.push({
      id: request.id,
      toolName,
      arguments: request.params.arguments,
    });
  }

  return {
    requests,
    toolCalls,
    methods: requests.map(request => request.method),
    isBatch: Array.isArray(body),
  };
}
