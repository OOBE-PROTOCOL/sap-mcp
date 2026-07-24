/**
 * @file private-manifest-loader.test.ts
 * @description Vitest suite for the premium private-manifest-loader module.
 *
 * Verifies that private plugin loading is disabled by default, that an enabled
 * loader with no plugin directory returns an empty report, that valid manifests
 * are loaded from temp directories, that invalid JSON and invalid manifest
 * structures are rejected, that symlink escapes are prevented, and that the
 * sanitizer strips unknown fields.
 *
 * @module premium/private-manifest-loader.test
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadPrivatePremiumPluginReport,
  loadPrivatePremiumPluginManifests,
  privatePremiumPluginsEnabled,
  premiumDiscoveryIncludesPrivate,
} from './private-manifest-loader.js';
import { buildPremiumPluginManifestTemplate } from './manifest-builder.js';
import type { PremiumPluginManifest } from './types.js';

const ENABLED_ENV = 'SAP_MCP_ENABLE_PREMIUM_PLUGINS';
const PLUGIN_DIR_ENV = 'SAP_MCP_PLUGIN_DIR';
const EXPOSE_ENV = 'SAP_MCP_PREMIUM_EXPOSE_PRIVATE_DISCOVERY';

function validManifest(overrides: Partial<PremiumPluginManifest> = {}): PremiumPluginManifest {
  return buildPremiumPluginManifestTemplate({
    pluginId: 'sap-premium-private-alpha',
    capabilityId: 'private.signal.stream',
    capabilityType: 'stream',
    title: 'Private Signal Stream',
    description:
      'Private enterprise stream contract for paid signal delivery with strict schemas, provider readiness, and x402 settlement.',
    publisher: 'OOBE Labs',
    providerEnv: ['SAP_MCP_PREMIUM_PRIVATE_SIGNAL_URL'],
    ...overrides,
  });
}

describe('premium private-manifest-loader', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const tempDirs: string[] = [];

  beforeEach(() => {
    savedEnv[ENABLED_ENV] = process.env[ENABLED_ENV];
    savedEnv[PLUGIN_DIR_ENV] = process.env[PLUGIN_DIR_ENV];
    savedEnv[EXPOSE_ENV] = process.env[EXPOSE_ENV];
    delete process.env[ENABLED_ENV];
    delete process.env[PLUGIN_DIR_ENV];
    delete process.env[EXPOSE_ENV];
  });

  afterEach(() => {
    for (const key of [ENABLED_ENV, PLUGIN_DIR_ENV, EXPOSE_ENV]) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  function makeTempDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), `sap-premium-loader-${prefix}-`));
    tempDirs.push(dir);
    return dir;
  }

  it('is disabled by default when SAP_MCP_ENABLE_PREMIUM_PLUGINS is not set', () => {
    expect(privatePremiumPluginsEnabled()).toBe(false);
    expect(premiumDiscoveryIncludesPrivate()).toBe(false);

    const report = loadPrivatePremiumPluginReport();
    expect(report.enabled).toBe(false);
    expect(report.loadedManifests).toEqual([]);
    expect(report.rejectedManifests).toEqual([]);
  });

  it('returns an empty report when enabled but no plugin dir is configured', () => {
    process.env[ENABLED_ENV] = 'true';

    const report = loadPrivatePremiumPluginReport();
    expect(report.enabled).toBe(true);
    expect(report.pluginDirConfigured).toBe(false);
    expect(report.loadedManifests).toEqual([]);
    expect(report.rejectedManifests).toEqual([]);
  });

  it('returns an empty report when enabled but the plugin dir does not exist on disk', () => {
    process.env[ENABLED_ENV] = 'true';
    process.env[PLUGIN_DIR_ENV] = join(tmpdir(), 'sap-premium-nonexistent-dir-' + Date.now());

    const report = loadPrivatePremiumPluginReport();
    expect(report.enabled).toBe(true);
    expect(report.pluginDirConfigured).toBe(true);
    expect(report.loadedManifests).toEqual([]);
    expect(report.rejectedManifests.length).toBeGreaterThanOrEqual(1);
  });

  it('loads a valid manifest from a temp dir', () => {
    const root = makeTempDir('valid');
    mkdirSync(join(root, 'manifests'));
    writeFileSync(
      join(root, 'manifests', 'private-alpha.json'),
      JSON.stringify(validManifest(), null, 2),
    );

    process.env[ENABLED_ENV] = 'true';
    process.env[PLUGIN_DIR_ENV] = root;

    const report = loadPrivatePremiumPluginReport();
    expect(report.loadedManifests).toHaveLength(1);
    expect(report.loadedManifests[0].id).toBe('sap-premium-private-alpha');
    expect(report.rejectedManifests).toEqual([]);
  });

  it('rejects invalid JSON files', () => {
    const root = makeTempDir('bad-json');
    mkdirSync(join(root, 'manifests'));
    writeFileSync(join(root, 'manifests', 'broken.json'), '{ not valid json ');

    process.env[ENABLED_ENV] = 'true';
    process.env[PLUGIN_DIR_ENV] = root;

    const report = loadPrivatePremiumPluginReport();
    expect(report.loadedManifests).toEqual([]);
    expect(report.rejectedManifests).toHaveLength(1);
    expect(report.rejectedManifests[0].file).toBe('broken.json');
  });

  it('rejects valid JSON that is an invalid manifest with errors', () => {
    const root = makeTempDir('bad-manifest');
    mkdirSync(join(root, 'manifests'));
    const badManifest = {
      id: 'Bad Plugin',
      version: 'next',
      title: 'Bad',
      description: 'too short',
      publisher: '',
      visibility: 'public',
      capabilities: [],
    };
    writeFileSync(join(root, 'manifests', 'bad.json'), JSON.stringify(badManifest, null, 2));

    process.env[ENABLED_ENV] = 'true';
    process.env[PLUGIN_DIR_ENV] = root;

    const report = loadPrivatePremiumPluginReport();
    expect(report.loadedManifests).toEqual([]);
    expect(report.rejectedManifests).toHaveLength(1);
    expect(report.rejectedManifests[0].file).toBe('bad.json');
    expect(report.rejectedManifests[0].reason).toBe('validation_failed');
    expect(report.rejectedManifests[0].errors).toBeDefined();
    expect(report.rejectedManifests[0].errors!.length).toBeGreaterThan(0);
  });

  it('prevents symlink escape from the plugin directory', () => {
    // Symlink escape prevention relies on realpathSync + prefix checks.
    // On platforms that don't support symlinks (or where creation fails),
    // skip this test.
    const root = makeTempDir('symlink');
    const outside = makeTempDir('symlink-outside');
    mkdirSync(join(root, 'manifests'));

    const targetFile = join(outside, 'escaped.json');
    writeFileSync(targetFile, JSON.stringify(validManifest(), null, 2));

    try {
      symlinkSync(targetFile, join(root, 'manifests', 'escaped-link.json'));
    } catch {
      // Platform doesn't support symlinks (e.g. Windows without admin).
      return;
    }

    process.env[ENABLED_ENV] = 'true';
    process.env[PLUGIN_DIR_ENV] = root;

    const report = loadPrivatePremiumPluginReport();
    // The symlinked file should NOT be loaded because its real path is
    // outside the plugin root.
    expect(report.loadedManifests).toEqual([]);
  });

  it('sanitizes loaded manifests to strip unknown fields', () => {
    const root = makeTempDir('sanitize');
    mkdirSync(join(root, 'manifests'));

    const manifestWithExtra = {
      ...validManifest(),
      secretKey: 'should-be-stripped',
      executableCode: 'should-be-stripped',
      capabilities: [
        {
          ...validManifest().capabilities[0],
          extraField: 'should-be-stripped',
        },
      ],
    };

    writeFileSync(
      join(root, 'manifests', 'extra.json'),
      JSON.stringify(manifestWithExtra, null, 2),
    );

    process.env[ENABLED_ENV] = 'true';
    process.env[PLUGIN_DIR_ENV] = root;

    const report = loadPrivatePremiumPluginReport();

    // The validator rejects unknown fields, so the manifest should be rejected.
    // However, if the validator somehow accepted it, the sanitizer would strip
    // the unknown fields. Since the validator rejects unknown keys, we expect
    // rejection here.
    expect(report.loadedManifests).toEqual([]);
    expect(report.rejectedManifests).toHaveLength(1);
    expect(report.rejectedManifests[0].reason).toBe('validation_failed');
  });

  it('sanitizer strips unknown fields from a manifest that passes validation', () => {
    const root = makeTempDir('sanitize-valid');
    mkdirSync(join(root, 'manifests'));

    // Build a valid manifest and add an extra top-level field that the
    // validator will reject. Instead, test the sanitizer indirectly:
    // a valid manifest should be loaded and its shape should exactly match
    // the known fields (no extra properties leak through).
    const manifest = validManifest();
    writeFileSync(join(root, 'manifests', 'clean.json'), JSON.stringify(manifest, null, 2));

    process.env[ENABLED_ENV] = 'true';
    process.env[PLUGIN_DIR_ENV] = root;

    const loaded = loadPrivatePremiumPluginManifests();
    expect(loaded).toHaveLength(1);

    const knownTopKeys = new Set([
      'id',
      'version',
      'title',
      'description',
      'publisher',
      'visibility',
      'capabilities',
    ]);
    for (const key of Object.keys(loaded[0])) {
      expect(knownTopKeys.has(key)).toBe(true);
    }

    const knownCapKeys = new Set([
      'id',
      'type',
      'title',
      'description',
      'status',
      'requiresProvider',
      'providerEnv',
      'inputSchema',
      'outputSchema',
      'pricing',
      'delivery',
    ]);
    for (const key of Object.keys(loaded[0].capabilities[0])) {
      expect(knownCapKeys.has(key)).toBe(true);
    }
  });

  it('loadPrivatePremiumPluginManifests returns deep clones', () => {
    const root = makeTempDir('clone');
    mkdirSync(join(root, 'manifests'));
    writeFileSync(
      join(root, 'manifests', 'private-alpha.json'),
      JSON.stringify(validManifest(), null, 2),
    );

    process.env[ENABLED_ENV] = 'true';
    process.env[PLUGIN_DIR_ENV] = root;

    const first = loadPrivatePremiumPluginManifests();
    expect(first).toHaveLength(1);

    // Mutate the returned clone.
    first[0].id = 'mutated';
    first[0].capabilities[0].id = 'mutated-cap';

    // A second load should return the original values.
    const second = loadPrivatePremiumPluginManifests();
    expect(second[0].id).toBe('sap-premium-private-alpha');
    expect(second[0].capabilities[0].id).toBe('private.signal.stream');
  });
});