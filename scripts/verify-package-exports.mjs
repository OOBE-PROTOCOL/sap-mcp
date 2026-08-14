#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  const escaped = symbolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declarationPattern = new RegExp(`\\bexport\\s+(?:declare\\s+)?(?:type|interface|class|function|const|enum)\\s+${escaped}\\b`);
  const namedExportPattern = new RegExp(`\\bexport\\s+(?:type\\s+)?\\{[^}]*\\b${escaped}\\b[^}]*\\}`, 's');
  return declarationPattern.test(typesText) || namedExportPattern.test(typesText);
}

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

for (const [specifier, expectedSymbols] of Object.entries(exportContracts)) {
  const target = exportMap[specifier];
  const importTarget = typeof target === 'string' ? target : target?.import;
  const typesTarget = typeof target === 'string' ? undefined : target?.types;
  const absoluteTarget = normalizeExportTarget(importTarget);
  if (!absoluteTarget || !existsSync(absoluteTarget)) {
    failures.push(`${specifier} contract target is missing`);
    continue;
  }

  const moduleExports = await import(pathToFileURL(absoluteTarget).href);
  const absoluteTypesTarget = normalizeExportTarget(typesTarget);
  const typesText = absoluteTypesTarget && existsSync(absoluteTypesTarget)
    ? readFileSync(absoluteTypesTarget, 'utf8')
    : '';
  for (const symbolName of expectedSymbols) {
    if (!(symbolName in moduleExports) && !hasExportedTypeSymbol(typesText, symbolName)) {
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
