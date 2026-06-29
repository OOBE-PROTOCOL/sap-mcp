import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir, homedir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  defaultWalletPath,
  isValidProfileName,
  profileConfigPath,
  saveTuiWizardConfig,
  type TuiWizardConfig,
} from './wizard-save.js';

const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;

function tuiConfig(overrides: Partial<TuiWizardConfig> = {}): TuiWizardConfig {
  return {
    profileName: 'citizen-support-agent',
    mode: 'local-dev-keypair',
    rpcUrl: 'https://api.devnet.solana.com',
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

describe('TUI wizard save', () => {
  afterEach(() => {
    if (originalXdgConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    }
  });

  it('reserves default so the wizard cannot write config.json', () => {
    expect(isValidProfileName('default')).toBe(false);
    expect(() => saveTuiWizardConfig(tuiConfig({ profileName: 'default' })))
      .toThrow('cannot be "default"');
  });

  it('uses named profile config files for wizard-created profiles', () => {
    const configHome = mkdtempSync(join(tmpdir(), 'sap-mcp-tui-'));
    process.env.XDG_CONFIG_HOME = configHome;

    try {
      const result = saveTuiWizardConfig(tuiConfig());

      expect(result.configPath).toBe(join(configHome, 'mcp-sap', 'config-citizen-support-agent.json'));
      expect(profileConfigPath('citizen-support-agent')).toBe(result.configPath);
      expect(defaultWalletPath('citizen-support-agent')).toBe(join(configHome, 'mcp-sap', 'keypairs', 'citizen-support-agent-keypair.json'));
    } finally {
      rmSync(configHome, { recursive: true, force: true });
    }
  });

  it('expands home-relative imported wallet paths', () => {
    const configHome = mkdtempSync(join(tmpdir(), 'sap-mcp-tui-'));
    process.env.XDG_CONFIG_HOME = configHome;

    try {
      saveTuiWizardConfig(tuiConfig({ walletPath: '~/sap-agent.json' }));
      const configPath = join(configHome, 'mcp-sap', 'config-citizen-support-agent.json');
      const configText = readFileSync(configPath, 'utf-8');

      expect(JSON.parse(configText).walletPath).toBe(join(homedir(), 'sap-agent.json'));
    } finally {
      rmSync(configHome, { recursive: true, force: true });
    }
  });
});
