#!/usr/bin/env node
/**
 * @file scripts/bump-version.mjs
 * @description Single-source version bump for SAP MCP Server.
 *
 * Updates every version surface in one pass so a release cannot ship with
 * stale version strings across files:
 *   - package.json            ("version")
 *   - server.json             ("version", packages[].version, npx arg)
 *   - src/core/constants.ts   (MCP_SERVER_VERSION)
 *   - src/core/logger.ts      (fallback in the crash banner)
 *   - README.md               (package version table + npx install args)
 *
 * Usage:
 *   node scripts/bump-version.mjs 0.9.66
 *   node scripts/bump-version.mjs --dry-run 0.9.66
 *
 * The script refuses non-semver input and refuses to run outside the repo root.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function fail(message) {
  console.error(`bump-version: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let dryRun = false;
  let version;
  for (const arg of args) {
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (!version) {
      version = arg;
    } else {
      fail(`unexpected argument: ${arg}`);
    }
  }
  if (!version) {
    fail('missing version argument. Usage: node scripts/bump-version.mjs [--dry-run] <semver>');
  }
  if (!SEMVER.test(version)) {
    fail(`version "${version}" is not valid semver (expect x.y.z)`);
  }
  return { dryRun, version };
}

function read(relPath) {
  const full = resolve(ROOT, relPath);
  if (!existsSync(full)) {
    fail(`file not found: ${relPath}`);
  }
  return readFileSync(full, 'utf8');
}

function write(relPath, content) {
  const full = resolve(ROOT, relPath);
  writeFileSync(full, content, 'utf8');
  console.log(`  updated ${relPath}`);
}

function bumpPackageJson(version) {
  const rel = 'package.json';
  const json = JSON.parse(read(rel));
  json.version = version;
  write(rel, `${JSON.stringify(json, null, 2)}\n`);
}

function bumpServerJson(version) {
  const rel = 'server.json';
  const json = JSON.parse(read(rel));
  json.version = version;
  for (const pkg of json.packages ?? []) {
    if (pkg && typeof pkg.version === 'string') {
      pkg.version = version;
    }
    if (Array.isArray(pkg?.runtimeArguments)) {
      const idx = pkg.runtimeArguments.findIndex((a) => typeof a === 'string' && a.includes('@oobe-protocol-labs/sap-mcp-server@'));
      if (idx !== -1) {
        pkg.runtimeArguments[idx] = `@oobe-protocol-labs/sap-mcp-server@${version}`;
      }
    }
  }
  write(rel, `${JSON.stringify(json, null, 2)}\n`);
}

function bumpConstantsTs(version) {
  const rel = 'src/core/constants.ts';
  const src = read(rel);
  const next = src.replace(/export const MCP_SERVER_VERSION = '[^']*';/, `export const MCP_SERVER_VERSION = '${version}';`);
  if (next === src) {
    fail(`MCP_SERVER_VERSION not found in ${rel}`);
  }
  write(rel, next);
}

function bumpLoggerTs(version) {
  const rel = 'src/core/logger.ts';
  const src = read(rel);
  const next = src.replace(/config\.version \|\| '[^']*'/g, `config.version || '${version}'`);
  if (next === src) {
    fail(`logger fallback version not found in ${rel}`);
  }
  write(rel, next);
}

function bumpReadme(version) {
  const rel = 'README.md';
  const src = read(rel);
  let next = src.replace(/\| Package version \| `[^`]*` \|/g, `| Package version | \`${version}\` |`);
  next = next.replace(/@oobe-protocol-labs\/sap-mcp-server@[0-9]+\.[0-9]+\.[0-9]+/g, `@oobe-protocol-labs/sap-mcp-server@${version}`);
  if (next === src) {
    fail(`README version tokens not found in ${rel}`);
  }
  write(rel, next);
}

function main() {
  const { dryRun, version } = parseArgs(process.argv);
  console.log(`bump-version: target ${version}${dryRun ? ' (dry-run)' : ''}`);

  if (dryRun) {
    console.log('  skipping writes (dry-run)');
    return;
  }

  bumpPackageJson(version);
  bumpServerJson(version);
  bumpConstantsTs(version);
  bumpLoggerTs(version);
  bumpReadme(version);
  console.log(`bump-version: done. Remember to commit + tag ${version}.`);
}

main();
