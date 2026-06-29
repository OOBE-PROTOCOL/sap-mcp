import { describe, expect, it } from 'vitest';
import { AuthManager } from './auth/index.js';

describe('remote auth manager', () => {
  it('allows bearerless public MCP access when auth type is none', () => {
    const auth = new AuthManager({ type: 'none' });

    expect(auth.validateFromHeaders({})).toEqual({
      success: true,
      userId: 'anonymous',
    });
  });

  it('still rejects missing bearer credentials in api key mode', () => {
    const auth = new AuthManager({
      type: 'api_key',
      keys: new Map([['sk_test', 'operator']]),
    });

    expect(auth.validateFromHeaders({})).toEqual({
      success: false,
      error: 'Missing authorization header',
    });
  });
});
