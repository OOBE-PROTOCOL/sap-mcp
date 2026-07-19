import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
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
      expect(result.readiness.status).toBe('ready');
      expect(result.readiness.profileIssues).toEqual([]);
      expect(result.readiness.runtimeIssues).toEqual([]);

      const profiles = getDesktopProfileStatuses(homeDir, 'darwin');
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

  it('reports stale active profiles with missing wallet paths as needs attention', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'sap-mcp-desktop-home-'));
    const configDir = join(homeDir, '.config', 'mcp-sap');
    mkdirSync(configDir, { recursive: true });
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.APPDATA;
    writeFileSync(join(configDir, '.active-profile'), 'stevier', 'utf-8');
    writeFileSync(join(configDir, 'config-stevier.json'), JSON.stringify({
      mode: 'hosted-api',
      rpcUrl: 'https://api.mainnet-beta.solana.com',
      walletPath: join(homeDir, '.config', 'mcp-sap', 'keypairs', 'missing.json'),
      agentPubkey: '11111111111111111111111111111111',
    }), 'utf-8');

    try {
      const profiles = getDesktopProfileStatuses(homeDir, 'darwin');
      expect(profiles[0]).toMatchObject({
        name: 'stevier',
        active: true,
        readiness: 'needs-attention',
        walletExists: false,
      });
      expect(profiles[0]?.issues).toContain('Profile "stevier" points to a missing wallet file.');
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('reads Windows desktop profiles from AppData/Roaming/mcp-sap', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'sap-mcp-desktop-win-home-'));
    const configDir = join(homeDir, 'AppData', 'Roaming', 'mcp-sap');
    const walletPath = join(configDir, 'keypairs', 'windows-agent-keypair.json');
    mkdirSync(join(configDir, 'keypairs'), { recursive: true });
    writeFileSync(join(configDir, '.active-profile'), 'windows-agent', 'utf-8');
    writeFileSync(walletPath, JSON.stringify(new Array(64).fill(1)), 'utf-8');
    writeFileSync(join(configDir, 'config-windows-agent.json'), JSON.stringify({
      mode: 'hosted-api',
      rpcUrl: 'https://api.mainnet-beta.solana.com',
      walletPath,
      agentPubkey: '11111111111111111111111111111111',
    }), 'utf-8');

    try {
      delete process.env.XDG_CONFIG_HOME;
      delete process.env.APPDATA;

      const profiles = getDesktopProfileStatuses(homeDir, 'win32');
      expect(profiles[0]).toMatchObject({
        name: 'windows-agent',
        active: true,
        readiness: 'ready',
        walletExists: true,
      });
      expect(profiles[0]?.path).toBe(join(configDir, 'config-windows-agent.json'));
      expect(profiles[0]?.walletPath).toBe(walletPath);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('payment bridge repair on Windows writes Codex npx.cmd and AppData addon bundle', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'sap-mcp-desktop-win-home-'));
    try {
      delete process.env.XDG_CONFIG_HOME;
      delete process.env.APPDATA;

      const draft = {
        ...createDefaultDesktopWizardDraft(),
        setupMode: 'payments-only' as const,
        configureCodex: true,
        configureRuntimes: ['codex' as const],
        installAddonBundle: true,
      };

      const result = await saveDesktopWizardDraft(draft, homeDir, 'win32');
      const codexPath = join(homeDir, '.codex', 'config.toml');
      const addonPath = join(homeDir, 'AppData', 'Roaming', 'mcp-sap', 'addons', 'x402-paid-call');
      const codex = readFileSync(codexPath, 'utf-8');

      expect(codex).toContain('[mcp_servers.sap]');
      expect(codex).toContain('url = "https://mcp.sap.oobeprotocol.ai/mcp"');
      expect(codex).toContain('[mcp_servers.sap_payments]');
      expect(codex).toContain('command = "npx.cmd"');
      expect(codex).toContain('@oobe-protocol-labs/sap-mcp-server@0.9.12');
      expect(codex).toContain('SAP_ALLOWED_TOOLS = "all"');
      expect(existsSync(join(addonPath, 'manifest.json'))).toBe(true);
      expect(result.runtimeActions.some((action) => action.path === addonPath)).toBe(true);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });
});
