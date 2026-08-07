import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PaymentBridgeLockError,
  acquirePaymentBridgeProcessLock,
  getPaymentBridgeLockPath,
  releasePaymentBridgeProcessLock,
  resolvePaymentBridgeRuntimeId,
  type PaymentBridgeLockRecord,
} from './payment-bridge-process.js';
import { MCP_SERVER_VERSION } from '../core/constants.js';

const ORIGINAL_ENV = { ...process.env };
let tempDir: string | undefined;

function writeLock(record: PaymentBridgeLockRecord): void {
  mkdirSync(dirname(record.lockPath), { recursive: true, mode: 0o700 });
  writeFileSync(record.lockPath, `${JSON.stringify(record, null, 2)}\n`, 'utf-8');
}

describe('payment bridge process guard', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(`${tmpdir()}/sap-mcp-bridge-test-`);
    process.env = {
      ...ORIGINAL_ENV,
      XDG_DATA_HOME: tempDir,
      SAP_MCP_PAYMENTS_BRIDGE_ONLY: 'true',
      SAP_MCP_PROFILE: 'test-profile',
      SAP_MCP_RUNTIME_ID: 'test-runtime',
    };
  });

  afterEach(() => {
    releasePaymentBridgeProcessLock();
    process.env = { ...ORIGINAL_ENV };
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('uses a stable fallback runtime id instead of parent pid churn', () => {
    delete process.env.SAP_MCP_RUNTIME_ID;
    delete process.env.SAP_MCP_CLIENT_ID;
    delete process.env.MCP_RUNTIME_ID;

    expect(resolvePaymentBridgeRuntimeId()).toBe('default-runtime');
  });

  it('blocks a second live bridge for the same profile and runtime', () => {
    const lockPath = getPaymentBridgeLockPath('test-profile', 'test-runtime');
    writeLock({
      pid: process.ppid || 1,
      ppid: process.pid,
      profileName: 'test-profile',
      runtimeId: 'test-runtime',
      version: MCP_SERVER_VERSION,
      createdAt: new Date().toISOString(),
      lockPath,
    });

    expect(() => acquirePaymentBridgeProcessLock()).toThrow(PaymentBridgeLockError);
  });

  it('replaces a live child lock when the original parent runtime is gone', () => {
    const lockPath = getPaymentBridgeLockPath('test-profile', 'test-runtime');
    writeLock({
      pid: process.ppid || 1,
      ppid: 999_999_999,
      profileName: 'test-profile',
      runtimeId: 'test-runtime',
      version: MCP_SERVER_VERSION,
      createdAt: new Date().toISOString(),
      lockPath,
    });

    const lock = acquirePaymentBridgeProcessLock();

    expect(lock?.pid).toBe(process.pid);
    expect(lock?.runtimeId).toBe('test-runtime');
  });
});
