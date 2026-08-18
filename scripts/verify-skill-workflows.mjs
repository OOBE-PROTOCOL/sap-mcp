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

function mustContain(label, text, phrase) {
  if (!text.includes(phrase)) {
    addFailure(`${label} must contain "${phrase}"`);
  }
}

const contracts = readJson('config/skill-workflow-contracts.json');
const packageJson = readJson('package.json');
const skillIndex = readText(contracts.index);
const sapMcpSkill = readText('skills/sap-mcp/SKILL.md');
const branchWorkflowDoc = readText('docs/BRANCHING_CI_RELEASE_WORKFLOW.md');
const operatingModelDoc = readText('docs/20_ENGINEERING_OPERATING_MODEL_BOUNDARIES.md');
const ciWorkflow = readText('.github/workflows/ci.yml');
const desktopWorkflow = readText('.github/workflows/desktop-release.yml');

if (!existsSync(path.join(repoRoot, contracts.toolReference))) {
  addFailure(`${contracts.toolReference} is missing`);
}

const actualSkillIds = new Set(
  readdirSync(path.join(repoRoot, contracts.skillRoot), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name),
);

for (const skill of contracts.requiredSkills) {
  const skillPath = `${contracts.skillRoot}/${skill.id}/SKILL.md`;
  if (!actualSkillIds.has(skill.id)) {
    addFailure(`Required skill directory is missing: ${skill.id}`);
    continue;
  }
  if (!existsSync(path.join(repoRoot, skillPath))) {
    addFailure(`${skillPath} is missing`);
    continue;
  }

  const skillText = readText(skillPath);
  mustContain(skillPath, skillText, skill.heading);
  mustContain(contracts.index, skillIndex, `\`${skill.id}\``);

  if (!/^# [^\n]+/m.test(skillText)) {
    addFailure(`${skillPath} must start with a markdown H1 heading`);
  }
  if (!/Use|use|Call|call|When|when/.test(skillText)) {
    addFailure(`${skillPath} must include routing or usage language`);
  }
}

for (const actualSkillId of actualSkillIds) {
  if (!contracts.requiredSkills.some((skill) => skill.id === actualSkillId)) {
    addFailure(`Skill directory ${actualSkillId} is not declared in config/skill-workflow-contracts.json`);
  }
}

for (const phrase of contracts.indexMustContain) {
  mustContain(contracts.index, skillIndex, phrase);
}

for (const phrase of contracts.sapMcpMustContain) {
  mustContain('skills/sap-mcp/SKILL.md', sapMcpSkill, phrase);
}

for (const phrase of contracts.workflowDocsMustContain) {
  mustContain('docs/BRANCHING_CI_RELEASE_WORKFLOW.md', branchWorkflowDoc, phrase);
  mustContain('docs/20_ENGINEERING_OPERATING_MODEL_BOUNDARIES.md', operatingModelDoc, phrase);
}

const requiredScript = contracts.packageScripts.requiredScript;
const requiredCommand = contracts.packageScripts.requiredCommand;
const releaseGate = contracts.packageScripts.releaseGate;

if (packageJson.scripts?.[requiredScript] !== requiredCommand) {
  addFailure(`package.json script ${requiredScript} must be "${requiredCommand}"`);
}
if (!packageJson.scripts?.[releaseGate]?.includes(`pnpm run ${requiredScript}`)) {
  addFailure(`package.json script ${releaseGate} must run pnpm run ${requiredScript}`);
}

for (const command of contracts.workflowCommands) {
  if (!ciWorkflow.includes(command)) {
    addFailure(`.github/workflows/ci.yml is missing ${command}`);
  }
  if (!desktopWorkflow.includes(command)) {
    addFailure(`.github/workflows/desktop-release.yml is missing ${command}`);
  }
}

for (const pattern of contracts.forbiddenPatterns) {
  const matcher = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  for (const relativePath of [
    contracts.index,
    contracts.toolReference,
    ...contracts.requiredSkills.map((skill) => `${contracts.skillRoot}/${skill.id}/SKILL.md`),
    'docs/BRANCHING_CI_RELEASE_WORKFLOW.md',
    'docs/20_ENGINEERING_OPERATING_MODEL_BOUNDARIES.md',
  ]) {
    if (matcher.test(readText(relativePath))) {
      addFailure(`${relativePath} contains forbidden placeholder pattern "${pattern}"`);
    }
  }
}

if (failures.length > 0) {
  console.error('Skill workflow verification failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Skill workflows OK (${contracts.requiredSkills.length} skills)`);
