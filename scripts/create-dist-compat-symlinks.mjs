#!/usr/bin/env node
/**
 * Creates compatibility symlinks in dist/ so that pre-modularization
 * paths (dist/bin/, dist/cli.js, dist/config-cli.js, dist/index.js)
 * continue to resolve after the 30-package modular build.
 */
import { mkdirSync, symlinkSync, existsSync, lstatSync, unlinkSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const distRoot = join(repoRoot, 'dist');

if (!existsSync(distRoot)) {
  console.error('create-dist-compat: dist/ does not exist. Run build first.');
  process.exit(1);
}

const compatLinks = [
  { from: 'src/bin/sap-mcp-remote.js', to: 'bin/sap-mcp-remote.js' },
  { from: 'src/bin/sap-mcp-server.js', to: 'bin/sap-mcp-server.js' },
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
      try { unlinkSync(target); } catch { /* already gone */ }
    }
  }

  mkdirSync(dirname(target), { recursive: true });

  // Compute relative path from the symlink's directory to the source file.
  // This is critical: a symlink at dist/bin/foo.js must point to
  // ../src/bin/foo.js (not src/bin/foo.js) because relative paths
  // in symlinks resolve from the symlink's own directory.
  const relPath = relative(dirname(target), source);

  try {
    symlinkSync(relPath, target, 'file');
    console.log(`  linked: ${to} -> ${relPath}`);
    created++;
  } catch (error) {
    console.error(`  failed: ${to} -> ${relPath}: ${error.message}`);
    skipped++;
  }
}

console.log(`create-dist-compat: ${created} symlinks created, ${skipped} skipped`);

function isBrokenSymlink(p) {
  try {
    return lstatSync(p).isSymbolicLink() && !existsSync(p);
  } catch {
    return false;
  }
}