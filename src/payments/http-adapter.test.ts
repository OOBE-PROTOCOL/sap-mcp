import { PassThrough } from 'stream';
import type { IncomingMessage } from 'http';
import { describe, expect, it } from 'vitest';
import { NativeHttpAdapter } from './http-adapter.js';

function requestWithHeaders(headers: IncomingMessage['headers']): IncomingMessage {
  const request = new PassThrough() as IncomingMessage;
  request.headers = headers;
  request.method = 'POST';
  return request;
}

describe('NativeHttpAdapter', () => {
  it('aliases X-PAYMENT when x402 core requests payment-signature', () => {
    const adapter = new NativeHttpAdapter({
      request: requestWithHeaders({ 'x-payment': 'signed-payload' }),
      path: '/mcp/paid/read-premium/request/tool',
      body: {},
    });

    expect(adapter.getHeader('payment-signature')).toBe('signed-payload');
  });

  it('prefers payment-signature over X-PAYMENT when both are present', () => {
    const adapter = new NativeHttpAdapter({
      request: requestWithHeaders({
        'payment-signature': 'canonical-signature',
        'x-payment': 'legacy-payment',
      }),
      path: '/mcp/paid/read-premium/request/tool',
      body: {},
    });

    expect(adapter.getHeader('payment-signature')).toBe('canonical-signature');
  });
});
