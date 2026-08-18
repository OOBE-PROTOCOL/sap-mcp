import { describe, expect, it } from 'vitest';
import { buildDoctorReport } from './runtime-doctor.js';
import { fullConfigSchema, type FullConfig } from './secure-config.js';

function config(overrides: Partial<FullConfig> = {}): FullConfig {
  return fullConfigSchema.parse({
    rpcUrl: 'https://rpc.oobe.example',
    maxTxValueSol: 1,
    dailyLimitSol: 5,
    requireApprovalAboveSol: 0.5,
    ...overrides,
  });
}

function report(overrides: Partial<FullConfig> = {}, walletExists = false) {
  return buildDoctorReport({
    config: config(overrides),
    profileName: 'test-agent',
    configPath: '/tmp/mcp-sap/profiles/test-agent/config.json',
    configRoot: '/tmp/mcp-sap',
    walletExists,
  });
}

function checkStatus(reportValue: ReturnType<typeof report>, id: string) {
  return reportValue.checks.find((check) => check.id === id)?.status;
}

describe('runtime doctor report', () => {
  it('keeps a read-only hosted discovery profile warning-only when no wallet exists', () => {
    const result = report({ mode: 'readonly', walletPath: undefined, agentPubkey: undefined });

    expect(result.status).toBe('warning');
    expect(result.summary.fail).toBe(0);
    expect(checkStatus(result, 'wallet-path')).toBe('warning');
    expect(checkStatus(result, 'paid-write-readiness')).toBe('warning');
  });

  it('fails local-dev-keypair profiles when the configured wallet is missing', () => {
    const result = report({
      mode: 'local-dev-keypair',
      walletPath: '/tmp/missing-wallet.json',
      agentPubkey: 'Agent111111111111111111111111111111111111',
    }, false);

    expect(result.status).toBe('fail');
    expect(checkStatus(result, 'wallet-path')).toBe('fail');
    expect(checkStatus(result, 'runtime-mode')).toBe('warning');
  });

  it('passes local signing checks when the wallet exists and storage is encrypted', () => {
    const result = report({
      mode: 'local-dev-keypair',
      walletPath: '/tmp/agent-wallet.json',
      walletEncrypted: true,
      agentPubkey: 'Agent111111111111111111111111111111111111',
    }, true);

    expect(checkStatus(result, 'wallet-path')).toBe('pass');
    expect(checkStatus(result, 'wallet-storage')).toBe('pass');
    expect(checkStatus(result, 'paid-write-readiness')).toBe('pass');
    expect(result.summary.fail).toBe(0);
  });

  it('does not require a local wallet file for external signer profiles', () => {
    const result = report({
      mode: 'external-signer',
      walletPath: undefined,
      externalSignerUrl: 'http://127.0.0.1:8789',
      agentPubkey: 'Agent111111111111111111111111111111111111',
    });

    expect(result.summary.fail).toBe(0);
    expect(checkStatus(result, 'runtime-mode')).toBe('pass');
    expect(checkStatus(result, 'wallet-storage')).toBe('pass');
  });
});
