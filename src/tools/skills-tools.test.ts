/**
 * @file src/tools/skills-tools.test.ts
 * @description Unit tests for skill version comparison and input parsing.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { compareVersions, installSkillFiles, parseInput } from './skills-tools.js';

describe('compareVersions', () => {
  it('detects a newer upstream version', () => {
    expect(compareVersions('0.9.66', '0.9.65')).toBe(1);
  });

  it('detects an older upstream version', () => {
    expect(compareVersions('0.9.64', '0.9.65')).toBe(-1);
  });

  it('treats equal versions as no update', () => {
    expect(compareVersions('0.9.65', '0.9.65')).toBe(0);
  });

  it('handles minor/major bumps', () => {
    expect(compareVersions('1.0.0', '0.9.99')).toBe(1);
    expect(compareVersions('0.10.0', '0.9.65')).toBe(1);
  });
});

describe('parseInputForTest', () => {
  it('narrows unknown input into skill tool input with safe defaults', () => {
    expect(parseInput(undefined)).toEqual({});
    expect(parseInput({ agent: 'hermes', confirm: true })).toMatchObject({
      agent: 'hermes',
      confirm: true,
    });
  });

  it('rejects invalid agent values', () => {
    const parsed = parseInput({ agent: 'not-a-runtime' });
    expect(parsed.agent).toBeUndefined();
  });
});

describe('installSkillFiles', () => {
  it('writes the provided skill file contents into the target directory', () => {
    const targetDir = mkdtempSync(join(tmpdir(), 'sap-skill-install-'));
    try {
      const copied = installSkillFiles([
        { path: 'sap-mcp/SKILL.md', content: '# Updated SAP MCP skill\n' },
      ], targetDir);

      const installedPath = join(targetDir, 'sap-mcp', 'SKILL.md');
      expect(copied).toEqual([installedPath]);
      expect(readFileSync(installedPath, 'utf-8')).toBe('# Updated SAP MCP skill\n');
    } finally {
      rmSync(targetDir, { recursive: true, force: true });
    }
  });

  it('rejects skill file paths outside the target directory', () => {
    const targetDir = mkdtempSync(join(tmpdir(), 'sap-skill-install-'));
    try {
      expect(() => installSkillFiles([
        { path: '../escape/SKILL.md', content: '# Escape\n' },
      ], targetDir)).toThrow('Refusing to install skill file outside targetDir');
    } finally {
      rmSync(targetDir, { recursive: true, force: true });
    }
  });
});
