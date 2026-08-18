/**
 * @name RemoteAuth
 * @description Authentication primitives for remote MCP server access control.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type { IncomingHttpHeaders } from 'http';

/**
 * @name AuthResult
 * @description Result of a remote authentication attempt.
 */
export interface AuthResult {
  success: boolean;
  userId?: string;
  error?: string;
}

/**
 * @name ApiKeyAuthConfig
 * @description API-key authentication configuration mapping bearer tokens to user identifiers.
 */
export interface ApiKeyAuthConfig {
  type: 'api_key';
  keys: ReadonlyMap<string, string>;
}

/**
 * @name JwtAuthConfig
 * @description HMAC-SHA256 JWT authentication configuration.
 */
export interface JwtAuthConfig {
  type: 'jwt';
  secret: string;
  issuer: string;
}

/**
 * @name NoAuthConfig
 * @description Public bearerless MCP mode for agent-facing x402-first deployments.
 */
export interface NoAuthConfig {
  type: 'none';
}

/**
 * @name RemoteAuthConfig
 * @description Supported remote authentication strategies.
 */
export type RemoteAuthConfig = ApiKeyAuthConfig | JwtAuthConfig | NoAuthConfig;

/**
 * @name APIKeyAuth
 * @description Validates bearer tokens against a configured API-key map.
 */
export class APIKeyAuth {
  public constructor(private readonly keys: ReadonlyMap<string, string>) {}

  /**
   * @name validate
   * @description Checks whether an API key exists in the configured key map.
   */
  public validate(apiKey: string): AuthResult {
    const userId = this.keys.get(apiKey);
    if (!userId) {
      return { success: false, error: 'Invalid API key' };
    }
    return { success: true, userId };
  }
}

/**
 * @name JwtPayload
 * @description Minimal JWT payload claims used by the remote MCP server.
 */
interface JwtPayload {
  iss?: string;
  sub?: string;
  exp?: number;
}

/**
 * @name isJwtPayload
 * @description Narrows an unknown JSON value to the JWT payload shape used by the server.
 */
function isJwtPayload(value: unknown): value is JwtPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    (record.iss === undefined || typeof record.iss === 'string') &&
    (record.sub === undefined || typeof record.sub === 'string') &&
    (record.exp === undefined || typeof record.exp === 'number')
  );
}

/**
 * @name decodeJsonSegment
 * @description Decodes a base64url JWT segment into a typed JSON object.
 */
function decodeJsonSegment(segment: string): unknown {
  const json = Buffer.from(segment, 'base64url').toString('utf8');
  return JSON.parse(json) as unknown;
}

/**
 * @name constantTimeEquals
 * @description Compares base64url signatures without leaking timing information.
 */
function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

/**
 * @name JWTAuth
 * @description Validates HMAC-SHA256 bearer JWTs with issuer and expiration checks.
 */
export class JWTAuth {
  public constructor(
    private readonly secret: string,
    private readonly issuer: string,
  ) {}

  /**
   * @name validate
   * @description Verifies JWT structure, signature, issuer, subject, and expiration.
   */
  public validate(token: string): AuthResult {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { success: false, error: 'Invalid JWT format' };
    }

    const [headerSegment, payloadSegment, signatureSegment] = parts;
    try {
      const payload = decodeJsonSegment(payloadSegment);
      if (!isJwtPayload(payload)) {
        return { success: false, error: 'Invalid JWT payload' };
      }
      if (payload.iss !== this.issuer) {
        return { success: false, error: 'Invalid token issuer' };
      }
      if (!payload.sub) {
        return { success: false, error: 'Missing token subject' };
      }
      if (payload.exp !== undefined && payload.exp < Date.now() / 1000) {
        return { success: false, error: 'Token expired' };
      }

      const expectedSignature = createHmac('sha256', this.secret)
        .update(`${headerSegment}.${payloadSegment}`)
        .digest('base64url');

      if (!constantTimeEquals(signatureSegment, expectedSignature)) {
        return { success: false, error: 'Invalid signature' };
      }

      return { success: true, userId: payload.sub };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'JWT validation failed',
      };
    }
  }
}

/**
 * @name AuthManager
 * @description Validates remote MCP request headers through the configured authentication strategy.
 */
export class AuthManager {
  private readonly apiKeyAuth?: APIKeyAuth;
  private readonly jwtAuth?: JWTAuth;
  private readonly publicAccess: boolean;

  public constructor(config: RemoteAuthConfig) {
    this.publicAccess = config.type === 'none';
    if (config.type === 'none') {
      return;
    }
    if (config.type === 'api_key') {
      this.apiKeyAuth = new APIKeyAuth(config.keys);
      return;
    }
    this.jwtAuth = new JWTAuth(config.secret, config.issuer);
  }

  /**
   * @name validateFromHeaders
   * @description Validates remote access through the configured authentication strategy.
   */
  public validateFromHeaders(headers: IncomingHttpHeaders): AuthResult {
    if (this.publicAccess) {
      return { success: true, userId: 'anonymous' };
    }

    const authHeader = headers.authorization;
    if (!authHeader) {
      return { success: false, error: 'Missing authorization header' };
    }

    const [scheme, credentials] = authHeader.split(/\s+/, 2);
    if (scheme !== 'Bearer' || !credentials) {
      return { success: false, error: 'Unsupported auth type' };
    }

    if (this.apiKeyAuth) {
      return this.apiKeyAuth.validate(credentials);
    }
    if (this.jwtAuth) {
      return this.jwtAuth.validate(credentials);
    }

    return { success: false, error: 'No authentication method configured' };
  }
}
