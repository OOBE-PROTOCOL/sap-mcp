/**
 * @file manifest-builder.test.ts
 * @description Vitest suite for the premium manifest-builder module.
 *
 * Verifies that `buildPremiumPluginManifestTemplate` generates valid manifests
 * for stream, webhook, and tool capability types, that custom overrides are
 * applied when provided, that defaults are used when optional fields are
 * omitted, that falsy `providerEnv` entries are filtered, that visibility
 * defaults to `private`, and that all generated manifests pass
 * `validatePremiumPluginManifest`.
 *
 * @module premium/manifest-builder.test
 */

import { describe, expect, it } from 'vitest';
import { buildPremiumPluginManifestTemplate } from './manifest-builder.js';
import { validatePremiumPluginManifest } from './plugin-validator.js';
import type { PremiumCapabilityType, PremiumPluginManifest } from './types.js';

const VALID_DESCRIPTION =
  'Custom premium SAP MCP capability contract for paid agent runtime delivery with strict schemas and x402 settlement.';

const VALID_PLUGIN_ID = 'sap-premium-custom-alpha';
const VALID_CAPABILITY_ID = 'custom.signal.stream';

describe('premium manifest-builder', () => {
  it('generates a valid manifest for stream type', () => {
    const manifest = buildPremiumPluginManifestTemplate({
      pluginId: VALID_PLUGIN_ID,
      capabilityId: VALID_CAPABILITY_ID,
      capabilityType: 'stream',
      title: 'Custom Stream Plugin',
      description: VALID_DESCRIPTION,
      publisher: 'OOBE Labs',
    });

    expect(manifest.capabilities[0].type).toBe('stream');
    expect(manifest.capabilities[0].pricing.model).toBe('x402-per-minute');
    expect(manifest.capabilities[0].pricing.unit).toBe('minute');
    expect(manifest.capabilities[0].pricing.tier).toBe('premium-stream');
    expect(manifest.capabilities[0].delivery.transport).toBe('mcp-streamable-http');

    const report = validatePremiumPluginManifest(manifest);
    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
  });

  it('generates a valid manifest for webhook type', () => {
    const manifest = buildPremiumPluginManifestTemplate({
      pluginId: VALID_PLUGIN_ID,
      capabilityId: 'custom.webhook.event',
      capabilityType: 'webhook',
      title: 'Custom Webhook Plugin',
      description: VALID_DESCRIPTION,
      publisher: 'OOBE Labs',
    });

    expect(manifest.capabilities[0].type).toBe('webhook');
    expect(manifest.capabilities[0].pricing.model).toBe('x402-per-event');
    expect(manifest.capabilities[0].pricing.unit).toBe('event');
    expect(manifest.capabilities[0].pricing.tier).toBe('premium-webhook');
    expect(manifest.capabilities[0].delivery.transport).toBe('webhook-http');

    const report = validatePremiumPluginManifest(manifest);
    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
  });

  it('generates a valid manifest for tool type', () => {
    const manifest = buildPremiumPluginManifestTemplate({
      pluginId: VALID_PLUGIN_ID,
      capabilityId: 'custom.tool.call',
      capabilityType: 'tool',
      title: 'Custom Tool Plugin',
      description: VALID_DESCRIPTION,
      publisher: 'OOBE Labs',
    });

    expect(manifest.capabilities[0].type).toBe('tool');
    expect(manifest.capabilities[0].pricing.model).toBe('x402-session');
    expect(manifest.capabilities[0].pricing.unit).toBe('session');
    expect(manifest.capabilities[0].pricing.tier).toBe('premium-tool');
    expect(manifest.capabilities[0].delivery.transport).toBe('mcp-streamable-http');

    const report = validatePremiumPluginManifest(manifest);
    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
  });

  it('uses custom title, description, and publisher when provided', () => {
    const manifest = buildPremiumPluginManifestTemplate({
      pluginId: VALID_PLUGIN_ID,
      capabilityId: VALID_CAPABILITY_ID,
      capabilityType: 'stream',
      title: 'My Custom Title',
      description: VALID_DESCRIPTION,
      publisher: 'My Custom Publisher',
    });

    expect(manifest.title).toBe('My Custom Title');
    expect(manifest.publisher).toBe('My Custom Publisher');
    expect(manifest.capabilities[0].title).toBe('My Custom Title');
    expect(manifest.capabilities[0].description).toBe(VALID_DESCRIPTION);
  });

  it('uses default title, description, and publisher when optional fields are omitted', () => {
    const manifest = buildPremiumPluginManifestTemplate({
      pluginId: VALID_PLUGIN_ID,
      capabilityId: VALID_CAPABILITY_ID,
      capabilityType: 'stream',
    });

    expect(manifest.title).toBe('Custom SAP MCP Premium Plugin');
    expect(manifest.publisher).toBe('Custom Publisher');
    expect(manifest.version).toBe('0.1.0');
    expect(manifest.capabilities[0].pricing.unitPriceUsd).toBe(0.01);
  });

  it('providerEnv filters out falsy values', () => {
    const manifest = buildPremiumPluginManifestTemplate({
      pluginId: VALID_PLUGIN_ID,
      capabilityId: VALID_CAPABILITY_ID,
      capabilityType: 'stream',
      title: 'Filter Env Plugin',
      description: VALID_DESCRIPTION,
      publisher: 'OOBE Labs',
      providerEnv: ['SAP_MCP_PREMIUM_VALID_URL', '', '', 'SAP_MCP_PREMIUM_ANOTHER_URL'],
    });

    expect(manifest.capabilities[0].providerEnv).toEqual([
      'SAP_MCP_PREMIUM_VALID_URL',
      'SAP_MCP_PREMIUM_ANOTHER_URL',
    ]);
    expect(manifest.capabilities[0].requiresProvider).toBe(true);
    expect(manifest.capabilities[0].status).toBe('requires-provider');
  });

  it('defaults visibility to private', () => {
    const manifest = buildPremiumPluginManifestTemplate({
      pluginId: VALID_PLUGIN_ID,
      capabilityId: VALID_CAPABILITY_ID,
      capabilityType: 'stream',
      title: 'Default Visibility Plugin',
      description: VALID_DESCRIPTION,
      publisher: 'OOBE Labs',
    });

    expect(manifest.visibility).toBe('private');
  });

  it('sets requiresProvider=false when no providerEnv is provided', () => {
    const manifest = buildPremiumPluginManifestTemplate({
      pluginId: VALID_PLUGIN_ID,
      capabilityId: VALID_CAPABILITY_ID,
      capabilityType: 'stream',
      title: 'No Provider Plugin',
      description: VALID_DESCRIPTION,
      publisher: 'OOBE Labs',
    });

    expect(manifest.capabilities[0].providerEnv).toEqual([]);
    expect(manifest.capabilities[0].requiresProvider).toBe(false);
    expect(manifest.capabilities[0].status).toBe('planned');
  });

  it('all generated manifests for every capability type pass validatePremiumPluginManifest', () => {
    const types: PremiumCapabilityType[] = ['stream', 'webhook', 'tool'];

    for (const type of types) {
      const manifest: PremiumPluginManifest = buildPremiumPluginManifestTemplate({
        pluginId: `sap-premium-test-${type}`,
        capabilityId: `test.${type}.capability`,
        capabilityType: type,
        title: `Test ${type} Plugin`,
        description: VALID_DESCRIPTION,
        publisher: 'OOBE Labs',
        providerEnv: ['SAP_MCP_PREMIUM_TEST_URL'],
      });

      const report = validatePremiumPluginManifest(manifest);
      expect(report.valid).toBe(true);
      expect(report.errors).toEqual([]);
    }
  });
});