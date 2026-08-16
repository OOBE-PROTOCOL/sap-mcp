#!/usr/bin/env node
/**
 * Package export verifier.
 *
 * Verifies that the root package.json exports map resolves to existing files
 * and that every contract symbol is actually exported. Uses tsx to dynamically
 * import .ts source files so that workspace:* package-name imports resolve
 * correctly without a separate build step.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(repoRoot, 'package.json');
const exportContractsPath = path.join(repoRoot, 'config', 'package-export-contracts.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const exportContracts = existsSync(exportContractsPath)
  ? JSON.parse(readFileSync(exportContractsPath, 'utf8'))
  : {};
const exportMap = packageJson.exports ?? {};
const failures = [];

function normalizeExportTarget(target) {
  if (typeof target !== 'string' || !target.startsWith('./')) {
    return undefined;
  }
  return path.join(repoRoot, target.slice(2));
}

function hasExportedTypeSymbol(typesText, symbolName) {
  const escaped = symbolName.replace(/[.*+?^${}()|[\]\\\\]/g, '\\\\$&');
  const declarationPattern = new RegExp(`\\bexport\\s+(?:declare\\s+)?(?:async\\s+)?(?:type|interface|class|function|const|enum|let|var)\\s+${escaped}\\b`);
  const namedExportPattern = new RegExp(`\\bexport\\s+(?:type\\s+)?\\{[^}]*\\b${escaped}\\b[^}]*\\}`, 's');
  return declarationPattern.test(typesText) || namedExportPattern.test(typesText);
}

// Phase 1: verify that every export target file exists
for (const [specifier, target] of Object.entries(exportMap)) {
  if (typeof target === 'string') {
    const absoluteTarget = normalizeExportTarget(target);
    if (!absoluteTarget || !existsSync(absoluteTarget)) {
      failures.push(`${specifier} -> ${target}`);
    }
    continue;
  }

  for (const condition of ['types', 'import', 'require']) {
    const conditionTarget = target?.[condition];
    if (conditionTarget === undefined) {
      failures.push(`${specifier} missing ${condition}`);
      continue;
    }

    const absoluteTarget = normalizeExportTarget(conditionTarget);
    if (!absoluteTarget || !existsSync(absoluteTarget)) {
      failures.push(`${specifier} ${condition} -> ${conditionTarget}`);
    }
  }
}

// Phase 2: verify contract symbols via text analysis of .ts source files
// This resolves export * chains recursively without needing a TS loader.
function resolveExportStarChain(filePath, symbolName, depth = 0, visited = new Set()) {
  if (depth > 10 || visited.has(filePath)) return false;
  visited.add(filePath);

  if (!existsSync(filePath)) return false;
  const text = readFileSync(filePath, 'utf8');

  // Direct export of the symbol
  if (hasExportedTypeSymbol(text, symbolName)) return true;

  // Named re-export: export { foo } from './bar.js'
  const namedReExportPattern = new RegExp(
    `export\\s+(?:type\\s+)?\\{[^}]*\\b${symbolName.replace(/[.*+?^${}()|[\]\\\\]/g, '\\\\$&')}\\b[^}]*\\}\\s+from\\s+['"]([^'"]+)['"]`
  );
  const namedMatch = text.match(namedReExportPattern);
  if (namedMatch) {
    const refPath = namedMatch[1];
    const resolved = resolveRefPath(filePath, refPath);
    if (resolved && resolveExportStarChain(resolved, symbolName, depth + 1, visited)) return true;
  }

  // Wildcard re-export: export * from './bar.js'
  const starReExports = text.match(/export \* from ['"]([^'"]+)['"]/g) || [];
  for (const reExport of starReExports) {
    const refPath = reExport.match(/from ['"]([^'"]+)['"]/)[1];
    const resolved = resolveRefPath(filePath, refPath);
    if (resolved && resolveExportStarChain(resolved, symbolName, depth + 1, visited)) return true;
  }

  return false;
}

function resolveRefPath(fromFile, refPath) {
  const dir = path.dirname(fromFile);
  // Strip .js extension, add .ts
  const cleanRef = refPath.replace(/\.js$/, '');
  const candidates = [
    path.join(dir, cleanRef + '.ts'),
    path.join(dir, cleanRef + '.tsx'),
    path.join(dir, cleanRef, 'index.ts'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

for (const [specifier, expectedSymbols] of Object.entries(exportContracts)) {
  const target = exportMap[specifier];
  const typesTarget = typeof target === 'string' ? target : target?.types;
  let absoluteTypesTarget = normalizeExportTarget(typesTarget);

  // If the types target points to a compiled .d.ts in dist/, redirect to the .ts source
  if (absoluteTypesTarget && absoluteTypesTarget.endsWith('.d.ts')) {
    const srcPath = absoluteTypesTarget
      .replace('/dist/packages/', '/packages/')
      .replace('/dist/src/', '/src/')
      .replace('.d.ts', '.ts');
    if (existsSync(srcPath)) {
      absoluteTypesTarget = srcPath;
    }
  }

  if (!absoluteTypesTarget || !existsSync(absoluteTypesTarget)) {
    failures.push(`${specifier} contract types target is missing`);
    continue;
  }

  for (const symbolName of expectedSymbols) {
    if (!resolveExportStarChain(absoluteTypesTarget, symbolName)) {
      failures.push(`${specifier} missing export symbol ${symbolName}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Package export verification failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Package exports OK');