#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
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

const contractPath = 'config/company-readiness-contracts.json';
const contract = readJson(contractPath);
const packageJson = readJson('package.json');
const ciWorkflow = readText('.github/workflows/ci.yml');
const desktopWorkflow = readText('.github/workflows/desktop-release.yml');

if ((contract.requirements ?? []).length < contract.minimumRequirementCount) {
  addFailure(`${contractPath} must declare at least ${contract.minimumRequirementCount} requirements`);
}

const requirementIds = new Set();
const report = {
  contract: contractPath,
  title: contract.title,
  requirementCount: contract.requirements.length,
  requirements: [],
};

for (const requirement of contract.requirements) {
  if (!requirement.id || requirementIds.has(requirement.id)) {
    addFailure(`Requirement id must be present and unique: ${requirement.id ?? '<missing>'}`);
    continue;
  }
  requirementIds.add(requirement.id);

  const evidenceReport = [];
  for (const evidence of requirement.evidence ?? []) {
    const absolutePath = path.join(repoRoot, evidence.file);
    const exists = existsSync(absolutePath);
    const text = exists ? readFileSync(absolutePath, 'utf8') : '';
    const passed = exists && text.includes(evidence.contains);
    evidenceReport.push({
      file: evidence.file,
      contains: evidence.contains,
      status: passed ? 'pass' : 'fail',
    });
    if (!exists) {
      addFailure(`${requirement.id}: evidence file is missing: ${evidence.file}`);
    } else if (!passed) {
      addFailure(`${requirement.id}: ${evidence.file} must contain "${evidence.contains}"`);
    }
  }

  if (evidenceReport.length === 0) {
    addFailure(`${requirement.id}: must declare at least one evidence item`);
  }

  report.requirements.push({
    id: requirement.id,
    description: requirement.description,
    evidence: evidenceReport,
    status: evidenceReport.every((item) => item.status === 'pass') ? 'pass' : 'fail',
  });
}

for (const scriptName of contract.requiredScripts ?? []) {
  if (!(scriptName in (packageJson.scripts ?? {}))) {
    addFailure(`package.json is missing required script ${scriptName}`);
  }
}

const releaseGate = packageJson.scripts?.['verify:release:offline'] ?? '';
if (!releaseGate.includes('pnpm run verify:company-readiness')) {
  addFailure('verify:release:offline must run pnpm run verify:company-readiness');
}

for (const command of contract.requiredWorkflowCommands ?? []) {
  if (!ciWorkflow.includes(command)) {
    addFailure(`.github/workflows/ci.yml is missing ${command}`);
  }
  if (!desktopWorkflow.includes(command)) {
    addFailure(`.github/workflows/desktop-release.yml is missing ${command}`);
  }
}

if (failures.length > 0) {
  console.error('Company readiness verification failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(`Company readiness OK (${report.requirementCount} requirements)`);
