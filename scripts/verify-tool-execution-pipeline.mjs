#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const contractPath = 'config/tool-execution-pipeline-contracts.json';
const contract = JSON.parse(readFileSync(path.join(repoRoot, contractPath), 'utf8'));
const exportContracts = JSON.parse(readFileSync(path.join(repoRoot, 'config/package-export-contracts.json'), 'utf8'));
const builtinToolModulesText = readFileSync(path.join(repoRoot, 'src/tools/builtin-tool-modules.ts'), 'utf8');
const failures = [];
const maximumLegacyRegisterToolFiles = contract.maximumLegacyRegisterToolFiles ?? 0;
const additionalLegacyRegisterToolAuditFiles = contract.additionalLegacyRegisterToolAuditFiles ?? [];
const allowedDirectRegisterPipelineToolFiles = new Set(contract.allowedDirectRegisterPipelineToolFiles ?? []);
const registerPipelineToolPattern = /\bregisterPipelineTool(?:\s*<[^(\n]+>)?\s*\(/g;
const registerPipelineAdapterPattern = /^\s*register[A-Z][A-Za-z0-9]+PipelineTool(?:\s*<[^(\n]+>)?\s*\(/gm;

function readText(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function addFailure(message) {
  failures.push(message);
}

function toRepoRelativePath(absolutePath) {
  return path.relative(repoRoot, absolutePath).split(path.sep).join('/');
}

function walkSourceFiles(dir) {
  const entries = readdirSync(dir).sort();
  return entries.flatMap((entry) => {
    const absolutePath = path.join(dir, entry);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      return walkSourceFiles(absolutePath);
    }
    if (!entry.endsWith('.ts') || entry.endsWith('.test.ts') || entry.endsWith('.d.ts')) {
      return [];
    }
    return [absolutePath];
  });
}

function hasPipelineToolRegistration(text) {
  registerPipelineToolPattern.lastIndex = 0;
  registerPipelineAdapterPattern.lastIndex = 0;
  return registerPipelineToolPattern.test(text) || registerPipelineAdapterPattern.test(text);
}

function countPipelineToolRegistrations(text) {
  registerPipelineToolPattern.lastIndex = 0;
  registerPipelineAdapterPattern.lastIndex = 0;
  return (text.match(registerPipelineToolPattern) ?? []).length
    + (text.match(registerPipelineAdapterPattern) ?? []).length;
}

for (const symbolName of contract.requiredExportSymbols ?? []) {
  if (!(exportContracts['./tools'] ?? []).includes(symbolName)) {
    addFailure(`./tools export contract is missing ${symbolName}`);
  }
}

for (const evidence of contract.requiredEvidence ?? []) {
  const absolutePath = path.join(repoRoot, evidence.file);
  if (!existsSync(absolutePath)) {
    addFailure(`Evidence file is missing: ${evidence.file}`);
    continue;
  }
  if (!readText(evidence.file).includes(evidence.contains)) {
    addFailure(`${evidence.file} must contain "${evidence.contains}"`);
  }
}

for (const tool of contract.requiredPipelineTools ?? []) {
  const text = existsSync(path.join(repoRoot, tool.file)) ? readText(tool.file) : '';
  if (!text) {
    addFailure(`Required pipeline tool file is missing: ${tool.file}`);
    continue;
  }
  if (!hasPipelineToolRegistration(text)) {
    addFailure(`${tool.file} must register ${tool.toolName} through registerPipelineTool or a typed pipeline adapter`);
  }
  if (!text.includes(tool.toolName)) {
    addFailure(`${tool.file} must contain tool name ${tool.toolName}`);
  }
  if (!builtinToolModulesText.includes(`id: '${tool.moduleId}'`)) {
    addFailure(`Builtin tool module catalog is missing module id ${tool.moduleId}`);
  }
  if (!builtinToolModulesText.includes(tool.toolName)) {
    addFailure(`Builtin tool module catalog must keep ${tool.toolName} as a sentinel for ${tool.moduleId}`);
  }
}

const toolSourceFiles = walkSourceFiles(path.join(repoRoot, 'src/tools'))
  .map((absolutePath) => toRepoRelativePath(absolutePath))
  .filter((relativePath) => ![
    'src/tools/index.ts',
    'src/tools/tool-execution-pipeline.ts',
    'src/tools/tool-family-pipeline.ts',
    'src/tools/tool-execution-metadata.ts',
    'src/tools/tool-module-manifest.ts',
    'src/tools/tool-module-validation.ts',
    'src/tools/tool-catalog.ts',
    'src/tools/module-registry.ts',
    'src/tools/builtin-tool-modules.ts',
    'src/tools/tool-aliases.ts',
  ].includes(relativePath));

const pipelineToolFiles = [];
const directRegisterPipelineToolFiles = [];
const legacyRegisterToolFiles = [];
const legacyRegisterToolAuditFiles = [...new Set([
  ...toolSourceFiles,
  ...additionalLegacyRegisterToolAuditFiles,
])];

for (const relativePath of toolSourceFiles) {
  const text = readText(relativePath);
  if (hasPipelineToolRegistration(text)) {
    pipelineToolFiles.push(relativePath);
  }
  registerPipelineToolPattern.lastIndex = 0;
  if (registerPipelineToolPattern.test(text)) {
    directRegisterPipelineToolFiles.push(relativePath);
  }
}

for (const relativePath of legacyRegisterToolAuditFiles) {
  if (!existsSync(path.join(repoRoot, relativePath))) {
    addFailure(`Legacy registerTool audit file is missing: ${relativePath}`);
    continue;
  }
  const text = readText(relativePath);
  if (/\bregisterTool\s*\(/.test(text)) {
    legacyRegisterToolFiles.push(relativePath);
  }
}

const pipelineToolRegistrationCount = pipelineToolFiles.reduce((count, relativePath) => {
  const text = readText(relativePath);
  return count + countPipelineToolRegistrations(text);
}, 0);

if (pipelineToolFiles.length < contract.minimumPipelineToolFiles) {
  addFailure(`Expected at least ${contract.minimumPipelineToolFiles} pipeline tool files, found ${pipelineToolFiles.length}`);
}

if (pipelineToolRegistrationCount < contract.minimumPipelineToolRegistrations) {
  addFailure(`Expected at least ${contract.minimumPipelineToolRegistrations} pipeline tool registrations, found ${pipelineToolRegistrationCount}`);
}

if (legacyRegisterToolFiles.length > maximumLegacyRegisterToolFiles) {
  addFailure(`Expected at most ${maximumLegacyRegisterToolFiles} legacy registerTool source files, found ${legacyRegisterToolFiles.length}: ${legacyRegisterToolFiles.join(', ')}`);
}

const disallowedDirectRegisterPipelineToolFiles = directRegisterPipelineToolFiles.filter((relativePath) => (
  !allowedDirectRegisterPipelineToolFiles.has(relativePath)
));
if (disallowedDirectRegisterPipelineToolFiles.length > 0) {
  addFailure(`Direct registerPipelineTool usage is only allowed in ${[...allowedDirectRegisterPipelineToolFiles].join(', ')}; found ${disallowedDirectRegisterPipelineToolFiles.join(', ')}`);
}

const report = {
  contract: contractPath,
  requiredExportSymbols: contract.requiredExportSymbols ?? [],
  requiredPipelineTools: contract.requiredPipelineTools ?? [],
  sourceFiles: toolSourceFiles.length,
  pipelineToolFiles,
  directRegisterPipelineToolFiles,
  allowedDirectRegisterPipelineToolFiles: [...allowedDirectRegisterPipelineToolFiles],
  legacyRegisterToolAuditFiles,
  legacyRegisterToolFiles,
  pipelineToolFileCount: pipelineToolFiles.length,
  pipelineToolRegistrationCount,
  maximumLegacyRegisterToolFiles,
  additionalLegacyRegisterToolAuditFiles,
  disallowedDirectRegisterPipelineToolFiles,
  directRegisterPipelineToolFileCount: directRegisterPipelineToolFiles.length,
  legacyRegisterToolAuditFileCount: legacyRegisterToolAuditFiles.length,
  legacyRegisterToolFileCount: legacyRegisterToolFiles.length,
};

if (failures.length > 0) {
  console.error('Tool execution pipeline verification failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log('Tool execution pipeline OK');
console.log(JSON.stringify(report, null, 2));
