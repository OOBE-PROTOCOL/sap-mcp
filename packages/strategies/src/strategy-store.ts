/**
 * @module strategies/strategy-store
 * @description File-based strategy store with JSON persistence.
 *
 * Strategies are stored as JSON files in ~/.config/mcp-sap/strategies/<category>/<name>.json
 * Each strategy has a version number, active flag, and arbitrary JSON config.
 *
 * The store uses synchronous file I/O (strategies are small JSON files).
 * The directory structure is:
 *   ~/.config/mcp-sap/strategies/
 *     defi/
 *       jupiter-arb.json
 *     trading/
 *       volatility-breakout.json
 *     meme/
 *       newlisting-snipe.json
 *     payments/
 *       x402-budget.json
 *     premium/
 *       pyth-watch.json
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getStrategiesDir } from '@oobe-protocol-labs/sap-mcp-config-runtime/paths';

/**
 * @name StrategyRecord
 * @description A stored strategy with metadata.
 */
export interface StrategyRecord {
  /** Strategy category (defi, trading, meme, payments, premium). */
  category: string;
  /** Strategy name (e.g. "volatility-breakout"). */
  name: string;
  /** JSON strategy configuration. */
  config: string;
  /** Strategy version — incremented on each update. */
  version: number;
  /** Whether the strategy is active. */
  active: boolean;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last update timestamp. */
  updatedAt: string;
  /** File path of the strategy. */
  path: string;
}

const STRATEGIES_ROOT = getStrategiesDir();

/**
 * @name getStrategiesRoot
 * @description Returns the strategies root directory.
 */
export function getStrategiesRoot(): string {
  return STRATEGIES_ROOT;
}

/**
 * @name sanitizePathSegment
 * @description Sanitizes a user-provided path segment to prevent directory traversal.
 * Rejects segments containing "..", "/", "\", or null bytes. Only allows
 * alphanumeric, dash, underscore, and dot.
 * @internal
 */
function sanitizePathSegment(segment: string): string {
  if (!segment || segment.length > 128) {
    throw new Error('Invalid path segment: must be 1-128 characters.');
  }
  // Reject any path traversal characters.
  if (segment.includes('..') || segment.includes('/') || segment.includes('\\') || segment.includes('\0')) {
    throw new Error(`Invalid path segment: ${segment} contains forbidden characters.`);
  }
  // Only allow safe characters: a-z, A-Z, 0-9, dash, underscore, dot.
  if (!/^[a-zA-Z0-9._-]+$/.test(segment)) {
    throw new Error(`Invalid path segment: ${segment} contains invalid characters. Only alphanumeric, dash, underscore, and dot are allowed.`);
  }
  return segment;
}

/**
 * @name saveStrategy
 * @description Saves or updates a strategy JSON file.
 */
export function saveStrategy(input: {
  category: string;
  name: string;
  config: string;
  active?: boolean;
}): { success: boolean; path: string; version: number; created: boolean } {
  const safeCategory = sanitizePathSegment(input.category);
  const safeName = sanitizePathSegment(input.name);
  const dir = join(STRATEGIES_ROOT, safeCategory);
  mkdirSync(dir, { recursive: true });

  const filePath = join(dir, `${safeName}.json`);
  const exists = existsSync(filePath);

  // Load existing version if updating.
  let version = 1;
  let createdAt = new Date().toISOString();
  if (exists) {
    try {
      const existing = JSON.parse(readFileSync(filePath, 'utf-8')) as StrategyRecord;
      version = existing.version + 1;
      createdAt = existing.createdAt;
    } catch {
      // Corrupt file — overwrite.
    }
  }

  const record: StrategyRecord = {
    category: input.category,
    name: input.name,
    config: input.config,
    version,
    active: input.active !== false,
    createdAt,
    updatedAt: new Date().toISOString(),
    path: filePath,
  };

  writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');

  return { success: true, path: filePath, version, created: !exists };
}

/**
 * @name loadStrategy
 * @description Loads a strategy by category and name.
 */
export function loadStrategy(category: string, name: string): StrategyRecord | null {
  const safeCategory = sanitizePathSegment(category);
  const safeName = sanitizePathSegment(name);
  const filePath = join(STRATEGIES_ROOT, safeCategory, `${safeName}.json`);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as StrategyRecord;
  } catch {
    return null;
  }
}

/**
 * @name listStrategies
 * @description Lists all strategies, optionally filtered by category and active status.
 */
export function listStrategies(category?: string, activeOnly = false): StrategyRecord[] {
  const strategies: StrategyRecord[] = [];

  const safeCategory = category ? sanitizePathSegment(category) : undefined;
  const categories = safeCategory
    ? [safeCategory]
    : existsSync(STRATEGIES_ROOT)
      ? readdirSync(STRATEGIES_ROOT, { withFileTypes: true })
          .filter(e => e.isDirectory())
          .map(e => e.name)
      : [];

  for (const cat of categories) {
    const catDir = join(STRATEGIES_ROOT, cat);
    if (!existsSync(catDir)) continue;

    const files = readdirSync(catDir, { withFileTypes: true })
      .filter(e => e.isFile() && e.name.endsWith('.json'))
      .map(e => join(catDir, e.name));

    for (const file of files) {
      try {
        const record = JSON.parse(readFileSync(file, 'utf-8')) as StrategyRecord;
        if (activeOnly && !record.active) continue;
        strategies.push(record);
      } catch {
        // Skip corrupt files.
      }
    }
  }

  return strategies;
}

/**
 * @name activateStrategy
 * @description Activates or deactivates a strategy.
 */
export function activateStrategy(category: string, name: string, active: boolean): { success: boolean; active: boolean } {
  const safeCategory = sanitizePathSegment(category);
  const safeName = sanitizePathSegment(name);
  const filePath = join(STRATEGIES_ROOT, safeCategory, `${safeName}.json`);
  if (!existsSync(filePath)) {
    return { success: false, active: false };
  }

  try {
    const record = JSON.parse(readFileSync(filePath, 'utf-8')) as StrategyRecord;
    record.active = active;
    record.updatedAt = new Date().toISOString();
    writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
    return { success: true, active };
  } catch {
    return { success: false, active: false };
  }
}
