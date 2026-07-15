import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createDefaultDesktopWizardDraft,
  getDesktopProfileStatuses,
  saveDesktopWizardDraft,
  validateDesktopWizardDraft,
} from './desktop-flow.js';

const ORIGINAL_ENV = { ...process.env };

describe('desktop wizard flow', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('defaults to hosted SAP MCP plus the local payment bridge path', () => {
    const draft = createDefaultDesktopWizardDraft();

    expect(draft.mode).toBe('hosted-api');
    expect(draft.setupMode).toBe('full');
    expect(draft.createNewWallet).toBe(true);
    expect(draft.configureRuntimes).toContain('codex');
    expect(draft.installAddonBundle).toBe(true);
    expect(validateDesktopWizardDraft(draft)).toEqual([]);
  });

  it('full setup creates an active local profile and a Codex hosted sap_payments bridge', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'sap-mcp-desktop-home-'));
    process.env.HOME = homeDir;
    process.env.XDG_CONFIG_HOME = join(homeDir, '.config');
    process.env.XDG_DATA_HOME = join(homeDir, '.local', 'share');

    try {
      const draft = {
        ...createDefaultDesktopWizardDraft(),
        profileName: 'solking-agent',
        configureCodex: true,
        configureRuntimes: ['codex' as const],
        installAddonBundle: true,
      };

      const result = await saveDesktopWizardDraft(draft, homeDir, 'darwin');
      const activeProfilePath = join(homeDir, '.config', 'mcp-sap', '.active-profile');
      const configPath = join(homeDir, '.config', 'mcp-sap', 'config-solking-agent.json');
      const walletPath = join(homeDir, '.config', 'mcp-sap', 'keypairs', 'solking-agent-keypair.json');
      const codexPath = join(homeDir, '.codex', 'config.toml');
      const codex = readFileSync(codexPath, 'utf-8');

      expect(result.setup?.configPath).toBe(configPath);
      expect(readFileSync(activeProfilePath, 'utf-8')).toBe('solking-agent');
      expect(existsSync(walletPath)).toBe(true);
      expect(codex).toContain('[mcp_servers.sap]');
      expect(codex).toContain('url = "https://mcp.sap.oobeprotocol.ai/mcp"');
      expect(codex).toContain('[mcp_servers.sap_payments]');
      expect(codex).toContain('SAP_MCP_PAYMENTS_BRIDGE_ONLY = "true"');
      expect(codex).toContain('SAP_ALLOWED_TOOLS = "all"');
      expect(codex).not.toContain('mcp-remote');
      expect(result.runtimeActions.some((action) => action.runtime === 'Codex' && action.status === 'configured')).toBe(true);

      const profiles = getDesktopProfileStatuses(homeDir);
      expect(profiles[0]).toMatchObject({
        name: 'solking-agent',
        active: true,
        mode: 'hosted-api',
        network: 'mainnet-beta',
        walletExists: true,
      });
      expect(profiles[0]?.walletPath).toBe(walletPath);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });
});
