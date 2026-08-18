#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const packageContracts = JSON.parse(
  readFileSync(path.join(repoRoot, 'config/workspace-package-contracts.json'), 'utf8'),
).packages ?? [];
const failures = [];
const scannedFiles = [];
const checkedLegacyRoots = packageContracts
  .filter((contract) => contract.physicalSource === true && typeof contract.legacyCompatibilitySource === 'string')
  .map((contract) => ({
    id: contract.id,
    source: contract.source,
    root: contract.legacyCompatibilitySource,
    absoluteRoot: path.join(repoRoot, contract.legacyCompatibilitySource),
  }));
const importSpecifierPattern = /\bimport\s+(?:type\s+)?(?:[^'"]*?\s+from\s*)?['"]([^'"]+)['"]|\bexport\s+(?:type\s+)?[^'"]*?\s+from\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function addFailure(message) {
  failures.push(message);
}

function toRepoRelativePath(absolutePath) {
  return path.relative(repoRoot, absolutePath).split(path.sep).join('/');
}

function listSourceFiles(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    return [];
  }

  const stats = statSync(absolutePath);
  if (stats.isFile()) {
    return relativePath.endsWith('.ts') && !relativePath.endsWith('.test.ts') && !relativePath.endsWith('.d.ts')
      ? [absolutePath]
      : [];
  }

  return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    const childPath = `${relativePath}/${entry.name}`;
    if (entry.isDirectory()) {
      return listSourceFiles(childPath);
    }
    if (!entry.isFile() || !childPath.endsWith('.ts') || childPath.endsWith('.test.ts') || childPath.endsWith('.d.ts')) {
      return [];
    }
    return [path.join(repoRoot, childPath)];
  });
}

function resolveRelativeSpecifier(sourceFile, specifier) {
  if (!specifier.startsWith('.')) {
    return undefined;
  }

  const absoluteBase = path.resolve(path.dirname(sourceFile), specifier);
  const candidates = [
    absoluteBase,
    absoluteBase.endsWith('.js') ? absoluteBase.slice(0, -3) : absoluteBase,
    absoluteBase.endsWith('.js') ? `${absoluteBase.slice(0, -3)}.ts` : `${absoluteBase}.ts`,
    path.join(absoluteBase, 'index.ts'),
  ];
  return candidates.find((candidate) => candidate.startsWith(repoRoot));
}

function isUnderPath(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

for (const contract of packageContracts) {
  if (contract.physicalSource !== true) {
    continue;
  }

  for (const sourceFile of listSourceFiles(contract.source)) {
    scannedFiles.push(toRepoRelativePath(sourceFile));
    const text = readFileSync(sourceFile, 'utf8');
    importSpecifierPattern.lastIndex = 0;
    for (const match of text.matchAll(importSpecifierPattern)) {
      const specifier = match[1] ?? match[2] ?? match[3];
      const resolved = resolveRelativeSpecifier(sourceFile, specifier);
      if (resolved === undefined) {
        continue;
      }

      const blockedRoot = checkedLegacyRoots.find((legacyRoot) => isUnderPath(resolved, legacyRoot.absoluteRoot));
      if (blockedRoot === undefined) {
        continue;
      }

      addFailure(`${toRepoRelativePath(sourceFile)} imports legacy ${blockedRoot.root} via ${specifier}; use ${blockedRoot.source} or a declared package boundary instead`);
    }
  }
}

const report = {
  checkedPackages: packageContracts.filter((contract) => contract.physicalSource === true).length,
  checkedLegacyRoots: checkedLegacyRoots.map(({ id, root, source }) => ({ id, root, source })),
  scannedFiles: scannedFiles.length,
  failures,
};

if (failures.length > 0) {
  console.error('Package boundary verification failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log('Package boundaries OK');
console.log(JSON.stringify(report, null, 2));
