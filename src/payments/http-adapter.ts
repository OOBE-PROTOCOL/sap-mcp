/**
 * @name NativeHttpX402Adapter
 * @description Native Node.js HTTP adapter and request utilities for x402-gated MCP traffic.
 */

import * as http from 'http';
import { PassThrough } from 'stream';
import type { HTTPAdapter } from '@x402/core/server';

const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * @name NativeHttpAdapterOptions
 * @description Adapter inputs required by x402's framework-agnostic HTTP server.
 */
export interface NativeHttpAdapterOptions {
  request: http.IncomingMessage;
  path: string;
  body: unknown;
}

/**
 * @name NativeHttpAdapter
 * @description Implements x402's HTTPAdapter over Node's native IncomingMessage.
 */
export class NativeHttpAdapter implements HTTPAdapter {
  private readonly request: http.IncomingMessage;
  private readonly path: string;
  private readonly body: unknown;

  public constructor(options: NativeHttpAdapterOptions) {
    this.request = options.request;
    this.path = options.path;
    this.body = options.body;
  }

  /**
   * @name getHeader
   * @description Returns a case-insensitive HTTP header value.
   */
  public getHeader(name: string): string | undefined {
    const normalizedName = name.toLowerCase();
    const header = this.request.headers[normalizedName] ?? (
      normalizedName === 'payment-signature'
        ? this.request.headers['x-payment']
        : undefined
    );
    if (Array.isArray(header)) {
      return header[0];
    }
    return header;
  }

  /**
   * @name getMethod
   * @description Returns the HTTP method.
   */
  public getMethod(): string {
    return this.request.method ?? 'GET';
  }

  /**
   * @name getPath
   * @description Returns the x402 virtual path used for payment route matching.
   */
  public getPath(): string {
    return this.path;
  }

  /**
   * @name getUrl
   * @description Returns an absolute URL for the x402 protected virtual resource.
   */
  public getUrl(): string {
    const host = this.request.headers.host ?? 'localhost';
    const protoHeader = this.request.headers['x-forwarded-proto'];
    const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader ?? 'http';
    return `${proto}://${host}${this.path}`;
  }

  /**
   * @name getAcceptHeader
   * @description Returns the request Accept header.
   */
  public getAcceptHeader(): string {
    return this.getHeader('accept') ?? '';
  }

  /**
   * @name getUserAgent
   * @description Returns the request User-Agent header.
   */
  public getUserAgent(): string {
    return this.getHeader('user-agent') ?? '';
  }

  /**
   * @name getBody
   * @description Returns the parsed JSON-RPC body for dynamic x402 pricing.
   */
  public getBody(): unknown {
    return this.body;
  }
}

/**
 * @name readRequestBody
 * @description Reads and bounds a Node HTTP request body before replaying it to MCP.
 */
export async function readRequestBody(
  request: http.IncomingMessage,
  maxBytes = DEFAULT_MAX_BODY_BYTES,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > maxBytes) {
      throw new Error(`Request body exceeds ${maxBytes} bytes`);
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

/**
 * @name replayRequest
 * @description Recreates a readable request stream after the monetization gate has consumed the original body.
 */
export function replayRequest(original: http.IncomingMessage, body: Buffer): http.IncomingMessage {
  const replay = new PassThrough() as unknown as http.IncomingMessage;
  replay.headers = original.headers;
  replay.rawHeaders = original.rawHeaders;
  replay.method = original.method;
  replay.url = original.url;
  replay.httpVersion = original.httpVersion;
  replay.httpVersionMajor = original.httpVersionMajor;
  replay.httpVersionMinor = original.httpVersionMinor;
  replay.socket = original.socket;
  replay.complete = true;
  replay.push(body);
  replay.push(null);
  return replay;
}

/**
 * @name parseJsonBody
 * @description Parses a JSON request body and returns undefined for empty bodies.
 */
export function parseJsonBody(body: Buffer): unknown {
  if (body.byteLength === 0) {
    return undefined;
  }
  return JSON.parse(body.toString('utf-8')) as unknown;
}
