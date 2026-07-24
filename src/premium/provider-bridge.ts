/**
 * @name premium/provider-bridge
 * @description Dynamic loader and connection manager for premium provider adapters.
 *
 * Provider adapters live in the private subrepo (`sap-mcp-premium-private/providers/`).
 * The public server loads them dynamically only when `SAP_MCP_ENABLE_PREMIUM_PLUGINS=true`
 * and the corresponding provider env vars are configured.
 *
 * The bridge maintains a registry of active adapters keyed by `pluginId:capabilityId`,
 * handles connect/disconnect lifecycle, and exposes health status to the metrics
 * and monitoring layer.
 *
 * Security: adapters are loaded from the configured `SAP_MCP_PLUGIN_DIR` only.
 * No code is ever loaded from MCP tool input or user-supplied JSON.
 *
 * @flow
 *   1. `stream-broker.ts` / `webhook-engine.ts` need events for a capability.
 *   2. → `getProviderAdapter(pluginId, capabilityId)` returns the adapter.
 *   3. If not loaded, `loadProviderAdapter()` dynamically imports from the
 *      private subrepo providers directory.
 *   4. Adapter `connect()` is called once, then `subscribe()` returns an
 *      async iterable of events.
 *   5. `disconnectAllProviders()` is called on graceful shutdown.
 *
 * @module premium/provider-bridge
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PremiumProviderAdapter, ProviderEvent, ProviderHealth } from './types.js';
import { findPremiumCapability } from './builtin-plugins.js';
import { privatePremiumPluginsEnabled } from './private-manifest-loader.js';

/**
 * @description Registry of active provider adapters keyed by `pluginId:capabilityId`.
 */
const adapterRegistry = new Map<string, PremiumProviderAdapter>();

/**
 * @name adapterKey
 * @description Build the registry key for a plugin/capability pair.
 *
 * @param pluginId     - The premium plugin id.
 * @param capabilityId - The capability id within the plugin.
 * @returns The registry key string.
 *
 * @internal
 */
function adapterKey(pluginId: string, capabilityId: string): string {
  return `${pluginId}:${capabilityId}`;
}

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
 * @name loadProviderAdapter
 * @description Dynamically load a provider adapter from the private subrepo.
 *
 * The adapter module must be located at:
 *   `<SAP_MCP_PLUGIN_DIR>/providers/<pluginId>/<capabilityId>.js`
 * (or `.ts` if running via tsx/ts-node).
 *
 * The module must export a default factory function that returns a
 * `PremiumProviderAdapter`:
 *
 * ```ts
 * export default function createAdapter(): PremiumProviderAdapter { ... }
 * ```
 *
 * @param pluginId     - The premium plugin id.
 * @param capabilityId - The capability id within the plugin.
 * @returns The loaded and connected `PremiumProviderAdapter`, or `null` if
 *   private plugins are disabled, the dir is not configured, or the module
 *   is not found.
 *
 * @usedBy `getProviderAdapter`
 */
export async function loadProviderAdapter(
  pluginId: string,
  capabilityId: string,
): Promise<PremiumProviderAdapter | null> {
  if (!privatePremiumPluginsEnabled()) return null;

  const pluginDir = configuredPluginDir();
  if (!pluginDir) return null;

  // Resolve the capability to check it exists and get provider env requirements.
  const resolved = findPremiumCapability(pluginId, capabilityId);
  if (!resolved) return null;

  // Check that all required provider env vars are set.
  const providerReady = resolved.capability.providerEnv.every(envName => Boolean(process.env[envName]));
  if (!providerReady) return null;

  const key = adapterKey(pluginId, capabilityId);
  const existing = adapterRegistry.get(key);
  if (existing) return existing;

  // Try .js first (built), then .ts (dev).
  const jsPath = join(pluginDir, 'providers', pluginId, `${capabilityId}.js`);
  const tsPath = join(pluginDir, 'providers', pluginId, `${capabilityId}.ts`);

  let modulePath: string | null = null;
  if (existsSync(jsPath)) {
    modulePath = jsPath;
  } else if (existsSync(tsPath)) {
    modulePath = tsPath;
  } else {
    return null;
  }

  try {
    const moduleUrl = pathToFileURL(modulePath).href;
    const imported = await import(moduleUrl) as { default?: () => PremiumProviderAdapter };
    if (typeof imported.default !== 'function') return null;

    const adapter = imported.default();
    if (!adapter || typeof adapter.connect !== 'function') return null;

    await adapter.connect();
    adapterRegistry.set(key, adapter);
    return adapter;
  } catch {
    return null;
  }
}

/**
 * @name getProviderAdapter
 * @description Get or load a provider adapter for a plugin/capability pair.
 *
 * If the adapter is already in the registry, returns it directly.
 * Otherwise, attempts to load it from the private subrepo.
 *
 * @param pluginId     - The premium plugin id.
 * @param capabilityId - The capability id within the plugin.
 * @returns The `PremiumProviderAdapter`, or `null` if not available.
 *
 * @usedBy `stream-broker.ts`, `webhook-engine.ts`
 */
export async function getProviderAdapter(
  pluginId: string,
  capabilityId: string,
): Promise<PremiumProviderAdapter | null> {
  const key = adapterKey(pluginId, capabilityId);
  const existing = adapterRegistry.get(key);
  if (existing) return existing;

  return loadProviderAdapter(pluginId, capabilityId);
}

/**
 * @name getProviderHealth
 * @description Get health status for a specific provider adapter.
 *
 * @param pluginId     - The premium plugin id.
 * @param capabilityId - The capability id within the plugin.
 * @returns `ProviderHealth` if the adapter is loaded, otherwise a default unhealthy status.
 *
 * @usedBy `metrics.ts`
 */
export async function getProviderHealth(
  pluginId: string,
  capabilityId: string,
): Promise<ProviderHealth> {
  const adapter = adapterRegistry.get(adapterKey(pluginId, capabilityId));
  if (!adapter) {
    return { healthy: false, lastError: 'Adapter not loaded.' };
  }

  try {
    return await adapter.health();
  } catch (error) {
    return {
      healthy: false,
      lastError: error instanceof Error ? error.message : 'Unknown provider health error.',
    };
  }
}

/**
 * @name getAllProviderHealth
 * @description Get health status for all loaded provider adapters.
 *
 * @returns Record keyed by `pluginId:capabilityId` → `ProviderHealth`.
 *
 * @usedBy `metrics.ts`
 */
export async function getAllProviderHealth(): Promise<Record<string, ProviderHealth>> {
  const results: Record<string, ProviderHealth> = {};
  for (const [key, adapter] of adapterRegistry.entries()) {
    try {
      results[key] = await adapter.health();
    } catch (error) {
      results[key] = {
        healthy: false,
        lastError: error instanceof Error ? error.message : 'Unknown provider health error.',
      };
    }
  }
  return results;
}

/**
 * @name subscribeToProvider
 * @description Subscribe to events from a provider adapter with filters.
 *
 * Convenience wrapper that loads the adapter and returns the async iterable.
 *
 * @param pluginId     - The premium plugin id.
 * @param capabilityId - The capability id within the plugin.
 * @param filters      — Filter object passed to the adapter's `subscribe()`.
 * @returns Async iterable of `ProviderEvent`, or `null` if the adapter is not available.
 *
 * @usedBy `stream-broker.ts`, `webhook-engine.ts`
 */
export async function subscribeToProvider(
  pluginId: string,
  capabilityId: string,
  filters: Record<string, unknown>,
): Promise<AsyncIterable<ProviderEvent> | null> {
  const adapter = await getProviderAdapter(pluginId, capabilityId);
  if (!adapter) return null;

  return adapter.subscribe(filters);
}

/**
 * @name disconnectAllProviders
 * @description Disconnect all loaded provider adapters gracefully.
 *
 * Called during server shutdown to clean up connections.
 *
 * @usedBy `remote/server.ts` shutdown handler
 */
export async function disconnectAllProviders(): Promise<void> {
  for (const [key, adapter] of adapterRegistry.entries()) {
    try {
      await adapter.disconnect();
    } catch {
      // Best-effort disconnect — ignore errors during shutdown.
    }
    adapterRegistry.delete(key);
  }
}