import { describe, expect, it } from 'vitest';
import { redactSensitiveString } from './logger.js';

describe('logger redaction', () => {
  it('redacts RPC URL query secrets', () => {
    const redacted = redactSensitiveString(
      'https://rpc.example.com/path?api_key=sk_live_secret&network=mainnet&token=abc123',
    );

    expect(redacted).toContain('api_key=%5BREDACTED%5D');
    expect(redacted).toContain('token=%5BREDACTED%5D');
    expect(redacted).not.toContain('sk_live_secret');
    expect(redacted).not.toContain('abc123');
  });
});
