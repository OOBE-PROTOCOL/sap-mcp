import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUILTIN_PREMIUM_PLUGINS, listPremiumPlugins } from './builtin-plugins.js';
import { buildPremiumPluginManifestTemplate } from './manifest-builder.js';
import { loadPrivatePremiumPluginReport } from './private-manifest-loader.js';
import { validatePremiumPluginManifest } from './plugin-validator.js';
import { createPremiumSessionPlan } from './session-manager.js';

describe('premium plugin manifest validator', () => {
  it('accepts every built-in premium plugin manifest', () => {
    for (const manifest of BUILTIN_PREMIUM_PLUGINS) {
      const report = validatePremiumPluginManifest(manifest);
      expect(report.valid).toBe(true);
      expect(report.errors).toEqual([]);
    }
  });

  it('rejects manifests without strict schemas and x402/pay.sh pricing', () => {
    const report = validatePremiumPluginManifest({
      id: 'Bad Plugin',
      version: 'next',
      title: 'Bad',
      description: 'too short',
      publisher: '',
      visibility: 'public',
      capabilities: [
        {
          id: 'bad capability',
          type: 'stream',
          title: 'Bad',
          description: 'too short',
          status: 'available',
          providerEnv: [],
          inputSchema: { type: 'string' },
          outputSchema: {},
          pricing: { unitPriceUsd: 0, minUnits: 2, maxUnits: 1, settlement: 'free' },
          delivery: {},
        },
      ],
    });

    expect(report.valid).toBe(false);
    expect(report.errors.map(error => error.path)).toContain('id');
    expect(report.errors.map(error => error.path)).toContain('version');
    expect(report.errors.map(error => error.path)).toContain('capabilities[0].inputSchema');
    expect(report.errors.map(error => error.path)).toContain('capabilities[0].pricing.unitPriceUsd');
  });

  it('rejects loose root schemas for premium capabilities', () => {
    const manifest = structuredClone(BUILTIN_PREMIUM_PLUGINS[0]);
    manifest.capabilities[0].inputSchema = {
      ...manifest.capabilities[0].inputSchema,
      additionalProperties: true,
    };

    const report = validatePremiumPluginManifest(manifest);

    expect(report.valid).toBe(false);
    expect(report.errors).toContainEqual(
      expect.objectContaining({
        path: 'capabilities[0].inputSchema',
        message: 'Schema root must set additionalProperties: false for strict agent/runtime validation.',
      }),
    );
  });

  it('only unblocks provider-backed sessions when provider env is configured', () => {
    const original = process.env.SAP_MCP_PREMIUM_JUPITER_STREAM_URL;
    try {
      delete process.env.SAP_MCP_PREMIUM_JUPITER_STREAM_URL;
      const blocked = createPremiumSessionPlan({
        pluginId: 'sap-premium-market-data',
        capabilityId: 'jupiter.quote.delta',
        capabilityType: 'stream',
        requestedUnits: 2,
        ttlSeconds: 120,
      });

      process.env.SAP_MCP_PREMIUM_JUPITER_STREAM_URL = 'https://premium.example.invalid/stream';
      const ready = createPremiumSessionPlan({
        pluginId: 'sap-premium-market-data',
        capabilityId: 'jupiter.quote.delta',
        capabilityType: 'stream',
        requestedUnits: 2,
        ttlSeconds: 120,
      });

      expect(blocked.status).toBe('blocked_requires_provider');
      expect(blocked.providerReady).toBe(false);
      expect(blocked.nextAction).toContain('Configure provider env vars first');
      expect(ready.status).toBe('pending_payment');
      expect(ready.providerReady).toBe(true);
      expect(ready.estimatedPriceUsd).toBe(0.02);
    } finally {
      if (original === undefined) {
        delete process.env.SAP_MCP_PREMIUM_JUPITER_STREAM_URL;
      } else {
        process.env.SAP_MCP_PREMIUM_JUPITER_STREAM_URL = original;
      }
    }
  });

  it('loads private manifest files without exposing them unless private discovery is enabled', () => {
    const originalEnabled = process.env.SAP_MCP_ENABLE_PREMIUM_PLUGINS;
    const originalDir = process.env.SAP_MCP_PLUGIN_DIR;
    const originalExpose = process.env.SAP_MCP_PREMIUM_EXPOSE_PRIVATE_DISCOVERY;
    const root = mkdtempSync(join(tmpdir(), 'sap-premium-plugin-'));
    try {
      mkdirSync(join(root, 'manifests'));
      const manifest = buildPremiumPluginManifestTemplate({
        pluginId: 'sap-premium-private-alpha',
        capabilityId: 'private.signal.stream',
        capabilityType: 'stream',
        title: 'Private Signal Stream',
        description: 'Private enterprise stream contract for paid signal delivery with strict schemas, provider readiness, and x402 settlement.',
        publisher: 'OOBE Labs',
        providerEnv: ['SAP_MCP_PREMIUM_PRIVATE_SIGNAL_URL'],
      });
      writeFileSync(join(root, 'manifests', 'private-alpha.json'), JSON.stringify(manifest, null, 2));

      process.env.SAP_MCP_ENABLE_PREMIUM_PLUGINS = 'true';
      process.env.SAP_MCP_PLUGIN_DIR = root;
      delete process.env.SAP_MCP_PREMIUM_EXPOSE_PRIVATE_DISCOVERY;

      const hiddenReport = loadPrivatePremiumPluginReport();
      expect(hiddenReport.loadedManifests).toHaveLength(1);
      expect(hiddenReport.exposePrivateDiscovery).toBe(false);
      expect(listPremiumPlugins().map(plugin => plugin.id)).not.toContain('sap-premium-private-alpha');

      process.env.SAP_MCP_PREMIUM_EXPOSE_PRIVATE_DISCOVERY = 'true';
      const exposedReport = loadPrivatePremiumPluginReport();
      expect(exposedReport.exposePrivateDiscovery).toBe(true);
      expect(exposedReport.loadedManifests[0].id).toBe('sap-premium-private-alpha');
      expect(listPremiumPlugins().map(plugin => plugin.id)).toContain('sap-premium-private-alpha');
    } finally {
      if (originalEnabled === undefined) {
        delete process.env.SAP_MCP_ENABLE_PREMIUM_PLUGINS;
      } else {
        process.env.SAP_MCP_ENABLE_PREMIUM_PLUGINS = originalEnabled;
      }
      if (originalDir === undefined) {
        delete process.env.SAP_MCP_PLUGIN_DIR;
      } else {
        process.env.SAP_MCP_PLUGIN_DIR = originalDir;
      }
      if (originalExpose === undefined) {
        delete process.env.SAP_MCP_PREMIUM_EXPOSE_PRIVATE_DISCOVERY;
      } else {
        process.env.SAP_MCP_PREMIUM_EXPOSE_PRIVATE_DISCOVERY = originalExpose;
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
});
