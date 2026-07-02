import { homedir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { buildWizardConfig, type WizardSetupInput } from './setup.js';

function wizardInput(overrides: Partial<WizardSetupInput> = {}): WizardSetupInput {
  return {
    profileName: 'gianni-market-nft-agent',
    mode: 'local-dev-keypair',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    walletPath: '~/sap-agent.json',
    createNewWallet: false,
    maxTxValueSol: 1,
    dailyLimitSol: 10,
    enableBento: false,
    logLevel: 'info',
    enableMetrics: false,
    ...overrides,
  };
}

describe('wizard setup validation', () => {
  it('rejects default profile names from the wizard path', () => {
    expect(() => buildWizardConfig(wizardInput({ profileName: 'default' })))
      .toThrow('requires a named profile');
  });

  it('rejects ambiguous profile names', () => {
    expect(() => buildWizardConfig(wizardInput({ profileName: 'bad--profile' })))
      .toThrow('single hyphens');
  });

  it('expands home-relative wallet paths before saving config', () => {
    const config = buildWizardConfig(wizardInput());

    expect(config.walletPath).toBe(join(homedir(), 'sap-agent.json'));
  });

  it('keeps hosted user profiles on remote MCP without enabling a local HTTP server', () => {
    const config = buildWizardConfig(wizardInput({
      mode: 'hosted-api',
      walletPath: '~/hosted-agent.json',
    }));

    expect(config.enableHttp).toBe(false);
    expect(config.walletPath).toBe(join(homedir(), 'hosted-agent.json'));
  });

  it('supports hosted user profiles backed by an external signer', () => {
    const config = buildWizardConfig(wizardInput({
      mode: 'hosted-api',
      walletPath: undefined,
      externalSignerUrl: 'http://localhost:8080/sign',
    }));

    expect(config.enableHttp).toBe(false);
    expect(config.walletPath).toBeUndefined();
    expect(config.externalSignerUrl).toBe('http://localhost:8080/sign');
  });
});
