#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const configPath = path.join(repoRoot, 'config', 'architecture-boundaries.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const sourceRoot = path.join(repoRoot, config.root);
const extensions = ['.ts', '.tsx', '.mts', '.cts'];
const importPattern = /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const violations = [];

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') {
        continue;
      }
      files.push(...walk(fullPath));
    } else if (extensions.some(ext => fullPath.endsWith(ext)) && !fullPath.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function normalizeRelative(filePath) {
  return path.relative(sourceRoot, filePath).split(path.sep).join('/');
}

function domainFor(filePath) {
  const rel = normalizeRelative(filePath);
  const matches = [];
  for (const [domain, patterns] of Object.entries(config.domains)) {
    for (const pattern of patterns) {
      const normalized = pattern.replace(/\/$/, '');
      if (rel === normalized || rel.startsWith(`${normalized}/`)) {
        matches.push({ domain, length: normalized.length });
      }
    }
  }
  matches.sort((a, b) => b.length - a.length);
  return matches[0]?.domain;
}

function validateBoundaryConfig() {
  const domainNames = new Set(Object.keys(config.domains ?? {}));
  const ignoredDomains = new Set(config.ignoreDomains ?? []);

  for (const domain of domainNames) {
    if (!ignoredDomains.has(domain) && !Array.isArray(config.allowed?.[domain])) {
      violations.push({
        kind: 'config',
        message: `Domain ${domain} must declare an allowed dependency list.`,
      });
    }
  }

  for (const [domain, allowedDomains] of Object.entries(config.allowed ?? {})) {
    if (!domainNames.has(domain) && !ignoredDomains.has(domain)) {
      violations.push({
        kind: 'config',
        message: `Allowed dependency policy references unknown domain ${domain}.`,
      });
    }
    for (const allowedDomain of allowedDomains) {
      if (!domainNames.has(allowedDomain) && !ignoredDomains.has(allowedDomain)) {
        violations.push({
          kind: 'config',
          message: `Allowed dependency policy for ${domain} references unknown target domain ${allowedDomain}.`,
        });
      }
    }
  }
}

function resolveRelativeImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) {
    return undefined;
  }

  const withoutJsExtension = specifier.endsWith('.js') ? specifier.slice(0, -3) : specifier;
  const base = path.resolve(path.dirname(fromFile), withoutJsExtension);
  const candidates = [
    ...extensions.map(ext => `${base}${ext}`),
    ...extensions.map(ext => path.join(base, `index${ext}`)),
  ];

  return candidates.find(candidate => existsSync(candidate));
}

validateBoundaryConfig();

for (const filePath of walk(sourceRoot)) {
  const fromDomain = domainFor(filePath);
  if (!fromDomain) {
    violations.push({
      kind: 'unassigned',
      file: normalizeRelative(filePath),
      message: `${normalizeRelative(filePath)} is not assigned to any architecture domain.`,
    });
    continue;
  }
  if (config.ignoreDomains.includes(fromDomain)) {
    continue;
  }

  const allowedDomains = new Set([fromDomain, ...(config.allowed[fromDomain] ?? [])]);
  const text = readFileSync(filePath, 'utf8');
  let match;

  while ((match = importPattern.exec(text)) !== null) {
    const targetPath = resolveRelativeImport(filePath, match[1]);
    if (!targetPath || !targetPath.startsWith(sourceRoot)) {
      continue;
    }

    const toDomain = domainFor(targetPath);
    if (!toDomain || config.ignoreDomains.includes(toDomain) || allowedDomains.has(toDomain)) {
      continue;
    }

    violations.push({
      kind: 'import',
      from: normalizeRelative(filePath),
      fromDomain,
      to: normalizeRelative(targetPath),
      toDomain,
      specifier: match[1],
    });
  }
}

if (violations.length > 0) {
  console.error('Architecture boundary violations found:');
  for (const violation of violations) {
    if (violation.kind === 'import') {
      console.error(`- ${violation.from} (${violation.fromDomain}) imports ${violation.to} (${violation.toDomain}) via ${violation.specifier}`);
    } else {
      console.error(`- ${violation.message}`);
    }
  }
  process.exit(1);
}

console.log('Architecture boundaries OK');
