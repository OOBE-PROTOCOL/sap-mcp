/**
 * @file src/tools/skills-tools.test.ts
 * @description Unit tests for skill version comparison and input parsing.
 */

import { describe, it, expect } from 'vitest';
import { compareVersions, parseInput } from './skills-tools.js';

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
