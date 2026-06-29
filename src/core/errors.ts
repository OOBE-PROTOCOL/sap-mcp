/**
 * Custom error classes for SAP MCP Server
 * 
 * Provides structured error handling with:
 * - Error codes for programmatic handling
 * - Context metadata for debugging
 * - User-friendly messages
 * - Stack trace preservation
 */

/**
 * Base error class for all SAP MCP errors
 */
export class SapMcpError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, unknown>;
  public readonly cause?: Error;

  constructor(
    message: string,
    code: string,
    contextOrCause?: Record<string, unknown> | Error,
    cause?: Error
  ) {
    super(message);
    this.name = 'SapMcpError';
    this.code = code;
    
    // Handle both (message, code, context, cause) and (message, code, cause) signatures
    if (contextOrCause instanceof Error) {
      this.cause = contextOrCause;
    } else {
      this.context = contextOrCause;
      this.cause = cause;
    }

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SapMcpError);
    }
  }

  toJSON(): object {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      stack: this.stack,
      cause: this.cause?.message,
    };
  }
}

/**
 * Configuration errors
 */
export class ConfigError extends SapMcpError {
  constructor(message: string, context?: Record<string, unknown>, cause?: Error) {
    super(message, 'CONFIG_ERROR', context, cause);
    this.name = 'ConfigError';
  }
}

/**
 * Configuration validation errors
 */
export class ConfigValidationError extends ConfigError {
  constructor(field: string, value: unknown, expected: string) {
    super(`Invalid config value for '${field}': expected ${expected}`, { field, value });
    this.name = 'ConfigValidationError';
  }
}

/**
 * Configuration approval required
 */
export class ConfigApprovalRequiredError extends ConfigError {
  constructor(field: string, changeId: string) {
    super(`Configuration change requires approval: ${field}`, { field, changeId });
    this.name = 'ConfigApprovalRequiredError';
  }
}

/**
 * Session errors
 */
export class SessionError extends SapMcpError {
  constructor(message: string, context?: Record<string, unknown>, cause?: Error) {
    super(message, 'SESSION_ERROR', context, cause);
    this.name = 'SessionError';
  }
}

/**
 * Session not found
 */
export class SessionNotFoundError extends SessionError {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`, { sessionId });
    this.name = 'SessionNotFoundError';
  }
}

/**
 * Session expired
 */
export class SessionExpiredError extends SessionError {
  constructor(sessionId: string) {
    super(`Session expired: ${sessionId}`, { sessionId });
    this.name = 'SessionExpiredError';
  }
}

/**
 * Session permission denied
 */
export class SessionPermissionError extends SessionError {
  constructor(sessionId: string, requiredPermission: string) {
    super(
      `Session lacks required permission: ${requiredPermission}`,
      { sessionId, requiredPermission }
    );
    this.name = 'SessionPermissionError';
  }
}

/**
 * Transaction errors
 */
export class TransactionError extends SapMcpError {
  constructor(message: string, context?: Record<string, unknown>, cause?: Error) {
    super(message, 'TRANSACTION_ERROR', context, cause);
    this.name = 'TransactionError';
  }
}

/**
 * Transaction build failed
 */
export class TransactionBuildError extends TransactionError {
  constructor(instructionType: string, cause: Error) {
    super(`Failed to build transaction: ${instructionType}`, { instructionType }, cause);
    this.name = 'TransactionBuildError';
  }
}

/**
 * Transaction simulation failed
 */
export class TransactionSimulationError extends TransactionError {
  constructor(signature: string, logs: string[]) {
    super(`Transaction simulation failed`, { signature, logs: logs.slice(-5) });
    this.name = 'TransactionSimulationError';
  }
}

/**
 * Transaction submission failed
 */
export class TransactionSubmissionError extends TransactionError {
  constructor(cause: Error, signature?: string) {
    super(`Failed to submit transaction`, { signature }, cause);
    this.name = 'TransactionSubmissionError';
  }
}

/**
 * Transaction confirmation timeout
 */
export class TransactionConfirmationTimeoutError extends TransactionError {
  constructor(signature: string, timeoutMs: number) {
    super(
      `Transaction confirmation timeout after ${timeoutMs}ms`,
      { signature, timeoutMs }
    );
    this.name = 'TransactionConfirmationTimeoutError';
  }
}

/**
 * Tool execution errors
 */
export class ToolError extends SapMcpError {
  constructor(message: string, context?: Record<string, unknown>, cause?: Error) {
    super(message, 'TOOL_ERROR', context, cause);
    this.name = 'ToolError';
  }
}

/**
 * Tool not found
 */
export class ToolNotFoundError extends ToolError {
  constructor(toolName: string) {
    super(`Tool not found: ${toolName}`, { toolName });
    this.name = 'ToolNotFoundError';
  }
}

/**
 * Tool permission denied
 */
export class ToolPermissionError extends ToolError {
  constructor(toolName: string, reason: string) {
    super(`Tool execution denied: ${reason}`, { toolName, reason });
    this.name = 'ToolPermissionError';
  }
}

/**
 * Security guard errors
 */
export class SecurityError extends SapMcpError {
  constructor(message: string, context?: Record<string, unknown>, cause?: Error) {
    super(message, 'SECURITY_ERROR', context, cause);
    this.name = 'SecurityError';
  }
}

/**
 * Unsafe action detected
 */
export class UnsafeActionError extends SecurityError {
  constructor(action: string, reason: string, riskLevel: 'low' | 'medium' | 'high' | 'critical') {
    super(`Unsafe action blocked: ${reason}`, { action, reason, riskLevel });
    this.name = 'UnsafeActionError';
  }
}

/**
 * Spending limit exceeded
 */
export class SpendingLimitError extends SapMcpError {
  constructor(
    message: string,
    limitSol: number,
    requestedSol: number,
    limitType: 'transaction' | 'daily' | 'session'
  ) {
    super(message, 'SPENDING_LIMIT_ERROR', {
      limitSol,
      requestedSol,
      limitType,
    });
    this.name = 'SpendingLimitError';
  }
}

/**
 * RPC errors
 */
export class RpcError extends SapMcpError {
  constructor(message: string, context?: Record<string, unknown>, cause?: Error) {
    super(message, 'RPC_ERROR', context, cause);
    this.name = 'RpcError';
  }
}

/**
 * RPC timeout
 */
export class RpcTimeoutError extends RpcError {
  constructor(method: string, timeoutMs: number) {
    super(`RPC call timeout after ${timeoutMs}ms: ${method}`, { method, timeoutMs });
    this.name = 'RpcTimeoutError';
  }
}

/**
 * Client SDK errors
 */
export class ClientSdkError extends SapMcpError {
  constructor(message: string, causeOrContext?: Error | Record<string, unknown>) {
    if (causeOrContext instanceof Error) {
      super(message, 'CLIENT_SDK_ERROR', undefined, causeOrContext);
    } else {
      super(message, 'CLIENT_SDK_ERROR', causeOrContext);
    }
    this.name = 'ClientSdkError';
  }
}

/**
 * Execution errors
 */
export class ExecutionError extends SapMcpError {
  constructor(message: string, causeOrContext?: Error | Record<string, unknown>) {
    if (causeOrContext instanceof Error) {
      super(message, 'EXECUTION_ERROR', undefined, causeOrContext);
    } else {
      super(message, 'EXECUTION_ERROR', causeOrContext);
    }
    this.name = 'ExecutionError';
  }
}

/**
 * SAP Client errors
 */
export class SapClientError extends SapMcpError {
  constructor(message: string, causeOrContext?: Error | Record<string, unknown>) {
    if (causeOrContext instanceof Error) {
      super(message, 'SAP_CLIENT_ERROR', undefined, causeOrContext);
    } else {
      super(message, 'SAP_CLIENT_ERROR', causeOrContext);
    }
    this.name = 'SapClientError';
  }
}

/**
 * SAP SDK errors
 */
export class SapSdkError extends SapMcpError {
  constructor(message: string, causeOrContext?: Error | Record<string, unknown>) {
    if (causeOrContext instanceof Error) {
      super(message, 'SAP_SDK_ERROR', undefined, causeOrContext);
    } else {
      super(message, 'SAP_SDK_ERROR', causeOrContext);
    }
    this.name = 'SapSdkError';
  }
}

/**
 * Signer errors
 */
export class SignerError extends SapMcpError {
  constructor(message: string, causeOrContext?: Error | Record<string, unknown>) {
    if (causeOrContext instanceof Error) {
      super(message, 'SIGNER_ERROR', undefined, causeOrContext);
    } else {
      super(message, 'SIGNER_ERROR', causeOrContext);
    }
    this.name = 'SignerError';
  }
}

/**
 * Policy errors
 */
export class PolicyError extends SapMcpError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'POLICY_ERROR', context);
    this.name = 'PolicyError';
  }
}

/**
 * Error type guard
 */
export function isSapMcpError(error: unknown): error is SapMcpError {
  return error instanceof SapMcpError;
}

/**
 * Extract error code from an arbitrary error
 */
export function getErrorCode(error: unknown): string {
  if (isSapMcpError(error)) {
    return error.code;
  }
  if (error instanceof Error) {
    return 'UNKNOWN_ERROR';
  }
  return 'UNKNOWN_ERROR';
}

/**
 * Format error for logging
 */
export function formatError(error: unknown): string {
  if (isSapMcpError(error)) {
    return JSON.stringify(error.toJSON(), null, 2);
  }
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack}`;
  }
  return String(error);
}
