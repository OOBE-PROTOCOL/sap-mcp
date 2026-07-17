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
import { createStructuredJsonResponse, createTextResponse } from '../adapters/mcp/tool-response.js';
import { MCP_SERVER_VERSION } from '../core/constants.js';
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
const HOSTED_MCP_URL = 'https://mcp.sap.oobeprotocol.ai/mcp';
const SAP_MCP_PACKAGE = `@oobe-protocol-labs/sap-mcp-server@${MCP_SERVER_VERSION}`;
const SAP_MCP_WIZARD_COMMAND = `npm exec --yes --package ${SAP_MCP_PACKAGE} -- sap-mcp-config wizard`;
const SAP_MCP_REPAIR_COMMAND = `npm exec --yes --package ${SAP_MCP_PACKAGE} -- sap-mcp-config repair`;

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
 * @name getAgentTargetDirs
 * @description Returns the canonical local skill directories for supported runtimes.
 */
function getAgentTargetDirs(): Record<Exclude<AgentTarget, 'custom'>, string> {
  return {
    claude: join(homedir(), '.claude', 'skills'),
    codex: join(homedir(), '.codex', 'skills'),
    hermes: join(homedir(), '.hermes', 'skills'),
    openclaw: join(homedir(), '.openclaw', 'skills'),
  };
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
 * @name buildSkillsUpgradePlan
 * @description Builds a local-first plan for refreshing bundled SAP MCP skills.
 */
function buildSkillsUpgradePlan(input: SkillToolInput, context: SapMcpContext): Record<string, unknown> {
  const selectedSkills = getSkillSummaries(input.skills);
  const selectedFiles = getSkillFiles(input.skills);
  const targetDir = input.targetDir || getDefaultTargetDir(input.agent);
  const targetDirs = getAgentTargetDirs();

  return {
    success: true,
    action: 'skills-upgrade-plan',
    latestVersion: MCP_SERVER_VERSION,
    package: SAP_MCP_PACKAGE,
    hostedEndpoint: HOSTED_MCP_URL,
    serverMode: context.config.mode,
    hosted: context.config.mode === 'hosted-api',
    canWriteLocalFiles: context.config.mode !== 'hosted-api',
    selectedSkills,
    fileCount: selectedFiles.length,
    targetDir: targetDir ?? null,
    targetDirs,
    commands: {
      wizard: SAP_MCP_WIZARD_COMMAND,
      repair: SAP_MCP_REPAIR_COMMAND,
      installCodexSkills: `npm exec --yes --package ${SAP_MCP_PACKAGE} -- sap-mcp-config wizard`,
      installSpecificRuntime: targetDir
        ? `Call sap_skills_install with {"targetDir":"${targetDir.replaceAll('\\', '\\\\')}","confirm":true}`
        : 'Call sap_skills_install with agent or targetDir and confirm:true from a local SAP MCP process.',
    },
    agentInstructions: [
      'First call sap_agent_start.',
      'Then call sap_skills_bundle with includeContents:true and load the returned SKILL.md files into context.',
      'If running locally and the user wants files written, call sap_skills_install with confirm:true.',
      'If running hosted, do not claim files were installed. Show the pinned wizard/repair command and ask the user to run it locally.',
      'After installation or repair, ask the user to restart the agent runtime so the skills and sap_payments bridge are visible.',
    ],
    nextToolCalls: [
      {
        tool: 'sap_skills_bundle',
        arguments: { skills: input.skills ?? undefined, includeContents: true },
        reason: 'Load the latest bundled skills into current agent context immediately.',
      },
      {
        tool: 'sap_runtime_repair_plan',
        arguments: { agent: input.agent ?? undefined },
        reason: 'Return exact runtime repair commands when local sap_payments is missing or stale.',
      },
    ],
  };
}

/**
 * @name buildRuntimeRepairPlan
 * @description Builds exact commands for repairing hosted MCP and sap_payments runtime config.
 */
function buildRuntimeRepairPlan(input: SkillToolInput, context: SapMcpContext): Record<string, unknown> {
  const targetRuntime = input.agent ?? 'custom';
  return {
    success: true,
    action: 'runtime-repair-plan',
    latestVersion: MCP_SERVER_VERSION,
    package: SAP_MCP_PACKAGE,
    hostedEndpoint: HOSTED_MCP_URL,
    serverMode: context.config.mode,
    targetRuntime,
    repairCommand: SAP_MCP_REPAIR_COMMAND,
    wizardCommand: SAP_MCP_WIZARD_COMMAND,
    commands: {
      allPlatforms: SAP_MCP_REPAIR_COMMAND,
      macosLinux: SAP_MCP_REPAIR_COMMAND,
      windowsPowerShell: SAP_MCP_REPAIR_COMMAND,
      windowsCmd: SAP_MCP_REPAIR_COMMAND,
      fullWizard: SAP_MCP_WIZARD_COMMAND,
    },
    whatRepairDoes: [
      'Preserves existing third-party MCP servers.',
      'Adds or repairs the hosted sap MCP entry for https://mcp.sap.oobeprotocol.ai/mcp.',
      'Adds or repairs the local sap_payments bridge entry using npx/npm exec and the pinned SAP MCP package version.',
      'Updates only SAP_ALLOWED_TOOLS for OOBE SAP payment bridge tools.',
      'Writes backups before changing runtime config files.',
    ],
    expectedAfterRestart: {
      hostedNamespace: 'sap',
      localBridgeNamespace: 'sap_payments',
      requiredBridgeTools: [
        'sap_payments_profile_current',
        'sap_payments_readiness',
        'sap_payments_call_paid_tool',
        'sap_payments_finalize_transaction',
        'sap_payments_verify_receipt',
      ],
    },
    agentInstructions: [
      'If sap_payments tools are missing, do not ask the user to manually edit TOML/JSON/YAML first.',
      'Show repairCommand, tell the user to run it locally, then restart the agent runtime.',
      'After restart, call sap_payments_readiness before paid/write operations.',
      'If repair succeeds but tools remain missing, inspect the runtime MCP startup logs instead of retrying paid hosted calls directly.',
    ],
  };
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

  registerTool(
    server,
    'sap_skills_upgrade_plan',
    {
      title: 'Plan SAP MCP Skills Upgrade',
      description: 'Free helper that returns exact latest-release commands and target directories for upgrading SAP MCP skills. Hosted mode returns a local action plan; local mode can then use sap_skills_install to write files.',
      inputSchema: {
        agent: { type: 'string', enum: ['claude', 'codex', 'hermes', 'openclaw', 'custom'], description: 'Optional target runtime whose default skill directory should be used.' },
        targetDir: { type: 'string', description: 'Optional explicit local skill directory.' },
        skills: { type: 'array', description: 'Optional subset of bundled skill names to upgrade.', items: { type: 'string' } },
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', description: 'Whether the upgrade plan was generated.' },
          action: { type: 'string', description: 'Plan type.' },
          latestVersion: { type: 'string', description: 'Pinned SAP MCP package version for the upgrade.' },
          package: { type: 'string', description: 'Pinned npm package spec.' },
          hostedEndpoint: { type: 'string', description: 'Hosted SAP MCP endpoint.' },
          serverMode: { type: 'string', description: 'Current server mode.' },
          canWriteLocalFiles: { type: 'boolean', description: 'Whether this MCP process can write skill files locally.' },
          selectedSkills: { type: 'array', description: 'Bundled skills included in the plan.', items: { type: 'object' } },
          fileCount: { type: 'number', description: 'Number of bundled skill files selected.' },
          targetDir: { type: ['string', 'null'], description: 'Resolved target directory when known.' },
          targetDirs: { type: 'object', description: 'Default local skill directories by runtime.' },
          commands: { type: 'object', description: 'Pinned commands to run locally.' },
          agentInstructions: { type: 'array', description: 'Instructions agents should follow without guessing.', items: { type: 'string' } },
          nextToolCalls: { type: 'array', description: 'Suggested next MCP tool calls.', items: { type: 'object' } },
        },
        required: ['success', 'action', 'latestVersion', 'package', 'hostedEndpoint', 'serverMode', 'canWriteLocalFiles', 'selectedSkills', 'fileCount', 'targetDir', 'targetDirs', 'commands', 'agentInstructions', 'nextToolCalls'],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input: unknown) => {
      try {
        return createStructuredJsonResponse(buildSkillsUpgradePlan(parseInput(input), context));
      } catch (error) {
        return createStructuredJsonResponse(
          {
            success: false,
            action: 'skills-upgrade-plan',
            latestVersion: MCP_SERVER_VERSION,
            package: SAP_MCP_PACKAGE,
            hostedEndpoint: HOSTED_MCP_URL,
            serverMode: context.config.mode,
            canWriteLocalFiles: context.config.mode !== 'hosted-api',
            selectedSkills: [],
            fileCount: 0,
            targetDir: null,
            targetDirs: getAgentTargetDirs(),
            commands: {
              wizard: SAP_MCP_WIZARD_COMMAND,
              repair: SAP_MCP_REPAIR_COMMAND,
            },
            agentInstructions: ['Show this structured error and call sap_runtime_repair_plan before asking the user to edit config by hand.'],
            nextToolCalls: [{ tool: 'sap_runtime_repair_plan', arguments: {}, reason: 'Recover from skill upgrade planning failure.' }],
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          { isError: true },
        );
      }
    }
  );

  registerTool(
    server,
    'sap_runtime_repair_plan',
    {
      title: 'Plan SAP Runtime Repair',
      description: 'Free helper that returns the pinned latest-release repair command for hosted SAP MCP plus local sap_payments bridge setup. Use this before asking users to manually edit runtime config.',
      inputSchema: {
        agent: { type: 'string', enum: ['claude', 'codex', 'hermes', 'openclaw', 'custom'], description: 'Optional runtime to focus repair instructions on.' },
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', description: 'Whether the repair plan was generated.' },
          action: { type: 'string', description: 'Plan type.' },
          latestVersion: { type: 'string', description: 'Pinned SAP MCP package version for repair.' },
          package: { type: 'string', description: 'Pinned npm package spec.' },
          hostedEndpoint: { type: 'string', description: 'Hosted SAP MCP endpoint.' },
          serverMode: { type: 'string', description: 'Current server mode.' },
          targetRuntime: { type: 'string', description: 'Runtime selected for repair guidance.' },
          repairCommand: { type: 'string', description: 'Primary local command to repair hosted MCP and sap_payments bridge config.' },
          wizardCommand: { type: 'string', description: 'Full local wizard command for profile creation or full setup.' },
          commands: { type: 'object', description: 'OS-specific repair command aliases.' },
          whatRepairDoes: { type: 'array', description: 'Concrete operations performed by repair.', items: { type: 'string' } },
          expectedAfterRestart: { type: 'object', description: 'Tool namespaces and bridge tools expected after restarting the runtime.' },
          agentInstructions: { type: 'array', description: 'Instructions agents should follow without guessing.', items: { type: 'string' } },
        },
        required: ['success', 'action', 'latestVersion', 'package', 'hostedEndpoint', 'serverMode', 'targetRuntime', 'repairCommand', 'wizardCommand', 'commands', 'whatRepairDoes', 'expectedAfterRestart', 'agentInstructions'],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input: unknown) => {
      try {
        return createStructuredJsonResponse(buildRuntimeRepairPlan(parseInput(input), context));
      } catch (error) {
        return createStructuredJsonResponse(
          {
            success: false,
            action: 'runtime-repair-plan',
            latestVersion: MCP_SERVER_VERSION,
            package: SAP_MCP_PACKAGE,
            hostedEndpoint: HOSTED_MCP_URL,
            serverMode: context.config.mode,
            targetRuntime: 'custom',
            repairCommand: SAP_MCP_REPAIR_COMMAND,
            wizardCommand: SAP_MCP_WIZARD_COMMAND,
            commands: {
              allPlatforms: SAP_MCP_REPAIR_COMMAND,
              macosLinux: SAP_MCP_REPAIR_COMMAND,
              windowsPowerShell: SAP_MCP_REPAIR_COMMAND,
              windowsCmd: SAP_MCP_REPAIR_COMMAND,
              fullWizard: SAP_MCP_WIZARD_COMMAND,
            },
            whatRepairDoes: [
              'Preserves existing third-party MCP servers.',
              'Repairs only OOBE SAP hosted MCP and sap_payments entries.',
            ],
            expectedAfterRestart: {
              hostedNamespace: 'sap',
              localBridgeNamespace: 'sap_payments',
              requiredBridgeTools: ['sap_payments_profile_current', 'sap_payments_readiness', 'sap_payments_call_paid_tool'],
            },
            agentInstructions: ['Show this structured error, run the pinned repair command locally, then restart the agent runtime.'],
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          { isError: true },
        );
      }
    }
  );
}
