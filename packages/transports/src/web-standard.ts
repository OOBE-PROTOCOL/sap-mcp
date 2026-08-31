/**
 * @name web-standard-transport
 * @description Web Standard Streamable HTTP transport for SAP MCP Server.
 *
 * Uses the MCP SDK's `WebStandardStreamableHTTPServerTransport` which runs on
 * any runtime that supports Web Standard APIs: Node.js 18+, Cloudflare Workers,
 * Deno, Bun, Vercel Edge Functions, etc.
 *
 * This enables edge deployment of the SAP MCP gateway for global low-latency
 * access without Node.js-specific HTTP APIs.
 *
 * @module transports/web-standard
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  WebStandardStreamableHTTPServerTransport,
  type EventStore,
  type StreamId,
  type EventId,
} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../../core/src/logger.js';

/**
 * @name WebStandardTransportOptions
 * @description Configuration for the web standard transport.
 */
export interface WebStandardTransportOptions {
  /**
   * Event store for stream resumability. When provided, clients can resume
   * interrupted SSE streams using the `Last-Event-ID` header.
   */
  eventStore?: EventStore;
  /**
   * Enable session management. When true, each client gets a dedicated
   * session ID and must include it in subsequent requests.
   */
  enableSessionManagement?: boolean;
  /**
   * Maximum message size in bytes (default: 4MB).
   */
  maxMessageSize?: number;
}

/**
 * @name InMemoryEventStore
 * @description Simple in-memory event store for SSE stream resumability.
 * For production with multiple instances, use a Redis-backed implementation.
 */
export class InMemoryEventStore implements EventStore {
  private readonly events = new Map<StreamId, Array<{ eventId: EventId; message: JSONRPCMessage }>>();
  private readonly eventIndex = new Map<EventId, StreamId>();
  private counter = 0;

  async storeEvent(streamId: StreamId, message: JSONRPCMessage): Promise<EventId> {
    const eventId = `evt-${++this.counter}`;
    let stream = this.events.get(streamId);
    if (!stream) {
      stream = [];
      this.events.set(streamId, stream);
    }
    stream.push({ eventId, message });
    this.eventIndex.set(eventId, streamId);
    return eventId;
  }

  async getStreamIdForEventId(eventId: EventId): Promise<StreamId | undefined> {
    return this.eventIndex.get(eventId);
  }

  async replayEventsAfter(
    lastEventId: EventId,
    { send }: { send: (eventId: EventId, message: JSONRPCMessage) => Promise<void> },
  ): Promise<StreamId> {
    const streamId = this.eventIndex.get(lastEventId);
    if (!streamId) throw new Error(`Event ${lastEventId} not found`);
    const stream = this.events.get(streamId);
    if (!stream) throw new Error(`Stream ${streamId} not found`);
    const index = stream.findIndex(e => e.eventId === lastEventId);
    if (index < 0) throw new Error(`Event ${lastEventId} not in stream`);
    for (let i = index + 1; i < stream.length; i++) {
      const evt = stream[i]!;
      await send(evt.eventId, evt.message);
    }
    return streamId;
  }

  /**
   * @name cleanup
   * @description Remove old events for a stream to prevent memory growth.
   */
  cleanup(streamId: StreamId, keepLast: number = 100): void {
    const stream = this.events.get(streamId);
    if (!stream || stream.length <= keepLast) return;
    const toRemove = stream.splice(0, stream.length - keepLast);
    for (const { eventId } of toRemove) {
      this.eventIndex.delete(eventId);
    }
  }
}

/**
 * @name createWebStandardTransport
 * @description Creates a Web Standard Streamable HTTP transport for the SAP MCP server.
 * Returns the transport instance that can be connected to an MCP Server.
 *
 * @example
 * ```ts
 * const transport = createWebStandardTransport({
 *   enableSessionManagement: true,
 *   eventStore: new InMemoryEventStore(),
 * });
 * await server.connect(transport);
 * ```
 */
export function createWebStandardTransport(options: WebStandardTransportOptions = {}): WebStandardStreamableHTTPServerTransport {
  logger.info('Creating Web Standard Streamable HTTP transport', {
    sessionManagement: options.enableSessionManagement ?? false,
    eventStore: options.eventStore ? 'enabled' : 'disabled',
  });

  return new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: options.enableSessionManagement
      ? () => crypto.randomUUID()
      : undefined,
    eventStore: options.eventStore,
  });
}

/**
 * @name handleWebStandardRequest
 * @description Handle an incoming Web Standard Request and return a Response.
 * This is the entry point for edge runtimes (Cloudflare Workers, Deno, Bun).
 *
 * @example Cloudflare Workers
 * ```ts
 * export default {
 *   async fetch(request: Request): Promise<Response> {
 *     return handleWebStandardRequest(transport, server, request);
 *   }
 * };
 * ```
 */
export async function handleWebStandardRequest(
  transport: WebStandardStreamableHTTPServerTransport,
  _server: Server,
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);

  // Health check endpoint
  if (url.pathname === '/health' && request.method === 'GET') {
    return new Response(JSON.stringify({ status: 'ok', version: '0.9.81' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // MCP endpoint - delegate to the transport's request handler
  if (url.pathname === '/mcp') {
    // The WebStandardStreamableHTTPServerTransport handles Request/Response
    // directly, making it compatible with edge runtimes.
    // The actual handler signature depends on the SDK version.
    // In SDK 1.30+, the transport processes requests via its internal handler.
    const handler = transport as unknown as {
      handleRequest?: (request: Request) => Promise<Response>;
    };
    if (typeof handler.handleRequest === 'function') {
      return handler.handleRequest(request);
    }
    return new Response('Web Standard transport handler not available', { status: 503 });
  }

  return new Response('Not Found', { status: 404 });
}