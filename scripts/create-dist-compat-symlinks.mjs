#!/usr/bin/env node
/**
 * Creates compatibility symlinks in dist/ so that pre-modularization
 * paths (dist/bin/, dist/cli.js, dist/config-cli.js, dist/index.js)
 * continue to resolve after the 30-package modular build.
 *
 * The modular build outputs to:
 *   dist/src/bin/sap-mcp-remote.js  (was: dist/bin/sap-mcp-remote.js)
 *   dist/src/cli.js                 (was: dist/cli.js)
 *   dist/src/config-cli.js          (was: dist/config-cli.js)
 *   dist/src/index.js               (was: dist/index.js)
 *
 * This script creates symlinks so existing VPS deployments, pm2 configs,
 * and npx entrypoints don't break.
 */
import { mkdirSync, symlinkSync, existsSync, lstatSync, unlinkSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const distRoot = join(repoRoot, 'dist');

if (!existsSync(distRoot)) {
  console.error('create-dist-compat: dist/ does not exist. Run build first.');
  process.exit(1);
}

/**
 * @typedef {Object} CompatLink
 * @property {string} from - Relative path inside dist/ to the real file
 * @property {string} to - Relative path inside dist/ for the symlink
 */
const compatLinks = [
  // bin entrypoints (pm2, npx, start-remote.sh)
  { from: 'src/bin/sap-mcp-remote.js', to: 'bin/sap-mcp-remote.js' },
  { from: 'src/bin/sap-mcp-server.js', to: 'bin/sap-mcp-server.js' },
  // root entrypoints (npx, programmatic import)
  { from: 'src/cli.js', to: 'cli.js' },
  { from: 'src/config-cli.js', to: 'config-cli.js' },
  { from: 'src/index.js', to: 'index.js' },
];

let created = 0;
let skipped = 0;

for (const { from, to } of compatLinks) {
  const source = join(distRoot, from);
  const target = join(distRoot, to);

  if (!existsSync(source)) {
    console.warn(`  skip: source ${from} not found`);
    skipped++;
    continue;
  }

  // Remove existing symlink or file at target
  if (existsSync(target) || isBrokenSymlink(target)) {
    try {
      lstatSync(target);
      unlinkSync(target);
    } catch {
      // Broken symlink: lstatSync throws, but we can still unlink
      try { unlinkSync(target); } catch { /* already gone */ }
    }
  }

  // Create parent directory
  mkdirSync(dirname(target), { recursive: true });

  // Create relative symlink
  try {
    symlinkSync(from, target, 'file');
    console.log(`  linked: ${to} -> ${from}`);
    created++;
  } catch (error) {
    console.error(`  failed: ${to} -> ${from}: ${error.message}`);
    skipped++;
  }
}

console.log(`create-dist-compat: ${created} symlinks created, ${skipped} skipped`);

/**
 * Check if a path is a broken symlink (points to nonexistent target).
 * @param {string} p - Path to check
 * @returns {boolean}
 */
function isBrokenSymlink(p) {
  try {
    return lstatSync(p).isSymbolicLink() && !existsSync(p);
  } catch {
    return false;
  }
}