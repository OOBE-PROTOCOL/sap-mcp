/**
 * @file builtin-plugins.test.ts
 * @description Vitest suite for the premium builtin-plugins module.
 *
 * Verifies that `BUILTIN_PREMIUM_PLUGINS` contains one valid manifest,
 * that `listPremiumPlugins` returns clones and filters private plugins,
 * that `listPremiumCapabilities` filters by type, that `findPremiumCapability`
 * resolves valid and invalid ids, and that `publicPremiumProviderStatus`
 * returns env var names with boolean readiness values.
 *
 * @module premium/builtin-plugins.test
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BUILTIN_PREMIUM_PLUGINS,
  listPremiumPlugins,
  listPremiumCapabilities,
  findPremiumCapability,
  publicPremiumProviderStatus,
} from './builtin-plugins.js';
import { validatePremiumPluginManifest } from './plugin-validator.js';

const PREMIUM_ENV_VARS = [
  'SAP_MCP_ENABLE_PREMIUM_PLUGINS',
  'SAP_MCP_PLUGIN_DIR',
  'SAP_MCP_PREMIUM_EXPOSE_PRIVATE_DISCOVERY',
];

const PROVIDER_ENV_VARS = [
  'SAP_MCP_PREMIUM_JUPITER_STREAM_URL',
  'SAP_MCP_PREMIUM_PYTH_STREAM_URL',
  'SAP_MCP_PREMIUM_WEBHOOK_SIGNER',
  'SAP_MCP_PREMIUM_DEXSCREENER_API_URL',
  'SAP_MCP_PREMIUM_SOLANA_RPC_URL',
  'SAP_MCP_PREMIUM_GITHUB_API_URL',
  'SAP_MCP_PREMIUM_DEFILAMA_API_URL',
];

describe('premium builtin-plugins', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [...PREMIUM_ENV_VARS, ...PROVIDER_ENV_VARS]) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of [...PREMIUM_ENV_VARS, ...PROVIDER_ENV_VARS]) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  it('BUILTIN_PREMIUM_PLUGINS has exactly 1 core plugin', () => {
    expect(BUILTIN_PREMIUM_PLUGINS).toHaveLength(1);
  });

  it('every built-in manifest passes validatePremiumPluginManifest', () => {
    for (const manifest of BUILTIN_PREMIUM_PLUGINS) {
      const report = validatePremiumPluginManifest(manifest);
      expect(report.valid).toBe(true);
      expect(report.errors).toEqual([]);
    }
  });

  it('listPremiumPlugins returns clones — mutating the result does not affect internal state', () => {
    const first = listPremiumPlugins();
    const firstPlugin = first[0];
    if (firstPlugin) {
      firstPlugin.id = 'mutated-id';
      firstPlugin.capabilities[0].id = 'mutated-capability';
    }

    const second = listPremiumPlugins();
    expect(second[0]?.id).toBe(BUILTIN_PREMIUM_PLUGINS[0].id);
    expect(second[0]?.capabilities[0].id).toBe(BUILTIN_PREMIUM_PLUGINS[0].capabilities[0].id);
  });

  it('listPremiumPlugins filters private plugins when includePrivate=false', () => {
    const publicPlugins = listPremiumPlugins({ includePrivate: false });

    for (const plugin of publicPlugins) {
      expect(plugin.visibility).toBe('public');
    }

    // All 4 built-in plugins are public (1 core + 1 trading + 1 meme-radar + 1 tech-fundamentals).
    expect(publicPlugins).toHaveLength(4);
  });

  it('listPremiumPlugins includes private plugins when includePrivate=true', () => {
    const allPlugins = listPremiumPlugins({ includePrivate: true });

    expect(allPlugins).toHaveLength(4);
    expect(allPlugins.map(p => p.id).sort()).toEqual(
      [
        'sap-premium-market-data',
        'sap-premium-meme-radar',
        'sap-premium-tech-fundamentals',
        'sap-premium-trading-streams',
      ].sort(),
    );
  });

  it('deduplicates private manifests by plugin id when private discovery is enabled', () => {
    const root = mkdtempSync(join(tmpdir(), 'sap-premium-duplicate-'));
    try {
      mkdirSync(join(root, 'manifests'));
      const privateMarketData = structuredClone(BUILTIN_PREMIUM_PLUGINS[0]);
      privateMarketData.visibility = 'private';
      privateMarketData.title = 'Private Market Data Override';
      writeFileSync(
        join(root, 'manifests', 'sap-premium-market-data.json'),
        JSON.stringify(privateMarketData, null, 2),
      );

      process.env.SAP_MCP_ENABLE_PREMIUM_PLUGINS = 'true';
      process.env.SAP_MCP_PLUGIN_DIR = root;
      process.env.SAP_MCP_PREMIUM_EXPOSE_PRIVATE_DISCOVERY = 'true';

      const allPlugins = listPremiumPlugins({ includePrivate: true });
      const marketDataPlugins = allPlugins.filter(plugin => plugin.id === 'sap-premium-market-data');

      expect(marketDataPlugins).toHaveLength(1);
      expect(marketDataPlugins[0]?.title).toBe('Private Market Data Override');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('listPremiumCapabilities filters by type', () => {
    const streams = listPremiumCapabilities('stream');
    const webhooks = listPremiumCapabilities('webhook');

    for (const cap of streams) {
      expect(cap.type).toBe('stream');
    }
    for (const cap of webhooks) {
      expect(cap.type).toBe('webhook');
    }

    // Built-in plugins have 9 stream capabilities and 4 webhook capabilities.
    expect(streams.length).toBeGreaterThanOrEqual(9);
    expect(webhooks.length).toBeGreaterThanOrEqual(4);
  });

  it('findPremiumCapability returns {plugin, capability} for valid ids', () => {
    const resolved = findPremiumCapability(
      'sap-premium-market-data',
      'jupiter.quote.delta',
      'stream',
    );

    expect(resolved).not.toBeNull();
    expect(resolved?.plugin.id).toBe('sap-premium-market-data');
    expect(resolved?.capability.id).toBe('jupiter.quote.delta');
    expect(resolved?.capability.type).toBe('stream');
  });

  it('findPremiumCapability returns null for an unknown plugin id', () => {
    expect(findPremiumCapability('nonexistent', 'jupiter.quote.delta')).toBeNull();
  });

  it('findPremiumCapability returns null for an unknown capability id', () => {
    expect(findPremiumCapability('sap-premium-market-data', 'nonexistent.capability')).toBeNull();
  });

  it('findPremiumCapability returns null when the type filter does not match', () => {
    expect(
      findPremiumCapability('sap-premium-market-data', 'jupiter.quote.delta', 'webhook'),
    ).toBeNull();
  });

  it('publicPremiumProviderStatus returns env var names with boolean values', () => {
    const status = publicPremiumProviderStatus();

    // All known provider env var names should appear as keys.
    for (const envName of PROVIDER_ENV_VARS) {
      expect(status).toHaveProperty(envName);
      expect(typeof status[envName]).toBe('boolean');
    }

    // With no env vars set, all should be false.
    for (const envName of PROVIDER_ENV_VARS) {
      expect(status[envName]).toBe(false);
    }
  });

  it('publicPremiumProviderStatus reflects env vars being set', () => {
    process.env['SAP_MCP_PREMIUM_JUPITER_STREAM_URL'] = 'https://example.invalid/stream';

    const status = publicPremiumProviderStatus();

    expect(status['SAP_MCP_PREMIUM_JUPITER_STREAM_URL']).toBe(true);
    expect(status['SAP_MCP_PREMIUM_PYTH_STREAM_URL']).toBe(false);
  });
});
