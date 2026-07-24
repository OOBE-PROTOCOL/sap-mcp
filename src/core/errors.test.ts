import { describe, expect, it } from 'vitest';
import {
  SapMcpError,
  ConfigError,
  ConfigValidationError,
  ConfigApprovalRequiredError,
  SessionError,
  SessionNotFoundError,
  SessionExpiredError,
  SessionPermissionError,
  TransactionError,
  TransactionBuildError,
  TransactionSimulationError,
  TransactionSubmissionError,
  TransactionConfirmationTimeoutError,
  ToolError,
  ToolNotFoundError,
  ToolPermissionError,
  SecurityError,
  UnsafeActionError,
  SpendingLimitError,
  RpcError,
  RpcTimeoutError,
  ClientSdkError,
  ExecutionError,
  SapClientError,
  SapSdkError,
  SignerError,
  PolicyError,
  isSapMcpError,
  getErrorCode,
  formatError,
} from './errors.js';

describe('SapMcpError', () => {
  it('constructs with message and code', () => {
    const error = new SapMcpError('something failed', 'CUSTOM_CODE');
    expect(error.message).toBe('something failed');
    expect(error.code).toBe('CUSTOM_CODE');
    expect(error.name).toBe('SapMcpError');
  });

  it('extends Error', () => {
    const error = new SapMcpError('msg', 'CODE');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SapMcpError);
  });

  it('stores context metadata when provided', () => {
    const context = { field: 'mode', value: 'bad' };
    const error = new SapMcpError('msg', 'CODE', context);
    expect(error.context).toEqual(context);
    expect(error.cause).toBeUndefined();
  });

  it('stores cause when an Error is passed as third argument', () => {
    const cause = new Error('root cause');
    const error = new SapMcpError('msg', 'CODE', cause);
    expect(error.cause).toBe(cause);
    expect(error.context).toBeUndefined();
  });

  it('stores both context and cause when all four arguments are provided', () => {
    const context = { step: 'init' };
    const cause = new Error('inner');
    const error = new SapMcpError('msg', 'CODE', context, cause);
    expect(error.context).toEqual(context);
    expect(error.cause).toBe(cause);
  });

  it('toJSON() serializes name, code, message, context, and cause', () => {
    const cause = new Error('inner');
    const error = new SapMcpError('outer', 'CODE', { key: 'val' }, cause);
    const json = error.toJSON() as Record<string, unknown>;
    expect(json.name).toBe('SapMcpError');
    expect(json.code).toBe('CODE');
    expect(json.message).toBe('outer');
    expect(json.context).toEqual({ key: 'val' });
    expect(json.cause).toBe('inner');
    expect(json.stack).toBeDefined();
  });
});

describe('ConfigError hierarchy', () => {
  it('ConfigError has code CONFIG_ERROR and extends SapMcpError', () => {
    const error = new ConfigError('bad config');
    expect(error).toBeInstanceOf(SapMcpError);
    expect(error.code).toBe('CONFIG_ERROR');
    expect(error.name).toBe('ConfigError');
    expect(error.message).toBe('bad config');
  });

  it('ConfigValidationError extends ConfigError and carries field/value context', () => {
    const error = new ConfigValidationError('rpcUrl', 'not-a-url', 'a valid URL');
    expect(error).toBeInstanceOf(ConfigError);
    expect(error.name).toBe('ConfigValidationError');
    expect(error.code).toBe('CONFIG_ERROR');
    expect(error.message).toContain("rpcUrl");
    expect(error.context).toEqual({ field: 'rpcUrl', value: 'not-a-url' });
  });

  it('ConfigApprovalRequiredError extends ConfigError and carries field/changeId', () => {
    const error = new ConfigApprovalRequiredError('maxTxValueSol', 'change-123');
    expect(error).toBeInstanceOf(ConfigError);
    expect(error.name).toBe('ConfigApprovalRequiredError');
    expect(error.context).toEqual({ field: 'maxTxValueSol', changeId: 'change-123' });
  });
});

describe('SessionError hierarchy', () => {
  it('SessionError has code SESSION_ERROR', () => {
    const error = new SessionError('session issue');
    expect(error).toBeInstanceOf(SapMcpError);
    expect(error.code).toBe('SESSION_ERROR');
    expect(error.name).toBe('SessionError');
  });

  it('SessionNotFoundError includes sessionId in context and message', () => {
    const error = new SessionNotFoundError('sess-42');
    expect(error).toBeInstanceOf(SessionError);
    expect(error.name).toBe('SessionNotFoundError');
    expect(error.message).toContain('sess-42');
    expect(error.context).toEqual({ sessionId: 'sess-42' });
  });

  it('SessionExpiredError includes sessionId in context', () => {
    const error = new SessionExpiredError('sess-99');
    expect(error).toBeInstanceOf(SessionError);
    expect(error.name).toBe('SessionExpiredError');
    expect(error.context).toEqual({ sessionId: 'sess-99' });
  });

  it('SessionPermissionError includes sessionId and requiredPermission', () => {
    const error = new SessionPermissionError('sess-1', 'transaction:submit');
    expect(error).toBeInstanceOf(SessionError);
    expect(error.name).toBe('SessionPermissionError');
    expect(error.context).toEqual({ sessionId: 'sess-1', requiredPermission: 'transaction:submit' });
  });
});

describe('TransactionError hierarchy', () => {
  it('TransactionError has code TRANSACTION_ERROR', () => {
    const error = new TransactionError('tx failed');
    expect(error).toBeInstanceOf(SapMcpError);
    expect(error.code).toBe('TRANSACTION_ERROR');
    expect(error.name).toBe('TransactionError');
  });

  it('TransactionBuildError includes instructionType and cause', () => {
    const cause = new Error('anchor error');
    const error = new TransactionBuildError('createEscrow', cause);
    expect(error).toBeInstanceOf(TransactionError);
    expect(error.name).toBe('TransactionBuildError');
    expect(error.cause).toBe(cause);
    expect(error.context).toEqual({ instructionType: 'createEscrow' });
  });

  it('TransactionSimulationError truncates logs to last 5', () => {
    const logs = ['log-1', 'log-2', 'log-3', 'log-4', 'log-5', 'log-6', 'log-7'];
    const error = new TransactionSimulationError('sig-abc', logs);
    expect(error).toBeInstanceOf(TransactionError);
    expect(error.name).toBe('TransactionSimulationError');
    expect(error.context).toEqual({ signature: 'sig-abc', logs: ['log-3', 'log-4', 'log-5', 'log-6', 'log-7'] });
  });

  it('TransactionSubmissionError stores cause and optional signature', () => {
    const cause = new Error('network');
    const error = new TransactionSubmissionError(cause, 'sig-xyz');
    expect(error).toBeInstanceOf(TransactionError);
    expect(error.name).toBe('TransactionSubmissionError');
    expect(error.cause).toBe(cause);
    expect(error.context).toEqual({ signature: 'sig-xyz' });
  });

  it('TransactionConfirmationTimeoutError includes signature and timeoutMs', () => {
    const error = new TransactionConfirmationTimeoutError('sig-timeout', 5000);
    expect(error).toBeInstanceOf(TransactionError);
    expect(error.name).toBe('TransactionConfirmationTimeoutError');
    expect(error.context).toEqual({ signature: 'sig-timeout', timeoutMs: 5000 });
  });
});

describe('ToolError hierarchy', () => {
  it('ToolError has code TOOL_ERROR', () => {
    const error = new ToolError('tool broke');
    expect(error).toBeInstanceOf(SapMcpError);
    expect(error.code).toBe('TOOL_ERROR');
    expect(error.name).toBe('ToolError');
  });

  it('ToolNotFoundError includes toolName in context and message', () => {
    const error = new ToolNotFoundError('sap_register_agent');
    expect(error).toBeInstanceOf(ToolError);
    expect(error.name).toBe('ToolNotFoundError');
    expect(error.message).toContain('sap_register_agent');
    expect(error.context).toEqual({ toolName: 'sap_register_agent' });
  });

  it('ToolPermissionError includes toolName and reason', () => {
    const error = new ToolPermissionError('sap_sign_transaction', 'not allowed');
    expect(error).toBeInstanceOf(ToolError);
    expect(error.name).toBe('ToolPermissionError');
    expect(error.context).toEqual({ toolName: 'sap_sign_transaction', reason: 'not allowed' });
  });
});

describe('SecurityError hierarchy', () => {
  it('SecurityError has code SECURITY_ERROR', () => {
    const error = new SecurityError('unsafe');
    expect(error).toBeInstanceOf(SapMcpError);
    expect(error.code).toBe('SECURITY_ERROR');
    expect(error.name).toBe('SecurityError');
  });

  it('UnsafeActionError extends SecurityError with action, reason, riskLevel', () => {
    const error = new UnsafeActionError('delete-keypair', 'destructive', 'critical');
    expect(error).toBeInstanceOf(SecurityError);
    expect(error.name).toBe('UnsafeActionError');
    expect(error.context).toEqual({ action: 'delete-keypair', reason: 'destructive', riskLevel: 'critical' });
  });
});

describe('SpendingLimitError', () => {
  it('has code SPENDING_LIMIT_ERROR with limit context', () => {
    const error = new SpendingLimitError('limit exceeded', 5, 10, 'transaction');
    expect(error).toBeInstanceOf(SapMcpError);
    expect(error.code).toBe('SPENDING_LIMIT_ERROR');
    expect(error.name).toBe('SpendingLimitError');
    expect(error.context).toEqual({ limitSol: 5, requestedSol: 10, limitType: 'transaction' });
  });
});

describe('RpcError hierarchy', () => {
  it('RpcError has code RPC_ERROR', () => {
    const error = new RpcError('rpc failed');
    expect(error).toBeInstanceOf(SapMcpError);
    expect(error.code).toBe('RPC_ERROR');
    expect(error.name).toBe('RpcError');
  });

  it('RpcTimeoutError includes method and timeoutMs', () => {
    const error = new RpcTimeoutError('getAccountInfo', 3000);
    expect(error).toBeInstanceOf(RpcError);
    expect(error.name).toBe('RpcTimeoutError');
    expect(error.context).toEqual({ method: 'getAccountInfo', timeoutMs: 3000 });
  });
});

describe('dual-signature error classes', () => {
  it.each([
    ['ClientSdkError', ClientSdkError, 'CLIENT_SDK_ERROR'],
    ['ExecutionError', ExecutionError, 'EXECUTION_ERROR'],
    ['SapClientError', SapClientError, 'SAP_CLIENT_ERROR'],
    ['SapSdkError', SapSdkError, 'SAP_SDK_ERROR'],
    ['SignerError', SignerError, 'SIGNER_ERROR'],
  ])('%s has correct code and extends SapMcpError', (_label, ErrorClass, code) => {
    const error = new ErrorClass('test message');
    expect(error).toBeInstanceOf(SapMcpError);
    expect(error.code).toBe(code);
    expect(error.message).toBe('test message');
  });

  it('ClientSdkError stores cause when an Error is provided', () => {
    const cause = new Error('sdk internal');
    const error = new ClientSdkError('wrapper', cause);
    expect(error.cause).toBe(cause);
    expect(error.context).toBeUndefined();
  });

  it('ExecutionError stores context when a plain object is provided', () => {
    const error = new ExecutionError('exec failed', { step: 'build' });
    expect(error.context).toEqual({ step: 'build' });
    expect(error.cause).toBeUndefined();
  });
});

describe('PolicyError', () => {
  it('has code POLICY_ERROR and extends SapMcpError', () => {
    const error = new PolicyError('policy violation', { rule: 'deny' });
    expect(error).toBeInstanceOf(SapMcpError);
    expect(error.code).toBe('POLICY_ERROR');
    expect(error.name).toBe('PolicyError');
    expect(error.context).toEqual({ rule: 'deny' });
  });
});

describe('isSapMcpError()', () => {
  it('returns true for SapMcpError instances', () => {
    expect(isSapMcpError(new SapMcpError('msg', 'CODE'))).toBe(true);
    expect(isSapMcpError(new ConfigError('msg'))).toBe(true);
  });

  it('returns false for plain Error and non-error values', () => {
    expect(isSapMcpError(new Error('plain'))).toBe(false);
    expect(isSapMcpError('string')).toBe(false);
    expect(isSapMcpError(null)).toBe(false);
    expect(isSapMcpError(undefined)).toBe(false);
    expect(isSapMcpError({ code: 'x' })).toBe(false);
  });
});

describe('getErrorCode()', () => {
  it('returns the code from a SapMcpError', () => {
    expect(getErrorCode(new ConfigError('msg'))).toBe('CONFIG_ERROR');
    expect(getErrorCode(new SessionError('msg'))).toBe('SESSION_ERROR');
  });

  it('returns UNKNOWN_ERROR for a plain Error', () => {
    expect(getErrorCode(new Error('plain'))).toBe('UNKNOWN_ERROR');
  });

  it('returns UNKNOWN_ERROR for non-Error values', () => {
    expect(getErrorCode('string')).toBe('UNKNOWN_ERROR');
    expect(getErrorCode(null)).toBe('UNKNOWN_ERROR');
    expect(getErrorCode({ code: 'x' })).toBe('UNKNOWN_ERROR');
  });
});

describe('formatError()', () => {
  it('serializes SapMcpError via toJSON()', () => {
    const error = new ConfigError('bad', { field: 'mode' });
    const formatted = formatError(error);
    const parsed = JSON.parse(formatted);
    expect(parsed.code).toBe('CONFIG_ERROR');
    expect(parsed.message).toBe('bad');
    expect(parsed.context).toEqual({ field: 'mode' });
  });

  it('formats plain Error with name, message, and stack', () => {
    const error = new Error('plain error');
    const formatted = formatError(error);
    expect(formatted).toContain('Error: plain error');
    expect(formatted).toContain('at ');
  });

  it('stringifies non-Error values', () => {
    expect(formatError('a string')).toBe('a string');
    expect(formatError(42)).toBe('42');
    expect(formatError({ key: 'val' })).toBe('[object Object]');
  });
});