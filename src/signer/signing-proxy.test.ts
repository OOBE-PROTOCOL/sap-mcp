import { mkdirSync, writeFileSync } from 'fs';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Keypair } from '@solana/web3.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
const originalSigningAuthToken = process.env.SAP_SIGNING_AUTH_TOKEN;
const originalSigningProxyPort = process.env.SAP_SIGNING_PROXY_PORT;

async function importSigningProxyWithConfigRoot(configRoot: string): Promise<typeof import('./signing-proxy.js')> {
  vi.resetModules();
  process.env.XDG_CONFIG_HOME = configRoot;
  return import('./signing-proxy.js');
}

afterEach(() => {
  vi.resetModules();
  if (originalXdgConfigHome === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
  }
  if (originalSigningAuthToken === undefined) {
    delete process.env.SAP_SIGNING_AUTH_TOKEN;
  } else {
    process.env.SAP_SIGNING_AUTH_TOKEN = originalSigningAuthToken;
  }
  if (originalSigningProxyPort === undefined) {
    delete process.env.SAP_SIGNING_PROXY_PORT;
  } else {
    process.env.SAP_SIGNING_PROXY_PORT = originalSigningProxyPort;
  }
});

describe('signing proxy keypair resolution', () => {
  it('loads canonical SAP MCP keypairs from ~/.config/mcp-sap/keypairs', async () => {
    const configRoot = await mkdtemp(join(tmpdir(), 'sap-mcp-signing-'));
    const keypairsDir = join(configRoot, 'mcp-sap', 'keypairs');
    mkdirSync(keypairsDir, { recursive: true });

    const keypair = Keypair.generate();
    writeFileSync(
      join(keypairsDir, 'operator-keypair.json'),
      JSON.stringify(Array.from(keypair.secretKey)),
      'utf-8',
    );

    const { loadAgentKeyfile, resolveAgentKeyfilePath } = await importSigningProxyWithConfigRoot(configRoot);

    expect(resolveAgentKeyfilePath('operator')).toBe(join(keypairsDir, 'operator-keypair.json'));
    expect(loadAgentKeyfile('operator').publicKey.toBase58()).toBe(keypair.publicKey.toBase58());
  });

  it('does not fall back to the legacy agents directory', async () => {
    const configRoot = await mkdtemp(join(tmpdir(), 'sap-mcp-signing-legacy-'));
    const legacyAgentsDir = join(configRoot, 'mcp-sap', 'agents');
    mkdirSync(legacyAgentsDir, { recursive: true });
    writeFileSync(
      join(legacyAgentsDir, 'legacy.json'),
      JSON.stringify(Array.from(Keypair.generate().secretKey)),
      'utf-8',
    );

    const { resolveAgentKeyfilePath } = await importSigningProxyWithConfigRoot(configRoot);

    expect(() => resolveAgentKeyfilePath('legacy')).toThrow('canonical keypair');
  });

  it('can start from environment-only signing proxy config without requiring config.json', async () => {
    const configRoot = await mkdtemp(join(tmpdir(), 'sap-mcp-signing-env-'));
    process.env.SAP_SIGNING_AUTH_TOKEN = 'local-token';
    process.env.SAP_SIGNING_PROXY_PORT = '9876';

    const { loadSigningConfig } = await importSigningProxyWithConfigRoot(configRoot);

    expect(loadSigningConfig()).toEqual({
      authToken: 'local-token',
      port: 9876,
    });
  });
});
