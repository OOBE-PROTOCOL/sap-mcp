#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const failures = [];

function readText(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function addFailure(message) {
  failures.push(message);
}

const rootPackageJson = readJson('package.json');
const workspaceText = readText('pnpm-workspace.yaml');
const exportContracts = readJson('config/package-export-contracts.json');
const workspaceContracts = readJson('config/workspace-package-contracts.json');
const architectureBoundaries = readJson('config/architecture-boundaries.json');

if (!workspaceText.includes(workspaceContracts.workspaceGlob)) {
  addFailure(`pnpm-workspace.yaml is missing ${workspaceContracts.workspaceGlob}`);
}

const packageContracts = workspaceContracts.packages ?? [];
const expectedPackagePaths = new Set(packageContracts.map((contract) => contract.path));
const actualPackagePaths = new Set(
  readdirSync(path.join(repoRoot, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `packages/${entry.name}`),
);

function stripSourceRoot(sourcePath) {
  return sourcePath.startsWith(`${architectureBoundaries.root}/`)
    ? sourcePath.slice(architectureBoundaries.root.length + 1)
    : null;
}

function architectureDomainCoversSource(domain, sourcePath) {
  const relativeSource = stripSourceRoot(sourcePath);
  if (relativeSource === null) {
    return domain === null;
  }
  const patterns = architectureBoundaries.domains?.[domain] ?? [];
  return patterns.some((pattern) => {
    const normalized = pattern.replace(/\/$/, '');
    return relativeSource === normalized || relativeSource.startsWith(`${normalized}/`) || normalized.startsWith(`${relativeSource}/`);
  });
}

for (const actualPath of actualPackagePaths) {
  if (!expectedPackagePaths.has(actualPath)) {
    addFailure(`${actualPath} is missing from config/workspace-package-contracts.json`);
  }
}

for (const contract of packageContracts) {
  const packageJsonPath = `${contract.path}/package.json`;
  const readmePath = `${contract.path}/README.md`;
  const absoluteSource = path.join(repoRoot, contract.source);
  const additionalSources = contract.additionalSources ?? [];

  if (!actualPackagePaths.has(contract.path)) {
    addFailure(`${contract.path} does not exist under packages/`);
    continue;
  }
  if (!existsSync(path.join(repoRoot, packageJsonPath))) {
    addFailure(`${packageJsonPath} is missing`);
    continue;
  }
  if (!existsSync(path.join(repoRoot, readmePath))) {
    addFailure(`${readmePath} is missing`);
    continue;
  }
  if (!existsSync(absoluteSource)) {
    addFailure(`${contract.id} source boundary does not exist: ${contract.source}`);
  }
  for (const source of additionalSources) {
    if (!existsSync(path.join(repoRoot, source))) {
      addFailure(`${contract.id} additional source boundary does not exist: ${source}`);
    }
  }

  const packageJson = readJson(packageJsonPath);
  const readme = readText(readmePath);
  const sapMcp = packageJson.sapMcp ?? {};

  if (!packageJson.name?.startsWith(workspaceContracts.packageNamePrefix)) {
    addFailure(`${packageJsonPath} name must start with ${workspaceContracts.packageNamePrefix}`);
  }
  if (packageJson.name !== contract.packageName) {
    addFailure(`${packageJsonPath} name ${packageJson.name} does not match ${contract.packageName}`);
  }
  if (packageJson.version !== rootPackageJson.version) {
    addFailure(`${packageJsonPath} version ${packageJson.version} does not match root ${rootPackageJson.version}`);
  }
  if (packageJson.private !== contract.private) {
    addFailure(`${packageJsonPath} private must be ${contract.private}`);
  }
  if (packageJson.type !== 'module') {
    addFailure(`${packageJsonPath} type must be module`);
  }
  if (packageJson.sideEffects !== contract.sideEffects) {
    addFailure(`${packageJsonPath} sideEffects must be ${contract.sideEffects}`);
  }
  if (sapMcp.boundaryId !== contract.id) {
    addFailure(`${packageJsonPath} sapMcp.boundaryId must be ${contract.id}`);
  }
  if (sapMcp.source !== contract.source) {
    addFailure(`${packageJsonPath} sapMcp.source must be ${contract.source}`);
  }
  if (JSON.stringify(sapMcp.additionalSources ?? []) !== JSON.stringify(additionalSources)) {
    addFailure(`${packageJsonPath} sapMcp.additionalSources must match the workspace package contract`);
  }
  if ((sapMcp.rootExport ?? null) !== contract.rootExport) {
    addFailure(`${packageJsonPath} sapMcp.rootExport must be ${contract.rootExport}`);
  }
  if (contract.rootExport !== null) {
    const expectedApiContract = `config/package-export-contracts.json#${contract.rootExport}`;
    if (sapMcp.apiContract !== expectedApiContract) {
      addFailure(`${packageJsonPath} sapMcp.apiContract must be ${expectedApiContract}`);
    }
    if (!Array.isArray(exportContracts[contract.rootExport]) || exportContracts[contract.rootExport].length === 0) {
      addFailure(`${contract.id} root export ${contract.rootExport} must declare at least one public API symbol`);
    }
  } else if (sapMcp.apiContract !== undefined) {
    addFailure(`${packageJsonPath} sapMcp.apiContract must be omitted when rootExport is null`);
  }
  if ((sapMcp.architectureDomain ?? null) !== contract.architectureDomain) {
    addFailure(`${packageJsonPath} sapMcp.architectureDomain must be ${contract.architectureDomain}`);
  }
  if (sapMcp.boundary !== contract.boundary) {
    addFailure(`${packageJsonPath} sapMcp.boundary must match the workspace package contract`);
  }

  for (const source of [contract.source, ...additionalSources]) {
    if (stripSourceRoot(source) === null) {
      if (contract.architectureDomain !== null) {
        addFailure(`${contract.id} source boundary ${source} is outside ${architectureBoundaries.root}/ and must use architectureDomain null`);
      }
      continue;
    }
    if (contract.architectureDomain === null) {
      addFailure(`${contract.id} source boundary ${source} must declare an architectureDomain`);
    } else if (!(contract.architectureDomain in (architectureBoundaries.domains ?? {}))) {
      addFailure(`${contract.id} architectureDomain ${contract.architectureDomain} is missing from config/architecture-boundaries.json`);
    } else if (!architectureDomainCoversSource(contract.architectureDomain, source)) {
      addFailure(`${contract.id} architectureDomain ${contract.architectureDomain} does not cover ${source}`);
    }
  }

  if (contract.rootExport !== null) {
    if (!(contract.rootExport in (rootPackageJson.exports ?? {}))) {
      addFailure(`${contract.id} root export ${contract.rootExport} is missing from package.json`);
    }
    if (!(contract.rootExport in exportContracts)) {
      addFailure(`${contract.id} root export ${contract.rootExport} is missing from package export contracts`);
    }
  }

  for (const phrase of contract.readmeMustContain ?? []) {
    if (!readme.includes(phrase)) {
      addFailure(`${readmePath} must contain "${phrase}"`);
    }
  }

  for (const [scriptName, expectedCommand] of Object.entries(contract.requiredScripts ?? {})) {
    if (packageJson.scripts?.[scriptName] !== expectedCommand) {
      addFailure(`${packageJsonPath} script ${scriptName} must be "${expectedCommand}"`);
    }
  }

  for (const sourceFile of contract.requiredSourceFiles ?? []) {
    const fullPath = path.join(repoRoot, contract.path, sourceFile);
    if (!existsSync(fullPath)) {
      addFailure(`${contract.path}/${sourceFile} is missing`);
      continue;
    }
    const sourceText = readFileSync(fullPath, 'utf8');
    for (const phrase of contract.requiredSourceIncludes ?? []) {
      if (!sourceText.includes(phrase)) {
        addFailure(`${contract.path}/${sourceFile} must contain "${phrase}"`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error('Workspace package verification failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Workspace packages OK (${packageContracts.length} packages)`);
