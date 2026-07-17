/**
 * @module skills-tools
 * @description MCP tools for listing, bundling, and installing the SAP MCP skill pack.
 */

import type { Dirent } from 'fs';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerTool } from '../adapters/mcp/sdk-compat.js';
import { createTextResponse } from '../adapters/mcp/tool-response.js';
import type { SapMcpContext } from '../core/types.js';

type AgentTarget = 'claude' | 'codex' | 'hermes' | 'openclaw' | 'custom';

interface SkillToolInput {
  agent?: AgentTarget;
  targetDir?: string;
  skills?: string[];
  confirm?: boolean;
  includeContents?: boolean;
}

interface SkillFile {
  path: string;
  content: string;
}

interface SkillSummary {
  name: string;
  files: string[];
  entrypoint: string;
}

const SKILL_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * @name parseInput
 * @description Narrows unknown MCP tool input into skill tool input.
 */
function parseInput(input: unknown): SkillToolInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  const record = input as Record<string, unknown>;
  const agent = record.agent;
  return {
    agent: agent === 'claude' || agent === 'codex' || agent === 'hermes' || agent === 'openclaw' || agent === 'custom'
      ? agent
      : undefined,
    targetDir: typeof record.targetDir === 'string' ? record.targetDir : undefined,
    skills: Array.isArray(record.skills)
      ? record.skills.filter((item): item is string => typeof item === 'string')
      : undefined,
    confirm: typeof record.confirm === 'boolean' ? record.confirm : undefined,
    includeContents: typeof record.includeContents === 'boolean' ? record.includeContents : undefined,
  };
}

/**
 * @name getSkillsRoot
 * @description Resolves the bundled skills directory in source and built package layouts.
 */
function getSkillsRoot(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return resolve(currentDir, '../../skills');
}

/**
 * @name getDefaultTargetDir
 * @description Returns the default skill directory for a supported local agent.
 */
function getDefaultTargetDir(agent: AgentTarget | undefined): string | undefined {
  switch (agent) {
    case 'claude':
      return join(homedir(), '.claude', 'skills');
    case 'codex':
      return join(homedir(), '.codex', 'skills');
    case 'hermes':
      return join(homedir(), '.hermes', 'skills');
    case 'openclaw':
      return join(homedir(), '.openclaw', 'skills');
    case 'custom':
    case undefined:
      return undefined;
  }
}

/**
 * @name assertSafeSkillName
 * @description Prevents path traversal through selected skill names.
 */
function assertSafeSkillName(skillName: string): void {
  if (!SKILL_NAME_PATTERN.test(skillName)) {
    throw new Error(`Invalid skill name: ${skillName}`);
  }
}

/**
 * @name listBundledSkillNames
 * @description Lists bundled skill directories.
 */
function listBundledSkillNames(): string[] {
  const skillsRoot = getSkillsRoot();
  if (!existsSync(skillsRoot)) {
    return [];
  }

  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry: Dirent) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(skillsRoot, name, 'SKILL.md')))
    .sort();
}

/**
 * @name listFilesRecursive
 * @description Lists all regular files below a directory.
 */
function listFilesRecursive(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * @name resolveSelectedSkills
 * @description Resolves requested skills or returns every bundled skill.
 */
function resolveSelectedSkills(selected: string[] | undefined): string[] {
  const available = new Set(listBundledSkillNames());
  const names = selected && selected.length > 0 ? selected : Array.from(available);
  for (const name of names) {
    assertSafeSkillName(name);
    if (!available.has(name)) {
      throw new Error(`Bundled skill not found: ${name}`);
    }
  }
  return names.sort();
}

/**
 * @name getSkillSummaries
 * @description Builds summaries for bundled skills.
 */
function getSkillSummaries(selected?: string[]): SkillSummary[] {
  const skillsRoot = getSkillsRoot();
  return resolveSelectedSkills(selected).map((name) => {
    const skillRoot = join(skillsRoot, name);
    return {
      name,
      entrypoint: join(name, 'SKILL.md'),
      files: listFilesRecursive(skillRoot)
        .map((file) => relative(skillsRoot, file))
        .sort(),
    };
  });
}

/**
 * @name getSkillFiles
 * @description Reads bundled skill files with paths relative to the skills root.
 */
function getSkillFiles(selected?: string[]): SkillFile[] {
  const skillsRoot = getSkillsRoot();
  return resolveSelectedSkills(selected).flatMap((name) => {
    const skillRoot = join(skillsRoot, name);
    return listFilesRecursive(skillRoot).map((file) => ({
      path: relative(skillsRoot, file),
      content: readFileSync(file, 'utf-8'),
    }));
  }).sort((left, right) => left.path.localeCompare(right.path));
}

/**
 * @name resolveTargetDir
 * @description Resolves the target skill directory from explicit input or a supported agent default.
 */
function resolveTargetDir(input: SkillToolInput): string {
  const targetDir = input.targetDir || getDefaultTargetDir(input.agent);
  if (!targetDir) {
    throw new Error('targetDir is required when agent is custom or omitted.');
  }
  return resolve(targetDir);
}

/**
 * @name installSkillFiles
 * @description Copies bundled skill files into the target skills directory.
 */
function installSkillFiles(files: SkillFile[], targetDir: string): string[] {
  const skillsRoot = getSkillsRoot();
  const copied: string[] = [];

  for (const file of files) {
    const source = join(skillsRoot, file.path);
    const destination = join(targetDir, file.path);
    if (!statSync(source).isFile()) {
      continue;
    }
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    copyFileSync(source, destination);
    copied.push(destination);
  }

  return copied;
}

/**
 * @name registerSkillsTools
 * @description Registers skill pack discovery, export, and install tools.
 */
export function registerSkillsTools(server: Server, context: SapMcpContext): void {
  registerTool(
    server,
    'sap_skills_list',
    {
      title: 'List SAP MCP Skills',
      description: 'List bundled SAP MCP skills and their files.',
      inputSchema: {
        skills: { type: 'array', items: { type: 'string' } },
      },
    },
    async (input: unknown) => {
      try {
        const parsed = parseInput(input);
        return createTextResponse(JSON.stringify({
          skillsRoot: getSkillsRoot(),
          skills: getSkillSummaries(parsed.skills),
          upstream: {
            repository: 'https://github.com/OOBE-PROTOCOL/synapse-sap-sdk',
            ref: 'v1.0.2',
            sourcePath: 'skills',
          },
        }, null, 2));
      } catch (error) {
        return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
      }
    }
  );

  registerTool(
    server,
    'sap_skills_bundle',
    {
      title: 'Bundle SAP MCP Skills',
      description: 'Return bundled SAP MCP skills as JSON so an agent can load or write them itself.',
      inputSchema: {
        skills: { type: 'array', items: { type: 'string' } },
        includeContents: { type: 'boolean' },
      },
    },
    async (input: unknown) => {
      try {
        const parsed = parseInput(input);
        const files = getSkillFiles(parsed.skills);
        return createTextResponse(JSON.stringify({
          version: '1.0.0',
          generatedBy: 'sap-mcp-server',
          skills: getSkillSummaries(parsed.skills),
          files: parsed.includeContents === false
            ? files.map((file) => ({ path: file.path }))
            : files,
        }, null, 2));
      } catch (error) {
        return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
      }
    }
  );

  registerTool(
    server,
    'sap_skills_install',
    {
      title: 'Install SAP MCP Skills',
      description: 'Install bundled SAP MCP skills into a local agent skill directory. Requires confirm: true.',
      inputSchema: {
        agent: { type: 'string', enum: ['claude', 'codex', 'hermes', 'openclaw', 'custom'] },
        targetDir: { type: 'string' },
        skills: { type: 'array', items: { type: 'string' } },
        confirm: { type: 'boolean' },
      },
    },
    async (input: unknown) => {
      try {
        if (context.config.mode === 'hosted-api') {
          return createTextResponse(JSON.stringify({
            success: false,
            dryRun: true,
            hosted: true,
            message: 'Hosted SAP MCP cannot install files on the caller machine. Use sap_skills_bundle to download the skill files, or run the local SAP MCP wizard/addon installer on the user machine.',
            nextAction: 'Call sap_skills_bundle with includeContents: true, or run sap-mcp-config wizard locally and choose the skills/addon install step.',
          }, null, 2), { isError: true });
        }

        const parsed = parseInput(input);
        const targetDir = resolveTargetDir(parsed);
        const files = getSkillFiles(parsed.skills);
        const plan = {
          targetDir,
          skills: getSkillSummaries(parsed.skills),
          fileCount: files.length,
        };

        if (!parsed.confirm) {
          return createTextResponse(JSON.stringify({
            success: false,
            dryRun: true,
            requiresConfirmation: true,
            message: 'Call again with confirm: true to install these skill files.',
            plan,
          }, null, 2));
        }

        mkdirSync(targetDir, { recursive: true, mode: 0o700 });
        const copied = installSkillFiles(files, targetDir);
        return createTextResponse(JSON.stringify({
          success: true,
          dryRun: false,
          targetDir,
          copied,
          message: `Installed ${copied.length} SAP MCP skill files.`,
        }, null, 2));
      } catch (error) {
        return createTextResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { isError: true });
      }
    }
  );
}
