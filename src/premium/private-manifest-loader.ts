/**
 * @name premium/private-manifest-loader
 * @description Filesystem loader for private/enterprise premium plugin manifests.
 *
 * When `SAP_MCP_ENABLE_PREMIUM_PLUGINS=true` and `SAP_MCP_PLUGIN_DIR` is set,
 * this module scans the configured directory (and its `manifests/` subdirectory)
 * for `.json` files, validates each against `validatePremiumPluginManifest`,
 * and returns sanitized `PremiumPluginManifest` objects.
 *
 * Security guarantees:
 *   - Manifests are data only — no code is ever executed from plugin files.
 *   - Provider secrets are never read from or stored in manifests.
 *   - Symlink escaping is prevented via `realpathSync` + prefix checks.
 *   - File count (100) and per-file size (256 KB) are capped.
 *   - Every loaded manifest is sanitized to strip any extraneous fields before
 *     being returned to callers.
 *
 * @flow
 *   1. `builtin-plugins.ts:listPremiumPlugins()` calls
 *      `loadPrivatePremiumPluginManifests()` to merge private manifests into
 *      the discovery catalog.
 *   2. `builtin-plugins.ts:premiumPrivatePluginSupport()` calls
 *      `loadPrivatePremiumPluginReport()` for diagnostic output.
 *   3. Internally: `loadPrivatePremiumPluginReport()` scans the plugin dir,
 *      reads + validates each `.json` file, and returns accepted/rejected lists.
 *   4. `loadPrivatePremiumPluginManifests()` returns only the accepted manifests,
 *      deep-cloned to prevent external mutation.
 *
 * @env SAP_MCP_ENABLE_PREMIUM_PLUGINS — Must be `true` or `1` to enable loading.
 * @env SAP_MCP_PLUGIN_DIR              — Filesystem path to the plugin directory.
 * @env SAP_MCP_PREMIUM_EXPOSE_PRIVATE_DISCOVERY — If `true`/`1`, private/enterprise
 *      plugins appear in public discovery responses.
 *
 * @module premium/private-manifest-loader
 */

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { validatePremiumPluginManifest } from './plugin-validator.js';
import type { PremiumPluginManifest, PremiumValidationIssue } from './types.js';

/* -------------------------------------------------------------------------- */
/* Limits                                                                     */
/* -------------------------------------------------------------------------- */

/** @description Maximum number of manifest files scanned per plugin directory. */
const MAX_PRIVATE_MANIFEST_FILES = 100;
/** @description Maximum size per manifest file (256 KB). Rejects oversized files. */
const MAX_PRIVATE_MANIFEST_BYTES = 256 * 1024;

/* -------------------------------------------------------------------------- */
/* Report interface                                                           */
/* -------------------------------------------------------------------------- */

/**
 * @name PrivatePremiumPluginLoadReport
 * @description Diagnostic report returned by `loadPrivatePremiumPluginReport`.
 *
 * @property enabled               - Whether private plugin loading is enabled.
 * @property exposePrivateDiscovery - Whether private plugins appear in discovery.
 * @property pluginDirConfigured    - Whether `SAP_MCP_PLUGIN_DIR` is set.
 * @property loadedManifests        - Successfully validated and sanitized manifests.
 * @property rejectedManifests      - Files that failed validation or loading,
 *   with reason and optional validation errors.
 *
 * @usedBy `builtin-plugins.ts:premiumPrivatePluginSupport` (diagnostic output).
 */
export interface PrivatePremiumPluginLoadReport {
  enabled: boolean;
  exposePrivateDiscovery: boolean;
  pluginDirConfigured: boolean;
  loadedManifests: PremiumPluginManifest[];
  rejectedManifests: Array<{
    file: string;
    reason: string;
    errors?: PremiumValidationIssue[];
  }>;
}

/* -------------------------------------------------------------------------- */
/* Internal helpers                                                           */
/* -------------------------------------------------------------------------- */

/**
 * @name cloneManifest
 * @description Deep-clone a manifest via JSON serialization.
 *
 * Ensures callers cannot mutate the internal loaded manifest objects.
 *
 * @param manifest - The manifest to clone.
 * @returns A deep copy of the manifest.
 *
 * @internal
 */
function cloneManifest(manifest: PremiumPluginManifest): PremiumPluginManifest {
  return JSON.parse(JSON.stringify(manifest)) as PremiumPluginManifest;
}

/**
 * @name boolEnv
 * @description Read a boolean env var (accepts `true` or `1`).
 *
 * @param name - The environment variable name.
 * @returns `true` if the env var is set to `true` or `1`, otherwise `false`.
 *
 * @internal
 */
function boolEnv(name: string): boolean {
  return process.env[name] === 'true' || process.env[name] === '1';
}

/* -------------------------------------------------------------------------- */
/* Public env-var helpers                                                     */
/* -------------------------------------------------------------------------- */

/**
 * @name privatePremiumPluginsEnabled
 * @description Check whether private plugin loading is enabled via env var.
 *
 * @returns `true` if `SAP_MCP_ENABLE_PREMIUM_PLUGINS` is `true` or `1`.
 *
 * @usedBy `loadPrivatePremiumPluginReport` (gate check).
 */
export function privatePremiumPluginsEnabled(): boolean {
  return boolEnv('SAP_MCP_ENABLE_PREMIUM_PLUGINS');
}

/**
 * @name premiumDiscoveryIncludesPrivate
 * @description Check whether private/enterprise plugins should appear in
 * public discovery responses.
 *
 * @returns `true` if `SAP_MCP_PREMIUM_EXPOSE_PRIVATE_DISCOVERY` is `true` or `1`.
 *
 * @usedBy `builtin-plugins.ts:listPremiumPlugins` (visibility filter default).
 */
export function premiumDiscoveryIncludesPrivate(): boolean {
  return boolEnv('SAP_MCP_PREMIUM_EXPOSE_PRIVATE_DISCOVERY');
}

/* -------------------------------------------------------------------------- */
/* Internal directory & file helpers                                          */
/* -------------------------------------------------------------------------- */

/**
 * @name configuredPluginDir
 * @description Resolve the configured plugin directory from `SAP_MCP_PLUGIN_DIR`.
 *
 * @returns The absolute resolved path, or `null` if the env var is unset/empty.
 *
 * @internal
 */
function configuredPluginDir(): string | null {
  const raw = process.env.SAP_MCP_PLUGIN_DIR;
  if (!raw || !raw.trim()) return null;
  return resolve(raw.trim());
}

/**
 * @name sanitizeManifest
 * @description Strip a loaded manifest to only the known fields, discarding
 * any extraneous properties that may have been present in the JSON file.
 *
 * This is a defense-in-depth measure: even though `validatePremiumPluginManifest`
 * already rejects unknown fields, sanitization ensures the in-memory object
 * only contains the exact fields defined by `PremiumPluginManifest`.
 *
 * @param manifest - The raw parsed manifest.
 * @returns A sanitized `PremiumPluginManifest` with only known fields.
 *
 * @internal
 */
function sanitizeManifest(manifest: PremiumPluginManifest): PremiumPluginManifest {
  return {
    id: manifest.id,
    version: manifest.version,
    title: manifest.title,
    description: manifest.description,
    publisher: manifest.publisher,
    visibility: manifest.visibility,
    capabilities: manifest.capabilities.map(capability => ({
      id: capability.id,
      type: capability.type,
      title: capability.title,
      description: capability.description,
      status: capability.status,
      requiresProvider: capability.requiresProvider,
      providerEnv: [...capability.providerEnv],
      inputSchema: JSON.parse(JSON.stringify(capability.inputSchema)) as Record<string, unknown>,
      outputSchema: JSON.parse(JSON.stringify(capability.outputSchema)) as Record<string, unknown>,
      pricing: { ...capability.pricing },
      delivery: {
        transport: capability.delivery.transport,
        events: [...capability.delivery.events],
        latencyTargetMs: capability.delivery.latencyTargetMs,
        replayWindowSeconds: capability.delivery.replayWindowSeconds,
      },
    })),
  };
}

/**
 * @name discoverManifestFiles
 * @description Scan the plugin directory root and its `manifests/` subdirectory
 * for `.json` files, preventing symlink escaping via `realpathSync`.
 *
 * Only files whose real path starts with the root directory's real path are
 * included. The result is deduplicated and sorted. Scanning stops after
 * `MAX_PRIVATE_MANIFEST_FILES` files are found.
 *
 * @param root - The absolute real path of the plugin directory.
 * @returns Array of absolute real file paths to `.json` manifest files.
 *
 * @internal
 */
function discoverManifestFiles(root: string): string[] {
  const roots = [root, join(root, 'manifests')];
  const files: string[] = [];

  for (const candidateRoot of roots) {
    if (!existsSync(candidateRoot)) continue;
    const rootRealPath = realpathSync(candidateRoot);
    for (const entry of readdirSync(candidateRoot, { withFileTypes: true })) {
      if (!entry.isFile() || extname(entry.name) !== '.json') continue;
      const filePath = join(candidateRoot, entry.name);
      const fileRealPath = realpathSync(filePath);

      // Symlink escape prevention: file must be under the root directory.
      if (!fileRealPath.startsWith(`${rootRealPath}/`)) continue;

      files.push(fileRealPath);
      if (files.length >= MAX_PRIVATE_MANIFEST_FILES) return files;
    }
  }

  return [...new Set(files)].sort();
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * @name loadPrivatePremiumPluginReport
 * @description Scan, validate, and load private premium plugin manifests from
 * the configured plugin directory.
 *
 * Steps:
 *   1. Check if loading is enabled (`SAP_MCP_ENABLE_PREMIUM_PLUGINS`).
 *   2. Check if `SAP_MCP_PLUGIN_DIR` is configured and exists.
 *   3. Discover `.json` files in the root and `manifests/` subdirectory.
 *   4. For each file: check size, parse JSON, validate with
 *      `validatePremiumPluginManifest`, sanitize if valid.
 *   5. Accepted manifests go into `loadedManifests`; rejected ones into
 *      `rejectedManifests` with a reason string.
 *
 * @returns A `PrivatePremiumPluginLoadReport` with loaded and rejected manifests.
 *
 * @usedBy
 *   - `builtin-plugins.ts:loadPrivatePremiumPluginManifests` (accepted only).
 *   - `builtin-plugins.ts:premiumPrivatePluginSupport` (diagnostic counts).
 */
export function loadPrivatePremiumPluginReport(): PrivatePremiumPluginLoadReport {
  const enabled = privatePremiumPluginsEnabled();
  const exposePrivateDiscovery = premiumDiscoveryIncludesPrivate();
  const pluginDir = configuredPluginDir();
  const report: PrivatePremiumPluginLoadReport = {
    enabled,
    exposePrivateDiscovery,
    pluginDirConfigured: Boolean(pluginDir),
    loadedManifests: [],
    rejectedManifests: [],
  };

  // Early exit if loading is disabled or no plugin directory is configured.
  if (!enabled || !pluginDir) return report;

  // Plugin directory configured but missing on disk.
  if (!existsSync(pluginDir)) {
    report.rejectedManifests.push({ file: basename(pluginDir), reason: 'plugin_dir_not_found' });
    return report;
  }

  const pluginDirRealPath = realpathSync(pluginDir);

  // Process each discovered manifest file.
  for (const filePath of discoverManifestFiles(pluginDirRealPath)) {
    try {
      const stats = statSync(filePath);
      if (!stats.isFile()) continue;

      // Reject oversized files to prevent abuse.
      if (stats.size > MAX_PRIVATE_MANIFEST_BYTES) {
        report.rejectedManifests.push({ file: basename(filePath), reason: 'manifest_too_large' });
        continue;
      }

      // Parse and validate the manifest JSON.
      const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
      const validation = validatePremiumPluginManifest(parsed);
      if (!validation.valid) {
        report.rejectedManifests.push({
          file: basename(filePath),
          reason: 'validation_failed',
          errors: validation.errors,
        });
        continue;
      }

      // Sanitize and accept the manifest.
      report.loadedManifests.push(sanitizeManifest(parsed as PremiumPluginManifest));
    } catch (error) {
      report.rejectedManifests.push({
        file: basename(filePath),
        reason: error instanceof Error ? error.message : 'unknown_manifest_load_error',
      });
    }
  }

  return report;
}

/**
 * @name loadPrivatePremiumPluginManifests
 * @description Return only the successfully loaded private plugin manifests,
 * deep-cloned to prevent external mutation.
 *
 * @returns Array of `PremiumPluginManifest` clones (empty if disabled or no dir).
 *
 * @usedBy `builtin-plugins.ts:listPremiumPlugins` (merged with built-in plugins).
 */
export function loadPrivatePremiumPluginManifests(): PremiumPluginManifest[] {
  return loadPrivatePremiumPluginReport().loadedManifests.map(cloneManifest);
}